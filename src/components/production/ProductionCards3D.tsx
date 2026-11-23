import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Heart,
  Home,
  MessageSquarePlus,
  Pause,
  RotateCcw,
  Scale,
  Send,
  ShieldPlus,
  Sparkles,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EventCardIconType, EventCardItem, PromptDomain } from '../../types/workbench';
import {
  getMonthNameFromNumber,
  getMonthNumberFromName,
  getPromptDomainShortLabel,
} from '../../utils/promptTemplates';
import type { ReadOutSections } from '../../utils/eventParser';
import { EventCategoryEmblem } from '../DomainEmblem';
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
}

const CARD_PALETTES = [
  // Top Priority #1: Radiant Bright Sunlit Gold / Ivory
  {
    bgTop: '#fff7d6',
    bgBottom: '#f7d97e',
    titleColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.95)',
    accent: '#d97706',
    chipBg: 'rgba(28,25,23,0.16)',
  },
  // Top Priority #2: Radiant Luminous Pearl-Sky
  {
    bgTop: '#eef8ff',
    bgBottom: '#a8d8ff',
    titleColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.95)',
    accent: '#0284c7',
    chipBg: 'rgba(15,23,42,0.22)',
  },
  {
    bgTop: '#d2cfc4',
    bgBottom: '#aaa69a',
    titleColor: '#ffffff',
    subColor: 'rgba(30,41,59,0.78)',
    accent: '#d97706',
    chipBg: 'rgba(15,23,42,0.12)',
  },
  {
    bgTop: '#7f948e',
    bgBottom: '#526862',
    titleColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.88)',
    accent: '#a7f3d0',
    chipBg: 'rgba(15,23,42,0.24)',
  },
  {
    bgTop: '#8b93a8',
    bgBottom: '#586076',
    titleColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.88)',
    accent: '#93c5fd',
    chipBg: 'rgba(15,23,42,0.24)',
  },
];

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? `${last.slice(0, -1)}…` : `${last}…`;
  }
  return lines;
}

