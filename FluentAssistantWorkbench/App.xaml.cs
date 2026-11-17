using FluentAssistantWorkbench.Services;
using Microsoft.UI.Xaml;

namespace FluentAssistantWorkbench;

public partial class App : Application
{
    private const string SingleInstanceMutexName = @"Local\PersonalAssistant_SingleInstance_Mutex";
    private const string ShowWindowEventName = @"Local\PersonalAssistant_ShowWindow_Event";

    private static WorkbenchCoordinator? _coordinator;
    public static WorkbenchCoordinator Coordinator => _coordinator ??= new WorkbenchCoordinator();

    private Window? _window;
    private Mutex? _instanceMutex;
    private EventWaitHandle? _showWindowEvent;
    private CancellationTokenSource? _signalCts;

    public App()
    {
        InitializeComponent();
        UnhandledException += App_UnhandledException;
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        bool startInTray = Environment.GetCommandLineArgs()
            .Any(a => string.Equals(a, "--tray", StringComparison.OrdinalIgnoreCase));

        bool createdNew = true;
        try
        {
            _instanceMutex = new Mutex(initiallyOwned: true, SingleInstanceMutexName, out createdNew);
            _showWindowEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowWindowEventName);
        }
        catch
        {
            createdNew = true;
        }

        if (!createdNew)
        {
            if (!startInTray)
            {
                try
                {
                    _showWindowEvent?.Set();
                }
                catch
                {
                    // Ignore wakeup signal errors
                }
            }

            Exit();
            return;
        }

        _ = Coordinator;

        var mainWindow = new MainWindow();
        _window = mainWindow;
        StartShowWindowListener(mainWindow);

        mainWindow.Activate();

        if (startInTray)
        {
            mainWindow.DispatcherQueue.TryEnqueue(() => mainWindow.HideToTray());
        }
        else
        {
            mainWindow.RestoreFromTray();
        }
    }

    private void StartShowWindowListener(MainWindow mainWindow)
    {
        if (_showWindowEvent is null) return;

        _signalCts = new CancellationTokenSource();
        var token = _signalCts.Token;
        var waitEvent = _showWindowEvent;

        _ = Task.Run(() =>
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    if (waitEvent.WaitOne(500))
                    {
                        if (token.IsCancellationRequested) break;
                        mainWindow.DispatcherQueue.TryEnqueue(() => mainWindow.RestoreFromTray());
                    }
                }
                catch
                {
                    break;
                }
            }
        }, token);
    }

    public void ShutdownInstanceResources()
    {
        _signalCts?.Cancel();
        _signalCts?.Dispose();
        _signalCts = null;

        try
        {
            _showWindowEvent?.Dispose();
        }
        catch
        {
            // Ignore cleanup errors
        }

        try
        {
            _instanceMutex?.ReleaseMutex();
        }
        catch
        {
            // Ignore if not owned
        }
        _instanceMutex?.Dispose();
    }

    private static void App_UnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FluentAssistantWorkbench");
            Directory.CreateDirectory(dir);
            File.AppendAllText(
                Path.Combine(dir, "startup.log"),
                $"[{DateTime.Now:O}] {e.Message}{Environment.NewLine}{e.Exception}{Environment.NewLine}");
        }
        catch
        {
            // Ignore log write failures
        }
    }
}
