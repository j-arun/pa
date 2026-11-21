import { Loader2, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EventCardIconType, PromptDomain } from '../../types/workbench';
import { getMonthNameFromNumber } from '../../utils/promptTemplates';

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

const TOPICS: ProductionTopicDef[] = [
  {
    domain: 'astrology',
    label: 'Career',
    icon: 'briefcase',
    accentHex: '#38bdf8',
    glowHex: '#0284c7',
  },
  {
    domain: 'finance',
    label: 'Family',
    icon: 'layers',
    accentHex: '#34d399',
    glowHex: '#059669',
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

interface ProductionStage1ThreeProps {
  activeMonthNum: number;
  activeYearNum: number;
  activePromptDomain: PromptDomain;
  isSending: boolean;
  switchingMonthKey?: string | null;
  monthSwitchError?: string | null;
  onDismissMonthSwitchError?: () => void;
  onPromptDomainChange: (domain: PromptDomain) => void;
  onSelectQuickMonth?: (month: number, year: number) => void;
  onSubmitQuestion: (payload: {
    text: string;
    domain: PromptDomain;
    threadName: string;
    month: number;
    year: number;
  }) => void;
}

function drawTopicIconCanvas(
  icon: EventCardIconType,
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy - 18, 12, cx, cy, 118);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, accentHex);
  grad.addColorStop(1, '#0b162a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = 12;

  if (icon === 'briefcase') {
    // Clean briefcase vector
    ctx.beginPath();
    ctx.roundRect(-48, -22, 96, 66, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, -22);
    ctx.lineTo(-22, -38);
    ctx.arcTo(-22, -46, -14, -46, 8);
    ctx.lineTo(14, -46);
    ctx.arcTo(22, -46, 22, -38, 8);
    ctx.lineTo(22, -22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-48, 8);
    ctx.lineTo(48, 8);
    ctx.stroke();
  } else if (icon === 'layers') {
    // Stacked home/family layers vector
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(50, -10);
    ctx.lineTo(38, -10);
    ctx.lineTo(38, 42);
    ctx.lineTo(-38, 42);
    ctx.lineTo(-38, -10);
    ctx.lineTo(-50, -10);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-14, 10, 28, 32, 4);
    ctx.stroke();
  } else if (icon === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.bezierCurveTo(-56, 8, -56, -42, -24, -46);
    ctx.bezierCurveTo(-6, -48, 0, -28, 0, -24);
    ctx.bezierCurveTo(0, -28, 6, -48, 24, -46);
    ctx.bezierCurveTo(56, -42, 56, 8, 0, 44);
    ctx.closePath();
    ctx.fill();
  } else {
    // Health shield + pulse cross
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.lineTo(44, -32);
    ctx.lineTo(44, 2);
    ctx.bezierCurveTo(44, 34, 0, 52, 0, 52);
    ctx.bezierCurveTo(0, 52, -44, 34, -44, 2);
    ctx.lineTo(-44, -32);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 20);
    ctx.moveTo(-19, 1);
    ctx.lineTo(19, 1);
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function drawBucketLabelCanvas(
  shortMonth: string,
  year: number,
  isActive: boolean,
  isHovered: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 320;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = isHovered
    ? 'rgba(14, 165, 233, 0.92)'
    : isActive
      ? 'rgba(15, 36, 68, 0.92)'
      : 'rgba(11, 22, 42, 0.84)';
  ctx.strokeStyle = isHovered
    ? '#bae6fd'
    : isActive
      ? '#38bdf8'
      : 'rgba(125, 211, 252, 0.45)';
  ctx.lineWidth = isHovered ? 5 : 3;
  ctx.beginPath();
  ctx.roundRect(14, 18, width - 28, height - 36, 26);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 46px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(shortMonth.toUpperCase(), width / 2, height / 2 - 18);

  ctx.fillStyle = isHovered ? '#e0f2fe' : '#93c5fd';
  ctx.font = '600 28px "JetBrains Mono", monospace';
  ctx.fillText(String(year), width / 2, height / 2 + 28);

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
  isSending,
  switchingMonthKey,
  monthSwitchError,
  onDismissMonthSwitchError,
  onPromptDomainChange,
  onSelectQuickMonth,
  onSubmitQuestion,
}: ProductionStage1ThreeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bubbleInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [dockedTarget, setDockedTarget] = useState<{
    topic: ProductionTopicDef;
    month: ProductionMonthItem;
  } | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hoveredBucketLabel, setHoveredBucketLabel] = useState<string | null>(null);
  const [isDraggingTopic, setIsDraggingTopic] = useState(false);

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

  const callbacksRef = useRef({
    onPromptDomainChange,
    onSelectQuickMonth,
    setDockedTarget,
    setQuestionText,
    setValidationError,
    setHoveredBucketLabel,
    setIsDraggingTopic,
  });
  callbacksRef.current = {
    onPromptDomainChange,
    onSelectQuickMonth,
    setDockedTarget,
    setQuestionText,
    setValidationError,
    setHoveredBucketLabel,
    setIsDraggingTopic,
  };

  const stateRef = useRef({
    activeMonthNum,
    activeYearNum,
    activePromptDomain,
    isSending,
    dockedTarget,
  });
  stateRef.current = {
    activeMonthNum,
    activeYearNum,
    activePromptDomain,
    isSending,
    dockedTarget,
  };

  useEffect(() => {
    if (!dockedTarget) return;
    const t = window.setTimeout(() => bubbleInputRef.current?.focus(), 100);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDockedTarget(null);
        setValidationError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dockedTarget]);

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
      42,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 0.35, 11.4);

    // Studio & Atmospheric Lighting
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.45);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.8);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-6, 3, -5);
    scene.add(rimLight);
    const bottomGlowLight = new THREE.PointLight(0x0ea5e9, 1.4, 18);
    bottomGlowLight.position.set(0, -3.4, 2.2);
    scene.add(bottomGlowLight);

    // Rainbow Arch 3D Ribbons matching symmetrical arc (Nov || Apr, Dec || Mar, Jan & Feb top)
    const archControlPoints = [
      new THREE.Vector3(-4.85, 0.85, -1.05),
      new THREE.Vector3(-3.0, 2.05, -0.82),
      new THREE.Vector3(-1.05, 2.72, -0.62),
      new THREE.Vector3(1.05, 2.72, -0.62),
      new THREE.Vector3(3.0, 2.05, -0.82),
      new THREE.Vector3(4.85, 0.85, -1.05),
    ];
    const mainCurve = new THREE.CatmullRomCurve3(archControlPoints);
    const tubeGeo1 = new THREE.TubeGeometry(mainCurve, 72, 0.045, 12, false);
    const tubeMat1 = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.35,
      metalness: 0.4,
      roughness: 0.22,
      transparent: true,
      opacity: 0.86,
    });
    const rainbowTube1 = new THREE.Mesh(tubeGeo1, tubeMat1);
    scene.add(rainbowTube1);
    disposables.push(tubeGeo1, tubeMat1);

    const innerCurvePoints = archControlPoints.map(
      (p) => new THREE.Vector3(p.x * 0.96, p.y - 0.22, p.z - 0.14),
    );
    const innerCurve = new THREE.CatmullRomCurve3(innerCurvePoints);
    const tubeGeo2 = new THREE.TubeGeometry(innerCurve, 64, 0.025, 10, false);
    const tubeMat2 = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.55,
    });
    const rainbowTube2 = new THREE.Mesh(tubeGeo2, tubeMat2);
    scene.add(rainbowTube2);
    disposables.push(tubeGeo2, tubeMat2);

    // Subtle Starlight / Glitter Particles around the arch
    const starCount = isSoftwareGl ? 60 : 120;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const t = Math.random();
      const pt = mainCurve.getPoint(t);
      starPositions[i * 3] = pt.x + (Math.random() - 0.5) * 1.8;
      starPositions[i * 3 + 1] = pt.y + (Math.random() - 0.5) * 1.4;
      starPositions[i * 3 + 2] = pt.z + (Math.random() - 0.5) * 1.4;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.065,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    disposables.push(starGeo, starMat);

    // Build 6 3D Month Buckets along symmetrical arch
    const bucketSlots: Array<{ x: number; y: number; z: number }> = [
      { x: -4.45, y: 0.85, z: -0.42 },
      { x: -2.7, y: 1.88, z: -0.22 },
      { x: -0.92, y: 2.52, z: -0.08 },
      { x: 0.92, y: 2.52, z: -0.08 },
      { x: 2.7, y: 1.88, z: -0.22 },
      { x: 4.45, y: 0.85, z: -0.42 },
    ];

    const bucketWallGeo = new THREE.CylinderGeometry(0.58, 0.41, 0.86, 32, 1, true);
    const bucketFloorGeo = new THREE.CircleGeometry(0.41, 28);
    const bucketRimGeo = new THREE.TorusGeometry(0.58, 0.036, 16, 40);
    const bucketLiquidGeo = new THREE.CircleGeometry(0.48, 28);
    const bucketBadgeGeo = new THREE.PlaneGeometry(0.95, 0.48);
    disposables.push(bucketWallGeo, bucketFloorGeo, bucketRimGeo, bucketLiquidGeo, bucketBadgeGeo);

    interface BucketEntry {
      monthItem: ProductionMonthItem;
      group: THREE.Group;
      basePos: THREE.Vector3;
      wallMat: THREE.MeshPhysicalMaterial;
      rimMat: THREE.MeshStandardMaterial;
      liquidMat: THREE.MeshBasicMaterial;
      badgeMat: THREE.MeshBasicMaterial;
      badgeTexActive: THREE.CanvasTexture;
      badgeTexIdle: THREE.CanvasTexture;
      badgeTexHover: THREE.CanvasTexture;
      hitMesh: THREE.Mesh;
      hoverLerp: number;
    }

    const hitSphereGeo = new THREE.SphereGeometry(0.75, 16, 16);
    const invisibleHitMat = new THREE.MeshBasicMaterial({ visible: false });
    disposables.push(hitSphereGeo, invisibleHitMat);

    const bucketEntries: BucketEntry[] = stageQuickMonths.map((monthItem, idx) => {
      const slot = bucketSlots[idx];
      const group = new THREE.Group();
      const basePos = new THREE.Vector3(slot.x, slot.y, slot.z);
      group.position.copy(basePos);

      const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        metalness: 0.15,
        roughness: 0.16,
        transmission: 0.42,
        transparent: true,
        opacity: 0.42,
        clearcoat: 1.0,
        side: THREE.DoubleSide,
      });
      const wallMesh = new THREE.Mesh(bucketWallGeo, wallMat);
      wallMesh.rotation.x = 0.18;
      group.add(wallMesh);

      const floorMesh = new THREE.Mesh(bucketFloorGeo, wallMat);
      floorMesh.rotation.x = -Math.PI / 2 + 0.18;
      floorMesh.position.y = -0.42;
      group.add(floorMesh);

      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        metalness: 0.85,
        roughness: 0.18,
      });
      const rimMesh = new THREE.Mesh(bucketRimGeo, rimMat);
      rimMesh.rotation.x = Math.PI / 2 + 0.18;
      rimMesh.position.y = 0.43;
      group.add(rimMesh);

      const liquidMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      });
      const liquidMesh = new THREE.Mesh(bucketLiquidGeo, liquidMat);
      liquidMesh.rotation.x = -Math.PI / 2 + 0.18;
      liquidMesh.position.y = -0.05;
      group.add(liquidMesh);

      const badgeTexIdle = drawBucketLabelCanvas(
        monthItem.shortMonth,
        monthItem.year,
        false,
        false,
        maxAnisotropy,
      );
      const badgeTexActive = drawBucketLabelCanvas(
        monthItem.shortMonth,
        monthItem.year,
        true,
        false,
        maxAnisotropy,
      );
      const badgeTexHover = drawBucketLabelCanvas(
        monthItem.shortMonth,
        monthItem.year,
        true,
        true,
        maxAnisotropy,
      );
      disposables.push(badgeTexIdle, badgeTexActive, badgeTexHover);

      const badgeMat = new THREE.MeshBasicMaterial({
        map: badgeTexIdle,
        transparent: true,
      });
      const badgeMesh = new THREE.Mesh(bucketBadgeGeo, badgeMat);
      badgeMesh.position.set(0, -0.06, 0.56);
      group.add(badgeMesh);

      const hitMesh = new THREE.Mesh(hitSphereGeo, invisibleHitMat);
      hitMesh.userData = { bucketKey: monthItem.key };
      group.add(hitMesh);

      scene.add(group);
      disposables.push(wallMat, rimMat, liquidMat, badgeMat);

      return {
        monthItem,
        group,
        basePos,
        wallMat,
        rimMat,
        liquidMat,
        badgeMat,
        badgeTexActive,
        badgeTexIdle,
        badgeTexHover,
        hitMesh,
        hoverLerp: 0,
      };
    });

    // Build 4 Jumping 3D Domain Icon Orbs (ICONS ONLY — NO TEXT NAMES BELOW!)
    const orbSlots = [
      new THREE.Vector3(-2.85, -1.65, 0.25),
      new THREE.Vector3(-0.95, -1.92, 0.36),
      new THREE.Vector3(0.95, -1.92, 0.36),
      new THREE.Vector3(2.85, -1.65, 0.25),
    ];

    const orbSphereGeo = new THREE.SphereGeometry(0.54, 32, 32);
    const orbRingGeo = new THREE.TorusGeometry(0.61, 0.032, 16, 48);
    const orbIconPlaneGeo = new THREE.CircleGeometry(0.42, 32);
    const orbShadowGeo = new THREE.CircleGeometry(0.56, 24);
    disposables.push(orbSphereGeo, orbRingGeo, orbIconPlaneGeo, orbShadowGeo);

    interface OrbEntry {
      topic: ProductionTopicDef;
      group: THREE.Group;
      homePos: THREE.Vector3;
      shadowMesh: THREE.Mesh;
      shadowMat: THREE.MeshBasicMaterial;
      shellMat: THREE.MeshPhysicalMaterial;
      ringMesh: THREE.Mesh;
      ringMat: THREE.MeshStandardMaterial;
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
      const glowColor = new THREE.Color(topic.glowHex);

      const shellMat = new THREE.MeshPhysicalMaterial({
        color: accentColor,
        emissive: glowColor,
        emissiveIntensity: 0.22,
        metalness: 0.12,
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        transparent: true,
        opacity: 0.86,
      });
      const sphereMesh = new THREE.Mesh(orbSphereGeo, shellMat);
      group.add(sphereMesh);

      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: accentColor,
        emissiveIntensity: 0.35,
        metalness: 0.9,
        roughness: 0.16,
      });
      const ringMesh = new THREE.Mesh(orbRingGeo, ringMat);
      ringMesh.rotation.x = Math.PI * 0.4;
      group.add(ringMesh);

      const iconTex = drawTopicIconCanvas(topic.icon, topic.accentHex, maxAnisotropy);
      const iconMat = new THREE.MeshBasicMaterial({
        map: iconTex,
        transparent: true,
      });
      const iconMesh = new THREE.Mesh(orbIconPlaneGeo, iconMat);
      iconMesh.position.z = 0.545;
      group.add(iconMesh);
      disposables.push(iconTex, iconMat, shellMat, ringMat);

      const hitMesh = new THREE.Mesh(hitSphereGeo, invisibleHitMat);
      hitMesh.userData = { orbIndex: idx };
      group.add(hitMesh);

      // Contact shadow directly below orb (no text labels!)
      const shadowMat = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.26,
      });
      const shadowMesh = new THREE.Mesh(orbShadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(homePos.x, homePos.y - 0.76, homePos.z);
      scene.add(shadowMesh);
      scene.add(group);
      disposables.push(shadowMat);

      return {
        topic,
        group,
        homePos,
        shadowMesh,
        shadowMat,
        shellMat,
        ringMesh,
        ringMat,
        hitMesh,
        phase: idx * 1.15,
        currentPos: homePos.clone(),
        scaleLerp: 1,
      };
    });

    // Interaction State (pre-allocated Math objects)
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
      let bestDist = 1.25;
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
      if (stateRef.current.isSending || stateRef.current.dockedTarget) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

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
          callbacksRef.current.onSelectQuickMonth?.(
            found.monthItem.month,
            found.monthItem.year,
          );
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
            THREE.MathUtils.clamp(_intersectPt.x, -5.6, 5.6),
            THREE.MathUtils.clamp(_intersectPt.y, -2.8, 3.3),
            0.75,
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

      if (stateRef.current.dockedTarget) {
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
          callbacksRef.current.onPromptDomainChange(entry.topic.domain);
          callbacksRef.current.onSelectQuickMonth?.(
            matchedBucket.monthItem.month,
            matchedBucket.monthItem.year,
          );
          callbacksRef.current.setQuestionText('');
          callbacksRef.current.setValidationError(null);
          callbacksRef.current.setDockedTarget({
            topic: entry.topic,
            month: matchedBucket.monthItem,
          });
          return;
        }
      }

      // If user clicked (didn't drag), allow quick drop into currently active month
      if (!cancelled && movedDist < 8) {
        const activeBucket =
          bucketEntries.find(
            (b) =>
              b.monthItem.month === stateRef.current.activeMonthNum &&
              b.monthItem.year === stateRef.current.activeYearNum,
          ) ?? bucketEntries[0];
        if (activeBucket) {
          callbacksRef.current.onPromptDomainChange(entry.topic.domain);
          callbacksRef.current.setQuestionText('');
          callbacksRef.current.setValidationError(null);
          callbacksRef.current.setDockedTarget({
            topic: entry.topic,
            month: activeBucket.monthItem,
          });
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
      camera.aspect = w / h;
      // Fit slightly wider FOV on narrow viewports so all 6 buckets remain visible
      camera.fov = w < 720 ? 52 : 42;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    let elapsed = 0;
    let lastTime = performance.now();
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

      // Subtle rainbow breathing & star shimmer
      rainbowTube1.position.y = Math.sin(elapsed * 1.1) * 0.04;
      rainbowTube2.position.y = Math.sin(elapsed * 1.1 + 0.5) * 0.04;
      stars.rotation.z = Math.sin(elapsed * 0.25) * 0.025;

      // Animate 6 Month Buckets
      for (let i = 0; i < bucketEntries.length; i += 1) {
        const b = bucketEntries[i];
        const isActive =
          b.monthItem.month === stateRef.current.activeMonthNum &&
          b.monthItem.year === stateRef.current.activeYearNum;
        const isHovered = hoveredBucketKeyLocal === b.monthItem.key;

        b.hoverLerp = THREE.MathUtils.damp(b.hoverLerp, isHovered ? 1 : 0, 10, dt);
        const floatY = Math.sin(elapsed * 1.65 + i * 0.55) * 0.055;
        b.group.position.set(
          b.basePos.x,
          b.basePos.y + floatY + b.hoverLerp * 0.16,
          b.basePos.z + b.hoverLerp * 0.28,
        );
        const s = 1 + b.hoverLerp * 0.14;
        b.group.scale.set(s, s, s);

        b.wallMat.opacity = isHovered ? 0.65 : isActive ? 0.52 : 0.36;
        b.rimMat.emissiveIntensity = isHovered ? 1.85 : isActive ? 1.15 : 0.6;
        b.liquidMat.opacity = isHovered ? 0.62 : isActive ? 0.42 : 0.22;

        const desiredTex = isHovered
          ? b.badgeTexHover
          : isActive
            ? b.badgeTexActive
            : b.badgeTexIdle;
        if (b.badgeMat.map !== desiredTex) {
          b.badgeMat.map = desiredTex;
          b.badgeMat.needsUpdate = true;
        }
      }

      // Animate 4 Jumping Domain Icon Orbs
      for (let i = 0; i < orbEntries.length; i += 1) {
        const o = orbEntries[i];
        const isDragged = draggingOrbIdx === i;
        const isHovered = pointerHoverOrbIdx === i;

        if (!isDragged) {
          const bounce = Math.abs(Math.sin(elapsed * 2.4 + o.phase)) * 0.48;
          _targetPos.set(o.homePos.x, o.homePos.y + bounce, o.homePos.z);
          o.currentPos.x = THREE.MathUtils.damp(o.currentPos.x, _targetPos.x, 10, dt);
          o.currentPos.y = THREE.MathUtils.damp(o.currentPos.y, _targetPos.y, 12, dt);
          o.currentPos.z = THREE.MathUtils.damp(o.currentPos.z, _targetPos.z, 10, dt);
        }

        o.group.position.copy(o.currentPos);
        o.ringMesh.rotation.z = elapsed * (0.9 + i * 0.12);

        const targetScale = isDragged
          ? hoveredBucketKeyLocal
            ? 0.78
            : 1.15
          : isHovered
            ? 1.12
            : 1.0;
        o.scaleLerp = THREE.MathUtils.damp(o.scaleLerp, targetScale, 12, dt);
        o.group.scale.setScalar(o.scaleLerp);

        const heightAboveFloor = Math.max(0, o.currentPos.y - (o.homePos.y - 0.5));
        const shadowScale = THREE.MathUtils.clamp(1.12 - heightAboveFloor * 0.32, 0.48, 1.12);
        o.shadowMesh.position.set(o.currentPos.x, o.homePos.y - 0.76, o.homePos.z);
        o.shadowMesh.scale.setScalar(isDragged ? 0.4 : shadowScale);
        o.shadowMat.opacity = isDragged ? 0.1 : shadowScale * 0.28;
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

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden bg-[#060c1a]">
      {/* Real Three.js 3D WebGL Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle Bottom Guidance Text (NO domain names shown anywhere on Stage 1 icons!) */}
      {!dockedTarget && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <p className="text-xs font-medium tracking-wide text-sky-200/80 bg-[#081226]/90 border border-sky-400/25 rounded-xl px-3.5 py-1.5">
            {isDraggingTopic
              ? hoveredBucketLabel
                ? `Release to drop into ${hoveredBucketLabel}`
                : 'Drop icon into any month bucket above'
              : switchingMonthKey
                ? 'Updating reference period…'
                : 'Drag any jumping icon into a month bucket above, or click an icon to begin'}
          </p>
        </div>
      )}

      {/* Red Alert if Month Toggling / Reference Context Sync is Unavailable */}
      {monthSwitchError && (
        <div className="absolute top-4 inset-x-0 z-20 flex justify-center px-4">
          <div
            role="alert"
            className="max-w-md rounded-2xl border border-red-700/80 bg-[#2a0b10] px-4 py-2.5 text-xs font-semibold text-red-200 flex items-center justify-between gap-3"
          >
            <span>{monthSwitchError}</span>
            {onDismissMonthSwitchError && (
              <button
                type="button"
                onClick={onDismissMonthSwitchError}
                aria-label="Dismiss alert"
                className="p-1 rounded-lg hover:bg-red-900/60"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Question Overlay after Dropping Icon into Month Bucket (NO backdrop-blur over WebGL) */}
      {dockedTarget && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-[#030712]/72">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-3xl border border-sky-400/45 bg-[#0a1528] p-6 sm:p-7 shadow-[0_28px_70px_rgba(2,6,23,0.85)] space-y-4 text-slate-100"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: dockedTarget.topic.accentHex }}
                />
                <span className="tabular-nums">{dockedTarget.month.fullLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDockedTarget(null);
                  setValidationError(null);
                }}
                aria-label="Close question prompt"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                htmlFor="prod-stage1-question"
                className="block font-display text-lg font-semibold text-white mb-2"
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
                className="w-full resize-none rounded-2xl border border-sky-400/35 bg-[#060d1c] px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
              />
              {validationError && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-400">
                  {validationError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDockedTarget(null);
                  setValidationError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 transition-colors cursor-pointer disabled:opacity-60"
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
