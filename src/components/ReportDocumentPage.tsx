import {
  ArrowLeft,
  Check,
  Code2,
  Columns2,
  Copy,
  FileDown,
  Globe,
  Layers,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ConversationTurn } from '../types/workbench';
import { buildThreadHtmlDocument } from '../utils/eventParser';
import { getPromptDomainShortLabel } from '../utils/promptTemplates';

type ReportViewMode = 'browser' | 'editor' | 'split';

interface ReportDocumentPageProps {
  exchangeId: string;
  questionTurn: ConversationTurn | null;
  replyTurns: ConversationTurn[];
  onSaveHtmlReport: (exchangeId: string, html: string) => void;
  onViewEventCards: (exchangeId: string) => void;
  onClose: () => void;
}

export function ReportDocumentPage({
  exchangeId,
  questionTurn,
  replyTurns,
  onSaveHtmlReport,
  onViewEventCards,
  onClose,
}: ReportDocumentPageProps) {
  const title = questionTurn?.threadName?.trim() || 'Reference Report';
  const primaryReply =
    replyTurns.find((turn) => turn.role === 'assistant') ?? replyTurns[0];

  const generatedHtml = buildThreadHtmlDocument({
    title,
    question: questionTurn?.content || '',
    replies: replyTurns,
    domain: questionTurn?.promptDomain,
    month: questionTurn?.threadMonth,
    year: questionTurn?.threadYear,
    rating: questionTurn?.threadRating,
    createdAt: primaryReply?.timestamp || questionTurn?.timestamp,
  });

  const savedHtml = primaryReply?.htmlReport || generatedHtml;

  const [viewMode, setViewMode] = useState<ReportViewMode>('browser');
  const [draftHtml, setDraftHtml] = useState<string>(savedHtml);
  const [copied, setCopied] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraftHtml(savedHtml);
    setSaveNotice(null);
  }, [exchangeId, savedHtml]);

  const isDirty = draftHtml !== savedHtml;
  const safeSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'reference-report';

  const handleSave = () => {
    onSaveHtmlReport(exchangeId, draftHtml);
    setSaveNotice('Saved HTML document');
    window.setTimeout(() => setSaveNotice(null), 2200);
  };

  const handleReset = () => {
    setDraftHtml(generatedHtml);
    onSaveHtmlReport(exchangeId, generatedHtml);
    setSaveNotice('Reset to generated HTML');
    window.setTimeout(() => setSaveNotice(null), 2200);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftHtml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownload = () => {
    const blob = new Blob([draftHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeSlug}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const metaParts = [
    questionTurn?.promptDomain
      ? getPromptDomainShortLabel(questionTurn.promptDomain)
      : '',
    questionTurn?.threadMonth && questionTurn?.threadYear
      ? `${questionTurn.threadMonth} ${questionTurn.threadYear}`
      : '',
    primaryReply
      ? `${primaryReply.scope === 'private' ? 'Private' : 'Public'} · ${primaryReply.model}`
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
            {metaParts.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
                {metaParts.join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Mode Switcher: Browser / HTML Editor / Split */}
        <div
          role="group"
          aria-label="HTML document view mode"
          className="inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/85 dark:bg-slate-800/90 shrink-0"
        >
          <button
            type="button"
            onClick={() => setViewMode('browser')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'browser'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Browser View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'editor'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>HTML Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'split'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split View</span>
          </button>
        </div>

        {/* Document Actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {saveNotice && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
              {saveNotice}
            </span>
          )}
          <button
            type="button"
            onClick={() => onViewEventCards(exchangeId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5" style={{ color: 'var(--pa-accent)' }} />
            <span>Event Cards</span>
          </button>
          {(viewMode === 'editor' || viewMode === 'split') && (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] disabled:opacity-45 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save HTML</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset HTML document to the original generated report"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy HTML</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Download .html</span>
          </button>
        </div>
      </header>

      {/* Main Viewer / Editor Area */}
      <div
        className={`flex-1 min-h-0 p-4 sm:p-6 gap-4 overflow-hidden ${
          viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-2' : 'flex flex-col'
        }`}
      >
        {(viewMode === 'editor' || viewMode === 'split') && (
          <section
            aria-label="HTML Source Editor"
            className="flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden shadow-sm"
          >
            <div className="shrink-0 px-4 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 text-xs text-slate-300">
              <span className="font-mono">{safeSlug}.html</span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {draftHtml.length.toLocaleString()} chars · {draftHtml.split('\n').length} lines
                {isDirty ? ' · Unsaved edits' : ''}
              </span>
            </div>
            <textarea
              aria-label="HTML Document Source"
              value={draftHtml}
              onChange={(e) => setDraftHtml(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full min-h-0 resize-none bg-slate-950 p-4 font-mono text-[13px] leading-relaxed text-slate-100 focus:outline-none fluent-scroll"
            />
          </section>
        )}

        {(viewMode === 'browser' || viewMode === 'split') && (
          <section
            aria-label="Browser HTML Preview"
            className="flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white overflow-hidden shadow-sm"
          >
            <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-slate-100/90 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="font-mono text-xs text-slate-600 truncate">
                  local-report://{safeSlug}.html
                </span>
              </div>
              <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                Standalone HTML Document
              </span>
            </div>
            <iframe
              title={`${title} Browser Preview`}
              srcDoc={draftHtml}
              sandbox="allow-same-origin"
              className="flex-1 w-full min-h-0 border-0 bg-white"
            />
          </section>
        )}
      </div>
    </main>
  );
}
