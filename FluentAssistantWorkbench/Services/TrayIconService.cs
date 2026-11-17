using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace FluentAssistantWorkbench.Services;

public sealed class TrayIconService : IDisposable
{
    private const uint WM_NULL = 0x0000;
    private const uint WM_NCDESTROY = 0x0082;
    private const uint WM_APP_TRAY = 0x8000 + 42;
    private const uint WM_LBUTTONUP = 0x0202;
    private const uint WM_LBUTTONDBLCLK = 0x0203;
    private const uint WM_RBUTTONUP = 0x0205;

    private const uint NIM_ADD = 0x00000000;
    private const uint NIM_MODIFY = 0x00000001;
    private const uint NIM_DELETE = 0x00000002;

    private const uint NIF_MESSAGE = 0x00000001;
    private const uint NIF_ICON = 0x00000002;
    private const uint NIF_TIP = 0x00000004;
    private const uint NIF_INFO = 0x00000010;

    private const uint NIIF_INFO = 0x00000001;
    private const uint NIIF_ERROR = 0x00000003;
    private const uint NIIF_NOSOUND = 0x00000010;
    private const uint NIN_BALLOONUSERCLICK = 0x0405;

    private const uint IMAGE_ICON = 1;
    private const uint LR_LOADFROMFILE = 0x00000010;
    private const uint LR_DEFAULTSIZE = 0x00000040;

    private const uint MF_STRING = 0x00000000;
    private const uint MF_SEPARATOR = 0x00000800;
    private const uint TPM_RIGHTBUTTON = 0x0002;
    private const uint TPM_RETURNCMD = 0x0100;

    private const int SW_SHOW = 5;
    private const int SW_RESTORE = 9;

    private const nuint ID_OPEN = 1001;
    private const nuint ID_NEW_SESSION = 1002;
    private const nuint ID_EXIT = 1003;

    private readonly Window _window;
    private readonly nint _hwnd;
    private readonly Action _onOpen;
    private readonly Action _onNewSession;
    private readonly Action _onExit;
    private readonly SUBCLASSPROC _subclassProc;

    private nint _hIcon;
    private bool _added;
    private bool _disposed;

