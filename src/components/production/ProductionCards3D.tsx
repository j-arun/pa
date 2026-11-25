import {
  Briefcase,
  CalendarPlus,
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Heart,
  Home,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Pause,
  Plus,
  RotateCcw,
  Scale,
  Send,
  ShieldPlus,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EventCardItem, PromptDomain } from '../../types/workbench';
import type { ReadOutSections } from '../../utils/eventParser';
import {
  getMonthNameFromNumber,
  getMonthNumberFromName,
  getPromptDomainShortLabel,
} from '../../utils/promptTemplates';
import { WhatsAppSymbol } from '../WhatsAppSymbol';

interface ProductionCards3DProps {
  cards: EventCardItem[];
  readOutSections: ReadOutSections | null;
  isWaitingForReply: boolean;
  errorDetail?: string | null;
  questionText?: string;
  periodLabel?: string;
  domain?: PromptDomain;
  providerAdapter?: 'gemini' | 'fable';
  isDarkTheme?: boolean;
  canAskFollowUp?: boolean;
  isSpeakerEnabled?: boolean;
  isSpeakingSummary?: boolean;
  onToggleSpeakSummary?: () => void;
  onSendFollowUp?: (question: string) => void;
  onCancelRequest: () => void;
  onRetry: () => void;
  onStartNewThread: () => void;
  canSyncToApple?: boolean;
  isSynced?: boolean;
  isSyncing?: boolean;
  isUnsyncing?: boolean;
  onSyncToApple?: () => void;
  onUnsyncFromApple?: () => void;
}

const CARD_FLIP_DURATION_SEC = 60;

const WAITING_DOMAIN_META: Record<
  PromptDomain,
  { label: string; accentHex: string; glowHex: string }
> = {
  astrology: { label: 'Career', accentHex: '#38bdf8', glowHex: '#0284c7' },
  family: { label: 'Family', accentHex: '#34d399', glowHex: '#059669' },
  finance: { label: 'Finance', accentHex: '#fbbf24', glowHex: '#d97706' },
  general: { label: 'Love', accentHex: '#fb7185', glowHex: '#e11d48' },
  health: { label: 'Health', accentHex: '#a78bfa', glowHex: '#7c3aed' },
  litigation: { label: 'Litigation', accentHex: '#fb923c', glowHex: '#ea580c' },
};

function Stage2DomainEmblem({ domain }: { domain: PromptDomain }) {
  const meta = WAITING_DOMAIN_META[domain];
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/40 shadow-sm shrink-0"
      style={{
        background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${meta.accentHex} 55%, ${meta.glowHex} 100%)`,
        boxShadow: `0 0 16px ${meta.accentHex}66`,
      }}
    >
      {domain === 'astrology' ? (
        <Briefcase className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={2.3} />
      ) : domain === 'family' ? (
        <Home className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={2.3} />
      ) : domain === 'finance' ? (
        <Coins className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={2.3} />
      ) : domain === 'general' ? (
        <Heart className="w-3.5 h-3.5 text-white fill-white/90 drop-shadow" strokeWidth={2.2} />
      ) : domain === 'litigation' ? (
        <Scale className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={2.3} />
      ) : (
        <ShieldPlus className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={2.3} />
      )}
    </span>
  );
}

function Stage2ProviderIcon({
  provider,
  isDarkTheme,
}: {
  provider: 'gemini' | 'fable';
  isDarkTheme: boolean;
}) {
  const gradId = useId();
  const isFable = provider === 'fable';
  const label = isFable ? 'Fable' : 'Gemini';

  return (
    <span
      title={label}
      aria-label={label}
      className={`pa-glass-pill inline-flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${
        isFable
          ? isDarkTheme
            ? '!border-amber-400/55 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
            : '!border-amber-400/80 shadow-[0_0_10px_rgba(245,158,11,0.22)]'
          : isDarkTheme
            ? '!border-sky-400/55 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
            : '!border-sky-400/80 shadow-[0_0_10px_rgba(14,165,233,0.22)]'
      }`}
      style={{
        background: isFable
          ? isDarkTheme
            ? 'radial-gradient(circle at 32% 28%, rgba(253,224,71,0.28), rgba(168,85,247,0.28) 70%, rgba(30,14,48,0.75))'
            : 'radial-gradient(circle at 32% 28%, rgba(254,240,138,0.92), rgba(244,114,182,0.24) 75%, rgba(255,255,255,0.9))'
          : isDarkTheme
            ? 'radial-gradient(circle at 32% 28%, rgba(186,230,253,0.3), rgba(56,189,248,0.24) 70%, rgba(10,24,52,0.75))'
            : 'radial-gradient(circle at 32% 28%, rgba(224,242,254,0.95), rgba(125,211,252,0.38) 75%, rgba(255,255,255,0.9))',
      }}
    >
      {isFable ? (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="3" y1="5" x2="21" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={isDarkTheme ? '#fef08a' : '#d97706'} />
              <stop offset="55%" stopColor={isDarkTheme ? '#f472b6' : '#db2777'} />
              <stop offset="100%" stopColor={isDarkTheme ? '#c084fc' : '#7c3aed'} />
            </linearGradient>
          </defs>
          <path
            d="M12 7.5C9.8 5.4 6.2 5.4 4.2 6.8V17.4C6.2 16 9.8 16 12 18.2C14.2 16 17.8 16 19.8 17.4V6.8C17.8 5.4 14.2 5.4 12 7.5Z"
            fill={`url(#${gradId})`}
            stroke={isDarkTheme ? '#ffffff' : '#7c3aed'}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M12 7.5V18.2"
            stroke={isDarkTheme ? '#ffffff' : '#7c3aed'}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M12 2L12.7 3.8L14.5 4.5L12.7 5.2L12 7L11.3 5.2L9.5 4.5L11.3 3.8L12 2Z"
            fill={isDarkTheme ? '#fde047' : '#d97706'}
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={isDarkTheme ? '#ffffff' : '#0284c7'} />
              <stop offset="50%" stopColor={isDarkTheme ? '#7dd3fc' : '#2563eb'} />
              <stop offset="100%" stopColor={isDarkTheme ? '#818cf8' : '#6366f1'} />
            </linearGradient>
          </defs>
          <path
            d="M11 3C11.8 7.5 14.5 10.2 19 11C14.5 11.8 11.8 14.5 11 19C10.2 14.5 7.5 11.8 3 11C7.5 10.2 10.2 7.5 11 3Z"
            fill={`url(#${gradId})`}
            stroke={isDarkTheme ? '#e0f2fe' : '#0369a1'}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 3.5C18.8 5 19.8 6 21.3 6.3C19.8 6.6 18.8 7.6 18.5 9.1C18.2 7.6 17.2 6.6 15.7 6.3C17.2 6 18.2 5 18.5 3.5Z"
            fill={isDarkTheme ? '#bae6fd' : '#38bdf8'}
          />
        </svg>
      )}
    </span>
  );
}

