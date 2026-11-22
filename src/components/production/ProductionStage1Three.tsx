import {
  Briefcase,
  Calendar,
  DollarSign,
  Eye,
  Heart,
  Home,
  Loader2,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
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
  playLaunchTransitionCue,
  startBucketAmbientMusic,
  stopBucketAmbientMusic,
  warmAudioContext,
} from '../../utils/notify';

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
];

const TOPIC_ACCENT_BY_DOMAIN: Record<PromptDomain, string> = {
  astrology: '#38bdf8',
  family: '#34d399',
  finance: '#fbbf24',
  general: '#fb7185',
  health: '#a78bfa',
};

interface ProductionStage1ThreeProps {
  activeMonthNum: number;
  activeYearNum: number;
  activePromptDomain: PromptDomain;
  activeProvider: 'gemini' | 'fable';
  isDarkTheme?: boolean;
  ratedThreads: RatedThreadRecord[];
  isSending: boolean;
  switchingMonthKey?: string | null;
  monthSwitchError?: string | null;
  onDismissMonthSwitchError?: () => void;
  onPromptDomainChange: (domain: PromptDomain) => void;
  onSelectQuickMonth?: (month: number, year: number) => void;
  onOpenExistingReport: (record: RatedThreadRecord) => void;
  onSubmitQuestion: (payload: {
    text: string;
    domain: PromptDomain;
    threadName: string;
    month: number;
    year: number;
  }) => void;
}