    public TrayIconService(
        Window window,
        string iconPath,
        string tooltip,
        Action onOpen,
        Action onNewSession,
        Action onExit)
    {
        _window = window;
        _hwnd = WindowNative.GetWindowHandle(window);
        _onOpen = onOpen;
        _onNewSession = onNewSession;
        _onExit = onExit;
        _subclassProc = WindowSubclassProc;

        SetWindowSubclass(_hwnd, _subclassProc, 1, 0);

        if (File.Exists(iconPath))
        {
            _hIcon = LoadImageW(0, iconPath, IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
        }

        var data = CreateNotifyIconData(tooltip);
        _added = Shell_NotifyIconW(NIM_ADD, ref data);
    }

    public void UpdateTooltip(string tooltip)
    {
        if (!_added || _disposed) return;
        var data = CreateNotifyIconData(tooltip);
        data.uFlags = NIF_TIP;
        Shell_NotifyIconW(NIM_MODIFY, ref data);
    }

    public void ShowBalloonNotification(string title, string message, bool isError = false)
    {
        if (!_added || _disposed) return;
        try
        {
            var cleanTitle = (title ?? "Personal Assistant").Replace("\r", " ").Replace("\n", " ").Trim();
            var cleanBody = (message ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();
            if (cleanTitle.Length > 63) cleanTitle = cleanTitle[..60] + "...";
            if (cleanBody.Length > 255) cleanBody = cleanBody[..252] + "...";

            var data = CreateNotifyIconData("Personal Assistant");
            data.uFlags = NIF_INFO;
            data.szInfoTitle = cleanTitle;
            data.szInfo = cleanBody;
            data.dwInfoFlags = (isError ? NIIF_ERROR : NIIF_INFO) | NIIF_NOSOUND;
            Shell_NotifyIconW(NIM_MODIFY, ref data);
        }
        catch
        {
            // Ignore shell notification failures
        }
    }

    public void ShowAndFocusWindow()
    {
        try
        {
            if (_window.AppWindow.Presenter is OverlappedPresenter presenter &&
                presenter.State == OverlappedPresenterState.Minimized)
            {
                presenter.Restore();
            }

            _window.AppWindow.Show(true);
            _window.AppWindow.MoveInZOrderAtTop();
        }
        catch
        {
            // Fallback to Win32 show if AppWindow is unavailable
        }

        ShowWindow(_hwnd, SW_SHOW);
        ShowWindow(_hwnd, SW_RESTORE);
        SetForegroundWindow(_hwnd);
        _window.Activate();
    }

    public void HideWindowToTray()
    {
        try
        {
            _window.AppWindow.Hide();
        }
        catch
        {
            // Ignore hide errors
        }
    }

    private NOTIFYICONDATA CreateNotifyIconData(string tooltip)
    {
        var safeTip = tooltip.Length > 127 ? tooltip[..127] : tooltip;
        return new NOTIFYICONDATA
        {
            cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(),
            hWnd = _hwnd,
            uID = 1,
            uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP,
            uCallbackMessage = WM_APP_TRAY,
            hIcon = _hIcon,
            szTip = safeTip,
            szInfo = string.Empty,
            szInfoTitle = string.Empty
        };
    }

    private nint WindowSubclassProc(
        nint hWnd,
        uint uMsg,
        nint wParam,
        nint lParam,
        nuint uIdSubclass,
        nuint dwRefData)
    {
        if (uMsg == WM_NCDESTROY)
        {
            RemoveWindowSubclass(hWnd, _subclassProc, uIdSubclass);
        }
        else if (uMsg == WM_APP_TRAY)
        {
            uint mouseMsg = (uint)(lParam.ToInt64() & 0xFFFF);
            if (mouseMsg is WM_LBUTTONUP or WM_LBUTTONDBLCLK or NIN_BALLOONUSERCLICK)
            {
                _window.DispatcherQueue.TryEnqueue(() =>
                {
                    ShowAndFocusWindow();
                    _onOpen();
                });
                return 0;
            }

            if (mouseMsg == WM_RBUTTONUP)
            {
                ShowContextMenu();
                return 0;
            }
        }

        return DefSubclassProc(hWnd, uMsg, wParam, lParam);
    }

    private void ShowContextMenu()
    {
        var menu = CreatePopupMenu();
        if (menu == 0) return;

        try
        {
            AppendMenuW(menu, MF_STRING, ID_OPEN, "Open Personal Assistant");
            AppendMenuW(menu, MF_STRING, ID_NEW_SESSION, "New Session");
            AppendMenuW(menu, MF_SEPARATOR, 0, string.Empty);
            AppendMenuW(menu, MF_STRING, ID_EXIT, "Exit");

            GetCursorPos(out var pt);
            SetForegroundWindow(_hwnd);

            uint cmd = TrackPopupMenuEx(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD, pt.X, pt.Y, _hwnd, 0);
            PostMessageW(_hwnd, WM_NULL, 0, 0);

            if (cmd == ID_OPEN)
            {
                _window.DispatcherQueue.TryEnqueue(() =>
                {
                    ShowAndFocusWindow();
                    _onOpen();
                });
            }
            else if (cmd == ID_NEW_SESSION)
            {
                _window.DispatcherQueue.TryEnqueue(() =>
                {
                    ShowAndFocusWindow();
                    _onNewSession();
                });
            }
            else if (cmd == ID_EXIT)
            {
                _window.DispatcherQueue.TryEnqueue(() => _onExit());
            }
        }
        finally
        {
            DestroyMenu(menu);
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            RemoveWindowSubclass(_hwnd, _subclassProc, 1);
        }
        catch
        {
            // Ignore shutdown subclass errors
        }

        if (_added)
        {
            var data = new NOTIFYICONDATA
            {
                cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(),
                hWnd = _hwnd,
                uID = 1,
                szTip = string.Empty,
                szInfo = string.Empty,
                szInfoTitle = string.Empty
            };
            Shell_NotifyIconW(NIM_DELETE, ref data);
            _added = false;
        }

        if (_hIcon != 0)
        {
            DestroyIcon(_hIcon);
            _hIcon = 0;
        }
    }

    private delegate nint SUBCLASSPROC(
        nint hWnd,
        uint uMsg,
        nint wParam,
        nint lParam,
        nuint uIdSubclass,
        nuint dwRefData);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public uint cbSize;
        public nint hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public nint hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szTip;
        public uint dwState;
        public uint dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szInfo;
        public uint uTimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public nint hBalloonIcon;
    }

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern bool SetWindowSubclass(
        nint hWnd,
        SUBCLASSPROC pfnSubclass,
        nuint uIdSubclass,
        nuint dwRefData);

    [DllImport("comctl32.dll")]
    private static extern bool RemoveWindowSubclass(
        nint hWnd,
        SUBCLASSPROC pfnSubclass,
        nuint uIdSubclass);

    [DllImport("comctl32.dll")]
    private static extern nint DefSubclassProc(
        nint hWnd,
        uint uMsg,
        nint wParam,
        nint lParam);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern bool Shell_NotifyIconW(uint dwMessage, ref NOTIFYICONDATA lpData);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint LoadImageW(
        nint hInst,
        string name,
        uint type,
        int cx,
        int cy,
        uint fuLoad);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(nint hIcon);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(nint hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(nint hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool PostMessageW(nint hWnd, uint msg, nint wParam, nint lParam);

    [DllImport("user32.dll")]
    private static extern nint CreatePopupMenu();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenuW(nint hMenu, uint uFlags, nuint uIDNewItem, string lpNewItem);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern uint TrackPopupMenuEx(
        nint hMenu,
        uint fuFlags,
        int x,
        int y,
        nint hwnd,
        nint lptpm);

    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(nint hMenu);
}
