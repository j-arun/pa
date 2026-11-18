using Markdig;
using Markdig.Extensions.Tables;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Text;
using Windows.UI;

namespace FluentAssistantWorkbench.Controls;

public sealed class MarkdownPresenter : UserControl
{
    private static readonly MarkdownPipeline Pipeline =
        new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();

    private readonly StackPanel _blocksPanel = new() { Spacing = 8 };

    public static readonly DependencyProperty MarkdownProperty =
        DependencyProperty.Register(
            nameof(Markdown),
            typeof(string),
            typeof(MarkdownPresenter),
            new PropertyMetadata(string.Empty, OnMarkdownChanged));

    public string Markdown
    {
        get => (string)GetValue(MarkdownProperty);
        set => SetValue(MarkdownProperty, value);
    }

    public MarkdownPresenter()
    {
        Content = _blocksPanel;
        RegisterPropertyChangedCallback(Control.FontFamilyProperty, OnPresentationStyleChanged);
        RegisterPropertyChangedCallback(Control.FontSizeProperty, OnPresentationStyleChanged);
        RegisterPropertyChangedCallback(Control.FontWeightProperty, OnPresentationStyleChanged);
        RegisterPropertyChangedCallback(Control.ForegroundProperty, OnPresentationStyleChanged);
    }

