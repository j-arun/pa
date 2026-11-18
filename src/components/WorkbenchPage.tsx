import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileDown,
  FileSearch,
  GripHorizontal,
  Hourglass,
  Plus,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConversationScope,
  ConversationTurn,
  PromptDomain,
  PromptStyle,
  PromptTemplates,
  ThreadRating,
  WorkbenchSettings,
} from '../types/workbench';
import type { UseSpeechIOResult } from '../hooks/useSpeechIO';
import { renderMarkdownToHtml } from '../utils/markdownExport';
import {
  PROMPT_DOMAINS,
  THREAD_MONTHS,
  THREAD_RATING_OPTIONS,
  THREAD_YEARS,
  getPromptDomainShortLabel,
} from '../utils/promptTemplates';
import { MessageContent } from './MessageContent';

const STARTER_PROMPTS: Record<ConversationScope, string[]> = {
  private: [
    'Summarize my current dasha period.',
    'Analyze upcoming antardasha transitions for career, family, love, and health.',
    'Highlight key planetary strengths, cautions, and important dates in this period.',
  ],
  public: [
    'Summarize my current dasha period and key planetary influences.',
    'Compare the outlook for career, family, love, and health during this dasha.',
    'Outline major timeline shifts and practical focus areas for this period.',
  ],
};

const RATING_STYLES: Record<
  ThreadRating,
  { dotClass: string; activeClass: string; textClass: string }
> = {
  green: {
    dotClass: 'bg-emerald-600 dark:bg-emerald-400',
    activeClass:
      'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200',
    textClass: 'text-emerald-700 dark:text-emerald-300',
  },
  yellow: {
    dotClass: 'bg-yellow-500 dark:bg-yellow-400',
    activeClass:
      'border-yellow-500 bg-yellow-50 text-yellow-800 dark:border-yellow-500 dark:bg-yellow-950/60 dark:text-yellow-200',
    textClass: 'text-yellow-700 dark:text-yellow-300',
  },
  red: {
    dotClass: 'bg-red-600 dark:bg-red-400',
    activeClass:
      'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/60 dark:text-red-200',
    textClass: 'text-red-700 dark:text-red-300',
  },
};

