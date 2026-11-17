using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace FluentAssistantWorkbench.Views;

public sealed partial class SettingsPage : Page
{
    private bool _isLoading;

    public SettingsPage()
    {
        InitializeComponent();
        LoadFromCoordinator();
    }

    public void ReloadFromCoordinator()
    {
        LoadFromCoordinator();
        SaveFeedbackText.Text = string.Empty;
    }

    public void ApplyAndSave()
    {
        ApplyUiToConfig();
        App.Coordinator.SaveConfig();
        SaveFeedbackText.Text = $"Saved to {App.Coordinator.ConfigStore.ConfigFilePath} at {DateTime.Now:t}";
    }

    private void LoadFromCoordinator()
    {
        _isLoading = true;
        try
        {
            var cfg = App.Coordinator.Config;
            var normalizedThemeTag = cfg.Theme switch
            {
                AppThemeMode.Light => nameof(AppThemeMode.ArcticSky),
                AppThemeMode.Dark => nameof(AppThemeMode.MidnightSlate),
                _ => cfg.Theme.ToString()
            };

            foreach (ComboBoxItem item in ThemeCombo.Items)
            {
                if (string.Equals(item.Tag?.ToString(), normalizedThemeTag, StringComparison.OrdinalIgnoreCase))
                {
                    ThemeCombo.SelectedItem = item;
                    break;
                }
            }
            foreach (ComboBoxItem item in FontCombo.Items)
            {
                if (string.Equals(item.Tag?.ToString(), cfg.FontFamily.ToString(), StringComparison.OrdinalIgnoreCase))
                {
                    FontCombo.SelectedItem = item;
                    break;
                }
            }
            DisplayNameBox.Text = cfg.UserProfile.DisplayName;

            OllamaUrlBox.Text = cfg.PrivateLlm.OllamaBaseUrl;
            OllamaModelBox.Text = cfg.PrivateLlm.SelectedModel;
            PrivateSystemBox.Text = cfg.PrivateLlm.SystemInstruction;
            SelectComboByTag(OllamaContextCombo, cfg.PrivateLlm.ContextWindow.ToString(), "8192");
            SelectComboByTag(OllamaKeepAliveCombo, cfg.PrivateLlm.KeepAlive, "10m");
            SelectComboByTag(OllamaHistoryCombo, cfg.PrivateLlm.MaxHistoryTurns.ToString(), "16");

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
            SoundOnReplyCheck.IsChecked = cfg.Notifications.SoundOnReply;
            DesktopNotifyOnReplyCheck.IsChecked = cfg.Notifications.DesktopNotificationOnReply;

            StoragePathText.Text = $"Local Config File: {App.Coordinator.ConfigStore.ConfigFilePath}";
        }
        finally
        {
            _isLoading = false;
        }
    }

    private void ApplyUiToConfig()
    {
        var cfg = App.Coordinator.Config;

        if (ThemeCombo.SelectedItem is ComboBoxItem themeItem &&
            Enum.TryParse<AppThemeMode>(themeItem.Tag?.ToString(), out var parsedTheme))
        {
            cfg.Theme = parsedTheme;
        }
        if (FontCombo.SelectedItem is ComboBoxItem fontItem &&
            Enum.TryParse<AppFontFamily>(fontItem.Tag?.ToString(), out var parsedFont))
        {
            cfg.FontFamily = parsedFont;
        }
        cfg.UserProfile.DisplayName = DisplayNameBox.Text.Trim();

        cfg.PrivateLlm.OllamaBaseUrl = OllamaUrlBox.Text.Trim();
        cfg.PrivateLlm.SelectedModel = OllamaModelBox.Text.Trim();
        cfg.PrivateLlm.SystemInstruction = PrivateSystemBox.Text;
        if (OllamaContextCombo.SelectedItem is ComboBoxItem ctxItem &&
            int.TryParse(ctxItem.Tag?.ToString(), out var parsedCtx))
        {
            cfg.PrivateLlm.ContextWindow = parsedCtx;
        }
        if (OllamaKeepAliveCombo.SelectedItem is ComboBoxItem keepItem &&
            keepItem.Tag is string keepVal)
        {
            cfg.PrivateLlm.KeepAlive = keepVal;
        }
        if (OllamaHistoryCombo.SelectedItem is ComboBoxItem histItem &&
            int.TryParse(histItem.Tag?.ToString(), out var parsedHist))
        {
            cfg.PrivateLlm.MaxHistoryTurns = parsedHist;
        }

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
        cfg.Notifications.SoundOnReply = SoundOnReplyCheck.IsChecked == true;
        cfg.Notifications.DesktopNotificationOnReply = DesktopNotifyOnReplyCheck.IsChecked == true;
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
            "Windows native speaker playback is ready for Personal Assistant.",
            App.Coordinator.Config.Voice.SelectedVoiceId);
    }

    private void TestReplyNotification_Click(object sender, RoutedEventArgs e)
    {
        ApplyUiToConfig();
        MainWindow.CurrentWindow?.TestDesktopNotification();
        SaveFeedbackText.Text = "Played reply chime and triggered Windows notification.";
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

    private void ClearCache_Click(object sender, RoutedEventArgs e)
    {
        var summary = App.Coordinator.ClearAppCache();
        SaveFeedbackText.Text = summary;
    }

    private async void UnloadOllamaMemory_Click(object sender, RoutedEventArgs e)
    {
        ApplyUiToConfig();
        SaveFeedbackText.Text = "Unloading Private Ollama model memory...";
        var summary = await App.Coordinator.RelievePrivateLlmAsync();
        SaveFeedbackText.Text = summary;
    }

    private async void ResetCacheAndLlm_Click(object sender, RoutedEventArgs e)
    {
        ApplyUiToConfig();
        SaveFeedbackText.Text = "Clearing app cache and relieving Private Ollama memory...";
        var cacheSummary = App.Coordinator.ClearAppCache();
        var llmSummary = await App.Coordinator.RelievePrivateLlmAsync();
        SaveFeedbackText.Text = $"{cacheSummary} {llmSummary}";
    }

    private static void SelectComboByTag(ComboBox combo, string? value, string fallbackTag)
    {
        var target = string.IsNullOrWhiteSpace(value) ? fallbackTag : value.Trim();
        foreach (ComboBoxItem item in combo.Items)
        {
            if (string.Equals(item.Tag?.ToString(), target, StringComparison.OrdinalIgnoreCase))
            {
                combo.SelectedItem = item;
                return;
            }
        }
        foreach (ComboBoxItem item in combo.Items)
        {
            if (string.Equals(item.Tag?.ToString(), fallbackTag, StringComparison.OrdinalIgnoreCase))
            {
                combo.SelectedItem = item;
                return;
            }
        }
    }

    private void ThemeCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isLoading) return;
        SaveFeedbackText.Text = "Click Apply or Save & Close to apply theme changes.";
    }

    private async void DetectWindowsProfile_Click(object sender, RoutedEventArgs e)
    {
        var (name, avatar) = await WindowsUserProfileService.DetectLoggedInUserAsync();
        if (!string.IsNullOrWhiteSpace(name))
        {
            App.Coordinator.Config.UserProfile.DisplayName = name;
            DisplayNameBox.Text = name;
        }
        if (!string.IsNullOrWhiteSpace(avatar))
        {
            App.Coordinator.Config.UserProfile.AvatarPath = avatar;
        }
        App.Coordinator.SaveConfig();
        SaveFeedbackText.Text = "Synced profile from Windows account.";
    }
}
