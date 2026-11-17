using FluentAssistantWorkbench.Models;
using FluentAssistantWorkbench.Views;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace FluentAssistantWorkbench;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        SystemBackdrop = new MicaBackdrop();

        App.Coordinator.ConfigChanged += (_, _) => SyncMenuBarState();
        SyncMenuBarState();

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