interface ConversationExchange {
  id: string;
  questionTurn: ConversationTurn | null;
  replyTurns: ConversationTurn[];
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export interface SendThreadMessagePayload {
  text: string;
  inputMode: 'text';
  threadName: string;
  threadMonth: string;
  threadYear: number;
  promptDomain: PromptDomain;
}

export interface ThreadMetadataPatch {
  threadName?: string;
  threadMonth?: string;
  threadYear?: number;
  promptDomain?: PromptDomain;
  threadRating?: ThreadRating | undefined;
}

interface WorkbenchPageProps {
  scope: ConversationScope;
  settings: WorkbenchSettings;
  turns: ConversationTurn[];
  activePromptDomain: PromptDomain;
  promptStyle: PromptStyle;
  promptTemplates: PromptTemplates;
  onPromptStyleChange: (style: PromptStyle) => void;
  isSending: boolean;
  speech: UseSpeechIOResult;
  onSendMessage: (payload: SendThreadMessagePayload) => void;
  onUpdateExchangeMetadata: (exchangeId: string, patch: ThreadMetadataPatch) => void;
  onClearConversation: () => void;
  onDeleteExchange: (exchangeId: string) => void;
  onOpenSettings: () => void;
}

function buildPrompt(draft: string, template: string): string {
  const prompt = draft.trim();
  const normalizedTemplate = template.trim();
  if (!normalizedTemplate) return prompt;
  if (normalizedTemplate.includes('{{prompt}}')) {
    return normalizedTemplate.replace(/\{\{prompt\}\}/g, () => prompt);
  }
  return `${normalizedTemplate}\n\n${prompt}`;
}

function ScopeModeSvg({
  scope,
  className = 'w-11 h-11',
}: {
  scope: ConversationScope;
  className?: string;
}) {
  const isPrivate = scope === 'private';

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="60"
        cy="60"
        r="56"
        fill={isPrivate ? '#d1fae5' : '#dbeafe'}
      />
      {/* Person head & shoulders */}
      <path
        d="M16 106c4-22 17-34 36-34s31 12 34 34"
        fill={isPrivate ? '#0f766e' : '#1d4ed8'}
      />
      <circle cx="48" cy="48" r="17" fill="#f3c6a5" />
      <path
        d="M31 46c1-14 11-22 22-21 9 1 16 7 17 16-6-2-12-6-16-12-5 8-13 13-23 17z"
        fill="#334155"
      />
      <circle cx="55" cy="46" r="2" fill="#1e293b" />

      {isPrivate ? (
        <g>
          {/* Murmuring hand cupped gently near mouth + subtle soft whisper ripples */}
          <path
            d="M58 55c3 1 5 2 6 4"
            fill="none"
            stroke="#9a5d4a"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M61 73l6-17c1-3 5-3 6 0l1 15c0 4-3 8-8 8z"
            fill="#eab38f"
            stroke="#9a5d4a"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M78 52c3 2 3 6 0 8"
            fill="none"
            stroke="#059669"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="2 3"
          />
          <path
            d="M85 48c4 4 4 12 0 16"
            fill="none"
            stroke="#059669"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="2 3"
          />
        </g>
      ) : (
        <g>
          {/* Shouting open mouth into handheld loudspeaker / megaphone + acoustic waves */}
          <ellipse cx="61" cy="56" rx="3.2" ry="4" fill="#991b1b" />
          <path
            d="M65 51l14-1 19-13v34l-19-12H65z"
            fill="#f59e0b"
            stroke="#b45309"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M71 60l5 15h8l-5-15"
            fill="#d97706"
          />
          <path
            d="M102 45c5 5 5 15 0 20M108 38c8 8 8 26 0 34"
            fill="none"
            stroke="#0284c7"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}

function ConversationReplyCard({
  replyTurn,
  copiedId,
  speech,
  onCopy,
  onOpenSettings,
  formatTime,
}: {
  replyTurn: ConversationTurn;
  copiedId: string | null;
  speech: UseSpeechIOResult;
  onCopy: (turn: ConversationTurn) => void;
  onOpenSettings: () => void;
  formatTime: (iso: string) => string;
}) {
  const isSpeaking = speech.speakingTurnId === replyTurn.id;
  const providerLabel =
    replyTurn.scope === 'private'
      ? 'Private · Ollama'
      : `Public · ${replyTurn.adapterId === 'claude' ? 'Claude' : replyTurn.adapterId === 'fable' ? 'Fable' : 'Gemini'}`;
  const modelName = replyTurn.model.trim();
  const modelPrefix = `${replyTurn.adapterId}/`;
  const qualifiedModelName = modelName
    ? modelName.toLowerCase().startsWith(modelPrefix.toLowerCase())
      ? modelName
      : `${modelPrefix}${modelName}`
    : replyTurn.adapterId;
  const metrics = [
    replyTurn.durationMs !== undefined
      ? `${(replyTurn.durationMs / 1000).toFixed(2)}s`
      : null,
    replyTurn.inputTokenCount !== undefined
      ? `Prompt size: ${replyTurn.inputTokenCount.toLocaleString()} tokens - ${qualifiedModelName}`
      : `Prompt size unavailable - ${qualifiedModelName}`,
    replyTurn.tokenCount !== undefined ? `${replyTurn.tokenCount} tokens` : null,
    replyTurn.inputTokenCount !== undefined || replyTurn.outputTokenCount !== undefined
      ? `in ${replyTurn.inputTokenCount ?? '—'} / out ${replyTurn.outputTokenCount ?? '—'}`
      : null,
    replyTurn.tokensPerSecond !== undefined
      ? `${replyTurn.tokensPerSecond.toFixed(1)} tok/s`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (replyTurn.role === 'error') {
    return (
      <div className="min-w-0 rounded-2xl bg-red-50/80 dark:bg-red-950/35 border border-red-200/80 dark:border-red-900/60 px-4 py-3 text-red-800 dark:text-red-200">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold mb-1 tabular-nums">
          <span>
            {providerLabel} · Error · {formatTime(replyTurn.timestamp)}
          </span>
          {replyTurn.durationMs !== undefined && (
            <span>{(replyTurn.durationMs / 1000).toFixed(2)}s</span>
          )}
        </div>
        <p className="text-sm leading-relaxed break-words">{replyTurn.content}</p>
        {replyTurn.scope === 'private' && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 hover:bg-red-100/60 transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Configure in Settings</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-w-0 rounded-2xl px-4 py-3.5 border-l-4"
      style={{
        backgroundColor: 'var(--pa-a-bg)',
        borderLeftColor: 'var(--pa-a-accent)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-2">
        <div className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--pa-a-accent)' }}>
          {providerLabel} · {replyTurn.model} · {formatTime(replyTurn.timestamp)}
        </div>
        {metrics && (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">{metrics}</div>
        )}
      </div>
      <div className="max-h-[65vh] overflow-y-auto fluent-scroll pr-2 text-sm leading-relaxed break-words">
        <MessageContent text={replyTurn.content} />
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {speech.speechSynthesisSupported && (
          <button
            type="button"
            aria-label={isSpeaking ? 'Mute response playback' : 'Play response'}
            title={isSpeaking ? 'Mute response playback' : 'Play response'}
            onClick={() => speech.speakText(replyTurn.id, replyTurn.content)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isSpeaking
                ? 'text-white'
                : 'bg-white/80 dark:bg-slate-800/85 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
            }`}
            style={isSpeaking ? { backgroundColor: 'var(--pa-a-accent)' } : undefined}
          >
            {isSpeaking ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Mute Speaker</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Play in Speaker</span>
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => onCopy(replyTurn)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/75 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
        >
          {copiedId === replyTurn.id ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function WorkbenchPage({
  scope,
  settings,
  turns,
  activePromptDomain,
  promptStyle,
  promptTemplates,
  onPromptStyleChange,
  isSending,
  speech,
  onSendMessage,
  onUpdateExchangeMetadata,
  onClearConversation,
  onDeleteExchange,
  onOpenSettings,
}: WorkbenchPageProps) {
  const [draft, setDraft] = useState('');
  const [threadName, setThreadName] = useState('');
  const [threadMonth, setThreadMonth] = useState('');
  const [threadYear, setThreadYear] = useState('');
  const [metadataNotice, setMetadataNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{
    threadId: string;
    message: string;
    isError: boolean;
  } | null>(null);
  const [collapsedThreadIds, setCollapsedThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sourcePromptThreadId, setSourcePromptThreadId] = useState<string | null>(null);
  const [settingsThreadId, setSettingsThreadId] = useState<string | null>(null);
  const [chatPanelHeight, setChatPanelHeight] = useState<number>(() => {
    try {
      const raw = Number(window.localStorage.getItem('pa_chat_panel_height'));
      return Number.isFinite(raw) && raw >= 200 && raw <= 540 ? raw : 264;
    } catch {
      return 264;
    }
  });
  const [isDraggingChatPanel, setIsDraggingChatPanel] = useState(false);

  const ladderEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('pa_chat_panel_height', String(chatPanelHeight));
    } catch {
      // Ignore storage quota errors
    }
  }, [chatPanelHeight]);

  const startChatPanelResize = (startY: number, initialHeight: number) => {
    setIsDraggingChatPanel(true);
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const maxHeight = Math.max(260, Math.round(window.innerHeight * 0.62));
    const onPointerMove = (moveEvent: PointerEvent) => {
      const next = Math.min(
        maxHeight,
        Math.max(200, initialHeight - (moveEvent.clientY - startY)),
      );
      setChatPanelHeight(Math.round(next));
    };

    const onPointerUp = () => {
      setIsDraggingChatPanel(false);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const privateNeedsModel =
    scope === 'private' && !settings.privateLlm.selectedModel.trim();
  const activeTemplate = promptTemplates[activePromptDomain][promptStyle];
  const composedPrompt = buildPrompt(draft, activeTemplate);
  const activeDomainShortLabel = getPromptDomainShortLabel(activePromptDomain);
  const parsedThreadYear = threadYear ? Number(threadYear) : undefined;
  const isComposerMetadataReady =
    threadName.trim().length > 0 &&
    threadMonth.trim().length > 0 &&
    typeof parsedThreadYear === 'number' &&
    Number.isFinite(parsedThreadYear);
  const composerCombinedPreview =
    threadMonth && parsedThreadYear
      ? `${threadMonth} ${parsedThreadYear}`
      : null;

  const exchanges = useMemo<ConversationExchange[]>(() => {
    const grouped: ConversationExchange[] = [];
    const exchangeById = new Map<string, ConversationExchange>();
    let current: ConversationExchange | null = null;

    for (const turn of turns) {
      if (turn.role === 'user') {
        current = {
          id: turn.id,
          questionTurn: turn,
          replyTurns: [],
        };
        grouped.push(current);
        exchangeById.set(turn.id, current);
      } else {
        const exchange = turn.exchangeId
          ? exchangeById.get(turn.exchangeId)
          : current;
        if (exchange) {
          exchange.replyTurns.push(turn);
          if (!turn.exchangeId) current = null;
        } else {
          grouped.push({
            id: turn.exchangeId || turn.id,
            questionTurn: null,
            replyTurns: [turn],
          });
        }
      }
    }

    return grouped;
  }, [turns]);
  const latestExchange = exchanges[exchanges.length - 1];
  const latestExpectedScopes =
    latestExchange?.questionTurn?.responseScopes ?? [];
  const hasCompletedDualResponse =
    scope === 'public' &&
    latestExpectedScopes.includes('private') &&
    latestExpectedScopes.includes('public') &&
    latestExpectedScopes.every((targetScope) =>
      latestExchange?.replyTurns.some(
        (turn) => turn.scope === targetScope && turn.role === 'assistant',
      ),
    );

  useEffect(() => {
    ladderEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, isSending]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isComposerMetadataReady) {
      setMetadataNotice(
        'Enter Thread Name, Month, and Year before typing and sending in chat.',
      );
      threadNameInputRef.current?.focus();
      return;
    }
    if (!draft.trim() || isSending || parsedThreadYear === undefined) return;
    const promptToSend = composedPrompt;
    const submittedThreadName = threadName.trim();
    setDraft('');
    setThreadName('');
    setMetadataNotice(null);
    onSendMessage({
      text: promptToSend,
      inputMode: 'text',
      threadName: submittedThreadName,
      threadMonth,
      threadYear: parsedThreadYear,
      promptDomain: activePromptDomain,
    });
  };

  const handleStarterPromptClick = (promptText: string) => {
    if (!isComposerMetadataReady || parsedThreadYear === undefined) {
      setDraft(promptText);
      setMetadataNotice(
        'Starter prompt loaded. Enter Thread Name, Month, and Year below to send.',
      );
      threadNameInputRef.current?.focus();
      return;
    }
    const promptToSend = buildPrompt(promptText, activeTemplate);
    const submittedThreadName = threadName.trim();
    setThreadName('');
    setMetadataNotice(null);
    onSendMessage({
      text: promptToSend,
      inputMode: 'text',
      threadName: submittedThreadName,
      threadMonth,
      threadYear: parsedThreadYear,
      promptDomain: activePromptDomain,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(text);
      setCopyError(null);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : 'Unable to copy the conversation.');
    }
  };

  const handleCopyExchange = (exchange: ConversationExchange) => {
    const answers = exchange.replyTurns.filter((turn) => turn.role === 'assistant');
    const content = [
      exchange.questionTurn ? `Question:\n${exchange.questionTurn.content}` : '',
      ...answers.map((turn, index) => {
        const label = answers.length > 1 ? `Answer ${index + 1}` : 'Answer';
        return `${label}:\n${turn.content}`;
      }),
    ]
      .filter(Boolean)
      .join('\n\n');
    void handleCopy(exchange.id, content);
  };

  const handleDownloadExchange = (exchange: ConversationExchange, threadNumber: number) => {
    const questionTurn = exchange.questionTurn;
    const question = questionTurn?.content;
    const expectedScopes = questionTurn?.responseScopes ?? [];
    const answers = exchange.replyTurns
      .filter((turn) => turn.role === 'assistant')
      .sort((left, right) => {
        const leftIndex = expectedScopes.indexOf(left.scope);
        const rightIndex = expectedScopes.indexOf(right.scope);
        return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
      });
    if (!question || answers.length === 0) return;

    const customThreadName = questionTurn?.threadName?.trim();
    const combinedTitle = customThreadName || `Thread #${threadNumber}`;
    const ratingMeta = questionTurn?.threadRating
      ? THREAD_RATING_OPTIONS.find((item) => item.id === questionTurn.threadRating)
      : undefined;
    const safeSlug = combinedTitle
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

    try {
      const answerSections = answers
        .map((turn) => {
          const provider =
            turn.scope === 'private'
              ? 'Private · Ollama'
              : `Public · ${turn.adapterId === 'claude' ? 'Claude' : turn.adapterId === 'fable' ? 'Fable' : 'Gemini'}`;
          const label = `${provider} · ${turn.model}`;
          return `<section class="answer-card"><h2>${escapeHtml(label)}</h2><div class="markdown-content">${renderMarkdownToHtml(turn.content)}</div></section>`;
        })
        .join('\n');
      const metadataItems = [
        customThreadName ? `Thread Name: ${customThreadName}` : '',
        questionTurn?.promptDomain
          ? `Domain: ${getPromptDomainShortLabel(questionTurn.promptDomain)}`
          : '',
        questionTurn?.threadMonth && questionTurn?.threadYear
          ? `Period: ${questionTurn.threadMonth} ${questionTurn.threadYear}`
          : '',
        ratingMeta ? `Rating: ${ratingMeta.label} (${ratingMeta.description})` : '',
      ].filter(Boolean);
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(combinedTitle)}</title>
  <style>
    body { font: 16px/1.6 system-ui, sans-serif; max-width: 1600px; margin: 2rem auto; padding: 0 1rem; color: #172033; }
    .meta { color: #475569; font-size: 0.9rem; margin-top: 0.25rem; }
    .question { margin: 1.5rem 0; padding: 1rem; background: #f1f5f9; border-radius: 0.75rem; }
    .answer-grid { display: grid; grid-template-columns: repeat(${Math.min(answers.length, 2)}, minmax(0, 1fr)); gap: 1rem; align-items: start; }
    .answer-card { min-width: 0; margin: 0; padding: 1rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; background: #f8fafc; }
    .answer-card h2 { margin-top: 0; }
    .markdown-content { overflow-wrap: anywhere; }
    .markdown-content > * + * { margin-top: 0.75rem; }
    .markdown-content p { margin: 0.75rem 0; white-space: pre-wrap; }
    .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6 { margin: 1rem 0 0.35rem; font-weight: 700; line-height: 1.3; }
    .markdown-content h3 { font-size: 1.2rem; }
    .markdown-content h4 { font-size: 1.1rem; }
    .markdown-content h5 { font-size: 1rem; }
    .markdown-content h6 { font-size: 0.95rem; }
    .markdown-content ul, .markdown-content ol { margin: 0.75rem 0; padding-left: 1.5rem; }
    .markdown-content ul { list-style: disc; }
    .markdown-content ol { list-style: decimal; }
    .markdown-content li + li { margin-top: 0.25rem; }
    .markdown-content code { padding: 0.1rem 0.3rem; border-radius: 0.25rem; background: #e2e8f0; font: 0.9em ui-monospace, monospace; }
    .markdown-content em { font-style: italic; }
    .markdown-content del { text-decoration: line-through; }
    .markdown-content a { color: #0369a1; text-decoration: underline; }
    .markdown-content blockquote { margin: 0.75rem 0; border-left: 3px solid #94a3b8; padding-left: 0.9rem; color: #475569; }
    .markdown-content hr { margin: 1rem 0; border: 0; border-top: 1px solid #cbd5e1; }
    .markdown-content .table-wrap { max-width: 100%; overflow-x: auto; }
    .markdown-content table { width: 100%; border-collapse: collapse; }
    .markdown-content th, .markdown-content td { border: 1px solid #cbd5e1; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
    .markdown-content th { background: #e2e8f0; font-weight: 700; }
    .markdown-content .code-block { overflow: hidden; border-radius: 0.6rem; background: #0f172a; color: #f8fafc; }
    .markdown-content .code-language { padding: 0.4rem 0.75rem; border-bottom: 1px solid #334155; color: #cbd5e1; font: 0.75rem ui-monospace, monospace; }
    .markdown-content .code-block pre { overflow-x: auto; margin: 0; padding: 0.8rem; white-space: pre; font: 0.85rem/1.5 ui-monospace, monospace; }
    .markdown-content .code-block code { padding: 0; background: transparent; color: inherit; }
    @media (max-width: 760px) { .answer-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(combinedTitle)}</h1>
    ${metadataItems.length > 0 ? `<p class="meta">${escapeHtml(metadataItems.join(' · '))}</p>` : ''}
    <section class="question"><h2>Question</h2><div class="markdown-content">${renderMarkdownToHtml(question)}</div></section>
    <div class="answer-grid">
      ${answerSections}
    </div>
  </main>
</body>
</html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `PersonalAssistant-${safeSlug || `Thread-${threadNumber}`}-${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadFeedback({
        threadId: exchange.id,
        message: 'Thread downloaded as HTML.',
        isError: false,
      });
    } catch (error) {
      setDownloadFeedback({
        threadId: exchange.id,
        message: error instanceof Error ? error.message : 'Unable to download this thread.',
        isError: true,
      });
    }
  };

  const handleCopyMetadata = (exchange: ConversationExchange, threadNumber: number) => {
    const question = exchange.questionTurn;
    if (!question) return;
    const isDualScope = (question.responseScopes ?? [question.scope]).length > 1;
    const combinedTitle = question.threadName?.trim() || `Thread #${threadNumber}`;
    const ratingMeta = question.threadRating
      ? THREAD_RATING_OPTIONS.find((item) => item.id === question.threadRating)
      : undefined;
    const metadata = [
      `Thread metadata`,
      `Thread name: ${question.threadName?.trim() || '(Not specified)'}`,
      `Domain: ${getPromptDomainShortLabel(question.promptDomain ?? activePromptDomain)}`,
      `Period: ${question.threadMonth && question.threadYear ? `${question.threadMonth} ${question.threadYear}` : '(Not specified)'}`,
      `Period rating: ${ratingMeta ? `${ratingMeta.label} (${ratingMeta.description})` : 'Unrated'}`,
      `Style: ${question.promptStyle ?? promptStyle}`,
      ...(isDualScope
        ? [
            `Private system instruction:\n${question.privateSystemInstruction ?? settings.privateLlm.systemInstruction}`,
            `Private reference context:\n${question.privateCachedContext || '(No reference context configured)'}`,
            `Public system instruction:\n${question.publicSystemInstruction ?? settings.publicLlm.adapters[settings.publicLlm.activeAdapter].systemInstruction}`,
            `Public reference context:\n${question.publicCachedContext || '(No reference context configured)'}`,
          ]
        : [
            `System instruction:\n${question.systemInstruction ?? ''}`,
            `Reference context:\n${question.cachedContext || '(No reference context configured)'}`,
          ]),
      `Question / composed prompt:\n${question.content}`,
    ].join('\n\n');
    void handleCopy(`${exchange.id}-metadata`, metadata);
  };

  const toggleThread = (threadId: string) => {
    setCollapsedThreadIds((previous) => {
      const next = new Set(previous);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const showSourcePrompt = (threadId: string) => {
    setSourcePromptThreadId((previous) => (previous === threadId ? null : threadId));
    setCollapsedThreadIds((previous) => {
      if (!previous.has(threadId)) return previous;
      const next = new Set(previous);
      next.delete(threadId);
      return next;
    });
  };

  const handleDeleteExchange = (exchange: ConversationExchange) => {
    if (isSending && exchange.id === exchanges[exchanges.length - 1]?.id) return;
    if (!window.confirm('Delete only this thread from the current session?')) return;
    onDeleteExchange(exchange.id);
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Light Translucent Scope-Tinted Mist Backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="pa-mist-a absolute -top-28 -left-24 w-[560px] h-[420px] rounded-full blur-3xl opacity-55 dark:opacity-20"
          style={{
            background:
              scope === 'private'
                ? 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(255,255,255,0.10) 65%, transparent 100%)'
                : 'radial-gradient(circle, rgba(125,211,252,0.28) 0%, rgba(255,255,255,0.08) 65%, transparent 100%)',
          }}
        />
        <div
          className="pa-mist-b absolute -bottom-24 -right-24 w-[520px] h-[380px] rounded-full blur-3xl opacity-50 dark:opacity-20"
          style={{
            background:
              scope === 'private'
                ? 'radial-gradient(circle, rgba(167,243,208,0.24) 0%, rgba(255,255,255,0.12) 60%, transparent 100%)'
                : 'radial-gradient(circle, rgba(186,230,253,0.32) 0%, rgba(255,255,255,0.10) 60%, transparent 100%)',
          }}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-b ${
            scope === 'private'
              ? 'from-emerald-50/55 via-white/45 to-emerald-50/50 dark:from-slate-950/30 dark:via-slate-900/20 dark:to-slate-950/40'
              : 'from-sky-50/55 via-white/45 to-sky-50/50 dark:from-slate-950/30 dark:via-slate-900/20 dark:to-slate-950/40'
          }`}
        />
      </div>

      {/* Continual Conversational Bubble Ladder */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto fluent-scroll px-4 sm:px-8 py-6">
        <div
          className={`${hasCompletedDualResponse ? 'w-full max-w-none' : 'max-w-4xl'} mx-auto min-h-full flex flex-col justify-end gap-5`}
        >
          {exchanges.length === 0 ? (
            <div className="my-auto py-8 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
              <div className="flex flex-col items-center text-center">
                <div className="inline-flex items-center justify-center">
                  <ScopeModeSvg
                    scope={scope}
                    className="w-20 h-20 drop-shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                  />
                </div>

                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    title="Open Settings to change the connected model"
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-medium shadow-xs transition-colors ${
                      scope === 'private'
                        ? 'border-emerald-200/90 bg-white/90 text-emerald-900 hover:bg-white'
                        : 'border-sky-200/90 bg-white/90 text-sky-900 hover:bg-white'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        scope === 'private' ? 'bg-emerald-500' : 'bg-sky-500'
                      }`}
                    />
                    <span>
                      {scope === 'private'
                        ? `Connected to Ollama${
                            settings.privateLlm.selectedModel.trim()
                              ? ` · ${settings.privateLlm.selectedModel.trim()}`
                              : ''
                          }`
                        : `Connected to ${
                            settings.publicLlm.activeAdapter === 'gemini'
                              ? 'Gemini'
                              : settings.publicLlm.activeAdapter === 'claude'
                                ? 'Claude'
                                : 'Fable'
                          }${
                            settings.publicLlm.adapters[
                              settings.publicLlm.activeAdapter
                            ].model.trim()
                              ? ` · ${settings.publicLlm.adapters[
                                  settings.publicLlm.activeAdapter
                                ].model.trim()}`
                              : ''
                          }`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="mt-8 w-full grid grid-cols-1 gap-3.5 text-left">
                {STARTER_PROMPTS[scope].map((promptText, idx) => (
                  <motion.button
                    key={`${scope}-${idx}`}
                    type="button"
                    onClick={() => handleStarterPromptClick(promptText)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{
                      opacity: 1,
                      y: [0, -5, 0],
                    }}
                    transition={{
                      opacity: { duration: 0.25, delay: idx * 0.06 },
                      y: {
                        duration: 4 + idx * 0.45,
                        repeat: Infinity,
                        repeatType: 'mirror',
                        ease: 'easeInOut',
                        delay: idx * 0.4,
                      },
                    }}
                    whileHover={{ y: -4, scale: 1.01 }}
                    className={`w-full px-5 py-3.5 rounded-2xl border backdrop-blur-md text-sm text-slate-700 transition-shadow flex items-center justify-between gap-3 ${
                      scope === 'private'
                        ? 'bg-white/75 border-emerald-200/70 shadow-[0_10px_28px_rgba(16,185,129,0.08)] hover:bg-white/95 hover:shadow-[0_14px_32px_rgba(16,185,129,0.14)]'
                        : 'bg-white/75 border-sky-200/70 shadow-[0_10px_28px_rgba(2,132,199,0.08)] hover:bg-white/95 hover:shadow-[0_14px_32px_rgba(2,132,199,0.14)]'
                    }`}
                  >
                    <span className="truncate">{promptText}</span>
                    <ArrowUp className="w-4 h-4 text-slate-400 shrink-0" />
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClearConversation}
                  disabled={isSending}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/85 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Thread</span>
                </button>
              </div>
              {exchanges.map((ex, idx) => {
              const isLast = idx === exchanges.length - 1;
              const expectedScopes =
                ex.questionTurn?.responseScopes ??
                [ex.questionTurn?.scope ?? ex.replyTurns[0]?.scope ?? 'public'];
              const orderedReplies = [...ex.replyTurns].sort(
                (left, right) =>
                  expectedScopes.indexOf(left.scope) - expectedScopes.indexOf(right.scope),
              );
              const pendingScopes =
                isSending && isLast
                  ? expectedScopes.filter(
                      (targetScope) =>
                        !orderedReplies.some((turn) => turn.scope === targetScope),
                    )
                  : [];
              const isDualResponse = expectedScopes.length > 1;
              const isCompletedDualResponse =
                scope === 'public' &&
                expectedScopes.includes('private') &&
                expectedScopes.includes('public') &&
                expectedScopes.every((targetScope) =>
                  orderedReplies.some(
                    (turn) => turn.scope === targetScope && turn.role === 'assistant',
                  ),
                );
              const qTurn = ex.questionTurn;
              const combinedTitle = qTurn?.threadName?.trim() || `Thread #${idx + 1}`;
              const isPublicThread =
                (qTurn?.scope ?? orderedReplies[0]?.scope ?? scope) === 'public';
              const hasAssistantReply = orderedReplies.some(
                (turn) => turn.role === 'assistant',
              );
              const currentRating = qTurn?.threadRating;
              const currentRatingMeta = currentRating
                ? THREAD_RATING_OPTIONS.find((item) => item.id === currentRating)
                : undefined;
              const isSettingsExpanded = settingsThreadId === ex.id;

              return (
                <motion.div
                  key={ex.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex justify-start"
                >
                  <div
                    className={`w-full ${isCompletedDualResponse ? 'max-w-none' : 'max-w-3xl'} cloud-surface rounded-[28px] rounded-bl-lg border border-white/85 dark:border-slate-700/70 shadow-[0_10px_34px_rgba(2,132,199,0.07)] p-4 text-slate-900 dark:text-slate-100 space-y-2.5`}
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {currentRating && currentRatingMeta && (
                            <button
                              type="button"
                              onClick={() =>
                                setSettingsThreadId((prev) => (prev === ex.id ? null : ex.id))
                              }
                              title={`Rated ${currentRatingMeta.starGlyphs} (${currentRatingMeta.label}) — click to change in Thread Settings`}
                              aria-label={`Rated ${currentRatingMeta.starGlyphs} (${currentRatingMeta.label}). Click to change rating.`}
                              className="inline-flex items-center justify-center rounded-full p-0.5 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 shrink-0"
                            >
                              <span
                                aria-hidden="true"
                                className={`h-2.5 w-2.5 rounded-full ${RATING_STYLES[currentRating].dotClass}`}
                              />
                            </button>
                          )}
                          <h2
                            className={`font-display text-sm sm:text-base ${
                              isPublicThread
                                ? 'font-bold text-slate-950 dark:text-white'
                                : 'font-medium text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {combinedTitle}
                          </h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>#{idx + 1}</span>
                          <span aria-hidden="true">·</span>
                          <span>{getPromptDomainShortLabel(qTurn?.promptDomain)}</span>
                          {qTurn?.threadMonth && qTurn?.threadYear && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {qTurn.threadMonth} {qTurn.threadYear}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {downloadFeedback?.threadId === ex.id && (
                          <span
                            role={downloadFeedback.isError ? 'alert' : 'status'}
                            className={`text-xs ${
                              downloadFeedback.isError
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {downloadFeedback.message}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadExchange(ex, idx + 1)}
                          disabled={!ex.questionTurn || !hasAssistantReply}
                          title="Download only this thread as an HTML file"
                          aria-label={`Download ${combinedTitle} as HTML`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/75 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyMetadata(ex, idx + 1)}
                          aria-label={`Copy metadata for ${combinedTitle}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/75 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                        >
                          {copiedId === `${ex.id}-metadata` ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Metadata copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy Metadata</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => showSourcePrompt(ex.id)}
                          disabled={!ex.questionTurn}
                          aria-label={`Show source prompt for ${combinedTitle}`}
                          aria-pressed={sourcePromptThreadId === ex.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/75 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                        >
                          <FileSearch className="h-3.5 w-3.5" />
                          <span>Source Prompt</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSettingsThreadId((prev) => (prev === ex.id ? null : ex.id))
                          }
                          disabled={!ex.questionTurn}
                          aria-label={`Edit thread details for ${combinedTitle}`}
                          aria-expanded={isSettingsExpanded}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 whitespace-nowrap shrink-0 ${
                            isSettingsExpanded
                              ? 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-600 dark:bg-sky-950/60 dark:text-sky-200'
                              : 'border-slate-200/80 bg-white/75 text-slate-600 hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>Thread Settings</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyExchange(ex)}
                          disabled={!hasAssistantReply}
                          aria-label={`Copy question and answers for ${combinedTitle}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/75 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                        >
                          {copiedId === ex.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExchange(ex)}
                          disabled={isSending && isLast}
                          aria-label={`Delete ${combinedTitle}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200/80 bg-white/75 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40 dark:border-red-900/70 dark:bg-slate-800/75 dark:text-red-300 dark:hover:bg-red-950/40 whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleThread(ex.id)}
                          aria-label={`${collapsedThreadIds.has(ex.id) ? 'Expand' : 'Collapse'} ${combinedTitle}`}
                          aria-expanded={!collapsedThreadIds.has(ex.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white/75 text-slate-600 transition-colors hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/75 dark:text-slate-300 dark:hover:bg-slate-700 shrink-0"
                        >
                          {collapsedThreadIds.has(ex.id) ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {!collapsedThreadIds.has(ex.id) && (
                      <div className="space-y-2.5">
                    {isSettingsExpanded && qTurn && (
                      <section
                        aria-label={`Thread settings for ${combinedTitle}`}
                        className="rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-900/75 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            Thread Settings · Name, Period, Domain &amp; Rating
                          </span>
                          <button
                            type="button"
                            onClick={() => setSettingsThreadId(null)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            Done
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="block space-y-1">
                            <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              Thread Name
                            </span>
                            <input
                              type="text"
                              value={qTurn.threadName ?? ''}
                              onChange={(event) =>
                                onUpdateExchangeMetadata(ex.id, {
                                  threadName: event.target.value,
                                })
                              }
                              placeholder="e.g. First Time Checkup"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                          </label>

                          <label className="block space-y-1">
                            <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              Domain
                            </span>
                            <select
                              value={qTurn.promptDomain ?? activePromptDomain}
                              onChange={(event) =>
                                onUpdateExchangeMetadata(ex.id, {
                                  promptDomain: event.target.value as PromptDomain,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {PROMPT_DOMAINS.map((domainId) => (
                                <option key={domainId} value={domainId}>
                                  {getPromptDomainShortLabel(domainId)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block space-y-1">
                            <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              Month
                            </span>
                            <select
                              value={qTurn.threadMonth ?? ''}
                              onChange={(event) =>
                                onUpdateExchangeMetadata(ex.id, {
                                  threadMonth: event.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              <option value="">Select month...</option>
                              {THREAD_MONTHS.map((monthName) => (
                                <option key={monthName} value={monthName}>
                                  {monthName}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block space-y-1">
                            <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              Year
                            </span>
                            <select
                              value={qTurn.threadYear ?? ''}
                              onChange={(event) =>
                                onUpdateExchangeMetadata(ex.id, {
                                  threadYear: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              <option value="">Select year...</option>
                              {THREAD_YEARS.map((yr) => (
                                <option key={yr} value={yr}>
                                  {yr}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Period Rating:
                          </span>
                          {THREAD_RATING_OPTIONS.map((opt) => {
                            const selected = currentRating === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  onUpdateExchangeMetadata(ex.id, {
                                    threadRating: selected ? undefined : opt.id,
                                  })
                                }
                                aria-pressed={selected}
                                aria-label={`${opt.description} (${opt.label})`}
                                title={`${opt.description} (${opt.label})`}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                  selected
                                    ? RATING_STYLES[opt.id].activeClass
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`h-2 w-2 rounded-full ${RATING_STYLES[opt.id].dotClass}`}
                                />
                                <span>{opt.starGlyphs}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {sourcePromptThreadId === ex.id && ex.questionTurn && (
                      <section
                        aria-label={`Source prompt for ${combinedTitle}`}
                        className="rounded-2xl border border-sky-200/80 bg-sky-50/75 px-4 py-3 dark:border-sky-900/70 dark:bg-sky-950/35"
                      >
                        <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-sky-800 dark:text-sky-200">
                          Source Prompt · {combinedTitle} · {ex.questionTurn.promptStyle ?? promptStyle}
                        </div>
                        <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                          {ex.questionTurn.content}
                        </pre>
                      </section>
                    )}
                    {/* User Question Section (Theme Question Color Code) */}
                    {ex.questionTurn && (
                      <div
                        className="rounded-2xl px-4 py-3 border-l-4"
                        style={{
                          backgroundColor: 'var(--pa-q-bg)',
                          borderLeftColor: 'var(--pa-q-accent)',
                        }}
                      >
                        <div
                          className="text-[11px] font-semibold mb-1 tabular-nums"
                          style={{ color: 'var(--pa-q-accent)' }}
                        >
                          You · {formatTime(ex.questionTurn.timestamp)}
                        </div>
                        <div className="text-[15px] font-medium leading-relaxed text-slate-900 dark:text-slate-100">
                          <MessageContent text={ex.questionTurn.content} />
                        </div>
                      </div>
                    )}

                    <div className={isDualResponse ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'}>
                      {orderedReplies.map((replyTurn) => (
                        <ConversationReplyCard
                          key={replyTurn.id}
                          replyTurn={replyTurn}
                          copiedId={copiedId}
                          speech={speech}
                          onCopy={(turn) => handleCopy(turn.id, turn.content)}
                          onOpenSettings={onOpenSettings}
                          formatTime={formatTime}
                        />
                      ))}
                      {pendingScopes.map((targetScope) => (
                        <div
                          key={`pending-${ex.id}-${targetScope}`}
                          role="status"
                          className="min-w-0 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/50 px-4 py-3.5"
                        >
                          <div className="text-[11px] font-semibold mb-2 text-slate-600 dark:text-slate-300">
                            {targetScope === 'private'
                              ? `Private · Ollama · ${settings.privateLlm.selectedModel || 'No model selected'}`
                              : `Public · ${settings.publicLlm.activeAdapter}`}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <Hourglass className="w-4 h-4 animate-spin shrink-0" />
                            <span>Waiting for response...</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {hasAssistantReply && qTurn && !currentRating && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800/70">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Rate this period:
                        </span>
                        <div
                          role="group"
                          aria-label={`Period rating for ${combinedTitle}`}
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          {THREAD_RATING_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                onUpdateExchangeMetadata(ex.id, {
                                  threadRating: opt.id,
                                })
                              }
                              aria-label={`Rate ${opt.description} (${opt.label})`}
                              title={`${opt.description} (${opt.label})`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/85 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                            >
                              <span>{opt.starGlyphs}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            </>
          )}

          <div ref={ladderEndRef} />
        </div>
      </div>

      {/* Horizontal Drag Splitter for Bottom Chat Panel */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Drag up or down to move or resize chat panel"
        aria-valuemin={200}
        aria-valuemax={540}
        aria-valuenow={chatPanelHeight}
        title="Drag up or down to move chat panel (double-click to reset)"
        onPointerDown={(e) => {
          e.preventDefault();
          startChatPanelResize(e.clientY, chatPanelHeight);
        }}
        onDoubleClick={() => setChatPanelHeight(264)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setChatPanelHeight((prev) => Math.min(540, prev + 20));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setChatPanelHeight((prev) => Math.max(200, prev - 20));
          }
        }}
        className="relative z-20 h-3 shrink-0 cursor-row-resize flex items-center justify-center border-t border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-900/45 hover:bg-sky-500/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-colors group select-none"
      >
        <div
          className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 transition-colors ${
            isDraggingChatPanel
              ? 'text-sky-600 dark:text-sky-400'
              : 'text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400'
          }`}
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Bottom Movable Chat Panel */}
      <div
        style={{ '--pa-chat-height': `${chatPanelHeight}px` } as React.CSSProperties}
        className="relative z-10 shrink-0 px-4 sm:px-8 pb-4 pt-1.5 flex flex-col min-h-[200px] md:h-[var(--pa-chat-height)]"
      >
        <div className="max-w-4xl w-full mx-auto flex-1 min-h-0 flex flex-col">
          {copyError && (
            <div
              role="alert"
              className="mb-2 shrink-0 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/55 dark:text-red-200"
            >
              {copyError}
            </div>
          )}

          {privateNeedsModel && (
            <div className="mb-2 shrink-0 flex items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              <span>No Windows Ollama model selected yet.</span>
              <button
                type="button"
                onClick={onOpenSettings}
                className="font-medium underline whitespace-nowrap shrink-0"
              >
                Select Ollama Model
              </button>
            </div>
          )}

          <div className="mb-1.5 shrink-0 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 px-1">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Domain: {activeDomainShortLabel}
            </span>
            {composerCombinedPreview && (
              <>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="font-medium text-sky-700 dark:text-sky-300">
                  {composerCombinedPreview}
                </span>
              </>
            )}
          </div>

          <section
            aria-label="Thread naming and period"
            className="mb-2 shrink-0 rounded-2xl border border-slate-200/85 bg-white/85 px-3.5 py-2 dark:border-slate-700/80 dark:bg-slate-900/70"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 lg:flex lg:items-end">
              <label className="sm:col-span-12 lg:flex-1 lg:min-w-0 block space-y-1">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Thread Name (required before chatting)
                </span>
                <input
                  ref={threadNameInputRef}
                  type="text"
                  value={threadName}
                  onChange={(e) => {
                    setThreadName(e.target.value);
                    if (metadataNotice) setMetadataNotice(null);
                  }}
                  placeholder="e.g., First Time Checkup, 2027 Health Revisit"
                  aria-label="Thread Name"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>

              <label className="sm:col-span-4 lg:w-36 lg:shrink-0 block space-y-1">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Month
                </span>
                <select
                  aria-label="Thread Month"
                  value={threadMonth}
                  onChange={(e) => {
                    setThreadMonth(e.target.value);
                    if (metadataNotice) setMetadataNotice(null);
                  }}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Select month...</option>
                  {THREAD_MONTHS.map((monthName) => (
                    <option key={monthName} value={monthName}>
                      {monthName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-4 lg:w-28 lg:shrink-0 block space-y-1">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Year (1993–2090)
                </span>
                <select
                  aria-label="Thread Year"
                  value={threadYear}
                  onChange={(e) => {
                    setThreadYear(e.target.value);
                    if (metadataNotice) setMetadataNotice(null);
                  }}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Select year...</option>
                  {THREAD_YEARS.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:col-span-4 lg:shrink-0 space-y-1">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Prompt Style
                </span>
                <div
                  role="group"
                  aria-label="Prompt style"
                  className="inline-flex w-full sm:w-auto items-center rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800"
                >
                  {(['formal', 'classic'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => onPromptStyleChange(style)}
                      aria-pressed={promptStyle === style}
                      className={`flex-1 sm:flex-none rounded-[10px] px-3 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                        promptStyle === style
                          ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {metadataNotice && (
              <p
                role="status"
                className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
              >
                {metadataNotice}
              </p>
            )}
          </section>

          <form
            onSubmit={handleSubmit}
            className={`relative flex-1 min-h-[86px] overflow-hidden rounded-[26px] border shadow-[0_12px_36px_rgba(15,23,42,0.08)] px-3.5 py-2.5 flex items-stretch gap-3 transition-colors ${
              scope === 'private'
                ? 'bg-[#f4fbf7]/95 border-emerald-200/95 text-slate-900'
                : 'bg-[#f4f9ff]/95 border-sky-200/95 text-slate-900'
            }`}
          >

            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              disabled={!isComposerMetadataReady}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !isComposerMetadataReady
                  ? 'Enter Thread Name, Month, and Year above before typing in chat...'
                  : scope === 'private'
                    ? 'Murmur privately to your local Ollama model... (Enter to send, Shift+Enter for new line)'
                    : `Broadcast publicly to ${
                        settings.publicLlm.activeAdapter === 'gemini'
                          ? 'Gemini'
                          : settings.publicLlm.activeAdapter === 'claude'
                            ? 'Claude'
                            : 'Fable'
                      }... (Enter to send, Shift+Enter for new line)`
              }
              style={{ fontFamily: 'var(--pa-font-body)' }}
              className="relative z-10 flex-1 h-full min-h-[56px] resize-none bg-transparent px-1 py-1 text-[15px] text-slate-900 placeholder:text-slate-500 focus:outline-none leading-relaxed disabled:cursor-not-allowed disabled:opacity-65"
            />

            <div className="relative z-10 flex shrink-0 items-end">
              <button
                type="submit"
                disabled={!isComposerMetadataReady || !draft.trim() || isSending}
                className="h-11 px-4 rounded-2xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] disabled:opacity-45 disabled:pointer-events-none text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                {isSending ? (
                  <>
                    <Hourglass className="w-4 h-4 animate-spin" />
                    <span>Working</span>
                  </>
                ) : (
                  <>
                    <span>Send</span>
                    <ArrowUp className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
