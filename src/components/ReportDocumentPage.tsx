import { ArrowLeft, FileDown, Layers } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ConversationTurn } from '../types/workbench';
import {
  buildThreadHtmlDocument,
  type ThreadHtmlExchangeInput,
} from '../utils/eventParser';
import {
  formatShortYearMonth,
  getPromptDomainShortLabel,
} from '../utils/promptTemplates';

interface ReportDocumentPageProps {
  exchangeId: string;
  turns: ConversationTurn[];
  reportFilePath?: string;
  reportsDir?: string;
  isExternalFile?: boolean;
  onViewEventCards: (exchangeId: string) => void;
  onClose: () => void;
}

export function ReportDocumentPage({
  exchangeId,
  turns,
  reportFilePath,
  reportsDir,
  isExternalFile,
  onViewEventCards,
  onClose,
}: ReportDocumentPageProps) {
  const { rootQuestion, latestReply, exchanges } = useMemo(() => {
    const grouped: ThreadHtmlExchangeInput[] = [];
    const byId = new Map<string, ThreadHtmlExchangeInput>();
    let current: ThreadHtmlExchangeInput | null = null;
    let firstQ: ConversationTurn | null = null;
    let lastReply: ConversationTurn | null = null;

    for (const turn of turns) {
      if (turn.role === 'user') {
        if (!firstQ) firstQ = turn;
        current = {
          question: turn.content,
          replies: [],
          askedAt: turn.timestamp,
        };
        grouped.push(current);
        byId.set(turn.id, current);
      } else {
        if (turn.role === 'assistant') lastReply = turn;
        const target = turn.exchangeId ? byId.get(turn.exchangeId) : current;
        if (target) {
          target.replies.push(turn);
        }
      }
    }

    return {
      rootQuestion: firstQ,
      latestReply: lastReply,
      exchanges: grouped,
    };
  }, [turns]);

  const title = rootQuestion?.threadName?.trim() || 'Reference Report';

  const generatedHtml = useMemo(
    () =>
      isExternalFile
        ? latestReply?.htmlReport || ''
        : buildThreadHtmlDocument({
            title,
            exchanges,
            domain: rootQuestion?.promptDomain,
            month: rootQuestion?.threadMonth,
            year: rootQuestion?.threadYear,
            rating: rootQuestion?.threadRating,
            createdAt: latestReply?.timestamp || rootQuestion?.timestamp,
          }),
    [
      exchanges,
      isExternalFile,
      latestReply?.htmlReport,
      latestReply?.timestamp,
      rootQuestion?.promptDomain,
      rootQuestion?.threadMonth,
      rootQuestion?.threadRating,
      rootQuestion?.threadYear,
      rootQuestion?.timestamp,
      title,
    ],
  );

  const fallbackHtml = latestReply?.htmlReport || generatedHtml;
  const [diskHtml, setDiskHtml] = useState<string | null>(null);
  const [diskFilePath, setDiskFilePath] = useState<string | undefined>(reportFilePath);

  useEffect(() => {
    let cancelled = false;
    setDiskHtml(null);
    setDiskFilePath(reportFilePath);

    const query = reportsDir ? `?dir=${encodeURIComponent(reportsDir)}` : '';
    void fetch(`/api/reports/${encodeURIComponent(exchangeId)}/html${query}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { html?: string; filePath?: string };
      })
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.html === 'string' && data.html.trim().length > 0) {
          setDiskHtml(data.html);
        }
        if (typeof data.filePath === 'string' && data.filePath.trim()) {
          setDiskFilePath(data.filePath);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [exchangeId, reportFilePath, reportsDir]);

  const renderedHtml = diskHtml ?? fallbackHtml;

  const safeSlug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'reference-report';

  const handleDownload = () => {
    const blob = new Blob([renderedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeSlug}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shortPeriod = formatShortYearMonth(
    rootQuestion?.threadMonth,
    rootQuestion?.threadYear,
  );
  const metaParts = [
    shortPeriod || '',
    rootQuestion?.promptDomain
      ? getPromptDomainShortLabel(rootQuestion.promptDomain)
      : '',
    exchanges.length > 1 ? `${exchanges.length} turns` : '',
    latestReply
      ? isExternalFile
        ? latestReply.model
        : `${latestReply.scope === 'private' ? 'Private' : 'Public'} · ${latestReply.model}`
      : '',
  ].filter(Boolean);

  return (
    <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-slate-50/70 dark:bg-slate-950/60">
      {/* Document Toolbar */}
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200/85 dark:border-slate-800/85 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {title}
            </h1>
            {(metaParts.length > 0 || diskFilePath) && (
              <p
                title={diskFilePath}
                className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums"
              >
                {[...metaParts, diskFilePath || ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Document Actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {!isExternalFile && (
            <button
              type="button"
              onClick={() => onViewEventCards(exchangeId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" style={{ color: 'var(--pa-accent)' }} />
              <span>Event Cards</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </header>

      {/* Rendered Local HTML Report */}
      <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col overflow-hidden">
        <section className="flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white overflow-hidden shadow-sm">
          <iframe
            title={`${title} Report`}
            srcDoc={renderedHtml}
            sandbox="allow-same-origin"
            className="flex-1 w-full min-h-0 border-0 bg-white"
          />
        </section>
      </div>
    </main>
  );
}
