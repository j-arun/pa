import {
  ArrowUp,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Megaphone,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WhatsAppSymbol } from './WhatsAppSymbol';
import type {
  AnyAdapterId,
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

function splitProbabilityAndRating(rawValue?: string): {
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

function getEventRatingSortScore(evt: EventCardItem): number {
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
  buildPrompt: (periodLabel: string) => string;
  icon: EventCardIconType;
}> = [
  {
    domain: 'astrology',
    label: 'Career',
    description: 'Career trajectory, profession, and timing events.',
    buildPrompt: (periodLabel) =>
      `Detail the key career events, milestones, date windows, and likelihoods for ${periodLabel}.`,
    icon: 'briefcase',
  },
  {
    domain: 'finance',
    label: 'Family',
    description: 'Family, domestic life, and financial planning events.',
    buildPrompt: (periodLabel) =>
      `Detail the key family, domestic, and financial planning events, date windows, and likelihoods for ${periodLabel}.`,
    icon: 'layers',
  },
  {
    domain: 'general',
    label: 'Love',
    description: 'Love, relationships, and emotional connection events.',
    buildPrompt: (periodLabel) =>
      `Detail the key love and relationship events, date windows, and likelihoods for ${periodLabel}.`,
    icon: 'heart',
  },
  {
    domain: 'health',
    label: 'Health',
    description: 'Health, vitality, and wellness guidance events.',
    buildPrompt: (periodLabel) =>
      `Detail the key health, energy, and wellness events, date windows, and likelihoods for ${periodLabel}.`,
    icon: 'shield',
  },
];

export interface SendThreadMessagePayload {
  text: string;
  inputMode: 'text';
  threadName: string;
  promptDomain: PromptDomain;
  isFollowUp: boolean;
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
  onRetryExchange: (exchangeId: string) => void;
  onUpdateExchangeMetadata: (exchangeId: string, patch: ThreadMetadataPatch) => void;
  onClearConversation: () => void;
  onDeleteExchange: (exchangeId: string) => void;
  onOpenSettings: () => void;
}

function EventCategoryEmblem({ icon }: { icon: EventCardIconType }) {
  switch (icon) {
    case 'layers':
      return (
        <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0" aria-hidden="true">
          <path
            d="M6.5 17.5L18 7.5L29.5 17.5V29.5C29.5 30.6 28.6 31.5 27.5 31.5H8.5C7.4 31.5 6.5 30.6 6.5 29.5V17.5Z"
            fill="#F59E0B"
          />
          <path
            d="M4.5 18L18 6L31.5 18"
            stroke="#D97706"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <rect x="14.5" y="20.5" width="7" height="11" rx="1.8" fill="#FFFBEB" />
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
          <rect x="4" y="4" width="28" height="28" rx="9" fill="#10B981" />
          <rect x="15.25" y="9.5" width="5.5" height="17" rx="1.8" fill="#FFFFFF" />
          <rect x="9.5" y="15.25" width="17" height="5.5" rx="1.8" fill="#FFFFFF" />
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

function buildPeriodicSinePath(
  baselineY: number,
  amplitude: number,
  cyclesPerTile: number,
  phaseOffset = 0,
): string {
  const tileWidth = 1440;
  const totalWidth = 2880;
  const step = 40;
  const points: string[] = [];

  for (let x = 0; x <= totalWidth; x += step) {
    const theta = ((x / tileWidth) * cyclesPerTile * Math.PI * 2) + phaseOffset;
    const y = baselineY + Math.sin(theta) * amplitude;
    points.push(`${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(1)}`);
  }

  return points.join(' ');
}

const RIBBON_PATH_A = buildPeriodicSinePath(96, 26, 2, 0.2);
const RIBBON_PATH_B = buildPeriodicSinePath(118, 20, 3, 1.4);
const RIBBON_PATH_C = buildPeriodicSinePath(106, 15, 2, 2.5);

function ScopeWatermarkBackdrop({ scope }: { scope: ConversationScope }) {
  const isPrivate = scope === 'private';

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Animated Ambient Aurora Clouds Driven by Active Theme */}
      <div
        className="pa-mist-a absolute -top-28 -left-24 w-[560px] h-[420px] rounded-full blur-3xl opacity-85"
        style={{
          background:
            'radial-gradient(circle, var(--pa-aurora-1) 0%, var(--pa-aurora-3) 45%, transparent 74%)',
        }}
      />
      <div
        className="pa-mist-b absolute -bottom-28 -right-24 w-[540px] h-[420px] rounded-full blur-3xl opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--pa-aurora-2) 0%, var(--pa-aurora-3) 46%, transparent 74%)',
        }}
      />
      <div
        className="pa-mist-c absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[340px] rounded-full blur-3xl opacity-65"
        style={{
          background:
            'radial-gradient(circle, var(--pa-aurora-3) 0%, transparent 72%)',
        }}
      />

      {/* Seamless Animated Wave Ribbons (Continuous Horizontal Sine Motion) */}
      <div
        className={`absolute inset-x-0 bottom-4 sm:bottom-8 h-44 sm:h-52 overflow-hidden transition-opacity duration-500 ${
          isPrivate ? 'opacity-65' : 'opacity-90'
        }`}
      >
        <svg
          viewBox="0 0 2880 200"
          preserveAspectRatio="none"
          className="pa-ribbon-flow-a h-full w-[200%] max-w-none"
        >
          <path
            d={RIBBON_PATH_A}
            fill="none"
            stroke="var(--pa-wave-stroke)"
            strokeWidth={isPrivate ? 1.8 : 2.5}
            strokeLinecap="round"
            strokeDasharray={isPrivate ? '6 10' : undefined}
          />
          <path
            d={RIBBON_PATH_C}
            fill="none"
            stroke="var(--pa-wave-stroke-soft)"
            strokeWidth={isPrivate ? 1.3 : 1.9}
            strokeLinecap="round"
          />
        </svg>
        <svg
          viewBox="0 0 2880 200"
          preserveAspectRatio="none"
          className="pa-ribbon-flow-b absolute inset-0 h-full w-[200%] max-w-none"
        >
          <path
            d={RIBBON_PATH_B}
            fill="none"
            stroke="var(--pa-wave-stroke-soft)"
            strokeWidth={isPrivate ? 1.4 : 2.1}
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Gentle Floating Bokeh Shimmer Particles */}
      <span
        className="pa-particle-1 absolute bottom-[18%] left-[12%] h-2.5 w-2.5 rounded-full blur-[0.5px]"
        style={{ backgroundColor: 'var(--pa-particle-color)' }}
      />
      <span
        className="pa-particle-2 absolute bottom-[26%] left-[34%] h-2 w-2 rounded-full blur-[0.5px]"
        style={{ backgroundColor: 'var(--pa-particle-color)' }}
      />
      <span
        className="pa-particle-3 absolute bottom-[22%] right-[28%] h-3 w-3 rounded-full blur-[1px]"
        style={{ backgroundColor: 'var(--pa-particle-color)' }}
      />
      <span
        className="pa-particle-4 absolute bottom-[34%] right-[14%] h-2 w-2 rounded-full blur-[0.5px]"
        style={{ backgroundColor: 'var(--pa-particle-color)' }}
      />

      {/* Embedded Large Transparent Background Illustration (Theme-Matched Palette, Breathing + Pulsing Waves) */}
      <div className="absolute inset-0 flex items-center justify-center sm:justify-end sm:pr-8 md:pr-16">
        <AnimatePresence mode="wait">
          {isPrivate ? (
            <motion.div
              key="backdrop-murmur"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-[340px] sm:w-[440px] md:w-[520px] max-w-[85vw] select-none opacity-[0.16] dark:opacity-[0.22]"
              style={{
                maskImage:
                  'radial-gradient(ellipse 82% 82% at 50% 50%, rgba(0,0,0,1) 52%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 82% 82% at 50% 50%, rgba(0,0,0,1) 52%, transparent 100%)',
              }}
            >
              <svg viewBox="0 0 120 108" className="pa-figure-breathe w-full h-auto">
                <defs>
                  <linearGradient id="bgUnifiedAuraPriv" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-aura)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="var(--pa-fig-body)" stopOpacity="0.12" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedBodyPriv" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-body)" />
                    <stop offset="100%" stopColor="var(--pa-fig-body-deep)" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedSkinPriv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-skin)" />
                    <stop offset="100%" stopColor="var(--pa-fig-skin-mid)" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedHairPriv" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-body-deep)" />
                    <stop offset="100%" stopColor="var(--pa-fig-stroke)" />
                  </linearGradient>
                </defs>

                <circle cx="56" cy="54" r="46" fill="url(#bgUnifiedAuraPriv)" />

                {/* Leaning shoulders / quiet posture */}
                <path
                  d="M16 98 C18 75, 34 67, 49 67 C62 67, 72 74, 76 98 Z"
                  fill="url(#bgUnifiedBodyPriv)"
                />
                <path d="M40 69 L50 79 L59 69" fill="var(--pa-fig-stroke)" opacity="0.35" />

                {/* Neck & Head */}
                <rect x="43" y="54" width="12" height="15" rx="6" fill="url(#bgUnifiedSkinPriv)" />
                <ellipse cx="49" cy="41" rx="18" ry="19" fill="url(#bgUnifiedSkinPriv)" />

                {/* Hair */}
                <path
                  d="M31 38 C30 23, 43 16, 56 19 C65 21, 69 30, 67 37 C61 29, 50 27, 39 31 C35 33, 33 36, 31 38 Z"
                  fill="url(#bgUnifiedHairPriv)"
                />
                <circle cx="32" cy="42" r="4" fill="var(--pa-fig-skin-mid)" />

                {/* Side eye & brow */}
                <path
                  d="M53 35 C56 33.5, 60 34, 62 36"
                  stroke="var(--pa-fig-stroke)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
                <ellipse cx="58" cy="40.5" rx="2.3" ry="2.7" fill="var(--pa-fig-stroke)" />

                {/* Soft whispering mouth */}
                <ellipse cx="64.5" cy="49.5" rx="2.6" ry="2" fill="var(--pa-fig-body-deep)" opacity="0.72" />

                {/* Cupped hand beside mouth (murmuring gesture) */}
                <path
                  d="M56 77 C60 65, 65 53, 69 45 C72 43, 75.5 45.5, 74.5 50 C73 57, 69 66, 66 77 Z"
                  fill="url(#bgUnifiedSkinPriv)"
                  stroke="var(--pa-fig-stroke)"
                  strokeOpacity="0.45"
                  strokeWidth="1.3"
                />
                <path
                  d="M69 45 C70.5 42.5, 73.5 43.5, 73 46.5"
                  stroke="var(--pa-fig-stroke)"
                  strokeOpacity="0.45"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Pulsing quiet murmur ripples */}
                <path
                  className="pa-ripple-1"
                  d="M80 45 C84 47.5, 84 53.5, 80 56"
                  stroke="var(--pa-fig-body-deep)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  className="pa-ripple-2"
                  d="M86.5 40.5 C92.5 45.5, 92.5 55.5, 86.5 60.5"
                  stroke="var(--pa-fig-body)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                  fill="none"
                />
                <path
                  className="pa-ripple-3"
                  d="M93.5 36 C101 43.5, 101 57.5, 93.5 65"
                  stroke="var(--pa-fig-stroke)"
                  strokeOpacity="0.65"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeDasharray="2 4"
                  fill="none"
                />
              </svg>
            </motion.div>
          ) : (
            <motion.div
              key="backdrop-speaker"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-[340px] sm:w-[440px] md:w-[520px] max-w-[85vw] select-none opacity-[0.16] dark:opacity-[0.22]"
              style={{
                maskImage:
                  'radial-gradient(ellipse 82% 82% at 50% 50%, rgba(0,0,0,1) 52%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 82% 82% at 50% 50%, rgba(0,0,0,1) 52%, transparent 100%)',
              }}
            >
              <svg viewBox="0 0 120 108" className="pa-figure-breathe w-full h-auto">
                <defs>
                  <linearGradient id="bgUnifiedAuraPub" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-aura)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="var(--pa-fig-body)" stopOpacity="0.12" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedBodyPub" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-body)" />
                    <stop offset="100%" stopColor="var(--pa-fig-body-deep)" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedSkinPub" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-skin)" />
                    <stop offset="100%" stopColor="var(--pa-fig-skin-mid)" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedHairPub" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-body-deep)" />
                    <stop offset="100%" stopColor="var(--pa-fig-stroke)" />
                  </linearGradient>
                  <linearGradient id="bgUnifiedSpeaker" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--pa-fig-body)" />
                    <stop offset="100%" stopColor="var(--pa-fig-body-deep)" />
                  </linearGradient>
                </defs>

                <circle cx="54" cy="54" r="46" fill="url(#bgUnifiedAuraPub)" />

                {/* Torso */}
                <path
                  d="M12 98 C15 75, 29 68, 43 68 C56 68, 65 76, 68 98 Z"
                  fill="url(#bgUnifiedBodyPub)"
                />
                <path d="M35 69 L43 81 L51 69" fill="var(--pa-fig-skin-mid)" opacity="0.65" />

                {/* Neck & Head */}
                <rect x="35" y="54" width="12" height="15" rx="6" fill="url(#bgUnifiedSkinPub)" />
                <ellipse cx="42" cy="41" rx="17" ry="18.5" fill="url(#bgUnifiedSkinPub)" />

                {/* Hair */}
                <path
                  d="M24 39 C23 24, 36 16, 49 19 C57 21, 61 29, 59 36 C53 28, 43 26, 32 30 C28 32, 26 35, 24 39 Z"
                  fill="url(#bgUnifiedHairPub)"
                />
                <circle cx="25" cy="42" r="3.8" fill="var(--pa-fig-skin-mid)" />

                {/* Eye & brow */}
                <path
                  d="M46 34.5 C49 32.5, 53 33, 55 35"
                  stroke="var(--pa-fig-stroke)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
                <ellipse cx="51" cy="40" rx="2.3" ry="2.7" fill="var(--pa-fig-stroke)" />

                {/* Open speaking mouth */}
                <ellipse cx="56.5" cy="49.5" rx="3" ry="3.4" fill="var(--pa-fig-body-deep)" opacity="0.72" />

                {/* Hand holding speaker handle */}
                <rect
                  x="65"
                  y="57"
                  width="7"
                  height="16"
                  rx="3"
                  transform="rotate(-10 68 64)"
                  fill="var(--pa-fig-body-deep)"
                />
                <circle cx="67" cy="66" r="5" fill="url(#bgUnifiedSkinPub)" />

                {/* Speaker / Megaphone (matched active theme palette) */}
                <path
                  d="M59 48 L86 34 L89 66 L59 55 Z"
                  fill="url(#bgUnifiedSpeaker)"
                  stroke="var(--pa-fig-skin)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <ellipse
                  cx="87.5"
                  cy="50"
                  rx="4.5"
                  ry="16"
                  fill="var(--pa-fig-skin-mid)"
                  stroke="var(--pa-fig-skin)"
                  strokeWidth="1.2"
                />
                <ellipse cx="88" cy="50" rx="2" ry="9" fill="var(--pa-fig-stroke)" opacity="0.35" />

                {/* Pulsing broadcast sound arcs (same color family) */}
                <path
                  className="pa-ripple-1"
                  d="M95 41 C100 45, 100 55, 95 59"
                  stroke="var(--pa-fig-body-deep)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  className="pa-ripple-2"
                  d="M101 35 C108 42, 108 58, 101 65"
                  stroke="var(--pa-fig-body)"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  className="pa-ripple-3"
                  d="M107.5 30 C115 39, 115 61, 107.5 70"
                  stroke="var(--pa-fig-stroke)"
                  strokeOpacity="0.65"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
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

