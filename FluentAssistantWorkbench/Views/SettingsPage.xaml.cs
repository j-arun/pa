using FluentAssistantWorkbench.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace FluentAssistantWorkbench.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsPage()
    {
        InitializeComponent();
        LoadFromCoordinator();
    }

    private void LoadFromCoordinator()
    {
        var cfg = App.Coordinator.Config;

        OllamaUrlBox.Text = cfg.PrivateLlm.OllamaBaseUrl;
        OllamaModelBox.Text = cfg.PrivateLlm.SelectedModel;
        PrivateSystemBox.Text = cfg.PrivateLlm.SystemInstruction;

        foreach (ComboBoxItem item in ActivePublicAdapterCombo.Items)
        {
            if (string.Equals(item.Tag?.ToString(), cfg.PublicLlm.ActiveAdapter, StringComparison.OrdinalIgnoreCase))
            {
                ActivePublicAdapterCombo.SelectedItem = item;
                break;
            }
        }

        GeminiModelBox.Text = cfg.PublicLlm.Gemini.Model;
        GeminiKeyBox.Password = cfg.PublicLlm.Gemini.ApiKey;
        GeminiSystemBox.Text = cfg.PublicLlm.Gemini.SystemInstruction;

        ClaudeModelBox.Text = cfg.PublicLlm.Claude.Model;
        ClaudeKeyBox.Password = cfg.PublicLlm.Claude.ApiKey;
        ClaudeEndpointBox.Text = cfg.PublicLlm.Claude.EndpointUrl;

        FableModelBox.Text = cfg.PublicLlm.Fable.Model;
        FableKeyBox.Password = cfg.PublicLlm.Fable.ApiKey;
        FableEndpointBox.Text = cfg.PublicLlm.Fable.EndpointUrl;

        var voices = App.Coordinator.Speech.InstalledVoices;
        VoicesCombo.ItemsSource = voices;
        var matchedVoice = voices.FirstOrDefault(v => v.Id == cfg.Voice.SelectedVoiceId);
        if (matchedVoice is not null)
        {
            VoicesCombo.SelectedItem = matchedVoice;
        }
        else if (voices.Count > 0)
        {
            VoicesCombo.SelectedIndex = 0;
        }

        AutoSpeakPublicCheck.IsChecked = cfg.Voice.AutoSpeakPublic;
        AutoSpeakPrivateCheck.IsChecked = cfg.Voice.AutoSpeakPrivate;

        StoragePathText.Text = $"Local Config File: {App.Coordinator.ConfigStore.ConfigFilePath}";
    }

    private void ApplyUiToConfig()
    {
        var cfg = App.Coordinator.Config;

        cfg.PrivateLlm.OllamaBaseUrl = OllamaUrlBox.Text.Trim();
        cfg.PrivateLlm.SelectedModel = OllamaModelBox.Text.Trim();
        cfg.PrivateLlm.SystemInstruction = PrivateSystemBox.Text;

        if (ActivePublicAdapterCombo.SelectedItem is ComboBoxItem selectedAdapter &&
            selectedAdapter.Tag is string tag)
        {
            cfg.PublicLlm.ActiveAdapter = tag;
        }

        cfg.PublicLlm.Gemini.Model = GeminiModelBox.Text.Trim();
        cfg.PublicLlm.Gemini.ApiKey = GeminiKeyBox.Password.Trim();
        cfg.PublicLlm.Gemini.SystemInstruction = GeminiSystemBox.Text;

        cfg.PublicLlm.Claude.Model = ClaudeModelBox.Text.Trim();
        cfg.PublicLlm.Claude.ApiKey = ClaudeKeyBox.Password.Trim();
        cfg.PublicLlm.Claude.EndpointUrl = ClaudeEndpointBox.Text.Trim();

        cfg.PublicLlm.Fable.Model = FableModelBox.Text.Trim();
        cfg.PublicLlm.Fable.ApiKey = FableKeyBox.Password.Trim();
        cfg.PublicLlm.Fable.EndpointUrl = FableEndpointBox.Text.Trim();

        if (VoicesCombo.SelectedItem is Windows.Media.SpeechSynthesis.VoiceInformation voice)
        {
            cfg.Voice.SelectedVoiceId = voice.Id;
        }

        cfg.Voice.AutoSpeakPublic = AutoSpeakPublicCheck.IsChecked == true;
        cfg.Voice.AutoSpeakPrivate = AutoSpeakPrivateCheck.IsChecked == true;
    }

    private async void DiscoverOllama_Click(object sender, RoutedEventArgs e)
    {
        OllamaStatusText.Text = "Connecting to Windows Ollama...";
        try
        {
            var models = await App.Coordinator.Adapters.Ollama.DiscoverModelsAsync(OllamaUrlBox.Text);
            OllamaModelsList.ItemsSource = models;
            OllamaStatusText.Text = $"Discovered {models.Count} local Ollama model(s).";

            if (models.Count > 0 && string.IsNullOrWhiteSpace(OllamaModelBox.Text))
            {
                OllamaModelBox.Text = models[0].Name;
                ApplyUiToConfig();
                App.Coordinator.SaveConfig();
            }
        }
        catch (Exception ex)
        {
            OllamaModelsList.ItemsSource = null;
            OllamaStatusText.Text = $"Unable to connect to Ollama: {ex.Message}";
        }
    }

    private void OllamaModelsList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (OllamaModelsList.SelectedItem is OllamaModelInfo model)
        {
            OllamaModelBox.Text = model.Name;
            ApplyUiToConfig();
            App.Coordinator.SaveConfig();
        }
    }

    private async void TestAdapter_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not string adapterId) return;
        ApplyUiToConfig();
        AdapterHealthText.Text = $"Testing {adapterId} adapter...";
        var adapter = App.Coordinator.Adapters.GetById(adapterId);
        var status = await adapter.CheckHealthAsync(App.Coordinator.Config);
        AdapterHealthText.Text = $"{status.AdapterId} ({status.LatencyMs} ms): {status.Summary}";
    }

    private async void TestSpeaker_Click(object sender, RoutedEventArgs e)
    {
        ApplyUiToConfig();
        await App.Coordinator.Speech.SpeakAsync(
            "Windows native speaker playback is ready for your personal assistant workbench.",
            App.Coordinator.Config.Voice.SelectedVoiceId);
    }

    private void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        ApplyUiToConfig();
        App.Coordinator.SaveConfig();
        SaveFeedbackText.Text = $"Saved to {App.Coordinator.ConfigStore.ConfigFilePath} at {DateTime.Now:t}";
    }

    private void ReloadSettings_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.ReloadConfig();
        LoadFromCoordinator();
        SaveFeedbackText.Text = "Reloaded workbench.config.json from disk.";
    }

    private void ClearHistory_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.ClearHistory();
        SaveFeedbackText.Text = "Cleared local conversation history.";
    }
}
