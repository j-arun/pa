import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  ConversationScope,
  WorkbenchSettings,
} from '../types/workbench';
import {
  THREAD_MONTHS,
  THREAD_YEARS,
  estimateTokens,
  formatShortYearMonth,
} from '../utils/promptTemplates';

interface ReferenceContextPageProps {
  scope: ConversationScope;
  settings: WorkbenchSettings;
  onApplyFetchedContext: (payload: {
    text: string;
    month: number;
    year: number;
    fetchedAt: string;
  }) => Promise<boolean>;
  onClearAllReferenceContext: () => Promise<boolean>;
  onOpenSettings: () => void;
  onContextLog?: (level: 'info' | 'success' | 'error', message: string) => void;
}

export function ReferenceContextPage({
  scope,
  settings,
  onApplyFetchedContext,
  onClearAllReferenceContext,
  onOpenSettings,
  onContextLog,
}: ReferenceContextPageProps) {
  const savedText =
    scope === 'private'
      ? settings.contextCache.privateText
      : settings.contextCache.publicText;

  const [selectedMonth, setSelectedMonth] = useState<number>(
    settings.contextCache.activeMonth ?? new Date().getMonth() + 1,
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    settings.contextCache.activeYear ??
      Math.min(2090, Math.max(1990, new Date().getFullYear())),
  );
  const [draftText, setDraftText] = useState(savedText);
  const [isApplying, setIsApplying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    setDraftText(savedText);
  }, [savedText]);

  useEffect(() => {
    if (settings.contextCache.activeMonth) {
      setSelectedMonth(settings.contextCache.activeMonth);
    }
    if (settings.contextCache.activeYear) {
      setSelectedYear(settings.contextCache.activeYear);
    }
  }, [settings.contextCache.activeMonth, settings.contextCache.activeYear]);

  const apiCfg = settings.referenceContextApi;
  const resolvedEndpointPreview = `${
    /^https?:\/\//i.test(apiCfg.hostname)
      ? apiCfg.hostname.replace(/\/+$/, '')
      : `http://${apiCfg.hostname || 'localhost'}`
  }:${apiCfg.port || 3000}${
    apiCfg.path.startsWith('/') ? apiCfg.path : `/${apiCfg.path}`
  }?${(apiCfg.queryTemplate || 'date={month}/{year}&variant=compact')
    .replace(/^\?/, '')
    .replace(/\{month\}/gi, String(selectedMonth))
    .replace(/\{year\}/gi, String(selectedYear))}`;

  const activePeriodLabel = formatShortYearMonth(selectedMonth, selectedYear);
  const savedPeriodLabel = formatShortYearMonth(
    settings.contextCache.activeMonth,
    settings.contextCache.activeYear,
  );
  const publicTokens = estimateTokens(settings.contextCache.publicText);
  const privateTokens = estimateTokens(settings.contextCache.privateText);

  const handleApplyMonthYear = async () => {
    setIsApplying(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/reference-context/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          apiConfig: settings.referenceContextApi,
        }),
      });

      const payload = (await response.json()) as {
        text?: string;
        url?: string;
        fetchedAt?: string;
        error?: string;
      };

      if (!response.ok || payload.error) {
        const errMessage =
          payload.error ||
          `Reference Context REST endpoint is not available at ${resolvedEndpointPreview}.`;
        setFeedback({
          type: 'error',
          title: 'Reference Context API endpoint unavailable',
          message: errMessage,
        });
        onContextLog?.('error', errMessage);
        return;
      }

      const plainText = typeof payload.text === 'string' ? payload.text : '';
      const fetchedAt = payload.fetchedAt || new Date().toISOString();
      setDraftText(plainText);

      const saved = await onApplyFetchedContext({
        text: plainText,
        month: selectedMonth,
        year: selectedYear,
        fetchedAt,
      });

      const tokenCount = estimateTokens(plainText);
      onContextLog?.(
        'success',
        `Loaded & applied ${activePeriodLabel} reference context (${tokenCount.toLocaleString()} est. tokens) to both Public & Private.`,
      );

      setFeedback({
        type: saved ? 'success' : 'warning',
        title: `Applied ${activePeriodLabel} to Public & Private`,
        message: saved
          ? `Fetched plain text (${tokenCount.toLocaleString()} estimated tokens) from ${payload.url || resolvedEndpointPreview} and automatically populated both Public and Private contexts.`
          : `Fetched ${tokenCount.toLocaleString()} estimated tokens into Public and Private in browser storage, though local disk config sync reported an error.`,
      });
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : `Reference Context REST endpoint is not available at ${resolvedEndpointPreview}.`;
      setFeedback({
        type: 'error',
        title: 'Reference Context API endpoint unavailable',
        message: msg,
      });
      onContextLog?.('error', msg);
    } finally {
      setIsApplying(false);
    }
  };

  const handleClearContext = async () => {
    setIsClearing(true);
    try {
      await onClearAllReferenceContext();
      setDraftText('');
      onContextLog?.('info', 'Cleared reference context for both Public and Private.');
      setFeedback({
        type: 'success',
        title: 'Context cleared',
        message:
          'Reference text has been cleared from both Public and Private connections.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Could not clear context',
        message:
          error instanceof Error ? error.message : 'Failed to clear reference context.',
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <main className="relative flex-1 min-w-0 overflow-y-auto fluent-scroll px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Reference Context
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Select a Month and Year and click Apply to fetch plain-text reference context from your configured REST endpoint and apply it automatically to both Public and Private chats.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/75 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <SettingsIcon className="h-3.5 w-3.5" style={{ color: 'var(--pa-accent)' }} />
            <span>API Settings ({apiCfg.hostname}:{apiCfg.port})</span>
          </button>
        </header>

        {/* Month / Year Selector & Auto-Apply REST Bar */}
        <section className="rounded-3xl border border-slate-200/85 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-900/70 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[170px] flex-1 sm:flex-none">
              <label
                htmlFor="ref-ctx-month"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Month (1–12)
              </label>
              <select
                id="ref-ctx-month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {THREAD_MONTHS.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {idx + 1} · {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[140px] flex-1 sm:flex-none">
              <label
                htmlFor="ref-ctx-year"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Year (1990–2090)
              </label>
              <select
                id="ref-ctx-year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {THREAD_YEARS.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void handleApplyMonthYear()}
              disabled={isApplying || isClearing}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--pa-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--pa-accent-hover)] disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${isApplying ? 'animate-spin' : ''}`} />
              <span>{isApplying ? 'Fetching & Applying…' : 'Apply'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-800/70">
            <span className="font-mono break-all">GET {resolvedEndpointPreview}</span>
            {savedPeriodLabel && (
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                <CalendarClock className="h-3.5 w-3.5" style={{ color: 'var(--pa-accent)' }} />
                <span>Active Period: {savedPeriodLabel}</span>
              </span>
            )}
          </div>
        </section>

        {/* Synced Summary Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Active Thread Period
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {savedPeriodLabel || activePeriodLabel}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Public Context Applied
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {publicTokens.toLocaleString()} tokens
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Private Context Applied
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {privateTokens.toLocaleString()} tokens
            </div>
          </div>
        </div>

        {/* Populated Reference Text Viewer */}
        <section className="rounded-3xl border border-slate-200/85 bg-white/75 p-5 shadow-sm backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-900/65 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Populated Reference Text (Public &amp; Private)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Automatically populated from the REST endpoint when you click Apply above
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleClearContext()}
              disabled={
                isApplying ||
                isClearing ||
                (!draftText &&
                  !settings.contextCache.publicText &&
                  !settings.contextCache.privateText)
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-300 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isClearing ? 'Clearing…' : 'Clear context'}</span>
            </button>
          </div>

          <textarea
            aria-label="Reference context plain text"
            value={draftText}
            readOnly
            rows={14}
            placeholder="Select Month & Year and click Apply above to load plain-text reference context from your REST API..."
            className="w-full min-h-[280px] max-h-[520px] resize-y rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 fluent-scroll"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              {draftText.length.toLocaleString()} characters ·{' '}
              {estimateTokens(draftText).toLocaleString()} est. tokens
            </span>
            {settings.contextCache.lastSyncedAt && (
              <span>
                Last synced: {new Date(settings.contextCache.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>

          {feedback && (
            <div
              role={feedback.type === 'error' || feedback.type === 'warning' ? 'alert' : 'status'}
              className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs ${
                feedback.type === 'error'
                  ? 'border-red-200 bg-red-50/90 text-red-800 dark:border-red-900 dark:bg-red-950/45 dark:text-red-200'
                  : feedback.type === 'warning'
                    ? 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-200'
                    : feedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200'
                      : 'border-sky-200 bg-sky-50/90 text-sky-800 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">{feedback.title}</div>
                <div className="mt-0.5 leading-relaxed">{feedback.message}</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