    private static void OnMarkdownChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args)
    {
        ((MarkdownPresenter)sender).RenderMarkdown();
    }

    private static void OnPresentationStyleChanged(DependencyObject sender, DependencyProperty property)
    {
        ((MarkdownPresenter)sender).RenderMarkdown();
    }

    private void RenderMarkdown()
    {
        _blocksPanel.Children.Clear();
        if (string.IsNullOrEmpty(Markdown)) return;

        var document = Markdig.Markdown.Parse(Markdown, Pipeline);
        RenderBlocks(document, _blocksPanel);
    }

    private void RenderBlocks(ContainerBlock container, Panel panel)
    {
        foreach (var block in container)
        {
            switch (block)
            {
                case HeadingBlock heading:
                    AddInlineText(heading.Inline, panel, heading.Level);
                    break;
                case ParagraphBlock paragraph:
                    AddInlineText(paragraph.Inline, panel);
                    break;
                case FencedCodeBlock fencedCode:
                    AddCodeBlock(fencedCode, panel);
                    break;
                case CodeBlock code:
                    AddCodeBlock(code, panel);
                    break;
                case ListBlock list:
                    AddList(list, panel);
                    break;
                case Table table:
                    AddTable(table, panel);
                    break;
                case QuoteBlock quote:
                    AddQuote(quote, panel);
                    break;
                case ThematicBreakBlock:
                    panel.Children.Add(new Border
                    {
                        Height = 1,
                        Margin = new Thickness(0, 4, 0, 4),
                        Background = new SolidColorBrush(Color.FromArgb(80, 128, 128, 128))
                    });
                    break;
                case ContainerBlock nested:
                    RenderBlocks(nested, panel);
                    break;
                case LeafBlock leaf when leaf.Inline is not null:
                    AddInlineText(leaf.Inline, panel);
                    break;
                case LeafBlock leaf:
                    AddPlainText(leaf.Lines.ToString(), panel);
                    break;
            }
        }
    }

    private void AddInlineText(ContainerInline? inlines, Panel panel, int headingLevel = 0)
    {
        var textBlock = CreateTextBlock();
        if (headingLevel > 0)
        {
            textBlock.FontWeight = FontWeights.SemiBold;
            textBlock.FontSize *= headingLevel switch
            {
                1 => 1.5,
                2 => 1.3,
                3 => 1.15,
                _ => 1.05
            };
            textBlock.Margin = new Thickness(0, 4, 0, 0);
        }

        AppendInlines(inlines, textBlock.Inlines);
        panel.Children.Add(textBlock);
    }

    private TextBlock CreateTextBlock() => new()
    {
        FontFamily = FontFamily,
        FontSize = FontSize,
        FontWeight = FontWeight,
        Foreground = Foreground,
        TextWrapping = TextWrapping.Wrap,
        IsTextSelectionEnabled = true
    };

    private void AddPlainText(string text, Panel panel)
    {
        if (string.IsNullOrEmpty(text)) return;

        var textBlock = CreateTextBlock();
        textBlock.Text = text;
        panel.Children.Add(textBlock);
    }

    private void AddCodeBlock(CodeBlock code, Panel panel)
    {
        var codeText = new TextBlock
        {
            Text = code.Lines.ToString(),
            FontFamily = new FontFamily("Cascadia Code, Consolas"),
            FontSize = FontSize,
            Foreground = Foreground,
            TextWrapping = TextWrapping.Wrap,
            IsTextSelectionEnabled = true
        };

        panel.Children.Add(new Border
        {
            Padding = new Thickness(12, 9, 12, 9),
            CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(Color.FromArgb(24, 128, 128, 128)),
            BorderBrush = new SolidColorBrush(Color.FromArgb(70, 128, 128, 128)),
            BorderThickness = new Thickness(1),
            Child = codeText
        });
    }

    private void AddList(ListBlock list, Panel panel)
    {
        var listPanel = new StackPanel { Spacing = 6 };
        var itemIndex = 0;
        foreach (var item in list)
        {
            if (item is not ListItemBlock listItem) continue;

            var marker = list.IsOrdered
                ? $"{(listItem.Order > 0 ? listItem.Order : list.OrderedStart + itemIndex)}."
                : "\u2022";
            var row = new Grid { ColumnSpacing = 8 };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.Children.Add(new TextBlock
            {
                Text = marker,
                FontFamily = FontFamily,
                FontSize = FontSize,
                Foreground = Foreground,
                VerticalAlignment = VerticalAlignment.Top
            });

            var itemContent = new StackPanel { Spacing = 6 };
            RenderBlocks(listItem, itemContent);
            Grid.SetColumn(itemContent, 1);
            row.Children.Add(itemContent);
            listPanel.Children.Add(row);
            itemIndex++;
        }

        panel.Children.Add(listPanel);
    }

    private void AddTable(Table table, Panel panel)
    {
        var rows = table.OfType<TableRow>()
            .Select(row => (Row: row, Cells: row.OfType<TableCell>().ToList()))
            .ToList();
        if (rows.Count == 0) return;

        var columnCount = Math.Max(
            table.ColumnDefinitions?.Count ?? 0,
            rows.Max(row => row.Cells.Count));
        if (columnCount == 0) return;

        var grid = new Grid();
        for (var column = 0; column < columnCount; column++)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition
            {
                Width = new GridLength(1, GridUnitType.Star)
            });
        }

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var row = rows[rowIndex];
            for (var columnIndex = 0; columnIndex < row.Cells.Count; columnIndex++)
            {
                var cell = row.Cells[columnIndex];
                var cellContent = new StackPanel { Spacing = 4 };
                RenderBlocks(cell, cellContent);
                foreach (var textBlock in cellContent.Children.OfType<TextBlock>())
                {
                    textBlock.FontWeight = row.Row.IsHeader ? FontWeights.SemiBold : FontWeights.Normal;
                    textBlock.TextAlignment = GetTableCellAlignment(table, columnIndex);
                }

                var cellBorder = new Border
                {
                    Padding = new Thickness(10, 7, 10, 7),
                    BorderBrush = new SolidColorBrush(Color.FromArgb(70, 128, 128, 128)),
                    BorderThickness = new Thickness(0, 0, 1, 1),
                    Background = row.Row.IsHeader
                        ? new SolidColorBrush(Color.FromArgb(24, 128, 128, 128))
                        : null,
                    Child = cellContent
                };
                Grid.SetRow(cellBorder, rowIndex);
                Grid.SetColumn(cellBorder, columnIndex);
                if (cell.ColumnSpan > 1) Grid.SetColumnSpan(cellBorder, cell.ColumnSpan);
                if (cell.RowSpan > 1) Grid.SetRowSpan(cellBorder, cell.RowSpan);
                grid.Children.Add(cellBorder);
            }
        }

        panel.Children.Add(grid);
    }

    private static TextAlignment GetTableCellAlignment(Table table, int columnIndex)
    {
        var alignment = table.ColumnDefinitions?.ElementAtOrDefault(columnIndex)?.Alignment;
        return alignment switch
        {
            TableColumnAlign.Center => TextAlignment.Center,
            TableColumnAlign.Right => TextAlignment.Right,
            _ => TextAlignment.Left
        };
    }

    private void AddQuote(QuoteBlock quote, Panel panel)
    {
        var quoteContent = new StackPanel { Spacing = 6 };
        RenderBlocks(quote, quoteContent);
        panel.Children.Add(new Border
        {
            Padding = new Thickness(12, 4, 0, 4),
            BorderBrush = new SolidColorBrush(Color.FromArgb(180, 14, 165, 233)),
            BorderThickness = new Thickness(3, 0, 0, 0),
            Child = quoteContent
        });
    }

    private void AppendInlines(ContainerInline? container, InlineCollection target)
    {
        for (var inline = container?.FirstChild; inline is not null; inline = inline.NextSibling)
        {
            switch (inline)
            {
                case LiteralInline literal:
                    target.Add(new Run { Text = literal.Content.ToString() });
                    break;
                case HtmlEntityInline entity:
                    target.Add(new Run { Text = entity.Transcoded.ToString() });
                    break;
                case CodeInline code:
                    target.Add(new Run
                    {
                        Text = code.Content.ToString(),
                        FontFamily = new FontFamily("Cascadia Code, Consolas")
                    });
                    break;
                case EmphasisInline emphasis:
                    Span styled = emphasis.DelimiterCount > 1 ? new Bold() : new Italic();
                    AppendInlines(emphasis, styled.Inlines);
                    target.Add(styled);
                    break;
                case LinkInline link:
                    AddLink(link, target);
                    break;
                case AutolinkInline autolink:
                    AddAutolink(autolink, target);
                    break;
                case LineBreakInline:
                    target.Add(new LineBreak());
                    break;
                case HtmlInline html:
                    target.Add(new Run { Text = html.Tag });
                    break;
                case ContainerInline nested:
                    AppendInlines(nested, target);
                    break;
            }
        }
    }

    private void AddLink(LinkInline link, InlineCollection target)
    {
        var linkUrl = Convert.ToString(link.Url) ?? string.Empty;
        if (!link.IsImage && Uri.TryCreate(linkUrl, UriKind.Absolute, out var uri) &&
            uri.Scheme is "http" or "https" or "mailto")
        {
            var hyperlink = new Hyperlink { NavigateUri = uri };
            AppendInlines(link, hyperlink.Inlines);
            target.Add(hyperlink);
            return;
        }

        if (link.FirstChild is not null)
        {
            AppendInlines(link, target);
        }
        else
        {
            target.Add(new Run { Text = linkUrl });
        }
    }

    private static void AddAutolink(AutolinkInline autolink, InlineCollection target)
    {
        var linkUrl = Convert.ToString(autolink.Url) ?? string.Empty;
        if (Uri.TryCreate(linkUrl, UriKind.Absolute, out var uri) &&
            uri.Scheme is "http" or "https" or "mailto")
        {
            var hyperlink = new Hyperlink { NavigateUri = uri };
            hyperlink.Inlines.Add(new Run { Text = linkUrl });
            target.Add(hyperlink);
            return;
        }

        target.Add(new Run { Text = linkUrl });
    }
}
