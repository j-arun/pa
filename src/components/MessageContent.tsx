import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';

interface MessageContentProps {
  text: string;
  isUser?: boolean;
}

function renderInline(line: string): React.ReactNode[] {
  const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-900/8 dark:bg-white/10 font-mono text-[0.86em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
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
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-800 text-slate-300 transition-colors whitespace-nowrap shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MessageContent({ text, isUser = false }: MessageContentProps) {
  if (isUser) {
    return <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{text}</p>;
  }

  const segments = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const lines = segment.slice(3, -3).split('\n');
          const lang = (lines[0] || '').trim();
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();
          return <CodeBlock key={segIdx} lang={lang} code={code} />;
        }

        const blocks = segment
          .split(/\n{2,}/)
          .map((b) => b.trim())
          .filter(Boolean);

        return blocks.map((block, bIdx) => {
          const lines = block.split('\n');
          const isUnorderedList = lines.every((l) => /^\s*[-*]\s+/.test(l));
          const isOrderedList = lines.every((l) => /^\s*\d+\.\s+/.test(l));

          if (isUnorderedList) {
            return (
              <ul key={`${segIdx}-${bIdx}`} className="list-disc pl-5 space-y-1">
                {lines.map((line, liIdx) => (
                  <li key={liIdx}>{renderInline(line.replace(/^\s*[-*]\s+/, ''))}</li>
                ))}
              </ul>
            );
          }

          if (isOrderedList) {
            return (
              <ol key={`${segIdx}-${bIdx}`} className="list-decimal pl-5 space-y-1">
                {lines.map((line, liIdx) => (
                  <li key={liIdx}>{renderInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>
                ))}
              </ol>
            );
          }

          if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
            const cleaned = lines[0].replace(/^#{1,3}\s+/, '');
            return (
              <h4 key={`${segIdx}-${bIdx}`} className="font-display font-semibold text-base pt-1">
                {renderInline(cleaned)}
              </h4>
            );
          }

          return (
            <p key={`${segIdx}-${bIdx}`} className="whitespace-pre-wrap">
              {lines.map((line, lineIdx) => (
                <Fragment key={lineIdx}>
                  {renderInline(line)}
                  {lineIdx < lines.length - 1 && <br />}
                </Fragment>
              ))}
            </p>
          );
        });
      })}
    </div>
  );
}
