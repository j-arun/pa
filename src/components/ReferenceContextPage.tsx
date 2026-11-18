import { AlertCircle, CheckCircle2, Cloud, Lock, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConversationScope,
  ConversationTurn,
  WorkbenchSettings,
} from '../types/workbench';
import { estimateTokens } from '../utils/promptTemplates';

interface ReferenceContextPageProps {
  scope: ConversationScope;
  onChangeScope: (scope: ConversationScope) => void;
  settings: WorkbenchSettings;
  turns: ConversationTurn[];
  onSaveReferenceContext: (
    targetScope: ConversationScope,
    text: string,
  ) => Promise<boolean>;
  onContextLog?: (level: 'info' | 'success' | 'error', message: string) => void;
}

export function ReferenceContextPage({
  scope,
  onChangeScope,
  settings,
  turns,
  onSaveReferenceContext,
  onContextLog,
}: ReferenceContextPageProps) {
  const savedText =
    scope === 'private'
      ? settings.contextCache.privateText
      : settings.contextCache.publicText;

  const [draftText, setDraftText] = useState(savedText);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftText(savedText);
    setFeedback(null);
  }, [scope, savedText]);

  const activeAdapter = settings.publicLlm.activeAdapter;
  const targetLabel =
    scope === 'private'
      ? `Private · Ollama · ${settings.privateLlm.selectedModel || 'No model selected'}`
      : `Public · ${
          activeAdapter === 'claude'
            ? 'Claude'
            : activeAdapter === 'fable'
              ? 'Fable'
              : 'Gemini'
        } · ${settings.publicLlm.adapters[activeAdapter].model}`;

  const activeSystemInstruction =
    scope === 'private'
      ? settings.privateLlm.systemInstruction
      : settings.publicLlm.adapters[activeAdapter].systemInstruction;

  const activeContextWindow =
    scope === 'private' ? settings.privateLlm.contextWindow : null;

  const recentHistoryText = useMemo(() => {
    const maxHistory = Math.min(
      32,
      Math.max(2, settings.privateLlm.maxHistoryTurns || 16),
    );
    return turns
      .filter((turn) => {
        if (turn.role === 'user') {
          return (turn.responseScopes ?? [turn.scope]).includes(scope);
        }
        return turn.role === 'assistant' && turn.scope === scope;
      })
      .slice(-maxHistory)
      .map((turn) => turn.content)
      .join('\n');
  }, [turns, scope, settings.privateLlm.maxHistoryTurns]);

  const savedTokens = estimateTokens(savedText);
  const draftTokens = estimateTokens(draftText);
  const estimatedTotalContextTokens = estimateTokens(
    [activeSystemInstruction, draftText, recentHistoryText]
      .filter(Boolean)
      .join('\n'),
  );

  const remainingTokens =
    activeContextWindow !== null
      ? activeContextWindow - estimatedTotalContextTokens
      : null;
  const exceedsWindow =
    remainingTokens !== null && remainingTokens < 0;

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      setDraftText(content);
      const nextEstimate = estimateTokens(
        [activeSystemInstruction, content, recentHistoryText]
          .filter(Boolean)
          .join('\n'),
      );
      if (activeContextWindow !== null && nextEstimate > activeContextWindow) {
        setFeedback({
          type: 'warning',
          title: 'Text loaded but exceeds the context window',
          message: `${file.name} was loaded. The draft, system instruction, and recent conversation exceed the configured ${activeContextWindow.toLocaleString()}-token window.`,
        });
      } else {
        setFeedback({
          type: 'info',
          title: 'Text loaded',
          message: `${file.name} (${estimateTokens(content).toLocaleString()} est. tokens) is ready to apply.`,
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Could not read text file',
        message:
          error instanceof Error ? error.message : 'Unable to read the selected file.',
      });
    }
  };

  const handleApplyContext = async () => {
    if (!draftText.trim()) {
      setFeedback({
        type: 'warning',
        title: 'No text to apply',
        message: 'Paste or upload reference text first.',
      });
      return;
    }
    if (exceedsWindow && activeContextWindow !== null) {
      setFeedback({
        type: 'warning',
        title: 'Text is larger than the context window',
        message:
          'The draft, system instruction, and recent conversation exceed the configured context window.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSaveReferenceContext(scope, draftText);
      const tokenCount = estimateTokens(draftText);
      if (saved) {
        onContextLog?.(
          'success',
          `Applied ${tokenCount.toLocaleString()} estimated reference tokens to ${scope}.`,
        );
        setFeedback({
          type: 'success',
          title: 'Reference context saved',
          message: `${tokenCount.toLocaleString()} estimated tokens saved locally. It will be included with each future prompt; no model request is sent until you chat.`,
        });
      } else {
        setFeedback({
          type: 'warning',
          title: 'Saved locally in browser',
          message:
            'Updated reference context in browser storage, though the local settings file sync returned an error.',
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Could not save context',
        message:
          error instanceof Error ? error.message : 'Failed to save reference context.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearContext = async () => {
    setIsSaving(true);
    try {
      await onSaveReferenceContext(scope, '');
      setDraftText('');
      onContextLog?.('info', `Cleared reference context for ${scope}.`);
      setFeedback({
        type: 'success',
        title: 'Context cleared',
        message: `The applied reference text was removed for the ${scope} connection.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Could not clear context',
        message:
          error instanceof Error ? error.message : 'Failed to clear reference context.',
      });
    } finally {
      setIsSaving(false);
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
              Save reference text for the active connection. Future prompts include it automatically; clicking Apply does not contact the model.
            </p>
          </div>

          <div
            role="group"
            aria-label="Reference context connection target"
            className="inline-flex items-center rounded-xl border border-slate-200/90 bg-white/80 p-1 dark:border-slate-700/80 dark:bg-slate-900/75"
          >
            <button
              type="button"
              onClick={() => onChangeScope('private')}
              aria-pressed={scope === 'private'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scope === 'private'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Private</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeScope('public')}
              aria-pressed={scope === 'public'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                scope === 'public'
                  ? 'bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              <span>Public</span>
            </button>
          </div>
        </header>

        {/* 4-Card Token Estimate Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Saved reference estimate
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {savedTokens.toLocaleString()} tokens
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Draft estimate
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {draftTokens.toLocaleString()} tokens
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Remaining after draft
            </div>
            <div
              className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                exceedsWindow
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {remainingTokens === null
                ? 'Provider-defined'
                : remainingTokens >= 0
                  ? `${remainingTokens.toLocaleString()} tokens`
                  : `Over by ${Math.abs(remainingTokens).toLocaleString()}`}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3.5 dark:border-slate-700/75 dark:bg-slate-900/65">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Context window
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {activeContextWindow !== null
                ? `${activeContextWindow.toLocaleString()} tokens`
                : 'Provider-defined'}
            </div>
          </div>
        </div>

        {/* Editor Card */}
        <section className="rounded-3xl border border-slate-200/85 bg-white/75 p-5 shadow-sm backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-900/65 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Reference text
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {targetLabel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.log"
                onChange={(e) => void handleFileUpload(e)}
                className="hidden"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload text</span>
              </button>
              <button
                type="button"
                onClick={() => void handleClearContext()}
                disabled={isSaving || (!draftText && !savedText)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-300 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear context</span>
              </button>
            </div>
          </div>

          <textarea
            aria-label="Reference context notes"
            value={draftText}
            onChange={(e) => {
              setDraftText(e.target.value);
              if (feedback?.type === 'success') setFeedback(null);
            }}
            rows={14}
            placeholder="Paste your reference notes, background context, or source text here..."
            className="w-full min-h-[300px] max-h-[540px] resize-y rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-600 fluent-scroll"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              {draftText.length.toLocaleString()} characters · approximate token count
            </span>
            <span>Estimated at roughly 1 token per 4 characters</span>
          </div>

          {(exceedsWindow || feedback) && (
            <div
              role={
                exceedsWindow || feedback?.type === 'error' || feedback?.type === 'warning'
                  ? 'alert'
                  : 'status'
              }
              className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs ${
                exceedsWindow || feedback?.type === 'error'
                  ? 'border-red-200 bg-red-50/90 text-red-800 dark:border-red-900 dark:bg-red-950/45 dark:text-red-200'
                  : feedback?.type === 'warning'
                    ? 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-200'
                    : feedback?.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200'
                      : 'border-sky-200 bg-sky-50/90 text-sky-800 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-200'
              }`}
            >
              {feedback?.type === 'success' && !exceedsWindow ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">
                  {exceedsWindow
                    ? 'Text is larger than the context window'
                    : feedback?.title}
                </div>
                <div className="mt-0.5 leading-relaxed">
                  {exceedsWindow
                    ? 'The draft, system instruction, and recent conversation exceed the configured context window.'
                    : feedback?.message}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Footer Apply Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            This is saved locally, not stored as a persistent model KV session. Each chat request includes the reference text again; Apply sends no model request. Public connections send it to the configured provider.
          </p>
          <button
            type="button"
            onClick={() => void handleApplyContext()}
            disabled={isSaving || !draftText.trim() || exceedsWindow}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--pa-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--pa-accent-hover)] disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap shrink-0"
          >
            {isSaving ? 'Saving…' : 'Apply context'}
          </button>
        </div>
      </div>
    </main>
  );
}
