import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';

interface MessageContentProps {
  text: string;
  isUser?: boolean;
}

function renderInline(line: string): React.ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w)|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g;
  const parts = line.split(pattern);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-900/7 dark:bg-white/10 font-mono text-[0.86em] text-slate-800 dark:text-slate-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      return (
        <strong key={idx} className="font-semibold italic">
          {part.slice(3, -3)}
        </strong>
      );
    }
    if (
      ((part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))) &&
      part.length >= 4
    ) {
      return (
        <strong key={idx} className="font-semibold text-slate-950 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return (
        <del key={idx} className="opacity-70">
          {part.slice(2, -2)}
        </del>
      );
    }
    if (
      ((part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))) &&
      part.length >= 2
    ) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/);
    if (link) {
      return (
        <a
          key={idx}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-sky-500/60 underline-offset-2 text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
        >
          {renderInline(link[1])}
        </a>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-3.5 rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-950 text-slate-100 shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-800 text-slate-300 transition-colors whitespace-nowrap shrink-0"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): string[] | null {
  if (!line.includes('|') && !line.includes('-')) return null;
  const cells = parseTableCells(line);
  if (cells.length === 0) return null;
  if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  return cells;
}

function renderMarkdownSegment(segment: string, segKey: string): React.ReactNode[] {
  const lines = segment.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      nodes.push(
        <hr
          key={`${segKey}-hr-${i}`}
          className="my-4 border-t border-slate-200/80 dark:border-slate-700/70"
        />,
      );
      i += 1;
      continue;
    }

    // Heading (# .. ######)
    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].replace(/\s+#+\s*$/, '').trim();
      const headingClass =
        level === 1
          ? 'font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white pt-2 pb-0.5'
          : level === 2
            ? 'font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-2 pb-0.5'
            : level === 3
              ? 'font-display text-[15px] font-semibold text-slate-900 dark:text-slate-100 pt-1.5'
              : 'font-display text-sm font-semibold text-slate-800 dark:text-slate-200 pt-1';

      if (level === 1) {
        nodes.push(<h2 key={`${segKey}-h-${i}`} className={headingClass}>{renderInline(content)}</h2>);
      } else if (level === 2) {
        nodes.push(<h3 key={`${segKey}-h-${i}`} className={headingClass}>{renderInline(content)}</h3>);
      } else if (level === 3) {
        nodes.push(<h4 key={`${segKey}-h-${i}`} className={headingClass}>{renderInline(content)}</h4>);
      } else {
        nodes.push(<h5 key={`${segKey}-h-${i}`} className={headingClass}>{renderInline(content)}</h5>);
      }
      i += 1;
      continue;
    }

    // Markdown table
    if (i + 1 < lines.length && line.includes('|')) {
      const separatorCells = isTableSeparatorLine(lines[i + 1]);
      if (separatorCells) {
        const headers = parseTableCells(line);
        const alignments = separatorCells.map((cell) =>
          cell.startsWith(':') && cell.endsWith(':')
            ? 'text-center'
            : cell.endsWith(':')
              ? 'text-right'
              : 'text-left',
        );
        const rows: string[][] = [];
        let rowIdx = i + 2;
        while (rowIdx < lines.length && lines[rowIdx].trim().includes('|')) {
          rows.push(parseTableCells(lines[rowIdx]));
          rowIdx += 1;
        }
        nodes.push(
          <div
            key={`${segKey}-tbl-${i}`}
            className="my-3 overflow-x-auto rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/75 dark:bg-slate-900/50"
          >
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {headers.map((cell, cIdx) => (
                    <th
                      key={cIdx}
                      className={`px-3.5 py-2 font-semibold text-slate-800 dark:text-slate-100 ${alignments[cIdx] || 'text-left'}`}
                    >
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="odd:bg-transparent even:bg-slate-50/50 dark:even:bg-slate-800/30"
                  >
                    {headers.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3.5 py-2 align-top text-slate-700 dark:text-slate-200 ${alignments[cIdx] || 'text-left'}`}
                      >
                        {renderInline(row[cIdx] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        i = rowIdx;
        continue;
      }
    }

    // Blockquote
    if (/^\s{0,3}>\s?/.test(line)) {
      const quoteLines: string[] = [];
      let qIdx = i;
      while (qIdx < lines.length && /^\s{0,3}>\s?/.test(lines[qIdx])) {
        quoteLines.push(lines[qIdx].replace(/^\s{0,3}>\s?/, ''));
        qIdx += 1;
      }
      nodes.push(
        <blockquote
          key={`${segKey}-bq-${i}`}
          className="my-2.5 border-l-3 border-sky-400/70 dark:border-sky-500/60 bg-white/55 dark:bg-slate-900/40 rounded-r-xl px-4 py-2.5 text-slate-700 dark:text-slate-200 space-y-1.5"
        >
          {renderMarkdownSegment(quoteLines.join('\n'), `${segKey}-bq-${i}`)}
        </blockquote>,
      );
      i = qIdx;
      continue;
    }

    // Unordered list
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: Array<{ indent: number; text: string }> = [];
      let lIdx = i;
      while (lIdx < lines.length) {
        const cur = lines[lIdx];
        const m = cur.match(/^(\s*)[-*•]\s+(.*)$/);
        if (m) {
          items.push({ indent: m[1].length, text: m[2] });
          lIdx += 1;
        } else if (cur.trim() && items.length > 0 && /^\s{2,}\S/.test(cur)) {
          items[items.length - 1].text += ` ${cur.trim()}`;
          lIdx += 1;
        } else {
          break;
        }
      }
      nodes.push(
        <ul key={`${segKey}-ul-${i}`} className="list-disc pl-5 space-y-1.5 my-1">
          {items.map((item, idx) => (
            <li
              key={idx}
              style={item.indent >= 2 ? { marginLeft: '1rem' } : undefined}
              className="leading-relaxed"
            >
              {renderInline(item.text)}
            </li>
          ))}
        </ul>,
      );
      i = lIdx;
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: Array<{ indent: number; text: string }> = [];
      let lIdx = i;
      while (lIdx < lines.length) {
        const cur = lines[lIdx];
        const m = cur.match(/^(\s*)\d+[.)]\s+(.*)$/);
        if (m) {
          items.push({ indent: m[1].length, text: m[2] });
          lIdx += 1;
        } else if (cur.trim() && items.length > 0 && /^\s{2,}\S/.test(cur)) {
          items[items.length - 1].text += ` ${cur.trim()}`;
          lIdx += 1;
        } else {
          break;
        }
      }
      nodes.push(
        <ol key={`${segKey}-ol-${i}`} className="list-decimal pl-5 space-y-1.5 my-1">
          {items.map((item, idx) => (
            <li
              key={idx}
              style={item.indent >= 2 ? { marginLeft: '1rem' } : undefined}
              className="leading-relaxed"
            >
              {renderInline(item.text)}
            </li>
          ))}
        </ol>,
      );
      i = lIdx;
      continue;
    }

    // Paragraph (stop before next block construct)
    const paraLines: string[] = [];
    let pIdx = i;
    while (pIdx < lines.length) {
      const cur = lines[pIdx];
      if (!cur.trim()) break;
      if (
        /^\s{0,3}(?:#{1,6}\s+|>\s?|[-*•]\s+|\d+[.)]\s+|(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$)/.test(
          cur,
        )
      ) {
        break;
      }
      if (
        pIdx + 1 < lines.length &&
        cur.includes('|') &&
        isTableSeparatorLine(lines[pIdx + 1])
      ) {
        break;
      }
      paraLines.push(cur);
      pIdx += 1;
    }

    nodes.push(
      <p key={`${segKey}-p-${i}`} className="leading-[1.7] text-slate-800 dark:text-slate-100">
        {paraLines.map((pLine, lineIdx) => (
          <Fragment key={lineIdx}>
            {renderInline(pLine)}
            {lineIdx < paraLines.length - 1 && <br />}
          </Fragment>
        ))}
      </p>,
    );
    i = pIdx;
  }

  return nodes;
}

export function MessageContent({ text, isUser = false }: MessageContentProps) {
  if (isUser) {
    return <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{text}</p>;
  }

  const segments = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-[15px] leading-[1.7] text-slate-800 dark:text-slate-100">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const lines = segment.slice(3, -3).split('\n');
          const lang = (lines[0] || '').trim();
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();
          return <CodeBlock key={segIdx} lang={lang} code={code} />;
        }

        return (
          <Fragment key={segIdx}>
            {renderMarkdownSegment(segment, `seg-${segIdx}`)}
          </Fragment>
        );
      })}
    </div>
  );
}
