using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Services;
using FluentAssistantWorkbench.Views;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.UI;
using Windows.UI.Core;
using VirtualKey = Windows.System.VirtualKey;

namespace FluentAssistantWorkbench;

public sealed partial class MainWindow : Window
{
    public static MainWindow? CurrentWindow { get; private set; }
    private TrayIconService? _trayIcon;
    private bool _isExiting;
    private bool _isSending;
    private DispatcherQueueTimer? _telemetryTimer;
    private CancellationTokenSource? _requestCts;

    private double _leftRailStartWidth = 200;
    private double _rightRailWidth = 280;
    private double _rightRailStartWidth = 280;
    private double _bottomBarHeight = 220;
    private double _bottomBarStartHeight = 220;

    public MainWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(TitleBarDragRegion);
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Standard;
        AppWindow.TitleBar.ButtonBackgroundColor = Colors.Transparent;
        RootGrid.SizeChanged += (_, _) => UpdateTitleBarInsets();
        UpdateTitleBarInsets();
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
        App.Coordinator.ContextTelemetryChanged += (_, _) => DispatcherQueue.TryEnqueue(SyncContextMonitor);
        App.Coordinator.ResponseArrived += (_, args) => DispatcherQueue.TryEnqueue(() =>
        {
            if (!App.Coordinator.Config.Notifications.DesktopNotificationOnReply) return;
            var title = args.IsError
                ? "Personal Assistant · Error"
                : $"Personal Assistant · {args.Scope} reply ready";
            _trayIcon?.ShowBalloonNotification(title, args.PreviewText, args.IsError);
        });

        ContextLogsList.ItemsSource = App.Coordinator.ContextLogs;
        _telemetryTimer = DispatcherQueue.CreateTimer();
        _telemetryTimer.Interval = TimeSpan.FromMilliseconds(200);
        _telemetryTimer.Tick += (_, _) => SyncContextMonitor();

