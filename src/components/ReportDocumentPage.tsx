import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  FileDown,
  Layers,
  Loader2,
  MessageSquare,
  MessageSquareText,
  Pencil,
  Search,
  Sparkles,
  Table2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ConversationTurn } from '../types/workbench';
import {
  buildThreadHtmlDocument,
  extractReportTimelineTablesFromHtml,
  extractReportTimelineTablesFromMarkdown,
  type ReportMatrixTable,
  type ThreadHtmlExchangeInput,
} from '../utils/eventParser';
import {
  formatShortYearMonth,
  getPromptDomainShortLabel,
  THREAD_RATING_OPTIONS,
} from '../utils/promptTemplates';

interface ReportDocumentPageProps {
  exchangeId: string;
  turns: ConversationTurn[];
  reportFilePath?: string;
  reportsDir?: string;
  isExternalFile?: boolean;
  comment?: string;
  isSyncing?: boolean;
  isSynced?: boolean;
  onSyncReport?: (exchangeId: string) => void;
  onUpdateComment?: (exchangeId: string, comment: string) => void;
  onViewEventCards: (exchangeId: string) => void;
  onClose: () => void;
}

function getProviderLabel(turn: ConversationTurn, isExternalFile?: boolean): string {
  if (isExternalFile) return turn.model;
  const scopeLabel =
    turn.scope === 'private'
      ? 'Private · Ollama'
      : `Public · ${
          turn.adapterId === 'claude'
            ? 'Claude'
            : turn.adapterId === 'fable'
              ? 'Fable'
              : turn.adapterId === 'chatgpt'
                ? 'ChatGPT'
                : 'Gemini'
        }`;
  return `${scopeLabel} · ${turn.model}`;
}

function isRatingColumn(header: string): boolean {
  return /\b(prob|likel|rating|chance|conf|score|tier|certainty|strength)\b/i.test(
    header,
  );
}

function isDateColumn(header: string): boolean {
  return /\b(date|when|window|time|period|timeline|schedule|duration|range)\b/i.test(
    header,
  );
}

function isTitleColumn(header: string, colIdx: number): boolean {
  if (/\b(event|title|milestone|headline|topic|area|focus)\b/i.test(header)) {
    return true;
  }
  return colIdx === 0 && !/^(#|no\.?|id)$/i.test(header.trim());
}

function isIndexColumn(header: string): boolean {
  return /^(#|no\.?|id|sl\.?\s*no\.?)$/i.test(header.trim());
}

function getProbabilityBadgeClasses(value: string): string {
  const lower = value.toLowerCase();
  const pctMatch = value.match(/(\d{1,3})\s*%/);
  const pct = pctMatch ? Number(pctMatch[1]) : undefined;

  if (
    /\b(high(?:ly)?\s*likely|very\s*high|high|strong|certain|definite)\b/.test(lower) ||
    (pct !== undefined && pct >= 75)
  ) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/90 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70';
  }
  if (
    /\b(mostly\s*likely|moderate|medium|likely|probable|good)\b/.test(lower) ||
    (pct !== undefined && pct >= 50)
  ) {
    return 'bg-amber-50 text-amber-800 border-amber-200/90 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
}

function parseSortableValue(raw: string): { kind: 'number' | 'date' | 'text'; val: number | string } {
  const trimmed = raw.trim();
  const pctMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    return { kind: 'number', val: Number(pctMatch[1]) };
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { kind: 'number', val: Number(trimmed) };
  }
  const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const ms = Date.parse(isoMatch[1]);
    if (Number.isFinite(ms)) return { kind: 'date', val: ms };
  }
  return { kind: 'text', val: trimmed.toLowerCase() };
}