function normalizeRecordDomain(rawDomain?: string, relPath?: string): PromptDomain {
  if (
    rawDomain === 'astrology' ||
    rawDomain === 'family' ||
    rawDomain === 'finance' ||
    rawDomain === 'general' ||
    rawDomain === 'health'
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
  return <Shield className={className} style={style} strokeWidth={1.5} />;
}

function drawBucketLabelCanvas(
  shortMonth: string,
  year: number,
  reportsInBucket: BucketReportEntry[],
  isActive: boolean,
  isHovered: boolean,
  isInspected: boolean,
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

  const isFull = count >= 10;
  ctx.shadowColor = isFull
    ? 'rgba(251, 191, 36, 0.9)'
    : isHovered || isInspected
      ? 'rgba(125, 211, 252, 0.95)'
      : isActive
        ? 'rgba(56, 189, 248, 0.85)'
        : 'rgba(14, 165, 233, 0.55)';
  ctx.shadowBlur = isHovered || isInspected || isFull ? 22 : 14;

  if (isInspected) {
    // Minimal glowing top rim title when bucket is expanded for read-only report reading
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
    const headerTitle = `${shortMonth.toUpperCase()} ${year} · ${isFull ? 'FULL 10/10' : `${count}/10`}`;
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
    // Clean resting label at standard bucket size
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(4, 12, 28, 0.72)';
    ctx.font = '800 124px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.strokeText(shortMonth.toUpperCase(), width / 2, height / 2 - 58);
    ctx.fillStyle = isFull
      ? '#fef3c7'
      : isActive
        ? '#f0f9ff'
        : '#e0f2fe';
    ctx.fillText(shortMonth.toUpperCase(), width / 2, height / 2 - 58);

    ctx.lineWidth = 7;
    ctx.font = '700 58px "JetBrains Mono", monospace';
    ctx.strokeText(String(year), width / 2, height / 2 + 34);
    ctx.fillStyle = isFull ? '#fde68a' : '#bae6fd';
    ctx.fillText(String(year), width / 2, height / 2 + 34);

    const countText = isFull ? 'FOLDED · 10/10' : `${count}/10`;
    ctx.lineWidth = 6;
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.strokeText(countText, width / 2, height / 2 + 114);
    ctx.fillStyle = isFull ? '#fbbf24' : count > 0 ? '#7dd3fc' : 'rgba(186, 230, 253, 0.65)';
    ctx.fillText(countText, width / 2, height / 2 + 114);
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
  ratedThreads,
  isSending,
  switchingMonthKey,
  monthSwitchError,
  onDismissMonthSwitchError,
  onPromptDomainChange,
  onSelectQuickMonth,
  onOpenExistingReport,
  onSubmitQuestion,
}: ProductionStage1ThreeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bubbleInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [dockedTarget, setDockedTarget] = useState<{
    topic: ProductionTopicDef;
    month: ProductionMonthItem;
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
  const [hoveredBucketLabel, setHoveredBucketLabel] = useState<string | null>(null);
  const [isDraggingTopic, setIsDraggingTopic] = useState(false);
  const [inspectedBucketKey, setInspectedBucketKey] = useState<string | null>(null);
  const [selectedInspectReportIdx, setSelectedInspectReportIdx] = useState(0);
  const [isMusicMuted, setIsMusicMuted] = useState(false);

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

  // Build lookup map of existing Gemini/Fable reports per month bucket (max 10 per bucket: 2 per domain)
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

      const monthName = (qTurn.threadMonth || '').trim().toLowerCase();
      const matchedMonth = stageQuickMonths.find(
        (m) =>
          m.year === qTurn.threadYear &&
          (getMonthNameFromNumber(m.month)?.toLowerCase() === monthName ||
            m.shortMonth.toLowerCase() === monthName.slice(0, 3)),
      );
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

  const bucketReportsRef = useRef(bucketReportsByKey);
  bucketReportsRef.current = bucketReportsByKey;

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
    setHoveredBucketLabel,
    setIsDraggingTopic,
    setInspectedBucketKey,
    setSelectedInspectReportIdx,
  });
  callbacksRef.current = {
    onPromptDomainChange,
    onSelectQuickMonth,
    setDockedTarget,
    setQuestionText,
    setValidationError,
    setHoveredBucketLabel,
    setIsDraggingTopic,
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
  };

  useEffect(() => {
    if (isSending || dockedTarget || blockedDropNotice) {
      setInspectedBucketKey(null);
    }
  }, [blockedDropNotice, dockedTarget, isSending]);

  useEffect(() => {
    if (!inspectedBucketKey || isMusicMuted) {
      stopBucketAmbientMusic();
      return;
    }
    const stopMusic = startBucketAmbientMusic();
    return () => {
      stopMusic();
    };
  }, [inspectedBucketKey, isMusicMuted]);

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

    // 6 Bigger Medium-Size Spaced 3D Month Buckets lifted cleanly above the bottom 5 jumping icons
    const bucketSlots: Array<{ x: number; y: number; z: number }> = [
      { x: -6.15, y: 1.38, z: -0.34 },
      { x: -3.69, y: 2.04, z: -0.18 },
      { x: -1.23, y: 2.46, z: -0.04 },
      { x: 1.23, y: 2.46, z: -0.04 },
      { x: 3.69, y: 2.04, z: -0.18 },
      { x: 6.15, y: 1.38, z: -0.34 },
    ];

    const bucketTopRadius = 1.06;
    const bucketBotRadius = 0.80;
    const bucketHeight = 1.54;
    const bucketWallGeo = new THREE.CylinderGeometry(bucketTopRadius, bucketBotRadius, bucketHeight, 44, 1, true);
    const bucketFloorGeo = new THREE.CircleGeometry(bucketBotRadius, 40);
    const bucketRimGeo = new THREE.TorusGeometry(bucketTopRadius, 0.048, 16, 52);
    const bucketFootGeo = new THREE.TorusGeometry(bucketBotRadius, 0.032, 14, 44);
    const bucketLiquidGeo = new THREE.CircleGeometry(0.86, 36);
    const bucketInnerTextGeo = new THREE.PlaneGeometry(1.58, 0.98);
    const lidCapGeo = new THREE.CircleGeometry(bucketTopRadius - 0.02, 40);
    const lidRimGeo = new THREE.TorusGeometry(bucketTopRadius - 0.01, 0.036, 14, 48);
    const miniBallGeo = new THREE.SphereGeometry(0.135, 22, 22);
    disposables.push(
      bucketWallGeo,
      bucketFloorGeo,
      bucketRimGeo,
      bucketFootGeo,
      bucketLiquidGeo,
      bucketInnerTextGeo,
      lidCapGeo,
      lidRimGeo,
      miniBallGeo,
    );

    const BALL_LOCAL_OFFSETS: Array<{ x: number; y: number; z: number }> = [
      { x: -0.46, y: -0.54, z: 0.28 },
      { x: -0.23, y: -0.54, z: 0.36 },
      { x: 0.0, y: -0.54, z: 0.39 },
      { x: 0.23, y: -0.54, z: 0.36 },
      { x: 0.46, y: -0.54, z: 0.28 },
      { x: -0.40, y: -0.34, z: -0.02 },
      { x: -0.20, y: -0.34, z: 0.06 },
      { x: 0.0, y: -0.34, z: 0.09 },
      { x: 0.20, y: -0.34, z: 0.06 },
      { x: 0.40, y: -0.34, z: -0.02 },
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
    }

    const hitSphereGeo = new THREE.SphereGeometry(1.24, 16, 16);
    const invisibleHitMat = new THREE.MeshBasicMaterial({ visible: false });
    disposables.push(hitSphereGeo, invisibleHitMat);

    const bucketEntries: BucketEntry[] = stageQuickMonths.map((monthItem, idx) => {
      const slot = bucketSlots[idx];
      const group = new THREE.Group();
      const basePos = new THREE.Vector3(slot.x, slot.y, slot.z);
      group.position.copy(basePos);

      const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x7dd3fc,
        metalness: 0.08,
        roughness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const wallMesh = new THREE.Mesh(bucketWallGeo, wallMat);
      wallMesh.rotation.x = 0.18;
      wallMesh.renderOrder = 4;
      group.add(wallMesh);

      const floorMesh = new THREE.Mesh(bucketFloorGeo, wallMat);
      floorMesh.rotation.x = -Math.PI / 2 + 0.18;
      floorMesh.position.y = -0.75;
      floorMesh.renderOrder = 1;
      group.add(floorMesh);

      const footMat = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0369a1,
        emissiveIntensity: 0.45,
        metalness: 0.78,
        roughness: 0.22,
      });
      const footMesh = new THREE.Mesh(bucketFootGeo, footMat);
      footMesh.rotation.x = Math.PI / 2 + 0.18;
      footMesh.position.y = -0.75;
      group.add(footMesh);

      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85,
        metalness: 0.82,
        roughness: 0.16,
      });
      const rimMesh = new THREE.Mesh(bucketRimGeo, rimMat);
      rimMesh.rotation.x = Math.PI / 2 + 0.18;
      rimMesh.position.y = 0.75;
      group.add(rimMesh);

      const liquidMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const liquidMesh = new THREE.Mesh(bucketLiquidGeo, liquidMat);
      liquidMesh.rotation.x = -Math.PI / 2 + 0.18;
      liquidMesh.position.y = -0.45;
      liquidMesh.renderOrder = 2;
      group.add(liquidMesh);

      // 10 pre-allocated report balls sitting inside the bottom of each bucket
      const reportBalls = BALL_LOCAL_OFFSETS.map((offset) => {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.55,
          metalness: 0.18,
          roughness: 0.14,
          clearcoat: 1.0,
        });
        const mesh = new THREE.Mesh(miniBallGeo, mat);
        mesh.position.set(offset.x, offset.y, offset.z);
        mesh.visible = false;
        mesh.renderOrder = 3;
        group.add(mesh);
        disposables.push(mat);
        return { mesh, mat, baseOffset: offset };
      });

      // Flush crystal seal cap that settles cleanly ON TOP ONLY when bucket hits 10/10 reports
      // (open buckets have zero clutter/flaps sticking up on top)
      const sealLidGroup = new THREE.Group();
      sealLidGroup.position.set(0, 0.75, 0);
      sealLidGroup.rotation.x = 0.18;
      sealLidGroup.visible = false;

      const sealLidMat = new THREE.MeshPhysicalMaterial({
        color: 0xfde68a,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.35,
        metalness: 0.25,
        roughness: 0.12,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.45,
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
      group.add(sealLidGroup);
      disposables.push(sealLidMat, sealRimMat);

      const initialTex = drawBucketLabelCanvas(
        monthItem.shortMonth,
        monthItem.year,
        [],
        false,
        false,
        false,
        maxAnisotropy,
      );
      const badgeMat = new THREE.MeshBasicMaterial({
        map: initialTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const badgeMesh = new THREE.Mesh(bucketInnerTextGeo, badgeMat);
      badgeMesh.position.set(0, 0.08, 0.08);
      badgeMesh.rotation.x = 0.12;
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
      };
    });

    // 5 Jumping Core Domain Icons ONLY at the bottom (NO outer sphere, NO outer ring, NO background circle)
    const orbSlots = [
      new THREE.Vector3(-4.2, -2.35, 0.30),
      new THREE.Vector3(-2.1, -2.42, 0.36),
      new THREE.Vector3(0.0, -2.45, 0.40),
      new THREE.Vector3(2.1, -2.42, 0.36),
      new THREE.Vector3(4.2, -2.35, 0.30),
    ];

    const orbIconPlaneGeo = new THREE.PlaneGeometry(1.18, 1.18);
    const orbShadowGeo = new THREE.CircleGeometry(0.46, 24);
    const orbHitGeo = new THREE.SphereGeometry(0.86, 14, 14);
    disposables.push(orbIconPlaneGeo, orbShadowGeo, orbHitGeo);

    interface OrbEntry {
      topic: ProductionTopicDef;
      group: THREE.Group;
      homePos: THREE.Vector3;
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
        shadowMesh,
        shadowMat,
        hitMesh,
        phase: idx * 1.05,
        currentPos: homePos.clone(),
        scaleLerp: 1,
      };
    });

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.35);
    const _intersectPt = new THREE.Vector3();
    const _targetPos = new THREE.Vector3();

    let draggingOrbIdx: number | null = null;
    let pointerHoverOrbIdx: number | null = null;
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
        callbacksRef.current.setIsDraggingTopic(true);
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
            playBucketExpandCue();
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
            const b = bucketEntries.find((item) => item.monthItem.key === nextBucketKey);
            callbacksRef.current.setHoveredBucketLabel(b ? b.monthItem.fullLabel : null);
          }
        }
        return;
      }

      if (
        stateRef.current.dockedTarget ||
        stateRef.current.blockedDropNotice ||
        stateRef.current.inspectedBucketKey
      ) {
        renderer.domElement.style.cursor = 'default';
        return;
      }

      const orbHits = raycaster.intersectObjects(
        orbEntries.map((o) => o.hitMesh),
        false,
      );
      if (orbHits.length > 0) {
        pointerHoverOrbIdx = orbHits[0].object.userData.orbIndex as number;
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      pointerHoverOrbIdx = null;

      const bucketHits = raycaster.intersectObjects(
        bucketEntries.map((b) => b.hitMesh),
        false,
      );
      renderer.domElement.style.cursor = bucketHits.length > 0 ? 'pointer' : 'default';
    };

    const finishDrag = (e: PointerEvent, cancelled: boolean) => {
      if (draggingOrbIdx === null) return;
      const orbIdx = draggingOrbIdx;
      const entry = orbEntries[orbIdx];
      draggingOrbIdx = null;
      callbacksRef.current.setIsDraggingTopic(false);
      callbacksRef.current.setHoveredBucketLabel(null);
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

      // Animate 6 Month Buckets + Swell Big on Hover/Inspect + Floating Interior Reports
      const anyBucketHovered = hoveredBucketKeyLocal !== null;
      const activeInspectKey = stateRef.current.inspectedBucketKey;
      const anyBucketInspected = activeInspectKey !== null;

      for (let i = 0; i < bucketEntries.length; i += 1) {
        const b = bucketEntries[i];
        const reportsInBucket = bucketReportsRef.current.get(b.monthItem.key) ?? [];
        const reportCount = reportsInBucket.length;
        const isFull = reportCount >= 10;

        const isActive =
          b.monthItem.month === stateRef.current.activeMonthNum &&
          b.monthItem.year === stateRef.current.activeYearNum;
        const isHovered = !anyBucketInspected && hoveredBucketKeyLocal === b.monthItem.key;
        const isInspected = activeInspectKey === b.monthItem.key;

        b.hoverLerp = THREE.MathUtils.damp(b.hoverLerp, isHovered ? 1 : 0, 8.5, dt);
        b.inspectLerp = THREE.MathUtils.damp(b.inspectLerp, isInspected ? 1 : 0, 7.2, dt);

        const recedeBlend = anyBucketInspected
          ? isInspected
            ? 0
            : 1
          : anyBucketHovered && !isHovered
            ? 1
            : 0;
        const floatY = Math.sin(elapsed * 1.5 + i * 0.55) * 0.045;

        // Swell hovered/inspected bucket large & center forward; gently recede neighbors
        const hoverX = b.basePos.x * (1 - b.hoverLerp * 0.14);
        const hoverY = b.basePos.y + floatY - b.hoverLerp * 0.34;
        const hoverZ = b.basePos.z + b.hoverLerp * 2.15 - recedeBlend * (anyBucketInspected ? 1.85 : 0.42);
        const pullX = THREE.MathUtils.lerp(hoverX, 0, b.inspectLerp);
        const pullY = THREE.MathUtils.lerp(hoverY, -0.05 + Math.sin(elapsed * 1.25) * 0.045, b.inspectLerp);
        const pullZ = THREE.MathUtils.lerp(hoverZ, 5.25, b.inspectLerp);
        b.group.position.set(pullX, pullY, pullZ);
        b.group.rotation.y = Math.sin(elapsed * 0.85) * 0.08 * b.inspectLerp;

        const baseScale = 1 + b.hoverLerp * 0.62 - recedeBlend * (anyBucketInspected ? 0.22 : 0.1);
        const s = THREE.MathUtils.lerp(baseScale, 2.38, b.inspectLerp);
        b.group.scale.set(s, s, s);

        const emphasized = Math.max(b.hoverLerp, b.inspectLerp);
        b.wallMat.opacity = isInspected
          ? 0.34
          : anyBucketInspected
            ? 0.09
            : isHovered
              ? 0.38
              : isFull
                ? 0.3
                : isActive
                  ? 0.26
                  : 0.2;
        b.rimMat.color.setHex(isFull ? 0xfde68a : isHovered || isInspected ? 0xe0f2fe : 0xbae6fd);
        b.rimMat.emissive.setHex(isFull ? 0xd97706 : 0x0284c7);
        b.rimMat.emissiveIntensity = isInspected
          ? 1.9
          : isHovered
            ? 2.1
            : isFull
              ? 1.35
              : isActive
                ? 1.15
                : 0.65;
        b.footMat.color.setHex(isFull ? 0xfde68a : 0x7dd3fc);
        b.footMat.emissive.setHex(isFull ? 0xb45309 : 0x0369a1);

        // Dynamic fill surface rising cleanly inside the bucket as reports accumulate
        const fillRatio = Math.min(1, reportCount / 10);
        b.liquidMesh.position.y = THREE.MathUtils.damp(
          b.liquidMesh.position.y,
          -0.52 + fillRatio * 0.84,
          7,
          dt,
        );
        const liquidRadiusScale = 0.88 + fillRatio * 0.24;
        b.liquidMesh.scale.setScalar(liquidRadiusScale);
        b.liquidMat.opacity = isInspected
          ? 0.36
          : anyBucketInspected
            ? 0.06
            : isHovered
              ? 0.42
              : isFull
                ? 0.34
                : isActive
                  ? 0.25
                  : 0.15;

        // Open buckets stay completely clean on top; flush crystal lid closes onto rim ONLY at 10/10
        b.sealBlend = THREE.MathUtils.damp(b.sealBlend, isFull && !isInspected ? 1 : 0, 9, dt);
        b.sealLidGroup.visible = b.sealBlend > 0.02;
        if (b.sealLidGroup.visible) {
          b.sealLidGroup.position.y = THREE.MathUtils.lerp(0.98, 0.75, b.sealBlend);
          b.sealLidGroup.scale.setScalar(THREE.MathUtils.lerp(0.84, 1.0, b.sealBlend));
          b.sealLidMat.opacity = b.sealBlend * 0.48;
          b.sealRimMat.emissiveIntensity = b.sealBlend * 1.1;
        }

        // Interior domain balls swell bigger and linger/float noticeably inside the hovered/inspected bucket
        for (let bi = 0; bi < b.reportBalls.length; bi += 1) {
          const ball = b.reportBalls[bi];
          if (bi < reportCount) {
            const entry = reportsInBucket[bi];
            ball.mesh.visible = true;
            ball.mat.color.set(entry.accentHex);
            ball.mat.emissive.set(entry.accentHex);
            ball.mat.emissiveIntensity =
              (entry.provider === 'fable' ? 0.85 : 0.55) + emphasized * 0.5;
            const lingerWave =
              Math.sin(elapsed * 2.2 + bi * 0.85) * (0.018 + emphasized * 0.07);
            const swayX = Math.cos(elapsed * 1.5 + bi * 1.1) * emphasized * 0.07;
            ball.mesh.position.set(
              ball.baseOffset.x * (1 + emphasized * 0.26) + swayX,
              ball.baseOffset.y + emphasized * 0.32 + lingerWave,
              ball.baseOffset.z * (1 + emphasized * 0.22),
            );
            const ballScale = 1 + emphasized * 0.85;
            ball.mesh.scale.setScalar(ballScale);
          } else {
            ball.mesh.visible = false;
          }
        }

        // Update inner label + enlarged existing-report preview pills when hovered/inspected or count changes
        const summarySig = reportsInBucket
          .map((r) => `${r.domain}:${r.provider}:${r.shortSummary}`)
          .join('|');
        const sig = `${reportCount}:${isActive ? 1 : 0}:${isHovered ? 1 : 0}:${isInspected ? 1 : 0}:${isHovered ? summarySig : ''}`;
        if (b.cachedSignature !== sig) {
          b.cachedSignature = sig;
          const nextTex = drawBucketLabelCanvas(
            b.monthItem.shortMonth,
            b.monthItem.year,
            reportsInBucket,
            isActive,
            isHovered,
            isInspected,
            maxAnisotropy,
          );
          const oldTex = b.activeTex;
          b.activeTex = nextTex;
          b.badgeMat.map = nextTex;
          b.badgeMat.needsUpdate = true;
          if (oldTex) oldTex.dispose();
        }
      }

      // Animate 5 Pure Core Domain Icons Jumping (step gracefully aside while inspecting a bucket)
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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
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
    <div
      className={`relative flex-1 min-h-0 overflow-hidden transition-colors duration-300 ${
        isDarkTheme
          ? 'bg-[#060c1a]'
          : 'bg-gradient-to-b from-[#edf5fd] via-[#f6fafe] to-[#ffffff]'
      }`}
    >
      {/* Real Three.js 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle Bottom Guidance Text */}
      {!dockedTarget && !blockedDropNotice && !inspectedBucket && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-10 flex justify-center px-4">
          <p
            className={`text-xs font-medium tracking-wide rounded-xl px-3.5 py-1.5 border ${
              isDarkTheme
                ? 'text-sky-200/85 bg-[#081226]/90 border-sky-400/25'
                : 'fluent-3d-popup-pill text-slate-700'
            }`}
          >
            {isDraggingTopic
              ? hoveredBucketLabel
                ? `Release to drop into ${hoveredBucketLabel}`
                : 'Drop icon into any month bucket above'
              : switchingMonthKey
                ? 'Updating reference period…'
                : `Drag any jumping icon into a bucket to ask · Click any filled bucket to view reports (${activeProvider === 'fable' ? 'Fable' : 'Gemini'} active)`}
          </p>
        </div>
      )}

      {/* Enlarged Read-Only Report Showcase Inside Clicked Bucket + Gentle Background Music */}
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
              className="fluent-3d-popup w-full max-w-lg max-h-[68vh] sm:max-h-[72vh] rounded-[30px] flex flex-col overflow-hidden text-slate-900"
            >
              {/* Bucket Interior Header (Month Title + Soft Music Indicator) */}
              <div className="px-5 py-3.5 border-b border-white/75 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    id="bucket-readonly-title"
                    className="font-display text-sm sm:text-base font-bold text-slate-900 truncate"
                  >
                    {inspectedBucket.monthItem.fullLabel}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMusicMuted((prev) => !prev)}
                    aria-label={isMusicMuted ? 'Unmute background music' : 'Mute background music'}
                    title={isMusicMuted ? 'Unmute ambient music' : 'Mute ambient music'}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors cursor-pointer ${
                      isMusicMuted
                        ? 'text-slate-500 hover:text-slate-800 hover:bg-white/75'
                        : 'text-sky-700 bg-sky-500/12 hover:bg-sky-500/20'
                    }`}
                  >
                    {isMusicMuted ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedBucketKey(null)}
                    aria-label="Close bucket preview"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white/75 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Read-Only Selector Pills if Bucket Holds Multiple Reports */}
              {inspectedBucket.reports.length > 1 && (
                <div className="px-5 py-2.5 border-b border-white/60 bg-white/35 flex flex-wrap items-center gap-1.5 shrink-0">
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
                            isSelected ? 'text-sky-100' : 'text-slate-500'
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
                        color={activeInspectedReport.topicDef.glowHex}
                        className="w-4 h-4"
                      />
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {activeInspectedReport.domainLabel}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      activeInspectedReport.provider === 'fable'
                        ? 'border-amber-300/90 bg-amber-100/80 text-amber-800'
                        : 'border-sky-300/90 bg-sky-100/80 text-sky-800'
                    }`}
                  >
                    {activeInspectedReport.provider === 'fable' ? 'Fable' : 'Gemini'}
                  </span>
                </div>

                <div className="rounded-2xl border border-white/85 bg-white/60 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 mb-1">
                    Question
                  </div>
                  <p className="text-xs sm:text-[13px] font-semibold text-slate-900 leading-relaxed">
                    {activeInspectedReport.question}
                  </p>
                </div>

                {activeInspectedReport.answer && (
                  <div className="rounded-2xl border border-white/85 bg-white/65 px-4 py-3 space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                      <Sparkles className="w-3 h-3 text-sky-600" />
                      <span>Answer</span>
                    </div>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-800 whitespace-pre-line">
                      {activeInspectedReport.answer}
                    </p>
                  </div>
                )}

                {activeInspectedReport.summary && (
                  <div className="rounded-2xl border border-white/85 bg-white/60 px-4 py-3 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                      Summary
                    </div>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-800 whitespace-pre-line">
                      {activeInspectedReport.summary}
                    </p>
                  </div>
                )}

                {activeInspectedReport.cards.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 px-1">
                      Events in Report ({activeInspectedReport.cards.length})
                    </div>
                    {activeInspectedReport.cards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded-2xl border border-white/85 bg-white/65 px-4 py-3 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-bold text-slate-900 leading-snug">
                            {card.title}
                          </h3>
                          {card.probability && (
                            <span className="rounded-full bg-sky-100/90 border border-sky-200 px-2 py-0.5 text-[10px] font-semibold text-sky-800 shrink-0">
                              {card.probability}
                            </span>
                          )}
                        </div>
                        {card.when && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100/75 rounded-lg px-2 py-0.5">
                            <Calendar className="w-3 h-3 text-amber-700 shrink-0" />
                            <span>{card.when}</span>
                          </div>
                        )}
                        {(card.summary || card.how) && (
                          <p className="text-xs leading-relaxed text-slate-700">
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
            className="fluent-3d-popup max-w-md rounded-2xl border border-rose-300/85 px-4 py-2.5 text-xs font-semibold text-rose-700 flex items-center justify-between gap-3"
          >
            <span>{monthSwitchError}</span>
            {onDismissMonthSwitchError && (
              <button
                type="button"
                onClick={onDismissMonthSwitchError}
                aria-label="Dismiss alert"
                className="p-1 rounded-lg hover:bg-white/75"
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
            className="fluent-3d-popup w-full max-w-md rounded-[28px] p-6 text-slate-900 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-400/45 text-amber-600 shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <div>
                  <h2 id="blocked-drop-title" className="text-sm font-bold text-slate-900">
                    Report Already Exists
                  </h2>
                  <p className="text-xs text-slate-600">
                    {blockedDropNotice.topic.label} · {blockedDropNotice.month.fullLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockedDropNotice(null)}
                aria-label="Dismiss notice"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-700">
              A <span className="font-semibold text-slate-900">{blockedDropNotice.provider === 'fable' ? 'Fable' : 'Gemini'}</span> report for{' '}
              <span className="font-semibold text-slate-900">{blockedDropNotice.topic.label}</span> in{' '}
              <span className="font-semibold text-slate-900">{blockedDropNotice.month.fullLabel}</span> has already been generated.{' '}
              {blockedDropNotice.otherProviderAvailable
                ? `Only one ${blockedDropNotice.provider === 'fable' ? 'Fable' : 'Gemini'} report is allowed per domain each month—you can switch to ${blockedDropNotice.provider === 'fable' ? 'Gemini' : 'Fable'} in the bottom bar to add a second report.`
                : 'Both Gemini and Fable reports (2/2) are already completed for this domain and month.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBlockedDropNotice(null)}
                className="px-4 py-2 rounded-xl border border-slate-300/80 bg-white/65 text-xs font-semibold text-slate-700 hover:bg-white/95 cursor-pointer"
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

      {/* Translucent Light-White 3D Fluent Question Panel after Dropping Icon into Month Bucket */}
      {dockedTarget && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-xs">
          <form
            onSubmit={handleSubmit}
            className="fluent-3d-popup relative overflow-hidden w-full max-w-md rounded-[28px] p-6 sm:p-7 space-y-4 text-slate-900"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <TopicBackdropIcon
                icon={dockedTarget.topic.icon}
                color={dockedTarget.topic.glowHex}
                className="w-52 h-52 opacity-[0.13] -rotate-6"
              />
            </div>

            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${dockedTarget.topic.accentHex}33` }}
                >
                  <TopicBackdropIcon
                    icon={dockedTarget.topic.icon}
                    color={dockedTarget.topic.glowHex}
                    className="w-3.5 h-3.5"
                  />
                </span>
                <span className="tabular-nums">
                  {dockedTarget.month.fullLabel} · {activeProvider === 'fable' ? 'Fable' : 'Gemini'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDockedTarget(null);
                  setValidationError(null);
                }}
                aria-label="Close question prompt"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-900/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative z-10">
              <label
                htmlFor="prod-stage1-question"
                className="block font-display text-lg font-bold text-slate-900 mb-2"
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
                className="w-full resize-none rounded-2xl border border-sky-200/90 bg-white/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-sky-500 focus:bg-white/85 focus:outline-none"
              />
              {validationError && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">
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
                className="px-4 py-2 rounded-xl border border-slate-300/80 bg-white/60 text-xs font-semibold text-slate-700 hover:bg-white/90 cursor-pointer"
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
