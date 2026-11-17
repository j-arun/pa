using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using FluentAssistantWorkbench.Views;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.UI;

namespace FluentAssistantWorkbench;

public sealed partial class MainWindow : Window
{
    public static MainWindow? CurrentWindow { get; private set; }
    private TrayIconService? _trayIcon;
    private bool _isExiting;

    public MainWindow()
    {
        InitializeComponent();
        CurrentWindow = this;
        SystemBackdrop = new MicaBackdrop();
        SetWindowIcon();
        InitializeTrayIcon();

        AppWindow.Closing += MainWindow_Closing;
        Closed += (_, _) =>
        {
            _trayIcon?.Dispose();
            if (Application.Current is App app)
            {
                app.ShutdownInstanceResources();
            }
        };

        App.Coordinator.ConfigChanged += (_, _) => DispatcherQueue.TryEnqueue(SyncMenuBarState);
        App.Coordinator.ResponseArrived += (_, args) => DispatcherQueue.TryEnqueue(() =>
        {
            if (!App.Coordinator.Config.Notifications.DesktopNotificationOnReply) return;
            var title = args.IsError
                ? "Personal Assistant · Error"
                : $"Personal Assistant · {args.Scope} reply ready";
            _trayIcon?.ShowBalloonNotification(title, args.PreviewText, args.IsError);
        });
        SyncMenuBarState();
        _ = App.Coordinator.InitializeProfileAsync();

        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(WorkbenchPage));
    }

    public void TestDesktopNotification()
    {
        NotificationSoundService.PlayReplyChime(isError: false);
        _trayIcon?.ShowBalloonNotification(
            "Personal Assistant · Notification Test",
            "Sound chime and Windows notifications are active for LLM responses.");
    }

    private void InitializeTrayIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "PersonalAssistant.ico");
        _trayIcon = new TrayIconService(
            this,
            iconPath,
            "Personal Assistant",
            onOpen: () => NavigateToWorkbench(),
            onNewSession: () =>
            {
                App.Coordinator.ClearHistory();
                NavigateToWorkbench();
            },
            onExit: () =>
            {
                _isExiting = true;
                _trayIcon?.Dispose();
                if (Application.Current is App app)
                {
                    app.ShutdownInstanceResources();
                }
                Close();
            });
    }

    public void HideToTray()
    {
        _trayIcon?.HideWindowToTray();
    }

    public void RestoreFromTray()
    {
        _trayIcon?.ShowAndFocusWindow();
        NavigateToWorkbench();
    }

    private void MainWindow_Closing(Microsoft.UI.Windowing.AppWindow sender, Microsoft.UI.Windowing.AppWindowClosingEventArgs args)
    {
        if (!_isExiting)
        {
            args.Cancel = true;
            _trayIcon?.HideWindowToTray();
        }
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

            var pngPath = Path.Combine(AppContext.BaseDirectory, "Assets", "PersonalAssistant.png");
            if (File.Exists(pngPath))
            {
                TopBarAppIcon.Source = new BitmapImage(new Uri(pngPath));
            }
        }
        catch
        {
            // Ignore when host environment does not support icon loading
        }
    }

    public void NavigateToSettings()
    {
        SettingsModalFeedbackText.Text = string.Empty;
        if (SettingsModalFrame.Content is SettingsPage existing)
        {
            existing.ReloadFromCoordinator();
        }
        else
        {
            SettingsModalFrame.Navigate(typeof(SettingsPage));
        }
        SettingsModalOverlay.Visibility = Visibility.Visible;
        SyncToolbarSelection();
    }

    public void CloseSettingsModal()
    {
        SettingsModalOverlay.Visibility = Visibility.Collapsed;
        SyncToolbarSelection();
    }

    public void NavigateToWorkbench()
    {
        CloseSettingsModal();
        NavView.SelectedItem = NavView.MenuItems[0];
        if (ContentFrame.Content is not WorkbenchPage)
        {
            ContentFrame.Navigate(typeof(WorkbenchPage));
        }
    }

    private static Brush GetPrimaryTextBrush()
    {
        if (Application.Current.Resources.TryGetValue("TextFillColorPrimaryBrush", out var res) && res is Brush brush)
        {
            return brush;
        }
        return new SolidColorBrush(Colors.Gray);
    }

    private void SyncToolbarSelection()
    {
        bool onSettings = SettingsModalOverlay.Visibility == Visibility.Visible;
        var accentColor = GetThemeAccentColor(App.Coordinator.Config.Theme);
        SettingsToolbarButton.Background = onSettings
            ? new SolidColorBrush(accentColor)
            : new SolidColorBrush(Colors.Transparent);
        SettingsToolbarButton.Foreground = onSettings
            ? new SolidColorBrush(Colors.White)
            : GetPrimaryTextBrush();
    }

    private static Color GetThemeAccentColor(AppThemeMode mode) => mode switch
    {
        AppThemeMode.EmeraldMist => ColorHelper.FromArgb(255, 5, 150, 105),
        AppThemeMode.RoyalAmethyst => ColorHelper.FromArgb(255, 168, 85, 247),
        AppThemeMode.MidnightSlate or AppThemeMode.Dark => ColorHelper.FromArgb(255, 14, 165, 233),
        _ => ColorHelper.FromArgb(255, 2, 132, 199)
    };

    private static Brush GetThemeCanvasBrush(AppThemeMode mode) => mode switch
    {
        AppThemeMode.EmeraldMist => new SolidColorBrush(ColorHelper.FromArgb(32, 236, 253, 245)),
        AppThemeMode.RoyalAmethyst => new SolidColorBrush(ColorHelper.FromArgb(255, 20, 12, 34)),
        AppThemeMode.MidnightSlate or AppThemeMode.Dark => new SolidColorBrush(ColorHelper.FromArgb(255, 15, 23, 42)),
        AppThemeMode.ArcticSky or AppThemeMode.Light => new SolidColorBrush(ColorHelper.FromArgb(28, 255, 255, 255)),
        _ => new SolidColorBrush(Colors.Transparent)
    };

    private void SyncMenuBarState()
    {
        var cfg = App.Coordinator.Config;
        bool isPrivate = cfg.ActiveScope == ConversationScope.Private;
        var accentBrush = new SolidColorBrush(GetThemeAccentColor(cfg.Theme));

        PrivateScopeButton.Background = isPrivate
            ? accentBrush
            : new SolidColorBrush(Colors.Transparent);
        PrivateScopeButton.Foreground = isPrivate
            ? new SolidColorBrush(Colors.White)
            : GetPrimaryTextBrush();

        PublicScopeButton.Background = !isPrivate
            ? accentBrush
            : new SolidColorBrush(Colors.Transparent);
        PublicScopeButton.Foreground = !isPrivate
            ? new SolidColorBrush(Colors.White)
            : GetPrimaryTextBrush();

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
            EngineStatusDot.Fill = accentBrush;
        }

        _trayIcon?.UpdateTooltip($"Personal Assistant · {StatusBarEngineText.Text}");

        RootGrid.RequestedTheme = cfg.Theme switch
        {
            AppThemeMode.ArcticSky or AppThemeMode.EmeraldMist or AppThemeMode.Light => ElementTheme.Light,
            AppThemeMode.MidnightSlate or AppThemeMode.RoyalAmethyst or AppThemeMode.Dark => ElementTheme.Dark,
            _ => ElementTheme.Default
        };
        RootGrid.Background = GetThemeCanvasBrush(cfg.Theme);

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

    public async Task SyncWindowsAccountProfileAsync()
    {
        var (name, avatar) = await WindowsUserProfileService.DetectLoggedInUserAsync();
        if (!string.IsNullOrWhiteSpace(name))
        {
            App.Coordinator.Config.UserProfile.DisplayName = name;
        }
        if (!string.IsNullOrWhiteSpace(avatar))
        {
            App.Coordinator.Config.UserProfile.AvatarPath = avatar;
        }
        App.Coordinator.SaveConfig();
    }

    private async void ProfileSync_Click(object sender, RoutedEventArgs e)
    {
        await SyncWindowsAccountProfileAsync();
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
        if (SettingsModalOverlay.Visibility == Visibility.Visible)
        {
            CloseSettingsModal();
        }
        else
        {
            NavigateToSettings();
        }
    }

    private void ApplySettings_Click(object sender, RoutedEventArgs e)
    {
        if (SettingsModalFrame.Content is SettingsPage page)
        {
            page.ApplyAndSave();
            SettingsModalFeedbackText.Text = $"Applied at {DateTime.Now:t}";
        }
    }

    private void SaveAndCloseSettings_Click(object sender, RoutedEventArgs e)
    {
        if (SettingsModalFrame.Content is SettingsPage page)
        {
            page.ApplyAndSave();
        }
        CloseSettingsModal();
    }

    private void CloseSettings_Click(object sender, RoutedEventArgs e)
    {
        CloseSettingsModal();
    }

    private void NavView_SelectionChanged(
        NavigationView sender,
        NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem)
        {
            CloseSettingsModal();
            if (ContentFrame.Content is not WorkbenchPage)
            {
                ContentFrame.Navigate(typeof(WorkbenchPage));
            }
        }
    }
}
