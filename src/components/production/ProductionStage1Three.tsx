import {
  Briefcase,
  Calendar,
  DollarSign,
  Eye,
  Heart,
  Home,
  Loader2,
  Plus,
  Scale,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  EventCardIconType,
  PromptDomain,
  RatedThreadRecord,
} from '../../types/workbench';
import {
  extractReadOutSections,
  normalizeEventCardItem,
  parseResponseEventsAndReport,
} from '../../utils/eventParser';
import {
  getMonthNameFromNumber,
  getPromptDomainShortLabel,
} from '../../utils/promptTemplates';
import {
  playBucketDropCue,
  playBucketExpandCue,
  playIntroBucketSwellMusic,
  playIntroPopInMusic,
  playIntroPopOutMusic,
  playLaunchTransitionCue,
  stopBucketAmbientMusic,
  warmAudioContext,
} from '../../utils/notify';

let hasPlayedStage1BrowserIntro = false;

export interface ProductionTopicDef {
  domain: PromptDomain;
  label: string;
  icon: EventCardIconType;
  accentHex: string;
  glowHex: string;
}

export interface ProductionMonthItem {
  key: string;
  month: number;
  year: number;
  shortMonth: string;
  fullLabel: string;
}

export interface BucketReportEntry {
  record: RatedThreadRecord;
  domain: PromptDomain;
  domainLabel: string;
  shortSummary: string;
  provider: 'gemini' | 'fable';
  accentHex: string;
}

const TOPICS: ProductionTopicDef[] = [
  {
    domain: 'astrology',
    label: 'Career',
    icon: 'briefcase',
    accentHex: '#38bdf8',
    glowHex: '#0284c7',
  },
  {
    domain: 'family',
    label: 'Family',
    icon: 'layers',
    accentHex: '#34d399',
    glowHex: '#059669',
  },
  {
    domain: 'finance',
    label: 'Finance',
    icon: 'coins',
    accentHex: '#fbbf24',
    glowHex: '#d97706',
  },
  {
    domain: 'general',
    label: 'Love',
    icon: 'heart',
    accentHex: '#fb7185',
    glowHex: '#e11d48',
  },
  {
    domain: 'health',
    label: 'Health',
    icon: 'shield',
    accentHex: '#a78bfa',
    glowHex: '#7c3aed',
  },
  {
    domain: 'litigation',
    label: 'Litigation',
    icon: 'scales',
    accentHex: '#fb923c',
    glowHex: '#ea580c',
  },
];

const BUCKET_CAPACITY = 12;

const TOPIC_ACCENT_BY_DOMAIN: Record<PromptDomain, string> = {
  astrology: '#38bdf8',
  family: '#34d399',
  finance: '#fbbf24',
  general: '#fb7185',
  health: '#a78bfa',
  litigation: '#fb923c',
};

interface ProductionStage1ThreeProps {
  activeMonthNum: number;
  activeYearNum: number;
  activePromptDomain: PromptDomain;
  activeProvider: 'gemini' | 'fable';
  isDarkTheme?: boolean;
  isBackgroundMusicEnabled?: boolean;
  onToggleBackgroundMusic?: () => void;
  ratedThreads: RatedThreadRecord[];
  isSending: boolean;
  switchingMonthKey?: string | null;
  monthSwitchError?: string | null;
  onDismissMonthSwitchError?: () => void;
  onPromptDomainChange: (domain: PromptDomain) => void;
  onProviderChange?: (provider: 'gemini' | 'fable') => void;
  onSelectQuickMonth?: (month: number, year: number) => void;
  onOpenExistingReport: (record: RatedThreadRecord) => void;
  onSubmitQuestion: (payload: {
    text: string;
    domain: PromptDomain;
    threadName: string;
    month: number;
    year: number;
    provider?: 'gemini' | 'fable';
  }) => void;
}

function normalizeRecordDomain(rawDomain?: string, relPath?: string): PromptDomain {
  if (
    rawDomain === 'astrology' ||
    rawDomain === 'family' ||
    rawDomain === 'finance' ||
    rawDomain === 'general' ||
    rawDomain === 'health' ||
    rawDomain === 'litigation'
  ) {
    if (rawDomain === 'finance' && relPath && /(?:^|\/)family(?:\/|$)/i.test(relPath)) {
      return 'family';
    }
    return rawDomain;
  }
  return 'astrology';
}

