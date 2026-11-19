import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Hourglass,
  MessageSquarePlus,
  Plus,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConversationScope,
  ConversationTurn,
  EventCardIconType,
  EventCardItem,
  PromptDomain,
  PromptStyle,
  ThreadRating,
  WorkbenchSettings,
} from '../types/workbench';
import type { UseSpeechIOResult } from '../hooks/useSpeechIO';
import {
  deriveThreadTitleFromPrompt,
  parseResponseEventsAndReport,
} from '../utils/eventParser';
import {
  PROMPT_DOMAINS,
  THREAD_MONTHS,
  THREAD_RATING_OPTIONS,
  THREAD_YEARS,
  getPromptDomainShortLabel,
} from '../utils/promptTemplates';

const STARTER_CARDS: Array<{
  prompt: string;
  footer: string;
  icon: EventCardIconType;
}> = [
  {
    prompt: 'Summarize my current phase, key strengths, and immediate focus areas.',
    footer: 'Fast Start',
    icon: 'layers',
  },
  {
    prompt: 'Compare upcoming transitions for career, family, relationships, and health.',
    footer: 'Life & Balance',
    icon: 'compass',
  },
  {
    prompt: 'Organize my upcoming timeline shifts, milestones, and priorities cleanly.',
    footer: 'Planning',
    icon: 'calendar',
  },
];

const RATING_STYLES: Record<
  ThreadRating,
  { dotClass: string; activeClass: string }
> = {
  green: {
    dotClass: 'bg-emerald-600 dark:bg-emerald-400',
    activeClass:
      'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200',
  },
  yellow: {
    dotClass: 'bg-yellow-500 dark:bg-yellow-400',
    activeClass:
      'border-yellow-500 bg-yellow-50 text-yellow-800 dark:border-yellow-500 dark:bg-yellow-950/60 dark:text-yellow-200',
  },
  red: {
    dotClass: 'bg-red-600 dark:bg-red-400',
    activeClass:
      'border-red-500 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/60 dark:text-red-200',
  },
};

export interface SendThreadMessagePayload {
  text: string;
  inputMode: 'text';
  threadName: string;
  threadMonth?: string;
  threadYear?: number;
  promptDomain: PromptDomain;
}

export interface ThreadMetadataPatch {
  threadName?: string;
  threadMonth?: string;
  threadYear?: number;
  promptDomain?: PromptDomain;
  threadRating?: ThreadRating | undefined;
}

interface ConversationExchange {
  id: string;
  questionTurn: ConversationTurn | null;
  replyTurns: ConversationTurn[];
}

interface WorkbenchPageProps {
  scope: ConversationScope;
  settings: WorkbenchSettings;
  turns: ConversationTurn[];
  activePromptDomain: PromptDomain;
  promptStyle: PromptStyle;
  isChatBarOpen: boolean;
  onToggleChatBar: () => void;
  onOpenChatBar: () => void;
  onPromptDomainChange: (domain: PromptDomain) => void;
  onPromptStyleChange: (style: PromptStyle) => void;
  isSending: boolean;
  speech: UseSpeechIOResult;
  onSendMessage: (payload: SendThreadMessagePayload) => void;
  onUpdateExchangeMetadata: (exchangeId: string, patch: ThreadMetadataPatch) => void;
  onClearConversation: () => void;
  onDeleteExchange: (exchangeId: string) => void;
  onOpenSettings: () => void;
  onOpenReportViewer: (exchangeId: string) => void;
}

