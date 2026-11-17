using FluentAssistantWorkbench.Services;
using Microsoft.UI.Xaml;

namespace FluentAssistantWorkbench;

public partial class App : Application
{
    public static WorkbenchCoordinator Coordinator { get; } = new();
    private Window? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var mainWindow = new MainWindow();
        _window = mainWindow;
        mainWindow.Activate();

        if (Environment.GetCommandLineArgs().Any(a => string.Equals(a, "--tray", StringComparison.OrdinalIgnoreCase)))
        {
            mainWindow.HideToTray();
        }
    }
}
