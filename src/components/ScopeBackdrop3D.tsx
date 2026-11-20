import { useEffect, useRef } from 'react';
import type { ConversationScope } from '../types/workbench';

interface ScopeBackdrop3DProps {
  scope: ConversationScope;
  isSending?: boolean;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
}

interface ConstellationNode {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
}

interface OutwardParticle {
  dirX: number;
  dirY: number;
  dirZ: number;
  progress: number;
  speed: number;
  size: number;
  bright: boolean;
}

// Deterministic PRNG so constellation & particles never flicker on re-mount
function createSeededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  sinX: number,
  cosX: number,
  sinY: number,
  cosY: number,
  out: Vec3,
) {
  // Rotate around Y
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;
  // Rotate around X
  const y2 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  out.x = x1;
  out.y = y2;
  out.z = z2;
}

export function ScopeBackdrop3D({ scope, isSending = false }: ScopeBackdrop3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scopeRef = useRef<ConversationScope>(scope);
  const sendingRef = useRef<boolean>(isSending);

  scopeRef.current = scope;
  sendingRef.current = isSending;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const rand = createSeededRandom(20261120);

    // Pre-allocated constellation & particle buffers (zero per-frame allocations)
    const constellationNodes: ConstellationNode[] = Array.from({ length: 34 }, () => ({
      x: (rand() - 0.5) * 2.3,
      y: (rand() - 0.5) * 1.65,
      z: (rand() - 0.5) * 1.4,
      size: 1.8 + rand() * 2.2,
      phase: rand() * Math.PI * 2,
    }));

    // Pre-compute static topological neighbors within distance threshold
    const constellationLinks: Array<[number, number, number]> = [];
    for (let i = 0; i < constellationNodes.length; i++) {
      for (let j = i + 1; j < constellationNodes.length; j++) {
        const a = constellationNodes[i];
        const b = constellationNodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < 0.78) {
          constellationLinks.push([i, j, 1 - d / 0.78]);
        }
      }
    }

    const outwardParticles: OutwardParticle[] = Array.from({ length: 84 }, () => {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      return {
        dirX: Math.sin(phi) * Math.cos(theta),
        dirY: Math.cos(phi) * 0.75,
        dirZ: Math.sin(phi) * Math.sin(theta),
        progress: rand(),
        speed: 0.055 + rand() * 0.085,
        size: 1.1 + rand() * 1.9,
        bright: rand() > 0.45,
      };
    });

    const nodeProjected: ProjectedPoint[] = constellationNodes.map(() => ({
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
    }));
    const tmpVec: Vec3 = { x: 0, y: 0, z: 0 };

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const updateSize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;
    const onMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    motionQuery.addEventListener?.('change', onMotionChange);

    // Subtle pointer parallax (damped smoothly)
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      targetParallaxX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      targetParallaxY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let rotY = 0.2;
    let rotX = 0.14;
    let elapsed = 0;
    let lastTime = performance.now();
    let rafId = 0;
    let isDisposed = false;

    const drawConstellation = (dt: number, isPrivateWhite: boolean) => {
      const sendingBoost = sendingRef.current ? 1.45 : 1;
      rotY -= dt * 0.068 * sendingBoost;
      rotX += dt * 0.018;

      const damp = 1 - Math.exp(-3.5 * dt);
      currentParallaxX += (targetParallaxX - currentParallaxX) * damp;
      currentParallaxY += (targetParallaxY - currentParallaxY) * damp;

      const spanX = width * 0.46;
      const spanY = height * 0.44;
      const scaleRef = Math.min(width, height) * 0.52;
      const cx = width * 0.5 + currentParallaxX * 26;
      const cy = height * 0.49 + currentParallaxY * 18;
      const fov = scaleRef * 3.2;

      // 1. Subtle Atmospheric Glow (kept minimal on white so background stays crisp white)
      if (!isPrivateWhite) {
        const pubGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scaleRef * 1.55);
        pubGlow.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
        pubGlow.addColorStop(0.45, 'rgba(14, 165, 233, 0.07)');
        pubGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = pubGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, scaleRef * 1.55, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Radiating Outward Wave Field Rings
      for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
        const waveCycle = (elapsed * 0.14 + ringIdx / 3) % 1;
        const ringRadius = scaleRef * (0.28 + waveCycle * 1.35);
        const ringAlpha = Math.sin(waveCycle * Math.PI) * (isPrivateWhite ? 0.17 : 0.22);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.22 + ringIdx * 0.12);
        ctx.scale(1, 0.52);
        ctx.strokeStyle = isPrivateWhite
          ? `rgba(2, 132, 199, ${ringAlpha.toFixed(3)})`
          : `rgba(56, 189, 248, ${ringAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Project 3D Constellation Nodes
      const sinX = Math.sin(rotX + currentParallaxY * 0.06);
      const cosX = Math.cos(rotX + currentParallaxY * 0.06);
      const sinY = Math.sin(rotY + currentParallaxX * 0.08);
      const cosY = Math.cos(rotY + currentParallaxX * 0.08);

      for (let i = 0; i < constellationNodes.length; i++) {
        const n = constellationNodes[i];
        const driftX = Math.sin(elapsed * 0.35 + n.phase) * 0.04;
        const driftY = Math.cos(elapsed * 0.28 + n.phase) * 0.04;
        rotatePoint(
          (n.x + driftX) * spanX,
          (n.y + driftY) * spanY,
          n.z * scaleRef,
          sinX,
          cosX,
          sinY,
          cosY,
          tmpVec,
        );
        const perspective = fov / Math.max(fov * 0.35, fov - tmpVec.z);
        nodeProjected[i].x = cx + tmpVec.x * perspective;
        nodeProjected[i].y = cy + tmpVec.y * perspective;
        nodeProjected[i].z = tmpVec.z;
        nodeProjected[i].scale = perspective;
      }

      // 4. Draw Interconnected Constellation Links + Animated Signal Pulses
      for (let i = 0; i < constellationLinks.length; i++) {
        const [ia, ib, strength] = constellationLinks[i];
        const pa = nodeProjected[ia];
        const pb = nodeProjected[ib];
        const avgZ = (pa.z + pb.z) * 0.5;
        const depthNorm = Math.max(0, Math.min(1, (avgZ / scaleRef + 1) * 0.5));
        const alpha =
          (isPrivateWhite ? 0.07 + depthNorm * 0.20 : 0.06 + depthNorm * 0.22) *
          (0.45 + strength * 0.55);

        ctx.strokeStyle = isPrivateWhite
          ? `rgba(2, 132, 199, ${alpha.toFixed(3)})`
          : `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.75 + depthNorm * 0.85;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();

        // Occasional signal pulse gliding along links
        if (i % 4 === 0) {
          const pulseT = (elapsed * 0.42 * sendingBoost + i * 0.19) % 1;
          const px = pa.x + (pb.x - pa.x) * pulseT;
          const py = pa.y + (pb.y - pa.y) * pulseT;
          ctx.fillStyle = isPrivateWhite
            ? `rgba(14, 165, 233, ${(0.34 + depthNorm * 0.42).toFixed(3)})`
            : `rgba(125, 211, 252, ${(0.28 + depthNorm * 0.45).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Render Constellation Nodes with crisp glow
      for (let i = 0; i < nodeProjected.length; i++) {
        const p = nodeProjected[i];
        const node = constellationNodes[i];
        const depthNorm = Math.max(0, Math.min(1, (p.z / scaleRef + 1) * 0.5));
        const twinkle = 0.8 + 0.2 * Math.sin(elapsed * 1.4 + node.phase);
        const radius = node.size * p.scale * twinkle;

        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4.2);
        halo.addColorStop(
          0,
          isPrivateWhite
            ? `rgba(56, 189, 248, ${(0.22 + depthNorm * 0.24).toFixed(3)})`
            : `rgba(125, 211, 252, ${(0.38 + depthNorm * 0.42).toFixed(3)})`,
        );
        halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isPrivateWhite
          ? `rgba(2, 132, 199, ${(0.42 + depthNorm * 0.46).toFixed(3)})`
          : `rgba(186, 230, 253, ${(0.45 + depthNorm * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, radius * 0.85), 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Outward-Traveling Particles drifting toward screen edges
      const maxReach = Math.hypot(width, height) * 0.58;
      for (let i = 0; i < outwardParticles.length; i++) {
        const pt = outwardParticles[i];
        pt.progress += dt * pt.speed * sendingBoost;
        if (pt.progress >= 1) {
          pt.progress -= 1;
        }

        const r = scaleRef * 0.14 + pt.progress * maxReach;
        rotatePoint(
          pt.dirX * r,
          pt.dirY * r,
          pt.dirZ * r * 0.65,
          sinX * 0.5,
          cosX,
          sinY * 0.6,
          cosY,
          tmpVec,
        );
        const perspective = fov / Math.max(fov * 0.35, fov - tmpVec.z);
        const sx = cx + tmpVec.x * perspective;
        const sy = cy + tmpVec.y * perspective;
        const fade = Math.sin(pt.progress * Math.PI);

        if (isPrivateWhite) {
          ctx.fillStyle = pt.bright
            ? `rgba(14, 165, 233, ${(fade * 0.48).toFixed(3)})`
            : `rgba(56, 189, 248, ${(fade * 0.38).toFixed(3)})`;
        } else {
          ctx.fillStyle = pt.bright
            ? `rgba(125, 211, 252, ${(fade * 0.68).toFixed(3)})`
            : `rgba(56, 189, 248, ${(fade * 0.48).toFixed(3)})`;
        }
        ctx.beginPath();
        ctx.arc(sx, sy, pt.size * perspective, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const renderFrame = (now: number) => {
      if (isDisposed) return;

      const rawDelta = (now - lastTime) / 1000;
      lastTime = now;
      const dt = prefersReducedMotion ? 0 : Math.min(0.05, Math.max(0.001, rawDelta));
      elapsed += dt;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      drawConstellation(dt, scopeRef.current === 'private');

      if (!prefersReducedMotion && !document.hidden) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden && !prefersReducedMotion && !isDisposed) {
        lastTime = performance.now();
        window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(renderFrame);
      } else if (document.hidden) {
        window.cancelAnimationFrame(rafId);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      motionQuery.removeEventListener?.('change', onMotionChange);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [scope]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
