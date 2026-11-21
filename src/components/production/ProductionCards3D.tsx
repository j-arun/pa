import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EventCardIconType, EventCardItem, PromptDomain } from '../../types/workbench';
import type { ReadOutSections } from '../../utils/eventParser';
import { WhatsAppSymbol } from '../WhatsAppSymbol';

interface ProductionCards3DProps {
  cards: EventCardItem[];
  readOutSections: ReadOutSections | null;
  isWaitingForReply: boolean;
  errorDetail?: string | null;
  questionText?: string;
  periodLabel?: string;
  domain?: PromptDomain;
  onCancelRequest: () => void;
  onRetry: () => void;
  onStartNewThread: () => void;
}

const CARD_PALETTES = [
  {
    bgTop: '#dfd2b8',
    bgBottom: '#cbb896',
    titleColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.88)',
    accent: '#9a7b4f',
    chipBg: 'rgba(28,25,23,0.16)',
  },
  {
    bgTop: '#8f6b73',
    bgBottom: '#5e434a',
    titleColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.9)',
    accent: '#e2a39e',
    chipBg: 'rgba(15,23,42,0.28)',
  },
  {
    bgTop: '#e4e3dc',
    bgBottom: '#cccbc2',
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
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Soft studio shadow platter
  const glow = ctx.createRadialGradient(0, 14, 16, 0, 14, 175);
  glow.addColorStop(0, 'rgba(255,255,255,0.42)');
  glow.addColorStop(0.55, `${accent}44`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 14, 175, 0, Math.PI * 2);
  ctx.fill();

  // Subtle architectural pedestal
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 88, 128, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (icon === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, 58);
    ctx.bezierCurveTo(-84, 10, -84, -58, -36, -64);
    ctx.bezierCurveTo(-10, -68, 0, -38, 0, -32);
    ctx.bezierCurveTo(0, -38, 10, -68, 36, -64);
    ctx.bezierCurveTo(84, -58, 84, 10, 0, 58);
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'shield') {
    ctx.beginPath();
    ctx.moveTo(0, -68);
    ctx.lineTo(62, -44);
    ctx.lineTo(62, 6);
    ctx.bezierCurveTo(62, 48, 0, 74, 0, 74);
    ctx.bezierCurveTo(0, 74, -62, 48, -62, 6);
    ctx.lineTo(-62, -44);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(0, 30);
    ctx.moveTo(-26, 3);
    ctx.lineTo(26, 3);
    ctx.stroke();
  } else if (icon === 'layers') {
    ctx.beginPath();
    ctx.moveTo(0, -64);
    ctx.lineTo(68, -14);
    ctx.lineTo(50, -14);
    ctx.lineTo(50, 54);
    ctx.lineTo(-50, 54);
    ctx.lineTo(-50, -14);
    ctx.lineTo(-68, -14);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-18, 10, 36, 44, 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(-64, -32, 128, 86, 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26, -32);
    ctx.lineTo(-26, -54);
    ctx.arcTo(-26, -64, -16, -64, 10);
    ctx.lineTo(16, -64);
    ctx.arcTo(26, -64, 26, -54, 10);
    ctx.lineTo(26, -32);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-64, 8);
    ctx.lineTo(64, 8);
    ctx.stroke();
  }

  ctx.restore();
}

interface RenderedCardTextures {
  colorTexture: THREE.CanvasTexture;
  textMaskTexture: THREE.CanvasTexture;
}

interface CardGlitterUniforms {
  uGlitterTime: { value: number };
  uGlitterFocus: { value: number };
  uCardSeed: { value: number };
  tTextMask: { value: THREE.Texture | null };
}