function BlurredDomainWatermark({
  domain,
  isDarkTheme,
}: {
  domain: PromptDomain;
  isDarkTheme: boolean;
}) {
  const colorClass =
    domain === 'astrology'
      ? isDarkTheme
        ? 'text-sky-300/30'
        : 'text-sky-600/22'
      : domain === 'family'
        ? isDarkTheme
          ? 'text-emerald-300/30'
          : 'text-emerald-600/22'
        : domain === 'finance'
          ? isDarkTheme
            ? 'text-amber-300/30'
            : 'text-amber-600/22'
          : domain === 'general'
            ? isDarkTheme
              ? 'text-rose-300/30'
              : 'text-rose-600/22'
            : domain === 'litigation'
              ? isDarkTheme
                ? 'text-orange-300/30'
                : 'text-orange-600/22'
              : isDarkTheme
                ? 'text-violet-300/30'
                : 'text-violet-600/22';

  const glowColor = WAITING_DOMAIN_META[domain].accentHex;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      <div
        className="relative flex items-center justify-center"
        style={{ filter: 'blur(2.5px)' }}
      >
        <span
          className="absolute w-28 h-28 rounded-full opacity-25 blur-2xl"
          style={{ backgroundColor: glowColor }}
        />
        {domain === 'astrology' ? (
          <Briefcase className={`w-24 h-24 sm:w-28 sm:h-28 ${colorClass}`} strokeWidth={1.6} />
        ) : domain === 'general' ? (
          <Heart className={`w-24 h-24 sm:w-28 sm:h-28 ${colorClass}`} strokeWidth={1.6} />
        ) : domain === 'family' ? (
          <Home className={`w-24 h-24 sm:w-28 sm:h-28 ${colorClass}`} strokeWidth={1.6} />
        ) : domain === 'finance' ? (
          <Coins className={`w-24 h-24 sm:w-28 sm:h-28 ${colorClass}`} strokeWidth={1.6} />
        ) : domain === 'litigation' ? (
          <Scale className={`w-24 h-24 sm:w-28 sm:h-28 ${colorClass}`} strokeWidth={1.6} />
        ) : (
          <ShieldPlus className={`w-24 h-24 sm:w-28 sm:h-28 ${colorClass}`} strokeWidth={1.6} />
        )}
      </div>
    </div>
  );
}

function formatWaitingPeriodLabel(rawPeriod?: string): string {
  const trimmed = (rawPeriod || '').trim();
  if (!trimmed) return '';
  const ym = trimmed.match(/^(\d{4})\s*[-/]?\s*([a-zA-Z]{3,9})$/);
  if (ym) {
    const monthNum = getMonthNumberFromName(ym[2]);
    const fullMonth = getMonthNameFromNumber(monthNum);
    if (fullMonth) return `${ym[1]} ${fullMonth}`;
  }
  const my = trimmed.match(/^([a-zA-Z]{3,9})\s*[-/]?\s*(\d{4})$/);
  if (my) {
    const monthNum = getMonthNumberFromName(my[1]);
    const fullMonth = getMonthNameFromNumber(monthNum);
    if (fullMonth) return `${my[2]} ${fullMonth}`;
  }
  return trimmed;
}

function formatCompactPeriodLabel(rawPeriod?: string): string {
  const full = formatWaitingPeriodLabel(rawPeriod);
  if (!full) return '';
  const ym = full.match(/^(\d{4})\s+([a-zA-Z]+)$/);
  if (ym) return `${ym[2].slice(0, 3)} ${ym[1]}`;
  const my = full.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (my) return `${my[1].slice(0, 3)} ${my[2]}`;
  return full;
}

function extractNumericPercent(
  probText?: string,
  likelihoodText?: string,
  fallbackIndex = 0,
): number {
  const combined = `${probText ?? ''} ${likelihoodText ?? ''}`.trim();
  const pctMatch = combined.match(/(\d{1,3})\s*%/);
  if (pctMatch) {
    const num = Number(pctMatch[1]);
    if (Number.isFinite(num)) return Math.min(99, Math.max(10, num));
  }
  const lower = combined.toLowerCase();
  if (/\b(very\s*high|certain|definite|strong)\b/.test(lower)) return 88;
  if (/\b(high|favorable|favourable)\b/.test(lower)) return 80;
  if (/\b(mostly\s*likely|likely|good|probable)\b/.test(lower)) return 72;
  if (/\b(moderate|medium|steady|balanced)\b/.test(lower)) return 62;
  if (/\b(low|slight|minor|mild)\b/.test(lower)) return 44;
  return Math.max(48, 82 - fallbackIndex * 7);
}

function formatShortWhenLabel(rawWhen?: string, fallbackPeriod?: string, idx = 0): {
  shortTick: string;
  fullWindow: string;
  sortDay: number;
} {
  const text = (rawWhen || '').trim();
  const periodShort = formatCompactPeriodLabel(fallbackPeriod).split(' ')[0] || 'Window';
  if (!text) {
    return {
      shortTick: `${periodShort} ${idx + 1}`,
      fullWindow: fallbackPeriod || `Window ${idx + 1}`,
      sortDay: (idx + 1) * 5,
    };
  }

  // Match ISO date like 2026-11-14 or 2026-11-14 to 2026-11-19
  const isoRange = text.match(
    /(\d{4})-(\d{2})-(\d{2})(?:\s*(?:to|–|-|through)\s*(?:\d{4}-(\d{2})-)?(\d{1,2}))?/i,
  );
  if (isoRange) {
    const mName = (getMonthNameFromNumber(Number(isoRange[2])) ?? periodShort).slice(0, 3);
    const d1 = Number(isoRange[3]);
    const d2 = isoRange[5] ? Number(isoRange[5]) : null;
    const endMonth = isoRange[4]
      ? (getMonthNameFromNumber(Number(isoRange[4])) ?? mName).slice(0, 3)
      : null;
    return {
      shortTick: `${mName} ${d1}`,
      fullWindow: d2
        ? endMonth && endMonth !== mName
          ? `${mName} ${d1}–${endMonth} ${d2}`
          : `${mName} ${d1}–${d2}`
        : `${mName} ${d1}`,
      sortDay: Number(isoRange[2]) * 31 + d1,
    };
  }

  // Match "Nov 14–19" or "November 14 to 19"
  const monthDay = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:\s*(?:–|-|to)\s*(\d{1,2}))?/i,
  );
  if (monthDay) {
    const mShort = monthDay[1].slice(0, 3);
    const mNum = getMonthNumberFromName(mShort) ?? 1;
    const d1 = Number(monthDay[2]);
    const d2 = monthDay[3] ? Number(monthDay[3]) : null;
    return {
      shortTick: `${mShort} ${d1}`,
      fullWindow: d2 ? `${mShort} ${d1}–${d2}` : `${mShort} ${d1}`,
      sortDay: mNum * 31 + d1,
    };
  }

  const trimmedShort = text.replace(/\s+/g, ' ').slice(0, 12).trim();
  return {
    shortTick: trimmedShort.length < text.length ? `${trimmedShort}` : trimmedShort,
    fullWindow: text,
    sortDay: 1000 + idx,
  };
}

function drawFourPointSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerCurve = 0.22,
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  ctx.quadraticCurveTo(
    cx + outerR * innerCurve,
    cy - outerR * innerCurve,
    cx + outerR,
    cy,
  );
  ctx.quadraticCurveTo(
    cx + outerR * innerCurve,
    cy + outerR * innerCurve,
    cx,
    cy + outerR,
  );
  ctx.quadraticCurveTo(
    cx - outerR * innerCurve,
    cy + outerR * innerCurve,
    cx - outerR,
    cy,
  );
  ctx.quadraticCurveTo(
    cx - outerR * innerCurve,
    cy - outerR * innerCurve,
    cx,
    cy - outerR,
  );
  ctx.closePath();
}

