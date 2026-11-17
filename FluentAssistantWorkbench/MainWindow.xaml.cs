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

    public MainWindow()
    {
        InitializeComponent();
        CurrentWindow = this;
        SystemBackdrop = new MicaBackdrop();

        App.Coordinator.ConfigChanged += (_, _) => DispatcherQueue.TryEnqueue(SyncMenuBarState);
        SyncMenuBarState();
        _ = App.Coordinator.InitializeProfileAsync();

        NavView.SelectedItem = NavView.MenuItems[0];
        ContentFrame.Navigate(typeof(WorkbenchPage));
    }

    public void NavigateToSettings()
    {
        NavView.SelectedItem = NavView.MenuItems[1];
        ContentFrame.Navigate(typeof(SettingsPage));
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
        MuteIcon.Glyph = isMuted ? "\uE74F" : "\uE720";
        MuteLabel.Text = isMuted ? "Muted" : "Mic On";

        bool autoSpeak = isPrivate ? cfg.Voice.AutoSpeakPrivate : cfg.Voice.AutoSpeakPublic;
        AutoSpeakToggleButton.IsChecked = autoSpeak;
        AutoSpeakLabel.Text = autoSpeak ? "Auto-Speak" : "Speak Off";

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

    private void NavView_SelectionChanged(
        NavigationView sender,
        NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item)
        {
            var tag = item.Tag?.ToString();
            if (tag == "settings")
            {
                ContentFrame.Navigate(typeof(SettingsPage));
            }
            else
            {
                ContentFrame.Navigate(typeof(WorkbenchPage));
            }
        }
    }
}
