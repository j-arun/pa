using System.Globalization;
using System.Text;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Services;

public static class ConversationPdfExporter
{
    private const int PageWidth = 612;
    private const int PageHeight = 792;
    private const int MarginLeft = 48;
    private const int StartY = 740;
    private const int MinY = 56;
    private const int MaxCharsPerLine = 86;

    private sealed record PdfLine(string Text, bool IsBold, int FontSize, int LineHeight, int GapBefore = 0);

    public static byte[] ExportExchangesToPdf(IEnumerable<ConversationExchange> exchanges)
    {
        var items = exchanges.ToList();
        var lines = new List<PdfLine>
        {
            new("Personal Assistant Conversation", true, 16, 22),
            new($"Exported {DateTime.Now:f}", false, 10, 16),
            new(new string('-', 72), false, 10, 14)
        };

        if (items.Count == 0)
        {
            lines.Add(new("No conversation messages recorded yet.", false, 11, 16, 8));
        }
        else
        {
            foreach (var ex in items)
            {
                lines.Add(new(ex.QuestionHeaderLabel, true, 11, 15, 10));
                foreach (var wrapped in WrapParagraphs(ex.QuestionContent, MaxCharsPerLine))
                {
                    lines.Add(new(wrapped, false, 10, 14));
                }

                if (!string.IsNullOrWhiteSpace(ex.ReplyContent))
                {
                    lines.Add(new(ex.ReplyHeaderLabel, true, 11, 15, 6));
                    foreach (var wrapped in WrapParagraphs(ex.ReplyContent, MaxCharsPerLine))
                    {
                        lines.Add(new(wrapped, false, 10, 14));
                    }
                }

                lines.Add(new(string.Empty, false, 10, 8));
            }
        }

        var pages = Paginate(lines);
        return BuildPdfDocument(pages);
    }

    private static List<List<(string Text, bool IsBold, int FontSize, int Y)>> Paginate(List<PdfLine> lines)
    {
        var pages = new List<List<(string Text, bool IsBold, int FontSize, int Y)>>();
        var current = new List<(string Text, bool IsBold, int FontSize, int Y)>();
        int y = StartY;

        foreach (var line in lines)
        {
            int needed = line.GapBefore + line.LineHeight;
            if (y - needed < MinY && current.Count > 0)
            {
                pages.Add(current);
                current = [];
                y = StartY;
            }

            y -= line.GapBefore;
            if (!string.IsNullOrEmpty(line.Text))
            {
                current.Add((line.Text, line.IsBold, line.FontSize, y));
            }
            y -= line.LineHeight;
        }

        if (current.Count > 0 || pages.Count == 0)
        {
            pages.Add(current);
        }

        return pages;
    }

