import type { ConversationTurn } from '../types/workbench';
import {
  THREAD_RATING_OPTIONS,
  formatThreadDisplayTitle,
  getPromptDomainShortLabel,
} from './promptTemplates';

interface PdfLine {
  text: string;
  bold: boolean;
  fontSize: number;
  lineHeight: number;
  gapBefore?: number;
}

interface PositionedLine {
  text: string;
  bold: boolean;
  fontSize: number;
  y: number;
}

export interface ConversationExchangeExport {
  questionHeader: string;
  questionText: string;
  replyHeader?: string;
  replyText?: string;
}

export function groupTurnsForExport(turns: ConversationTurn[]): ConversationExchangeExport[] {
  const result: ConversationExchangeExport[] = [];
  let current: ConversationExchangeExport | null = null;
  let threadCounter = 0;

  for (const turn of turns) {
    const timeLabel = new Date(turn.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (turn.role === 'user' || !current) {
      if (turn.role === 'user') {
        threadCounter += 1;
      }
      const combinedTitle = formatThreadDisplayTitle({
        domain: turn.promptDomain,
        month: turn.threadMonth,
        year: turn.threadYear,
        fallbackNumber: Math.max(1, threadCounter),
      });
      const ratingMeta = turn.threadRating
        ? THREAD_RATING_OPTIONS.find((item) => item.id === turn.threadRating)
        : undefined;
      const metaParts = [
        combinedTitle,
        turn.threadName?.trim() || '',
        turn.promptDomain ? `Domain: ${getPromptDomainShortLabel(turn.promptDomain)}` : '',
        ratingMeta ? `Rating: ${ratingMeta.label} (${ratingMeta.description})` : '',
      ].filter(Boolean);
      const baseHeader =
        turn.role === 'user' ? `You | ${timeLabel}` : `Prompt | ${timeLabel}`;
      current = {
        questionHeader:
          turn.role === 'user' && metaParts.length > 0
            ? `${metaParts.join(' | ')} -- ${baseHeader}`
            : baseHeader,
        questionText: turn.role === 'user' ? turn.content : '',
      };
      if (turn.role !== 'user') {
        current.replyHeader = `${turn.scope === 'private' ? 'Private' : 'Public'} | ${timeLabel}`;
        current.replyText = turn.content;
      }
      result.push(current);
    } else {
      current.replyHeader =
        turn.role === 'error'
          ? `Error | ${timeLabel}`
          : `${turn.scope === 'private' ? 'Private' : 'Public'} | ${timeLabel}`;
      current.replyText = turn.content;
      current = null;
    }
  }

  return result;
}

function sanitizeAscii(input: string): string {
  const replaced = input
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, '|')
    .replace(/\t/g, '    ');

  let out = '';
  for (let i = 0; i < replaced.length; i += 1) {
    const code = replaced.charCodeAt(i);
    out += code >= 32 && code <= 126 ? replaced[i] : ' ';
  }
  return out;
}

function wrapParagraphs(raw: string, maxChars: number): string[] {
  const paragraphs = (raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const wrapped: string[] = [];

  for (const para of paragraphs) {
    const clean = sanitizeAscii(para).trimEnd();
    if (!clean) {
      wrapped.push(' ');
      continue;
    }

    let idx = 0;
    while (idx < clean.length) {
      const remaining = clean.length - idx;
      if (remaining <= maxChars) {
        wrapped.push(clean.slice(idx));
        break;
      }
      let split = clean.lastIndexOf(' ', idx + maxChars);
      if (split <= idx) {
        split = idx + maxChars;
      }
      wrapped.push(clean.slice(idx, split).trimEnd());
      idx = split;
      while (idx < clean.length && clean[idx] === ' ') idx += 1;
    }
  }

  return wrapped;
}

function escapePdfString(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfBytes(turns: ConversationTurn[]): Uint8Array {
  const exchanges = groupTurnsForExport(turns);
  const lines: PdfLine[] = [
    { text: 'Personal Assistant Conversation', bold: true, fontSize: 16, lineHeight: 22 },
    { text: `Exported ${new Date().toLocaleString()}`, bold: false, fontSize: 10, lineHeight: 16 },
    { text: '-'.repeat(72), bold: false, fontSize: 10, lineHeight: 14 },
  ];

  if (exchanges.length === 0) {
    lines.push({ text: 'No conversation messages recorded yet.', bold: false, fontSize: 11, lineHeight: 16, gapBefore: 8 });
  } else {
    for (const ex of exchanges) {
      lines.push({ text: ex.questionHeader, bold: true, fontSize: 11, lineHeight: 15, gapBefore: 10 });
      for (const w of wrapParagraphs(ex.questionText, 86)) {
        lines.push({ text: w, bold: false, fontSize: 10, lineHeight: 14 });
      }
      if (ex.replyText) {
        lines.push({
          text: ex.replyHeader || 'Assistant',
          bold: true,
          fontSize: 11,
          lineHeight: 15,
          gapBefore: 6,
        });
        for (const w of wrapParagraphs(ex.replyText, 86)) {
          lines.push({ text: w, bold: false, fontSize: 10, lineHeight: 14 });
        }
      }
      lines.push({ text: '', bold: false, fontSize: 10, lineHeight: 8 });
    }
  }

  const startY = 740;
  const minY = 56;
  const pages: PositionedLine[][] = [];
  let current: PositionedLine[] = [];
  let y = startY;

  for (const line of lines) {
    const needed = (line.gapBefore || 0) + line.lineHeight;
    if (y - needed < minY && current.length > 0) {
      pages.push(current);
      current = [];
      y = startY;
    }
    y -= line.gapBefore || 0;
    if (line.text) {
      current.push({ text: line.text, bold: line.bold, fontSize: line.fontSize, y });
    }
    y -= line.lineHeight;
  }
  if (current.length > 0 || pages.length === 0) {
    pages.push(current);
  }

  const pageIds = pages.map((_, i) => 5 + i * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  pages.forEach((pageLines, i) => {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );

    const streamParts = ['BT'];
    for (const item of pageLines) {
      streamParts.push(`${item.bold ? '/F2' : '/F1'} ${item.fontSize} Tf`);
      streamParts.push(`1 0 0 1 48 ${item.y} Tm`);
      streamParts.push(`(${escapePdfString(item.text)}) Tj`);
    }
    streamParts.push('/F1 9 Tf');
    streamParts.push('1 0 0 1 48 28 Tm');
    streamParts.push(`(Page ${i + 1} of ${pages.length}) Tj`);
    streamParts.push('ET');
    const streamStr = `${streamParts.join('\n')}\n`;
    objects.push(`<< /Length ${streamStr.length} >>\nstream\n${streamStr}endstream`);
  });

  const chunks: string[] = ['%PDF-1.4\n'];
  let byteOffset = chunks[0].length;
  const offsets: number[] = [0];

  objects.forEach((obj, idx) => {
    offsets.push(byteOffset);
    const block = `${idx + 1} 0 obj\n${obj}\nendobj\n`;
    chunks.push(block);
    byteOffset += block.length;
  });

  const xrefStart = byteOffset;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i += 1) {
    chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const encoder = new TextEncoder();
  return encoder.encode(chunks.join(''));
}

export async function exportConversationToPdf(turns: ConversationTurn[]): Promise<void> {
  const bytes = buildPdfBytes(turns);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const suggestedName = `PersonalAssistant-Conversation-${stamp}.pdf`;

  const win = window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (win.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      // Fall back to direct browser download if cancelled/blocked
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}