function FluentPeekCompanion() {
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
        <rect x="13" y="21" width="6" height="16" rx="3" fill="#94A3B8" />
        <rect x="69" y="21" width="6" height="16" rx="3" fill="#94A3B8" />
        <rect x="18" y="8" width="52" height="40" rx="16" fill="url(#paBotBody)" stroke="#E2E8F0" strokeWidth="1.5" />
        <rect x="24" y="15" width="40" height="25" rx="10" fill="url(#paBotVisor)" />
        <path d="M32 25C33.5 22 36.5 22 38 25" stroke="#38BDF8" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M50 25C51.5 22 54.5 22 56 25" stroke="#38BDF8" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M41 30.5H47L45.5 34.5C45 35.5 43 35.5 42.5 34.5L41 30.5Z" fill="#E0F2FE" />
        <path d="M22 54C22 48 66 48 66 54L68 74H20L22 54Z" fill="url(#paBotBody)" stroke="#E2E8F0" strokeWidth="1.2" />
        <rect x="30" y="57" width="28" height="3" rx="1.5" fill="#38BDF8" opacity="0.65" />
      </svg>
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
  onRetryExchange,
  onUpdateExchangeMetadata,
  onClearConversation,
  onDeleteExchange,
  onOpenSettings,
}: WorkbenchPageProps) {
  const [draft, setDraft] = useState('');
  const [threadName, setThreadName] = useState('');
  const [showComposerOptions, setShowComposerOptions] = useState(false);
  const [selectedExchangeIndex, setSelectedExchangeIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [flashedEvent, setFlashedEvent] = useState<{
    card: EventCardItem;
    openedAt: number;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  const isThreadFinalized = Boolean(rootExchange?.questionTurn?.isFinalized);
  const activeMonthNum =
    settings.contextCache.activeMonth ?? new Date().getMonth() + 1;
  const activeYearNum =
    settings.contextCache.activeYear ?? new Date().getFullYear();
  const activeMonthName = getMonthNameFromNumber(activeMonthNum) ?? 'November';
  const activePeriodFullLabel = `${activeMonthName} ${activeYearNum}`;
  const activeRefPeriod = formatShortYearMonth(activeMonthNum, activeYearNum);

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
      promptDomain: activePromptDomain,
      isFollowUp,
    });
  };

  const handleDomainCardClick = (card: (typeof DOMAIN_HOME_CARDS)[number]) => {
    if (isSending) return;
    onPromptDomainChange(card.domain);
    onSendMessage({
      text: card.buildPrompt(activePeriodFullLabel),
      inputMode: 'text',
      threadName: card.label,
      promptDomain: card.domain,
      isFollowUp: false,
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
      {/* Very Light Transparent Scope Watermark Backdrop */}
      <ScopeWatermarkBackdrop scope={scope} />

      {/* Top-Right New Thread Shaka Icon (shown in main pane only after response arrives) */}
      {!isWaitingForReply && activeExchange && (activeAssistantReply || activeErrorReply) && (
        <motion.button
          type="button"
          onClick={onClearConversation}
          disabled={isSending}
          initial={{ opacity: 0, scale: 0.85, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          title="Start a new thread"
          aria-label="Start a new thread"
          className="absolute top-4 right-5 sm:top-5 sm:right-8 z-20 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/90 dark:border-slate-700/85 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl shadow-md hover:shadow-lg hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition-all cursor-pointer"
        >
          <WhatsAppSymbol className="w-7 h-7" />
        </motion.button>
      )}

      {/* Main Stage Viewport */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto fluent-scroll px-5 sm:px-10 py-4 sm:py-6 flex flex-col">
        <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-center">
          {/* STAGE 1: Enlarged Shaka Hand Symbol + Period Message + 4 Icon-Only 3D Domain Bubbles */}
          {!activeExchange && (
            <div className="my-auto py-4 space-y-8">
              <div className="flex items-center">
                <h1 className="font-display text-lg sm:text-xl md:text-2xl font-semibold tracking-tight leading-snug text-slate-900 dark:text-white text-balance inline-flex items-center gap-3.5 flex-wrap">
                  <motion.span
                    role="img"
                    aria-label="What's up"
                    animate={{
                      rotate: [-10, 14, -8, 12, -10],
                      y: [0, -3, 0, -2, 0],
                      scale: [1, 1.08, 1, 1.05, 1],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="inline-block text-4xl sm:text-5xl leading-none select-none origin-bottom-right"
                  >
                    🤙
                  </motion.span>
                  <span
                    className="tabular-nums"
                    style={{ color: 'var(--pa-accent-text)' }}
                  >
                    {activePeriodFullLabel} ..
                  </span>
                </h1>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 place-items-center pt-4 pb-6">
                {DOMAIN_HOME_CARDS.map((card, idx) => {
                  const isActiveDomainBubble = card.domain === activePromptDomain;
                  return (
                    <div
                      key={card.domain}
                      className={`flex flex-col items-center ${idx % 2 === 1 ? 'sm:mt-6' : ''}`}
                    >
                      <motion.button
                        type="button"
                        disabled={isSending}
                        onClick={() => handleDomainCardClick(card)}
                        aria-label={card.label}
                        title={card.label}
                        data-active-bubble={isActiveDomainBubble ? 'true' : undefined}
                        initial={{ opacity: 0, scale: 0.84, y: 24 }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          y: [0, -18, 0, -9, 0],
                          rotateZ:
                            idx % 2 === 0
                              ? [-0.8, 0.8, -0.4, 0.5, -0.8]
                              : [0.8, -0.8, 0.4, -0.5, 0.8],
                        }}
                        transition={{
                          opacity: { duration: 0.26, delay: idx * 0.06 },
                          scale: { type: 'spring', stiffness: 260, damping: 18, delay: idx * 0.06 },
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
                        whileHover={{ scale: 1.07 }}
                        whileTap={{ scale: 0.95 }}
                        className="group fluent-3d-bubble relative w-36 h-36 sm:w-40 sm:h-40 rounded-full flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400/70 disabled:opacity-50"
                      >
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute top-3 left-10 right-10 h-3 rounded-full bg-white/80 dark:bg-sky-300/15 blur-[2px]"
                        />
                        <span className="scale-150 sm:scale-[1.7] transition-transform duration-200 group-hover:scale-[1.82]">
                          <EventCategoryEmblem icon={card.icon} />
                        </span>
                      </motion.button>

                      {/* Reactive Shadow beneath Jumping Bubble */}
                      <motion.div
                        aria-hidden="true"
                        animate={{
                          scaleX: [1, 0.72, 1, 0.84, 1],
                          opacity: [0.26, 0.12, 0.26, 0.18, 0.26],
                        }}
                        transition={{
                          duration: 2.3 + idx * 0.22,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: idx * 0.35,
                        }}
                        className="mt-3 h-2.5 w-24 rounded-full bg-slate-900/20 dark:bg-sky-400/20 blur-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

              {/* Settled Round 3D Fluent Speech Bubble with Whisper/Loudspeaker + Domain + Period + Question + Retry */}
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

                <div className="flex items-center gap-3">
                  <FluentPeekCompanion />
                </div>
              </div>

              {/* Error State if Provider Failed — Friendly message with Retry & Settings */}
              {activeErrorReply && !activeAssistantReply && (
                <div className="rounded-3xl border border-red-200 dark:border-red-900/70 bg-red-50/90 dark:bg-red-950/40 p-6 text-red-900 dark:text-red-200 max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <WhatsAppSymbol className="w-4 h-4 shrink-0" />
                    <span>What&apos;s up</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">
                    Try &quot;What&apos;s up&quot; little later ..
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRetryExchange(activeExchange.id)}
                      disabled={isSending}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Question</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-200 hover:bg-red-100/60 transition-colors"
                    >
                      <SettingsIcon className="w-3.5 h-3.5" />
                      <span>Switch Provider in Settings</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sliding Event Cards Carousel — Specific Events ONLY (Date Range + Likelihood) */}
              {activeAssistantReply && eventCards.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      Showing {clampedStart + 1}–{Math.min(clampedStart + visibleCount, eventCards.length)} of{' '}
                      {eventCards.length} specific events
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
                            initial={{ opacity: 0, x: 28, y: 8 }}
                            animate={{ opacity: 1, x: 0, y: 0 }}
                            whileHover={{ y: -3 }}
                            transition={{
                              duration: 0.28,
                              delay: idx * 0.06,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                            className="group fluent-event-card rounded-3xl bg-white/95 dark:bg-slate-900/90 border border-white/90 dark:border-slate-800/90 p-5 sm:p-6 flex flex-col justify-between min-h-[210px] transition-shadow hover:shadow-[0_22px_48px_-20px_rgba(2,132,199,0.22)]"
                          >
                            <div className="space-y-3.5">
                              {/* Top Row: Left = Domain Icon Only | Right = Probability (Line 1) + Rating (Line 2) */}
                              <div className="flex items-start justify-between gap-3">
                                <span
                                  title={topDomainLabel}
                                  aria-label={topDomainLabel}
                                  className="inline-flex shrink-0"
                                >
                                  <EventCategoryEmblem icon={resolvedIcon} />
                                </span>

                                <div className="text-right tabular-nums min-w-0">
                                  <div className="inline-flex items-center justify-end gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{probabilityLine}</span>
                                  </div>
                                  {ratingLine && (
                                    <div className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                      {ratingLine}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Event Name */}
                              <h2 className="font-display text-base font-semibold leading-snug text-slate-900 dark:text-white">
                                {evt.title}
                              </h2>

                              {/* Timeline */}
                              <div className="inline-flex items-center gap-2 rounded-xl bg-sky-50/75 dark:bg-sky-950/35 border border-sky-200/70 dark:border-sky-800/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                <CalendarRange className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                                <span>{displayDate || 'Timing detailed in report'}</span>
                              </div>
                            </div>

                            {/* Glimmering Flash Button (Icon-only) */}
                            <div className="pt-4 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => openEventFlash(evt)}
                                aria-label={`Open flash for ${evt.title}`}
                                title="Flash"
                                className="pa-glimmer-btn relative inline-flex h-10 w-10 items-center justify-center rounded-2xl text-white overflow-hidden transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-sky-400/70"
                              >
                                <Zap className="relative z-10 w-4 h-4 fill-current" />
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
              className="pointer-events-auto w-full max-w-[430px] rounded-3xl border border-white/90 dark:border-slate-700/85 bg-white/92 dark:bg-slate-900/92 backdrop-blur-2xl shadow-[0_24px_60px_-16px_rgba(15,23,42,0.22)] p-4 space-y-2.5"
            >
              {/* Composer Header with Domain Name */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 font-display text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    <span>{`What's up · ${getPromptDomainShortLabel(activePromptDomain)}`}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                    {hasActiveThread && rootExchange?.questionTurn?.threadName?.trim()
                      ? `${rootExchange.questionTurn.threadName.trim()} · `
                      : ''}
                    {activeRefPeriod ? `Period: ${activeRefPeriod}` : 'Choose a domain below'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {hasActiveThread && (
                    <button
                      type="button"
                      onClick={onClearConversation}
                      disabled={isSending}
                      title="Start a brand new thread"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowComposerOptions((prev) => !prev)}
                    aria-expanded={showComposerOptions}
                    title="Prompt style"
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      showComposerOptions
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Style</span>
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

              {/* Always-Visible Domain Selector inside the Chat Box */}
              <div className="flex items-center gap-2">
                <span
                  id="composer-domain-label"
                  className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0"
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
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors truncate ${
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

              {/* Thread Name Input (shown for new thread; follow-ups update the active thread automatically) */}
              {!hasActiveThread && (
                <input
                  type="text"
                  value={threadName}
                  onChange={(e) => setThreadName(e.target.value)}
                  placeholder="Report / Thread name (auto-named if blank)"
                  aria-label="Thread Name"
                  className="w-full rounded-xl border border-slate-200/90 dark:border-slate-700/85 bg-slate-50/80 dark:bg-slate-950/65 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                />
              )}

              {/* Collapsible Prompt Style Selector */}
              {showComposerOptions && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                    Prompt Style
                  </span>
                  <div className="flex-1 inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
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
                </div>
              )}

              {/* Question Input Form (hidden when viewing a finalized thread) */}
              {hasActiveThread && isThreadFinalized ? (
                <div className="rounded-2xl border border-slate-200/85 dark:border-slate-700/85 bg-slate-50/90 dark:bg-slate-950/60 px-3.5 py-3 flex items-center justify-between gap-3">
                  <p
                    className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                  >
                    This thread is finalized.
                  </p>
                  <button
                    type="button"
                    onClick={onClearConversation}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] px-3 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Thread</span>
                  </button>
                </div>
              ) : (
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
                    disabled={isSending}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      hasActiveThread
                        ? 'Ask a follow-up question to update this report…'
                        : 'Type your question… (Enter to send)'
                    }
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                    className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
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
                        <span>{hasActiveThread ? 'Follow Up' : 'Send'}</span>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </>
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
    </div>
  );
}