function EventCategoryEmblem({ icon }: { icon: EventCardIconType }) {
  switch (icon) {
    case 'layers':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <path d="M18 5L31 12L18 19L5 12L18 5Z" fill="#F59E0B" />
          <path d="M6 18L18 24.5L30 18L31 20L18 27L5 20L6 18Z" fill="#D97706" />
          <path d="M6 23.5L18 30L30 23.5L31 25.5L18 32.5L5 25.5L6 23.5Z" fill="#B45309" opacity="0.75" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <rect x="4" y="6" width="28" height="26" rx="5" fill="#2563EB" />
          <rect x="7" y="12" width="22" height="17" rx="2.5" fill="#FFFFFF" />
          <rect x="24" y="22" width="8" height="10" rx="2" fill="#10B981" />
          <rect x="4" y="22" width="7" height="10" rx="2" fill="#F59E0B" />
          <text
            x="18"
            y="24"
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="700"
            fill="#1D4ED8"
            fontFamily="system-ui, sans-serif"
          >
            31
          </text>
        </svg>
      );
    case 'compass':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <circle cx="18" cy="18" r="14" fill="#E0F2FE" />
          <path d="M23.5 12.5L19.8 21.2L12.5 23.5L16.2 14.8L23.5 12.5Z" fill="#0284C7" />
          <path d="M23.5 12.5L19.8 21.2L16.2 14.8L23.5 12.5Z" fill="#38BDF8" />
          <circle cx="18" cy="18" r="2" fill="#FFFFFF" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <rect x="5" y="11" width="26" height="19" rx="4.5" fill="#4F46E5" />
          <path d="M13 11V8.5C13 7.4 13.9 6.5 15 6.5H21C22.1 6.5 23 7.4 23 8.5V11" stroke="#4338CA" strokeWidth="2.5" fill="none" />
          <rect x="5" y="17" width="26" height="3" fill="#818CF8" opacity="0.65" />
          <rect x="15.5" y="16" width="5" height="5" rx="1.2" fill="#FFFFFF" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <path
            d="M18 30.5C18 30.5 6 22.8 6 13.8C6 9.8 9.2 6.8 13 6.8C15.3 6.8 17.2 8 18 9.7C18.8 8 20.7 6.8 23 6.8C26.8 6.8 30 9.8 30 13.8C30 22.8 18 30.5 18 30.5Z"
            fill="#F43F5E"
          />
          <circle cx="12.5" cy="12" r="2.2" fill="#FDA4AF" opacity="0.7" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <path
            d="M18 4.5L29 9V17.5C29 24.4 24.3 29.8 18 32C11.7 29.8 7 24.4 7 17.5V9L18 4.5Z"
            fill="#10B981"
          />
          <path
            d="M14 18.2L16.8 21L22.5 14.8"
            stroke="#FFFFFF"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    case 'sparkles':
    default:
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <path
            d="M18 4L21.2 14.8L32 18L21.2 21.2L18 32L14.8 21.2L4 18L14.8 14.8L18 4Z"
            fill="#8B5CF6"
          />
          <circle cx="28" cy="9" r="2.5" fill="#F59E0B" />
        </svg>
      );
  }
}