function attachCardTextGlitterShader(
  material: THREE.MeshStandardMaterial,
  initialMask: THREE.Texture | null,
  cardSeed: number,
): CardGlitterUniforms {
  const glitterUniforms: CardGlitterUniforms = {
    uGlitterTime: { value: 0 },
    uGlitterFocus: { value: 0 },
    uCardSeed: { value: cardSeed },
    tTextMask: { value: initialMask },
  };
  material.userData.glitterUniforms = glitterUniforms;
  material.customProgramCacheKey = () => 'pa-card-text-glitter-v1';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlitterTime = glitterUniforms.uGlitterTime;
    shader.uniforms.uGlitterFocus = glitterUniforms.uGlitterFocus;
    shader.uniforms.uCardSeed = glitterUniforms.uCardSeed;
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
uniform sampler2D tTextMask;
varying vec2 vCardTextUv;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float txtMask = texture2D(tTextMask, vCardTextUv).r;
float sweepCenter = fract(uGlitterTime * 0.36 + uCardSeed * 0.17) * 2.4 - 0.7;
float sweepCoord = vCardTextUv.x * 0.72 + (1.0 - vCardTextUv.y) * 0.55;
float sweepBand = exp(-pow((sweepCoord - sweepCenter) * 7.2, 2.0));
vec2 sparkGrid = floor(vCardTextUv * vec2(220.0, 290.0));
float sparkHash = fract(sin(dot(sparkGrid, vec2(127.1, 311.7)) + uCardSeed * 19.3) * 43758.5453);
float sparkTwinkle = pow(max(0.0, sin(uGlitterTime * 4.4 + sparkHash * 31.4159)), 11.0);
float dust = sparkTwinkle * step(0.83, sparkHash);
float focusLift = 0.08 + 0.24 * clamp(uGlitterFocus, 0.0, 1.5);
float glitterAmp = (sweepBand * 0.82 + dust * 1.4) * (0.35 + 0.95 * clamp(uGlitterFocus, 0.0, 1.5));
vec3 glitterTint = mix(vec3(0.84, 0.94, 1.0), vec3(1.0, 0.97, 0.88), sparkHash);
totalEmissiveRadiance += glitterTint * txtMask * (focusLift + glitterAmp);`,
      );
  };

  return glitterUniforms;
}

function renderCardFaceTexture(
  card: EventCardItem,
  index: number,
  maxAnisotropy: number,
  isDetailMode: boolean,
): RenderedCardTextures {
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

  // Top & lower editorial focal scrim so text always stays razor-sharp with rich contrast
  const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.44);
  topScrim.addColorStop(0, 'rgba(15, 23, 42, 0.36)');
  topScrim.addColorStop(0.65, 'rgba(15, 23, 42, 0.14)');
  topScrim.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, height * 0.44);

  const sheen = ctx.createRadialGradient(
    width * 0.25,
    height * 0.14,
    20,
    width * 0.35,
    height * 0.25,
    width * 0.85,
  );
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const scale = width / 768;
  const padX = 54 * scale;
  let cursorY = 56 * scale;

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
    ctx.shadowColor = 'rgba(15, 23, 42, 0.34)';
    ctx.shadowBlur = 12 * scale;
    if (maxW !== undefined) ctx.fillText(text, x, y, maxW);
    else ctx.fillText(text, x, y);
    ctx.restore();

    maskCtx.save();
    maskCtx.font = font;
    maskCtx.textAlign = align;
    maskCtx.textBaseline = baseline;
    maskCtx.fillStyle = maskIntensity;
    maskCtx.shadowColor = '#ffffff';
    maskCtx.shadowBlur = 5 * scale;
    if (maxW !== undefined) maskCtx.fillText(text, x, y, maxW);
    else maskCtx.fillText(text, x, y);
    maskCtx.restore();
  };

  // Category eyebrow
  if (card.category) {
    const catLabel = card.category.toUpperCase();
    drawMaskedText(
      catLabel,
      padX,
      cursorY,
      `700 ${Math.round(18 * scale)}px "DM Sans", system-ui, sans-serif`,
      'rgba(255, 255, 255, 0.86)',
      'left',
      'top',
      width - padX * 2,
      '#b8b8b8',
    );
    cursorY += 32 * scale;
  }

  // Title (editorial bold top-left with strong readability & glitter mask)
  const titleFont = `700 ${Math.round((isDetailMode ? 48 : 46) * scale)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.font = titleFont;
  const titleLines = wrapLines(ctx, card.title, width - padX * 2, 3);
  for (const line of titleLines) {
    drawMaskedText(line, padX, cursorY, titleFont, '#ffffff', 'left', 'top');
    cursorY += 56 * scale;
  }

  // Timing & Probability pill
  cursorY += 12 * scale;
  const whenStr = card.when || card.dateRange || card.timeframe || 'Upcoming window';
  const probStr = card.probability || card.likelihood || '';
  const pillFont = `600 ${Math.round(22 * scale)}px "DM Sans", system-ui, sans-serif`;
  ctx.font = pillFont;
  const pillText = probStr ? `${whenStr}  ·  ${probStr}` : whenStr;
  const pillW = Math.min(width - padX * 2, ctx.measureText(pillText).width + 42 * scale);

  ctx.fillStyle = 'rgba(10, 18, 34, 0.34)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.roundRect(padX, cursorY, pillW, 44 * scale, 14 * scale);
  ctx.fill();
  ctx.stroke();

  drawMaskedText(
    pillText,
    padX + 21 * scale,
    cursorY + 22 * scale,
    pillFont,
    '#ffffff',
    'left',
    'middle',
    width - padX * 2 - 42 * scale,
    '#d8d8d8',
  );

  // Center emblem illustration cleanly framed above the focal summary plaque
  ctx.save();
  ctx.translate(width / 2, isDetailMode ? height * 0.44 : height * 0.51);
  ctx.scale(scale * (isDetailMode ? 0.92 : 0.88), scale * (isDetailMode ? 0.92 : 0.88));
  drawDomainArtwork(ctx, card.icon, palette.accent, 0, 0);
  ctx.restore();

  // Focused Text Plaque inside the Card (Summary highlight for clear reading focus)
  const rawSummary = (card.summary || card.how || '').trim();
  if (rawSummary) {
    const summaryFont = `500 ${Math.round((isDetailMode ? 24 : 21) * scale)}px "DM Sans", system-ui, sans-serif`;
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

      // Frosted dark focal panel behind text so inside-card text has crisp visual focus
      const plaqueGrad = ctx.createLinearGradient(0, plaqueY, 0, plaqueY + plaqueH);
      plaqueGrad.addColorStop(0, isDetailMode ? 'rgba(10, 18, 34, 0.52)' : 'rgba(10, 18, 34, 0.36)');
      plaqueGrad.addColorStop(1, isDetailMode ? 'rgba(10, 18, 34, 0.64)' : 'rgba(10, 18, 34, 0.46)');
      ctx.save();
      ctx.fillStyle = plaqueGrad;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.lineWidth = 1.75 * scale;
      ctx.shadowColor = 'rgba(2, 6, 23, 0.28)';
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
          'rgba(186, 230, 253, 0.95)',
          'left',
          'top',
          undefined,
          '#c8c8c8',
        );
        textY += headerHeight;
      }

      for (const line of summaryLines) {
        drawMaskedText(
          line,
          plaqueX + innerPad,
          textY,
          summaryFont,
          'rgba(255, 255, 255, 0.96)',
          'left',
          'top',
          plaqueW - innerPad * 2,
          '#e8e8e8',
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

export function ProductionCards3D({
  cards,
  readOutSections,
  isWaitingForReply,
  errorDetail,
  questionText,
  periodLabel,
  onCancelRequest,
  onRetry,
  onStartNewThread,
}: ProductionCards3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [showReadOut, setShowReadOut] = useState(true);
  const [scrollTick, setScrollTick] = useState(0);

  const selectedCard = selectedIndex !== null ? cards[selectedIndex] ?? null : null;

  useEffect(() => {
    setSelectedIndex(null);
    setIsReasoningOpen(false);
    setShowReadOut(true);
  }, [cards]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isReasoningOpen) {
          setIsReasoningOpen(false);
        } else if (selectedIndex !== null) {
          setSelectedIndex(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReasoningOpen, selectedIndex]);

  const interactionRef = useRef({
    selectedIndex,
    isWaitingForReply,
    scrollTarget: 0,
    onSelectCard: (idx: number) => {
      setSelectedIndex(idx);
      setIsReasoningOpen(false);
    },
    onToggleReasoning: () => {
      setIsReasoningOpen((prev) => !prev);
    },
  });
  interactionRef.current.selectedIndex = selectedIndex;
  interactionRef.current.isWaitingForReply = isWaitingForReply;

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
    const galleryBgColor = new THREE.Color('#f2f1ed'); // Warm alabaster studio (Screenshot 1)
    const detailBgColor = new THREE.Color('#04060b'); // Obsidian stage (Screenshot 2)
    scene.background = galleryBgColor.clone();

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

    // 1. Stage 2 Thinking Orbital Group
    const thinkingGroup = new THREE.Group();
    const pulseCoreGeo = new THREE.IcosahedronGeometry(0.62, 2);
    const pulseCoreMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      metalness: 0.25,
      roughness: 0.12,
      clearcoat: 1.0,
    });
    const pulseCore = new THREE.Mesh(pulseCoreGeo, pulseCoreMat);
    thinkingGroup.add(pulseCore);

    const orbitRingGeo = new THREE.TorusGeometry(1.18, 0.028, 16, 64);
    const orbitRingMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      metalness: 0.85,
      roughness: 0.18,
    });
    const orbitRing1 = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    const orbitRing2 = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    orbitRing1.rotation.x = Math.PI * 0.35;
    orbitRing2.rotation.y = Math.PI * 0.35;
    thinkingGroup.add(orbitRing1, orbitRing2);
    scene.add(thinkingGroup);
    disposables.push(pulseCoreGeo, pulseCoreMat, orbitRingGeo, orbitRingMat);

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
    const facePlaneGeo = new THREE.ShapeGeometry(createRoundedRectShape(cardWidth - 0.02, cardHeight - 0.02, 0.18));
    disposables.push(slabGeo, rimMetalMat, facePlaneGeo);

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
      const group = new THREE.Group();
      const slabMesh = new THREE.Mesh(slabGeo, rimMetalMat);
      group.add(slabMesh);

      const { colorTexture, textMaskTexture } = renderCardFaceTexture(card, idx, maxAnisotropy, false);
      const faceMat = new THREE.MeshStandardMaterial({
        map: colorTexture,
        roughness: 0.34,
        metalness: 0.06,
      });
      const glitterUniforms = attachCardTextGlitterShader(faceMat, textMaskTexture, idx + 1);
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
      const rendered = renderCardFaceTexture(card, idx, maxAnisotropy, true);
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
        ? attachCardTextGlitterShader(detailFaceMat, detailEntries[0].textMaskTexture, 1)
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
        const hits = raycaster.intersectObject(detailFaceMesh, false);
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
        const hits = raycaster.intersectObject(detailFaceMesh, false);
        if (hits.length > 0) {
          interactionRef.current.onToggleReasoning();
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
      const detailIdx = interactionRef.current.selectedIndex;
      const inDetail = !isWait && detailIdx !== null;

      thinkingGroup.visible = isWait;
      galleryGroup.visible = !isWait && detailBlend < 0.96;
      detailCardGroup.visible = !isWait && detailBlend > 0.04;

      detailBlend = THREE.MathUtils.damp(detailBlend, inDetail ? 1 : 0, 7.5, dt);
      detailArrivalPulse = THREE.MathUtils.damp(detailArrivalPulse, 0, 2.2, dt);

      // Background color smoothly blends between studio alabaster and obsidian stage
      if (scene.background instanceof THREE.Color) {
        const bgTarget = isWait ? detailBgColor : inDetail ? detailBgColor : galleryBgColor;
        scene.background.lerp(bgTarget, Math.min(1, dt * 8));
      }

      if (isWait) {
        pulseCore.rotation.y = elapsed * 0.95;
        pulseCore.rotation.x = elapsed * 0.55;
        orbitRing1.rotation.z = elapsed * 1.4;
        orbitRing2.rotation.x = elapsed * 1.1;
        const s = 1 + Math.sin(elapsed * 3.1) * 0.08;
        pulseCore.scale.setScalar(s);
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

          // Animate glittering focus on front/hovered gallery cards
          const frontFocus = Math.max(0, 1 - Math.abs(rel) * 0.85);
          entry.glitterUniforms.uGlitterTime.value = elapsed;
          entry.glitterUniforms.uGlitterFocus.value = Math.min(
            1.4,
            frontFocus * 0.55 + entry.hoverLerp * 0.85,
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
          }
          detailArrivalPulse = 1.35;
        }
        if (detailIdx === null) {
          lastActiveDetailTexIdx = -1;
        }

        if (detailGlitterUniforms) {
          detailGlitterUniforms.uGlitterTime.value = elapsed;
          detailGlitterUniforms.uGlitterFocus.value = Math.min(
            1.5,
            detailBlend * 0.9 + detailArrivalPulse * 0.65,
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
  }, [cards]);

  const answerText = readOutSections?.answer?.trim() || '';
  const hasAnswer = Boolean(answerText);

  const errorUi = useMemo(() => {
    if (!errorDetail) return null;
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-[#040812]/90">
        <div className="max-w-md w-full rounded-3xl border border-red-800/80 bg-[#1a0b10] p-6 text-red-100 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <WhatsAppSymbol className="w-5 h-5" />
            <span>What&apos;s up</span>
          </div>
          <p className="text-sm font-medium">Try &quot;What&apos;s up&quot; little later ..</p>
          <p className="text-xs text-red-200/80 break-words">{errorDetail}</p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={onStartNewThread}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-700/70 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-950/60 cursor-pointer"
            >
              <span>New Thread</span>
            </button>
          </div>
        </div>
      </div>
    );
  }, [errorDetail, onRetry, onStartNewThread]);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden select-none">
      {/* Real Three.js 3D Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Stage 2: Waiting / Thinking Overlay */}
      {isWaitingForReply && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-between py-10 px-4">
          <div className="text-center space-y-1.5">
            {periodLabel && (
              <div className="text-xs font-semibold tracking-widest uppercase text-sky-300 tabular-nums">
                {periodLabel}
              </div>
            )}
            {questionText && (
              <p className="max-w-lg text-sm text-slate-200 line-clamp-2">{questionText}</p>
            )}
          </div>

          <div className="pointer-events-auto flex flex-col items-center gap-3">
            <span className="text-xs font-medium text-sky-200/85">Thinking…</span>
            <button
              type="button"
              onClick={onCancelRequest}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-[#140a12]/90 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/80 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Error State Overlay */}
      {!isWaitingForReply && errorUi}

      {/* Gallery Mode Overlays: Top Floating Answer Bubble + Scroll Arrows */}
      {!isWaitingForReply && !errorDetail && selectedIndex === null && (
        <>
          {/* Floating Light-Theme Answer Bubble right over the top of the 3D cards */}
          {hasAnswer && showReadOut && (
            <div className="pointer-events-none absolute top-3 inset-x-0 z-10 px-4 sm:px-8">
              <div className="max-w-2xl mx-auto">
                <div className="pointer-events-auto rounded-[28px] border border-sky-200 bg-[#f8fbff]/96 px-5 py-4 text-slate-900 shadow-[0_18px_38px_-14px_rgba(15,23,42,0.22)]">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-700">
                      <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                      <span>Answer</span>
                    </span>
                  </div>
                  <div className="text-xs sm:text-[13px] leading-relaxed text-slate-800 max-h-36 overflow-y-auto scroll-smooth pa-no-scrollbar overscroll-contain whitespace-pre-line select-text">
                    {answerText}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Card Navigation Strip */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex items-center justify-between px-5 sm:px-8">
            <div className="pointer-events-auto flex items-center gap-2">
              {hasAnswer && (
                <button
                  type="button"
                  onClick={() => setShowReadOut((prev) => !prev)}
                  className="rounded-xl border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-white cursor-pointer"
                >
                  {showReadOut ? 'Hide Answer' : 'Show Answer'}
                </button>
              )}
              <button
                type="button"
                onClick={onStartNewThread}
                title="Start New Thread"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-white cursor-pointer"
              >
                <WhatsAppSymbol className="w-4 h-4" />
                <span>New Thread</span>
              </button>
            </div>

            {cards.length > 0 && (
              <div className="pointer-events-auto flex items-center gap-2">
                <span className="hidden sm:inline text-xs font-medium text-slate-600 bg-white/90 border border-slate-200 rounded-xl px-3 py-1.5">
                  Scroll or drag · Click any card
                </span>
                <button
                  type="button"
                  key={`prev-${scrollTick}`}
                  onClick={() => shiftScroll(-1)}
                  aria-label="Previous card"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white/95 text-slate-800 shadow-xs hover:bg-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftScroll(1)}
                  aria-label="Next card"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white/95 text-slate-800 shadow-xs hover:bg-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Expanded 3D Card Overlays + Slide-Up Reasoning */}
      {!isWaitingForReply && !errorDetail && selectedCard && (
        <>
          <div className="pointer-events-none absolute top-4 inset-x-0 z-20 flex items-center justify-between px-5 sm:px-8">
            <button
              type="button"
              onClick={() => {
                setIsReasoningOpen(false);
                setSelectedIndex(null);
              }}
              aria-label="Back"
              title="Back"
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/90 bg-[#0d1424]/95 text-white hover:bg-slate-800 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setIsReasoningOpen((prev) => !prev)}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-sky-400/50 bg-[#0d1424]/95 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-slate-800 cursor-pointer"
            >
              <span>{isReasoningOpen ? 'Hide How It Happens' : 'Show How It Happens'}</span>
            </button>
          </div>

          {/* Reasoning Drawer Coming Up from Card & Going Out on Click */}
          <div
            className={`pointer-events-none fixed inset-x-0 bottom-10 z-20 flex justify-center px-4 transition-all duration-300 ease-out ${
              isReasoningOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-12 opacity-0'
            }`}
          >
            {isReasoningOpen && (
              <div
                onClick={() => setIsReasoningOpen(false)}
                className="pointer-events-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-[#f8fafc] p-6 text-slate-900 shadow-[0_28px_70px_rgba(2,6,23,0.72)] cursor-pointer select-text"
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
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line max-h-56 overflow-y-auto scroll-smooth pa-no-scrollbar overscroll-contain">
                  {selectedCard.how || selectedCard.summary}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
