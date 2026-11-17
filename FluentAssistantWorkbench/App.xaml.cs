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
        _window = new MainWindow();
        _window.Activate();
    }
}
