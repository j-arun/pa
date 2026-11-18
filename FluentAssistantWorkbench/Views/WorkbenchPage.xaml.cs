using System.Text.RegularExpressions;
using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using Markdig;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace FluentAssistantWorkbench.Views;

public sealed partial class WorkbenchPage : Page
{
    private static readonly MarkdownPipeline HtmlExportPipeline =
        new MarkdownPipelineBuilder().UseAdvancedExtensions().DisableHtml().Build();
    private static readonly Regex HtmlLinkHrefPattern =
        new("href=\"(?<url>[^\"]*)\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex HtmlImageTagPattern =
        new("<img\\b(?<attributes>[^>]*)>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex HtmlAttributePattern =
        new("(?<name>[\\w-]+)=\"(?<value>[^\"]*)\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

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
            HideSidebarForSuccessfulPublicComparison();
        }
        finally
        {
            _isSending = false;
            var shouldScrollToBottom = _isNearBottom;
            DispatcherQueue.TryEnqueue(() => OnExchangesChanged(shouldScrollToBottom));
        }
    }

    private static void HideSidebarForSuccessfulPublicComparison()
    {
        var exchange = App.Coordinator.Exchanges.LastOrDefault();
        if (App.Coordinator.Config.EffectiveScope != ConversationScope.Public ||
            exchange is null ||
            !exchange.IsDualResponse ||
            exchange.PrivateResponse.IsError ||
            exchange.PublicResponse.IsError ||
            string.IsNullOrWhiteSpace(exchange.PrivateResponse.Content) ||
            string.IsNullOrWhiteSpace(exchange.PublicResponse.Content))
        {
            return;
        }

        MainWindow.CurrentWindow?.HideAgentSessionSidebarForDualResponse();
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

    private void ToggleThread_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { DataContext: ConversationExchange exchange })
        {
            exchange.ToggleThread();
        }
    }

