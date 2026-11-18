using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace FluentAssistantWorkbench.Views;

public sealed partial class WorkbenchPage : Page
{
    private bool _isSending;
    private bool _isNearBottom = true;

    public WorkbenchPage()
    {
        InitializeComponent();
        ConversationItemsControl.ItemsSource = App.Coordinator.Exchanges;
        App.Coordinator.Exchanges.CollectionChanged += (_, _) =>
            DispatcherQueue.TryEnqueue(() => OnExchangesChanged(scrollToBottom: true));
        LadderScrollViewer.ViewChanged += (_, _) =>
        {
            _isNearBottom =
                LadderScrollViewer.ScrollableHeight - LadderScrollViewer.VerticalOffset <= 48;
        };
        App.Coordinator.ConfigChanged += (_, _) => DispatcherQueue.TryEnqueue(() =>
        {
            ApplyFontFromConfig();
            ApplyModeDescription();
        });
        Loaded += (_, _) =>
        {
            AmbientMistStoryboard.Begin();
            ApplyFontFromConfig();
            ApplyModeDescription();
            App.Coordinator.Speech.PlaybackStateChanged -= Speech_PlaybackStateChanged;
            App.Coordinator.Speech.PlaybackStateChanged += Speech_PlaybackStateChanged;
            SyncSpeakerPlaybackState();
            DispatcherQueue.TryEnqueue(ScrollToBottom);
        };
        Unloaded += (_, _) =>
            App.Coordinator.Speech.PlaybackStateChanged -= Speech_PlaybackStateChanged;
        ApplyFontFromConfig();
        OnExchangesChanged(scrollToBottom: false);
    }

    private void ApplyFontFromConfig()
    {
        var fontName = WorkbenchThemeHelper.GetFontFamilyName(App.Coordinator.Config.FontFamily);
        var family = new Microsoft.UI.Xaml.Media.FontFamily(fontName);
        FontFamily = family;
    }

    private void ApplyModeDescription()
    {
        bool isPrivate = App.Coordinator.Config.EffectiveScope == ConversationScope.Private;
        EmptySubtitleText.Text = isPrivate
            ? "Private mode · Type a prompt for your local Ollama model."
            : $"Public mode · Compare local Ollama with {GetPublicAdapterLabel(App.Coordinator.Config)}. Both responses appear side by side.";
    }

    private static string GetPublicAdapterLabel(WorkbenchConfig config)
    {
        var adapterLabel = config.PublicLlm.ActiveAdapter switch
        {
            "claude" => "Claude",
            "fable" => "Fable",
            _ => "Gemini"
        };
        return $"{adapterLabel} via the cloud";
    }

    private void OnExchangesChanged(bool scrollToBottom)
    {
        EmptyCloudCard.Visibility = App.Coordinator.Exchanges.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
        LadderScrollViewer.UpdateLayout();
        if (scrollToBottom)
        {
            ScrollToBottom();
        }
    }

    private void ScrollToBottom()
    {
        LadderScrollViewer.UpdateLayout();
        LadderScrollViewer.ChangeView(null, LadderScrollViewer.ScrollableHeight, null, disableAnimation: true);
        _isNearBottom = true;
    }

    public async Task SendPromptAsync(
        string text,
        string inputMode,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text) || _isSending) return;
        _isSending = true;
        ScrollToBottom();

        try
        {
            await App.Coordinator.SendMessageAsync(text, inputMode, cancellationToken);
        }
        finally
        {
            _isSending = false;
            var shouldScrollToBottom = _isNearBottom;
            DispatcherQueue.TryEnqueue(() => OnExchangesChanged(shouldScrollToBottom));
        }
    }

    private void ToggleQuestion_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { DataContext: ConversationExchange exchange })
        {
            exchange.ToggleQuestion();
        }
    }

    private void ToggleReply_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { DataContext: ConversationExchange exchange })
        {
            exchange.ToggleReply();
        }
    }

    private void Speech_PlaybackStateChanged(object? sender, EventArgs e)
    {
        DispatcherQueue.TryEnqueue(SyncSpeakerPlaybackState);
    }

    private void SyncSpeakerPlaybackState()
    {
        var activeTurnId = App.Coordinator.Speech.IsSpeaking
            ? App.Coordinator.Speech.CurrentTurnId
            : null;
        foreach (var exchange in App.Coordinator.Exchanges)
        {
            exchange.SetReplySpeaking(activeTurnId == exchange.Id);
            exchange.PrivateResponse.SetSpeaking(activeTurnId == exchange.PrivateResponse.TurnId);
            exchange.PublicResponse.SetSpeaking(activeTurnId == exchange.PublicResponse.TurnId);
        }
    }

    private async void SpeakTurnButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button) return;
        var (turnId, content) = button.DataContext switch
        {
            ConversationExchange exchange => (exchange.Id, exchange.ReplyContent),
            ConversationResponse response when !string.IsNullOrWhiteSpace(response.TurnId) =>
                (response.TurnId, response.Content),
            _ => (string.Empty, string.Empty)
        };
        if (string.IsNullOrWhiteSpace(turnId) || string.IsNullOrWhiteSpace(content)) return;

        var speech = App.Coordinator.Speech;
        if (speech.IsSpeaking && speech.CurrentTurnId == turnId)
        {
            speech.StopSpeaking();
            return;
        }

        await speech.SpeakAsync(
            content,
            App.Coordinator.Config.Voice.SelectedVoiceId,
            turnId);
    }

    public async Task SaveConversationPdfAsync()
    {
        if (App.Coordinator.Exchanges.Count == 0)
        {
            StatusInfoBar.Severity = InfoBarSeverity.Informational;
            StatusInfoBar.Title = "Nothing to export";
            StatusInfoBar.Message = "Start a conversation first, then click Save PDF.";
            StatusInfoBar.IsOpen = true;
            return;
        }

        try
        {
            var picker = new FileSavePicker
            {
                SuggestedStartLocation = PickerLocationId.DocumentsLibrary,
                SuggestedFileName = $"PersonalAssistant-Conversation-{DateTime.Now:yyyyMMdd-HHmm}"
            };
            picker.FileTypeChoices.Add("PDF Document", [".pdf"]);

            if (MainWindow.CurrentWindow is not null)
            {
                var hwnd = WindowNative.GetWindowHandle(MainWindow.CurrentWindow);
                InitializeWithWindow.Initialize(picker, hwnd);
            }

            var file = await picker.PickSaveFileAsync();
            if (file is null) return;

            var pdfBytes = ConversationPdfExporter.ExportExchangesToPdf(App.Coordinator.Exchanges);
            await File.WriteAllBytesAsync(file.Path, pdfBytes);

            StatusInfoBar.Severity = InfoBarSeverity.Success;
            StatusInfoBar.Title = "Saved as PDF";
            StatusInfoBar.Message = $"Conversation exported to {file.Path}";
            StatusInfoBar.IsOpen = true;
        }
        catch (Exception ex)
        {
            StatusInfoBar.Severity = InfoBarSeverity.Error;
            StatusInfoBar.Title = "PDF export failed";
            StatusInfoBar.Message = ex.Message;
            StatusInfoBar.IsOpen = true;
        }
    }

}
