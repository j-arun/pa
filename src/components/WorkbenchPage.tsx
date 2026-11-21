import {
  AlertCircle,
  ArrowUp,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Loader2,
  Megaphone,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventCategoryEmblem } from './DomainEmblem';
import { ScopeBackdrop3D } from './ScopeBackdrop3D';
import { WhatsAppSymbol } from './WhatsAppSymbol';
import type {
  AnyAdapterId,
  ConversationScope,
  ConversationTurn,
  EventCardIconType,
  EventCardItem,
  PromptDomain,
  ThreadRating,
  WorkbenchSettings,
} from '../types/workbench';
import type { UseSpeechIOResult } from '../hooks/useSpeechIO';
import {
  deriveThreadTitleFromPrompt,
  extractReadOutSections,
  normalizeEventCardItem,
  parseResponseEventsAndReport,
} from '../utils/eventParser';
import {
  PROMPT_DOMAINS,
  THREAD_RATING_OPTIONS,
  formatShortYearMonth,
  getMonthNameFromNumber,
  getPromptDomainShortLabel,
} from '../utils/promptTemplates';

const FLASH_DURATION_SECONDS = 25;
const FLASH_DURATION_MS = FLASH_DURATION_SECONDS * 1000;

export function formatProviderErrorDetail(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { code?: number; status?: string; message?: string } | string;
      message?: string;
    };
    if (parsed && typeof parsed === 'object') {
      if (parsed.error && typeof parsed.error === 'object') {
        const prefix = [parsed.error.code, parsed.error.status].filter(Boolean).join(' ');
        const msg = parsed.error.message?.trim();
        if (prefix && msg) return `${prefix}: ${msg}`;
        if (msg) return msg;
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    }
  } catch {
    // Keep plain string error message as-is
  }
  return trimmed;
}

export function splitProbabilityAndRating(rawValue?: string): {
  probabilityLine: string;
  ratingLine?: string;
} {
  const cleaned = (rawValue || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return { probabilityLine: 'Not specified' };
  }

  const ratingMatch = cleaned.match(/^(.*?)[\s|·/•–—,-]*\b(rating\b.*)$/i);
  if (ratingMatch) {
    const probPart = ratingMatch[1].replace(/[\s|·/•–—,-]+$/, '').trim();
    const ratingPart = ratingMatch[2].trim();
    if (probPart && ratingPart) {
      return { probabilityLine: probPart, ratingLine: ratingPart };
    }
    return { probabilityLine: ratingPart || probPart };
  }

  const segments = cleaned
    .split(/\s*(?:\||\/|·|•)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    if (/^\d{1,3}%$/.test(segments[1]) && !/\d{1,3}%/.test(segments[0])) {
      const firstLine = `${segments[0]} ${segments[1]}`;
      const rest = segments.slice(2).join(' | ');
      return rest
        ? { probabilityLine: firstLine, ratingLine: rest }
        : { probabilityLine: firstLine };
    }
    return {
      probabilityLine: segments[0],
      ratingLine: segments.slice(1).join(' | '),
    };
  }

  return { probabilityLine: cleaned };
}

export function getEventRatingSortScore(evt: EventCardItem): number {
  const raw = (evt.probability || evt.likelihood || '').toLowerCase().trim();
  if (!raw) return -1;

  const { ratingLine } = splitProbabilityAndRating(raw);
  const ratingFocus = (ratingLine || raw).toLowerCase();

  const checkTier = (text: string): number => {
    if (
      /\b(?:highly\s+likely|very\s+likely|very\s+high|extremely\s+likely|near\s+certain|almost\s+certain|certain)\b/.test(
        text,
      )
    ) {
      return 5000;
    }
    if (/\b(?:moderate[-\s]+to[-\s]+high|moderate[-\s]+high|moderately\s+high)\b/.test(text)) {
      return 3200;
    }
    if (/\b(?:low[-\s]+to[-\s]+moderate|low[-\s]+moderate)\b/.test(text)) {
      return 1600;
    }
    if (/\b(?:unlikely|very\s+low|low|slight|rare|improbable)\b/.test(text)) {
      return 1000;
    }
    if (/\b(?:high|likely|strong|very\s+probable)\b/.test(text)) {
      return 4000;
    }
    if (/\b(?:moderate|medium|possible|probable|fair)\b/.test(text)) {
      return 2200;
    }
    return 0;
  };

  const tierScore = checkTier(ratingFocus) || checkTier(raw);

  let ratingBonus = 0;
  const ratingNumMatch =
    raw.match(/\brating\b\s*[:#\-]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/i) ??
    raw.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(5|10)\b/);
  if (ratingNumMatch) {
    const value = Number(ratingNumMatch[1]);
    const scale = ratingNumMatch[2] ? Number(ratingNumMatch[2]) : value <= 5 ? 5 : 10;
    if (Number.isFinite(value) && scale > 0) {
      ratingBonus = Math.min(1, value / scale) * 900;
    }
  }

  let pctBonus = 0;
  const pctMatches = Array.from(raw.matchAll(/(\d{1,3})\s*%/g))
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  if (pctMatches.length > 0) {
    pctBonus = Math.max(...pctMatches);
  }

  return tierScore + ratingBonus + pctBonus;
}

const DOMAIN_HOME_CARDS: Array<{
  domain: PromptDomain;
  label: string;
  description: string;
  backdropEmoji: string;
  icon: EventCardIconType;
}> = [
  {
    domain: 'astrology',
    label: 'Career',
    description: 'Career trajectory, profession, and timing events.',
    backdropEmoji: '💼',
    icon: 'briefcase',
  },
  {
    domain: 'finance',
    label: 'Family',
    description: 'Family, domestic life, and financial planning events.',
    backdropEmoji: '🏡',
    icon: 'layers',
  },
  {
    domain: 'general',
    label: 'Love',
    description: 'Love, relationships, and emotional connection events.',
    backdropEmoji: '💖',
    icon: 'heart',
  },
  {
    domain: 'health',
    label: 'Health',
    description: 'Health, vitality, and wellness guidance events.',
    backdropEmoji: '🌿',
    icon: 'shield',
  },
];

export interface SendThreadMessagePayload {
  text: string;
  inputMode: 'text';
  threadName: string;
  promptDomain: PromptDomain;
  isFollowUp: boolean;
  targetMonth?: number;
  targetYear?: number;
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

interface DockedOrbQuestionTarget {
  card: (typeof DOMAIN_HOME_CARDS)[number];
  month: number;
  year: number;
  monthKey: string;
  shortMonth: string;
  fullLabel: string;
}

interface WorkbenchPageProps {
  scope: ConversationScope;
  settings: WorkbenchSettings;
  turns: ConversationTurn[];
  isArchivedThread?: boolean;
  activePromptDomain: PromptDomain;
  isChatBarOpen: boolean;
  onToggleChatBar: () => void;
  onOpenChatBar: () => void;
  onPromptDomainChange: (domain: PromptDomain) => void;
  isSending: boolean;
  speech: UseSpeechIOResult;
  onSendMessage: (payload: SendThreadMessagePayload) => void;
  onCancelRequest: () => void;
  onRetryExchange: (exchangeId: string) => void;
  onUpdateExchangeMetadata: (exchangeId: string, patch: ThreadMetadataPatch) => void;
  onClearConversation: () => void;
  onDeleteExchange: (exchangeId: string) => void;
  onOpenSettings: () => void;
  showQuickMonthRainbow?: boolean;
  switchingMonthKey?: string | null;
  monthSwitchError?: string | null;
  onSelectQuickMonth?: (month: number, year: number) => void;
  onDismissMonthSwitchError?: () => void;
}

function WhisperIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="7" r="3" />
      <path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <path d="M15.5 9.5c1 .9 1 2.6 0 3.5" />
      <path d="M18.5 7.5c1.8 1.9 1.8 5.6 0 7.5" />
    </svg>
  );
}

function getDomainIconFromPromptDomain(domain?: PromptDomain): EventCardIconType {
  switch (domain) {
    case 'astrology':
      return 'briefcase';
    case 'finance':
      return 'layers';
    case 'health':
      return 'shield';
    case 'general':
    default:
      return 'heart';
  }
}

function getShortModelLabel(
  adapterId?: AnyAdapterId,
  model?: string,
  turnScope?: ConversationScope,
): string {
  const lower = (model || '').toLowerCase();
  if (lower.includes('fable') || adapterId === 'fable') return 'Fable';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('haiku')) return 'Haiku';
  if (lower.includes('chatgpt') || lower.includes('gpt') || adapterId === 'chatgpt') return 'ChatGPT';
  if (lower.includes('gemini') || adapterId === 'gemini') return 'Gemini';
  if (adapterId === 'claude') return 'Claude';
  if (turnScope === 'private' || adapterId === 'ollama') {
    const clean = (model || 'Ollama').split(':')[0].trim();
    return clean || 'Ollama';
  }
  return 'Assistant';
}

function formatBubbleMonthYear(month?: string, year?: number): string {
  const rawMonth = month?.trim();
  const parsedMonthNum = rawMonth && /^\d+$/.test(rawMonth) ? Number(rawMonth) : undefined;
  const resolvedMonth = parsedMonthNum ? getMonthNameFromNumber(parsedMonthNum) : rawMonth;
  return [resolvedMonth, year].filter(Boolean).join(' ');
}