function RichMatrixTable({ table }: { table: ReportMatrixTable }) {
  const [filterQuery, setFilterQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(colIdx);
      setSortDir('asc');
    }
  };

  const processedRows = useMemo(() => {
    const needle = filterQuery.trim().toLowerCase();
    const filtered = needle
      ? table.rows.filter((row) =>
          row.some((cell) => cell.toLowerCase().includes(needle)),
        )
      : table.rows;

    if (sortCol === null) return filtered;

    return [...filtered].sort((a, b) => {
      const av = parseSortableValue(a[sortCol] || '');
      const bv = parseSortableValue(b[sortCol] || '');
      let cmp = 0;
      if (av.kind === bv.kind && (av.kind === 'number' || av.kind === 'date')) {
        cmp = (av.val as number) - (bv.val as number);
      } else {
        cmp = String(av.val).localeCompare(String(bv.val));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filterQuery, sortCol, sortDir, table.rows]);

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 shadow-xs overflow-hidden">
      {/* Table Card Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200/85 dark:border-slate-700 shadow-2xs shrink-0"
            style={{ color: 'var(--pa-accent)' }}
          >
            <Table2 className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {table.title}
            </h3>
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-200/75 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
            {processedRows.length === table.rows.length
              ? `${table.rows.length} row${table.rows.length === 1 ? '' : 's'}`
              : `${processedRows.length} / ${table.rows.length}`}
          </span>
        </div>

        {table.rows.length >= 5 && (
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter rows…"
              aria-label={`Filter ${table.title}`}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/70 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--pa-accent)]"
            />
          </div>
        )}
      </div>

      {/* Responsive Data Table */}
      <div className="overflow-x-auto fluent-scroll">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              {table.headers.map((header, colIdx) => {
                const isSorted = sortCol === colIdx;
                return (
                  <th
                    key={`${header}-${colIdx}`}
                    scope="col"
                    className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none whitespace-nowrap"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(colIdx)}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
                    >
                      <span>{header || `Column ${colIdx + 1}`}</span>
                      {isSorted ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="w-3 h-3" style={{ color: 'var(--pa-accent)' }} />
                        ) : (
                          <ArrowDown className="w-3 h-3" style={{ color: 'var(--pa-accent)' }} />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-35" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {processedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, table.headers.length)}
                  className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400"
                >
                  No rows match &ldquo;{filterQuery}&rdquo;.
                </td>
              </tr>
            ) : (
              processedRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-slate-100/60 dark:hover:bg-slate-800/45 transition-colors align-top"
                >
                  {row.map((cell, colIdx) => {
                    const header = table.headers[colIdx] || '';
                    const trimmed = cell.trim();
                    const ratingCol = isRatingColumn(header);
                    const dateCol = isDateColumn(header);
                    const indexCol = isIndexColumn(header);
                    const titleCol = isTitleColumn(header, colIdx);

                    return (
                      <td
                        key={colIdx}
                        className={`px-4 py-3.5 text-xs sm:text-[13px] leading-relaxed ${
                          indexCol
                            ? 'w-12 text-slate-400 dark:text-slate-500 font-mono tabular-nums whitespace-nowrap'
                            : dateCol
                              ? 'text-slate-700 dark:text-slate-200 font-medium tabular-nums min-w-[130px]'
                              : titleCol
                                ? 'font-semibold text-slate-900 dark:text-slate-100 min-w-[170px]'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {ratingCol && trimmed ? (
                          <span
                            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold tabular-nums whitespace-nowrap ${getProbabilityBadgeClasses(trimmed)}`}
                          >
                            {trimmed}
                          </span>
                        ) : dateCol && trimmed ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 px-2.5 py-1 text-[11.5px] font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{trimmed}</span>
                          </span>
                        ) : (
                          <span>{trimmed || '—'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportDocumentPage({
  exchangeId,
  turns,
  reportFilePath,
  reportsDir,
  isExternalFile,
  comment,
  isSyncing = false,
  isSynced = false,
  onSyncReport,
  onUpdateComment,
  onViewEventCards,
  onClose,
}: ReportDocumentPageProps) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
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

  // Complete full HTML report (all sections intact) for downloading
  const renderedHtml = diskHtml ?? fallbackHtml;

  // Structured per-exchange timeline matrix tables for in-app React UI
  const exchangeViews = useMemo(() => {
    if (isExternalFile) {
      const htmlTables = extractReportTimelineTablesFromHtml(renderedHtml);
      return [
        {
          label: 'Report Matrix',
          question: rootQuestion?.content || '',
          askedAt: rootQuestion?.timestamp,
          replyBlocks: [
            {
              id: 'external-html',
              providerLabel: latestReply
                ? getProviderLabel(latestReply, true)
                : 'HTML Report',
              tables: htmlTables,
            },
          ],
        },
      ];
    }

    return exchanges.map((ex, idx) => {
      const assistantReplies = ex.replies.filter((t) => t.role === 'assistant');
      return {
        label: idx === 0 ? 'Initial Question' : `Follow-up #${idx}`,
        question: ex.question,
        askedAt: ex.askedAt,
        replyBlocks: assistantReplies.map((reply) => ({
          id: reply.id,
          providerLabel: getProviderLabel(reply, false),
          tables: extractReportTimelineTablesFromMarkdown(
            reply.content,
            rootQuestion?.promptDomain,
            reply.eventCards,
          ),
        })),
      };
    });
  }, [
    exchanges,
    isExternalFile,
    latestReply,
    renderedHtml,
    rootQuestion?.content,
    rootQuestion?.promptDomain,
    rootQuestion?.timestamp,
  ]);

  const hasAnyExtractedTable = exchangeViews.some((ev) =>
    ev.replyBlocks.some((rb) => rb.tables.length > 0),
  );

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
  const domainLabel = rootQuestion?.promptDomain
    ? getPromptDomainShortLabel(rootQuestion.promptDomain)
    : '';
  const fullPeriodLabel =
    rootQuestion?.threadMonth && rootQuestion?.threadYear
      ? `${rootQuestion.threadMonth} ${rootQuestion.threadYear}`
      : shortPeriod;
  const ratingMeta = rootQuestion?.threadRating
    ? THREAD_RATING_OPTIONS.find((item) => item.id === rootQuestion.threadRating)
    : undefined;
  const updatedAtRaw = latestReply?.timestamp || rootQuestion?.timestamp;
  const updatedLabel = updatedAtRaw ? new Date(updatedAtRaw).toLocaleString() : '';

  const metaParts = [
    shortPeriod || '',
    domainLabel,
    exchanges.length > 1 ? `${exchanges.length} turns` : '',
    latestReply
      ? isExternalFile
        ? latestReply.model
        : `${latestReply.scope === 'private' ? 'Private' : 'Public'} · ${latestReply.model}`
      : '',
  ].filter(Boolean);

  return (
    <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-transparent">
      {/* Document Toolbar */}
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200/85 dark:border-slate-800/85 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          {onSyncReport && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => onSyncReport(exchangeId)}
              title="Sync WatchOut items to Calendar and Event Cards to Reminders"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                isSynced
                  ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--pa-accent)' }} />
              ) : isSynced ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <CalendarPlus className="w-3.5 h-3.5" style={{ color: 'var(--pa-accent)' }} />
              )}
              <span>{isSyncing ? 'Syncing…' : isSynced ? 'Synced' : 'Sync'}</span>
            </button>
          )}
          {!isExternalFile && (
            <button
              type="button"
              onClick={() => onViewEventCards(exchangeId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" style={{ color: 'var(--pa-accent)' }} />
              <span>Event Cards</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </header>

      {/* Rich React Report Table Pane (Download still delivers full HTML) */}
      <div className="flex-1 min-h-0 overflow-y-auto fluent-scroll p-4 sm:p-6">
        {isExternalFile && !hasAnyExtractedTable ? (
          <section className="h-full min-h-[420px] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white overflow-hidden shadow-sm">
            <iframe
              title={`${title} Report`}
              srcDoc={renderedHtml}
              sandbox="allow-same-origin"
              className="flex-1 w-full min-h-0 border-0 bg-white"
            />
          </section>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6 pb-8">
            {/* Report Header Card: Title, Domain, Period, Rating, Updated Timestamp */}
            <section
              style={{ borderColor: 'var(--pa-bubble-rim)' }}
              className="fluent-event-card rounded-3xl border p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {domainLabel && (
                      <span
                        style={{
                          backgroundColor: 'var(--pa-q-bg)',
                          borderColor: 'var(--pa-bubble-rim)',
                          color: 'var(--pa-accent-text)',
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                      >
                        <Sparkles className="w-3 h-3" style={{ color: 'var(--pa-accent)' }} />
                        <span>{domainLabel}</span>
                      </span>
                    )}
                    {fullPeriodLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 tabular-nums">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>
                          {shortPeriod && fullPeriodLabel !== shortPeriod
                            ? `${shortPeriod} · ${fullPeriodLabel}`
                            : fullPeriodLabel}
                        </span>
                      </span>
                    )}
                    {ratingMeta && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70">
                        <span>{ratingMeta.starGlyphs}</span>
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {title}
                  </h2>
                </div>

                {updatedLabel && (
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/85 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Updated {updatedLabel}</span>
                  </div>
                )}
              </div>

              {/* Report Comment / Note */}
              {onUpdateComment && (
                <div className="mt-4 pt-3.5 border-t border-slate-200/75 dark:border-slate-800/80">
                  {isEditingNote ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onUpdateComment(exchangeId, noteDraft.trim());
                            setIsEditingNote(false);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsEditingNote(false);
                          }
                        }}
                        placeholder="Add a note on why this run was generated…"
                        className="flex-1 min-w-[200px] rounded-xl border border-sky-300 dark:border-sky-600 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateComment(exchangeId, noteDraft.trim());
                          setIsEditingNote(false);
                        }}
                        className="rounded-xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        Save Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingNote(false)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
                        <MessageSquareText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {(comment ?? rootQuestion?.threadComment)?.trim() ||
                            'No note added yet.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(
                            (comment ?? rootQuestion?.threadComment ?? '').trim(),
                          );
                          setIsEditingNote(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>
                          {(comment ?? rootQuestion?.threadComment)?.trim()
                            ? 'Edit Note'
                            : 'Add Note'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Exchanges: Initial Question + Follow-up(s) with Timeline & Rating Matrix Tables Only */}
            {exchangeViews.map((exchange, exIdx) => (
              <section key={`${exchange.label}-${exIdx}`} className="space-y-4">
                {exchange.question && (
                  <div
                    style={{
                      backgroundColor: 'var(--pa-q-bg)',
                      borderColor: 'var(--pa-bubble-rim)',
                    }}
                    className="rounded-2xl border px-4 sm:px-5 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div
                        style={{ color: 'var(--pa-accent-text)' }}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                      >
                        <MessageSquare className="w-3.5 h-3.5" style={{ color: 'var(--pa-accent)' }} />
                        <span>{exchange.label}</span>
                      </div>
                      {exchange.askedAt && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {new Date(exchange.askedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-line"
                      style={{ fontFamily: 'var(--pa-font-body)' }}
                    >
                      {exchange.question}
                    </p>
                  </div>
                )}

                {exchange.replyBlocks.map((block) => (
                  <div key={block.id} className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                        {block.providerLabel}
                      </span>
                    </div>

                    {block.tables.length > 0 ? (
                      block.tables.map((table, tblIdx) => (
                        <RichMatrixTable key={`${block.id}-${tblIdx}`} table={table} />
                      ))
                    ) : (
                      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                        No Event Timeline &amp; Rating Matrix table was detected for this reply. Use{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          Download
                        </span>{' '}
                        to inspect the complete HTML report.
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
