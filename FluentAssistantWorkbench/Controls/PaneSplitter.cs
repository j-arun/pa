using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;
using Windows.UI;

namespace FluentAssistantWorkbench.Controls;

public sealed class PaneSplitter : Grid
{
    private readonly Border _gripBar;
    private bool _isDragging;
    private Point _dragStartPoint;

    public static readonly DependencyProperty ResizeDirectionProperty =
        DependencyProperty.Register(
            nameof(ResizeDirection),
            typeof(Orientation),
            typeof(PaneSplitter),
            new PropertyMetadata(Orientation.Vertical, OnResizeDirectionChanged));

    public Orientation ResizeDirection
    {
        get => (Orientation)GetValue(ResizeDirectionProperty);
        set => SetValue(ResizeDirectionProperty, value);
    }

    public event EventHandler? DragStarted;
    public event EventHandler<double>? DragDelta;

    public PaneSplitter()
    {
        Background = new SolidColorBrush(Colors.Transparent);

        _gripBar = new Border
        {
            CornerRadius = new CornerRadius(2),
            Background = new SolidColorBrush(ColorHelper.FromArgb(90, 148, 163, 184)),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        Children.Add(_gripBar);

        ApplyDirectionVisuals();

        PointerEntered += (_, _) => UpdateGripHighlight(isHovered: true);
        PointerExited += (_, _) =>
        {
            if (!_isDragging) UpdateGripHighlight(isHovered: false);
        };
        PointerPressed += OnSplitterPointerPressed;
        PointerMoved += OnSplitterPointerMoved;
        PointerReleased += OnSplitterPointerReleased;
        PointerCanceled += OnSplitterPointerReleased;
        PointerCaptureLost += OnSplitterPointerReleased;
    }

    private static void OnResizeDirectionChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is PaneSplitter splitter)
        {
            splitter.ApplyDirectionVisuals();
        }
    }

    private void ApplyDirectionVisuals()
    {
        if (ResizeDirection == Orientation.Vertical)
        {
            // Vertical splitter divider: dragged Left/Right
            _gripBar.Width = 3;
            _gripBar.Height = 36;
            ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeWestEast);
        }
        else
        {
            // Horizontal splitter divider: dragged Up/Down
            _gripBar.Width = 44;
            _gripBar.Height = 3;
            ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeNorthSouth);
        }
    }

    private void UpdateGripHighlight(bool isHovered)
    {
        if (_isDragging)
        {
            _gripBar.Background = new SolidColorBrush(ColorHelper.FromArgb(230, 56, 189, 248));
        }
        else if (isHovered)
        {
            _gripBar.Background = new SolidColorBrush(ColorHelper.FromArgb(180, 14, 165, 233));
        }
        else
        {
            _gripBar.Background = new SolidColorBrush(ColorHelper.FromArgb(90, 148, 163, 184));
        }
    }

    private void OnSplitterPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        var props = e.GetCurrentPoint(this).Properties;
        if (!props.IsLeftButtonPressed) return;

        _isDragging = true;
        _dragStartPoint = e.GetCurrentPoint(null).Position;
        CapturePointer(e.Pointer);
        UpdateGripHighlight(isHovered: true);
        DragStarted?.Invoke(this, EventArgs.Empty);
        e.Handled = true;
    }

    private void OnSplitterPointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (!_isDragging) return;

        var current = e.GetCurrentPoint(null).Position;
        double delta = ResizeDirection == Orientation.Vertical
            ? current.X - _dragStartPoint.X
            : current.Y - _dragStartPoint.Y;

        DragDelta?.Invoke(this, delta);
        e.Handled = true;
    }

    private void OnSplitterPointerReleased(object sender, PointerRoutedEventArgs e)
    {
        if (!_isDragging) return;
        _isDragging = false;
        ReleasePointerCapture(e.Pointer);
        UpdateGripHighlight(isHovered: false);
    }
}