    private static byte[] BuildPdfDocument(List<List<(string Text, bool IsBold, int FontSize, int Y)>> pages)
    {
        // Objects:
        // 1: Catalog
        // 2: Pages
        // 3: Helvetica Regular font
        // 4: Helvetica Bold font
        // For each page i: Page object = 5 + i*2, Content stream = 6 + i*2
        var objects = new List<byte[]>();
        var pageObjectIds = new List<int>();
        for (int i = 0; i < pages.Count; i++)
        {
            pageObjectIds.Add(5 + i * 2);
        }

        objects.Add(Encoding.ASCII.GetBytes("<< /Type /Catalog /Pages 2 0 R >>"));
        var kids = string.Join(" ", pageObjectIds.Select(id => $"{id} 0 R"));
        objects.Add(Encoding.ASCII.GetBytes($"<< /Type /Pages /Kids [{kids}] /Count {pages.Count} >>"));
        objects.Add(Encoding.ASCII.GetBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
        objects.Add(Encoding.ASCII.GetBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"));

        for (int i = 0; i < pages.Count; i++)
        {
            int pageId = 5 + i * 2;
            int contentId = pageId + 1;
            objects.Add(Encoding.ASCII.GetBytes(
                $"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PageWidth} {PageHeight}] " +
                $"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {contentId} 0 R >>"));

            var streamSb = new StringBuilder();
            streamSb.AppendLine("BT");
            foreach (var item in pages[i])
            {
                var fontRef = item.IsBold ? "/F2" : "/F1";
                streamSb.AppendLine($"{fontRef} {item.FontSize} Tf");
                streamSb.AppendLine($"1 0 0 1 {MarginLeft} {item.Y} Tm");
                streamSb.AppendLine($"({EscapePdfString(item.Text)}) Tj");
            }
            streamSb.AppendLine("/F1 9 Tf");
            streamSb.AppendLine($"1 0 0 1 {MarginLeft} 28 Tm");
            streamSb.AppendLine($"(Page {i + 1} of {pages.Count}) Tj");
            streamSb.AppendLine("ET");

            var streamBytes = Encoding.ASCII.GetBytes(streamSb.ToString());
            var header = Encoding.ASCII.GetBytes($"<< /Length {streamBytes.Length} >>\nstream\n");
            var footer = Encoding.ASCII.GetBytes("endstream");
            var full = new byte[header.Length + streamBytes.Length + footer.Length];
            Buffer.BlockCopy(header, 0, full, 0, header.Length);
            Buffer.BlockCopy(streamBytes, 0, full, header.Length, streamBytes.Length);
            Buffer.BlockCopy(footer, 0, full, header.Length + streamBytes.Length, footer.Length);
            objects.Add(full);
        }

        using var ms = new MemoryStream();
        var offsets = new List<long> { 0 };
        WriteAscii(ms, "%PDF-1.4\n");

        for (int i = 0; i < objects.Count; i++)
        {
            offsets.Add(ms.Position);
            WriteAscii(ms, $"{i + 1} 0 obj\n");
            ms.Write(objects[i], 0, objects[i].Length);
            WriteAscii(ms, "\nendobj\n");
        }

        long xrefStart = ms.Position;
        WriteAscii(ms, $"xref\n0 {objects.Count + 1}\n");
        WriteAscii(ms, "0000000000 65535 f \n");
        for (int i = 1; i < offsets.Count; i++)
        {
            WriteAscii(ms, string.Format(CultureInfo.InvariantCulture, "{0:0000000000} 00000 n \n", offsets[i]));
        }

        WriteAscii(ms, $"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefStart}\n%%EOF");
        return ms.ToArray();
    }

    private static void WriteAscii(Stream stream, string text)
    {
        var bytes = Encoding.ASCII.GetBytes(text);
        stream.Write(bytes, 0, bytes.Length);
    }

    private static IEnumerable<string> WrapParagraphs(string raw, int maxChars)
    {
        var normalized = (raw ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n');
        var paragraphs = normalized.Split('\n');
        foreach (var para in paragraphs)
        {
            var clean = SanitizeAscii(para).TrimEnd();
            if (clean.Length == 0)
            {
                yield return " ";
                continue;
            }

            int idx = 0;
            while (idx < clean.Length)
            {
                int remaining = clean.Length - idx;
                if (remaining <= maxChars)
                {
                    yield return clean[idx..];
                    break;
                }

                int split = clean.LastIndexOf(' ', idx + maxChars, maxChars);
                if (split <= idx)
                {
                    split = idx + maxChars;
                }

                yield return clean[idx..split].TrimEnd();
                idx = split;
                while (idx < clean.Length && clean[idx] == ' ') idx++;
            }
        }
    }

    private static string SanitizeAscii(string input)
    {
        var replaced = input
            .Replace("\u2014", "--")
            .Replace("\u2013", "-")
            .Replace("\u2018", "'")
            .Replace("\u2019", "'")
            .Replace("\u201C", "\"")
            .Replace("\u201D", "\"")
            .Replace("\u2022", "*")
            .Replace("\u00B7", "|")
            .Replace("\t", "    ");

        var sb = new StringBuilder(replaced.Length);
        foreach (var ch in replaced)
        {
            sb.Append(ch >= 32 && ch <= 126 ? ch : ' ');
        }
        return sb.ToString();
    }

    private static string EscapePdfString(string input)
    {
        return input
            .Replace("\\", "\\\\")
            .Replace("(", "\\(")
            .Replace(")", "\\)");
    }
}
