using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.System;

namespace FluentAssistantWorkbench.Views;

public sealed partial class WorkbenchPage : Page
{
    private bool _isListening;
    private bool _isSending;
    private CancellationTokenSource? _listenCts;
    private string _pendingSettingsUri = "ms-settings:privacy-speech";

    public WorkbenchPage()
    {
        InitializeComponent();
        ConversationItemsControl.ItemsSource = App.Coordinator.Turns;
        App.Coordinator.Turns.CollectionChanged += (_, _) => DispatcherQueue.TryEnqueue(OnTurnsChanged);
        OnTurnsChanged();
    }

    private void OnTurnsChanged()
    {
        EmptyCloudCard.Visibility = App.Coordinator.Turns.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
        LadderScrollViewer.UpdateLayout();
        LadderScrollViewer.ChangeView(null, LadderScrollViewer.ScrollableHeight, null);
    }

    private async Task DispatchPromptAsync(string text, string inputMode)
    {
        if (string.IsNullOrWhiteSpace(text) || _isSending) return;
        _isSending = true;
        SendButton.IsEnabled = false;
        SendSpinner.Visibility = Visibility.Visible;
        SendSpinner.IsActive = true;
        SendIcon.Visibility = Visibility.Collapsed;
        SendLabel.Text = "Working...";

        var cfg = App.Coordinator.Config;
        ProcessingStatusText.Text = cfg.ActiveScope == ConversationScope.Private
            ? $"Processing in Private Windows Ollama ({(string.IsNullOrWhiteSpace(cfg.PrivateLlm.SelectedModel) ? "no model selected" : cfg.PrivateLlm.SelectedModel)})..."
            : $"Processing via Public Adapter ({cfg.PublicLlm.ActiveAdapter})...";

        ProcessingCloudCard.Visibility = Visibility.Visible;
        ProcessingRing.IsActive = true;
        LadderScrollViewer.UpdateLayout();
        LadderScrollViewer.ChangeView(null, LadderScrollViewer.ScrollableHeight, null);

        try
        {
            await App.Coordinator.SendMessageAsync(text, inputMode);
        }
        finally
        {
            _isSending = false;
            ProcessingRing.IsActive = false;
            ProcessingCloudCard.Visibility = Visibility.Collapsed;
            SendSpinner.IsActive = false;
            SendSpinner.Visibility = Visibility.Collapsed;
            SendIcon.Visibility = Visibility.Visible;
            SendLabel.Text = "Send";
            SendButton.IsEnabled = true;
        }
    }

    private async void SendButton_Click(object sender, RoutedEventArgs e)
    {
        var text = PromptTextBox.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;
        PromptTextBox.Text = string.Empty;
        await DispatchPromptAsync(text, "Typed");
    }

    private async void PromptTextBox_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            var text = PromptTextBox.Text.Trim();
            if (string.IsNullOrEmpty(text)) return;
            PromptTextBox.Text = string.Empty;
            await DispatchPromptAsync(text, "Typed");
        }
    }

    private async void MicButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isListening)
        {
            _listenCts?.Cancel();
            return;
        }

        if (App.Coordinator.IsMuted)
        {
            MicErrorInfoBar.Severity = InfoBarSeverity.Informational;
            MicErrorInfoBar.Title = "Microphone is muted";
            MicErrorInfoBar.Message = "Unmute the microphone in the top bar to use voice input.";
            MicFixActionButton.Visibility = Visibility.Collapsed;
            MicErrorInfoBar.IsOpen = true;
            return;
        }

        MicErrorInfoBar.IsOpen = false;
        _isListening = true;
        _listenCts?.Dispose();
        _listenCts = new CancellationTokenSource();
        MicButtonIcon.Glyph = "\uE71A";
        PromptTextBox.PlaceholderText = "Listening via Windows microphone...";

        try
        {
            var spokenText = await App.Coordinator.Speech.ListenOnceAsync(_listenCts.Token);
            if (!string.IsNullOrWhiteSpace(spokenText))
            {
                await DispatchPromptAsync(spokenText, "Voice");
            }
        }
        catch (OperationCanceledException)
        {
            // User cancelled microphone listening
        }
        catch (SpeechSetupException setupEx)
        {
            if (setupEx.Issue == SpeechSetupIssue.SpeechPrivacyPolicy)
            {
                _pendingSettingsUri = "ms-settings:privacy-speech";
                MicErrorInfoBar.Severity = InfoBarSeverity.Warning;
                MicErrorInfoBar.Title = "Windows Speech Privacy needs to be enabled";
                MicErrorInfoBar.Message =
                    "Online Speech Recognition is turned off in Windows Settings and no offline speech pack was detected. Turn it on in Privacy & security > Speech, or press Win + H inside the text box for Windows Voice Typing.";
                MicFixActionButton.Content = "Open Speech Privacy";
                MicFixActionButton.Visibility = Visibility.Visible;
            }
            else
            {
                _pendingSettingsUri = "ms-settings:privacy-microphone";
                MicErrorInfoBar.Severity = InfoBarSeverity.Warning;
                MicErrorInfoBar.Title = "Microphone permission or device needed";
                MicErrorInfoBar.Message = setupEx.Message;
                MicFixActionButton.Content = "Open Mic Privacy";
                MicFixActionButton.Visibility = Visibility.Visible;
            }

            MicErrorInfoBar.IsOpen = true;
        }
        catch (Exception ex)
        {
            MicErrorInfoBar.Severity = InfoBarSeverity.Error;
            MicErrorInfoBar.Title = "Microphone error";
            MicErrorInfoBar.Message = ex.Message;
            MicFixActionButton.Visibility = Visibility.Collapsed;
            MicErrorInfoBar.IsOpen = true;
        }
        finally
        {
            _isListening = false;
            _listenCts?.Dispose();
            _listenCts = null;
            MicButtonIcon.Glyph = "\uE720";
            PromptTextBox.PlaceholderText = "Type or speak your prompt...";
        }
    }

    private async void MicFixActionButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            await Launcher.LaunchUriAsync(new Uri(_pendingSettingsUri));
        }
        catch
        {
            // Ignore launcher failures
        }
    }

    private async void SpeakTurnButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string text)
        {
            await App.Coordinator.Speech.SpeakAsync(
                text,
                App.Coordinator.Config.Voice.SelectedVoiceId);
        }
    }

    private void NewSession_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.ClearHistory();
    }
}