        SyncMenuBarState();
        SyncContextMonitor();
        SyncLeftSplitterPosition();
        _ = App.Coordinator.InitializeProfileAsync();

        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(WorkbenchPage));
    }

    private void UpdateTitleBarInsets()
    {
        var scale = RootGrid.XamlRoot?.RasterizationScale ?? 1;
        TitleBarLeftInsetColumn.Width = new GridLength(AppWindow.TitleBar.LeftInset / scale);
        TitleBarRightInsetColumn.Width = new GridLength(AppWindow.TitleBar.RightInset / scale);
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
            onExit: ExitApplication);
    }

    private void ExitApplication()
    {
        _isExiting = true;
        _trayIcon?.Dispose();
        if (Application.Current is App app)
        {
            app.ShutdownInstanceResources();
        }
        Close();
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
        NavView.SelectedItem = NavView.MenuItems[2];
        if (ContentFrame.Content is SettingsPage existing)
        {
            existing.ReloadFromCoordinator();
        }
        SetContextCachePageActive(true);
    }

    public void NavigateToWorkbench()
    {
        NavView.SelectedItem = NavView.MenuItems[0];
        if (ContentFrame.Content is not WorkbenchPage)
        {
            ContentFrame.Navigate(typeof(WorkbenchPage));
        }
        SetContextCachePageActive(false);
    }

    private void NavigateToContextCache()
    {
        NavView.SelectedItem = NavView.MenuItems[1];
        if (ContentFrame.Content is not ContextCachePage)
        {
            ContentFrame.Navigate(typeof(ContextCachePage));
        }
        SetContextCachePageActive(true);
    }

    private void SetContextCachePageActive(bool active)
    {
        PromptComposer.Visibility = active ? Visibility.Collapsed : Visibility.Visible;
        BottomPaneSplitter.Visibility = active ? Visibility.Collapsed : Visibility.Visible;
        BottomStatusRow.Height = active
            ? new GridLength(46)
            : new GridLength(_bottomBarHeight);
    }

    private Brush GetPrimaryTextBrush()
    {
        var isDark = App.Coordinator.Config.Theme switch
        {
            AppThemeMode.MidnightSlate or AppThemeMode.RoyalAmethyst or AppThemeMode.Dark => true,
            AppThemeMode.ArcticSky or AppThemeMode.EmeraldMist or AppThemeMode.Light => false,
            _ => RootGrid.ActualTheme == ElementTheme.Dark
        };
        return new SolidColorBrush(isDark
            ? ColorHelper.FromArgb(255, 241, 245, 249)
            : ColorHelper.FromArgb(255, 31, 41, 55));
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
        bool isPrivate = cfg.EffectiveScope == ConversationScope.Private;
        var accentBrush = new SolidColorBrush(GetThemeAccentColor(cfg.Theme));
        SendButton.Background = accentBrush;
        SendButton.BorderBrush = accentBrush;
        SendButton.Foreground = new SolidColorBrush(Colors.White);

        PromptModeVoiceIcon.Glyph = isPrivate ? "\uE8BD" : "\uE767";
        PromptTextBox.FontFamily = new FontFamily(WorkbenchThemeHelper.GetFontFamilyName(cfg.FontFamily));

        if (isPrivate)
        {
            var modelName = string.IsNullOrWhiteSpace(cfg.PrivateLlm.SelectedModel)
                ? "No model selected"
                : cfg.PrivateLlm.SelectedModel;
            StatusBarEngineText.Text = $"Connected: Private · Ollama ({modelName})";
            EngineStatusDot.Fill = new SolidColorBrush(ColorHelper.FromArgb(255, 16, 185, 129));
        }
        else
        {
            var (adapterLabel, modelName) = cfg.PublicLlm.ActiveAdapter switch
            {
                "claude" => ("Claude", cfg.PublicLlm.Claude.Model),
                "fable" => ("Fable", cfg.PublicLlm.Fable.Model),
                _ => ("Gemini", cfg.PublicLlm.Gemini.Model)
            };
            StatusBarEngineText.Text = $"Connected: Public · {adapterLabel} ({modelName})";
            EngineStatusDot.Fill = accentBrush;
        }

        SyncContextCacheStatus();
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

    }

    private void SyncContextMonitor()
    {
        var t = App.Coordinator.Telemetry;
        if (t.IsThinking)
        {
            if (_telemetryTimer is not null && !_telemetryTimer.IsRunning)
            {
                _telemetryTimer.Start();
            }
        }
        else if (_telemetryTimer is not null && _telemetryTimer.IsRunning)
        {
            _telemetryTimer.Stop();
        }

        string elapsedText = "—";
        if (t.IsThinking && t.ThinkingStartedAt.HasValue)
        {
            double sec = Math.Max(0, (DateTimeOffset.UtcNow - t.ThinkingStartedAt.Value).TotalSeconds);
            elapsedText = $"{sec:0.0}s";
        }
        else if (t.DurationMs.HasValue)
        {
            elapsedText = t.DurationMs.Value >= 1000
                ? $"{t.DurationMs.Value / 1000.0:0.00}s"
                : $"{t.DurationMs.Value}ms";
        }

        MonitorPhaseText.Text = t.IsThinking ? "Thinking" : t.Phase;
        MonitorProgressBar.IsIndeterminate = t.IsThinking;
        MonitorProgressBar.Value = t.Phase == "Ready" ? 100 : 0;

        if (t.IsThinking)
        {
            MonitorProgressText.Text = $"Thinking... ({elapsedText})";
            MonitorPhaseBadge.Background = new SolidColorBrush(ColorHelper.FromArgb(40, 14, 165, 233));
        }
        else if (t.Phase == "Error")
        {
            MonitorProgressText.Text = $"Failed after {elapsedText}";
            MonitorPhaseBadge.Background = new SolidColorBrush(ColorHelper.FromArgb(40, 220, 38, 38));
        }
        else if (t.Phase == "Ready")
        {
            MonitorProgressText.Text = $"Completed in {elapsedText}";
            MonitorPhaseBadge.Background = new SolidColorBrush(ColorHelper.FromArgb(40, 16, 185, 129));
        }
        else if (t.Phase == "Stopped")
        {
            MonitorProgressText.Text = $"Stopped after {elapsedText}";
            MonitorPhaseBadge.Background = new SolidColorBrush(ColorHelper.FromArgb(32, 148, 163, 184));
        }
        else
        {
            MonitorProgressText.Text = "Waiting for next prompt";
            MonitorPhaseBadge.Background = new SolidColorBrush(ColorHelper.FromArgb(24, 148, 163, 184));
        }

        MetricPromptSizeText.Text = t.PromptChars > 0
            ? $"{t.PromptChars:N0} ch ({t.HistoryTurnsUsed}t)"
            : "—";
        MetricInputTokensText.Text = t.InputTokens.HasValue ? $"{t.InputTokens:N0}" : "—";
        MetricOutputTokensText.Text = t.OutputTokens.HasValue ? $"{t.OutputTokens:N0}" : "—";
        MetricTokensLoadedText.Text = t.TotalTokens.HasValue ? $"{t.TotalTokens:N0}" : "—";
        MetricSpeedText.Text = t.TokensPerSecond.HasValue ? $"{t.TokensPerSecond:0.0} tok/s" : "— tok/s";
        MetricDurationText.Text = elapsedText;

        if (!string.IsNullOrWhiteSpace(t.LastError))
        {
            MonitorErrorText.Text = t.LastError;
            MonitorErrorText.Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 220, 38, 38));
        }
        else
        {
            MonitorErrorText.Text = "Healthy · No active errors";
            MonitorErrorText.Foreground = GetPrimaryTextBrush();
        }

        ContextLogsEmptyText.Visibility = App.Coordinator.ContextLogs.Count == 0
            ? Visibility.Visible
            : Visibility.Collapsed;
        var scope = App.Coordinator.Config.EffectiveScope;
        var config = App.Coordinator.Config;
        var contextLimit = scope == ConversationScope.Private
            ? config.PrivateLlm.ContextWindow
            : 0;
        MetricReferenceCacheText.Text = $"{TokenEstimate.Count(App.Coordinator.GetContextCacheText(scope)):N0} est. tokens";
        MetricContextWindowText.Text = contextLimit > 0
            ? $"{contextLimit:N0} tokens"
            : "Provider-defined";
        MetricRemainingContextText.Text = FormatRemainingContext(EstimatePromptContextTokens(), contextLimit);
        SyncContextCacheStatus();
    }

    private string GetActiveSystemInstruction()
    {
        var config = App.Coordinator.Config;
        if (config.EffectiveScope == ConversationScope.Private)
        {
            return config.PrivateLlm.SystemInstruction;
        }

        return config.PublicLlm.ActiveAdapter switch
        {
            "claude" => config.PublicLlm.Claude.SystemInstruction,
            "fable" => config.PublicLlm.Fable.SystemInstruction,
            _ => config.PublicLlm.Gemini.SystemInstruction
        };
    }

    private void SyncContextCacheStatus()
    {
        if (PromptTextBox is null || StatusBarCacheText is null || PromptContextStatusText is null) return;

        var config = App.Coordinator.Config;
        var scope = config.EffectiveScope;
        var contextLimit = scope == ConversationScope.Private ? config.PrivateLlm.ContextWindow : 0;
        var promptEstimate = EstimatePromptContextTokens();
        var cacheEstimate = TokenEstimate.Count(App.Coordinator.GetContextCacheText(scope));
        var contextLimitText = contextLimit > 0 ? $"{contextLimit:N0}" : "provider limit";
        var remainingText = FormatRemainingContext(promptEstimate, contextLimit);
        StatusBarCacheText.Text =
            $"Reference: {cacheEstimate:N0} est. · Used: ~{promptEstimate:N0} / {contextLimitText} · {remainingText}";
        PromptContextStatusText.Text =
            $"Reference: {cacheEstimate:N0} est. · Context used: ~{promptEstimate:N0} / {contextLimitText} · {remainingText}";
    }

    private int EstimatePromptContextTokens()
    {
        var config = App.Coordinator.Config;
        var scope = config.EffectiveScope;
        var cacheText = App.Coordinator.GetContextCacheText(scope);
        var recentHistory = App.Coordinator.Turns
            .Where(turn => turn.Scope == scope && (turn.IsUser || turn.IsAssistant))
            .TakeLast(Math.Clamp(config.PrivateLlm.MaxHistoryTurns, 2, 32))
            .Select(turn => turn.Content);
        return TokenEstimate.Count(string.Join(
            "\n",
            new[] { GetActiveSystemInstruction(), cacheText, PromptTextBox.Text }
                .Concat(recentHistory)));
    }

    private static string FormatRemainingContext(int usedTokens, int contextLimit)
    {
        if (contextLimit <= 0)
        {
            return "Remaining: provider-defined";
        }

        var remaining = contextLimit - usedTokens;
        return remaining >= 0
            ? $"Remaining: ~{remaining:N0}"
            : $"Over by ~{-remaining:N0}";
    }

    private void SyncLeftSplitterPosition()
    {
        bool showLeftSplitter =
            NavView.IsPaneOpen &&
            NavView.DisplayMode == NavigationViewDisplayMode.Expanded;
        LeftPaneSplitter.Visibility = showLeftSplitter ? Visibility.Visible : Visibility.Collapsed;
        LeftPaneSplitter.Margin = new Thickness(Math.Max(0, NavView.OpenPaneLength - 3), 0, 0, 0);
    }

    private void NavView_PaneChanged(NavigationView sender, object args)
    {
        SyncLeftSplitterPosition();
    }

    private void NavView_DisplayModeChanged(NavigationView sender, NavigationViewDisplayModeChangedEventArgs args)
    {
        SyncLeftSplitterPosition();
    }

    private void LeftPaneSplitter_DragStarted(object? sender, EventArgs e)
    {
        _leftRailStartWidth = NavView.OpenPaneLength;
    }

    private void LeftPaneSplitter_DragDelta(object? sender, double delta)
    {
        double next = Math.Clamp(_leftRailStartWidth + delta, 150, 380);
        NavView.OpenPaneLength = next;
        SyncLeftSplitterPosition();
    }

    private void RightPaneSplitter_DragStarted(object? sender, EventArgs e)
    {
        _rightRailStartWidth = _rightRailWidth;
    }

    private void RightPaneSplitter_DragDelta(object? sender, double delta)
    {
        _rightRailWidth = Math.Clamp(_rightRailStartWidth - delta, 220, 540);
        if (AgentSessionSidebarToggleButton.IsChecked == true)
        {
            RightRailColumn.Width = new GridLength(_rightRailWidth);
        }
    }

    private void BottomPaneSplitter_DragStarted(object? sender, EventArgs e)
    {
        _bottomBarStartHeight = _bottomBarHeight;
    }

    private void BottomPaneSplitter_DragDelta(object? sender, double delta)
    {
        _bottomBarHeight = Math.Clamp(_bottomBarStartHeight - delta, 140, 420);
        BottomStatusRow.Height = new GridLength(_bottomBarHeight);
    }

    private void AgentSessionSidebarToggleButton_Click(object sender, RoutedEventArgs e)
    {
        bool show = AgentSessionSidebarToggleButton.IsChecked == true;
        SetContextMonitorVisibility(show);
    }

    private void ToggleNavigationPaneMenuItem_Click(object sender, RoutedEventArgs e)
    {
        NavView.IsPaneOpen = !NavView.IsPaneOpen;
        SyncLeftSplitterPosition();
    }

    private void SetContextMonitorVisibility(bool show)
    {
        RightContextRail.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        RightPaneSplitter.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        RightSplitterColumn.Width = show ? new GridLength(6) : new GridLength(0);
        RightRailColumn.Width = show ? new GridLength(_rightRailWidth) : new GridLength(0);
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

    private async Task DispatchPromptAsync(string text, string inputMode)
    {
        if (string.IsNullOrWhiteSpace(text) || _isSending ||
            ContentFrame.Content is not WorkbenchPage page)
        {
            return;
        }

        using var requestCts = new CancellationTokenSource();
        _requestCts = requestCts;
        _isSending = true;
        SendButton.IsEnabled = true;
        SendIcon.Glyph = "\uE71A";
        ToolTipService.SetToolTip(SendButton, "Stop response");
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(SendButton, "Stop response");

        try
        {
            var sendTask = page.SendPromptAsync(text, inputMode, requestCts.Token);
            SyncContextMonitor();
            await sendTask;
        }
        finally
        {
            _isSending = false;
            _requestCts = null;
            SendIcon.Glyph = "\uE724";
            ToolTipService.SetToolTip(SendButton, "Send prompt");
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(SendButton, "Send prompt");
            SendButton.IsEnabled = true;
            SyncContextMonitor();
        }
    }

    private async void SendButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isSending)
        {
            if (App.Coordinator.Telemetry.IsThinking)
            {
                _requestCts?.Cancel();
            }
            return;
        }

        var text = PromptTextBox.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;
        PromptTextBox.Text = string.Empty;
        await DispatchPromptAsync(text, "Typed");
    }

    private async void PromptTextBox_PreviewKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key != VirtualKey.Enter) return;

        var shiftState = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift);
        if (shiftState.HasFlag(CoreVirtualKeyStates.Down)) return;

        e.Handled = true;
        var text = PromptTextBox.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;
        PromptTextBox.Text = string.Empty;
        await DispatchPromptAsync(text, "Typed");
    }

    private void PromptTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        SyncContextCacheStatus();
    }

    private async void SavePdfToolbarButton_Click(object sender, RoutedEventArgs e)
    {
        if (ContentFrame.Content is WorkbenchPage page)
        {
            await page.SaveConversationPdfAsync();
        }
    }

    private void NewSessionToolbarButton_Click(object sender, RoutedEventArgs e)
    {
        App.Coordinator.ClearHistory();
    }

    private void OpenPersonalAssistant_Click(object sender, RoutedEventArgs e)
    {
        NavigateToWorkbench();
    }

    private void ExitMenuItem_Click(object sender, RoutedEventArgs e)
    {
        ExitApplication();
    }

    private void ClearPromptMenuItem_Click(object sender, RoutedEventArgs e)
    {
        PromptTextBox.Text = string.Empty;
    }

    private void SelectPromptMenuItem_Click(object sender, RoutedEventArgs e)
    {
        PromptTextBox.Focus(FocusState.Programmatic);
        PromptTextBox.SelectAll();
    }

    private void NavView_SelectionChanged(
        NavigationView sender,
        NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item)
        {
            var destination = item.Tag?.ToString();
            if (string.Equals(destination, "context-cache", StringComparison.Ordinal))
            {
                if (ContentFrame.Content is not ContextCachePage)
                {
                    ContentFrame.Navigate(typeof(ContextCachePage));
                }
                SetContextCachePageActive(true);
            }
            else if (string.Equals(destination, "settings", StringComparison.Ordinal))
            {
                if (ContentFrame.Content is SettingsPage existing)
                {
                    existing.ReloadFromCoordinator();
                }
                else
                {
                    ContentFrame.Navigate(typeof(SettingsPage));
                }
                SetContextCachePageActive(true);
            }
            else
            {
                if (ContentFrame.Content is not WorkbenchPage)
                {
                    ContentFrame.Navigate(typeof(WorkbenchPage));
                }
                SetContextCachePageActive(false);
            }
        }
    }
}