    private void CopyExchange_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { DataContext: ConversationExchange exchange } ||
            !exchange.HasSuccessfulAnswer)
        {
            return;
        }

        var answers = new List<string>();
        if (exchange.IsDualResponse)
        {
            if (!exchange.PrivateResponse.IsError &&
                !string.IsNullOrWhiteSpace(exchange.PrivateResponse.Content))
            {
                answers.Add(exchange.PrivateResponse.Content);
            }
            if (!exchange.PublicResponse.IsError &&
                !string.IsNullOrWhiteSpace(exchange.PublicResponse.Content))
            {
                answers.Add(exchange.PublicResponse.Content);
            }
        }
        else if (!exchange.IsReplyError && !exchange.IsReplyCanceled)
        {
            answers.Add(exchange.ReplyContent);
        }

        var sections = new List<string>();
        if (!string.IsNullOrWhiteSpace(exchange.QuestionContent))
        {
            sections.Add($"Question:\n{exchange.QuestionContent}");
        }
        sections.AddRange(answers.Select((answer, index) =>
            $"{(answers.Count > 1 ? $"Answer {index + 1}" : "Answer")}:\n{answer}"));

        try
        {
            var dataPackage = new DataPackage();
            dataPackage.SetText(string.Join("\n\n", sections));
            Clipboard.SetContent(dataPackage);
            Clipboard.Flush();
            StatusInfoBar.Severity = InfoBarSeverity.Success;
            StatusInfoBar.Title = "Thread copied";
            StatusInfoBar.Message = "Copied this thread's question and answer content.";
            StatusInfoBar.IsOpen = true;
        }
        catch (Exception ex)
        {
            StatusInfoBar.Severity = InfoBarSeverity.Error;
            StatusInfoBar.Title = "Unable to copy conversation";
            StatusInfoBar.Message = ex.Message;
            StatusInfoBar.IsOpen = true;
        }
    }

    private async void DownloadExchangeHtml_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { DataContext: ConversationExchange exchange } ||
            !exchange.HasSuccessfulAnswer)
        {
            return;
        }

        try
        {
            var picker = new FileSavePicker
            {
                SuggestedStartLocation = PickerLocationId.DocumentsLibrary,
                SuggestedFileName = $"PersonalAssistant-Thread-{exchange.ThreadNumber}-{DateTime.Now:yyyyMMdd-HHmm}"
            };
            picker.FileTypeChoices.Add("HTML Document", [".html"]);

            if (MainWindow.CurrentWindow is not null)
            {
                var hwnd = WindowNative.GetWindowHandle(MainWindow.CurrentWindow);
                InitializeWithWindow.Initialize(picker, hwnd);
            }

            var file = await picker.PickSaveFileAsync();
            if (file is null) return;

            await File.WriteAllTextAsync(file.Path, BuildThreadHtml(exchange));
            StatusInfoBar.Severity = InfoBarSeverity.Success;
            StatusInfoBar.Title = "Thread downloaded";
            StatusInfoBar.Message = $"Thread #{exchange.ThreadNumber} saved as HTML to {file.Path}";
            StatusInfoBar.IsOpen = true;
        }
        catch (Exception ex)
        {
            StatusInfoBar.Severity = InfoBarSeverity.Error;
            StatusInfoBar.Title = "Thread download failed";
            StatusInfoBar.Message = ex.Message;
            StatusInfoBar.IsOpen = true;
        }
    }

    private static string BuildThreadHtml(ConversationExchange exchange)
    {
        var answers = new List<(string Label, string Content)>();
        if (exchange.IsDualResponse)
        {
            foreach (var response in new[] { exchange.PrivateResponse, exchange.PublicResponse })
            {
                if (!response.IsError && !string.IsNullOrWhiteSpace(response.Content))
                {
                    answers.Add((response.HeaderLabel, response.Content));
                }
            }
        }
        else if (!exchange.IsReplyError && !exchange.IsReplyCanceled &&
            !string.IsNullOrWhiteSpace(exchange.ReplyContent))
        {
            answers.Add((exchange.ReplyHeaderLabel, exchange.ReplyContent));
        }

        var answerSections = string.Join(
            Environment.NewLine,
            answers.Select(answer =>
            {
                var label = System.Net.WebUtility.HtmlEncode(answer.Label);
                return
                    $"<section class=\"answer\"><h2>{label}</h2><div class=\"markdown\">{RenderMarkdownHtml(answer.Content)}</div></section>";
            }));
        var questionSection = string.IsNullOrWhiteSpace(exchange.QuestionContent)
            ? string.Empty
            : $"<section><h2>Question</h2><div class=\"markdown\">{RenderMarkdownHtml(exchange.QuestionContent)}</div></section>";
        var answerLayoutClass = answers.Count == 2 ? "answer-grid" : "answer-list";
        return $$"""
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Thread #{{exchange.ThreadNumber}}</title>
              <style>
                body { font: 16px/1.6 system-ui, sans-serif; margin: 2rem auto; padding: 0 1.25rem; color: #172033; }
                main { max-width: 1440px; margin: 0 auto; }
                section { min-width: 0; margin: 1.5rem 0; }
                .answer-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; align-items: start; }
                .answer-grid section { margin: 0; }
                .markdown { overflow-wrap: anywhere; }
                .markdown pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow-x: auto; padding: .8rem; border-radius: .5rem; background: #f1f5f9; }
                .markdown code { font-family: ui-monospace, Consolas, monospace; }
                .markdown table { border-collapse: collapse; display: block; overflow-x: auto; }
                .markdown th, .markdown td { border: 1px solid #cbd5e1; padding: .4rem .65rem; }
                .markdown blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #0ea5e9; color: #475569; }
                @media (max-width: 760px) { .answer-grid { grid-template-columns: 1fr; } }
              </style>
            </head>
            <body>
              <main>
                <h1>Thread #{{exchange.ThreadNumber}}</h1>
                {{questionSection}}
                <div class="{{answerLayoutClass}}">{{answerSections}}</div>
              </main>
            </body>
            </html>
            """;
    }

    private static string RenderMarkdownHtml(string markdown)
    {
        var html = Markdig.Markdown.ToHtml(markdown, HtmlExportPipeline);
        html = HtmlImageTagPattern.Replace(html, RenderMarkdownImage);
        return HtmlLinkHrefPattern.Replace(html, match =>
        {
            var url = System.Net.WebUtility.HtmlDecode(match.Groups["url"].Value);
            return Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
                uri.Scheme is "http" or "https" or "mailto"
                    ? match.Value
                    : string.Empty;
        });
    }

    private static string RenderMarkdownImage(Match imageTag)
    {
        var attributes = HtmlAttributePattern.Matches(imageTag.Groups["attributes"].Value);
        var source = GetHtmlAttribute(attributes, "src");
        var decodedSource = System.Net.WebUtility.HtmlDecode(source);
        var altText = System.Net.WebUtility.HtmlDecode(GetHtmlAttribute(attributes, "alt"));
        if (Uri.TryCreate(
                decodedSource,
                UriKind.Absolute,
                out var uri) &&
            uri.Scheme is "http" or "https")
        {
            var linkText = string.IsNullOrWhiteSpace(altText) ? decodedSource : altText;
            return $"<a href=\"{System.Net.WebUtility.HtmlEncode(decodedSource)}\">{System.Net.WebUtility.HtmlEncode(linkText)}</a>";
        }

        return System.Net.WebUtility.HtmlEncode(altText);
    }

    private static string GetHtmlAttribute(MatchCollection attributes, string name) =>
        attributes.Cast<Match>()
            .FirstOrDefault(match =>
                string.Equals(match.Groups["name"].Value, name, StringComparison.OrdinalIgnoreCase))
            ?.Groups["value"].Value ?? string.Empty;

    private void CopyMetadata_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { DataContext: ConversationExchange exchange }) return;

        var sections = new List<string>
        {
            $"Thread {exchange.ThreadNumber} metadata",
            $"Domain: {exchange.PromptDomain?.ToString() ?? "Unknown"}",
            $"Style: {exchange.PromptStyle?.ToString() ?? "Unknown"}"
        };
        if (exchange.IsDualResponse)
        {
            sections.Add($"Private system instruction:\n{exchange.PrivateSystemInstruction}");
            sections.Add($"Private context cache:\n{FormatCachedContext(exchange.PrivateCachedContext)}");
            sections.Add($"Public system instruction:\n{exchange.PublicSystemInstruction}");
            sections.Add($"Public context cache:\n{FormatCachedContext(exchange.PublicCachedContext)}");
        }
        else
        {
            sections.Add($"System instruction:\n{exchange.SystemInstruction}");
            sections.Add($"Context cache:\n{FormatCachedContext(exchange.CachedContext)}");
        }
        sections.Add($"Question / composed prompt:\n{exchange.QuestionContent}");

        try
        {
            var dataPackage = new DataPackage();
            dataPackage.SetText(string.Join("\n\n", sections));
            Clipboard.SetContent(dataPackage);
            Clipboard.Flush();
            StatusInfoBar.Severity = InfoBarSeverity.Success;
            StatusInfoBar.Title = "Thread metadata copied";
            StatusInfoBar.Message = "Copied the prompt, system instruction, context cache, and question.";
            StatusInfoBar.IsOpen = true;
        }
        catch (Exception ex)
        {
            StatusInfoBar.Severity = InfoBarSeverity.Error;
            StatusInfoBar.Title = "Unable to copy thread metadata";
            StatusInfoBar.Message = ex.Message;
            StatusInfoBar.IsOpen = true;
        }
    }

    private static string FormatCachedContext(string context) =>
        string.IsNullOrWhiteSpace(context) ? "(No context cache configured)" : context;

    private async void ShowSourcePrompt_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { DataContext: ConversationExchange exchange }) return;

        var sourceTextBox = new TextBox
        {
            Text = exchange.QuestionContent,
            IsReadOnly = true,
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            MinWidth = 480,
            MaxWidth = 760,
            MinHeight = 180,
            MaxHeight = 420
        };
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Thread {exchange.ThreadNumber} · Source Prompt",
            Content = sourceTextBox,
            CloseButtonText = "Close",
            DefaultButton = ContentDialogButton.Close
        };
        await dialog.ShowAsync();
    }

    private async void DeleteExchange_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { DataContext: ConversationExchange exchange }) return;
        if (exchange.IsWaitingReply) return;

        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = "Delete this conversation?",
            Content = "Only this thread will be removed from the current session.",
            PrimaryButtonText = "Delete",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;

        if (!App.Coordinator.DeleteExchange(exchange.Id))
        {
            StatusInfoBar.Severity = InfoBarSeverity.Error;
            StatusInfoBar.Title = "Thread not deleted";
            StatusInfoBar.Message = "The thread could not be found or is still receiving a response.";
            StatusInfoBar.IsOpen = true;
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