function createAdapterBallSpriteTexture(
  provider: 'gemini' | 'fable',
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const isFable = provider === 'fable';
  const cx = size / 2;
  const cy = size / 2 - 18;

  const aura = ctx.createRadialGradient(cx, cy, 14, cx, cy, 220);
  if (isFable) {
    aura.addColorStop(0, 'rgba(253, 224, 71, 0.56)');
    aura.addColorStop(0.42, 'rgba(192, 132, 252, 0.36)');
    aura.addColorStop(1, 'rgba(192, 132, 252, 0)');
  } else {
    aura.addColorStop(0, 'rgba(186, 230, 253, 0.58)');
    aura.addColorStop(0.42, 'rgba(56, 189, 248, 0.34)');
    aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
  }
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (isFable) {
    const crestGrad = ctx.createLinearGradient(cx - 72, cy - 72, cx + 72, cy + 72);
    crestGrad.addColorStop(0, '#fef08a');
    crestGrad.addColorStop(0.5, '#f472b6');
    crestGrad.addColorStop(1, '#a855f7');

    ctx.shadowColor = 'rgba(250, 204, 21, 0.65)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = crestGrad;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.bezierCurveTo(cx - 28, cy - 42, cx - 72, cy - 38, cx - 80, cy - 16);
    ctx.lineTo(cx - 80, cy + 44);
    ctx.bezierCurveTo(cx - 56, cy + 28, cx - 22, cy + 32, cx, cy + 54);
    ctx.bezierCurveTo(cx + 22, cy + 32, cx + 56, cy + 28, cx + 80, cy + 44);
    ctx.lineTo(cx + 80, cy - 16);
    ctx.bezierCurveTo(cx + 72, cy - 38, cx + 28, cy - 42, cx, cy - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 54);
    ctx.stroke();

    const starGrad = ctx.createLinearGradient(cx - 30, cy - 92, cx + 30, cy - 28);
    starGrad.addColorStop(0, '#ffffff');
    starGrad.addColorStop(1, '#fde047');
    ctx.fillStyle = starGrad;
    drawFourPointSparkle(ctx, cx, cy - 64, 34, 0.24);
    ctx.fill();
  } else {
    const starGrad = ctx.createLinearGradient(cx - 84, cy - 84, cx + 84, cy + 84);
    starGrad.addColorStop(0, '#ffffff');
    starGrad.addColorStop(0.48, '#7dd3fc');
    starGrad.addColorStop(1, '#818cf8');

    ctx.shadowColor = 'rgba(125, 211, 252, 0.78)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = starGrad;
    drawFourPointSparkle(ctx, cx - 8, cy + 4, 84, 0.2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#e0f2fe';
    drawFourPointSparkle(ctx, cx + 64, cy - 58, 30, 0.22);
    ctx.fill();
  }
  ctx.restore();

  const label = isFable ? 'FABLE' : 'GEMINI';
  const pillW = 216;
  const pillH = 58;
  const pillX = size / 2 - pillW / 2;
  const pillY = size / 2 + 86;

  ctx.save();
  ctx.fillStyle = isFable ? 'rgba(38, 12, 54, 0.78)' : 'rgba(8, 22, 46, 0.78)';
  ctx.strokeStyle = isFable ? 'rgba(253, 224, 71, 0.82)' : 'rgba(125, 211, 252, 0.85)';
  ctx.lineWidth = 3;
  ctx.shadowColor = isFable ? 'rgba(244, 114, 182, 0.45)' : 'rgba(56, 189, 248, 0.45)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 29);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = '800 30px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = isFable ? 'rgba(253, 224, 71, 0.8)' : 'rgba(125, 211, 252, 0.85)';
  ctx.shadowBlur = 10;
  ctx.fillText(label.split('').join(' '), size / 2, pillY + pillH / 2 + 1);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createMicroAdapterSymbolTexture(
  provider: 'gemini' | 'fable',
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const isFable = provider === 'fable';
  const cx = size / 2;
  const cy = size / 2;

  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 56);
  glow.addColorStop(0, isFable ? 'rgba(253, 224, 71, 0.75)' : 'rgba(186, 230, 253, 0.78)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isFable ? '#fef08a' : '#e0f2fe';
  drawFourPointSparkle(ctx, cx, cy, isFable ? 28 : 34, isFable ? 0.28 : 0.2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function WindowsSpeakerIcon({
  active = false,
  className = 'w-4 h-4',
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.5 9.5H7.2L12.5 5.2V18.8L7.2 14.5H3.5C2.95 14.5 2.5 14.05 2.5 13.5V10.5C2.5 9.95 2.95 9.5 3.5 9.5Z"
        fill="currentColor"
      />
      <path
        d="M15.4 8.8C16.55 9.9 16.55 14.1 15.4 15.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18.1 6.2C20.25 8.5 20.25 15.5 18.1 17.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={active ? 1 : 0.78}
      />
    </svg>
  );
}

export function ProductionCards3D({
  cards,
  readOutSections,
  isWaitingForReply,
  errorDetail,
  questionText,
  periodLabel,
  domain,
  providerAdapter = 'gemini',
  isDarkTheme = true,
  canAskFollowUp = false,
  isSpeakerEnabled = true,
  isSpeakingSummary = false,
  onToggleSpeakSummary,
  onSendFollowUp,
  onCancelRequest,
  onRetry,
  onStartNewThread,
  canSyncToApple = false,
  isSynced = false,
  isSyncing = false,
  isUnsyncing = false,
  onSyncToApple,
  onUnsyncFromApple,
}: ProductionCards3DProps) {
  const waitingCanvasRef = useRef<HTMLDivElement | null>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [selectedTimelineIdx, setSelectedTimelineIdx] = useState(0);

  // Movable priority-ordered bottom carousel window
  const [carouselStartIdx, setCarouselStartIdx] = useState(0);
  const [visibleSlots, setVisibleSlots] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth < 680) return 1;
    if (window.innerWidth < 1040) return 2;
    return 3;
  });

  // 60-second per-card in-place flip tracking: cardId -> expiry epoch ms
  const [flippedUntilMap, setFlippedUntilMap] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const interactionRef = useRef({
    providerAdapter,
    isDarkTheme,
  });
  interactionRef.current = {
    providerAdapter,
    isDarkTheme,
  };

  // Keep responsive card slot count crisp across window resizes
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 680) setVisibleSlots(1);
      else if (window.innerWidth < 1040) setVisibleSlots(2);
      else setVisibleSlots(3);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reset stage local state cleanly whenever the report cards change
  useEffect(() => {
    setCarouselStartIdx(0);
    setSelectedTimelineIdx(0);
    setFlippedUntilMap({});
  }, [cards]);

  // 1-second timer tick to update 60s countdown rings and auto-flip expired cards back to front
  const hasAnyFlippedCard = useMemo(
    () => Object.keys(flippedUntilMap).length > 0,
    [flippedUntilMap],
  );

  useEffect(() => {
    if (!hasAnyFlippedCard) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      setFlippedUntilMap((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [id, expiry] of Object.entries(prev)) {
          if (expiry > current) {
            next[id] = expiry;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasAnyFlippedCard]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFollowUpOpen) {
          setIsFollowUpOpen(false);
          return;
        }
      }
      if (isFollowUpOpen || isWaitingForReply || errorDetail) return;
      if (e.key === 'ArrowRight') {
        setCarouselStartIdx((prev) =>
          Math.min(Math.max(0, cards.length - visibleSlots), prev + 1),
        );
      } else if (e.key === 'ArrowLeft') {
        setCarouselStartIdx((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cards.length,
    errorDetail,
    isFollowUpOpen,
    isWaitingForReply,
    visibleSlots,
  ]);

  useEffect(() => {
    if (isFollowUpOpen) {
      const t = window.setTimeout(() => followUpInputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [isFollowUpOpen]);

  // Real Three.js 3D Waiting / Rounding Crystal Sphere (active only while waiting for LLM reply)
  useEffect(() => {
    if (!isWaitingForReply) return;
    const mount = waitingCanvasRef.current;
    if (!mount) return;

    const disposables: Array<{ dispose: () => void }> = [];

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftwareGl = /swiftshader|llvmpipe|software/i.test(rendererStr);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    disposables.push(envTex);
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0.15, 7.2);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xfffcf2, 1.5);
    keyLight.position.set(4.5, 5.5, 6.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
    rimLight.position.set(-5.0, 2.5, -3.5);
    scene.add(rimLight);

    const thinkingGroup = new THREE.Group();
    scene.add(thinkingGroup);

    const outerGlassGeo = new THREE.SphereGeometry(1.52, isSoftwareGl ? 28 : 44, isSoftwareGl ? 28 : 44);
    const outerGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      roughness: 0.08,
      metalness: 0.06,
      transmission: 0.86,
      thickness: 0.9,
      ior: 1.44,
      transparent: true,
      opacity: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.14,
      depthWrite: false,
    });
    const outerGlassOrb = new THREE.Mesh(outerGlassGeo, outerGlassMat);
    outerGlassOrb.renderOrder = 3;
    thinkingGroup.add(outerGlassOrb);
    disposables.push(outerGlassGeo, outerGlassMat);

    const cageGeo = new THREE.IcosahedronGeometry(1.62, 1);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      wireframe: true,
      transparent: true,
      opacity: 0.24,
    });
    const geodesicCage = new THREE.Mesh(cageGeo, cageMat);
    thinkingGroup.add(geodesicCage);
    disposables.push(cageGeo, cageMat);

    const ringGeo1 = new THREE.TorusGeometry(1.88, 0.032, 16, 72);
    const orbitRingMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.52,
      roughness: 0.2,
      metalness: 0.85,
      transparent: true,
      opacity: 0.72,
    });
    const orbitRing1 = new THREE.Mesh(ringGeo1, orbitRingMat);
    orbitRing1.rotation.x = Math.PI / 2.6;
    thinkingGroup.add(orbitRing1);

    const ringGeo2 = new THREE.TorusGeometry(2.06, 0.024, 14, 72);
    const orbitRing2 = new THREE.Mesh(ringGeo2, orbitRingMat);
    orbitRing2.rotation.y = Math.PI / 3;
    thinkingGroup.add(orbitRing2);
    disposables.push(ringGeo1, ringGeo2, orbitRingMat);

    const innerAuraGeo = new THREE.SphereGeometry(0.95, 24, 24);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const innerCoreAura = new THREE.Mesh(innerAuraGeo, innerCoreMat);
    thinkingGroup.add(innerCoreAura);
    disposables.push(innerAuraGeo, innerCoreMat);

    const geminiSpriteTex = createAdapterBallSpriteTexture('gemini', maxAnisotropy);
    const fableSpriteTex = createAdapterBallSpriteTexture('fable', maxAnisotropy);
    const geminiSpriteMat = new THREE.SpriteMaterial({
      map: geminiSpriteTex,
      transparent: true,
      depthWrite: false,
    });
    const fableSpriteMat = new THREE.SpriteMaterial({
      map: fableSpriteTex,
      transparent: true,
      depthWrite: false,
    });
    const centerAdapterSprite = new THREE.Sprite(
      interactionRef.current.providerAdapter === 'fable' ? fableSpriteMat : geminiSpriteMat,
    );
    centerAdapterSprite.scale.set(1.28, 1.28, 1);
    centerAdapterSprite.renderOrder = 2;
    thinkingGroup.add(centerAdapterSprite);
    disposables.push(geminiSpriteTex, fableSpriteTex, geminiSpriteMat, fableSpriteMat);

    const bubbleGeo = new THREE.SphereGeometry(0.085, 14, 14);
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.35,
      transparent: true,
      opacity: 0.9,
    });
    disposables.push(bubbleGeo, bubbleMat);

    const innerBubbles: Array<{
      mesh: THREE.Mesh;
      phase: number;
      speed: number;
      orbitR: number;
      angleOffset: number;
      baseScale: number;
    }> = [];
    for (let i = 0; i < 20; i += 1) {
      const m = new THREE.Mesh(bubbleGeo, bubbleMat);
      const baseScale = 0.48 + (i % 5) * 0.24;
      m.scale.setScalar(baseScale);
      m.renderOrder = 1;
      thinkingGroup.add(m);
      innerBubbles.push({
        mesh: m,
        phase: (i / 20) * 1.35,
        speed: 0.28 + (i % 4) * 0.09,
        orbitR: 0.44 + ((i * 7) % 10) * 0.085,
        angleOffset: i * 1.15,
        baseScale,
      });
    }

    const geminiMicroTex = createMicroAdapterSymbolTexture('gemini', maxAnisotropy);
    const fableMicroTex = createMicroAdapterSymbolTexture('fable', maxAnisotropy);
    const geminiMicroMat = new THREE.SpriteMaterial({
      map: geminiMicroTex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const fableMicroMat = new THREE.SpriteMaterial({
      map: fableMicroTex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    disposables.push(geminiMicroTex, fableMicroTex, geminiMicroMat, fableMicroMat);

    const innerMicroSymbols: Array<{
      sprite: THREE.Sprite;
      phase: number;
      speed: number;
      orbitR: number;
      angleOffset: number;
      baseScale: number;
    }> = [];
    for (let i = 0; i < 12; i += 1) {
      const sp = new THREE.Sprite(
        interactionRef.current.providerAdapter === 'fable' ? fableMicroMat : geminiMicroMat,
      );
      const baseScale = 0.18 + (i % 3) * 0.06;
      sp.scale.set(baseScale, baseScale, 1);
      sp.renderOrder = 2;
      thinkingGroup.add(sp);
      innerMicroSymbols.push({
        sprite: sp,
        phase: (i / 12) + 0.2,
        speed: 0.22 + (i % 3) * 0.08,
        orbitR: 0.65 + (i % 5) * 0.12,
        angleOffset: i * 1.48 + 0.5,
        baseScale,
      });
    }

    const handleResize = () => {
      if (!mount) return;
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      camera.aspect = w / h;
      camera.fov = w < 720 ? 48 : 38;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    let elapsed = 0;
    let lastTime = performance.now();
    const frameInterval = isSoftwareGl ? 1000 / 30 : 0;
    let lastRenderMs = 0;
    let rafId = 0;
    let isDisposed = false;

    const animate = (now: number) => {
      if (isDisposed) return;
      rafId = window.requestAnimationFrame(animate);
      if (frameInterval > 0 && now - lastRenderMs < frameInterval) return;
      lastRenderMs = now;

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      const isFable = interactionRef.current.providerAdapter === 'fable';
      const viewportW = mount?.clientWidth || window.innerWidth;
      thinkingGroup.scale.setScalar(viewportW < 560 ? 0.84 : 1.04);
      thinkingGroup.position.y = -0.06 + Math.sin(elapsed * 1.9) * 0.05;

      centerAdapterSprite.material = isFable ? fableSpriteMat : geminiSpriteMat;
      innerCoreMat.color.setHex(isFable ? 0xc084fc : 0x0ea5e9);
      outerGlassMat.color.setHex(isFable ? 0xf5d0fe : 0x7dd3fc);
      outerGlassMat.emissive.setHex(isFable ? 0x9333ea : 0x0284c7);
      cageMat.color.setHex(isFable ? 0xfde047 : 0xbae6fd);
      orbitRingMat.color.setHex(isFable ? 0xf5d0fe : 0x7dd3fc);
      orbitRingMat.emissive.setHex(isFable ? 0xd946ef : 0x38bdf8);
      bubbleMat.color.setHex(isFable ? 0xfef08a : 0xe0f2fe);
      bubbleMat.emissive.setHex(isFable ? 0xe879f9 : 0x38bdf8);

      outerGlassOrb.rotation.y = elapsed * 0.62;
      outerGlassOrb.rotation.x = elapsed * 0.34;
      geodesicCage.rotation.y = -elapsed * 0.48;
      geodesicCage.rotation.z = elapsed * 0.28;
      orbitRing1.rotation.z = elapsed * 1.25;
      orbitRing1.rotation.y = elapsed * 0.45;
      orbitRing2.rotation.x = elapsed * 0.98;
      orbitRing2.rotation.z = -elapsed * 0.4;

      innerCoreAura.scale.setScalar(1 + Math.sin(elapsed * 3.0) * 0.1);

      const jumpWave = Math.abs(Math.sin(elapsed * 3.2));
      centerAdapterSprite.position.set(
        Math.sin(elapsed * 1.4) * 0.04,
        -0.1 + jumpWave * 0.22,
        0.12,
      );
      const jumpScale = 1.24 + Math.sin(elapsed * 6.4) * 0.06;
      centerAdapterSprite.scale.set(jumpScale, jumpScale, 1);

      for (const b of innerBubbles) {
        const cycle = (elapsed * b.speed + b.phase) % 1;
        const y = -0.82 + cycle * 1.64;
        const radialEnvelope = Math.sqrt(Math.max(0.08, 1 - y * y * 1.15));
        const r = b.orbitR * radialEnvelope;
        const theta = b.angleOffset + elapsed * 1.65 + cycle * Math.PI * 1.6;
        b.mesh.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
        b.mesh.scale.setScalar(Math.max(0.01, b.baseScale * Math.sin(cycle * Math.PI)));
      }

      const microMat = isFable ? fableMicroMat : geminiMicroMat;
      for (const ms of innerMicroSymbols) {
        ms.sprite.material = microMat;
        const cycle = (elapsed * ms.speed + ms.phase) % 1;
        const y = -0.74 + cycle * 1.48;
        const radialEnvelope = Math.sqrt(Math.max(0.1, 1 - y * y * 1.18));
        const r = ms.orbitR * radialEnvelope;
        const theta = ms.angleOffset - elapsed * 1.2 + cycle * Math.PI * 1.2;
        ms.sprite.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
        const s = ms.baseScale * (0.45 + 0.75 * Math.sin(cycle * Math.PI));
        ms.sprite.scale.set(s, s, 1);
      }

      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [isWaitingForReply]);

  const effectiveDomain: PromptDomain = domain ?? 'astrology';
  const domainShortLabel = getPromptDomainShortLabel(effectiveDomain);
  const compactPeriod = formatCompactPeriodLabel(periodLabel);
  const waitingPeriod = formatWaitingPeriodLabel(periodLabel);

  const answerText = readOutSections?.answer?.trim() || '';
  const summaryText = readOutSections?.summary?.trim() || '';

  // Priority-ordered cards with normalized percent + full timing text
  const cardItems = useMemo(
    () =>
      cards.map((card, idx) => {
        const pct = extractNumericPercent(card.probability, card.likelihood, idx);
        const whenInfo = formatShortWhenLabel(card.when || card.dateRange || card.timeframe, periodLabel, idx);
        const fullWhenText = (card.when || card.dateRange || card.timeframe || whenInfo.fullWindow).trim();
        return {
          card,
          priorityIdx: idx,
          pct,
          whenInfo,
          fullWhenText,
        };
      }),
    [cards, periodLabel],
  );

  // Timeline bars ordered chronologically along the month for the chart
  const timelineBars = useMemo(() => {
    return [...cardItems]
      .sort((a, b) => a.whenInfo.sortDay - b.whenInfo.sortDay)
      .slice(0, 8);
  }, [cardItems]);

  const safeTimelineIdx =
    timelineBars.length > 0
      ? Math.min(selectedTimelineIdx, timelineBars.length - 1)
      : 0;
  const activeTimelineBar = timelineBars[safeTimelineIdx] ?? null;

  const maxStartIdx = Math.max(0, cardItems.length - visibleSlots);
  const clampedStartIdx = Math.min(carouselStartIdx, maxStartIdx);
  const visibleBottomCards = cardItems.slice(clampedStartIdx, clampedStartIdx + visibleSlots);
  const totalPages = Math.max(1, maxStartIdx + 1);

  const toggleCardFlip = (cardId: string) => {
    const current = Date.now();
    setNowMs(current);
    setFlippedUntilMap((prev) => {
      if (prev[cardId] && prev[cardId] > current) {
        const next = { ...prev };
        delete next[cardId];
        return next;
      }
      return {
        ...prev,
        [cardId]: current + CARD_FLIP_DURATION_SEC * 1000,
      };
    });
  };

  const focusPriorityCardAndFlip = (priorityIdx: number) => {
    if (priorityIdx < 0 || priorityIdx >= cardItems.length) return;
    const targetStart = Math.min(maxStartIdx, Math.max(0, priorityIdx - Math.floor(visibleSlots / 2)));
    setCarouselStartIdx(targetStart);
    const targetId = cardItems[priorityIdx].card.id;
    const current = Date.now();
    setNowMs(current);
    setFlippedUntilMap((prev) => ({
      ...prev,
      [targetId]: current + CARD_FLIP_DURATION_SEC * 1000,
    }));
  };

  const handleFollowUpSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canAskFollowUp || !onSendFollowUp) return;
    const trimmed = followUpDraft.trim();
    if (!trimmed) {
      setFollowUpError('Please enter a follow-up question.');
      followUpInputRef.current?.focus();
      return;
    }
    setIsFollowUpOpen(false);
    setFollowUpDraft('');
    setFollowUpError(null);
    onSendFollowUp(trimmed);
  };

  const handleNewThreadClick = () => {
    setIsFollowUpOpen(false);
    setFollowUpDraft('');
    setFollowUpError(null);
    setFlippedUntilMap({});
    onStartNewThread();
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden select-none bg-transparent">
      {/* Stage 2 Waiting State: Three.js Spinning Orb + Jiggly Floating Question Words */}
      {isWaitingForReply && (
        <>
          <div ref={waitingCanvasRef} className="absolute inset-0 w-full h-full" />
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-between py-10 px-4">
            <div className="text-center space-y-3 flex flex-col items-center">
              {(domain || periodLabel) && (
                <div className="pa-glass-pill inline-flex items-center justify-center gap-2.5 rounded-full px-4 py-1.5">
                  {domain && <Stage2DomainEmblem domain={domain} />}
                  {waitingPeriod && (
                    <span
                      className={`text-xs sm:text-sm font-bold tracking-[0.16em] uppercase tabular-nums ${
                        isDarkTheme ? 'text-sky-200' : 'text-sky-800'
                      }`}
                    >
                      {waitingPeriod}
                    </span>
                  )}
                </div>
              )}
              {questionText && (
                <p
                  aria-label={questionText}
                  className={`pa-question-float max-w-xl flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm sm:text-base font-medium leading-relaxed pt-1 ${
                    isDarkTheme ? 'text-slate-100' : 'text-slate-800'
                  }`}
                >
                  {questionText
                    .trim()
                    .split(/\s+/)
                    .map((word, idx) => {
                      const jiggleClass =
                        idx % 3 === 0
                          ? 'pa-question-word-jiggle-a'
                          : idx % 3 === 1
                            ? 'pa-question-word-jiggle-b'
                            : 'pa-question-word-jiggle-c';
                      return (
                        <span
                          key={`${idx}-${word}`}
                          className={jiggleClass}
                          style={{ animationDelay: `${((idx * 0.14) % 1.68).toFixed(2)}s` }}
                        >
                          {word}
                        </span>
                      );
                    })}
                </p>
              )}
            </div>

            <div className="pointer-events-auto flex flex-col items-center">
              <button
                type="button"
                onClick={onCancelRequest}
                aria-label="Pause"
                title="Pause"
                className="pa-glass-pill inline-flex h-10 w-10 items-center justify-center rounded-full text-rose-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4 fill-current" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Error State Overlay */}
      {!isWaitingForReply && errorDetail && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-slate-950/35 backdrop-blur-xs">
          <div className="pa-glass-card max-w-md w-full rounded-[26px] border-rose-400/50 p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-500">
              <WhatsAppSymbol className="w-5 h-5" />
              <span>What&apos;s up</span>
            </div>
            <p className={`text-sm font-medium ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Try &quot;What&apos;s up&quot; little later ..
            </p>
            <p className={`text-xs break-words ${isDarkTheme ? 'text-rose-300' : 'text-rose-700'}`}>
              {errorDetail}
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={handleNewThreadClick}
                className="pa-glass-pill inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                <span>New Thread</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Stage 2 Layout: Parallel Answer + Overview Widget Top, Movable Flipping Event Cards Bottom */}
      {!isWaitingForReply && !errorDetail && (
        <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-between max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3.5 pb-3.5 gap-3.5 overflow-y-auto fluent-scroll">
          {/* TOP HALF: Answer Only (Left) + Smaller Timeline-Only Widget (Top-Right Parallel) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(275px,315px)] gap-3.5 items-stretch min-h-0">
            {/* Top-Left: Answer Window (Question in Header Bar + Transparent Answer Body) */}
            <section
              aria-label="Answer"
              className="pa-glass-card relative overflow-hidden rounded-[26px] p-4 sm:p-5 flex flex-col min-h-[180px] lg:min-h-[218px]"
            >
              <div className="flex items-start justify-between gap-3 mb-2.5 shrink-0">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 ${
                        isDarkTheme ? 'text-sky-300' : 'text-sky-600'
                      }`}
                    />
                    <h2
                      className={`font-sans text-xs font-bold uppercase tracking-wider shrink-0 ${
                        isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                      }`}
                    >
                      Answer
                    </h2>
                    <Stage2ProviderIcon
                      provider={providerAdapter}
                      isDarkTheme={isDarkTheme}
                    />
                  </div>
                  {questionText?.trim() && (
                    <p
                      title={questionText.trim()}
                      className={`text-xs sm:text-[13px] font-medium leading-snug line-clamp-2 break-words ${
                        isDarkTheme ? 'text-sky-100/90' : 'text-slate-800'
                      }`}
                    >
                      {questionText.trim()}
                    </p>
                  )}
                </div>

                {isSpeakerEnabled && Boolean(answerText || summaryText) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSpeakSummary?.();
                    }}
                    aria-label={isSpeakingSummary ? 'Stop reading answer' : 'Read answer aloud'}
                    title={isSpeakingSummary ? 'Stop reading answer' : 'Read answer aloud'}
                    className={`pa-glass-pill inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer shrink-0 ${
                      isSpeakingSummary
                        ? '!border-sky-400 !bg-sky-500 text-white shadow-[0_0_18px_rgba(14,165,233,0.65)] animate-pulse'
                        : isDarkTheme
                          ? 'text-slate-100 hover:text-sky-300'
                          : 'text-slate-700 hover:text-sky-600'
                    }`}
                  >
                    <WindowsSpeakerIcon active={isSpeakingSummary} className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div
                className={`pa-glass-subwell rounded-2xl px-4 py-3 flex-1 min-h-0 overflow-y-auto fluent-scroll select-text font-sans text-xs leading-relaxed ${
                  isDarkTheme ? 'text-slate-100/95' : 'text-slate-800'
                }`}
              >
                {answerText ? (
                  <p className="whitespace-pre-line break-words">{answerText}</p>
                ) : summaryText ? (
                  <p className="whitespace-pre-line break-words">{summaryText}</p>
                ) : (
                  <p className={isDarkTheme ? 'text-slate-300' : 'text-slate-600'}>
                    Report insights ready across your timeline below.
                  </p>
                )}
              </div>
            </section>

            {/* Top-Right: Smaller Timeline-Only Widget */}
            <section
              aria-label="Timeline"
              className="pa-glass-card rounded-[26px] p-3.5 sm:p-4 flex flex-col justify-between gap-2 relative w-full lg:max-w-[315px] justify-self-end"
            >
              {/* Header: Timeline · Domain · Period + Provider Icon */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Stage2DomainEmblem domain={effectiveDomain} />
                  <h2
                    className={`font-display text-xs sm:text-[13.5px] font-semibold tracking-tight truncate ${
                      isDarkTheme ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Timeline · {domainShortLabel}
                    {compactPeriod ? ` · ${compactPeriod}` : ''}
                  </h2>
                </div>

                <div className="relative flex items-center shrink-0">
                  <Stage2ProviderIcon
                    provider={providerAdapter}
                    isDarkTheme={isDarkTheme}
                  />
                </div>
              </div>

              {/* Inner Timeline Bar Chart Well Only */}
              <div className="pa-glass-subwell relative rounded-2xl p-2.5 min-h-[126px] flex flex-col justify-between">
                {timelineBars.length === 0 ? (
                  <div
                    className={`flex-1 flex items-center justify-center text-xs ${
                      isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    No dated timeline available.
                  </div>
                ) : (
                  <>
                    {/* Edge Navigation Buttons Inside Chart Well */}
                    {timelineBars.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTimelineIdx((prev) =>
                              prev > 0 ? prev - 1 : timelineBars.length - 1,
                            )
                          }
                          aria-label="Previous timeline window"
                          className={`pa-glass-pill absolute left-1 top-1/2 -translate-y-1/2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-md transition-all cursor-pointer ${
                            isDarkTheme ? 'text-slate-100 hover:brightness-115' : 'text-slate-700'
                          }`}
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTimelineIdx((prev) =>
                              prev < timelineBars.length - 1 ? prev + 1 : 0,
                            )
                          }
                          aria-label="Next timeline window"
                          className={`pa-glass-pill absolute right-1 top-1/2 -translate-y-1/2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-md transition-all cursor-pointer ${
                            isDarkTheme ? 'text-slate-100 hover:brightness-115' : 'text-slate-700'
                          }`}
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </>
                    )}

                    {/* Floating Frosted Glass Tooltip for Active Bar */}
                    {activeTimelineBar && (
                      <div className="mb-1 flex justify-center px-5">
                        <button
                          type="button"
                          onClick={() =>
                            focusPriorityCardAndFlip(activeTimelineBar.priorityIdx)
                          }
                          title="Click to jump to this event card"
                          className="pa-glass-pill relative z-10 rounded-xl px-2.5 py-1 text-left hover:scale-[1.02] transition-transform cursor-pointer max-w-full"
                        >
                          <div
                            className={`text-[10px] font-medium truncate ${
                              isDarkTheme ? 'text-sky-200/85' : 'text-slate-600'
                            }`}
                          >
                            {activeTimelineBar.whenInfo.fullWindow}
                          </div>
                          <div
                            className={`text-[11px] font-bold truncate ${
                              isDarkTheme ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {activeTimelineBar.pct}%, {activeTimelineBar.card.title}
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Rounded Probability Vertical Bars + Grid */}
                    <div className="relative flex-1 flex items-end gap-1.5 pl-7 pr-5 pt-0.5 pb-4 min-h-[70px]">
                      {/* Subtle horizontal scale guides */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-7 top-0.5 bottom-4 flex flex-col justify-between"
                      >
                        {[100, 50, 0].map((tick) => (
                          <div
                            key={tick}
                            className={`relative border-b ${
                              isDarkTheme ? 'border-white/10' : 'border-slate-400/25'
                            }`}
                          >
                            <span
                              className={`absolute -left-7 -top-1.5 text-[9px] font-mono tabular-nums ${
                                isDarkTheme ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {tick}%
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Bars */}
                      <div className="relative z-10 w-full h-[50px] flex items-end justify-around gap-1">
                        {timelineBars.map((bar, barIdx) => {
                          const isBarActive = barIdx === safeTimelineIdx;
                          const heightPct = Math.max(22, Math.min(96, bar.pct));
                          return (
                            <button
                              key={bar.card.id}
                              type="button"
                              onMouseEnter={() => setSelectedTimelineIdx(barIdx)}
                              onClick={() => {
                                setSelectedTimelineIdx(barIdx);
                                focusPriorityCardAndFlip(bar.priorityIdx);
                              }}
                              aria-label={`${bar.whenInfo.fullWindow}: ${bar.pct}%`}
                              className="relative flex-1 max-w-[22px] h-full flex flex-col items-center justify-end group cursor-pointer"
                            >
                              <div
                                className={`relative w-full rounded-t-full rounded-b-sm transition-all duration-300 ${
                                  isBarActive
                                    ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.55)]'
                                    : isDarkTheme
                                      ? 'bg-gradient-to-t from-slate-500/75 to-amber-300/65 hover:to-amber-300/90'
                                      : 'bg-gradient-to-t from-sky-500/75 to-amber-400/80 hover:to-amber-400'
                                }`}
                                style={{ height: `${heightPct}%` }}
                              >
                                {isBarActive && (
                                  <span
                                    aria-hidden="true"
                                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-950 border-2 border-amber-200 shadow"
                                  />
                                )}
                              </div>
                              <span
                                className={`absolute -bottom-4 text-[8.5px] font-mono tabular-nums whitespace-nowrap ${
                                  isBarActive
                                    ? isDarkTheme
                                      ? 'text-white font-bold'
                                      : 'text-slate-900 font-bold'
                                    : isDarkTheme
                                      ? 'text-slate-400'
                                      : 'text-slate-600'
                                }`}
                              >
                                {bar.whenInfo.shortTick}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer: Timeline Pagination Dots */}
              {timelineBars.length > 0 && (
                <div className="flex items-center justify-center gap-1 pt-0.5">
                  {timelineBars.slice(0, 6).map((bar, idx) => (
                    <button
                      key={bar.card.id}
                      type="button"
                      onClick={() => setSelectedTimelineIdx(idx)}
                      aria-label={`Select window ${idx + 1}`}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === safeTimelineIdx
                          ? isDarkTheme
                            ? 'w-3.5 bg-white'
                            : 'w-3.5 bg-sky-600'
                          : isDarkTheme
                            ? 'w-1.5 bg-white/30 hover:bg-white/55'
                            : 'w-1.5 bg-slate-400/55 hover:bg-slate-600/75'
                      }`}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* BOTTOM HALF: Movable Priority-Ordered Event Cards Carousel (3D Flip-In-Place + 60s Timer) */}
          <div className="flex flex-col gap-2.5 shrink-0">
            {cardItems.length > 0 && (
              <div className="relative flex items-center gap-2">
                {cardItems.length > visibleSlots && (
                  <button
                    type="button"
                    disabled={clampedStartIdx <= 0}
                    onClick={() => setCarouselStartIdx((prev) => Math.max(0, prev - 1))}
                    aria-label="Scroll earlier cards"
                    className={`hidden sm:inline-flex pa-glass-pill h-9 w-8 items-center justify-center rounded-xl transition-opacity shrink-0 ${
                      clampedStartIdx <= 0
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:scale-105 cursor-pointer'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}

                <div
                  className={`flex-1 grid gap-3.5 ${
                    visibleSlots === 1
                      ? 'grid-cols-1'
                      : visibleSlots === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-3'
                  }`}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {visibleBottomCards.map(({ card, pct, fullWhenText }) => {
                      const expiry = flippedUntilMap[card.id] ?? 0;
                      const isFlipped = expiry > nowMs;
                      const secondsLeft = isFlipped
                        ? Math.max(1, Math.ceil((expiry - nowMs) / 1000))
                        : CARD_FLIP_DURATION_SEC;
                      const circumference = 2 * Math.PI * 10;
                      const ringOffset =
                        circumference * (1 - secondsLeft / CARD_FLIP_DURATION_SEC);

                      const contentText = (card.how || card.summary || '').trim();
                      const rawRatingLabel = (card.probability || card.likelihood || '')
                        .replace(/\b\d{1,3}\s*%/g, '')
                        .replace(/^[\s·|/-]+|[\s·|/-]+$/g, '')
                        .trim();

                      return (
                        <motion.div
                          key={card.id}
                          layout
                          initial={{ opacity: 0, x: 24, scale: 0.97 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -24, scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                          className="pa-flip-scene h-[204px] sm:h-[218px]"
                        >
                          <div
                            className="pa-flip-inner"
                            data-flipped={isFlipped ? 'true' : 'false'}
                          >
                            {/* FRONT FACE: Blurred Domain Watermark + Points on Top + Weather-Style Centered % + Content & Timeline + Right Arrow Flip */}
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleCardFlip(card.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleCardFlip(card.id);
                                }
                              }}
                              aria-label={`${card.title}, ${pct}%. Click to view how it will happen.`}
                              className="pa-flip-face pa-glass-card relative overflow-hidden rounded-[24px] p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 cursor-pointer group hover:border-sky-400/65 transition-all text-left"
                            >
                              <BlurredDomainWatermark
                                domain={effectiveDomain}
                                isDarkTheme={isDarkTheme}
                              />

                              <span
                                aria-hidden="true"
                                className={`pa-glass-pill absolute right-3.5 top-3.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-xl transition-transform duration-200 group-hover:translate-x-0.5 ${
                                  isDarkTheme ? 'text-slate-200' : 'text-slate-700'
                                }`}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </span>

                              {/* Top Points overlaid cleanly on top of blurred domain icon */}
                              <div className="relative z-10 pr-9 shrink-0">
                                <h3
                                  className={`font-display text-[13px] sm:text-[13.5px] font-bold leading-snug line-clamp-2 break-words ${
                                    isDarkTheme ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  {card.title}
                                </h3>
                              </div>

                              {/* Middle: Weather-Card Style Percentage */}
                              <div className="relative z-10 flex items-center justify-center py-0.5 shrink-0">
                                <span
                                  className={`font-display text-4xl sm:text-[42px] font-light tracking-tight leading-none tabular-nums ${
                                    isDarkTheme
                                      ? 'text-white drop-shadow-[0_2px_12px_rgba(56,189,248,0.22)]'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {pct}%
                                </span>
                              </div>

                              {/* Rest of the portion: Content + Timeline & Rating */}
                              <div className="relative z-10 min-h-0 flex flex-col justify-end gap-1">
                                {contentText && (
                                  <p
                                    className={`text-[11px] leading-snug line-clamp-2 break-words ${
                                      isDarkTheme ? 'text-slate-200/90' : 'text-slate-700'
                                    }`}
                                  >
                                    {contentText}
                                  </p>
                                )}
                                {(fullWhenText || rawRatingLabel) && (
                                  <div
                                    className={`flex items-center gap-1.5 text-[11px] font-medium tabular-nums truncate ${
                                      isDarkTheme ? 'text-sky-200/90' : 'text-sky-800'
                                    }`}
                                  >
                                    {fullWhenText && (
                                      <span className="truncate">{fullWhenText}</span>
                                    )}
                                    {fullWhenText && rawRatingLabel && (
                                      <span aria-hidden="true" className="opacity-60 shrink-0">
                                        ·
                                      </span>
                                    )}
                                    {rawRatingLabel && (
                                      <span className="truncate opacity-85">{rawRatingLabel}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* BACK FACE: Transparent Theme Glass + Blurred Domain Watermark + "How it will happen" + 60s Auto-Flip Ring */}
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleCardFlip(card.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleCardFlip(card.id);
                                }
                              }}
                              aria-label={`${card.title} explanation. Automatically flips back in ${secondsLeft} seconds.`}
                              className="pa-flip-face pa-flip-back pa-glass-card relative overflow-hidden rounded-[24px] p-3.5 sm:p-4 flex flex-col justify-between cursor-pointer text-left"
                            >
                              <BlurredDomainWatermark
                                domain={effectiveDomain}
                                isDarkTheme={isDarkTheme}
                              />

                              <div className="relative z-10 flex items-start justify-between gap-2 shrink-0 mb-1.5">
                                <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                  <span
                                    className={`text-xs font-bold leading-snug break-words ${
                                      isDarkTheme ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {card.title}
                                  </span>
                                  <span
                                    className={`text-[11px] font-semibold tabular-nums shrink-0 ${
                                      isDarkTheme ? 'text-amber-300' : 'text-sky-700'
                                    }`}
                                  >
                                    · {pct}%
                                  </span>
                                </div>

                                <div
                                  title={`Auto-flips back in ${secondsLeft}s`}
                                  className="relative inline-flex items-center justify-center w-7 h-7 shrink-0"
                                >
                                  <svg className="w-7 h-7 -rotate-90" viewBox="0 0 24 24">
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      fill="none"
                                      stroke={isDarkTheme ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.14)'}
                                      strokeWidth="2"
                                    />
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      fill="none"
                                      stroke={isDarkTheme ? '#fbbf24' : '#0284c7'}
                                      strokeWidth="2"
                                      strokeDasharray={circumference}
                                      strokeDashoffset={ringOffset}
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <span
                                    className={`absolute text-[8.5px] font-mono font-bold tabular-nums ${
                                      isDarkTheme ? 'text-amber-200' : 'text-slate-800'
                                    }`}
                                  >
                                    {secondsLeft}s
                                  </span>
                                </div>
                              </div>

                              <div
                                className="relative z-10 flex-1 min-h-0 overflow-y-auto fluent-scroll select-text pr-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div
                                  className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                                    isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                                  }`}
                                >
                                  How it will happen
                                </div>
                                <p
                                  className={`text-xs leading-relaxed whitespace-pre-line break-words ${
                                    isDarkTheme ? 'text-slate-100/95' : 'text-slate-800'
                                  }`}
                                >
                                  {card.how || card.summary}
                                </p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {cardItems.length > visibleSlots && (
                  <button
                    type="button"
                    disabled={clampedStartIdx >= maxStartIdx}
                    onClick={() => setCarouselStartIdx((prev) => Math.min(maxStartIdx, prev + 1))}
                    aria-label="Scroll later cards"
                    className={`hidden sm:inline-flex pa-glass-pill h-9 w-8 items-center justify-center rounded-xl transition-opacity shrink-0 ${
                      clampedStartIdx >= maxStartIdx
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:scale-105 cursor-pointer'
                    }`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Bottom Control Strip: + New Thread & Sync/Unsync (Left) · Dots (Center) · Ask for Follow-up + Arrow Box (Right) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleNewThreadClick}
                  title="Start New Thread"
                  className="pa-glass-pill inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold hover:brightness-110 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>New Thread</span>
                </button>

                {canSyncToApple && onSyncToApple && onUnsyncFromApple && (
                  <div
                    role="group"
                    aria-label="Apple Calendar and Reminders Sync"
                    className="pa-glass-pill inline-flex items-center p-0.5 rounded-xl gap-0.5 shrink-0"
                  >
                    <button
                      type="button"
                      disabled={isSyncing || isUnsyncing}
                      aria-pressed={isSynced}
                      onClick={onSyncToApple}
                      title={
                        isSyncing
                          ? 'Syncing WatchOut dates & Event Cards to Apple Calendar & Reminders…'
                          : isSynced
                            ? 'Synced to Mac & iPhone (click to re-sync)'
                            : 'Sync WatchOut dates to Calendar & Event Cards to Reminders'
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                        isSyncing || isUnsyncing ? 'cursor-wait opacity-75' : 'cursor-pointer'
                      } ${
                        isSynced
                          ? isDarkTheme
                            ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/50 shadow-2xs'
                            : 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/40 shadow-2xs'
                          : isDarkTheme
                            ? 'text-slate-100 hover:bg-white/10'
                            : 'text-slate-800 hover:bg-white/75'
                      }`}
                    >
                      {isSyncing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                      ) : isSynced ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <CalendarPlus
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isDarkTheme ? 'text-sky-300' : 'text-sky-600'
                          }`}
                        />
                      )}
                      <span>{isSyncing ? 'Syncing…' : isSynced ? 'Synced' : 'Sync'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSyncing || isUnsyncing}
                      onClick={onUnsyncFromApple}
                      title={
                        isUnsyncing
                          ? 'Removing from Apple Calendar & Reminders…'
                          : 'Unsync (remove this report’s events & reminders completely from Mac & iPhone)'
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                        isSyncing || isUnsyncing ? 'cursor-wait opacity-75' : 'cursor-pointer'
                      } ${
                        isDarkTheme
                          ? 'text-slate-200 hover:text-rose-200 hover:bg-rose-500/20'
                          : 'text-slate-700 hover:text-rose-700 hover:bg-rose-500/12'
                      }`}
                    >
                      {isUnsyncing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400 shrink-0" />
                      ) : (
                        <CalendarX2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isDarkTheme ? 'text-rose-300' : 'text-rose-600'
                          }`}
                        />
                      )}
                      <span>{isUnsyncing ? 'Unsyncing…' : 'Unsync'}</span>
                    </button>
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <div className="hidden sm:flex items-center gap-1.5">
                  {Array.from({ length: totalPages }, (_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCarouselStartIdx(idx)}
                      aria-label={`Show card window ${idx + 1}`}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === clampedStartIdx
                          ? isDarkTheme
                            ? 'w-5 bg-white'
                            : 'w-5 bg-sky-600'
                          : isDarkTheme
                            ? 'w-1.5 bg-white/30 hover:bg-white/55'
                            : 'w-1.5 bg-slate-400/50 hover:bg-slate-600/75'
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 shrink-0">
                {canAskFollowUp && (
                  <button
                    type="button"
                    onClick={() => {
                      setFollowUpError(null);
                      setIsFollowUpOpen(true);
                    }}
                    className="pa-glass-pill inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold hover:brightness-110 transition-all cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Ask for Follow-up</span>
                  </button>
                )}

                {cardItems.length > 1 && (
                  <div
                    role="group"
                    aria-label="Move event cards"
                    className="pa-glass-pill inline-flex items-center rounded-xl p-0.5 gap-0.5"
                  >
                    <button
                      type="button"
                      disabled={clampedStartIdx <= 0}
                      onClick={() => setCarouselStartIdx((prev) => Math.max(0, prev - 1))}
                      aria-label="Previous cards"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                        clampedStartIdx <= 0
                          ? 'opacity-35 cursor-not-allowed'
                          : isDarkTheme
                            ? 'hover:bg-white/12 cursor-pointer'
                            : 'hover:bg-slate-900/5 cursor-pointer'
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={clampedStartIdx >= maxStartIdx}
                      onClick={() =>
                        setCarouselStartIdx((prev) => Math.min(maxStartIdx, prev + 1))
                      }
                      aria-label="Next cards"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                        clampedStartIdx >= maxStartIdx
                          ? 'opacity-35 cursor-not-allowed'
                          : isDarkTheme
                            ? 'hover:bg-white/12 cursor-pointer'
                            : 'hover:bg-slate-900/5 cursor-pointer'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ask for Follow-up Dialog (Triggered from Bottom Control Bar Only) */}
      {isFollowUpOpen && canAskFollowUp && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prod-followup-title"
          onClick={() => {
            setIsFollowUpOpen(false);
            setFollowUpError(null);
          }}
        >
          <form
            onSubmit={handleFollowUpSubmit}
            onClick={(e) => e.stopPropagation()}
            className="pa-glass-card relative w-full max-w-md rounded-[26px] p-6 sm:p-7 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`flex items-center gap-2 text-xs font-bold ${
                  isDarkTheme ? 'text-sky-300' : 'text-sky-800'
                }`}
              >
                <MessageSquarePlus className="w-4 h-4 shrink-0" />
                <span className="tabular-nums">
                  {domainShortLabel}
                  {waitingPeriod ? ` · ${waitingPeriod}` : ''} ·{' '}
                  {providerAdapter === 'fable' ? 'Fable' : 'Gemini'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFollowUpOpen(false);
                  setFollowUpError(null);
                }}
                aria-label="Close follow-up dialog"
                className={`pa-glass-pill inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
                  isDarkTheme
                    ? 'text-slate-200 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                id="prod-followup-title"
                htmlFor="prod-followup-input"
                className={`block font-display text-lg font-bold mb-2 ${
                  isDarkTheme ? 'text-white' : 'text-slate-900'
                }`}
              >
                Ask for Follow-up
              </label>
              <textarea
                id="prod-followup-input"
                ref={followUpInputRef}
                rows={4}
                value={followUpDraft}
                onChange={(e) => {
                  setFollowUpDraft(e.target.value);
                  if (followUpError && e.target.value.trim()) {
                    setFollowUpError(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleFollowUpSubmit();
                  }
                }}
                placeholder="Type your follow-up question..."
                className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm focus:outline-none ${
                  isDarkTheme
                    ? 'border-white/18 bg-slate-950/55 text-white placeholder:text-slate-400 focus:border-sky-400'
                    : 'border-sky-200/90 bg-white/80 text-slate-900 placeholder:text-slate-500 focus:border-sky-500 focus:bg-white'
                }`}
              />
              {followUpError && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-500">
                  {followUpError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsFollowUpOpen(false);
                  setFollowUpError(null);
                }}
                className="pa-glass-pill px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
