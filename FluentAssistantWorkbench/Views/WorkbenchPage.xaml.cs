using FluentAssistantWorkbench.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.System;

namespace FluentAssistantWorkbench.Views;

public sealed partial class WorkbenchPage : Page
{
    private bool _isListening;
    private bool _isSending;

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
        if (App.Coordinator.IsMuted)
        {
            PromptTextBox.PlaceholderText = "Microphone is muted in the top bar.";
            return;
        }

        if (_isListening) return;

        _isListening = true;
        MicButtonIcon.Glyph = "\uE71A";
        PromptTextBox.PlaceholderText = "Listening via Windows microphone...";

        try
        {
            var spokenText = await App.Coordinator.Speech.ListenOnceAsync();
            if (!string.IsNullOrWhiteSpace(spokenText))
            {
                await DispatchPromptAsync(spokenText, "Voice");
            }
        }
        catch (Exception ex)
        {
            PromptTextBox.PlaceholderText = $"Microphone error: {ex.Message}";
        }
        finally
        {
            _isListening = false;
            MicButtonIcon.Glyph = "\uE720";
            if (PromptTextBox.PlaceholderText.StartsWith("Listening", StringComparison.Ordinal))
            {
                PromptTextBox.PlaceholderText = "Type or speak your prompt...";
            }
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