function FluentPeekCompanion({ caption }: { caption: string }) {
  return (
    <div
      className="pointer-events-none hidden lg:flex items-end gap-1.5 select-none"
      aria-hidden="true"
    >
      <svg viewBox="0 0 88 76" className="w-20 h-[68px] drop-shadow-[0_12px_20px_rgba(15,23,42,0.16)]">
        <defs>
          <linearGradient id="paBotBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <linearGradient id="paBotVisor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
        </defs>
        {/* Antennas / ears */}
        <rect x="13" y="21" width="6" height="16" rx="3" fill="#94A3B8" />
        <rect x="69" y="21" width="6" height="16" rx="3" fill="#94A3B8" />
        {/* Head */}
        <rect x="18" y="8" width="52" height="40" rx="16" fill="url(#paBotBody)" stroke="#E2E8F0" strokeWidth="1.5" />
        {/* Visor */}
        <rect x="24" y="15" width="40" height="25" rx="10" fill="url(#paBotVisor)" />
        {/* Happy glowing eyes */}
        <path d="M32 25C33.5 22 36.5 22 38 25" stroke="#38BDF8" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M50 25C51.5 22 54.5 22 56 25" stroke="#38BDF8" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M41 30.5H47L45.5 34.5C45 35.5 43 35.5 42.5 34.5L41 30.5Z" fill="#E0F2FE" />
        {/* Shoulders peeking above card */}
        <path d="M22 54C22 48 66 48 66 54L68 74H20L22 54Z" fill="url(#paBotBody)" stroke="#E2E8F0" strokeWidth="1.2" />
        <rect x="30" y="57" width="28" height="3" rx="1.5" fill="#38BDF8" opacity="0.65" />
      </svg>
      <div className="mb-9 rounded-2xl rounded-bl-sm bg-white/95 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/80 shadow-md px-3 py-1.5 text-[11px] font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
        {caption}
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
  isChatBarOpen,
  onToggleChatBar,
  onOpenChatBar,
  onPromptDomainChange,
  onPromptStyleChange,
  isSending,
  onSendMessage,
  onUpdateExchangeMetadata,
  onClearConversation,
  onDeleteExchange,
  onOpenSettings,
  onOpenReportViewer,
}: WorkbenchPageProps) {
  const [draft, setDraft] = useState('');
  const [threadName, setThreadName] = useState('');
  const [threadMonth, setThreadMonth] = useState('');
  const [threadYear, setThreadYear] = useState('');
  const [showComposerOptions, setShowComposerOptions] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const privateNeedsModel =
    scope === 'private' && !settings.privateLlm.selectedModel.trim();
  const parsedThreadYear = threadYear ? Number(threadYear) : undefined;

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

  const activeExchange = exchanges[exchanges.length - 1] ?? null;
  const activeQuestionTurn = activeExchange?.questionTurn ?? null;
  const activeAssistantReply = useMemo(
    () =>
      activeExchange?.replyTurns.find((turn) => turn.role === 'assistant') ?? null,
    [activeExchange],
  );
  const activeErrorReply = useMemo(
    () => activeExchange?.replyTurns.find((turn) => turn.role === 'error') ?? null,
    [activeExchange],
  );

  const eventCards = useMemo<EventCardItem[]>(() => {
    if (!activeAssistantReply) return [];
    if (
      Array.isArray(activeAssistantReply.eventCards) &&
      activeAssistantReply.eventCards.length > 0
    ) {
      return activeAssistantReply.eventCards;
    }
    return parseResponseEventsAndReport(
      activeAssistantReply.content,
      activeQuestionTurn?.promptDomain,
    ).events;
  }, [activeAssistantReply, activeQuestionTurn?.promptDomain]);

  useEffect(() => {
    setCarouselIndex(0);
    setConfirmDeleteId(null);
  }, [activeExchange?.id, eventCards.length]);

  useEffect(() => {
    if (isChatBarOpen) {
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isChatBarOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const questionText = draft.trim();
    if (!questionText || isSending) return;
    const submittedThreadName =
      threadName.trim() || deriveThreadTitleFromPrompt(questionText);
    setDraft('');
    setThreadName('');
    onSendMessage({
      text: questionText,
      inputMode: 'text',
      threadName: submittedThreadName,
      threadMonth: threadMonth.trim() || undefined,
      threadYear:
        typeof parsedThreadYear === 'number' && Number.isFinite(parsedThreadYear)
          ? parsedThreadYear
          : undefined,
      promptDomain: activePromptDomain,
    });
  };

  const handleStarterCardClick = (promptText: string) => {
    setDraft(promptText);
    onOpenChatBar();
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const displayName = settings.profile.displayName?.trim() || 'there';
  const activeProviderLabel =
    scope === 'private'
      ? `Private · Ollama${
          settings.privateLlm.selectedModel.trim()
            ? ` · ${settings.privateLlm.selectedModel.trim()}`
            : ''
        }`
      : `Public · ${
          settings.publicLlm.activeAdapter === 'gemini'
            ? 'Gemini'
            : settings.publicLlm.activeAdapter === 'claude'
              ? 'Claude'
              : 'Fable'
        }`;

  const visibleCount = 3;
  const maxStartIndex = Math.max(0, eventCards.length - visibleCount);
  const clampedStart = Math.min(carouselIndex, maxStartIndex);
  const visibleEvents = eventCards.slice(clampedStart, clampedStart + visibleCount);

  const isWaitingForReply =
    isSending && Boolean(activeQuestionTurn) && !activeAssistantReply && !activeErrorReply;

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Light Translucent Scope-Tinted Atmospheric Backdrop */}
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

      {/* Main Stage Viewport */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto fluent-scroll px-5 sm:px-10 py-8 flex flex-col">
        <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-center">
          {/* STAGE 1: Idle Welcome + 3 Crisp Starter Cards (Model Screenshot Layout) */}
          {!activeExchange && (
            <div className="my-auto py-4 space-y-10">
              <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div className="space-y-3 max-w-2xl">
                  <h1 className="font-display text-3xl sm:text-4xl md:text-[42px] leading-[1.14] tracking-tight text-balance">
                    <span className="font-medium text-slate-400 dark:text-slate-400">
                      Hi {displayName},{' '}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Ready to Achieve Great Things?
                    </span>
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="hover:text-slate-800 dark:hover:text-slate-200 underline decoration-slate-300 underline-offset-4 transition-colors"
                    >
                      {activeProviderLabel}
                    </button>
                    <span aria-hidden="true"> · </span>
                    <span>
                      Ask a question in the bottom-right panel to see event cards here and save the full HTML report on the left.
                    </span>
                  </p>
                </div>

                <FluentPeekCompanion caption="Need a boost?" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {STARTER_CARDS.map((card, idx) => (
                  <motion.button
                    key={card.footer}
                    type="button"
                    onClick={() => handleStarterCardClick(card.prompt)}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: idx * 0.07 }}
                    whileHover={{ y: -4 }}
                    className="group fluent-event-card rounded-3xl bg-white/95 dark:bg-slate-900/90 border border-white/90 dark:border-slate-800/90 p-6 sm:p-7 text-left flex flex-col justify-between min-h-[220px] transition-shadow hover:shadow-[0_22px_48px_-20px_rgba(2,132,199,0.22)]"
                  >
                    <div className="space-y-5">
                      <EventCategoryEmblem icon={card.icon} />
                      <p className="text-[16px] font-medium leading-snug text-slate-900 dark:text-slate-100">
                        {card.prompt}
                      </p>
                    </div>
                    <div className="pt-6 text-xs font-medium text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                      {card.footer}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* STAGE 2: Jumping 3D Fluent Question Bubble while Waiting for LLM Response */}
          {isWaitingForReply && activeQuestionTurn && (
            <div className="my-auto py-8 flex flex-col items-center justify-center text-center">
              <div className="relative flex flex-col items-center max-w-2xl w-full">
                {/* 3D Fluent Jumping Bubble — displays ONLY the user's exact question */}
                <motion.div
                  key={`jumping-${activeQuestionTurn.id}`}
                  initial={{ opacity: 0, scale: 0.86, y: 40 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: [0, -24, 0, -14, 0],
                    rotateZ: [-0.8, 0.8, -0.5, 0.6, -0.8],
                  }}
                  transition={{
                    opacity: { duration: 0.25 },
                    scale: { type: 'spring', stiffness: 260, damping: 20 },
                    y: {
                      duration: 2.1,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                    rotateZ: {
                      duration: 3.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }}
                  className="fluent-3d-bubble relative rounded-[34px] px-8 py-6 sm:px-10 sm:py-7 max-w-xl w-full text-left"
                >
                  {/* Specular Fluent corner highlight */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-2.5 right-7 h-5 w-16 rounded-full bg-white/80 dark:bg-sky-400/20 blur-sm"
                  />
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-semibold text-sky-700 dark:text-sky-300 truncate">
                      {activeQuestionTurn.threadName?.trim() || 'Your Question'}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {activeProviderLabel}
                    </span>
                  </div>
                  <p
                    className="text-lg sm:text-xl font-semibold leading-snug text-slate-900 dark:text-white break-words"
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                  >
                    {activeQuestionTurn.content}
                  </p>
                </motion.div>

                {/* Reactive Floor Shadow beneath Jumping 3D Bubble */}
                <motion.div
                  aria-hidden="true"
                  animate={{
                    scaleX: [1, 0.72, 1, 0.82, 1],
                    opacity: [0.32, 0.16, 0.32, 0.22, 0.32],
                  }}
                  transition={{
                    duration: 2.1,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="mt-5 h-3.5 w-52 rounded-full bg-slate-900/25 dark:bg-sky-400/25 blur-md"
                />

                <div className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Hourglass className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" />
                  <span>Gathering events &amp; formatting HTML report…</span>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 3: Response Arrived — Settled 3D Question Banner + Sliding Event Cards */}
          {!isWaitingForReply && activeExchange && (
            <div className="my-auto py-4 space-y-6">
              {/* Settled 3D Fluent Question Header (NO raw report / NO context shown) */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <motion.div
                  key={`settled-${activeExchange.id}`}
                  initial={{ opacity: 0, y: -12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                  className="fluent-3d-bubble rounded-[26px] px-6 py-4 max-w-2xl"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-semibold text-sky-700 dark:text-sky-300">
                      {activeQuestionTurn?.threadName?.trim() || 'Active Thread'}
                    </span>
                    {activeQuestionTurn?.promptDomain && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{getPromptDomainShortLabel(activeQuestionTurn.promptDomain)}</span>
                      </>
                    )}
                    {activeQuestionTurn?.threadMonth && activeQuestionTurn?.threadYear && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {activeQuestionTurn.threadMonth} {activeQuestionTurn.threadYear}
                        </span>
                      </>
                    )}
                  </div>
                  <h1 className="font-display text-lg sm:text-xl font-semibold leading-snug text-slate-900 dark:text-white">
                    {activeQuestionTurn?.content || 'Assistant Events'}
                  </h1>
                </motion.div>

                <div className="flex items-center gap-3">
                  <FluentPeekCompanion
                    caption={
                      eventCards.length > 0
                        ? `${eventCards.length} event${eventCards.length === 1 ? '' : 's'} ready`
                        : 'Response ready'
                    }
                  />
                </div>
              </div>

              {/* Error State if Provider Failed */}
              {activeErrorReply && !activeAssistantReply && (
                <div className="rounded-3xl border border-red-200 dark:border-red-900/70 bg-red-50/90 dark:bg-red-950/40 p-6 text-red-900 dark:text-red-200 max-w-2xl">
                  <div className="text-xs font-semibold mb-1">
                    {activeErrorReply.scope === 'private'
                      ? 'Private · Ollama Error'
                      : `Public · ${activeErrorReply.adapterId} Error`}
                  </div>
                  <p className="text-sm leading-relaxed">{activeErrorReply.content}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-200 hover:bg-red-100/60 transition-colors"
                    >
                      <SettingsIcon className="w-3.5 h-3.5" />
                      <span>Open Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenChatBar}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium transition-colors"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>Ask Again</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sliding Event Cards Carousel */}
              {activeAssistantReply && eventCards.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      Showing {clampedStart + 1}–{Math.min(clampedStart + visibleCount, eventCards.length)} of{' '}
                      {eventCards.length} events
                    </span>

                    <div className="flex items-center gap-2">
                      {eventCards.length > visibleCount && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCarouselIndex((prev) => Math.max(0, prev - 1))}
                            disabled={clampedStart === 0}
                            aria-label="Previous event cards"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/85 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors shadow-xs"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCarouselIndex((prev) => Math.min(maxStartIndex, prev + 1))
                            }
                            disabled={clampedStart >= maxStartIndex}
                            aria-label="Next event cards"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/85 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors shadow-xs"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <AnimatePresence mode="popLayout" initial={true}>
                    <motion.div
                      key={`${activeExchange.id}-slide-${clampedStart}`}
                      initial={{ opacity: 0, x: 42 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -32 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                    >
                      {visibleEvents.map((evt, idx) => (
                        <motion.article
                          key={evt.id}
                          initial={{ opacity: 0, x: 28, y: 8 }}
                          animate={{ opacity: 1, x: 0, y: 0 }}
                          transition={{
                            duration: 0.28,
                            delay: idx * 0.06,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="fluent-event-card rounded-3xl bg-white/95 dark:bg-slate-900/90 border border-white/90 dark:border-slate-800/90 p-6 sm:p-7 flex flex-col justify-between min-h-[248px]"
                        >
                          <div className="space-y-4">
                            <EventCategoryEmblem icon={evt.icon} />
                            <div className="space-y-1.5">
                              <h2 className="font-display text-base font-semibold leading-snug text-slate-900 dark:text-white">
                                {evt.title}
                              </h2>
                              <p
                                className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300"
                                style={{ fontFamily: 'var(--pa-font-body)' }}
                              >
                                {evt.summary}
                              </p>
                            </div>
                          </div>

                          <div className="pt-5 text-xs font-medium text-slate-400 dark:text-slate-500 flex items-center gap-2 tabular-nums">
                            <span>{evt.category}</span>
                            {evt.timeframe && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{evt.timeframe}</span>
                              </>
                            )}
                          </div>
                        </motion.article>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {/* Subtle Stage Footer Controls: Open Full HTML Report, Rate Period, New Question */}
              {activeAssistantReply && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenReportViewer(activeExchange.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow-xs whitespace-nowrap shrink-0"
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>Open HTML Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClearConversation}
                      disabled={isSending}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/80 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Question</span>
                    </button>
                    {confirmDeleteId === activeExchange.id ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteExchange(activeExchange.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(activeExchange.id)}
                        disabled={isSending}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/75 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  {activeQuestionTurn && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">
                        Rate:
                      </span>
                      {THREAD_RATING_OPTIONS.map((opt) => {
                        const selected = activeQuestionTurn.threadRating === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdateExchangeMetadata(activeExchange.id, {
                                threadRating: selected ? undefined : opt.id,
                              })
                            }
                            aria-pressed={selected}
                            title={`${opt.description} (${opt.label})`}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                              selected
                                ? RATING_STYLES[opt.id].activeClass
                                : 'border-slate-200/85 bg-white/85 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800'
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
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Right Floating & Minimizing Chat Panel */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-end p-4 sm:p-5">
        <AnimatePresence mode="wait">
          {isChatBarOpen ? (
            <motion.section
              key="chat-panel-open"
              aria-label="Floating bottom-right chat composer"
              initial={{ opacity: 0, y: 28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.9 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-full max-w-[430px] rounded-3xl border border-white/90 dark:border-slate-700/85 bg-white/92 dark:bg-slate-900/92 backdrop-blur-2xl shadow-[0_24px_60px_-16px_rgba(15,23,42,0.22)] p-4 space-y-2.5"
            >
              {/* Composer Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Ask Personal Assistant
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeProviderLabel}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowComposerOptions((prev) => !prev)}
                    aria-expanded={showComposerOptions}
                    title="Thread domain, month, year, and prompt style"
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      showComposerOptions
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Options</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleChatBar}
                    aria-label="Minimize chat panel"
                    title="Minimize chat panel"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {privateNeedsModel && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200">
                  <span className="truncate">No Ollama model selected.</span>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="font-semibold underline whitespace-nowrap shrink-0"
                  >
                    Settings
                  </button>
                </div>
              )}

              {/* Thread Name Input */}
              <input
                type="text"
                value={threadName}
                onChange={(e) => setThreadName(e.target.value)}
                placeholder="Thread name (auto-named if blank)"
                aria-label="Thread Name"
                className="w-full rounded-xl border border-slate-200/90 dark:border-slate-700/85 bg-slate-50/80 dark:bg-slate-950/65 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
              />

              {/* Collapsible Domain / Month / Year / Style Options */}
              {showComposerOptions && (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <select
                    aria-label="Prompt Domain"
                    value={activePromptDomain}
                    onChange={(e) => onPromptDomainChange(e.target.value as PromptDomain)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    {PROMPT_DOMAINS.map((domain) => (
                      <option key={domain} value={domain}>
                        Domain: {getPromptDomainShortLabel(domain)}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
                    {(['formal', 'classic'] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => onPromptStyleChange(style)}
                        className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                          promptStyle === style
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  <select
                    aria-label="Thread Month"
                    value={threadMonth}
                    onChange={(e) => setThreadMonth(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="">Month (optional)</option>
                    {THREAD_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Thread Year"
                    value={threadYear}
                    onChange={(e) => setThreadYear(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="">Year (optional)</option>
                    {THREAD_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Question Input Form */}
              <form
                onSubmit={handleSubmit}
                className={`rounded-2xl border px-3 py-2.5 flex items-end gap-2 transition-colors ${
                  scope === 'private'
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200/90 dark:border-emerald-800/70'
                    : 'bg-sky-50/75 dark:bg-slate-950/75 border-sky-200/90 dark:border-slate-700/85'
                }`}
              >
                <textarea
                  ref={textareaRef}
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your question… (Enter to send)"
                  style={{ fontFamily: 'var(--pa-font-body)' }}
                  className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || isSending}
                  aria-label="Send question"
                  className="h-10 px-3.5 rounded-xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] disabled:opacity-45 disabled:pointer-events-none text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  {isSending ? (
                    <Hourglass className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Send</span>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            </motion.section>
          ) : (
            <motion.button
              key="chat-panel-minimized"
              type="button"
              onClick={onOpenChatBar}
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              whileHover={{ y: -2 }}
              className="pointer-events-auto inline-flex items-center gap-2.5 rounded-2xl border border-white/90 dark:border-slate-700/85 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-[0_14px_34px_-10px_rgba(15,23,42,0.22)] hover:shadow-[0_18px_40px_-10px_rgba(2,132,199,0.28)] transition-shadow"
            >
              <MessageSquarePlus className="w-4 h-4" style={{ color: 'var(--pa-accent)' }} />
              <span>{isSending ? 'Thinking…' : 'Ask Assistant'}</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