function drawDomainArtwork(
  ctx: CanvasRenderingContext2D,
  icon: EventCardIconType | undefined,
  accent: string,
  cx: number,
  cy: number,
  maskCtx?: CanvasRenderingContext2D,
) {
  const paintShape = (target: CanvasRenderingContext2D, isMask: boolean) => {
    target.save();
    target.translate(cx, cy);

    if (!isMask) {
      // Soft studio shadow platter
      const glow = target.createRadialGradient(0, 14, 16, 0, 14, 175);
      glow.addColorStop(0, 'rgba(255,255,255,0.48)');
      glow.addColorStop(0.55, `${accent}44`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      target.fillStyle = glow;
      target.beginPath();
      target.arc(0, 14, 175, 0, Math.PI * 2);
      target.fill();

      // Subtle architectural pedestal
      target.fillStyle = 'rgba(255,255,255,0.22)';
      target.beginPath();
      target.ellipse(0, 88, 128, 30, 0, 0, Math.PI * 2);
      target.fill();
    } else {
      target.shadowColor = '#ffffff';
      target.shadowBlur = 14;
    }

    target.strokeStyle = isMask ? '#f0f0f0' : 'rgba(255,255,255,0.96)';
    target.fillStyle = isMask ? '#f0f0f0' : 'rgba(255,255,255,0.96)';
    target.lineWidth = 10;
    target.lineCap = 'round';
    target.lineJoin = 'round';

    if (icon === 'heart') {
      target.beginPath();
      target.moveTo(0, 58);
      target.bezierCurveTo(-84, 10, -84, -58, -36, -64);
      target.bezierCurveTo(-10, -68, 0, -38, 0, -32);
      target.bezierCurveTo(0, -38, 10, -68, 36, -64);
      target.bezierCurveTo(84, -58, 84, 10, 0, 58);
      target.closePath();
      target.fill();
    } else if (icon === 'shield') {
      target.beginPath();
      target.moveTo(0, -68);
      target.lineTo(62, -44);
      target.lineTo(62, 6);
      target.bezierCurveTo(62, 48, 0, 74, 0, 74);
      target.bezierCurveTo(0, 74, -62, 48, -62, 6);
      target.lineTo(-62, -44);
      target.closePath();
      target.stroke();
      target.beginPath();
      target.moveTo(0, -24);
      target.lineTo(0, 30);
      target.moveTo(-26, 3);
      target.lineTo(26, 3);
      target.stroke();
    } else if (icon === 'coins') {
      target.beginPath();
      target.moveTo(0, -68);
      target.lineTo(0, 68);
      target.stroke();
      target.beginPath();
      target.moveTo(34, -36);
      target.bezierCurveTo(34, -54, -34, -54, -34, -26);
      target.bezierCurveTo(-34, -4, 34, -4, 34, 24);
      target.bezierCurveTo(34, 54, -34, 54, -34, 34);
      target.stroke();
    } else if (icon === 'layers') {
      target.beginPath();
      target.moveTo(0, -64);
      target.lineTo(68, -14);
      target.lineTo(50, -14);
      target.lineTo(50, 54);
      target.lineTo(-50, 54);
      target.lineTo(-50, -14);
      target.lineTo(-68, -14);
      target.closePath();
      target.stroke();
      target.beginPath();
      target.roundRect(-18, 10, 36, 44, 6);
      target.stroke();
    } else if (icon === 'scales') {
      // Pillar & base
      target.beginPath();
      target.moveTo(0, -64);
      target.lineTo(0, 62);
      target.moveTo(-36, 62);
      target.lineTo(36, 62);
      target.stroke();
      // Beam
      target.beginPath();
      target.moveTo(-58, -36);
      target.lineTo(58, -36);
      target.stroke();
      // Left pan & strings
      target.lineWidth = 7;
      target.beginPath();
      target.moveTo(-48, -36);
      target.lineTo(-68, 16);
      target.lineTo(-28, 16);
      target.closePath();
      target.stroke();
      target.beginPath();
      target.arc(-48, 16, 22, 0, Math.PI, false);
      target.stroke();
      // Right pan & strings
      target.beginPath();
      target.moveTo(48, -36);
      target.lineTo(28, 16);
      target.lineTo(68, 16);
      target.closePath();
      target.stroke();
      target.beginPath();
      target.arc(48, 16, 22, 0, Math.PI, false);
      target.stroke();
      target.lineWidth = 10;
    } else {
      target.beginPath();
      target.roundRect(-64, -32, 128, 86, 18);
      target.stroke();
      target.beginPath();
      target.moveTo(-26, -32);
      target.lineTo(-26, -54);
      target.arcTo(-26, -64, -16, -64, 10);
      target.lineTo(16, -64);
      target.arcTo(26, -64, 26, -54, 10);
      target.lineTo(26, -32);
      target.stroke();
      target.beginPath();
      target.moveTo(-64, 8);
      target.lineTo(64, 8);
      target.stroke();
    }

    target.restore();
  };

  paintShape(ctx, false);
  if (maskCtx) {
    paintShape(maskCtx, true);
  }
}

interface RenderedCardTextures {
  colorTexture: THREE.CanvasTexture;
  textMaskTexture: THREE.CanvasTexture;
}

interface CardGlitterUniforms {
  uGlitterTime: { value: number };
  uGlitterFocus: { value: number };
  uCardSeed: { value: number };
  uPriorityBoost: { value: number };
  tTextMask: { value: THREE.Texture | null };
}

function attachCardTextGlitterShader(
  material: THREE.MeshStandardMaterial,
  initialMask: THREE.Texture | null,
  cardSeed: number,
  priorityBoost = 0,
): CardGlitterUniforms {
  const glitterUniforms: CardGlitterUniforms = {
    uGlitterTime: { value: 0 },
    uGlitterFocus: { value: 0 },
    uCardSeed: { value: cardSeed },
    uPriorityBoost: { value: priorityBoost },
    tTextMask: { value: initialMask },
  };
  material.userData.glitterUniforms = glitterUniforms;
  material.customProgramCacheKey = () => 'pa-card-text-glitter-v3';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlitterTime = glitterUniforms.uGlitterTime;
    shader.uniforms.uGlitterFocus = glitterUniforms.uGlitterFocus;
    shader.uniforms.uCardSeed = glitterUniforms.uCardSeed;
    shader.uniforms.uPriorityBoost = glitterUniforms.uPriorityBoost;
    shader.uniforms.tTextMask = glitterUniforms.tTextMask;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vCardTextUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCardTextUv = uv;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uGlitterTime;
uniform float uGlitterFocus;
uniform float uCardSeed;
uniform float uPriorityBoost;
uniform sampler2D tTextMask;
varying vec2 vCardTextUv;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float txtMask = texture2D(tTextMask, vCardTextUv).r;
float sweepCoord = vCardTextUv.x * 0.75 + (1.0 - vCardTextUv.y) * 0.62;
float sweepCenter = fract(uGlitterTime * 0.44 + uCardSeed * 0.19) * 2.4 - 0.6;
float sweepBand = exp(-pow((sweepCoord - sweepCenter) * 7.8, 2.0));
float sweepCenter2 = fract(uGlitterTime * 0.28 + uCardSeed * 0.41 + 0.5) * 2.4 - 0.6;
float sweepBand2 = exp(-pow(((1.0 - vCardTextUv.x) * 0.65 + (1.0 - vCardTextUv.y) * 0.65 - sweepCenter2) * 8.5, 2.0));

vec2 sparkGridFine = floor(vCardTextUv * vec2(260.0, 340.0));
float hashFine = fract(sin(dot(sparkGridFine, vec2(127.1, 311.7)) + uCardSeed * 19.3) * 43758.5453);
float twinkleFine = pow(max(0.0, sin(uGlitterTime * 5.6 + hashFine * 37.699)), 7.0);
float dustFine = twinkleFine * step(0.76, hashFine);

vec2 sparkGridMacro = floor(vCardTextUv * vec2(130.0, 175.0));
float hashMacro = fract(sin(dot(sparkGridMacro, vec2(269.5, 183.3)) + uCardSeed * 27.1) * 29431.7123);
float twinkleMacro = pow(max(0.0, cos(uGlitterTime * 4.2 + hashMacro * 25.132)), 9.0);
float dustMacro = twinkleMacro * step(0.84, hashMacro);

float gFocus = clamp(uGlitterFocus, 0.0, 2.2);
float focusLift = 0.24 + 0.26 * gFocus;
float glitterAmp = (sweepBand * 1.25 + sweepBand2 * 0.72 + dustFine * 1.95 + dustMacro * 1.55) * (0.68 + 0.85 * gFocus);
vec3 glitterTint = mix(vec3(0.86, 0.96, 1.0), vec3(1.0, 0.92, 0.62), hashFine);
float edgeDist = min(min(vCardTextUv.x, 1.0 - vCardTextUv.x), min(vCardTextUv.y, 1.0 - vCardTextUv.y));
float priorityRimGlow = uPriorityBoost * smoothstep(0.08, 0.0, edgeDist) * 0.65;
vec3 priorityFaceLift = vec3(1.0, 0.97, 0.88) * uPriorityBoost * (0.22 + sweepBand * 0.14);
totalEmissiveRadiance += glitterTint * txtMask * (focusLift + glitterAmp) * (1.0 + uPriorityBoost * 0.35) + priorityFaceLift + vec3(1.0, 0.94, 0.72) * priorityRimGlow;`,
      );
  };

  return glitterUniforms;
}

function inferCardCategoryLabel(
  card: EventCardItem,
  fallbackDomain?: PromptDomain,
): string {
  const direct = (card.category || '').trim();
  if (direct) return direct;
  if (card.icon === 'heart') return 'Love';
  if (card.icon === 'shield') return 'Health';
  if (card.icon === 'coins') return 'Finance';
  if (card.icon === 'layers') return 'Family';
  if (card.icon === 'briefcase') return 'Career';
  if (card.icon === 'scales') return 'Litigation';
  if (fallbackDomain) return WAITING_DOMAIN_META[fallbackDomain].label;
  return 'Highlight';
}

function renderCardFaceTexture(
  card: EventCardItem,
  index: number,
  maxAnisotropy: number,
  isDetailMode: boolean,
  fallbackPeriodLabel?: string,
  fallbackDomain?: PromptDomain,
): RenderedCardTextures {
  const isTopPriority = index < 2;
  const width = isDetailMode ? 1056 : 768;
  const height = isDetailMode ? 1408 : 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.fillStyle = '#000000';
  maskCtx.fillRect(0, 0, width, height);

  const palette = CARD_PALETTES[index % CARD_PALETTES.length];
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, palette.bgTop);
  grad.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (isTopPriority) {
    // Luminous radial glow halo on the top two highest-possibility priority cards
    const halo = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      width * 0.06,
      width * 0.5,
      height * 0.45,
      width * 0.72,
    );
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.58)');
    halo.addColorStop(0.55, 'rgba(255, 250, 224, 0.28)');
    halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    // Bright crisp luminous border inside the priority card face
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.lineWidth = Math.max(4, Math.round((width / 768) * 6));
    ctx.beginPath();
    ctx.roundRect(14, 14, width - 28, height - 28, Math.round((width / 768) * 28));
    ctx.stroke();
    ctx.restore();

    maskCtx.save();
    maskCtx.strokeStyle = '#ffffff';
    maskCtx.lineWidth = Math.max(4, Math.round((width / 768) * 6));
    maskCtx.beginPath();
    maskCtx.roundRect(14, 14, width - 28, height - 28, Math.round((width / 768) * 28));
    maskCtx.stroke();
    maskCtx.restore();
  }

  // Top & lower editorial focal scrim so text & glitter always stay razor-sharp with rich contrast
  const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.48);
  topScrim.addColorStop(0, isTopPriority ? 'rgba(15, 23, 42, 0.64)' : 'rgba(10, 16, 30, 0.56)');
  topScrim.addColorStop(0.65, isTopPriority ? 'rgba(15, 23, 42, 0.28)' : 'rgba(10, 16, 30, 0.24)');
  topScrim.addColorStop(1, 'rgba(10, 16, 30, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, height * 0.48);

  const sheen = ctx.createRadialGradient(
    width * 0.25,
    height * 0.14,
    20,
    width * 0.35,
    height * 0.25,
    width * 0.85,
  );
  sheen.addColorStop(0, isTopPriority ? 'rgba(255,255,255,0.44)' : 'rgba(255,255,255,0.22)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const scale = width / 768;
  const padX = 54 * scale;
  let cursorY = 54 * scale;

  const drawMaskedText = (
    text: string,
    x: number,
    y: number,
    font: string,
    fillStyle: string,
    align: CanvasTextAlign,
    baseline: CanvasTextBaseline,
    maxW?: number,
    maskIntensity = '#ffffff',
  ) => {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = fillStyle;
    ctx.shadowColor = 'rgba(8, 15, 30, 0.58)';
    ctx.shadowBlur = 14 * scale;
    if (maxW !== undefined) ctx.fillText(text, x, y, maxW);
    else ctx.fillText(text, x, y);
    ctx.restore();

    maskCtx.save();
    maskCtx.font = font;
    maskCtx.textAlign = align;
    maskCtx.textBaseline = baseline;
    maskCtx.fillStyle = maskIntensity;
    maskCtx.shadowColor = '#ffffff';
    maskCtx.shadowBlur = 9 * scale;
    if (maxW !== undefined) maskCtx.fillText(text, x, y, maxW);
    else maskCtx.fillText(text, x, y);
    maskCtx.restore();
  };

  // Category eyebrow (Love, Health, Career, Family, Finance) with crisp glow
  const catLabel = inferCardCategoryLabel(card, fallbackDomain).toUpperCase();
  drawMaskedText(
    catLabel,
    padX,
    cursorY,
    `800 ${Math.round(20 * scale)}px "DM Sans", system-ui, sans-serif`,
    '#fef3c7',
    'left',
    'top',
    width - padX * 2,
    '#ffffff',
  );
  cursorY += 32 * scale;

  // Title (editorial bold top-left with strong readability & full glitter mask)
  const titleFont = `700 ${Math.round((isDetailMode ? 45 : 44) * scale)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.font = titleFont;
  const titleLines = wrapLines(ctx, card.title, width - padX * 2, 3);
  for (const line of titleLines) {
    drawMaskedText(line, padX, cursorY, titleFont, '#ffffff', 'left', 'top', undefined, '#ffffff');
    cursorY += 52 * scale;
  }

  // Timing Period & Probability badges (glowing cleanly without horizontal squishing)
  cursorY += 12 * scale;
  const formattedFallbackPeriod = formatWaitingPeriodLabel(fallbackPeriodLabel);
  const whenStr =
    (card.when || card.dateRange || card.timeframe || '').trim() ||
    formattedFallbackPeriod ||
    'Upcoming window';
  const probStr = (card.probability || card.likelihood || '').trim();
  const maxContentW = width - padX * 2;
  const badgeFont = `700 ${Math.round((isDetailMode ? 21 : 20) * scale)}px "DM Sans", system-ui, sans-serif`;
  ctx.font = badgeFont;

  const padBadgeX = 18 * scale;
  const pillHeight = 42 * scale;
  const pillGap = 10 * scale;

  const drawGlowingBadge = (
    text: string,
    bx: number,
    by: number,
    bw: number,
    bgColor: string,
    borderColor: string,
    glowColor: string,
    textColor: string,
  ) => {
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2 * scale;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18 * scale;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, pillHeight, 14 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    maskCtx.save();
    maskCtx.strokeStyle = '#ffffff';
    maskCtx.lineWidth = 2.4 * scale;
    maskCtx.shadowColor = '#ffffff';
    maskCtx.shadowBlur = 8 * scale;
    maskCtx.beginPath();
    maskCtx.roundRect(bx, by, bw, pillHeight, 14 * scale);
    maskCtx.stroke();
    maskCtx.restore();

    drawMaskedText(
      text,
      bx + padBadgeX,
      by + pillHeight / 2,
      badgeFont,
      textColor,
      'left',
      'middle',
      bw - padBadgeX * 2,
      '#ffffff',
    );
  };

  const whenW = Math.min(maxContentW, ctx.measureText(whenStr).width + padBadgeX * 2);
  const probW = probStr ? Math.min(maxContentW, ctx.measureText(probStr).width + padBadgeX * 2) : 0;
  const fitSideBySide = probStr && whenW + pillGap + probW <= maxContentW;
  let badgeRowsUsed = 1;

  drawGlowingBadge(
    whenStr,
    padX,
    cursorY,
    whenW,
    'rgba(12, 20, 38, 0.72)',
    'rgba(253, 224, 71, 0.90)',
    'rgba(253, 224, 71, 0.78)',
    '#fef9c3',
  );

  if (probStr) {
    if (fitSideBySide) {
      drawGlowingBadge(
        probStr,
        padX + whenW + pillGap,
        cursorY,
        probW,
        'rgba(10, 22, 44, 0.72)',
        'rgba(125, 211, 252, 0.92)',
        'rgba(125, 211, 252, 0.80)',
        '#e0f2fe',
      );
    } else {
      badgeRowsUsed = 2;
      drawGlowingBadge(
        probStr,
        padX,
        cursorY + pillHeight + 8 * scale,
        probW,
        'rgba(10, 22, 44, 0.72)',
        'rgba(125, 211, 252, 0.92)',
        'rgba(125, 211, 252, 0.80)',
        '#e0f2fe',
      );
    }
  }

  // Center emblem illustration cleanly framed above the focal summary plaque (with glitter glow mask)
  const artworkCenterY =
    isDetailMode
      ? height * (titleLines.length >= 3 && badgeRowsUsed === 2 ? 0.485 : 0.455)
      : height * (titleLines.length >= 3 && badgeRowsUsed === 2 ? 0.545 : 0.52);
  const artworkScale = scale * (isDetailMode ? 0.88 : 0.85);
  ctx.save();
  ctx.translate(width / 2, artworkCenterY);
  ctx.scale(artworkScale, artworkScale);
  maskCtx.save();
  maskCtx.translate(width / 2, artworkCenterY);
  maskCtx.scale(artworkScale, artworkScale);
  drawDomainArtwork(ctx, card.icon, palette.accent, 0, 0, maskCtx);
  maskCtx.restore();
  ctx.restore();

  // Focused Text Plaque inside the Card (Summary card reading highlight with full glitter)
  const rawSummary = (card.summary || card.how || '').trim();
  if (rawSummary) {
    const summaryFont = `600 ${Math.round((isDetailMode ? 24 : 21) * scale)}px "DM Sans", system-ui, sans-serif`;
    ctx.font = summaryFont;
    const plaqueX = padX;
    const plaqueW = width - padX * 2;
    const innerPad = 24 * scale;
    const maxLines = isDetailMode ? 5 : 2;
    const summaryLines = wrapLines(ctx, rawSummary, plaqueW - innerPad * 2, maxLines);

    if (summaryLines.length > 0) {
      const lineStep = (isDetailMode ? 34 : 29) * scale;
      const headerHeight = isDetailMode ? 28 * scale : 0;
      const plaqueH = innerPad * 1.85 + headerHeight + summaryLines.length * lineStep;
      const plaqueY = (isDetailMode ? height - 154 * scale : height - 110 * scale) - plaqueH;

      // Frosted dark focal panel behind reading text so white glittering text pops on every card
      const plaqueGrad = ctx.createLinearGradient(0, plaqueY, 0, plaqueY + plaqueH);
      plaqueGrad.addColorStop(0, isDetailMode ? 'rgba(8, 15, 30, 0.62)' : 'rgba(8, 15, 30, 0.52)');
      plaqueGrad.addColorStop(1, isDetailMode ? 'rgba(8, 15, 30, 0.74)' : 'rgba(8, 15, 30, 0.62)');
      ctx.save();
      ctx.fillStyle = plaqueGrad;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 1.75 * scale;
      ctx.shadowColor = 'rgba(2, 6, 23, 0.36)';
      ctx.shadowBlur = 18 * scale;
      ctx.beginPath();
      ctx.roundRect(plaqueX, plaqueY, plaqueW, plaqueH, 20 * scale);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();

      let textY = plaqueY + innerPad * 0.9;
      if (isDetailMode) {
        drawMaskedText(
          'KEY FOCUS',
          plaqueX + innerPad,
          textY,
          `700 ${Math.round(16 * scale)}px "DM Sans", system-ui, sans-serif`,
          'rgba(224, 242, 254, 0.98)',
          'left',
          'top',
          undefined,
          '#e8e8e8',
        );
        textY += headerHeight;
      }

      for (const line of summaryLines) {
        drawMaskedText(
          line,
          plaqueX + innerPad,
          textY,
          summaryFont,
          '#ffffff',
          'left',
          'top',
          plaqueW - innerPad * 2,
          '#ffffff',
        );
        textY += lineStep;
      }
    }
  }

  if (isDetailMode) {
    drawMaskedText(
      'Tap card to view how it unfolds',
      width / 2,
      height - 102 * scale,
      `600 ${Math.round(22 * scale)}px "DM Sans", system-ui, sans-serif`,
      'rgba(255, 255, 255, 0.90)',
      'center',
      'middle',
      undefined,
      '#cccccc',
    );
  }

  // Bottom-right signature index marker "/01", "/02", "/03"
  const indexLabel = `/${String(index + 1).padStart(2, '0')}`;
  drawMaskedText(
    indexLabel,
    width - padX,
    height - 38 * scale,
    `700 ${Math.round(42 * scale)}px "JetBrains Mono", monospace`,
    'rgba(255, 255, 255, 0.96)',
    'right',
    'bottom',
  );

  const colorTexture = new THREE.CanvasTexture(canvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.anisotropy = maxAnisotropy;
  colorTexture.needsUpdate = true;

  const textMaskTexture = new THREE.CanvasTexture(maskCanvas);
  textMaskTexture.anisotropy = maxAnisotropy;
  textMaskTexture.needsUpdate = true;

  return { colorTexture, textMaskTexture };
}

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
        <DollarSign className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={2.5} />
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

  // Soft interior radial glow inside the crystal ball
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
    // Fable Emblem: Stylized open storybook / faceted diamond crest + golden star spark
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

    // Faceted open wings / book emblem
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

    // Center spine line
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 54);
    ctx.stroke();

    // Rising radiant Fable star above crest
    const starGrad = ctx.createLinearGradient(cx - 30, cy - 92, cx + 30, cy - 28);
    starGrad.addColorStop(0, '#ffffff');
    starGrad.addColorStop(1, '#fde047');
    ctx.fillStyle = starGrad;
    drawFourPointSparkle(ctx, cx, cy - 64, 34, 0.24);
    ctx.fill();
  } else {
    // Gemini Emblem: Iconic curved 4-point star sparkle + twin starlet
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

    // Companion small top-right star
    ctx.fillStyle = '#e0f2fe';
    drawFourPointSparkle(ctx, cx + 64, cy - 58, 30, 0.22);
    ctx.fill();
  }
  ctx.restore();

  // Small crisp letters inside the center of the ball showing picked adapter
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

const SPARK_BURST_OFFSETS = [
  { x: -112, y: -58, delay: 0.03, size: 16, gold: true },
  { x: 118, y: -52, delay: 0.05, size: 14, gold: false },
  { x: -132, y: 18, delay: 0.07, size: 13, gold: false },
  { x: 136, y: 24, delay: 0.06, size: 17, gold: true },
  { x: -84, y: 88, delay: 0.08, size: 15, gold: true },
  { x: 92, y: 84, delay: 0.04, size: 13, gold: false },
  { x: 0, y: -116, delay: 0.02, size: 18, gold: true },
  { x: -46, y: -96, delay: 0.09, size: 11, gold: false },
  { x: 52, y: -92, delay: 0.07, size: 12, gold: true },
  { x: 0, y: 112, delay: 0.08, size: 14, gold: false },
];

function Stage2ProviderCornerIcon({ provider }: { provider: 'gemini' | 'fable' }) {
  const isFable = provider === 'fable';
  const label = isFable ? 'Prepared by Fable' : 'Prepared by Gemini';
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white/94 backdrop-blur-sm shrink-0 ${
        isFable
          ? 'border-amber-300/90 shadow-[0_6px_18px_-4px_rgba(217,119,6,0.34)]'
          : 'border-sky-300/90 shadow-[0_6px_18px_-4px_rgba(14,165,233,0.34)]'
      }`}
    >
      {isFable ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <defs>
            <linearGradient id="pa-fable-badge-g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="55%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <path
            d="M12 10.5C9.8 8.3 6.2 8.6 5 10.4V17.6C6.8 16.4 9.7 16.7 12 18.8C14.3 16.7 17.2 16.4 19 17.6V10.4C17.8 8.6 14.2 8.3 12 10.5Z"
            fill="url(#pa-fable-badge-g)"
          />
          <path
            d="M12 2.4L13.1 5.6L16.3 6.7L13.1 7.8L12 11L10.9 7.8L7.7 6.7L10.9 5.6L12 2.4Z"
            fill="#f59e0b"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <defs>
            <linearGradient id="pa-gemini-badge-g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <path
            d="M11 3C11.9 7.6 14.4 10.1 19 11C14.4 11.9 11.9 14.4 11 19C10.1 14.4 7.6 11.9 3 11C7.6 10.1 10.1 7.6 11 3Z"
            fill="url(#pa-gemini-badge-g)"
          />
          <path
            d="M18.2 3.2C18.5 4.8 19.3 5.6 20.9 5.9C19.3 6.2 18.5 7 18.2 8.6C17.9 7 17.1 6.2 15.5 5.9C17.1 5.6 17.9 4.8 18.2 3.2Z"
            fill="#0ea5e9"
          />
        </svg>
      )}
    </span>
  );
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
      {/* Classic Windows speaker cone & cabinet */}
      <path
        d="M3.5 9.5H7.2L12.5 5.2V18.8L7.2 14.5H3.5C2.95 14.5 2.5 14.05 2.5 13.5V10.5C2.5 9.95 2.95 9.5 3.5 9.5Z"
        fill="currentColor"
      />
      {/* Sound wave arcs */}
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
}: ProductionCards3DProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [isAnswerShrunk, setIsAnswerShrunk] = useState(false);
  const [shrunkPos, setShrunkPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingChip, setIsDraggingChip] = useState(false);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chipDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const [scrollTick, setScrollTick] = useState(0);

  const selectedCard = selectedIndex !== null ? cards[selectedIndex] ?? null : null;

  useEffect(() => {
    setSelectedIndex(null);
    setIsReasoningOpen(false);
    setIsAnswerShrunk(false);
    setShrunkPos(null);
    setIsFollowUpOpen(false);
    setFollowUpDraft('');
    setFollowUpError(null);
  }, [cards]);

  useEffect(() => {
    if (!canAskFollowUp) {
      setIsFollowUpOpen(false);
      setFollowUpError(null);
    }
  }, [canAskFollowUp]);

  useEffect(() => {
    if (!isFollowUpOpen) return;
    const t = window.setTimeout(() => followUpInputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [isFollowUpOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFollowUpOpen) {
          setIsFollowUpOpen(false);
          setFollowUpError(null);
        } else if (isReasoningOpen) {
          setIsReasoningOpen(false);
        } else if (selectedIndex !== null) {
          setSelectedIndex(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFollowUpOpen, isReasoningOpen, selectedIndex]);

  const interactionRef = useRef({
    selectedIndex,
    isWaitingForReply,
    providerAdapter,
    isDarkTheme,
    scrollTarget: 0,
    onSelectCard: (idx: number) => {
      setSelectedIndex(idx);
      setIsReasoningOpen(false);
    },
    onToggleReasoning: () => {
      setIsReasoningOpen((prev) => !prev);
    },
    onCloseDetail: () => {
      setIsReasoningOpen(false);
      setSelectedIndex(null);
    },
  });
  interactionRef.current.selectedIndex = selectedIndex;
  interactionRef.current.isWaitingForReply = isWaitingForReply;
  interactionRef.current.providerAdapter = providerAdapter;
  interactionRef.current.isDarkTheme = isDarkTheme;

  const shiftScroll = (delta: number) => {
    const maxOffset = Math.max(0, cards.length - 1);
    interactionRef.current.scrollTarget = THREE.MathUtils.clamp(
      interactionRef.current.scrollTarget + delta,
      0,
      maxOffset,
    );
    setScrollTick((t) => t + 1);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const disposables: Array<{ dispose: () => void }> = [];

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
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
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const galleryBgLightColor = new THREE.Color('#f2f1ed');
    const galleryBgDarkColor = new THREE.Color('#091122');
    const detailBgDarkColor = new THREE.Color('#04060b');
    const detailBgLightColor = new THREE.Color('#e6eff8');
    scene.background = (interactionRef.current.isDarkTheme
      ? galleryBgDarkColor
      : galleryBgLightColor
    ).clone();

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    disposables.push(envRT, pmremGenerator);

    const camera = new THREE.PerspectiveCamera(
      38,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 0.15, 8.6);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
    keyLight.position.set(5, 7, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xbae6fd, 1.3);
    rimLight.position.set(-6, 5, -4);
    scene.add(rimLight);
    const topSpecularLight = new THREE.SpotLight(0xffffff, 3.2, 22, Math.PI / 4, 0.65);
    topSpecularLight.position.set(0, 6.2, 3.6);
    scene.add(topSpecularLight);

    // 1. Stage 2 Thinking Crystal Sphere (Bigger rotating ball with jumping/bubbling Gemini & Fable graphics inside)
    const thinkingGroup = new THREE.Group();

    const innerCoreGeo = new THREE.SphereGeometry(0.68, 32, 32);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const innerCoreAura = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    innerCoreAura.renderOrder = 1;
    thinkingGroup.add(innerCoreAura);

    const outerGlassGeo = new THREE.SphereGeometry(1.18, 48, 48);
    const outerGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      emissive: 0x0284c7,
      emissiveIntensity: 0.22,
      metalness: 0.12,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const outerGlassOrb = new THREE.Mesh(outerGlassGeo, outerGlassMat);
    outerGlassOrb.renderOrder = 4;
    thinkingGroup.add(outerGlassOrb);

    const cageGeo = new THREE.IcosahedronGeometry(1.2, 2);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const geodesicCage = new THREE.Mesh(cageGeo, cageMat);
    geodesicCage.renderOrder = 5;
    thinkingGroup.add(geodesicCage);

    const orbitRingGeo1 = new THREE.TorusGeometry(1.5, 0.028, 16, 80);
    const orbitRingGeo2 = new THREE.TorusGeometry(1.72, 0.02, 16, 80);
    const orbitRingMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.95,
      metalness: 0.86,
      roughness: 0.16,
    });
    const orbitRing1 = new THREE.Mesh(orbitRingGeo1, orbitRingMat);
    const orbitRing2 = new THREE.Mesh(orbitRingGeo2, orbitRingMat);
    orbitRing1.rotation.x = Math.PI * 0.35;
    orbitRing2.rotation.y = Math.PI * 0.35;
    thinkingGroup.add(orbitRing1, orbitRing2);

    // Inner jumping & bubbling provider adapter graphics (Gemini / Fable)
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
    const centerAdapterSprite = new THREE.Sprite(geminiSpriteMat);
    centerAdapterSprite.scale.set(1.26, 1.26, 1);
    centerAdapterSprite.renderOrder = 2;
    thinkingGroup.add(centerAdapterSprite);

    const geminiMicroTex = createMicroAdapterSymbolTexture('gemini', maxAnisotropy);
    const fableMicroTex = createMicroAdapterSymbolTexture('fable', maxAnisotropy);
    const geminiMicroMat = new THREE.SpriteMaterial({
      map: geminiMicroTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const fableMicroMat = new THREE.SpriteMaterial({
      map: fableMicroTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    const bubbleGeo = new THREE.SphereGeometry(0.068, 16, 16);
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.72,
      roughness: 0.1,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    interface InnerBubbleEntry {
      mesh: THREE.Mesh;
      phase: number;
      speed: number;
      orbitR: number;
      angleOffset: number;
      baseScale: number;
    }
    const innerBubbles: InnerBubbleEntry[] = Array.from({ length: 14 }, (_, idx) => {
      const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
      mesh.renderOrder = 2;
      thinkingGroup.add(mesh);
      return {
        mesh,
        phase: idx / 14,
        speed: 0.24 + (idx % 5) * 0.055,
        orbitR: 0.28 + (idx % 4) * 0.17,
        angleOffset: idx * 2.39996,
        baseScale: 0.62 + (idx % 4) * 0.28,
      };
    });

    interface InnerMicroSpriteEntry {
      sprite: THREE.Sprite;
      phase: number;
      speed: number;
      orbitR: number;
      angleOffset: number;
      baseScale: number;
    }
    const innerMicroSymbols: InnerMicroSpriteEntry[] = Array.from({ length: 6 }, (_, idx) => {
      const sprite = new THREE.Sprite(geminiMicroMat);
      sprite.renderOrder = 2;
      thinkingGroup.add(sprite);
      return {
        sprite,
        phase: idx / 6,
        speed: 0.2 + (idx % 3) * 0.06,
        orbitR: 0.42 + (idx % 3) * 0.15,
        angleOffset: idx * 1.047 + 0.4,
        baseScale: 0.22 + (idx % 3) * 0.05,
      };
    });

    thinkingGroup.position.set(0, -0.06, 0);
    scene.add(thinkingGroup);
    disposables.push(
      innerCoreGeo,
      innerCoreMat,
      outerGlassGeo,
      outerGlassMat,
      cageGeo,
      cageMat,
      orbitRingGeo1,
      orbitRingGeo2,
      orbitRingMat,
      geminiSpriteTex,
      fableSpriteTex,
      geminiSpriteMat,
      fableSpriteMat,
      geminiMicroTex,
      fableMicroTex,
      geminiMicroMat,
      fableMicroMat,
      bubbleGeo,
      bubbleMat,
    );

    // 2. Gallery 3D Fanned Cards Group (Screenshot 1)
    const galleryGroup = new THREE.Group();
    scene.add(galleryGroup);

    const cardWidth = 2.52;
    const cardHeight = 3.36;
    const cardShape = createRoundedRectShape(cardWidth, cardHeight, 0.2);
    const slabGeo = new THREE.ExtrudeGeometry(cardShape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 4,
    });
    slabGeo.center();
    const rimMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      metalness: 0.78,
      roughness: 0.22,
      clearcoat: 0.8,
    });
    const priorityRimMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff8dc,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      metalness: 0.86,
      roughness: 0.14,
      clearcoat: 1.0,
    });
    const facePlaneGeo = new THREE.ShapeGeometry(createRoundedRectShape(cardWidth - 0.02, cardHeight - 0.02, 0.18));
    disposables.push(slabGeo, rimMetalMat, priorityRimMetalMat, facePlaneGeo);

    // Fix UVs on facePlaneGeo to 0..1 cleanly so CanvasTexture maps edge-to-edge
    const uvAttr = facePlaneGeo.attributes.uv;
    const posAttr = facePlaneGeo.attributes.position;
    for (let i = 0; i < uvAttr.count; i += 1) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      uvAttr.setXY(
        i,
        (px + (cardWidth - 0.02) / 2) / (cardWidth - 0.02),
        (py + (cardHeight - 0.02) / 2) / (cardHeight - 0.02),
      );
    }
    uvAttr.needsUpdate = true;

    interface GalleryCardMeshEntry {
      index: number;
      group: THREE.Group;
      hitMesh: THREE.Mesh;
      glitterUniforms: CardGlitterUniforms;
      hoverLerp: number;
    }

    const galleryCards: GalleryCardMeshEntry[] = cards.map((card, idx) => {
      const isTopPriority = idx < 2;
      const group = new THREE.Group();
      const slabMesh = new THREE.Mesh(slabGeo, isTopPriority ? priorityRimMetalMat : rimMetalMat);
      group.add(slabMesh);

      const { colorTexture, textMaskTexture } = renderCardFaceTexture(
        card,
        idx,
        maxAnisotropy,
        false,
        periodLabel,
        domain,
      );
      const faceMat = new THREE.MeshStandardMaterial({
        map: colorTexture,
        roughness: isTopPriority ? 0.22 : 0.36,
        metalness: isTopPriority ? 0.1 : 0.06,
      });
      const glitterUniforms = attachCardTextGlitterShader(
        faceMat,
        textMaskTexture,
        idx + 1,
        isTopPriority ? 1.0 : 0.0,
      );
      const faceMesh = new THREE.Mesh(facePlaneGeo, faceMat);
      faceMesh.position.z = 0.056;
      faceMesh.userData = { cardIndex: idx };
      group.add(faceMesh);

      galleryGroup.add(group);
      disposables.push(colorTexture, textMaskTexture, faceMat);

      return {
        index: idx,
        group,
        hitMesh: faceMesh,
        glitterUniforms,
        hoverLerp: 0,
      };
    });

    // 3. Full-Screen Expanded 3D Card Group (same card opened large, no phone silhouette)
    const detailCardGroup = new THREE.Group();
    const detailCardW = 3.12;
    const detailCardH = 4.16;
    const detailSlabShape = createRoundedRectShape(detailCardW, detailCardH, 0.24);
    const detailSlabGeo = new THREE.ExtrudeGeometry(detailSlabShape, {
      depth: 0.075,
      bevelEnabled: true,
      bevelThickness: 0.032,
      bevelSize: 0.032,
      bevelSegments: 5,
    });
    detailSlabGeo.center();

    // Brushed metallic chamfered card perimeter edge
    const chromeBezelMat = new THREE.MeshPhysicalMaterial({
      color: 0xdce2ea,
      metalness: 0.88,
      roughness: 0.16,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.5,
    });
    const detailSlabMesh = new THREE.Mesh(detailSlabGeo, chromeBezelMat);
    detailCardGroup.add(detailSlabMesh);

    const detailFaceW = detailCardW - 0.024;
    const detailFaceH = detailCardH - 0.024;
    const detailFaceGeo = new THREE.ShapeGeometry(
      createRoundedRectShape(detailFaceW, detailFaceH, 0.22),
    );
    const dUv = detailFaceGeo.attributes.uv;
    const dPos = detailFaceGeo.attributes.position;
    for (let i = 0; i < dUv.count; i += 1) {
      dUv.setXY(
        i,
        (dPos.getX(i) + detailFaceW / 2) / detailFaceW,
        (dPos.getY(i) + detailFaceH / 2) / detailFaceH,
      );
    }
    dUv.needsUpdate = true;

    const detailEntries = cards.map((card, idx) => {
      const rendered = renderCardFaceTexture(
        card,
        idx,
        maxAnisotropy,
        true,
        periodLabel,
        domain,
      );
      disposables.push(rendered.colorTexture, rendered.textMaskTexture);
      return rendered;
    });

    const detailFaceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: detailEntries[0]?.colorTexture ?? null,
      roughness: 0.34,
      metalness: 0.06,
    });
    const detailGlitterUniforms =
      detailEntries.length > 0
        ? attachCardTextGlitterShader(detailFaceMat, detailEntries[0].textMaskTexture, 1, 1.0)
        : null;
    const detailFaceMesh = new THREE.Mesh(detailFaceGeo, detailFaceMat);
    detailFaceMesh.position.z = 0.071;
    detailFaceMesh.userData = { isDetailCard: true };
    detailCardGroup.add(detailFaceMesh);

    detailCardGroup.visible = false;
    scene.add(detailCardGroup);
    disposables.push(
      detailSlabGeo,
      chromeBezelMat,
      detailFaceGeo,
      detailFaceMat,
    );

    // Pointer & Scroll Controls
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerNormX = 0;
    let pointerNormY = 0;
    let hoveredCardIdx: number | null = null;
    let isPointerDown = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let scrollAtDragStart = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      pointerNormX = pointerNdc.x;
      pointerNormY = pointerNdc.y;
    };

    const onWheel = (e: WheelEvent) => {
      if (interactionRef.current.selectedIndex !== null || interactionRef.current.isWaitingForReply) {
        return;
      }
      e.preventDefault();
      const maxOffset = Math.max(0, cards.length - 1);
      const delta = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 0.0028;
      interactionRef.current.scrollTarget = THREE.MathUtils.clamp(
        interactionRef.current.scrollTarget + delta,
        0,
        maxOffset,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isPointerDown = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      scrollAtDragStart = interactionRef.current.scrollTarget;
      updateNdc(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      updateNdc(e.clientX, e.clientY);

      if (
        isPointerDown &&
        interactionRef.current.selectedIndex === null &&
        !interactionRef.current.isWaitingForReply
      ) {
        const dx = e.clientX - dragStartX;
        const maxOffset = Math.max(0, cards.length - 1);
        interactionRef.current.scrollTarget = THREE.MathUtils.clamp(
          scrollAtDragStart - dx * 0.0045,
          0,
          maxOffset,
        );
      }

      if (interactionRef.current.isWaitingForReply) {
        renderer.domElement.style.cursor = 'default';
        return;
      }

      raycaster.setFromCamera(pointerNdc, camera);
      if (interactionRef.current.selectedIndex !== null) {
        const hits = raycaster.intersectObjects(detailCardGroup.children, false);
        renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
        return;
      }

      const hits = raycaster.intersectObjects(
        galleryCards.map((c) => c.hitMesh),
        false,
      );
      hoveredCardIdx = hits.length > 0 ? (hits[0].object.userData.cardIndex as number) : null;
      renderer.domElement.style.cursor = hoveredCardIdx !== null ? 'pointer' : 'grab';
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      const moveDist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
      if (moveDist > 8 || interactionRef.current.isWaitingForReply) return;

      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);

      if (interactionRef.current.selectedIndex !== null) {
        const hits = raycaster.intersectObjects(detailCardGroup.children, false);
        if (hits.length > 0) {
          interactionRef.current.onToggleReasoning();
        } else {
          interactionRef.current.onCloseDetail();
        }
        return;
      }

      const hits = raycaster.intersectObjects(
        galleryCards.map((c) => c.hitMesh),
        false,
      );
      if (hits.length > 0) {
        const idx = hits[0].object.userData.cardIndex as number;
        interactionRef.current.onSelectCard(idx);
      }
    };

    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

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
    let currentScroll = 0;
    let detailBlend = 0;
    let detailArrivalPulse = 0;
    let galleryArrivalPulse = 1.65;
    let wasWaiting = interactionRef.current.isWaitingForReply;
    let lastActiveDetailTexIdx = -1;
    let frameInterval = isSoftwareGl ? 1000 / 30 : 0;
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

      const isWait = interactionRef.current.isWaitingForReply;
      if (wasWaiting && !isWait) {
        galleryArrivalPulse = 1.85;
      }
      wasWaiting = isWait;

      const detailIdx = interactionRef.current.selectedIndex;
      const inDetail = !isWait && detailIdx !== null;

      thinkingGroup.visible = isWait;
      galleryGroup.visible = !isWait && detailBlend < 0.96;
      detailCardGroup.visible = !isWait && detailBlend > 0.04;

      detailBlend = THREE.MathUtils.damp(detailBlend, inDetail ? 1 : 0, 7.5, dt);
      detailArrivalPulse = THREE.MathUtils.damp(detailArrivalPulse, 0, 2.2, dt);
      galleryArrivalPulse = THREE.MathUtils.damp(galleryArrivalPulse, 0, 1.15, dt);

      // Background color smoothly blends according to Dark/Light theme and detail focus
      if (scene.background instanceof THREE.Color) {
        const darkMode = interactionRef.current.isDarkTheme;
        const bgTarget = isWait || inDetail
          ? darkMode
            ? detailBgDarkColor
            : detailBgLightColor
          : darkMode
            ? galleryBgDarkColor
            : galleryBgLightColor;
        scene.background.lerp(bgTarget, Math.min(1, dt * 8));
      }

      if (isWait) {
        const isFable = interactionRef.current.providerAdapter === 'fable';
        const viewportW = mount?.clientWidth || window.innerWidth;
        const responsiveSphereScale = viewportW < 560 ? 0.84 : 1.04;
        thinkingGroup.scale.setScalar(responsiveSphereScale);
        thinkingGroup.position.y = -0.06 + Math.sin(elapsed * 1.9) * 0.05;

        // Swap crisp adapter emblem & subtle sphere palette inside the rotating ball
        centerAdapterSprite.material = isFable ? fableSpriteMat : geminiSpriteMat;
        innerCoreMat.color.setHex(isFable ? 0xc084fc : 0x0ea5e9);
        outerGlassMat.color.setHex(isFable ? 0xf5d0fe : 0x7dd3fc);
        outerGlassMat.emissive.setHex(isFable ? 0x9333ea : 0x0284c7);
        cageMat.color.setHex(isFable ? 0xfde047 : 0xbae6fd);
        orbitRingMat.color.setHex(isFable ? 0xf5d0fe : 0x7dd3fc);
        orbitRingMat.emissive.setHex(isFable ? 0xd946ef : 0x38bdf8);
        bubbleMat.color.setHex(isFable ? 0xfef08a : 0xe0f2fe);
        bubbleMat.emissive.setHex(isFable ? 0xe879f9 : 0x38bdf8);

        // Rotate the larger 3D outer crystal sphere, geodesic lattice, and rings
        outerGlassOrb.rotation.y = elapsed * 0.62;
        outerGlassOrb.rotation.x = elapsed * 0.34;
        geodesicCage.rotation.y = -elapsed * 0.48;
        geodesicCage.rotation.z = elapsed * 0.28;
        orbitRing1.rotation.z = elapsed * 1.25;
        orbitRing1.rotation.y = elapsed * 0.45;
        orbitRing2.rotation.x = elapsed * 0.98;
        orbitRing2.rotation.z = -elapsed * 0.4;

        // Subtle breathing aura core
        const auraPulse = 1 + Math.sin(elapsed * 3.0) * 0.1;
        innerCoreAura.scale.setScalar(auraPulse);

        // Jumping & gently pulsing adapter emblem (Gemini / Fable) inside the sphere
        const jumpWave = Math.abs(Math.sin(elapsed * 3.2));
        centerAdapterSprite.position.set(
          Math.sin(elapsed * 1.4) * 0.04,
          -0.1 + jumpWave * 0.22,
          0.12,
        );
        const jumpScale = 1.24 + Math.sin(elapsed * 6.4) * 0.06;
        centerAdapterSprite.scale.set(jumpScale, jumpScale, 1);

        // Bubbling 3D spheres rising & swirling inside the spinning crystal ball
        for (const b of innerBubbles) {
          const cycle = (elapsed * b.speed + b.phase) % 1;
          const y = -0.82 + cycle * 1.64;
          const radialEnvelope = Math.sqrt(Math.max(0.08, 1 - y * y * 1.15));
          const r = b.orbitR * radialEnvelope;
          const theta = b.angleOffset + elapsed * 1.65 + cycle * Math.PI * 1.6;
          b.mesh.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
          const fadeScale = Math.sin(cycle * Math.PI);
          b.mesh.scale.setScalar(Math.max(0.01, b.baseScale * fadeScale));
        }

        // Bubbling mini adapter graphical sparkles inside the ball
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
      } else {
        // Flying bubble scroll physics on perspective rail
        const prevScroll = currentScroll;
        currentScroll = THREE.MathUtils.damp(
          currentScroll,
          interactionRef.current.scrollTarget,
          6.5,
          dt,
        );
        const scrollVel = (currentScroll - prevScroll) / Math.max(0.001, dt);

        // Shift fan slightly downward when Answer bubble appears on top
        galleryGroup.position.y = -0.58 - detailBlend * 1.8;

        for (let i = 0; i < galleryCards.length; i += 1) {
          const entry = galleryCards[i];
          const rel = i - currentScroll;
          const isHovered = hoveredCardIdx === i && !inDetail;
          entry.hoverLerp = THREE.MathUtils.damp(entry.hoverLerp, isHovered ? 1 : 0, 10, dt);

          // Perspective diagonal spacing (front-right -> receding left-back)
          const posX = 2.05 - rel * 2.22;
          const posZ = 0.55 - rel * 1.38 + entry.hoverLerp * 0.35;
          const floatWave = Math.sin(elapsed * 1.55 + i * 0.9) * 0.11;
          const posY = rel * 0.12 + floatWave + entry.hoverLerp * 0.18;

          entry.group.position.set(posX, posY, posZ);
          entry.group.rotation.y = -0.44 + entry.hoverLerp * 0.14;
          entry.group.rotation.z = THREE.MathUtils.clamp(-scrollVel * 0.025, -0.14, 0.14);

          const scaleFactor =
            THREE.MathUtils.clamp(1.06 - Math.abs(rel) * 0.05, 0.72, 1.1) +
            entry.hoverLerp * 0.06;
          entry.group.scale.setScalar(scaleFactor);
          entry.group.visible = posZ > -10 && posX > -9 && posX < 9;

          // Animate vivid multi-layer glitter across ALL gallery cards (strongest on reveal & hover)
          const frontFocus = Math.max(0, 1 - Math.abs(rel) * 0.72);
          entry.glitterUniforms.uGlitterTime.value = elapsed;
          entry.glitterUniforms.uGlitterFocus.value = Math.min(
            2.2,
            0.95 + frontFocus * 0.55 + entry.hoverLerp * 0.85 + galleryArrivalPulse,
          );
        }

        // Expanded 3D Card Showcase
        if (detailIdx !== null && detailEntries[detailIdx] && lastActiveDetailTexIdx !== detailIdx) {
          lastActiveDetailTexIdx = detailIdx;
          detailFaceMat.map = detailEntries[detailIdx].colorTexture;
          detailFaceMat.needsUpdate = true;
          if (detailGlitterUniforms) {
            detailGlitterUniforms.tTextMask.value = detailEntries[detailIdx].textMaskTexture;
            detailGlitterUniforms.uCardSeed.value = detailIdx + 1;
            detailGlitterUniforms.uPriorityBoost.value = detailIdx < 2 ? 1.0 : 0.0;
          }
          detailArrivalPulse = 2.25;
        }
        if (detailIdx === null) {
          lastActiveDetailTexIdx = -1;
        }

        if (detailGlitterUniforms) {
          detailGlitterUniforms.uGlitterTime.value = elapsed;
          detailGlitterUniforms.uGlitterFocus.value = Math.min(
            2.2,
            detailBlend * 1.0 + detailArrivalPulse * 0.85,
          );
        }

        const scaleIn = THREE.MathUtils.lerp(0.68, 1.0, detailBlend);
        detailCardGroup.scale.setScalar(scaleIn);
        detailCardGroup.position.set(
          0,
          THREE.MathUtils.lerp(-1.4, -0.05, detailBlend),
          THREE.MathUtils.lerp(-3, 2.25, detailBlend),
        );
        // Subtle tactile 3D card tilt tracking pointer
        detailCardGroup.rotation.y = THREE.MathUtils.damp(
          detailCardGroup.rotation.y,
          pointerNormX * 0.14,
          6,
          dt,
        );
        detailCardGroup.rotation.x = THREE.MathUtils.damp(
          detailCardGroup.rotation.x,
          -pointerNormY * 0.1 + 0.03,
          6,
          dt,
        );
      }

      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [cards, domain, periodLabel]);

  const answerText = readOutSections?.answer?.trim() || '';
  const hasAnswer = Boolean(answerText);
  const monthlySummaryText =
    readOutSections?.summary?.trim() || readOutSections?.answer?.trim() || '';

  const selectedFlashCategory = selectedCard
    ? inferCardCategoryLabel(selectedCard, domain)
    : '';
  const selectedFlashPeriod = selectedCard
    ? (selectedCard.when || selectedCard.dateRange || selectedCard.timeframe || '').trim() ||
      formatWaitingPeriodLabel(periodLabel)
    : '';
  const selectedFlashProbability = selectedCard
    ? (selectedCard.probability || selectedCard.likelihood || '').trim()
    : '';

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
    setIsReasoningOpen(false);
    setSelectedIndex(null);
    onStartNewThread();
  };

  const domainShortLabel = domain ? getPromptDomainShortLabel(domain) : 'Thread';
  const formattedPeriodLabel = periodLabel ? formatWaitingPeriodLabel(periodLabel) : '';

  const errorUi = useMemo(() => {
    if (!errorDetail) return null;
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-slate-950/45 backdrop-blur-xs">
        <div className="fluent-3d-popup max-w-md w-full rounded-[28px] border border-rose-300/85 p-6 text-slate-900 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <WhatsAppSymbol className="w-5 h-5" />
            <span>What&apos;s up</span>
          </div>
          <p className="text-sm font-medium text-slate-900">
            Try &quot;What&apos;s up&quot; little later ..
          </p>
          <p className="text-xs text-rose-700/90 break-words">{errorDetail}</p>
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-white cursor-pointer"
            >
              <span>New Thread</span>
            </button>
          </div>
        </div>
      </div>
    );
  }, [errorDetail, onRetry, onStartNewThread]);

  return (
    <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden select-none">
      {/* Real Three.js 3D Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Stage 2: Waiting / Rounding Globe Overlay */}
      {isWaitingForReply && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-between py-10 px-4">
          <div className="text-center space-y-3 flex flex-col items-center">
            {(domain || periodLabel) && (
              <div className="inline-flex items-center justify-center gap-2.5">
                {domain && <Stage2DomainEmblem domain={domain} />}
                {periodLabel && (
                  <span
                    className={`text-xs sm:text-sm font-bold tracking-[0.16em] uppercase tabular-nums ${
                      isDarkTheme ? 'text-sky-300' : 'text-sky-700'
                    }`}
                  >
                    {formatWaitingPeriodLabel(periodLabel)}
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
              className="fluent-3d-popup-pill inline-flex h-10 w-10 items-center justify-center rounded-full text-rose-600 hover:text-rose-500 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      )}

      {/* Error State Overlay */}
      {!isWaitingForReply && errorUi}

      {/* Top-Right Small Round Provider Icon Hint + Optional Windows Speaker Icon Below */}
      {!isWaitingForReply && !errorDetail && (
        <div className="pointer-events-none absolute top-3.5 right-4 sm:right-6 z-20 flex flex-col items-center gap-2">
          <div className="pointer-events-auto">
            <Stage2ProviderCornerIcon provider={providerAdapter} />
          </div>
          {isSpeakerEnabled && Boolean(monthlySummaryText) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSpeakSummary?.();
              }}
              aria-label={isSpeakingSummary ? 'Stop reading monthly summary' : 'Read monthly summary'}
              aria-pressed={isSpeakingSummary}
              title={isSpeakingSummary ? 'Stop reading monthly summary' : 'Read monthly summary aloud'}
              className={`pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all cursor-pointer shrink-0 ${
                isSpeakingSummary
                  ? 'border-sky-400 bg-sky-500 text-white shadow-[0_0_20px_rgba(14,165,233,0.65)] animate-pulse'
                  : 'fluent-3d-popup-pill text-slate-700 hover:text-sky-600'
              }`}
            >
              <WindowsSpeakerIcon active={isSpeakingSummary} className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Gallery Mode Overlays: Top Floating Answer Bubble + Scroll Arrows + Follow-up */}
      {!isWaitingForReply && !errorDetail && selectedIndex === null && (
        <>
          {/* Floating Fluent Transparent White 3D Answer Bubble */}
          {hasAnswer && (
            <>
              {isAnswerShrunk ? (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    const stageEl = stageRef.current;
                    if (!stageEl) return;
                    const stageRect = stageEl.getBoundingClientRect();
                    const btnRect = e.currentTarget.getBoundingClientRect();
                    chipDragRef.current = {
                      pointerId: e.pointerId,
                      startX: e.clientX,
                      startY: e.clientY,
                      originLeft: btnRect.left - stageRect.left,
                      originTop: btnRect.top - stageRect.top,
                      width: btnRect.width,
                      height: btnRect.height,
                      moved: false,
                    };
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const drag = chipDragRef.current;
                    const stageEl = stageRef.current;
                    if (!drag || drag.pointerId !== e.pointerId || !stageEl) return;
                    const dx = e.clientX - drag.startX;
                    const dy = e.clientY - drag.startY;
                    if (!drag.moved && Math.hypot(dx, dy) > 4) {
                      drag.moved = true;
                      setIsDraggingChip(true);
                    }
                    if (drag.moved) {
                      const stageRect = stageEl.getBoundingClientRect();
                      const maxX = Math.max(8, stageRect.width - drag.width - 8);
                      const maxY = Math.max(8, stageRect.height - drag.height - 8);
                      setShrunkPos({
                        x: Math.min(maxX, Math.max(8, drag.originLeft + dx)),
                        y: Math.min(maxY, Math.max(8, drag.originTop + dy)),
                      });
                    }
                  }}
                  onPointerUp={(e) => {
                    const drag = chipDragRef.current;
                    if (!drag || drag.pointerId !== e.pointerId) return;
                    const wasMoved = drag.moved;
                    chipDragRef.current = null;
                    setIsDraggingChip(false);
                    e.currentTarget.releasePointerCapture?.(e.pointerId);
                    if (!wasMoved) {
                      setIsAnswerShrunk(false);
                    }
                  }}
                  onPointerCancel={() => {
                    chipDragRef.current = null;
                    setIsDraggingChip(false);
                  }}
                  aria-label="Expand answer pane (drag to move)"
                  title="Drag to move · Click to expand answer"
                  style={
                    shrunkPos
                      ? { left: shrunkPos.x, top: shrunkPos.y }
                      : { left: '50%', top: 12, transform: 'translateX(-50%)' }
                  }
                  className={`fluent-3d-popup-pill absolute z-20 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-700 touch-none select-none ${
                    isDraggingChip ? 'cursor-grabbing scale-105' : 'cursor-grab'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Answer</span>
                </button>
              ) : (
                <div className="pointer-events-none absolute top-3 inset-x-0 z-10 px-4 sm:px-8">
                  <div className="max-w-2xl mx-auto">
                    <div className="fluent-3d-popup pointer-events-auto rounded-[28px] px-5 py-4">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-700">
                          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                          <span>Answer</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsAnswerShrunk(true);
                          }}
                          aria-label="Shrink answer pane"
                          title="Shrink answer"
                          className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full hover:bg-white/75 transition-colors cursor-pointer shrink-0"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        </button>
                      </div>
                      <div className="text-xs sm:text-[13px] leading-relaxed text-slate-800 max-h-36 overflow-y-auto scroll-smooth pa-no-scrollbar overscroll-contain whitespace-pre-line select-text">
                        {answerText}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Bottom Card Navigation & Follow-up Strip */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex items-end justify-between px-5 sm:px-8">
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleNewThreadClick}
                title="Start New Thread"
                className="fluent-3d-popup-pill inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white cursor-pointer"
              >
                <WhatsAppSymbol className="w-4 h-4" />
                <span>New Thread</span>
              </button>
            </div>

            {(canAskFollowUp || cards.length > 0) && (
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                {canAskFollowUp && (
                  <button
                    type="button"
                    onClick={() => {
                      setFollowUpError(null);
                      setIsFollowUpOpen(true);
                    }}
                    className="fluent-3d-popup-pill inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-sky-800 hover:bg-white hover:text-sky-700 transition-colors cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>Ask for Follow-up</span>
                  </button>
                )}

                {cards.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="fluent-3d-popup-pill hidden sm:inline text-xs font-medium text-slate-700 rounded-xl px-3 py-1.5">
                      Scroll or drag · Click any card
                    </span>
                    <button
                      type="button"
                      key={`prev-${scrollTick}`}
                      onClick={() => shiftScroll(-1)}
                      aria-label="Previous card"
                      className="fluent-3d-popup-pill inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-800 hover:bg-white cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftScroll(1)}
                      aria-label="Next card"
                      className="fluent-3d-popup-pill inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-800 hover:bg-white cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Expanded 3D Card Category Glitter Spark Flash, Reasoning Pop-up & Follow-up Action */}
      {!isWaitingForReply && !errorDetail && selectedCard && (
        <>
          {/* Transient Category + Time Period + Probability Glitter Flash */}
          <motion.div
            key={`card-category-spark-${selectedIndex}`}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.6, times: [0, 0.14, 0.68, 1], ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4"
          >
            <div className="relative flex flex-col items-center justify-center max-w-md text-center">
              <motion.div
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: [0.3, 1.45, 1.95], opacity: [0, 0.95, 0] }}
                transition={{ duration: 1.5, times: [0, 0.28, 1], ease: 'easeOut' }}
                className="absolute w-72 h-72 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(253,224,71,0.52) 38%, rgba(56,189,248,0.28) 68%, rgba(255,255,255,0) 100%)',
                  filter: 'blur(6px)',
                }}
              />

              {SPARK_BURST_OFFSETS.map((sp, sIdx) => (
                <motion.svg
                  key={sIdx}
                  viewBox="0 0 24 24"
                  initial={{ x: 0, y: 0, scale: 0.2, opacity: 0, rotate: 0 }}
                  animate={{
                    x: [0, sp.x * 0.82, sp.x * 1.15],
                    y: [0, sp.y * 0.82, sp.y * 1.15],
                    scale: [0.2, 1.3, 0.15],
                    opacity: [0, 1, 0],
                    rotate: [0, 45, 90],
                  }}
                  transition={{
                    duration: 1.25,
                    delay: sp.delay,
                    times: [0, 0.35, 1],
                    ease: 'easeOut',
                  }}
                  className="absolute"
                  style={{ width: sp.size, height: sp.size }}
                >
                  <path
                    d="M12 1L14.6 9.4L23 12L14.6 14.6L12 23L9.4 14.6L1 12L9.4 9.4L12 1Z"
                    fill={sp.gold ? '#fef08a' : '#e0f2fe'}
                  />
                </motion.svg>
              ))}

              <motion.div
                initial={{ scale: 0.45, y: 14, opacity: 0 }}
                animate={{
                  scale: [0.45, 1.12, 1.03, 0.84],
                  y: [14, -6, -2, 6],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{ duration: 1.55, times: [0, 0.2, 0.68, 1], ease: 'easeOut' }}
                className="relative flex flex-col items-center gap-3"
              >
                <div className="inline-flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber-200/95 bg-slate-950/88 backdrop-blur-md shadow-[0_0_52px_rgba(253,224,71,0.82),0_0_22px_rgba(255,255,255,0.7)]">
                  <EventCategoryEmblem
                    icon={selectedCard.icon ?? 'sparkles'}
                    className="w-14 h-14 drop-shadow-[0_0_18px_rgba(255,255,255,0.95)]"
                  />
                </div>

                {selectedFlashCategory && (
                  <span
                    className="pa-rainbow-node-glitter px-4 py-1 rounded-full border border-amber-200/85 bg-slate-950/92 text-xs sm:text-sm font-extrabold uppercase tracking-[0.22em] text-amber-100 shadow-[0_0_28px_rgba(253,224,71,0.7)]"
                    style={{ textShadow: '0 0 12px rgba(253, 224, 71, 0.9)' }}
                  >
                    {selectedFlashCategory}
                  </span>
                )}

                {(selectedFlashPeriod || selectedFlashProbability) && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {selectedFlashPeriod && (
                      <span
                        className="pa-rainbow-node-glitter inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-amber-200/95 bg-slate-950/92 text-sm sm:text-base font-extrabold tracking-wide text-amber-50 shadow-[0_0_32px_rgba(253,224,71,0.78),inset_0_0_12px_rgba(253,224,71,0.28)]"
                        style={{ textShadow: '0 0 12px rgba(253, 224, 71, 0.92)' }}
                      >
                        <Calendar className="w-4 h-4 text-amber-200 shrink-0 drop-shadow-[0_0_8px_rgba(253,224,71,0.95)]" />
                        <span>{selectedFlashPeriod}</span>
                      </span>
                    )}
                    {selectedFlashProbability && (
                      <span
                        className="pa-rainbow-node-glitter inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-sky-200/95 bg-slate-950/92 text-sm sm:text-base font-extrabold tracking-wide text-sky-50 shadow-[0_0_32px_rgba(125,211,252,0.82),inset_0_0_12px_rgba(125,211,252,0.28)]"
                        style={{ textShadow: '0 0 12px rgba(125, 211, 252, 0.95)' }}
                      >
                        <Sparkles className="w-4 h-4 text-sky-200 shrink-0 drop-shadow-[0_0_8px_rgba(125,211,252,0.95)]" />
                        <span>{selectedFlashProbability}</span>
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>

          {/* Bottom Controls when Viewing a Card: New Thread + Back + Ask for Follow-up */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex items-center justify-between px-5 sm:px-8">
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleNewThreadClick}
                title="Start New Thread"
                className="fluent-3d-popup-pill inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white cursor-pointer"
              >
                <WhatsAppSymbol className="w-4 h-4" />
                <span>New Thread</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReasoningOpen(false);
                  setSelectedIndex(null);
                }}
                className="fluent-3d-popup-pill inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
            </div>

            {canAskFollowUp && (
              <div className="pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    setFollowUpError(null);
                    setIsFollowUpOpen(true);
                  }}
                  className="fluent-3d-popup-pill inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-sky-800 hover:bg-white hover:text-sky-700 transition-colors cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Ask for Follow-up</span>
                </button>
              </div>
            )}
          </div>

          {/* Reasoning Drawer Coming Up from Card & Going Out on Click (Fluent Transparent White 3D Glass) */}
          <div
            className={`pointer-events-none fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 transition-all duration-300 ease-out ${
              isReasoningOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-12 opacity-0'
            }`}
          >
            {isReasoningOpen && (
              <div
                onClick={() => setIsReasoningOpen(false)}
                className="fluent-3d-popup pointer-events-auto w-full max-w-xl rounded-[28px] p-6 cursor-pointer select-text"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                      How it will happen
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                      {selectedCard.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsReasoningOpen(false);
                    }}
                    aria-label="Close reasoning"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/75 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line max-h-56 overflow-y-auto scroll-smooth pa-no-scrollbar overscroll-contain">
                  {selectedCard.how || selectedCard.summary}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Fluent Transparent White 3D Follow-up Question Dialog */}
      {isFollowUpOpen && canAskFollowUp && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-xs"
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
            className="fluent-3d-popup relative w-full max-w-md rounded-[28px] p-6 sm:p-7 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
                <MessageSquarePlus className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="tabular-nums">
                  {domainShortLabel}
                  {formattedPeriodLabel ? ` · ${formattedPeriodLabel}` : ''} ·{' '}
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white/75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                id="prod-followup-title"
                htmlFor="prod-followup-input"
                className="block font-display text-lg font-bold text-slate-900 mb-2"
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
                className="w-full resize-none rounded-2xl border border-sky-200/90 bg-white/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-sky-500 focus:bg-white/90 focus:outline-none"
              />
              {followUpError && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">
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
                className="px-4 py-2 rounded-xl border border-slate-300/80 bg-white/65 text-xs font-semibold text-slate-700 hover:bg-white/95 cursor-pointer"
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