function ScopeBubbleBadge({
  turnScope,
  adapterId,
  model,
}: {
  turnScope: ConversationScope;
  adapterId?: AnyAdapterId;
  model?: string;
}) {
  const isPrivate = turnScope === 'private';
  const shortModel = getShortModelLabel(adapterId, model, turnScope);
  return (
    <span
      title={`${shortModel} (${isPrivate ? 'Private' : 'Public'})`}
      aria-label={`${shortModel} (${isPrivate ? 'Private' : 'Public'})`}
      className={`inline-flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight ${
        isPrivate
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-sky-700 dark:text-sky-300'
      }`}
    >
      <span>{shortModel}</span>
      {isPrivate ? (
        <WhisperIcon className="w-5 h-5 shrink-0" />
      ) : (
        <Megaphone className="w-5 h-5 shrink-0" />
      )}
    </span>
  );
}



export function WorkbenchPage({
  scope,
  settings,
  turns,
  isArchivedThread = false,
  activePromptDomain,
  isChatBarOpen,
  onToggleChatBar,
  onOpenChatBar,
  onPromptDomainChange,
  isSending,
  onSendMessage,
  onCancelRequest,
  onRetryExchange,
  onUpdateExchangeMetadata,
  onClearConversation,
  onDeleteExchange,
  onOpenSettings,
  showQuickMonthRainbow = true,
  switchingMonthKey = null,
  monthSwitchError = null,
  onSelectQuickMonth,
  onDismissMonthSwitchError,
}: WorkbenchPageProps) {
  const [draft, setDraft] = useState('');
  const [threadName, setThreadName] = useState('');
  const [selectedExchangeIndex, setSelectedExchangeIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [flashedEvent, setFlashedEvent] = useState<{
    card: EventCardItem;
    openedAt: number;
  } | null>(null);

  // Stage 1 Interactive Orb-to-Month Drag & Round Question Bubble State
  const [activeDrag, setActiveDrag] = useState<{
    card: (typeof DOMAIN_HOME_CARDS)[number];
    originX: number;
    originY: number;
    size: number;
  } | null>(null);
  const [returningOrb, setReturningOrb] = useState<{
    card: (typeof DOMAIN_HOME_CARDS)[number];
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    size: number;
  } | null>(null);
  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [dockedTarget, setDockedTarget] = useState<DockedOrbQuestionTarget | null>(null);
  const [bubbleQuestion, setBubbleQuestion] = useState('');
  const [bubbleValidationError, setBubbleValidationError] = useState<string | null>(null);
  const [bubbleShakeTick, setBubbleShakeTick] = useState(0);
  const [dropHintVisible, setDropHintVisible] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bubbleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const monthButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const hintTimerRef = useRef<number | null>(null);

  const privateNeedsModel =
    scope === 'private' && !settings.privateLlm.selectedModel.trim();

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

  // Always jump view to newest exchange when exchanges count changes
  useEffect(() => {
    if (exchanges.length > 0) {
      setSelectedExchangeIndex(exchanges.length - 1);
    } else {
      setSelectedExchangeIndex(0);
    }
  }, [exchanges.length]);

  const rootExchange = exchanges[0] ?? null;
  const clampedExchangeIdx = Math.min(
    Math.max(0, selectedExchangeIndex),
    Math.max(0, exchanges.length - 1),
  );
  const activeExchange = exchanges[clampedExchangeIdx] ?? null;
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
    const parsedFromReport = parseResponseEventsAndReport(
      activeAssistantReply.content,
      activeQuestionTurn?.promptDomain,
    ).events;
    const raw =
      parsedFromReport.length > 0
        ? parsedFromReport
        : Array.isArray(activeAssistantReply.eventCards)
          ? activeAssistantReply.eventCards
          : [];
    return raw
      .map((evt, idx) => normalizeEventCardItem(evt, idx))
      .map((evt, idx) => ({ evt, idx, score: getEventRatingSortScore(evt) }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
      .map((entry) => entry.evt);
  }, [activeAssistantReply, activeQuestionTurn?.promptDomain]);

  const readOutSections = useMemo(
    () =>
      activeAssistantReply
        ? extractReadOutSections(activeAssistantReply.content)
        : null,
    [activeAssistantReply],
  );

  useEffect(() => {
    setCarouselIndex(0);
    setConfirmDeleteId(null);
    setFlashedEvent(null);
  }, [activeExchange?.id, eventCards.length]);

  useEffect(() => {
    if (!flashedEvent) return;
    const timeoutId = window.setTimeout(() => {
      setFlashedEvent(null);
    }, FLASH_DURATION_MS);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFlashedEvent(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [flashedEvent]);

  const openEventFlash = (card: EventCardItem) => {
    setFlashedEvent({ card, openedAt: Date.now() });
  };

  useEffect(() => {
    if (isChatBarOpen) {
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isChatBarOpen]);

  const hasActiveThread = exchanges.length > 0;
  const isThreadFinalized = Boolean(
    isArchivedThread || rootExchange?.questionTurn?.isFinalized,
  );
  const activeMonthNum =
    settings.contextCache.activeMonth ?? new Date().getMonth() + 1;
  const activeYearNum =
    settings.contextCache.activeYear ?? new Date().getFullYear();
  const activeRefPeriod = formatShortYearMonth(activeMonthNum, activeYearNum);
  const lockedFollowUpDomain =
    rootExchange?.questionTurn?.promptDomain ?? activePromptDomain;
  const effectiveComposerDomain = hasActiveThread
    ? lockedFollowUpDomain
    : activePromptDomain;
  const composerPeriodLabel =
    (hasActiveThread
      ? formatShortYearMonth(
          rootExchange?.questionTurn?.threadMonth,
          rootExchange?.questionTurn?.threadYear,
        )
      : undefined) || activeRefPeriod;

  const stageQuickMonths = useMemo(() => {
    const archOffsets = [
      'sm:translate-y-5',
      'sm:translate-y-1.5',
      'sm:-translate-y-1.5',
      'sm:-translate-y-1.5',
      'sm:translate-y-1.5',
      'sm:translate-y-5',
    ];
    const now = new Date();
    return Array.from({ length: 6 }, (_, idx) => {
      const dt = new Date(now.getFullYear(), now.getMonth() + idx, 1);
      const month = dt.getMonth() + 1;
      const year = dt.getFullYear();
      const monthName = getMonthNameFromNumber(month) ?? '';
      return {
        key: `${year}-${String(month).padStart(2, '0')}`,
        month,
        year,
        shortMonth: monthName.slice(0, 3),
        fullLabel: `${monthName} ${year}`,
        arcClass: archOffsets[idx],
      };
    });
  }, []);

  useEffect(() => {
    if (exchanges.length > 0) {
      dragCleanupRef.current?.();
      setActiveDrag(null);
      setReturningOrb(null);
      setHoveredMonthKey(null);
      setDockedTarget(null);
      setBubbleQuestion('');
      setBubbleValidationError(null);
    }
  }, [exchanges.length]);

  useEffect(() => {
    if (!dockedTarget) return;
    const focusTimer = window.setTimeout(() => {
      bubbleInputRef.current?.focus();
    }, 120);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDockedTarget(null);
        setBubbleValidationError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dockedTarget]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const hitTestMonthOrb = useCallback(
    (clientX: number, clientY: number): string | null => {
      const magneticPadding = 22;
      let bestKey: string | null = null;
      let bestDistance = Infinity;

      for (const item of stageQuickMonths) {
        const el = monthButtonRefs.current[item.key];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left - magneticPadding &&
          clientX <= rect.right + magneticPadding &&
          clientY >= rect.top - magneticPadding &&
          clientY <= rect.bottom + magneticPadding
        ) {
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(clientX - cx, clientY - cy);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestKey = item.key;
          }
        }
      }
      return bestKey;
    },
    [stageQuickMonths],
  );

  const handleOrbPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    card: (typeof DOMAIN_HOME_CARDS)[number],
  ) => {
    if (isSending || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();

    const buttonRect = e.currentTarget.getBoundingClientRect();
    const originX = buttonRect.left + buttonRect.width / 2;
    const originY = buttonRect.top + buttonRect.height / 2;
    const offsetX = e.clientX - originX;
    const offsetY = e.clientY - originY;
    const startX = e.clientX;
    const startY = e.clientY;
    const orbSize = buttonRect.width;
    dragX.set(originX);
    dragY.set(originY);

    let hasStartedDrag = false;
    let currentHoverKey: string | null = null;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const finishDrag = (moveEvent: PointerEvent, cancelled: boolean) => {
      cleanupListeners();
      document.body.style.userSelect = prevUserSelect;

      if (!hasStartedDrag) {
        if (!cancelled) {
          setDropHintVisible(true);
          if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
          hintTimerRef.current = window.setTimeout(() => setDropHintVisible(false), 2600);
        }
        return;
      }

      const dropCenterX = moveEvent.clientX - offsetX;
      const dropCenterY = moveEvent.clientY - offsetY;
      const finalHoverKey =
        !cancelled &&
        (hitTestMonthOrb(dropCenterX, dropCenterY) ??
          hitTestMonthOrb(moveEvent.clientX, moveEvent.clientY));
      const targetMonth = finalHoverKey
        ? stageQuickMonths.find((m) => m.key === finalHoverKey)
        : undefined;

      setActiveDrag(null);
      setHoveredMonthKey(null);

      if (targetMonth && !cancelled) {
        setReturningOrb(null);
        setDropHintVisible(false);
        setBubbleQuestion('');
        setBubbleValidationError(null);
        onPromptDomainChange(card.domain);
        onSelectQuickMonth?.(targetMonth.month, targetMonth.year);
        setDockedTarget({
          card,
          month: targetMonth.month,
          year: targetMonth.year,
          monthKey: targetMonth.key,
          shortMonth: targetMonth.shortMonth,
          fullLabel: targetMonth.fullLabel,
        });
      } else {
        setReturningOrb({
          card,
          fromX: dropCenterX,
          fromY: dropCenterY,
          toX: originX,
          toY: originY,
          size: orbSize,
        });
      }
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!hasStartedDrag) {
        if (dist < 6) return;
        hasStartedDrag = true;
        setReturningOrb(null);
        setDropHintVisible(false);
        setActiveDrag({
          card,
          originX,
          originY,
          size: orbSize,
        });
      }

      const nextCenterX = moveEvent.clientX - offsetX;
      const nextCenterY = moveEvent.clientY - offsetY;
      dragX.set(nextCenterX);
      dragY.set(nextCenterY);

      const nextHover =
        hitTestMonthOrb(nextCenterX, nextCenterY) ??
        hitTestMonthOrb(moveEvent.clientX, moveEvent.clientY);
      if (nextHover !== currentHoverKey) {
        currentHoverKey = nextHover;
        setHoveredMonthKey(nextHover);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => finishDrag(upEvent, false);
    const onPointerCancel = (cancelEvent: PointerEvent) => finishDrag(cancelEvent, true);

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanupListeners;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const handleBubbleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dockedTarget || isSending) return;
    const trimmed = bubbleQuestion.trim();
    if (!trimmed) {
      setBubbleValidationError('Please enter a question');
      setBubbleShakeTick((prev) => prev + 1);
      bubbleInputRef.current?.focus();
      return;
    }

    const target = dockedTarget;
    setBubbleValidationError(null);
    setBubbleQuestion('');
    setDockedTarget(null);
    onSendMessage({
      text: trimmed,
      inputMode: 'text',
      threadName: target.card.label,
      promptDomain: target.card.domain,
      isFollowUp: false,
      targetMonth: target.month,
      targetYear: target.year,
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const questionText = draft.trim();
    if (!questionText || isSending) return;
    const isFollowUp = hasActiveThread;
    if (isFollowUp && isThreadFinalized) return;
    const submittedThreadName = isFollowUp
      ? rootExchange?.questionTurn?.threadName?.trim() ||
        deriveThreadTitleFromPrompt(questionText)
      : threadName.trim() || deriveThreadTitleFromPrompt(questionText);
    setDraft('');
    if (!isFollowUp) setThreadName('');
    onSendMessage({
      text: questionText,
      inputMode: 'text',
      threadName: submittedThreadName,
      promptDomain: effectiveComposerDomain,
      isFollowUp,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const visibleCount = 3;
  const maxStartIndex = Math.max(0, eventCards.length - visibleCount);
  const clampedStart = Math.min(carouselIndex, maxStartIndex);
  const visibleEvents = eventCards.slice(clampedStart, clampedStart + visibleCount);

  const isWaitingForReply =
    isSending && Boolean(activeQuestionTurn) && !activeAssistantReply && !activeErrorReply;

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 3D Projected Canvas Backdrop (Private: Vault / Sanctuary · Public: Open Constellation) */}
      <ScopeBackdrop3D scope={scope} isSending={isSending} />

      {/* Top-Right Enlarged & Animated New Thread Icon (shown in main pane only after response arrives) */}
      {!isWaitingForReply && activeExchange && (activeAssistantReply || activeErrorReply) && (
        <div className="absolute top-4 right-5 sm:top-5 sm:right-8 z-20">
          <motion.span
            aria-hidden="true"
            animate={{
              scale: [1, 1.24, 1],
              opacity: [0.42, 0, 0.42],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{ backgroundColor: 'var(--pa-accent)' }}
          />
          <motion.button
            type="button"
            onClick={onClearConversation}
            disabled={isSending}
            initial={{ opacity: 0, scale: 0.85, y: -6 }}
            animate={{
              opacity: 1,
              y: [0, -3, 0],
              scale: [1, 1.04, 1],
            }}
            transition={{
              opacity: { duration: 0.2 },
              y: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
              scale: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
            }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.94 }}
            title="Start a new thread"
            aria-label="Start a new thread"
            className="relative inline-flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 border-white/95 dark:border-slate-700/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-lg hover:shadow-xl hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <motion.span
              animate={{ rotate: [0, -6, 6, -3, 0] }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="inline-flex items-center justify-center"
            >
              <WhatsAppSymbol className="w-9 h-9 sm:w-10 sm:h-10" />
            </motion.span>
          </motion.button>
        </div>
      )}

      {/* Main Stage Viewport */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto fluent-scroll px-5 sm:px-10 py-4 sm:py-6 flex flex-col">
        <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-center">
          {/* STAGE 1: Enlarged Rainbow 6-Month Drop Targets + Movable Topic Orbs + Round Question Bubble */}
          {!activeExchange && (() => {
            const SPARKLE_SPOTS = [
              { left: '10%', top: '52%', delay: 0 },
              { left: '27%', top: '22%', delay: 0.55 },
              { left: '48%', top: '8%', delay: 1.1 },
              { left: '68%', top: '16%', delay: 0.35 },
              { left: '86%', top: '44%', delay: 0.85 },
            ];
            const isDraggingOrb = Boolean(activeDrag);

            return (
            <div className="my-auto py-3 space-y-8">
              <AnimatePresence>
                {showQuickMonthRainbow && (
                  <motion.div
                    key="quick-month-rainbow"
                    initial={{ opacity: 0, y: -12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.95 }}
                    transition={{ duration: 0.32, ease: 'easeOut' }}
                    className="relative w-full max-w-4xl mx-auto pt-3 pb-7"
                  >
                    {/* Gently Breathing & Moving Theme-Matched Layered Rainbow Arc */}
                    <motion.div
                      aria-hidden="true"
                      animate={{ y: [0, -3.5, 0] }}
                      transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="pointer-events-none hidden sm:block absolute inset-x-3 top-1 h-[94px] overflow-visible"
                    >
                      <svg
                        viewBox="0 0 900 96"
                        preserveAspectRatio="none"
                        className="w-full h-full overflow-visible"
                      >
                        <defs>
                          <linearGradient id="paThemeRainbowBand1" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="var(--pa-rainbow-edge)" stopOpacity="0.22" />
                            <stop offset="28%" stopColor="var(--pa-accent)" stopOpacity="0.86" />
                            <stop offset="50%" stopColor="var(--pa-rainbow-peak)" stopOpacity="0.95" />
                            <stop offset="72%" stopColor="var(--pa-accent)" stopOpacity="0.86" />
                            <stop offset="100%" stopColor="var(--pa-rainbow-edge)" stopOpacity="0.22" />
                          </linearGradient>
                          <linearGradient id="paThemeRainbowBand2" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="var(--pa-accent)" stopOpacity="0.14" />
                            <stop offset="50%" stopColor="var(--pa-rainbow-edge)" stopOpacity="0.62" />
                            <stop offset="100%" stopColor="var(--pa-accent)" stopOpacity="0.14" />
                          </linearGradient>
                        </defs>
                        {/* Outer Soft Theme Aura Band */}
                        <path
                          d="M 42 78 C 245 8, 655 8, 858 78"
                          fill="none"
                          stroke="url(#paThemeRainbowBand1)"
                          strokeWidth="16"
                          strokeLinecap="round"
                          opacity="0.34"
                          style={{ filter: 'blur(9px)' }}
                        />
                        {/* Rainbow Ribbons in Active Scope Tones */}
                        <path
                          d="M 42 74 C 245 4, 655 4, 858 74"
                          fill="none"
                          stroke="url(#paThemeRainbowBand1)"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          opacity="0.72"
                        />
                        <path
                          d="M 52 80 C 250 13, 650 13, 848 80"
                          fill="none"
                          stroke="url(#paThemeRainbowBand2)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          opacity="0.62"
                        />
                        <path
                          d="M 62 85 C 255 21, 645 21, 838 85"
                          fill="none"
                          stroke="var(--pa-rainbow-hairline)"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          opacity="0.7"
                        />
                      </svg>

                      {/* Glittering Twinkling Sparkles Along the Rainbow Arc */}
                      {SPARKLE_SPOTS.map((spot, sIdx) => (
                        <motion.span
                          key={sIdx}
                          style={{ left: spot.left, top: spot.top }}
                          animate={{
                            opacity: [0.18, 0.95, 0.18],
                            scale: [0.7, 1.25, 0.7],
                            rotate: [0, 30, 0],
                          }}
                          transition={{
                            duration: 2.1 + (sIdx % 3) * 0.45,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: spot.delay,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center justify-center"
                        >
                          <Sparkles
                            className="w-3 h-3"
                            style={{
                              color: 'var(--pa-accent-text)',
                              filter: 'drop-shadow(0 0 6px var(--pa-bubble-rim))',
                            }}
                          />
                        </motion.span>
                      ))}
                    </motion.div>

                    <div
                      className="relative z-10 grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4 items-center justify-items-center"
                      role="group"
                      aria-label="Prediction month buckets"
                    >
                      {stageQuickMonths.map((item, idx) => {
                        const isDropHovered = hoveredMonthKey === item.key;
                        const isDockedMonth = dockedTarget?.monthKey === item.key;
                        const isActive =
                          isDockedMonth ||
                          (!dockedTarget &&
                            item.month === activeMonthNum &&
                            item.year === activeYearNum);
                        const isLoadingThis = switchingMonthKey === item.key;
                        const isAnySwitching = Boolean(switchingMonthKey);
                        const bucketGradId = `paBucketBody-${idx}`;
                        const rimGradId = `paBucketRim-${idx}`;
                        const fillWaveId = `paBucketFill-${idx}`;
                        return (
                          <div
                            key={item.key}
                            className={`w-full flex justify-center ${item.arcClass}`}
                          >
                            <motion.button
                              ref={(el) => {
                                monthButtonRefs.current[item.key] = el;
                              }}
                              type="button"
                              disabled={isSending || isAnySwitching}
                              onClick={() => {
                                onSelectQuickMonth?.(item.month, item.year);
                                if (dockedTarget) {
                                  setDockedTarget((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          month: item.month,
                                          year: item.year,
                                          monthKey: item.key,
                                          shortMonth: item.shortMonth,
                                          fullLabel: item.fullLabel,
                                        }
                                      : null,
                                  );
                                }
                              }}
                              title={`Drop a topic ball into ${item.fullLabel}`}
                              aria-label={`${item.fullLabel} bucket`}
                              aria-pressed={isActive}
                              animate={{
                                scale: isDropHovered
                                  ? 1.15
                                  : isDockedMonth
                                    ? 1.07
                                    : isDraggingOrb
                                      ? 1.04
                                      : 1,
                                y: isDropHovered ? -8 : [0, -4.5, 0],
                                rotate: isDropHovered ? [0, -2, 2, 0] : 0,
                              }}
                              transition={{
                                scale: { type: 'spring', stiffness: 360, damping: 20 },
                                y: isDropHovered
                                  ? { type: 'spring', stiffness: 360, damping: 20 }
                                  : {
                                      duration: 2.7,
                                      repeat: Infinity,
                                      ease: 'easeInOut',
                                      delay: idx * 0.24,
                                    },
                                rotate: { duration: 0.35, ease: 'easeInOut' },
                              }}
                              whileHover={{ scale: 1.09, y: -6 }}
                              whileTap={{ scale: 0.96 }}
                              className="group relative w-[94px] sm:w-[108px] h-[84px] sm:h-[94px] inline-flex flex-col items-center justify-end pb-2.5 text-slate-800 dark:text-slate-100 select-none cursor-pointer disabled:opacity-65 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-accent)] rounded-2xl"
                              style={{
                                filter: isDropHovered
                                  ? 'drop-shadow(0 0 18px var(--pa-bubble-rim))'
                                  : isActive
                                    ? 'drop-shadow(0 0 12px var(--pa-bubble-glow))'
                                    : 'drop-shadow(0 8px 14px var(--pa-bubble-glow))',
                              }}
                            >
                              {/* Dynamic Open-Top Glowing Bucket SVG Vessel */}
                              <svg
                                viewBox="0 0 120 102"
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 w-full h-full overflow-visible"
                              >
                                <defs>
                                  <linearGradient id={bucketGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop
                                      offset="0%"
                                      stopColor={isDropHovered || isActive ? 'var(--pa-accent)' : 'var(--pa-rainbow-edge)'}
                                      stopOpacity={isDropHovered ? '0.32' : isActive ? '0.24' : '0.14'}
                                    />
                                    <stop
                                      offset="52%"
                                      stopColor="var(--pa-rainbow-peak)"
                                      stopOpacity={isDropHovered ? '0.20' : '0.09'}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="var(--pa-accent)"
                                      stopOpacity={isDropHovered ? '0.34' : '0.18'}
                                    />
                                  </linearGradient>
                                  <linearGradient id={rimGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="var(--pa-rainbow-edge)" stopOpacity="0.8" />
                                    <stop offset="50%" stopColor="var(--pa-rainbow-peak)" stopOpacity="1" />
                                    <stop offset="100%" stopColor="var(--pa-rainbow-edge)" stopOpacity="0.8" />
                                  </linearGradient>
                                  <linearGradient id={fillWaveId} x1="0%" y1="100%" x2="0%" y2="0%">
                                    <stop offset="0%" stopColor="var(--pa-accent)" stopOpacity={isDropHovered ? '0.46' : isDockedMonth ? '0.36' : '0.18'} />
                                    <stop offset="100%" stopColor="var(--pa-rainbow-edge)" stopOpacity="0.04" />
                                  </linearGradient>
                                </defs>

                                {/* Bucket Tapered Body */}
                                <path
                                  d="M 14 21 L 26 84 Q 60 97 94 84 L 106 21 Z"
                                  fill={`url(#${bucketGradId})`}
                                  className="transition-all duration-200"
                                />

                                {/* Dynamic Rising Liquid/Glow Level inside Bucket when Dragging, Hovered, or Docked */}
                                <motion.path
                                  d={
                                    isDropHovered || isDockedMonth
                                      ? 'M 19 42 Q 60 49 101 42 L 94 84 Q 60 97 26 84 Z'
                                      : 'M 23 60 Q 60 66 97 60 L 94 84 Q 60 97 26 84 Z'
                                  }
                                  fill={`url(#${fillWaveId})`}
                                  animate={{
                                    opacity: isDropHovered ? [0.75, 1, 0.75] : isDraggingOrb ? [0.45, 0.75, 0.45] : 0.65,
                                  }}
                                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                />

                                {/* Outer Bucket Glass Wall Outline */}
                                <path
                                  d="M 14 21 L 26 84 Q 60 97 94 84 L 106 21"
                                  fill="none"
                                  stroke={isDropHovered || isActive ? 'var(--pa-accent)' : 'var(--pa-rainbow-edge)'}
                                  strokeOpacity={isDropHovered ? 0.95 : isActive ? 0.85 : isDraggingOrb ? 0.72 : 0.55}
                                  strokeWidth={isDropHovered ? 2.4 : 1.7}
                                  strokeDasharray={isDraggingOrb && !isDropHovered ? '5 3' : undefined}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />

                                {/* Subtle Specular Glass Rib */}
                                <path
                                  d="M 26 30 L 34 79"
                                  fill="none"
                                  stroke="white"
                                  strokeOpacity="0.35"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />

                                {/* Open Bucket Mouth (Elliptical Cavity + Glowing Rim Lip) */}
                                <motion.ellipse
                                  cx="60"
                                  cy="21"
                                  rx={isDropHovered ? 49 : isDraggingOrb ? 47.5 : 46}
                                  ry={isDropHovered ? 13 : isDraggingOrb ? 11.5 : 9.5}
                                  fill="var(--pa-q-bg)"
                                  stroke={`url(#${rimGradId})`}
                                  strokeWidth={isDropHovered ? 2.6 : isActive ? 2.1 : 1.6}
                                  animate={{
                                    ry: isDropHovered ? 13 : isDraggingOrb ? [10.5, 12.2, 10.5] : 9.5,
                                  }}
                                  transition={{
                                    duration: 1.4,
                                    repeat: isDraggingOrb && !isDropHovered ? Infinity : 0,
                                    ease: 'easeInOut',
                                  }}
                                />

                                {/* Inner Rim Highlight */}
                                <ellipse
                                  cx="60"
                                  cy="21"
                                  rx={isDropHovered ? 41 : 38}
                                  ry={isDropHovered ? 8.2 : 6}
                                  fill="none"
                                  stroke="white"
                                  strokeOpacity={isDropHovered ? 0.52 : 0.25}
                                  strokeWidth="1"
                                />
                              </svg>

                              {/* Subtle Dropped Emblem Peek inside Mouth while Question Bubble is Open */}
                              {isDockedMonth && dockedTarget && (
                                <motion.span
                                  initial={{ scale: 0.4, y: -10, opacity: 0 }}
                                  animate={{ scale: 0.62, y: -2, opacity: 1 }}
                                  className="relative z-10 -mb-1 pointer-events-none"
                                >
                                  <EventCategoryEmblem icon={dockedTarget.card.icon} />
                                </motion.span>
                              )}

                              {/* Month & Year Label inside Bucket Body */}
                              <span className="relative z-10 inline-flex flex-col items-center leading-tight">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  {isLoadingThis && (
                                    <Loader2
                                      className="w-3 h-3 animate-spin shrink-0"
                                      style={{ color: 'var(--pa-accent)' }}
                                    />
                                  )}
                                  <span
                                    className="text-sm sm:text-[15px] font-bold tracking-tight"
                                    style={
                                      isDropHovered || isActive
                                        ? { color: 'var(--pa-accent-text)' }
                                        : undefined
                                    }
                                  >
                                    {item.shortMonth}
                                  </span>
                                </span>
                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 opacity-80 tabular-nums">
                                  {item.year}
                                </span>
                              </span>
                            </motion.button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Red Alert if Month Toggling / Reference Context Sync is Unavailable */}
              {monthSwitchError && (
                <div
                  role="alert"
                  className="mx-auto max-w-md rounded-2xl border border-red-300 dark:border-red-800/90 bg-red-50/95 dark:bg-red-950/70 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-200 shadow-sm flex items-center justify-between gap-3"
                >
                  <span className="inline-flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>{monthSwitchError}</span>
                  </span>
                  {onDismissMonthSwitchError && (
                    <button
                      type="button"
                      onClick={onDismissMonthSwitchError}
                      aria-label="Dismiss alert"
                      className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <AnimatePresence mode="wait">
                {dockedTarget ? (
                  <motion.div
                    key={`docked-question-bubble-${dockedTarget.card.domain}-${dockedTarget.monthKey}`}
                    initial={{ opacity: 0, scale: 0.76, y: -18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.84, y: 14 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                    className="py-2 flex flex-col items-center justify-center text-center"
                  >
                    <motion.div
                      animate={{
                        y: [0, -10, 0, -5, 0],
                        x: bubbleShakeTick > 0 ? [0, -7, 7, -5, 5, 0] : 0,
                      }}
                      transition={{
                        y: {
                          duration: 3.4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        },
                        x: { duration: 0.34, ease: 'easeInOut' },
                      }}
                      key={`bubble-shake-${bubbleShakeTick}`}
                      className="relative flex flex-col items-center"
                    >
                      <form
                        onSubmit={handleBubbleSubmit}
                        data-active-bubble="true"
                        className="fluent-3d-bubble relative w-[332px] sm:w-[392px] aspect-square rounded-full px-8 sm:px-10 py-6 sm:py-7 flex flex-col items-center justify-between text-center overflow-hidden"
                      >
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute top-4 left-16 right-16 h-4 rounded-full bg-white/85 dark:bg-sky-300/15 blur-[3px]"
                        />

                        {/* Relevant Emoji Backdrop (user types directly over on top of it) */}
                        <motion.span
                          aria-hidden="true"
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{
                            duration: 4.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center text-[138px] sm:text-[164px] leading-none opacity-[0.14] dark:opacity-[0.17]"
                        >
                          {dockedTarget.card.backdropEmoji}
                        </motion.span>

                        {/* Top Bar: Quiet Period · Domain + Cancel back to Orbs */}
                        <div className="relative z-10 w-full flex items-center justify-center pt-1">
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <span className="scale-75 origin-center">
                              <EventCategoryEmblem icon={dockedTarget.card.icon} />
                            </span>
                            <span>{dockedTarget.card.label}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums" style={{ color: 'var(--pa-accent-text)' }}>
                              {dockedTarget.fullLabel}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDockedTarget(null);
                              setBubbleValidationError(null);
                            }}
                            aria-label="Choose another topic or month"
                            title="Back to topic orbs"
                            className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:hover:text-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Middle Typing Layer Directly Over Backdrop Emoji */}
                        <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center px-2">
                          <label
                            htmlFor="stage-bubble-question"
                            className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-white tracking-tight mb-2"
                          >
                            What&apos;s on your mind?
                          </label>
                          <textarea
                            id="stage-bubble-question"
                            ref={bubbleInputRef}
                            rows={3}
                            value={bubbleQuestion}
                            disabled={isSending}
                            onChange={(e) => {
                              setBubbleQuestion(e.target.value);
                              if (bubbleValidationError && e.target.value.trim()) {
                                setBubbleValidationError(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleBubbleSubmit();
                              }
                            }}
                            placeholder="Type your question…"
                            style={{ fontFamily: 'var(--pa-font-body)' }}
                            className="w-full max-w-[250px] sm:max-w-[292px] resize-none bg-transparent text-center text-sm sm:text-[15px] font-medium leading-relaxed text-slate-900 dark:text-slate-50 placeholder:text-slate-500/75 dark:placeholder:text-slate-400/80 focus:outline-none disabled:opacity-60"
                          />
                          {bubbleValidationError && (
                            <p
                              role="alert"
                              className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
                            >
                              {bubbleValidationError}
                            </p>
                          )}
                        </div>

                        {/* Bottom Round Submit Button (No Arrow Icon) */}
                        <div className="relative z-10 pb-0.5">
                          <button
                            type="submit"
                            disabled={isSending}
                            aria-label="Ask question"
                            title="Ask"
                            className={`relative h-12 w-12 rounded-full inline-flex items-center justify-center text-xs font-bold tracking-wide text-white overflow-hidden transition-transform duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--pa-accent)] ${
                              bubbleQuestion.trim()
                                ? 'pa-glimmer-btn shadow-lg hover:scale-108 active:scale-95'
                                : 'bg-slate-400/70 dark:bg-slate-600/70 hover:bg-slate-500/80 dark:hover:bg-slate-500/80'
                            }`}
                          >
                            <span className="relative z-10">
                              {isSending ? '…' : 'Ask'}
                            </span>
                          </button>
                        </div>
                      </form>

                      {/* Round Speech Bubble Tail Beads */}
                      <div
                        className="flex flex-col items-start self-start ml-16 -mt-2 space-y-1.5"
                        aria-hidden="true"
                      >
                        <span className="fluent-3d-bubble-tail w-4 h-4 rounded-full block" />
                        <span className="fluent-3d-bubble-tail w-2.5 h-2.5 rounded-full -ml-1.5 block" />
                      </div>
                    </motion.div>

                    {/* Reactive Floor Shadow beneath Round Bubble */}
                    <motion.div
                      aria-hidden="true"
                      animate={{
                        scaleX: [1, 0.78, 1, 0.88, 1],
                        opacity: [0.28, 0.16, 0.28, 0.21, 0.28],
                      }}
                      transition={{
                        duration: 3.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className="mt-1 h-3 w-44 rounded-full bg-slate-900/20 dark:bg-sky-400/20 blur-md"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="stage1-orbs-grid"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-6"
                  >
                    <AnimatePresence>
                      {(dropHintVisible || isDraggingOrb) && (
                        <div className="flex justify-center">
                          <motion.span
                            key="orb-drop-hint"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18 }}
                            className="text-xs font-medium text-slate-500 dark:text-slate-300"
                          >
                            {isDraggingOrb
                              ? hoveredMonthKey
                                ? 'Release to drop into this bucket'
                                : 'Drop into any month bucket above'
                              : 'Drag and drop a ball into any month bucket above'}
                          </motion.span>
                        </div>
                      )}
                    </AnimatePresence>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 sm:gap-7 place-items-center pt-3 pb-5">
                      {DOMAIN_HOME_CARDS.map((card, idx) => {
                        const isActiveDomainBubble = card.domain === activePromptDomain;
                        const isBeingCarried = activeDrag?.card.domain === card.domain;
                        return (
                          <div
                            key={card.domain}
                            className={`flex flex-col items-center ${idx % 2 === 1 ? 'sm:mt-5' : ''}`}
                          >
                            <motion.button
                              type="button"
                              disabled={isSending}
                              onPointerDown={(e) => handleOrbPointerDown(e, card)}
                              aria-label={`${card.label} — drag into a month bucket above`}
                              title={`Drop ${card.label} into a month bucket`}
                              data-active-bubble={isActiveDomainBubble ? 'true' : undefined}
                              initial={{ opacity: 0, scale: 0.84, y: 24 }}
                              animate={{
                                opacity: isBeingCarried ? 0.25 : 1,
                                scale: isBeingCarried ? 0.88 : 1,
                                y: isBeingCarried ? 0 : [0, -14, 0, -7, 0],
                                rotateZ: isBeingCarried
                                  ? 0
                                  : idx % 2 === 0
                                    ? [-0.8, 0.8, -0.4, 0.5, -0.8]
                                    : [0.8, -0.8, 0.4, -0.5, 0.8],
                              }}
                              transition={{
                                opacity: { duration: 0.18 },
                                scale: { type: 'spring', stiffness: 280, damping: 20 },
                                y: {
                                  duration: 2.3 + idx * 0.22,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                  delay: idx * 0.35,
                                },
                                rotateZ: {
                                  duration: 3.1 + idx * 0.25,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                  delay: idx * 0.35,
                                },
                              }}
                              whileHover={isBeingCarried ? undefined : { scale: 1.09 }}
                              whileTap={isBeingCarried ? undefined : { scale: 0.96 }}
                              className="group fluent-3d-bubble relative w-[68px] h-[68px] sm:w-[76px] sm:h-[76px] rounded-full flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-sky-400/70 disabled:opacity-50"
                            >
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute top-2 left-4 right-4 h-2 rounded-full bg-white/80 dark:bg-sky-300/15 blur-[2px]"
                              />
                              <span className="scale-95 sm:scale-105 transition-transform duration-200 group-hover:scale-115">
                                <EventCategoryEmblem icon={card.icon} />
                              </span>
                            </motion.button>

                            {/* Reactive Shadow beneath Smaller Jumping Orb */}
                            <motion.div
                              aria-hidden="true"
                              animate={{
                                scaleX: isBeingCarried ? 0.5 : [1, 0.72, 1, 0.84, 1],
                                opacity: isBeingCarried ? 0.08 : [0.24, 0.12, 0.24, 0.16, 0.24],
                              }}
                              transition={{
                                duration: 2.3 + idx * 0.22,
                                repeat: Infinity,
                                ease: 'easeInOut',
                                delay: idx * 0.35,
                              }}
                              className="mt-2.5 h-2 w-12 rounded-full bg-slate-900/20 dark:bg-sky-400/20 blur-sm"
                            />
                            <span className="mt-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 select-none">
                              {card.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            );
          })()}

          {/* STAGE 2: Jumping Round 3D Speech Bubble */}
          {isWaitingForReply && activeQuestionTurn && (
            <div className="my-auto py-2 flex flex-col items-center justify-center text-center">
              <div className="relative flex flex-col items-center">
                <motion.div
                  key={`jumping-${activeQuestionTurn.id}`}
                  initial={{ opacity: 0, scale: 0.82, y: 36 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: [0, -22, 0, -11, 0],
                    rotateZ: [-0.9, 0.9, -0.5, 0.6, -0.9],
                  }}
                  transition={{
                    opacity: { duration: 0.24 },
                    scale: { type: 'spring', stiffness: 260, damping: 18 },
                    y: {
                      duration: 2.0,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                    rotateZ: {
                      duration: 3.1,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }}
                  className="relative flex flex-col items-center"
                >
                  <div
                    data-active-bubble="true"
                    className="fluent-3d-bubble relative w-[264px] sm:w-[300px] aspect-square px-7 py-6 flex flex-col items-center justify-center text-center gap-2 overflow-hidden"
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute top-4 left-16 right-16 h-4 rounded-full bg-white/85 dark:bg-sky-300/15 blur-[3px]"
                    />
                    <span className="scale-115 mb-0.5">
                      <EventCategoryEmblem
                        icon={getDomainIconFromPromptDomain(activeQuestionTurn.promptDomain)}
                      />
                    </span>
                    <ScopeBubbleBadge
                      turnScope={activeQuestionTurn.scope}
                      adapterId={activeQuestionTurn.adapterId}
                      model={activeQuestionTurn.model}
                    />
                    {formatBubbleMonthYear(
                      activeQuestionTurn.threadMonth,
                      activeQuestionTurn.threadYear,
                    ) && (
                      <div className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                        {formatBubbleMonthYear(
                          activeQuestionTurn.threadMonth,
                          activeQuestionTurn.threadYear,
                        )}
                      </div>
                    )}
                    <p
                      className="text-[11px] sm:text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300 break-words line-clamp-3"
                      style={{ fontFamily: 'var(--pa-font-body)' }}
                    >
                      {activeQuestionTurn.content}
                    </p>
                    <button
                      type="button"
                      onClick={onCancelRequest}
                      aria-label="Cancel request"
                      title="Cancel request"
                      className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 dark:bg-slate-800/95 border border-rose-200/90 dark:border-rose-700/80 text-rose-600 dark:text-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/70 transition-colors shadow-xs shrink-0 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                  {/* Round Speech Bubble Tail Beads */}
                  <div className="flex flex-col items-start self-start ml-14 -mt-2 space-y-1.5" aria-hidden="true">
                    <span className="fluent-3d-bubble-tail w-4 h-4 rounded-full block" />
                    <span className="fluent-3d-bubble-tail w-2.5 h-2.5 rounded-full -ml-1.5 block" />
                  </div>
                </motion.div>

                {/* Reactive Floor Shadow beneath Jumping Round Bubble */}
                <motion.div
                  aria-hidden="true"
                  animate={{
                    scaleX: [1, 0.68, 1, 0.8, 1],
                    opacity: [0.32, 0.14, 0.32, 0.2, 0.32],
                  }}
                  transition={{
                    duration: 2.0,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="mt-1.5 h-3 w-40 rounded-full bg-slate-900/25 dark:bg-sky-400/25 blur-md"
                />

                {/* Bobbing Timer Icon Only (up and down) */}
                <motion.div
                  aria-label="Generating response"
                  animate={{ y: [0, -8, 0] }}
                  transition={{
                    duration: 1.3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="mt-5 inline-flex items-center justify-center text-sky-600 dark:text-sky-400"
                >
                  <Hourglass className="w-5 h-5" />
                </motion.div>
              </div>
            </div>
          )}

          {/* STAGE 3: Response Arrived — Settled Round 3D Speech Bubble + Sliding Event Cards */}
          {!isWaitingForReply && activeExchange && (
            <div className="my-auto py-4 space-y-6">
              {/* Follow-up Turn Switcher when >1 turn exists in this thread */}
              {exchanges.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {exchanges.map((ex, idx) => {
                    const isCurrent = idx === clampedExchangeIdx;
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => setSelectedExchangeIndex(idx)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          isCurrent
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                            : 'bg-white/80 dark:bg-slate-800/80 border border-slate-200/85 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{idx === 0 ? 'Initial' : `Follow-up ${idx}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Settled Round 3D Fluent Speech Bubble with Retry (hidden for archived folder reports) */}
              {!isThreadFinalized && (
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <motion.div
                    key={`settled-${activeExchange.id}`}
                    initial={{ opacity: 0, y: -12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                    className="relative flex flex-col items-start"
                  >
                    <div
                      data-active-bubble="true"
                      className="fluent-3d-bubble relative w-[300px] sm:w-[340px] aspect-square px-8 py-7 flex flex-col items-center justify-center text-center gap-2 overflow-hidden"
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute top-4 left-14 right-14 h-3.5 rounded-full bg-white/80 dark:bg-sky-300/15 blur-[2px]"
                      />
                      <span className="scale-115 mb-0.5">
                        <EventCategoryEmblem
                          icon={getDomainIconFromPromptDomain(activeQuestionTurn?.promptDomain)}
                        />
                      </span>
                      <ScopeBubbleBadge
                        turnScope={activeQuestionTurn?.scope ?? scope}
                        adapterId={activeAssistantReply?.adapterId ?? activeQuestionTurn?.adapterId}
                        model={activeAssistantReply?.model ?? activeQuestionTurn?.model}
                      />

                      {formatBubbleMonthYear(
                        activeQuestionTurn?.threadMonth,
                        activeQuestionTurn?.threadYear,
                      ) && (
                        <div className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                          {formatBubbleMonthYear(
                            activeQuestionTurn?.threadMonth,
                            activeQuestionTurn?.threadYear,
                          )}
                        </div>
                      )}

                      <p
                        title={activeQuestionTurn?.content}
                        className="text-[11px] sm:text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-3 break-words"
                        style={{ fontFamily: 'var(--pa-font-body)' }}
                      >
                        {activeQuestionTurn?.content || 'Assistant Events'}
                      </p>

                      <button
                        type="button"
                        onClick={() => onRetryExchange(activeExchange.id)}
                        disabled={isSending}
                        title="Retry this exact question"
                        className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/90 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-600/80 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-slate-700 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                  {/* Round Speech bubble tail */}
                  <div className="flex items-center gap-1.5 ml-14 -mt-2" aria-hidden="true">
                    <span className="fluent-3d-bubble-tail w-4 h-4 rounded-full block" />
                    <span className="fluent-3d-bubble-tail w-2.5 h-2.5 rounded-full mt-2 block" />
                  </div>
                </motion.div>
              </div>
              )}

              {/* Error State if Provider Failed — Friendly message with exact reason */}
              {activeErrorReply && !activeAssistantReply && (() => {
                const detail = formatProviderErrorDetail(activeErrorReply.content);
                const sourceLabel = [activeErrorReply.adapterId, activeErrorReply.model]
                  .filter(Boolean)
                  .join(' · ');
                return (
                <div className="rounded-3xl border border-red-200 dark:border-red-900/70 bg-red-50/90 dark:bg-red-950/40 p-6 text-red-900 dark:text-red-200 max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <WhatsAppSymbol className="w-4 h-4 shrink-0" />
                    <span>What&apos;s up</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">
                    Try &quot;What&apos;s up&quot; little later ..
                  </p>
                  {detail && (
                    <p className="mt-2 text-xs leading-relaxed text-red-800/85 dark:text-red-200/80 break-words">
                      {sourceLabel ? `${sourceLabel}: ` : ''}
                      {detail}
                    </p>
                  )}
                </div>
                );
              })()}

              {/* Floating Light-Theme Read Out Bubbles (Summary & Answer) — Shown ONLY if LLM response contains Read Out */}
              {activeAssistantReply &&
                readOutSections &&
                (readOutSections.summary || readOutSections.answer) && (
                  <div
                    aria-label="Read Out"
                    className={`max-w-4xl grid grid-cols-1 ${
                      readOutSections.summary && readOutSections.answer
                        ? 'md:grid-cols-2'
                        : ''
                    } gap-5 sm:gap-6 items-start`}
                  >
                    {readOutSections.summary && (
                      <motion.div
                        key={`readout-summary-${activeExchange.id}`}
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="flex flex-col items-start"
                      >
                        <motion.div
                          animate={{ y: [0, -6, 0, -3, 0] }}
                          transition={{
                            duration: 4.1,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="w-full flex flex-col items-start"
                        >
                          <div className="pa-readout-bubble relative w-full px-6 py-5 overflow-hidden">
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute top-2.5 left-10 right-10 h-2.5 rounded-full bg-white/90 blur-[2px]"
                            />
                            <h2
                              className="relative z-10 font-display text-xs font-bold tracking-wide mb-2 whitespace-nowrap"
                              style={{ color: '#0369a1' }}
                            >
                              Month Summary
                            </h2>
                            <div
                              className="relative z-10 text-[13px] sm:text-sm leading-relaxed text-slate-800 whitespace-pre-line max-h-56 overflow-y-auto fluent-scroll pr-1"
                              style={{ fontFamily: 'var(--pa-font-body)' }}
                            >
                              {readOutSections.summary}
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1.5 ml-10 -mt-1.5"
                            aria-hidden="true"
                          >
                            <span className="pa-readout-tail w-3.5 h-3.5 rounded-full block" />
                            <span className="pa-readout-tail w-2 h-2 rounded-full mt-2 block" />
                          </div>
                        </motion.div>
                        <motion.div
                          aria-hidden="true"
                          animate={{
                            scaleX: [1, 0.86, 1, 0.92, 1],
                            opacity: [0.22, 0.13, 0.22, 0.17, 0.22],
                          }}
                          transition={{
                            duration: 4.1,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="mt-1 ml-6 h-2.5 w-36 rounded-full bg-slate-900/15 dark:bg-sky-400/20 blur-md"
                        />
                      </motion.div>
                    )}

                    {readOutSections.answer && (
                      <motion.div
                        key={`readout-answer-${activeExchange.id}`}
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 260,
                          damping: 22,
                          delay: 0.06,
                        }}
                        className="flex flex-col items-start"
                      >
                        <motion.div
                          animate={{ y: [0, -6, 0, -3, 0] }}
                          transition={{
                            duration: 4.1,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 0.85,
                          }}
                          className="w-full flex flex-col items-start"
                        >
                          <div className="pa-readout-bubble relative w-full px-6 py-5 overflow-hidden">
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute top-2.5 left-10 right-10 h-2.5 rounded-full bg-white/90 blur-[2px]"
                            />
                            <h2
                              className="relative z-10 font-display text-xs font-bold tracking-wide mb-2 whitespace-nowrap"
                              style={{ color: '#0369a1' }}
                            >
                              Answer
                            </h2>
                            <div
                              className="relative z-10 text-[13px] sm:text-sm leading-relaxed text-slate-800 whitespace-pre-line max-h-56 overflow-y-auto fluent-scroll pr-1"
                              style={{ fontFamily: 'var(--pa-font-body)' }}
                            >
                              {readOutSections.answer}
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1.5 ml-10 -mt-1.5"
                            aria-hidden="true"
                          >
                            <span className="pa-readout-tail w-3.5 h-3.5 rounded-full block" />
                            <span className="pa-readout-tail w-2 h-2 rounded-full mt-2 block" />
                          </div>
                        </motion.div>
                        <motion.div
                          aria-hidden="true"
                          animate={{
                            scaleX: [1, 0.86, 1, 0.92, 1],
                            opacity: [0.22, 0.13, 0.22, 0.17, 0.22],
                          }}
                          transition={{
                            duration: 4.1,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 0.85,
                          }}
                          className="mt-1 ml-6 h-2.5 w-36 rounded-full bg-slate-900/15 dark:bg-sky-400/20 blur-md"
                        />
                      </motion.div>
                    )}
                  </div>
                )}

              {/* Sliding Event Cards Carousel — Specific Events ONLY (Date Range + Likelihood) */}
              {activeAssistantReply && eventCards.length > 0 && (
                <div className="space-y-3 max-w-4xl">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      Showing {clampedStart + 1}–{Math.min(clampedStart + visibleCount, eventCards.length)} of{' '}
                      {eventCards.length} specific events
                    </span>

                    <div className="flex items-center gap-1.5">
                      {eventCards.length > visibleCount && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCarouselIndex((prev) => Math.max(0, prev - 1))}
                            disabled={clampedStart === 0}
                            aria-label="Previous event cards"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/85 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors shadow-xs"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCarouselIndex((prev) => Math.min(maxStartIndex, prev + 1))
                            }
                            disabled={clampedStart >= maxStartIndex}
                            aria-label="Next event cards"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/85 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors shadow-xs"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <AnimatePresence mode="popLayout" initial={true}>
                    <motion.div
                      key={`${activeExchange.id}-slide-${clampedStart}`}
                      initial={{ opacity: 0, x: 56, y: 12, scale: 0.94 }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -48, y: -8, scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4"
                    >
                      {visibleEvents.map((evt, idx) => {
                        const displayDate = evt.when || evt.dateRange || evt.timeframe;
                        const displayProbability = evt.probability || evt.likelihood;
                        const lowerHint = `${evt.category} ${evt.title}`.toLowerCase();
                        const isRelationshipCard =
                          evt.icon === 'heart' ||
                          /(relationship|love|romance|partner|marriage)/.test(lowerHint);
                        const isHealthCard =
                          evt.icon === 'shield' ||
                          /(health|wellness|vitality|medical|energy|fitness)/.test(lowerHint);
                        const threadDomain = activeQuestionTurn?.promptDomain;
                        const resolvedIcon = threadDomain
                          ? getDomainIconFromPromptDomain(threadDomain)
                          : isRelationshipCard
                            ? 'heart'
                            : isHealthCard
                              ? 'shield'
                              : evt.icon;
                        const topDomainLabel = threadDomain
                          ? getPromptDomainShortLabel(threadDomain)
                          : isHealthCard
                            ? 'Health'
                            : evt.category || (isRelationshipCard ? 'Relationship' : 'Event');
                        const { probabilityLine, ratingLine } =
                          splitProbabilityAndRating(displayProbability);

                        return (
                          <motion.article
                            key={evt.id}
                            initial={{ opacity: 0, x: 36, y: 14, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                            whileHover={{ y: -4, scale: 1.015 }}
                            transition={{
                              type: 'spring',
                              stiffness: 270,
                              damping: 22,
                              delay: idx * 0.06,
                            }}
                            className="group fluent-event-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[154px]"
                          >
                            <div className="space-y-2.5">
                              {/* Top Row: Left = Domain Icon Only | Right = Probability (Line 1) + Rating (Line 2) */}
                              <div className="flex items-start justify-between gap-2.5">
                                <span
                                  title={topDomainLabel}
                                  aria-label={topDomainLabel}
                                  className="inline-flex shrink-0 scale-85 origin-top-left"
                                >
                                  <EventCategoryEmblem icon={resolvedIcon} />
                                </span>

                                <div className="text-right tabular-nums min-w-0">
                                  <div className="inline-flex items-center justify-end gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                    <Sparkles className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{probabilityLine}</span>
                                  </div>
                                  {ratingLine && (
                                    <div className="mt-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                      {ratingLine}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Event Name */}
                              <h2 className="font-display text-[13px] font-semibold leading-snug text-slate-900 dark:text-white">
                                {evt.title}
                              </h2>

                              {/* Timeline */}
                              <div
                                style={{
                                  backgroundColor: 'var(--pa-q-bg)',
                                  borderColor: 'var(--pa-bubble-rim)',
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-slate-900 dark:text-slate-100 tabular-nums"
                              >
                                <CalendarRange
                                  className="w-3 h-3 shrink-0"
                                  style={{ color: 'var(--pa-accent)' }}
                                />
                                <span>{displayDate || 'Timing detailed in report'}</span>
                              </div>
                            </div>

                            {/* Glimmering Flash Button (Icon-only) */}
                            <div className="pt-2.5 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => openEventFlash(evt)}
                                aria-label={`Open flash for ${evt.title}`}
                                title="Flash"
                                className="pa-glimmer-btn relative inline-flex h-8 w-8 items-center justify-center rounded-xl text-white overflow-hidden transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--pa-accent)]"
                              >
                                <Zap className="relative z-10 w-3.5 h-3.5 fill-current" />
                              </button>
                            </div>
                          </motion.article>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {/* Subtle Stage Footer Controls: Ask Follow-up (unless finalized), Remove, and 1-star / 2-star / 3-star Rating */}
              {activeAssistantReply && rootExchange && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {!isThreadFinalized && (
                      <button
                        type="button"
                        onClick={onOpenChatBar}
                        disabled={isSending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-45 transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        <span>{isSending ? 'Thinking…' : 'Ask Follow-up'}</span>
                      </button>
                    )}
                    {confirmDeleteId === rootExchange.id ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteExchange(rootExchange.id);
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
                        onClick={() => setConfirmDeleteId(rootExchange.id)}
                        disabled={isSending}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/75 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  <div
                    role="group"
                    aria-label="Rate this period"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200/85 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/80 p-1 shadow-2xs shrink-0"
                  >
                    {THREAD_RATING_OPTIONS.map((opt) => {
                      const selected = rootExchange.questionTurn?.threadRating === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onUpdateExchangeMetadata(rootExchange.id, {
                              threadRating: selected ? undefined : opt.id,
                            })
                          }
                          aria-pressed={selected}
                          title={opt.description}
                          className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            selected
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 shadow-2xs'
                              : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100/80 dark:text-slate-500 dark:hover:text-amber-300 dark:hover:bg-slate-800/80'
                          }`}
                        >
                          {opt.starGlyphs}
                        </button>
                      );
                    })}
                  </div>
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
              style={{ borderColor: 'var(--pa-bubble-rim)' }}
              className="pointer-events-auto w-full max-w-[600px] sm:max-w-[640px] rounded-3xl border bg-white/94 dark:bg-slate-900/94 backdrop-blur-2xl shadow-[0_28px_70px_-16px_rgba(15,23,42,0.28)] p-5 sm:p-6 space-y-4"
            >
              {/* Auto-Populated 2-Line Composer Header (Domain + Topic + Period) */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="inline-flex items-center gap-2 font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    <span>{`What's up · ${getPromptDomainShortLabel(effectiveComposerDomain)}`}</span>
                    {hasActiveThread && (
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--pa-accent-text)' }}
                      >
                        Follow-up
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
                    {hasActiveThread && rootExchange?.questionTurn?.threadName?.trim()
                      ? `${rootExchange.questionTurn.threadName.trim()}${
                          composerPeriodLabel ? ` · Period: ${composerPeriodLabel}` : ''
                        }`
                      : composerPeriodLabel
                        ? `Period: ${composerPeriodLabel}`
                        : 'Select domain and ask below'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {hasActiveThread && (
                    <button
                      type="button"
                      onClick={onClearConversation}
                      disabled={isSending}
                      title="Start a brand new thread"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onToggleChatBar}
                    aria-label="Minimize chat panel"
                    title="Minimize chat panel"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {privateNeedsModel && (
                <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
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

              {/* Domain Selector & Thread Name are ONLY for fresh threads; Follow-ups lock to active Domain & Period */}
              {!hasActiveThread && (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      id="composer-domain-label"
                      className="text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0"
                    >
                      Domain
                    </span>
                    <div
                      role="group"
                      aria-labelledby="composer-domain-label"
                      className="flex-1 grid grid-cols-4 gap-1 rounded-xl border border-slate-200/90 dark:border-slate-700/85 bg-slate-50/90 dark:bg-slate-950/65 p-0.5"
                    >
                      {PROMPT_DOMAINS.map((domain) => {
                        const selected = activePromptDomain === domain;
                        return (
                          <button
                            key={domain}
                            type="button"
                            onClick={() => onPromptDomainChange(domain)}
                            aria-pressed={selected}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors truncate cursor-pointer ${
                              selected
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-white/75 dark:hover:bg-slate-800/75'
                            }`}
                          >
                            {getPromptDomainShortLabel(domain)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <input
                    type="text"
                    value={threadName}
                    onChange={(e) => setThreadName(e.target.value)}
                    placeholder="Report / Thread name (auto-named if blank)"
                    aria-label="Thread Name"
                    className="w-full rounded-xl border border-slate-200/90 dark:border-slate-700/85 bg-slate-50/80 dark:bg-slate-950/65 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[var(--pa-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--pa-bubble-glow)]"
                  />
                </>
              )}

              {/* Question Input Form (hidden when viewing a finalized thread) */}
              {hasActiveThread && isThreadFinalized ? (
                <div className="rounded-2xl border border-slate-200/85 dark:border-slate-700/85 bg-slate-50/90 dark:bg-slate-950/60 px-4 py-3.5 flex items-center justify-between gap-3">
                  <p
                    className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                  >
                    This thread is finalized.
                  </p>
                  <button
                    type="button"
                    onClick={onClearConversation}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Thread</span>
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  style={{
                    backgroundColor: 'var(--pa-q-bg)',
                    borderColor: 'var(--pa-bubble-rim)',
                  }}
                  className="rounded-2xl border px-4 py-3.5 flex items-end gap-3 transition-colors"
                >
                  <textarea
                    ref={textareaRef}
                    rows={5}
                    value={draft}
                    disabled={isSending}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      hasActiveThread
                        ? 'Ask a follow-up question for this domain & period…'
                        : 'Type your question… (Enter to send)'
                    }
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                    className="flex-1 min-h-[128px] resize-none bg-transparent text-sm sm:text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || isSending}
                    aria-label={hasActiveThread ? 'Send follow-up' : 'Send question'}
                    title={hasActiveThread ? 'Send follow-up' : 'Send question'}
                    className="h-11 w-11 rounded-2xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] disabled:opacity-45 disabled:pointer-events-none text-white inline-flex items-center justify-center transition-all shadow-md hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                  >
                    {isSending ? (
                      <Hourglass className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowUp className="w-5 h-5" />
                    )}
                  </button>
                </form>
              )}
            </motion.section>
          ) : hasActiveThread && !isThreadFinalized && !(!isWaitingForReply && activeAssistantReply && rootExchange) ? (
            <motion.button
              key="chat-panel-minimized"
              type="button"
              onClick={onOpenChatBar}
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              whileHover={{ y: -2 }}
              className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full border border-white/90 dark:border-slate-700/85 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-[0_14px_34px_-10px_rgba(15,23,42,0.22)] hover:shadow-[0_18px_40px_-10px_rgba(2,132,199,0.28)] transition-shadow"
            >
              <MessageSquarePlus className="w-4 h-4" style={{ color: 'var(--pa-accent)' }} />
              <span>{isSending ? 'Thinking…' : 'Ask Follow-up'}</span>
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Auto-Closing Flash Popup showing ONLY "How it will happen" */}
      <AnimatePresence>
        {flashedEvent && (
          <motion.div
            key="event-how-flash-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setFlashedEvent(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Event details flash"
          >
            <motion.div
              key={`event-how-flash-${flashedEvent.card.id}-${flashedEvent.openedAt}`}
              initial={{ opacity: 0, scale: 0.78, y: 22 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.72, y: 14 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-[28px] border border-white/95 dark:border-slate-700/85 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-[0_32px_90px_-18px_rgba(15,23,42,0.45),0_0_0_1px_rgba(255,255,255,0.5)_inset] overflow-hidden"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-28 rounded-full blur-3xl opacity-25 dark:opacity-20"
                style={{ backgroundColor: 'var(--pa-accent)' }}
              />

              <div
                className="relative p-6 sm:p-7 text-[15px] sm:text-base leading-relaxed text-slate-800 dark:text-slate-100 max-h-[60vh] overflow-y-auto fluent-scroll whitespace-pre-line"
                style={{ fontFamily: 'var(--pa-font-body)' }}
              >
                {flashedEvent.card.how || flashedEvent.card.summary}
              </div>

              {/* Smooth Progress Bar (auto-retracts when complete) */}
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/90 overflow-hidden">
                <motion.div
                  key={`flash-bar-${flashedEvent.card.id}-${flashedEvent.openedAt}`}
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: FLASH_DURATION_SECONDS, ease: 'linear' }}
                  className="h-full w-full"
                  style={{
                    transformOrigin: 'left',
                    backgroundColor: 'var(--pa-accent)',
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Smooth 60fps Carried Topic Orb Overlay & Spring Return */}
      {activeDrag && (
        <motion.div
          aria-hidden="true"
          style={{
            left: dragX,
            top: dragY,
            width: activeDrag.size,
            height: activeDrag.size,
          }}
          initial={{ scale: 1 }}
          animate={{
            scale: hoveredMonthKey ? 0.76 : 1.08,
            boxShadow: hoveredMonthKey
              ? '0 0 0 3px var(--pa-accent), 0 0 28px var(--pa-bubble-rim)'
              : '0 22px 46px -10px rgba(15, 23, 42, 0.26), 0 0 24px 2px var(--pa-bubble-glow)',
          }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 fluent-3d-bubble rounded-full flex items-center justify-center"
        >
          <span className="scale-105">
            <EventCategoryEmblem icon={activeDrag.card.icon} />
          </span>
        </motion.div>
      )}

      {returningOrb && (
        <motion.div
          aria-hidden="true"
          style={{
            width: returningOrb.size,
            height: returningOrb.size,
          }}
          initial={{
            left: returningOrb.fromX,
            top: returningOrb.fromY,
            scale: 1.08,
            opacity: 0.98,
          }}
          animate={{
            left: returningOrb.toX,
            top: returningOrb.toY,
            scale: 1,
            opacity: 1,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          onAnimationComplete={() => setReturningOrb(null)}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 fluent-3d-bubble rounded-full flex items-center justify-center"
        >
          <span className="scale-95 sm:scale-105">
            <EventCategoryEmblem icon={returningOrb.card.icon} />
          </span>
        </motion.div>
      )}
    </div>
  );
}