function drawPureCoreIconCanvas(
  icon: EventCardIconType,
  accentHex: string,
  glowHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Pure core icon ONLY — NO outer circle, NO radial disc, NO ring
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  ctx.save();
  ctx.translate(cx, cy);

  const grad = ctx.createLinearGradient(0, -90, 0, 95);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.28, accentHex);
  grad.addColorStop(1, glowHex);

  ctx.shadowColor = accentHex;
  ctx.shadowBlur = 22;
  ctx.fillStyle = grad;
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (icon === 'briefcase') {
    // Rich blue filled briefcase with crisp clasp & handle
    ctx.beginPath();
    ctx.roundRect(-78, -36, 156, 108, 22);
    ctx.fill();

    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(-34, -36);
    ctx.lineTo(-34, -64);
    ctx.arcTo(-34, -76, -22, -76, 12);
    ctx.lineTo(22, -76);
    ctx.arcTo(34, -76, 34, -64, 12);
    ctx.lineTo(34, -36);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-78, 8, 156, 10);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-16, -2, 32, 26, 6);
    ctx.fill();
  } else if (icon === 'layers') {
    // Rich emerald filled home/family silhouette with door
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(84, -14);
    ctx.lineTo(64, -14);
    ctx.lineTo(64, 72);
    ctx.lineTo(-64, 72);
    ctx.lineTo(-64, -14);
    ctx.lineTo(-84, -14);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(-84, -14);
    ctx.lineTo(0, -82);
    ctx.lineTo(84, -14);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ecfdf5';
    ctx.beginPath();
    ctx.roundRect(-22, 18, 44, 54, 8);
    ctx.fill();
  } else if (icon === 'coins') {
    // Bold amber-gold Finance dollar glyph ONLY (no enclosing coin circle)
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(0, 82);
    ctx.stroke();

    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(46, -42);
    ctx.bezierCurveTo(46, -68, -46, -68, -46, -32);
    ctx.bezierCurveTo(-46, -2, 46, -2, 46, 32);
    ctx.bezierCurveTo(46, 70, -46, 70, -46, 40);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-4, -76);
    ctx.lineTo(-4, 76);
    ctx.stroke();
  } else if (icon === 'heart') {
    // Vibrant rose-pink heart
    ctx.beginPath();
    ctx.moveTo(0, 76);
    ctx.bezierCurveTo(-98, 16, -98, -68, -42, -76);
    ctx.bezierCurveTo(-12, -80, 0, -46, 0, -38);
    ctx.bezierCurveTo(0, -46, 12, -80, 42, -76);
    ctx.bezierCurveTo(98, -68, 98, 16, 0, 76);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-34, -38, 18, 10, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === 'scales') {
    // Litigation: warm-orange glowing Scales of Justice
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(0, 74);
    ctx.moveTo(-42, 74);
    ctx.lineTo(42, 74);
    ctx.stroke();

    // Top balance beam
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-72, -48);
    ctx.lineTo(72, -48);
    ctx.stroke();

    // Fulcrum crown highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.arc(0, -48, 10, 0, Math.PI * 2);
    ctx.fill();

    // Left & right suspension lines + bowls
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = grad;
    ctx.fillStyle = grad;
    ctx.lineWidth = 7;

    for (const side of [-58, 58]) {
      ctx.beginPath();
      ctx.moveTo(side, -48);
      ctx.lineTo(side - 26, 12);
      ctx.lineTo(side + 26, 12);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(side, 12, 26, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Health: vibrant violet shield with crisp white medical cross
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(74, -52);
    ctx.lineTo(74, 6);
    ctx.bezierCurveTo(74, 58, 0, 86, 0, 86);
    ctx.bezierCurveTo(0, 86, -74, 58, -74, 6);
    ctx.lineTo(-74, -52);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-11, -34, 22, 68, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-34, -11, 68, 22, 6);
    ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function drawGhostHaloCanvas(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.42)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function TopicBackdropIcon({
  icon,
  color,
  className,
}: {
  icon: EventCardIconType;
  color: string;
  className?: string;
}) {
  const style = { color };
  if (icon === 'briefcase') return <Briefcase className={className} style={style} strokeWidth={1.5} />;
  if (icon === 'layers') return <Home className={className} style={style} strokeWidth={1.5} />;
  if (icon === 'coins') return <DollarSign className={className} style={style} strokeWidth={1.7} />;
  if (icon === 'heart') return <Heart className={className} style={style} strokeWidth={1.5} />;
  if (icon === 'scales') return <Scale className={className} style={style} strokeWidth={1.5} />;
  return <Shield className={className} style={style} strokeWidth={1.5} />;
}

function drawBucketLabelCanvas(
  shortMonth: string,
  year: number,
  reportsInBucket: BucketReportEntry[],
  isActive: boolean,
  isHovered: boolean,
  isInspected: boolean,
  isDarkTheme: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const count = reportsInBucket.length;
  const width = 640;
  const height = 420;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const isFull = count >= BUCKET_CAPACITY;
  ctx.shadowColor = isFull
    ? 'rgba(251, 191, 36, 0.9)'
    : isHovered || isInspected
      ? 'rgba(125, 211, 252, 0.95)'
      : isActive
        ? 'rgba(56, 189, 248, 0.85)'
        : 'rgba(14, 165, 233, 0.55)';
  ctx.shadowBlur = isHovered || isInspected || isFull ? 22 : 14;

  if (isInspected) {
    // Minimal glowing top rim title when bucket is expanded so interior balls remain clearly visible
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(4, 12, 28, 0.82)';
    const headerTitle = `${shortMonth.toUpperCase()} ${year}`;
    ctx.font = '800 40px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.strokeText(headerTitle, width / 2, 42);
    ctx.fillStyle = isFull ? '#fef3c7' : '#ffffff';
    ctx.fillText(headerTitle, width / 2, 42);
  } else if (isHovered) {
    // Compact crisp header at top when bucket swells huge on drag hover
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(4, 12, 28, 0.82)';
    const headerTitle = `${shortMonth.toUpperCase()} ${year} · ${isFull ? `FULL ${BUCKET_CAPACITY}/${BUCKET_CAPACITY}` : `${count}/${BUCKET_CAPACITY}`}`;
    ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.strokeText(headerTitle, width / 2, 54);
    ctx.fillStyle = isFull ? '#fef3c7' : '#ffffff';
    ctx.fillText(headerTitle, width / 2, 54);

    if (count === 0) {
      ctx.font = '700 28px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#bae6fd';
      ctx.strokeText('Drop here for first report', width / 2, height / 2 + 24);
      ctx.fillText('Drop here for first report', width / 2, height / 2 + 24);
    } else {
      // Enlarged glowing pills showing whatever existing reports live inside this bucket
      const visible = reportsInBucket.slice(0, 6);
      const useTwoCols = visible.length > 3;
      const cols = useTwoCols ? 2 : 1;
      const rows = Math.ceil(visible.length / cols);
      const pillW = useTwoCols ? 278 : 500;
      const pillH = useTwoCols ? 68 : 74;
      const gapX = 18;
      const gapY = 14;
      const startY = 112;

      for (let i = 0; i < visible.length; i += 1) {
        const entry = visible[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const totalRowW = cols * pillW + (cols - 1) * gapX;
        const px = (width - totalRowW) / 2 + col * (pillW + gapX);
        const py = startY + row * (pillH + gapY);

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(2, 6, 23, 0.65)';
        ctx.fillStyle = 'rgba(8, 18, 38, 0.86)';
        ctx.strokeStyle = entry.accentHex;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(px, py, pillW, pillH, 16);
        ctx.fill();
        ctx.stroke();

        // Glowing domain dot
        ctx.fillStyle = entry.accentHex;
        ctx.beginPath();
        ctx.arc(px + 24, py + pillH / 2, 9, 0, Math.PI * 2);
        ctx.fill();

        // Domain + Report meaning snippet + Provider badge
        const provTag = entry.provider === 'fable' ? 'F' : 'G';
        ctx.textAlign = 'left';
        ctx.font = `700 ${useTwoCols ? 22 : 25}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        const textMaxW = pillW - 86;
        const labelStr = `${entry.domainLabel}: ${entry.shortSummary}`;
        ctx.fillText(labelStr, px + 44, py + pillH / 2 + 1, textMaxW);

        ctx.textAlign = 'right';
        ctx.font = '800 20px "JetBrains Mono", monospace';
        ctx.fillStyle = entry.provider === 'fable' ? '#fde68a' : '#7dd3fc';
        ctx.fillText(provTag, px + pillW - 14, py + pillH / 2 + 1);
        ctx.restore();
      }

      if (count > visible.length) {
        const extraY = startY + rows * (pillH + gapY) + 14;
        ctx.font = '700 22px "JetBrains Mono", monospace';
        ctx.fillStyle = '#bae6fd';
        ctx.fillText(`+${count - visible.length} more inside`, width / 2, extraY);
      }
    }
  } else {
    // Clean resting label inside the shallow Sculptural Crystal Bowl
    const monthYearText = `${shortMonth} ${year}`;
    const countText = isFull
      ? `FULL · ${BUCKET_CAPACITY}/${BUCKET_CAPACITY}`
      : `${count}/${BUCKET_CAPACITY}`;

    ctx.lineJoin = 'round';
    if (isDarkTheme) {
      ctx.lineWidth = 9;
      ctx.strokeStyle = 'rgba(4, 12, 28, 0.72)';
      ctx.font = '700 72px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.strokeText(monthYearText, width / 2, height / 2 - 42);
      ctx.fillStyle = isFull
        ? '#fef3c7'
        : isActive
          ? '#ffffff'
          : '#f0f9ff';
      ctx.fillText(monthYearText, width / 2, height / 2 - 42);

      ctx.lineWidth = 6;
      ctx.font = '600 42px "JetBrains Mono", monospace';
      ctx.strokeText(countText, width / 2, height / 2 + 24);
      ctx.fillStyle = isFull
        ? '#fde68a'
        : count > 0
          ? '#bae6fd'
          : 'rgba(224, 242, 254, 0.72)';
      ctx.fillText(countText, width / 2, height / 2 + 24);
    } else {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.font = '700 72px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.strokeText(monthYearText, width / 2, height / 2 - 42);
      ctx.fillStyle = isFull
        ? '#b45309'
        : isActive
          ? '#0369a1'
          : '#0f172a';
      ctx.fillText(monthYearText, width / 2, height / 2 - 42);

      ctx.lineWidth = 5;
      ctx.font = '600 42px "JetBrains Mono", monospace';
      ctx.strokeText(countText, width / 2, height / 2 + 24);
      ctx.fillStyle = isFull
        ? '#d97706'
        : count > 0
          ? '#0284c7'
          : '#475569';
      ctx.fillText(countText, width / 2, height / 2 + 24);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function ProductionStage1Three({
  activeMonthNum,
  activeYearNum,
  activePromptDomain,
  activeProvider,
  isDarkTheme = true,
  isBackgroundMusicEnabled,
  onToggleBackgroundMusic: _onToggleBackgroundMusic,
  ratedThreads,
  isSending,
  switchingMonthKey: _switchingMonthKey,
  monthSwitchError,
  onDismissMonthSwitchError,
  onPromptDomainChange,
  onProviderChange,
  onSelectQuickMonth,
  onOpenExistingReport,
  onSubmitQuestion,
}: ProductionStage1ThreeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bubbleInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [dockedTarget, setDockedTarget] = useState<{
    topic: ProductionTopicDef;
    month: ProductionMonthItem;
    providerOverride?: 'gemini' | 'fable';
  } | null>(null);
  const [blockedDropNotice, setBlockedDropNotice] = useState<{
    topic: ProductionTopicDef;
    month: ProductionMonthItem;
    provider: 'gemini' | 'fable';
    otherProviderAvailable: boolean;
    existingRecord: RatedThreadRecord;
  } | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [inspectedBucketKey, setInspectedBucketKey] = useState<string | null>(null);
  const [selectedInspectReportIdx, setSelectedInspectReportIdx] = useState(0);
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<string[]>([]);

  const isMusicMuted = isBackgroundMusicEnabled === false;

  const stageQuickMonths = useMemo<ProductionMonthItem[]>(() => {
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
      };
    });
  }, []);

  // Build lookup map of existing Gemini/Fable reports per month bucket (max 12 per bucket: 6 domains x 2 providers)
  const bucketReportsByKey = useMemo(() => {
    const map = new Map<string, BucketReportEntry[]>();
    for (const m of stageQuickMonths) {
      map.set(m.key, []);
    }

    const seenSlotsByMonth = new Map<string, Set<string>>();

    for (const rec of ratedThreads) {
      const qTurn = rec.turns.find((t) => t.role === 'user');
      const aTurn = [...rec.turns].reverse().find((t) => t.role === 'assistant');
      if (!qTurn) continue;

      const rawProvider = aTurn?.adapterId ?? qTurn.adapterId;
      const provider: 'gemini' | 'fable' = rawProvider === 'fable' ? 'fable' : 'gemini';
      if (rawProvider !== 'gemini' && rawProvider !== 'fable') continue;

      const fallbackIso = aTurn?.timestamp || qTurn.timestamp || rec.ratedAt;
      const fallbackDate = fallbackIso ? new Date(fallbackIso) : new Date();
      const safeFallbackDate = Number.isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate;

      const rawMonth = (qTurn.threadMonth || '').trim().toLowerCase();
      const targetYear =
        typeof qTurn.threadYear === 'number' && Number.isFinite(qTurn.threadYear)
          ? Math.round(qTurn.threadYear)
          : Number.isFinite(Number(qTurn.threadYear)) && Number(qTurn.threadYear) >= 1990
            ? Math.round(Number(qTurn.threadYear))
            : safeFallbackDate.getFullYear();
      const targetMonthFallback = safeFallbackDate.getMonth() + 1;

      const matchedMonth = stageQuickMonths.find((m) => {
        if (m.year !== targetYear) return false;
        if (!rawMonth) return m.month === targetMonthFallback;
        return (
          getMonthNameFromNumber(m.month)?.toLowerCase() === rawMonth ||
          m.shortMonth.toLowerCase() === rawMonth.slice(0, 3) ||
          String(m.month) === rawMonth
        );
      });
      if (!matchedMonth) continue;

      const domain = normalizeRecordDomain(qTurn.promptDomain, rec.relativePath);
      const slotKey = `${domain}|${provider}`;
      let seen = seenSlotsByMonth.get(matchedMonth.key);
      if (!seen) {
        seen = new Set<string>();
        seenSlotsByMonth.set(matchedMonth.key, seen);
      }
      if (seen.has(slotKey)) continue;
      seen.add(slotKey);

      const rawQ = (qTurn.content || qTurn.threadName || '').replace(/\s+/g, ' ').trim();
      const shortSummary =
        rawQ.length > 22 ? `${rawQ.slice(0, 20).trim()}…` : rawQ || 'Report';

      map.get(matchedMonth.key)!.push({
        record: rec,
        domain,
        domainLabel: getPromptDomainShortLabel(domain),
        shortSummary,
        provider,
        accentHex: TOPIC_ACCENT_BY_DOMAIN[domain] ?? '#38bdf8',
      });
    }

    return map;
  }, [ratedThreads, stageQuickMonths]);

  // Current-month-only cross-provider suggestions (max 2):
  // Suggests running a current-month domain query on Fable if ran only on Gemini (or vice versa).
  const currentMonthSuggestions = useMemo(() => {
    const currentMonthItem = stageQuickMonths[0];
    if (!currentMonthItem) return [];
    const currentEntries = bucketReportsByKey.get(currentMonthItem.key) ?? [];
    if (currentEntries.length === 0) return [];

    const currentMonthName =
      getMonthNameFromNumber(currentMonthItem.month) ?? currentMonthItem.shortMonth;

    const candidates: Array<{
      key: string;
      topic: ProductionTopicDef;
      month: ProductionMonthItem;
      monthName: string;
      sourceProvider: 'gemini' | 'fable';
      targetProvider: 'gemini' | 'fable';
      questionText: string;
      questionPreview: string;
      sortTimeMs: number;
    }> = [];

    for (const topic of TOPICS) {
      const geminiEntry = currentEntries.find(
        (entry) => entry.domain === topic.domain && entry.provider === 'gemini',
      );
      const fableEntry = currentEntries.find(
        (entry) => entry.domain === topic.domain && entry.provider === 'fable',
      );
      if (Boolean(geminiEntry) === Boolean(fableEntry)) continue;

      const sourceEntry = (geminiEntry ?? fableEntry)!;
      const sourceProvider: 'gemini' | 'fable' = geminiEntry ? 'gemini' : 'fable';
      const targetProvider: 'gemini' | 'fable' = geminiEntry ? 'fable' : 'gemini';
      const key = `${currentMonthItem.key}|${topic.domain}|${targetProvider}`;
      if (dismissedSuggestionKeys.includes(key)) continue;

      const qTurn = sourceEntry.record.turns.find((t) => t.role === 'user');
      const fullQuestion = (qTurn?.content || '').replace(/\s+/g, ' ').trim();
      const questionPreview =
        fullQuestion.length > 68 ? `${fullQuestion.slice(0, 66).trim()}…` : fullQuestion;

      const lastTurn = sourceEntry.record.turns[sourceEntry.record.turns.length - 1];
      const rawTimestamp =
        lastTurn?.timestamp ||
        sourceEntry.record.ratedAt ||
        '';
      const parsedMs = rawTimestamp ? Date.parse(rawTimestamp) : 0;

      candidates.push({
        key,
        topic,
        month: currentMonthItem,
        monthName: currentMonthName,
        sourceProvider,
        targetProvider,
        questionText: fullQuestion,
        questionPreview,
        sortTimeMs: Number.isFinite(parsedMs) ? parsedMs : 0,
      });
    }

    candidates.sort((a, b) => b.sortTimeMs - a.sortTimeMs);
    return candidates.slice(0, 2);
  }, [bucketReportsByKey, dismissedSuggestionKeys, stageQuickMonths]);

  const bucketReportsRef = useRef(bucketReportsByKey);
  bucketReportsRef.current = bucketReportsByKey;

  const handleAcceptSuggestion = (suggestion: (typeof currentMonthSuggestions)[number]) => {
    playBucketDropCue();
    setBlockedDropNotice(null);
    setInspectedBucketKey(null);
    onProviderChange?.(suggestion.targetProvider);
    onPromptDomainChange(suggestion.topic.domain);
    onSelectQuickMonth?.(suggestion.month.month, suggestion.month.year);
    setQuestionText(suggestion.questionText);
    setValidationError(null);
    setDockedTarget({
      topic: suggestion.topic,
      month: suggestion.month,
      providerOverride: suggestion.targetProvider,
    });
  };

  const attemptOpenForTopicAndMonth = (
    topic: ProductionTopicDef,
    monthItem: ProductionMonthItem,
  ) => {
    const monthEntries = bucketReportsRef.current.get(monthItem.key) ?? [];
    const existingForProvider = monthEntries.find(
      (item) => item.domain === topic.domain && item.provider === stateRef.current.activeProvider,
    );
    const otherProvider: 'gemini' | 'fable' =
      stateRef.current.activeProvider === 'gemini' ? 'fable' : 'gemini';
    const hasOtherProvider = monthEntries.some(
      (item) => item.domain === topic.domain && item.provider === otherProvider,
    );

    if (existingForProvider) {
      playBucketDropCue();
      setDockedTarget(null);
      setBlockedDropNotice({
        topic,
        month: monthItem,
        provider: stateRef.current.activeProvider,
        otherProviderAvailable: !hasOtherProvider,
        existingRecord: existingForProvider.record,
      });
      return;
    }

    playBucketDropCue();
    setBlockedDropNotice(null);
    callbacksRef.current.onPromptDomainChange(topic.domain);
    callbacksRef.current.onSelectQuickMonth?.(monthItem.month, monthItem.year);
    callbacksRef.current.setQuestionText('');
    callbacksRef.current.setValidationError(null);
    callbacksRef.current.setDockedTarget({
      topic,
      month: monthItem,
    });
  };

  const attemptRef = useRef(attemptOpenForTopicAndMonth);
  attemptRef.current = attemptOpenForTopicAndMonth;

  const callbacksRef = useRef({
    onPromptDomainChange,
    onSelectQuickMonth,
    setDockedTarget,
    setQuestionText,
    setValidationError,
    setInspectedBucketKey,
    setSelectedInspectReportIdx,
  });
  callbacksRef.current = {
    onPromptDomainChange,
    onSelectQuickMonth,
    setDockedTarget,
    setQuestionText,
    setValidationError,
    setInspectedBucketKey,
    setSelectedInspectReportIdx,
  };

  const stateRef = useRef({
    activeMonthNum,
    activeYearNum,
    activePromptDomain,
    activeProvider,
    isDarkTheme,
    isSending,
    dockedTarget,
    blockedDropNotice,
    inspectedBucketKey,
    isMusicMuted,
  });
  stateRef.current = {
    activeMonthNum,
    activeYearNum,
    activePromptDomain,
    activeProvider,
    isDarkTheme,
    isSending,
    dockedTarget,
    blockedDropNotice,
    inspectedBucketKey,
    isMusicMuted,
  };

  useEffect(() => {
    if (isSending || dockedTarget || blockedDropNotice) {
      setInspectedBucketKey(null);
    }
  }, [blockedDropNotice, dockedTarget, isSending]);

  useEffect(() => {
    stopBucketAmbientMusic();
  }, [inspectedBucketKey]);

  useEffect(() => {
    if (!dockedTarget && !blockedDropNotice && !inspectedBucketKey) return;
    const t = dockedTarget
      ? window.setTimeout(() => bubbleInputRef.current?.focus(), 100)
      : null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectedBucketKey(null);
        setDockedTarget(null);
        setBlockedDropNotice(null);
        setValidationError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      if (t !== null) window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dockedTarget, blockedDropNotice, inspectedBucketKey]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const disposables: Array<{ dispose: () => void }> = [];

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '' : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
      String(rendererStr),
    );
    const maxAnisotropy = isSoftwareGl
      ? 1
      : Math.min(8, renderer.capabilities.getMaxAnisotropy());

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    disposables.push(envRT, pmremGenerator);

    const camera = new THREE.PerspectiveCamera(
      44,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 0.02, 14.9);

    // Studio & Atmospheric Lighting (no crossing arch lines/tubes)
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.9);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-6, 3, -5);
    scene.add(rimLight);
    const bottomGlowLight = new THREE.PointLight(0x0ea5e9, 1.4, 20);
    bottomGlowLight.position.set(0, -3.5, 2.6);
    scene.add(bottomGlowLight);

    // Subtle Starlight Atmosphere (NO curved tubes/lines across the buckets)
    const starCount = isSoftwareGl ? 45 : 90;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      starPositions[i * 3] = (Math.random() - 0.5) * 14;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      starPositions[i * 3 + 2] = -2.5 - Math.random() * 2.5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.055,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    disposables.push(starGeo, starMat);

    // 6 Wide, Shallow Sculptural Crystal Bowls arched gracefully above the 6 jumping domain icons
    const bucketSlots: Array<{ x: number; y: number; z: number }> = [
      { x: -6.18, y: 1.18, z: -0.34 },
      { x: -3.72, y: 1.92, z: -0.18 },
      { x: -1.24, y: 2.38, z: -0.04 },
      { x: 1.24, y: 2.38, z: -0.04 },
      { x: 3.72, y: 1.92, z: -0.18 },
      { x: 6.18, y: 1.18, z: -0.34 },
    ];

    const BOWL_TILT_X = 0.38;
    const BOWL_RIM_RADIUS = 1.2;
    const BOWL_BASE_RADIUS = 0.68;

    // Smooth blown-glass dish profile via LatheGeometry (shallow curved optical bowl)
    const bowlProfilePoints: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -0.35),
      new THREE.Vector2(0.32, -0.345),
      new THREE.Vector2(0.58, -0.31),
      new THREE.Vector2(0.82, -0.22),
      new THREE.Vector2(1.0, -0.07),
      new THREE.Vector2(1.13, 0.14),
      new THREE.Vector2(1.2, 0.34),
      new THREE.Vector2(1.22, 0.365),
      new THREE.Vector2(1.185, 0.37),
    ];
    const bucketWallGeo = new THREE.LatheGeometry(bowlProfilePoints, 56);
    const bucketRimGeo = new THREE.TorusGeometry(BOWL_RIM_RADIUS, 0.036, 18, 64);
    const bucketFootGeo = new THREE.TorusGeometry(BOWL_BASE_RADIUS, 0.02, 14, 48);
    const bucketLiquidGeo = new THREE.CircleGeometry(0.84, 40);
    const bucketInnerTextGeo = new THREE.PlaneGeometry(1.76, 0.96);
    const lidCapGeo = new THREE.CircleGeometry(BOWL_RIM_RADIUS - 0.02, 48);
    const lidRimGeo = new THREE.TorusGeometry(BOWL_RIM_RADIUS - 0.01, 0.032, 16, 56);
    const miniBallGeo = new THREE.SphereGeometry(0.118, 24, 24);
    disposables.push(
      bucketWallGeo,
      bucketRimGeo,
      bucketFootGeo,
      bucketLiquidGeo,
      bucketInnerTextGeo,
      lidCapGeo,
      lidRimGeo,
      miniBallGeo,
    );

    // 12 staggered glossy pearl slots nestled naturally along the shallow curved crystal dish floor
    const BALL_LOCAL_OFFSETS: Array<{ x: number; y: number; z: number }> = [
      { x: -0.52, y: -0.20, z: 0.44 },
      { x: -0.26, y: -0.23, z: 0.54 },
      { x: 0.0, y: -0.24, z: 0.57 },
      { x: 0.26, y: -0.23, z: 0.54 },
      { x: 0.52, y: -0.20, z: 0.44 },
      { x: -0.44, y: -0.22, z: 0.18 },
      { x: -0.15, y: -0.25, z: 0.26 },
      { x: 0.15, y: -0.25, z: 0.26 },
      { x: 0.44, y: -0.22, z: 0.18 },
      { x: -0.28, y: -0.22, z: -0.06 },
      { x: 0.0, y: -0.24, z: -0.04 },
      { x: 0.28, y: -0.22, z: -0.06 },
    ];

    interface BucketEntry {
      monthItem: ProductionMonthItem;
      group: THREE.Group;
      basePos: THREE.Vector3;
      wallMat: THREE.MeshPhysicalMaterial;
      rimMat: THREE.MeshStandardMaterial;
      footMat: THREE.MeshStandardMaterial;
      liquidMesh: THREE.Mesh;
      liquidMat: THREE.MeshBasicMaterial;
      badgeMat: THREE.MeshBasicMaterial;
      sealLidGroup: THREE.Group;
      sealLidMat: THREE.MeshPhysicalMaterial;
      sealRimMat: THREE.MeshStandardMaterial;
      sealBlend: number;
      reportBalls: Array<{
        mesh: THREE.Mesh;
        mat: THREE.MeshPhysicalMaterial;
        baseOffset: { x: number; y: number; z: number };
      }>;
      cachedSignature: string;
      activeTex: THREE.CanvasTexture | null;
      hitMesh: THREE.Mesh;
      hoverLerp: number;
      inspectLerp: number;
      demoHoverLerp: number;
      demoSwellLerp: number;
    }

    const hitSphereGeo = new THREE.SphereGeometry(1.28, 16, 16);
    const invisibleHitMat = new THREE.MeshBasicMaterial({ visible: false });
    disposables.push(hitSphereGeo, invisibleHitMat);

    const bucketEntries: BucketEntry[] = stageQuickMonths.map((monthItem, idx) => {
      const slot = bucketSlots[idx];
      const group = new THREE.Group();
      const basePos = new THREE.Vector3(slot.x, slot.y, slot.z);
      group.position.copy(basePos);

      // Shared tilted dish pivot so bowl glass, rim, base ring, pearls, and seal lid align cleanly
      const dishPivot = new THREE.Group();
      dishPivot.rotation.x = BOWL_TILT_X;
      group.add(dishPivot);

      const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        metalness: 0.04,
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        ior: 1.48,
        reflectivity: 0.9,
        envMapIntensity: 1.3,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const wallMesh = new THREE.Mesh(bucketWallGeo, wallMat);
      wallMesh.renderOrder = 4;
      dishPivot.add(wallMesh);

      const footMat = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0369a1,
        emissiveIntensity: 0.35,
        metalness: 0.72,
        roughness: 0.2,
        transparent: true,
        opacity: 0.55,
      });
      const footMesh = new THREE.Mesh(bucketFootGeo, footMat);
      footMesh.rotation.x = Math.PI / 2;
      footMesh.position.y = -0.32;
      dishPivot.add(footMesh);

      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.9,
        metalness: 0.76,
        roughness: 0.14,
      });
      const rimMesh = new THREE.Mesh(bucketRimGeo, rimMat);
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.y = 0.355;
      dishPivot.add(rimMesh);

      const liquidMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const liquidMesh = new THREE.Mesh(bucketLiquidGeo, liquidMat);
      liquidMesh.rotation.x = -Math.PI / 2;
      liquidMesh.position.y = -0.24;
      liquidMesh.renderOrder = 2;
      dishPivot.add(liquidMesh);

      // 12 pre-allocated glossy domain pearls resting inside the curved crystal dish
      const reportBalls = BALL_LOCAL_OFFSETS.map((offset) => {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.55,
          metalness: 0.14,
          roughness: 0.1,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
        });
        const mesh = new THREE.Mesh(miniBallGeo, mat);
        mesh.position.set(offset.x, offset.y, offset.z);
        mesh.visible = false;
        mesh.renderOrder = 3;
        dishPivot.add(mesh);
        disposables.push(mat);
        return { mesh, mat, baseOffset: offset };
      });

      // Flush golden crystal seal settles gently over the bowl rim ONLY at 12/12 reports
      const sealLidGroup = new THREE.Group();
      sealLidGroup.position.set(0, 0.36, 0);
      sealLidGroup.visible = false;

      const sealLidMat = new THREE.MeshPhysicalMaterial({
        color: 0xfde68a,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.35,
        metalness: 0.2,
        roughness: 0.1,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      });
      const sealCapMesh = new THREE.Mesh(lidCapGeo, sealLidMat);
      sealCapMesh.rotation.x = -Math.PI / 2;

      const sealRimMat = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xd97706,
        emissiveIntensity: 0.9,
        metalness: 0.85,
        roughness: 0.16,
      });
      const sealRimMesh = new THREE.Mesh(lidRimGeo, sealRimMat);
      sealRimMesh.rotation.x = Math.PI / 2;
      sealLidGroup.add(sealCapMesh, sealRimMesh);
      dishPivot.add(sealLidGroup);
      disposables.push(sealLidMat, sealRimMat);

      const initialTex = drawBucketLabelCanvas(
        monthItem.shortMonth,
        monthItem.year,
        [],
        false,
        false,
        false,
        stateRef.current.isDarkTheme,
        maxAnisotropy,
      );
      const badgeMat = new THREE.MeshBasicMaterial({
        map: initialTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const badgeMesh = new THREE.Mesh(bucketInnerTextGeo, badgeMat);
      badgeMesh.position.set(0, 0.11, 0.18);
      badgeMesh.rotation.x = 0.1;
      badgeMesh.renderOrder = 5;
      group.add(badgeMesh);

      const hitMesh = new THREE.Mesh(hitSphereGeo, invisibleHitMat);
      hitMesh.userData = { bucketKey: monthItem.key };
      group.add(hitMesh);

      scene.add(group);
      disposables.push(wallMat, rimMat, footMat, liquidMat, badgeMat);

      return {
        monthItem,
        group,
        basePos,
        wallMat,
        rimMat,
        footMat,
        liquidMesh,
        liquidMat,
        badgeMat,
        sealLidGroup,
        sealLidMat,
        sealRimMat,
        sealBlend: 0,
        reportBalls,
        cachedSignature: '',
        activeTex: initialTex,
        hitMesh,
        hoverLerp: 0,
        inspectLerp: 0,
        demoHoverLerp: 0,
        demoSwellLerp: 0,
      };
    });

    // 6 Jumping Core Domain Icons ONLY at the bottom (Career, Family, Finance, Love, Health, Litigation)
    const orbSlots = [
      new THREE.Vector3(-4.75, -2.26, 0.24),
      new THREE.Vector3(-2.85, -2.38, 0.32),
      new THREE.Vector3(-0.95, -2.45, 0.38),
      new THREE.Vector3(0.95, -2.45, 0.38),
      new THREE.Vector3(2.85, -2.38, 0.32),
      new THREE.Vector3(4.75, -2.26, 0.24),
    ];

    const orbIconPlaneGeo = new THREE.PlaneGeometry(1.18, 1.18);
    const orbShadowGeo = new THREE.CircleGeometry(0.46, 24);
    const orbHitGeo = new THREE.SphereGeometry(0.86, 14, 14);
    disposables.push(orbIconPlaneGeo, orbShadowGeo, orbHitGeo);

    interface OrbEntry {
      topic: ProductionTopicDef;
      group: THREE.Group;
      homePos: THREE.Vector3;
      iconTex: THREE.CanvasTexture;
      shadowMesh: THREE.Mesh;
      shadowMat: THREE.MeshBasicMaterial;
      hitMesh: THREE.Mesh;
      phase: number;
      currentPos: THREE.Vector3;
      scaleLerp: number;
    }

    const orbEntries: OrbEntry[] = TOPICS.map((topic, idx) => {
      const group = new THREE.Group();
      const homePos = orbSlots[idx].clone();
      group.position.copy(homePos);

      const accentColor = new THREE.Color(topic.accentHex);

      // Pure core domain icon sprite — no enclosing sphere or ring
      const iconTex = drawPureCoreIconCanvas(
        topic.icon,
        topic.accentHex,
        topic.glowHex,
        maxAnisotropy,
      );
      const iconMat = new THREE.MeshBasicMaterial({
        map: iconTex,
        transparent: true,
        alphaTest: 0.04,
        side: THREE.DoubleSide,
      });
      const iconMesh = new THREE.Mesh(orbIconPlaneGeo, iconMat);
      group.add(iconMesh);
      disposables.push(iconTex, iconMat);

      const hitMesh = new THREE.Mesh(orbHitGeo, invisibleHitMat);
      hitMesh.userData = { orbIndex: idx };
      group.add(hitMesh);

      const shadowMat = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.28,
      });
      const shadowMesh = new THREE.Mesh(orbShadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(homePos.x, homePos.y - 0.68, homePos.z);
      scene.add(shadowMesh);
      scene.add(group);
      disposables.push(shadowMat);

      return {
        topic,
        group,
        homePos,
        iconTex,
        shadowMesh,
        shadowMat,
        hitMesh,
        phase: idx * 1.05,
        currentPos: homePos.clone(),
        scaleLerp: 1,
      };
    });

    // Floating Glowing Ghost Copy + Drop Ripple for Silent Looping Idle Navigation Demo
    const ghostHaloTex = drawGhostHaloCanvas();
    const ghostHaloGeo = new THREE.PlaneGeometry(1.92, 1.92);
    const ghostHaloMat = new THREE.MeshBasicMaterial({
      map: ghostHaloTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ghostHaloMesh = new THREE.Mesh(ghostHaloGeo, ghostHaloMat);
    ghostHaloMesh.position.z = -0.02;
    ghostHaloMesh.renderOrder = 8;

    const ghostIconMat = new THREE.MeshBasicMaterial({
      map: orbEntries[0].iconTex,
      transparent: true,
      alphaTest: 0.02,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ghostIconMesh = new THREE.Mesh(orbIconPlaneGeo, ghostIconMat);
    ghostIconMesh.renderOrder = 9;

    const demoGhostGroup = new THREE.Group();
    demoGhostGroup.add(ghostHaloMesh, ghostIconMesh);
    demoGhostGroup.visible = false;
    scene.add(demoGhostGroup);

    const dropRippleGeo = new THREE.RingGeometry(0.55, 0.72, 48);
    const dropRippleMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const dropRippleMesh = new THREE.Mesh(dropRippleGeo, dropRippleMat);
    dropRippleMesh.rotation.x = Math.PI / 2 + BOWL_TILT_X;
    dropRippleMesh.visible = false;
    dropRippleMesh.renderOrder = 7;
    scene.add(dropRippleMesh);
    disposables.push(ghostHaloTex, ghostHaloGeo, ghostHaloMat, ghostIconMat, dropRippleGeo, dropRippleMat);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.35);
    const _intersectPt = new THREE.Vector3();
    const _targetPos = new THREE.Vector3();

    let draggingOrbIdx: number | null = null;
    let pointerHoverOrbIdx: number | null = null;
    let pointerHoverBucketKey: string | null = null;
    let hoveredBucketKeyLocal: string | null = null;
    let pointerDownClientX = 0;
    let pointerDownClientY = 0;

    const updatePointerNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const findNearestBucketKey = (orbWorldPos: THREE.Vector3): string | null => {
      let bestKey: string | null = null;
      let bestDist = 1.85;
      for (const b of bucketEntries) {
        const d = Math.hypot(orbWorldPos.x - b.basePos.x, orbWorldPos.y - b.basePos.y);
        if (d < bestDist) {
          bestDist = d;
          bestKey = b.monthItem.key;
        }
      }
      return bestKey;
    };

    const onPointerDown = (e: PointerEvent) => {
      warmAudioContext();
      if (stateRef.current.isSending || stateRef.current.dockedTarget || stateRef.current.blockedDropNotice) {
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      if (stateRef.current.inspectedBucketKey) {
        callbacksRef.current.setInspectedBucketKey(null);
        return;
      }

      updatePointerNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);

      const orbHits = raycaster.intersectObjects(
        orbEntries.map((o) => o.hitMesh),
        false,
      );
      if (orbHits.length > 0) {
        const idx = orbHits[0].object.userData.orbIndex as number;
        draggingOrbIdx = idx;
        pointerDownClientX = e.clientX;
        pointerDownClientY = e.clientY;
        renderer.domElement.style.cursor = 'grabbing';
        renderer.domElement.setPointerCapture?.(e.pointerId);
        return;
      }

      const bucketHits = raycaster.intersectObjects(
        bucketEntries.map((b) => b.hitMesh),
        false,
      );
      if (bucketHits.length > 0) {
        const key = bucketHits[0].object.userData.bucketKey as string;
        const found = bucketEntries.find((b) => b.monthItem.key === key);
        if (found) {
          const monthEntries = bucketReportsRef.current.get(key) ?? [];
          if (monthEntries.length > 0) {
            // Read-only animated showcase inside enlarged bucket (no network/LLM requests raised)
            if (!stateRef.current.isMusicMuted) {
              playBucketExpandCue();
            }
            callbacksRef.current.setSelectedInspectReportIdx(0);
            callbacksRef.current.setInspectedBucketKey(key);
          } else {
            callbacksRef.current.onSelectQuickMonth?.(
              found.monthItem.month,
              found.monthItem.year,
            );
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointerNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);

      if (draggingOrbIdx !== null) {
        if (raycaster.ray.intersectPlane(dragPlane, _intersectPt)) {
          const entry = orbEntries[draggingOrbIdx];
          entry.currentPos.set(
            THREE.MathUtils.clamp(_intersectPt.x, -6.5, 6.5),
            THREE.MathUtils.clamp(_intersectPt.y, -3.2, 3.6),
            0.85,
          );
          const nextBucketKey = findNearestBucketKey(entry.currentPos);
          if (nextBucketKey !== hoveredBucketKeyLocal) {
            hoveredBucketKeyLocal = nextBucketKey;
          }
        }
        return;
      }

      if (
        stateRef.current.dockedTarget ||
        stateRef.current.blockedDropNotice ||
        stateRef.current.inspectedBucketKey
      ) {
        pointerHoverOrbIdx = null;
        pointerHoverBucketKey = null;
        renderer.domElement.style.cursor = 'default';
        return;
      }

      const orbHits = raycaster.intersectObjects(
        orbEntries.map((o) => o.hitMesh),
        false,
      );
      if (orbHits.length > 0) {
        pointerHoverOrbIdx = orbHits[0].object.userData.orbIndex as number;
        pointerHoverBucketKey = null;
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      pointerHoverOrbIdx = null;

      const bucketHits = raycaster.intersectObjects(
        bucketEntries.map((b) => b.hitMesh),
        false,
      );
      if (bucketHits.length > 0) {
        pointerHoverBucketKey = bucketHits[0].object.userData.bucketKey as string;
        renderer.domElement.style.cursor = 'pointer';
      } else {
        pointerHoverBucketKey = null;
        renderer.domElement.style.cursor = 'default';
      }
    };

    const onPointerLeave = () => {
      pointerHoverOrbIdx = null;
      pointerHoverBucketKey = null;
    };

    const finishDrag = (e: PointerEvent, cancelled: boolean) => {
      if (draggingOrbIdx === null) return;
      const orbIdx = draggingOrbIdx;
      const entry = orbEntries[orbIdx];
      draggingOrbIdx = null;
      renderer.domElement.style.cursor = 'default';
      renderer.domElement.releasePointerCapture?.(e.pointerId);

      const movedDist = Math.hypot(e.clientX - pointerDownClientX, e.clientY - pointerDownClientY);
      const dropKey = !cancelled ? findNearestBucketKey(entry.currentPos) : null;
      hoveredBucketKeyLocal = null;

      if (dropKey) {
        const matchedBucket = bucketEntries.find((b) => b.monthItem.key === dropKey);
        if (matchedBucket) {
          attemptRef.current(entry.topic, matchedBucket.monthItem);
          return;
        }
      }

      if (!cancelled && movedDist < 8) {
        const activeBucket =
          bucketEntries.find(
            (b) =>
              b.monthItem.month === stateRef.current.activeMonthNum &&
              b.monthItem.year === stateRef.current.activeYearNum,
          ) ?? bucketEntries[0];
        if (activeBucket) {
          attemptRef.current(entry.topic, activeBucket.monthItem);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => finishDrag(e, false);
    const onPointerCancel = (e: PointerEvent) => finishDrag(e, true);

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    const handleResize = () => {
      if (!mount) return;
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = aspect < 1.25 ? 58 : aspect < 1.55 ? 49 : 44;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    const easeInOutCubic = (x: number): number =>
      x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    const pickRandomOtherIdx = (count: number, excludeIdx: number): number => {
      if (count <= 1) return 0;
      let next = Math.floor(Math.random() * count);
      if (next === excludeIdx) {
        next = (next + 1 + Math.floor(Math.random() * (count - 1))) % count;
      }
      return next;
    };

    // One-time browser-open intro sequence:
    // Step 1: icon drops into bucket (pops-in flash music) -> bucket gets +1 extra ball
    // Step 2: bucket swells big showing balls + extra ball (swell flash music)
    // Step 3: ball pops back out & glides home as bucket shrinks back (pops-out flash music) -> done forever
    let demoPhase: 'idle_wait' | 'step1_drag' | 'step2_swell' | 'step3_popout' | 'done' =
      hasPlayedStage1BrowserIntro ? 'done' : 'idle_wait';
    let demoPhaseElapsed = 0;
    let idleWaitElapsed = 0;
    let playedPopInFlash = false;
    let playedSwellFlash = false;
    let playedPopOutFlash = false;
    let demoOrbIdx = 0;
    let lastDemoOrbIdx = -1;
    let demoTargetBucketIdx = 0;
    let lastDemoTargetBucketIdx = -1;
    let demoStep2BucketKey: string | null = null;
    let demoHoverBucketKey: string | null = null;
    let demoSwellBucketKey: string | null = null;
    let demoExtraBallBucketKey: string | null = null;
    let demoExtraBallAccent = '#38bdf8';
    let demoExtraBallPop = 0;
    let dropRippleBucketIdx: number | null = null;
    let dropRippleElapsed = 0;

    const STEP1_FLIGHT_SEC = 1.95;
    const STEP1_TOTAL_SEC = 2.4;
    const STEP2_TOTAL_SEC = 2.35;
    const STEP3_POPOUT_SEC = 1.65;

    const unlockIntroAudioOnce = () => {
      if (!stateRef.current.isMusicMuted) {
        warmAudioContext();
      }
      if (demoPhase === 'done') {
        window.removeEventListener('pointerdown', unlockIntroAudioOnce);
        window.removeEventListener('keydown', unlockIntroAudioOnce);
      }
    };
    if (demoPhase !== 'done') {
      if (!stateRef.current.isMusicMuted) {
        warmAudioContext();
      }
      window.addEventListener('pointerdown', unlockIntroAudioOnce, { passive: true });
      window.addEventListener('keydown', unlockIntroAudioOnce, { passive: true });
    }

    const beginStep1 = () => {
      hasPlayedStage1BrowserIntro = true;
      demoOrbIdx = pickRandomOtherIdx(orbEntries.length, lastDemoOrbIdx);

      // Prefer any bucket with room for +1 extra ball (< BUCKET_CAPACITY) and avoid repeating the immediate previous bucket
      const availableIndices = bucketEntries
        .map((b, idx) => ({
          idx,
          count: (bucketReportsRef.current.get(b.monthItem.key) ?? []).length,
        }))
        .filter((item) => item.count < BUCKET_CAPACITY)
        .map((item) => item.idx);
      const pool = availableIndices.length > 0 ? availableIndices : bucketEntries.map((_, i) => i);
      const filteredPool =
        pool.length > 1 ? pool.filter((i) => i !== lastDemoTargetBucketIdx) : pool;
      demoTargetBucketIdx =
        filteredPool[Math.floor(Math.random() * filteredPool.length)] ?? pool[0] ?? 0;

      lastDemoOrbIdx = demoOrbIdx;
      lastDemoTargetBucketIdx = demoTargetBucketIdx;

      const orb = orbEntries[demoOrbIdx];
      ghostIconMat.map = orb.iconTex;
      ghostIconMat.needsUpdate = true;
      ghostHaloMat.color.set(orb.topic.accentHex);
      dropRippleMat.color.set(orb.topic.accentHex);

      playedPopInFlash = false;
      playedSwellFlash = false;
      playedPopOutFlash = false;
      demoExtraBallBucketKey = null;
      demoExtraBallAccent = orb.topic.accentHex;
      demoExtraBallPop = 0;
      demoStep2BucketKey = null;
      demoHoverBucketKey = null;
      demoSwellBucketKey = null;
      demoPhase = 'step1_drag';
      demoPhaseElapsed = 0;
    };

    const beginStep2ForTargetBucket = () => {
      const targetBucket = bucketEntries[demoTargetBucketIdx];
      if (!targetBucket) {
        demoSwellBucketKey = null;
        demoExtraBallBucketKey = null;
        demoPhase = 'done';
        demoPhaseElapsed = 0;
        return;
      }
      demoStep2BucketKey = targetBucket.monthItem.key;
      demoExtraBallBucketKey = targetBucket.monthItem.key;
      demoHoverBucketKey = null;
      demoSwellBucketKey = targetBucket.monthItem.key;
      demoPhase = 'step2_swell';
      demoPhaseElapsed = 0;
      if (!playedSwellFlash) {
        playedSwellFlash = true;
        if (!stateRef.current.isMusicMuted) {
          playIntroBucketSwellMusic();
        }
      }
    };

    const beginStep3PopOut = () => {
      demoSwellBucketKey = null;
      demoExtraBallBucketKey = null;
      demoHoverBucketKey = null;
      demoPhase = 'step3_popout';
      demoPhaseElapsed = 0;
      dropRippleBucketIdx = demoTargetBucketIdx;
      dropRippleElapsed = 0.001;
      if (!playedPopOutFlash) {
        playedPopOutFlash = true;
        if (!stateRef.current.isMusicMuted) {
          playIntroPopOutMusic();
        }
      }
    };

    let elapsed = 0;
    let lastTime = performance.now();
    const frameInterval = isSoftwareGl ? 1000 / 30 : 0;
    let lastRenderMs = 0;
    let rafId = 0;
    let isDisposed = false;

    const animate = (now: number) => {
      if (isDisposed) return;
      rafId = window.requestAnimationFrame(animate);

      if (frameInterval > 0 && now - lastRenderMs < frameInterval) {
        return;
      }
      lastRenderMs = now;

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      stars.rotation.z = Math.sin(elapsed * 0.18) * 0.02;
      if (stateRef.current.isDarkTheme) {
        starMat.color.setHex(0xbae6fd);
        starMat.opacity = 0.45;
      } else {
        starMat.color.setHex(0x0284c7);
        starMat.opacity = 0.25;
      }

      // Advance One-Time Connected Browser-Open Intro Animation (stops cleanly if interrupted or finished)
      const userInteractingOrModal =
        draggingOrbIdx !== null ||
        pointerHoverOrbIdx !== null ||
        pointerHoverBucketKey !== null ||
        Boolean(stateRef.current.dockedTarget) ||
        Boolean(stateRef.current.blockedDropNotice) ||
        Boolean(stateRef.current.inspectedBucketKey) ||
        stateRef.current.isSending;

      if (userInteractingOrModal && demoPhase !== 'done') {
        if (demoPhase !== 'idle_wait') {
          hasPlayedStage1BrowserIntro = true;
          demoPhase = 'done';
        } else {
          idleWaitElapsed = 0;
        }
        demoPhaseElapsed = 0;
        demoHoverBucketKey = null;
        demoSwellBucketKey = null;
        demoStep2BucketKey = null;
        demoExtraBallBucketKey = null;
        demoExtraBallPop = 0;
        demoGhostGroup.visible = false;
        ghostIconMat.opacity = 0;
        ghostHaloMat.opacity = 0;
      } else if (demoPhase === 'idle_wait') {
        idleWaitElapsed += dt;
        if (idleWaitElapsed >= 0.75) {
          beginStep1();
        }
      } else if (demoPhase === 'step1_drag') {
        demoPhaseElapsed += dt;
        const srcOrb = orbEntries[demoOrbIdx];
        const dstBucket = bucketEntries[demoTargetBucketIdx];
        const dstY = dstBucket.basePos.y + 0.56;
        const dstZ = dstBucket.basePos.z + 0.65;

        if (demoPhaseElapsed <= STEP1_FLIGHT_SEC) {
          const p = demoPhaseElapsed / STEP1_FLIGHT_SEC;
          demoGhostGroup.visible = true;

          if (p < 0.16) {
            const lift = easeInOutCubic(p / 0.16);
            demoGhostGroup.position.set(
              srcOrb.currentPos.x,
              srcOrb.currentPos.y + lift * 0.48,
              srcOrb.currentPos.z + 0.75,
            );
            demoGhostGroup.scale.setScalar(0.96 + lift * 0.2);
            ghostIconMat.opacity = lift * 0.92;
            ghostHaloMat.opacity = lift * 0.85;
            demoHoverBucketKey = null;
          } else if (p < 0.84) {
            const u = easeInOutCubic((p - 0.16) / 0.68);
            const sx = srcOrb.currentPos.x;
            const sy = srcOrb.currentPos.y + 0.48;
            const sz = srcOrb.currentPos.z + 0.75;
            const arcLift = Math.sin(u * Math.PI) * 1.15;
            demoGhostGroup.position.set(
              THREE.MathUtils.lerp(sx, dstBucket.basePos.x, u),
              THREE.MathUtils.lerp(sy, dstY, u) + arcLift,
              THREE.MathUtils.lerp(sz, dstZ, u) + Math.sin(u * Math.PI) * 0.6,
            );
            demoGhostGroup.scale.setScalar(1.16 - u * 0.12);
            ghostIconMat.opacity = 0.92;
            ghostHaloMat.opacity = 0.82 + Math.sin(elapsed * 8) * 0.12;
            if (u > 0.52) {
              demoHoverBucketKey = dstBucket.monthItem.key;
            }
          } else {
            const dropU = easeInOutCubic((p - 0.84) / 0.16);
            demoHoverBucketKey = dstBucket.monthItem.key;
            demoGhostGroup.position.set(
              dstBucket.basePos.x,
              THREE.MathUtils.lerp(dstY, dstBucket.basePos.y + 0.06, dropU),
              THREE.MathUtils.lerp(dstZ, dstBucket.basePos.z + 0.12, dropU),
            );
            demoGhostGroup.scale.setScalar(THREE.MathUtils.lerp(1.04, 0.26, dropU));
            ghostIconMat.opacity = (1 - dropU) * 0.9;
            ghostHaloMat.opacity = (1 - dropU) * 0.8;
            if (dropU > 0.45) {
              if (dropRippleBucketIdx !== demoTargetBucketIdx) {
                dropRippleBucketIdx = demoTargetBucketIdx;
                dropRippleElapsed = 0.001;
              }
              if (!playedPopInFlash) {
                playedPopInFlash = true;
                if (!stateRef.current.isMusicMuted) {
                  playIntroPopInMusic();
                }
              }
              // Drop spawns the +1 extra ball inside THIS exact bucket
              demoExtraBallBucketKey = dstBucket.monthItem.key;
            }
          }
        } else {
          demoGhostGroup.visible = false;
          ghostIconMat.opacity = 0;
          ghostHaloMat.opacity = 0;
          demoExtraBallBucketKey = dstBucket.monthItem.key;
          if (demoPhaseElapsed >= STEP1_TOTAL_SEC - 0.15) {
            demoHoverBucketKey = null;
          }
          if (demoPhaseElapsed >= STEP1_TOTAL_SEC) {
            beginStep2ForTargetBucket();
          }
        }
      } else if (demoPhase === 'step2_swell') {
        demoPhaseElapsed += dt;
        if (demoPhaseElapsed >= STEP2_TOTAL_SEC) {
          beginStep3PopOut();
        }
      } else if (demoPhase === 'step3_popout') {
        demoPhaseElapsed += dt;
        const srcOrb = orbEntries[demoOrbIdx];
        const dstBucket = bucketEntries[demoTargetBucketIdx];
        const mouthX = dstBucket.basePos.x;
        const mouthY = dstBucket.basePos.y + 0.72;
        const mouthZ = dstBucket.basePos.z + 0.65;
        const p = Math.min(1, demoPhaseElapsed / STEP3_POPOUT_SEC);

        demoGhostGroup.visible = true;
        if (p < 0.22) {
          // Ball pops back up out of the bucket mouth
          const popU = easeInOutCubic(p / 0.22);
          demoGhostGroup.position.set(
            mouthX,
            THREE.MathUtils.lerp(dstBucket.basePos.y + 0.08, mouthY + 0.35, popU),
            THREE.MathUtils.lerp(dstBucket.basePos.z + 0.15, mouthZ + 0.3, popU),
          );
          demoGhostGroup.scale.setScalar(THREE.MathUtils.lerp(0.32, 1.12, popU));
          ghostIconMat.opacity = popU * 0.92;
          ghostHaloMat.opacity = popU * 0.88;
        } else {
          // Glides cleanly back down into its home icon orb
          const backU = easeInOutCubic((p - 0.22) / 0.78);
          const arcLift = Math.sin(backU * Math.PI) * 1.0;
          demoGhostGroup.position.set(
            THREE.MathUtils.lerp(mouthX, srcOrb.currentPos.x, backU),
            THREE.MathUtils.lerp(mouthY + 0.35, srcOrb.currentPos.y, backU) + arcLift,
            THREE.MathUtils.lerp(mouthZ + 0.3, srcOrb.currentPos.z + 0.35, backU),
          );
          demoGhostGroup.scale.setScalar(THREE.MathUtils.lerp(1.12, 0.92, backU));
          const fadeOut = backU > 0.75 ? 1 - (backU - 0.75) / 0.25 : 1;
          ghostIconMat.opacity = 0.92 * fadeOut;
          ghostHaloMat.opacity = 0.82 * fadeOut;
        }

        if (demoPhaseElapsed >= STEP3_POPOUT_SEC) {
          demoGhostGroup.visible = false;
          ghostIconMat.opacity = 0;
          ghostHaloMat.opacity = 0;
          demoExtraBallBucketKey = null;
          demoStep2BucketKey = null;
          demoSwellBucketKey = null;
          demoPhase = 'done';
          window.removeEventListener('pointerdown', unlockIntroAudioOnce);
          window.removeEventListener('keydown', unlockIntroAudioOnce);
        }
      }

      demoExtraBallPop = THREE.MathUtils.damp(
        demoExtraBallPop,
        demoExtraBallBucketKey !== null ? 1 : 0,
        10,
        dt,
      );

      // Silent visual drop ripple at target bucket mouth
      if (dropRippleBucketIdx !== null) {
        dropRippleElapsed += dt;
        const rippleP = dropRippleElapsed / 0.65;
        if (rippleP >= 1) {
          dropRippleBucketIdx = null;
          dropRippleMesh.visible = false;
        } else {
          const rb = bucketEntries[dropRippleBucketIdx];
          dropRippleMesh.visible = true;
          dropRippleMesh.position.set(
            rb.group.position.x,
            rb.group.position.y + 0.32 * rb.group.scale.y,
            rb.group.position.z + 0.16 * rb.group.scale.z,
          );
          const rs = (0.72 + easeInOutCubic(rippleP) * 1.25) * rb.group.scale.x;
          dropRippleMesh.scale.setScalar(rs);
          dropRippleMat.opacity = (1 - rippleP) * 0.65;
        }
      }

      // Animate 6 Month Buckets + Swell Big on Hover/Inspect/Demo + Floating Interior Reports + Connected Extra Ball
      const anyBucketHovered = hoveredBucketKeyLocal !== null;
      const activeInspectKey = stateRef.current.inspectedBucketKey;
      const anyBucketInspected = activeInspectKey !== null;
      const anyDemoSwell = !anyBucketInspected && demoSwellBucketKey !== null;

      for (let i = 0; i < bucketEntries.length; i += 1) {
        const b = bucketEntries[i];
        const reportsInBucket = bucketReportsRef.current.get(b.monthItem.key) ?? [];
        const reportCount = reportsInBucket.length;
        const hasExtraDemoBall =
          !anyBucketInspected &&
          reportCount < BUCKET_CAPACITY &&
          ((demoExtraBallBucketKey === b.monthItem.key) ||
            (demoStep2BucketKey === b.monthItem.key && demoExtraBallPop > 0.04));
        const visualBallCount = hasExtraDemoBall
          ? Math.min(BUCKET_CAPACITY, reportCount + 1)
          : reportCount;
        const isFull = reportCount >= BUCKET_CAPACITY;

        const isActive =
          b.monthItem.month === stateRef.current.activeMonthNum &&
          b.monthItem.year === stateRef.current.activeYearNum;
        const isHovered = !anyBucketInspected && hoveredBucketKeyLocal === b.monthItem.key;
        const isInspected = activeInspectKey === b.monthItem.key;
        const isDemoHovered = !anyBucketInspected && demoHoverBucketKey === b.monthItem.key;
        const isDemoSwelled = anyDemoSwell && demoSwellBucketKey === b.monthItem.key;

        b.hoverLerp = THREE.MathUtils.damp(b.hoverLerp, isHovered ? 1 : 0, 8.5, dt);
        b.inspectLerp = THREE.MathUtils.damp(b.inspectLerp, isInspected ? 1 : 0, 7.2, dt);
        b.demoHoverLerp = THREE.MathUtils.damp(b.demoHoverLerp, isDemoHovered ? 1 : 0, 6.2, dt);
        b.demoSwellLerp = THREE.MathUtils.damp(b.demoSwellLerp, isDemoSwelled ? 1 : 0, 5.2, dt);

        const recedeBlend = anyBucketInspected
          ? isInspected
            ? 0
            : 1
          : anyBucketHovered && !isHovered
            ? 1
            : anyDemoSwell && !isDemoSwelled
              ? 0.55
              : 0;
        const floatY = Math.sin(elapsed * 1.5 + i * 0.55) * 0.045;

        // Swell hovered/inspected/demo bucket large & forward; gently recede neighbors
        const activeHoverAmt = Math.max(b.hoverLerp, b.demoHoverLerp * 0.52);
        const hoverX = b.basePos.x * (1 - activeHoverAmt * 0.14);
        const hoverY = b.basePos.y + floatY - activeHoverAmt * 0.3;
        const hoverZ =
          b.basePos.z +
          activeHoverAmt * 2.0 -
          recedeBlend * (anyBucketInspected ? 1.85 : 0.42);
        const demoFocusX = THREE.MathUtils.lerp(hoverX, hoverX * 0.52, b.demoSwellLerp);
        const demoFocusY = THREE.MathUtils.lerp(
          hoverY,
          hoverY - 0.18 + Math.sin(elapsed * 1.35) * 0.04,
          b.demoSwellLerp,
        );
        const demoFocusZ = THREE.MathUtils.lerp(hoverZ, b.basePos.z + 2.75, b.demoSwellLerp);
        const pullX = THREE.MathUtils.lerp(demoFocusX, 0, b.inspectLerp);
        const pullY = THREE.MathUtils.lerp(
          demoFocusY,
          -0.05 + Math.sin(elapsed * 1.25) * 0.045,
          b.inspectLerp,
        );
        const pullZ = THREE.MathUtils.lerp(demoFocusZ, 5.25, b.inspectLerp);
        b.group.position.set(pullX, pullY, pullZ);
        b.group.rotation.y =
          Math.sin(elapsed * 0.85) * 0.08 * Math.max(b.inspectLerp, b.demoSwellLerp * 0.65);

        const baseScale =
          1 + activeHoverAmt * 0.58 - recedeBlend * (anyBucketInspected ? 0.22 : 0.1);
        const demoScaled = THREE.MathUtils.lerp(baseScale, 1.76, b.demoSwellLerp);
        const s = THREE.MathUtils.lerp(demoScaled, 2.38, b.inspectLerp);
        b.group.scale.set(s, s, s);

        const isDark = stateRef.current.isDarkTheme;
        const emphasized = Math.max(b.hoverLerp, b.inspectLerp, b.demoSwellLerp * 0.92);
        b.wallMat.color.setHex(isFull ? 0xfde68a : isDark ? 0x93c5fd : 0x38bdf8);
        b.wallMat.opacity = isInspected
          ? 0.34
          : anyBucketInspected
            ? 0.09
            : isHovered || b.demoSwellLerp > 0.25
              ? 0.36
              : isDemoHovered
                ? 0.32
                : isFull
                  ? 0.3
                  : isActive
                    ? 0.26
                    : isDark
                      ? 0.22
                      : 0.28;
        b.rimMat.color.setHex(
          isFull
            ? 0xfde68a
            : isDark
              ? isHovered || isInspected || isDemoHovered || isDemoSwelled
                ? 0xe0f2fe
                : 0xbae6fd
              : 0x0284c7,
        );
        b.rimMat.emissive.setHex(isFull ? 0xd97706 : isDark ? 0x0284c7 : 0x38bdf8);
        b.rimMat.emissiveIntensity = isInspected
          ? 1.9
          : isHovered
            ? 2.1
            : isDemoSwelled || isDemoHovered
              ? 1.75
              : isFull
                ? 1.35
                : isActive
                  ? 1.15
                  : isDark
                    ? 0.65
                    : 0.45;
        b.footMat.color.setHex(isFull ? 0xfde68a : isDark ? 0x7dd3fc : 0x0ea5e9);
        b.footMat.emissive.setHex(isFull ? 0xb45309 : 0x0369a1);

        // Dynamic crystal sheen gently rising inside the shallow bowl (including +1 extra demo ball)
        const fillRatio = Math.min(1, visualBallCount / BUCKET_CAPACITY);
        b.liquidMesh.position.y = THREE.MathUtils.damp(
          b.liquidMesh.position.y,
          -0.25 + fillRatio * 0.22,
          7,
          dt,
        );
        const liquidRadiusScale = 0.78 + fillRatio * 0.28;
        b.liquidMesh.scale.setScalar(liquidRadiusScale);
        b.liquidMat.opacity = isInspected
          ? 0.34
          : anyBucketInspected
            ? 0.06
            : isHovered || b.demoSwellLerp > 0.25
              ? 0.36
              : isFull
                ? 0.32
                : isActive
                  ? 0.24
                  : 0.14;

        // Open crystal bowls stay clean; flush golden crystal seal settles ONLY at 12/12
        b.sealBlend = THREE.MathUtils.damp(
          b.sealBlend,
          isFull && !isInspected && !isDemoSwelled ? 1 : 0,
          9,
          dt,
        );
        b.sealLidGroup.visible = b.sealBlend > 0.02;
        if (b.sealLidGroup.visible) {
          b.sealLidGroup.position.y = THREE.MathUtils.lerp(0.56, 0.36, b.sealBlend);
          b.sealLidGroup.scale.setScalar(THREE.MathUtils.lerp(0.84, 1.0, b.sealBlend));
          b.sealLidMat.opacity = b.sealBlend * 0.42;
          b.sealRimMat.emissiveIntensity = b.sealBlend * 1.1;
        }

        // Glossy domain pearls resting cleanly along the curved crystal dish floor
        for (let bi = 0; bi < b.reportBalls.length; bi += 1) {
          const ball = b.reportBalls[bi];
          if (bi < reportCount) {
            const entry = reportsInBucket[bi];
            ball.mesh.visible = true;
            ball.mat.color.set(entry.accentHex);
            ball.mat.emissive.set(entry.accentHex);
            ball.mat.emissiveIntensity =
              (entry.provider === 'fable' ? 0.85 : 0.55) + emphasized * 0.55;
            const lingerWave =
              Math.sin(elapsed * 2.2 + bi * 0.85) * (0.014 + emphasized * 0.055);
            const swayX = Math.cos(elapsed * 1.5 + bi * 1.1) * emphasized * 0.055;
            ball.mesh.position.set(
              ball.baseOffset.x * (1 + emphasized * 0.18) + swayX,
              ball.baseOffset.y + emphasized * 0.2 + lingerWave,
              ball.baseOffset.z * (1 + emphasized * 0.12),
            );
            const ballScale = 1 + emphasized * 0.82;
            ball.mesh.scale.setScalar(ballScale);
          } else if (hasExtraDemoBall && bi === reportCount) {
            ball.mesh.visible = true;
            ball.mat.color.set(demoExtraBallAccent);
            ball.mat.emissive.set(demoExtraBallAccent);
            ball.mat.emissiveIntensity = 1.05 + emphasized * 0.65;
            const lingerWave =
              Math.sin(elapsed * 2.5 + bi * 0.85) * (0.02 + emphasized * 0.065);
            const swayX = Math.cos(elapsed * 1.6 + bi * 1.1) * emphasized * 0.065;
            const dropLiftY = (1 - demoExtraBallPop) * 0.38;
            ball.mesh.position.set(
              ball.baseOffset.x * (1 + emphasized * 0.18) + swayX,
              ball.baseOffset.y + emphasized * 0.22 + lingerWave + dropLiftY,
              ball.baseOffset.z * (1 + emphasized * 0.12),
            );
            const ballScale = (1 + emphasized * 0.9) * Math.max(0.05, demoExtraBallPop);
            ball.mesh.scale.setScalar(ballScale);
          } else {
            ball.mesh.visible = false;
          }
        }

        // Update inner label + enlarged existing-report preview pills when hovered/inspected or theme changes
        const isMinimalRimMode = isInspected || isDemoSwelled;
        const summarySig = reportsInBucket
          .map((r) => `${r.domain}:${r.provider}:${r.shortSummary}`)
          .join('|');
        const sig = `${reportCount}:${isActive ? 1 : 0}:${isHovered ? 1 : 0}:${isMinimalRimMode ? 1 : 0}:${isDark ? 1 : 0}:${isHovered ? summarySig : ''}`;
        if (b.cachedSignature !== sig) {
          b.cachedSignature = sig;
          const nextTex = drawBucketLabelCanvas(
            b.monthItem.shortMonth,
            b.monthItem.year,
            reportsInBucket,
            isActive,
            isHovered,
            isMinimalRimMode,
            isDark,
            maxAnisotropy,
          );
          const oldTex = b.activeTex;
          b.activeTex = nextTex;
          b.badgeMat.map = nextTex;
          b.badgeMat.needsUpdate = true;
          if (oldTex) oldTex.dispose();
        }
      }

      // Animate 6 Pure Core Domain Icons Jumping (real icons always remain interactive & grabbable)
      for (let i = 0; i < orbEntries.length; i += 1) {
        const o = orbEntries[i];
        const isDragged = draggingOrbIdx === i;
        const isHovered = !anyBucketInspected && pointerHoverOrbIdx === i;

        if (!isDragged) {
          const bounce = anyBucketInspected
            ? 0
            : Math.abs(Math.sin(elapsed * 2.4 + o.phase)) * 0.46;
          const inspectYOffset = anyBucketInspected ? -1.4 : 0;
          _targetPos.set(o.homePos.x, o.homePos.y + bounce + inspectYOffset, o.homePos.z);
          o.currentPos.x = THREE.MathUtils.damp(o.currentPos.x, _targetPos.x, 10, dt);
          o.currentPos.y = THREE.MathUtils.damp(o.currentPos.y, _targetPos.y, 12, dt);
          o.currentPos.z = THREE.MathUtils.damp(o.currentPos.z, _targetPos.z, 10, dt);
        }

        o.group.position.copy(o.currentPos);

        const targetScale = anyBucketInspected
          ? 0.45
          : isDragged
            ? hoveredBucketKeyLocal
              ? 0.78
              : 1.15
            : isHovered
              ? 1.14
              : 1.0;
        o.scaleLerp = THREE.MathUtils.damp(o.scaleLerp, targetScale, 12, dt);
        o.group.scale.setScalar(o.scaleLerp);

        const heightAboveFloor = Math.max(0, o.currentPos.y - (o.homePos.y - 0.5));
        const shadowScale = THREE.MathUtils.clamp(1.08 - heightAboveFloor * 0.34, 0.44, 1.08);
        o.shadowMesh.position.set(o.currentPos.x, o.homePos.y - 0.68, o.currentPos.z);
        o.shadowMesh.scale.setScalar(anyBucketInspected ? 0.01 : isDragged ? 0.36 : shadowScale);
        o.shadowMat.opacity = anyBucketInspected ? 0 : isDragged ? 0.1 : shadowScale * 0.28;
      }

      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('pointerdown', unlockIntroAudioOnce);
      window.removeEventListener('keydown', unlockIntroAudioOnce);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      for (const b of bucketEntries) {
        if (b.activeTex) b.activeTex.dispose();
      }
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [stageQuickMonths]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dockedTarget || isSending) return;
    const trimmed = questionText.trim();
    if (!trimmed) {
      setValidationError('Please enter a question');
      bubbleInputRef.current?.focus();
      return;
    }
    const chosen = dockedTarget;
    const chosenProvider = chosen.providerOverride ?? activeProvider;
    playLaunchTransitionCue();
    setDockedTarget(null);
    setQuestionText('');
    setValidationError(null);
    onSubmitQuestion({
      text: trimmed,
      domain: chosen.topic.domain,
      threadName: chosen.topic.label,
      month: chosen.month.month,
      year: chosen.month.year,
      provider: chosenProvider,
    });
  };

  const inspectedBucket = useMemo(() => {
    if (!inspectedBucketKey) return null;
    const monthItem = stageQuickMonths.find((m) => m.key === inspectedBucketKey);
    const entries = bucketReportsByKey.get(inspectedBucketKey) ?? [];
    if (!monthItem || entries.length === 0) return null;

    const parsedReports = entries.map((entry) => {
      const qTurn = entry.record.turns.find((t) => t.role === 'user');
      const aTurn = [...entry.record.turns].reverse().find((t) => t.role === 'assistant');
      const topicDef = TOPICS.find((t) => t.domain === entry.domain) ?? TOPICS[0];
      const readOut = aTurn ? extractReadOutSections(aTurn.content) : null;
      const parsed = aTurn ? parseResponseEventsAndReport(aTurn.content, entry.domain) : null;
      const rawEvents =
        parsed && parsed.events.length > 0
          ? parsed.events
          : Array.isArray(aTurn?.eventCards)
            ? aTurn.eventCards
            : [];
      const cards = rawEvents.map((evt, idx) => normalizeEventCardItem(evt, idx));
      const fallbackPlain = aTurn?.content
        ? aTurn.content
            .replace(/<pa_events>[\s\S]*?<\/pa_events>/gi, '')
            .replace(/<pa_caution_dates>[\s\S]*?<\/pa_caution_dates>/gi, '')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/[*_`~]/g, '')
            .trim()
        : '';

      return {
        ...entry,
        topicDef,
        question: (qTurn?.content || qTurn?.threadName || 'Report').trim(),
        answer: readOut?.answer?.trim() || '',
        summary: readOut?.summary?.trim() || (!readOut?.answer ? fallbackPlain : ''),
        cards,
      };
    });

    return {
      monthItem,
      reports: parsedReports,
    };
  }, [bucketReportsByKey, inspectedBucketKey, stageQuickMonths]);

  const activeInspectedReport = inspectedBucket
    ? inspectedBucket.reports[
        Math.min(selectedInspectReportIdx, inspectedBucket.reports.length - 1)
      ] ?? null
    : null;

  return (
    <div className="pa-prod-backdrop relative flex-1 min-h-0 overflow-hidden transition-colors duration-300">
      {/* Real Three.js 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Right-Hand Current-Month Cross-Model Suggestions (Max 2, Unified Frosted Glass) */}
      <AnimatePresence>
        {!dockedTarget &&
          !blockedDropNotice &&
          !inspectedBucketKey &&
          !isSending &&
          currentMonthSuggestions.length > 0 && (
            <motion.aside
              key="stage1-right-suggestions"
              aria-label="Current month suggestions"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="pointer-events-none absolute right-4 bottom-4 sm:right-5 sm:bottom-5 z-10 flex flex-col items-end gap-2.5 w-[min(320px,calc(100vw-2rem))]"
            >
              {currentMonthSuggestions.map((suggestion) => {
                const sourceName = suggestion.sourceProvider === 'fable' ? 'Fable' : 'Gemini';
                const targetName = suggestion.targetProvider === 'fable' ? 'Fable' : 'Gemini';
                return (
                  <div
                    key={suggestion.key}
                    className="pa-glass-card pointer-events-auto w-full rounded-[22px] px-3.5 py-3 transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion(suggestion)}
                        className="flex-1 min-w-0 flex items-start gap-2.5 text-left cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        <span
                          className="relative mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
                          style={{ backgroundColor: `${suggestion.topic.accentHex}26` }}
                        >
                          <TopicBackdropIcon
                            icon={suggestion.topic.icon}
                            color={isDarkTheme ? suggestion.topic.accentHex : suggestion.topic.glowHex}
                            className="w-4 h-4"
                          />
                          <span
                            className={`absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full shadow-xs border ${
                              isDarkTheme
                                ? 'bg-slate-900 text-sky-300 border-sky-400/50'
                                : 'bg-white text-sky-600 border-sky-200'
                            }`}
                          >
                            <Plus className="w-2.5 h-2.5 stroke-[2.75]" />
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-semibold leading-snug ${
                              isDarkTheme ? 'text-slate-100' : 'text-slate-900'
                            }`}
                          >
                            Do you want to try the same{' '}
                            <span
                              style={{
                                color: isDarkTheme ? suggestion.topic.accentHex : suggestion.topic.glowHex,
                              }}
                            >
                              {suggestion.topic.label}
                            </span>{' '}
                            question of {suggestion.monthName} from {sourceName} to {targetName}?
                          </p>
                          {suggestion.questionPreview && (
                            <p
                              className={`mt-1 text-[11px] truncate ${
                                isDarkTheme ? 'text-slate-300/80' : 'text-slate-600'
                              }`}
                            >
                              &ldquo;{suggestion.questionPreview}&rdquo;
                            </p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDismissedSuggestionKeys((prev) =>
                            prev.includes(suggestion.key) ? prev : [...prev, suggestion.key],
                          )
                        }
                        aria-label={`Dismiss ${suggestion.topic.label} suggestion`}
                        title="Dismiss suggestion"
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-lg shrink-0 cursor-pointer transition-colors ${
                          isDarkTheme
                            ? 'text-slate-400 hover:text-white hover:bg-white/10'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-white/75'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </motion.aside>
          )}
      </AnimatePresence>

      {/* Enlarged Read-Only Report Showcase Inside Clicked Bucket */}
      <AnimatePresence>
        {inspectedBucket && activeInspectedReport && (
          <motion.div
            key="bucket-readonly-showcase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setInspectedBucketKey(null)}
            className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6 bg-transparent"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="bucket-readonly-title"
              initial={{ scale: 0.42, y: -42, opacity: 0 }}
              animate={{ scale: 1, y: 12, opacity: 1 }}
              exit={{ scale: 0.48, y: -36, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="pa-glass-card w-full max-w-lg max-h-[68vh] sm:max-h-[72vh] rounded-[28px] flex flex-col overflow-hidden"
            >
              {/* Bucket Interior Header */}
              <div
                className={`px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                  isDarkTheme ? 'border-white/12' : 'border-white/75'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    id="bucket-readonly-title"
                    className={`font-display text-sm sm:text-base font-bold truncate ${
                      isDarkTheme ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {inspectedBucket.monthItem.fullLabel}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setInspectedBucketKey(null)}
                    aria-label="Close bucket preview"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xl cursor-pointer transition-colors ${
                      isDarkTheme
                        ? 'text-slate-300 hover:text-white hover:bg-white/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/75'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Read-Only Selector Pills if Bucket Holds Multiple Reports */}
              {inspectedBucket.reports.length > 1 && (
                <div
                  className={`px-5 py-2.5 border-b flex flex-wrap items-center gap-1.5 shrink-0 ${
                    isDarkTheme
                      ? 'border-white/10 bg-white/4'
                      : 'border-white/60 bg-white/35'
                  }`}
                >
                  {inspectedBucket.reports.map((rep, idx) => {
                    const isSelected = idx === Math.min(selectedInspectReportIdx, inspectedBucket.reports.length - 1);
                    return (
                      <button
                        key={rep.record.id}
                        type="button"
                        onClick={() => setSelectedInspectReportIdx(idx)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-sky-600 text-white shadow-xs'
                            : isDarkTheme
                              ? 'bg-white/10 text-slate-200 hover:bg-white/16'
                              : 'bg-white/70 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isSelected ? '#ffffff' : rep.accentHex }}
                        />
                        <span>{rep.domainLabel}</span>
                        <span
                          className={`text-[10px] font-mono ${
                            isSelected
                              ? 'text-sky-100'
                              : isDarkTheme
                                ? 'text-slate-300'
                                : 'text-slate-500'
                          }`}
                        >
                          {rep.provider === 'fable' ? 'Fable' : 'Gemini'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Strictly Read-Only Report Content Inside the Bucket */}
              <div className="flex-1 min-h-0 overflow-y-auto fluent-scroll p-5 space-y-4 select-text">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${activeInspectedReport.topicDef.accentHex}2a` }}
                    >
                      <TopicBackdropIcon
                        icon={activeInspectedReport.topicDef.icon}
                        color={
                          isDarkTheme
                            ? activeInspectedReport.topicDef.accentHex
                            : activeInspectedReport.topicDef.glowHex
                        }
                        className="w-4 h-4"
                      />
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        isDarkTheme ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {activeInspectedReport.domainLabel}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      activeInspectedReport.provider === 'fable'
                        ? isDarkTheme
                          ? 'border-amber-400/45 bg-amber-400/15 text-amber-200'
                          : 'border-amber-300/90 bg-amber-100/80 text-amber-800'
                        : isDarkTheme
                          ? 'border-sky-400/45 bg-sky-400/15 text-sky-200'
                          : 'border-sky-300/90 bg-sky-100/80 text-sky-800'
                    }`}
                  >
                    {activeInspectedReport.provider === 'fable' ? 'Fable' : 'Gemini'}
                  </span>
                </div>

                <div className="pa-glass-subwell rounded-2xl px-4 py-3">
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                      isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                    }`}
                  >
                    Question
                  </div>
                  <p
                    className={`text-xs sm:text-[13px] font-semibold leading-relaxed ${
                      isDarkTheme ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {activeInspectedReport.question}
                  </p>
                </div>

                {activeInspectedReport.answer && (
                  <div className="pa-glass-subwell rounded-2xl px-4 py-3 space-y-1">
                    <div
                      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                        isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Answer</span>
                    </div>
                    <p
                      className={`text-xs sm:text-[13px] leading-relaxed whitespace-pre-line ${
                        isDarkTheme ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      {activeInspectedReport.answer}
                    </p>
                  </div>
                )}

                {activeInspectedReport.summary && (
                  <div className="pa-glass-subwell rounded-2xl px-4 py-3 space-y-1">
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                      }`}
                    >
                      Summary
                    </div>
                    <p
                      className={`text-xs sm:text-[13px] leading-relaxed whitespace-pre-line ${
                        isDarkTheme ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      {activeInspectedReport.summary}
                    </p>
                  </div>
                )}

                {activeInspectedReport.cards.length > 0 && (
                  <div className="space-y-2">
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider px-1 ${
                        isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                      }`}
                    >
                      Events in Report ({activeInspectedReport.cards.length})
                    </div>
                    {activeInspectedReport.cards.map((card) => (
                      <div
                        key={card.id}
                        className="pa-glass-subwell rounded-2xl px-4 py-3 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className={`text-xs font-bold leading-snug ${
                              isDarkTheme ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {card.title}
                          </h3>
                          {card.probability && (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                                isDarkTheme
                                  ? 'bg-sky-400/15 border-sky-400/35 text-sky-200'
                                  : 'bg-sky-100/90 border-sky-200 text-sky-800'
                              }`}
                            >
                              {card.probability}
                            </span>
                          )}
                        </div>
                        {card.when && (
                          <div
                            className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-lg px-2 py-0.5 ${
                              isDarkTheme
                                ? 'text-amber-200 bg-amber-400/15'
                                : 'text-amber-800 bg-amber-100/75'
                            }`}
                          >
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>{card.when}</span>
                          </div>
                        )}
                        {(card.summary || card.how) && (
                          <p
                            className={`text-xs leading-relaxed ${
                              isDarkTheme ? 'text-slate-200/90' : 'text-slate-700'
                            }`}
                          >
                            {card.how || card.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Red Alert if Month Toggling / Reference Context Sync is Unavailable */}
      {monthSwitchError && (
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center px-4">
          <div
            role="alert"
            className={`pa-glass-card max-w-md rounded-2xl border-rose-400/60 px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-3 ${
              isDarkTheme ? 'text-rose-300' : 'text-rose-700'
            }`}
          >
            <span>{monthSwitchError}</span>
            {onDismissMonthSwitchError && (
              <button
                type="button"
                onClick={onDismissMonthSwitchError}
                aria-label="Dismiss alert"
                className={`p-1 rounded-lg cursor-pointer ${
                  isDarkTheme ? 'hover:bg-white/10' : 'hover:bg-white/75'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Blocked Duplicate Notice Modal (Max 1 Gemini + 1 Fable per domain per month) */}
      {blockedDropNotice && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-xs">
          <div
            role="alertdialog"
            aria-labelledby="blocked-drop-title"
            className="pa-glass-card w-full max-w-md rounded-[26px] p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border shrink-0 ${
                    isDarkTheme
                      ? 'bg-amber-400/15 border-amber-400/35 text-amber-300'
                      : 'bg-amber-500/15 border-amber-400/45 text-amber-600'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <div>
                  <h2
                    id="blocked-drop-title"
                    className={`text-sm font-bold ${
                      isDarkTheme ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Report Already Exists
                  </h2>
                  <p
                    className={`text-xs ${
                      isDarkTheme ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {blockedDropNotice.topic.label} · {blockedDropNotice.month.fullLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockedDropNotice(null)}
                aria-label="Dismiss notice"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer transition-colors ${
                  isDarkTheme
                    ? 'text-slate-300 hover:text-white hover:bg-white/10'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/75'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p
              className={`text-xs leading-relaxed ${
                isDarkTheme ? 'text-slate-200' : 'text-slate-700'
              }`}
            >
              A{' '}
              <span className={`font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {blockedDropNotice.provider === 'fable' ? 'Fable' : 'Gemini'}
              </span>{' '}
              report for{' '}
              <span className={`font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {blockedDropNotice.topic.label}
              </span>{' '}
              in{' '}
              <span className={`font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {blockedDropNotice.month.fullLabel}
              </span>{' '}
              has already been generated.{' '}
              {blockedDropNotice.otherProviderAvailable
                ? `Only one ${blockedDropNotice.provider === 'fable' ? 'Fable' : 'Gemini'} report is allowed per domain each month—you can switch to ${blockedDropNotice.provider === 'fable' ? 'Gemini' : 'Fable'} in the bottom bar to add a second report.`
                : 'Both Gemini and Fable reports (2/2) are already completed for this domain and month.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBlockedDropNotice(null)}
                className="pa-glass-pill px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = blockedDropNotice.existingRecord;
                  setBlockedDropNotice(null);
                  onOpenExistingReport(target);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-sm cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open Existing Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Translucent Frosted Glass Question Panel after Dropping Icon into Month Bucket */}
      {dockedTarget && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-xs">
          <form
            onSubmit={handleSubmit}
            className="pa-glass-card relative overflow-hidden w-full max-w-md rounded-[26px] p-6 sm:p-7 space-y-4"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <TopicBackdropIcon
                icon={dockedTarget.topic.icon}
                color={isDarkTheme ? dockedTarget.topic.accentHex : dockedTarget.topic.glowHex}
                className="w-52 h-52 opacity-[0.12] -rotate-6"
              />
            </div>

            <div className="relative z-10 flex items-center justify-between gap-3">
              <div
                className={`flex items-center gap-2 text-xs font-bold ${
                  isDarkTheme ? 'text-sky-300' : 'text-sky-800'
                }`}
              >
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${dockedTarget.topic.accentHex}33` }}
                >
                  <TopicBackdropIcon
                    icon={dockedTarget.topic.icon}
                    color={isDarkTheme ? dockedTarget.topic.accentHex : dockedTarget.topic.glowHex}
                    className="w-3.5 h-3.5"
                  />
                </span>
                <span className="tabular-nums">
                  {dockedTarget.month.fullLabel} ·{' '}
                  {(dockedTarget.providerOverride ?? activeProvider) === 'fable' ? 'Fable' : 'Gemini'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDockedTarget(null);
                  setValidationError(null);
                }}
                aria-label="Close question prompt"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl cursor-pointer transition-colors ${
                  isDarkTheme
                    ? 'text-slate-300 hover:text-white hover:bg-white/10'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/10'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative z-10">
              <label
                htmlFor="prod-stage1-question"
                className={`block font-display text-lg font-bold mb-2 ${
                  isDarkTheme ? 'text-white' : 'text-slate-900'
                }`}
              >
                What&apos;s on your mind?
              </label>
              <textarea
                id="prod-stage1-question"
                ref={bubbleInputRef}
                rows={4}
                value={questionText}
                disabled={isSending}
                onChange={(e) => {
                  setQuestionText(e.target.value);
                  if (validationError && e.target.value.trim()) {
                    setValidationError(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask your question for this month..."
                className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm focus:outline-none ${
                  isDarkTheme
                    ? 'border-white/18 bg-slate-950/55 text-white placeholder:text-slate-400 focus:border-sky-400'
                    : 'border-sky-200/90 bg-white/80 text-slate-900 placeholder:text-slate-500 focus:border-sky-500 focus:bg-white'
                }`}
              />
              {validationError && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-500">
                  {validationError}
                </p>
              )}
            </div>

            <div className="relative z-10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDockedTarget(null);
                  setValidationError(null);
                }}
                className="pa-glass-pill px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Ask</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
