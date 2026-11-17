using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using FluentAssistantWorkbench.Views;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace FluentAssistantWorkbench;

public sealed partial class MainWindow : Window
{
    public static MainWindow? CurrentWindow { get; private set; }
    private string _activeTag = "workbench";

    public MainWindow()
    {
        InitializeComponent();
        CurrentWindow = this;
        SystemBackdrop = new MicaBackdrop();
        SetWindowIcon();

        App.Coordinator.ConfigChanged += (_, _) => DispatcherQueue.TryEnqueue(SyncMenuBarState);
        SyncMenuBarState();
        _ = App.Coordinator.InitializeProfileAsync();

        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(WorkbenchPage));
    }

    private void SetWindowIcon()
    {
        try
        {
            var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "PersonalAssistant.ico");
            if (File.Exists(iconPath))
            {
                AppWindow.SetIcon(iconPath);
            }
        }
        catch
        {
            // Ignore when host environment does not support AppWindow.SetIcon
        }
    }

    public void NavigateToSettings()
    {
        _activeTag = "settings";
        NavView.SelectedItem = NavView.MenuItems[1];
        ContentFrame.Navigate(typeof(SettingsPage));
        SyncToolbarSelection();
    }

    public void NavigateToWorkbench()
    {
        _activeTag = "workbench";
        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(WorkbenchPage));
        SyncToolbarSelection();
    }

    private void SyncToolbarSelection()
    {
        bool onSettings = _activeTag == "settings";
        SettingsToolbarButton.Background = onSettings
            ? (Brush)Application.Current.Resources["AccentFillColorDefaultBrush"]
            : (Brush)Application.Current.Resources["SubtleFillColorTransparentBrush"];
        SettingsToolbarButton.Foreground = onSettings
            ? new SolidColorBrush(Colors.White)
            : (Brush)Application.Current.Resources["TextFillColorPrimaryBrush"];
    }

    private void SyncMenuBarState()
    {
        var cfg = App.Coordinator.Config;
        bool isPrivate = cfg.ActiveScope == ConversationScope.Private;

        PrivateScopeButton.Background = isPrivate
            ? (Brush)Application.Current.Resources["AccentFillColorDefaultBrush"]
            : new SolidColorBrush(Colors.Transparent);
        PrivateScopeButton.Foreground = isPrivate
            ? new SolidColorBrush(Colors.White)
            : (Brush)Application.Current.Resources["TextFillColorPrimaryBrush"];

        PublicScopeButton.Background = !isPrivate
            ? (Brush)Application.Current.Resources["AccentFillColorDefaultBrush"]
            : new SolidColorBrush(Colors.Transparent);
        PublicScopeButton.Foreground = !isPrivate
            ? new SolidColorBrush(Colors.White)
            : (Brush)Application.Current.Resources["TextFillColorPrimaryBrush"];

        bool isMuted = App.Coordinator.IsMuted;
        MuteToggleButton.IsChecked = isMuted;
        MuteIcon.Glyph = isMuted ? "\uEC54" : "\uE720";
        ToolTipService.SetToolTip(MuteToggleButton, isMuted ? "Microphone Muted (click to unmute)" : "Microphone On (click to mute)");

        bool autoSpeak = isPrivate ? cfg.Voice.AutoSpeakPrivate : cfg.Voice.AutoSpeakPublic;
        AutoSpeakToggleButton.IsChecked = autoSpeak;
        AutoSpeakIcon.Glyph = autoSpeak ? "\uE767" : "\uE74F";
        ToolTipService.SetToolTip(AutoSpeakToggleButton, autoSpeak ? "Windows Speaker Auto-Speak On" : "Windows Speaker Off");

        if (isPrivate)
        {
            var model = string.IsNullOrWhiteSpace(cfg.PrivateLlm.SelectedModel)
                ? "No model selected"
                : cfg.PrivateLlm.SelectedModel;
            StatusBarEngineText.Text = $"Connected: Private · Windows Ollama ({model})";
            EngineStatusDot.Fill = new SolidColorBrush(ColorHelper.FromArgb(255, 16, 185, 129));
        }
        else
        {
            var adapter = cfg.PublicLlm.ActiveAdapter;
            var model = adapter switch
            {
                "claude" => cfg.PublicLlm.Claude.Model,
                "fable" => cfg.PublicLlm.Fable.Model,
                _ => cfg.PublicLlm.Gemini.Model
            };
            var adapterLabel = adapter switch
            {
                "claude" => "Claude",
                "fable" => "Fable",
                _ => "Gemini"
            };
            StatusBarEngineText.Text = $"Connected: Public · {adapterLabel} ({model})";
            EngineStatusDot.Fill = new SolidColorBrush(ColorHelper.FromArgb(255, 14, 165, 233));
        }

        RootGrid.RequestedTheme = cfg.Theme switch
        {
            AppThemeMode.Light => ElementTheme.Light,
            AppThemeMode.Dark => ElementTheme.Dark,
            _ => ElementTheme.Default
        };

        var displayName = string.IsNullOrWhiteSpace(cfg.UserProfile.DisplayName)
            ? Environment.UserName
            : cfg.UserProfile.DisplayName;
        UserDisplayNameText.Text = displayName;
        UserAvatarPicture.DisplayName = displayName;

        if (!string.IsNullOrWhiteSpace(cfg.UserProfile.AvatarPath) && File.Exists(cfg.UserProfile.AvatarPath))
        {
            UserAvatarPicture.ProfilePicture = new BitmapImage(new Uri(cfg.UserProfile.AvatarPath));
        }
        else
        {
            UserAvatarPicture.ProfilePicture = null;
        }

        SyncToolbarSelection();
    }

    public async Task PickAndUploadAvatarAsync()
    {
        var picker = new FileOpenPicker();
        picker.FileTypeFilter.Add(".png");
        picker.FileTypeFilter.Add(".jpg");
        picker.FileTypeFilter.Add(".jpeg");
        picker.FileTypeFilter.Add(".bmp");
        picker.SuggestedStartLocation = PickerLocationId.PicturesLibrary;

        var hwnd = WindowNative.GetWindowHandle(this);
        InitializeWithWindow.Initialize(picker, hwnd);

        var file = await picker.PickSingleFileAsync();
        if (file is null) return;

        var savedPath = WindowsUserProfileService.SaveCustomAvatarCopy(file.Path);
        App.Coordinator.Config.UserProfile.AvatarPath = savedPath;
        App.Coordinator.SaveConfig();
    }

    private async void ProfileUpload_Click(object sender, RoutedEventArgs e)
    {
        await PickAndUploadAvatarAsync();
    }

    private void PrivateScopeButton_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.SetScope(ConversationScope.Private);
    }

    private void PublicScopeButton_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.SetScope(ConversationScope.Public);
    }

    private void MuteToggleButton_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.IsMuted = MuteToggleButton.IsChecked == true;
        SyncMenuBarState();
    }

    private void AutoSpeakToggleButton_Click(object sender, RoutedEventArgs e)
    {
        var cfg = App.Coordinator.Config;
        bool enabled = AutoSpeakToggleButton.IsChecked == true;
        if (cfg.ActiveScope == ConversationScope.Private)
        {
            cfg.Voice.AutoSpeakPrivate = enabled;
        }
        else
        {
            cfg.Voice.AutoSpeakPublic = enabled;
        }
        App.Coordinator.SaveConfig();
    }

    private void StopSpeakerButton_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.Speech.StopSpeaking();
    }

    private void SettingsToolbarButton_Click(object sender, RoutedEventArgs e)
    {
        if (_activeTag == "settings")
        {
            NavigateToWorkbench();
        }
        else
        {
            NavigateToSettings();
        }
    }

    private void NavView_SelectionChanged(
        NavigationView sender,
        NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item)
        {
            var tag = item.Tag?.ToString();
            if (tag == "settings")
            {
                _activeTag = "settings";
                ContentFrame.Navigate(typeof(SettingsPage));
            }
            else
            {
                _activeTag = "workbench";
                ContentFrame.Navigate(typeof(WorkbenchPage));
            }
            SyncToolbarSelection();
        }
    }
}
