let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctor();
  }
  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume().catch(() => undefined);
  }
  return sharedAudioContext;
}

export function warmAudioContext(): void {
  try {
    getAudioContext();
  } catch {
    // Ignore Web Audio errors
  }
}

export function playBucketDropCue(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Soft bubble-plop drop sound + subtle sparkle overtone
    const dropOsc = ctx.createOscillator();
    const dropGain = ctx.createGain();
    dropOsc.type = 'sine';
    dropOsc.frequency.setValueAtTime(340, now);
    dropOsc.frequency.exponentialRampToValueAtTime(620, now + 0.085);

    dropGain.gain.setValueAtTime(0.0001, now);
    dropGain.gain.linearRampToValueAtTime(0.16, now + 0.012);
    dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

    dropOsc.connect(dropGain);
    dropGain.connect(ctx.destination);
    dropOsc.start(now);
    dropOsc.stop(now + 0.19);

    const pingOsc = ctx.createOscillator();
    const pingGain = ctx.createGain();
    pingOsc.type = 'triangle';
    pingOsc.frequency.setValueAtTime(880, now + 0.055);
    pingGain.gain.setValueAtTime(0.0001, now + 0.055);
    pingGain.gain.linearRampToValueAtTime(0.075, now + 0.07);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    pingOsc.connect(pingGain);
    pingGain.connect(ctx.destination);
    pingOsc.start(now + 0.055);
    pingOsc.stop(now + 0.26);
  } catch {
    // Ignore Web Audio errors
  }
}

export function playBucketExpandCue(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

interface ActiveAmbientSession {
  stop: () => void;
  setDucked: (ducked: boolean) => void;
}

let activeAmbientSession: ActiveAmbientSession | null = null;
let desiredAmbientDucked = false;

interface ScoreStep {
  mel?: number;
  hold?: number; // seconds
  scoop?: number; // frequency multiplier for playful Mickey upward scoop (e.g. 0.944 = -1 semitone)
  bass?: number;
  chord?: readonly [number, number, number];
}

// 8-bar (64 eighth-note steps) gentle, lighthearted Mickey-style cartoon stroll in C Major
// Warm midrange marimba/woodwind voices, tiptoe bass, cozy chord cushions, and natural phrasing rests
const MICKEY_STROLL_SCORE: readonly ScoreStep[] = [
  // Bar 1: Cmaj6 cheerful tiptoe pickup ("step-hop-wink!")
  { mel: 329.63, hold: 0.24, bass: 130.81, chord: [130.81, 196.0, 329.63] },
  { mel: 392.0, hold: 0.22 },
  { mel: 440.0, hold: 0.34, scoop: 0.94387, bass: 196.0 },
  {}, // breathing rest
  { mel: 392.0, hold: 0.24, bass: 164.81 },
  { mel: 329.63, hold: 0.24 },
  { mel: 261.63, hold: 0.34, bass: 196.0 },
  {},

  // Bar 2: Fmaj7 -> G7 playful raised-eyebrow chromatic wink
  { mel: 293.66, hold: 0.24, bass: 174.61, chord: [174.61, 220.0, 329.63] },
  { mel: 349.23, hold: 0.24 },
  { mel: 440.0, hold: 0.28, bass: 130.81 },
  { mel: 392.0, hold: 0.24 },
  { mel: 369.99, hold: 0.22, bass: 146.83 }, // playful F#4 chuckle
  { mel: 392.0, hold: 0.26, scoop: 0.94387 },
  { mel: 329.63, hold: 0.38, bass: 98.0 },
  {},

  // Bar 3: Am7 -> Dm7 warm & meaningful optimistic turn
  { mel: 329.63, hold: 0.24, bass: 110.0, chord: [110.0, 196.0, 261.63] },
  { mel: 523.25, hold: 0.32, scoop: 0.94387 },
  { mel: 493.88, hold: 0.24, bass: 164.81 },
  { mel: 440.0, hold: 0.26 },
  { mel: 392.0, hold: 0.24, bass: 146.83, chord: [146.83, 220.0, 261.63] },
  { mel: 349.23, hold: 0.24 },
  { mel: 329.63, hold: 0.24, bass: 174.61 },
  { mel: 293.66, hold: 0.28 },

  // Bar 4: G13 -> C cozy turnaround bounce
  { mel: 293.66, hold: 0.24, bass: 98.0, chord: [98.0, 196.0, 293.66] },
  { mel: 329.63, hold: 0.24 },
  { mel: 392.0, hold: 0.24, bass: 146.83 },
  { mel: 493.88, hold: 0.24 },
  { mel: 523.25, hold: 0.4, bass: 130.81, chord: [130.81, 196.0, 329.63] },
  {},
  { bass: 98.0 },
  { mel: 392.0, hold: 0.22 },

  // Bar 5: Light celesta skip (Section B)
  { mel: 392.0, hold: 0.24, bass: 130.81, chord: [130.81, 196.0, 329.63] },
  { mel: 523.25, hold: 0.26 },
  { mel: 587.33, hold: 0.28, scoop: 0.94387, bass: 196.0 },
  { mel: 523.25, hold: 0.24 },
  { mel: 440.0, hold: 0.24, bass: 164.81 },
  { mel: 392.0, hold: 0.24 },
  { mel: 329.63, hold: 0.34, bass: 130.81 },
  {},

  // Bar 6: Funny cartoon "oops-tiptoe" step
  { mel: 329.63, hold: 0.3, scoop: 0.94387, bass: 174.61, chord: [174.61, 220.0, 349.23] },
  { mel: 392.0, hold: 0.24 },
  { mel: 440.0, hold: 0.26, bass: 146.83 },
  { mel: 349.23, hold: 0.24 },
  { mel: 293.66, hold: 0.24, bass: 98.0, chord: [98.0, 196.0, 293.66] },
  { mel: 493.88, hold: 0.26, scoop: 0.8909 },
  { mel: 392.0, hold: 0.36, bass: 146.83 },
  {},

  // Bar 7: Heartwarming rising bridge
  { mel: 523.25, hold: 0.26, bass: 110.0, chord: [110.0, 196.0, 329.63] },
  { mel: 440.0, hold: 0.24 },
  { mel: 392.0, hold: 0.24, bass: 164.81 },
  { mel: 329.63, hold: 0.24 },
  { mel: 349.23, hold: 0.24, bass: 174.61, chord: [174.61, 220.0, 261.63] },
  { mel: 440.0, hold: 0.26 },
  { mel: 392.0, hold: 0.24, bass: 146.83 },
  { mel: 349.23, hold: 0.24 },

  // Bar 8: Gentle Mickey wink home + cozy silence before looping
  { mel: 329.63, hold: 0.24, bass: 98.0, chord: [98.0, 196.0, 293.66] },
  { mel: 293.66, hold: 0.24 },
  { mel: 246.94, hold: 0.24, bass: 196.0 },
  { mel: 293.66, hold: 0.24 },
  { mel: 261.63, hold: 0.44, bass: 130.81, chord: [130.81, 196.0, 329.63] },
  { mel: 523.25, hold: 0.34, scoop: 0.94387 },
  {},
  {},
];

export function setBucketAmbientMusicDucked(ducked: boolean): void {
  desiredAmbientDucked = ducked;
  activeAmbientSession?.setDucked(ducked);
}

export function stopBucketAmbientMusic(): void {
  if (activeAmbientSession) {
    const session = activeAmbientSession;
    activeAmbientSession = null;
    session.stop();
  }
}

export function startBucketAmbientMusic(): () => void {
  if (activeAmbientSession) {
    return activeAmbientSession.stop;
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return () => undefined;

    let stopped = false;
    let fadeStarted = false;
    const now = ctx.currentTime;

    // Warm lowpass rolls off any shrill harmonics so listening stays pleasant indefinitely
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1120, now);
    filter.Q.setValueAtTime(0.55, now);

    const duckGain = ctx.createGain();
    duckGain.gain.setValueAtTime(desiredAmbientDucked ? 0.16 : 1.0, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);

    filter.connect(duckGain);
    duckGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Whisper-soft warm sine harmony pad underneath
    const padOscs: OscillatorNode[] = [];
    const padGains: GainNode[] = [];
    const initialPad: readonly [number, number, number] = [130.81, 196.0, 329.63];
    for (const freq of initialPad) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.055, now);
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      padOscs.push(osc);
      padGains.push(g);
    }

    const ensureFadeIn = () => {
      if (fadeStarted || stopped || ctx.state !== 'running') return;
      fadeStarted = true;
      const t = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), t);
      masterGain.gain.linearRampToValueAtTime(0.052, t + 0.9);
    };

    const handleVisibilityChange = () => {
      if (stopped || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), t);
      if (document.visibilityState === 'hidden') {
        masterGain.gain.linearRampToValueAtTime(0.0001, t + 0.25);
      } else {
        masterGain.gain.linearRampToValueAtTime(0.052, t + 0.65);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (ctx.state === 'running') {
      ensureFadeIn();
    }

    const detachUnlock = () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };

    const unlockAudio = () => {
      if (stopped) return;
      if (ctx.state === 'suspended') {
        void ctx.resume()
          .then(() => {
            if (stopped) return;
            ensureFadeIn();
            if (ctx.state === 'running') {
              detachUnlock();
            }
          })
          .catch(() => undefined);
      } else {
        ensureFadeIn();
        detachUnlock();
      }
    };

    if (ctx.state === 'suspended') {
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }

    let step = 0;
    let timerId: number | null = null;

    const scheduleStep = () => {
      if (stopped) return;

      const isOdd = step % 2 === 1;
      // Gentle cartoon swing: ~107 BPM lilt without rushing
      const stepDelayMs = isOdd ? 295 : 262;
      timerId = window.setTimeout(scheduleStep, stepDelayMs);

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (ctx.state !== 'running') {
        return;
      }

      ensureFadeIn();
      const s = MICKEY_STROLL_SCORE[step % MICKEY_STROLL_SCORE.length];
      const t = ctx.currentTime;

      if (s.chord) {
        padOscs[0]?.frequency.setTargetAtTime(s.chord[0], t, 0.32);
        padOscs[1]?.frequency.setTargetAtTime(s.chord[1], t, 0.32);
        padOscs[2]?.frequency.setTargetAtTime(s.chord[2], t, 0.32);
      }

      // Tiptoe pizzicato cartoon bass
      if (s.bass) {
        const bOsc = ctx.createOscillator();
        const bHarm = ctx.createOscillator();
        const bHarmGain = ctx.createGain();
        const bGain = ctx.createGain();

        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(s.bass, t);

        bHarm.type = 'triangle';
        bHarm.frequency.setValueAtTime(s.bass * 2, t);
        bHarmGain.gain.setValueAtTime(0.11, t);

        bGain.gain.setValueAtTime(0.0001, t);
        bGain.gain.linearRampToValueAtTime(0.24, t + 0.012);
        bGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.165);

        bOsc.connect(bGain);
        bHarm.connect(bHarmGain);
        bHarmGain.connect(bGain);
        bGain.connect(filter);

        bOsc.start(t);
        bHarm.start(t);
        bOsc.stop(t + 0.185);
        bHarm.stop(t + 0.185);
      }

      // Warm marimba / woodwind-whistle melody with playful upward Mickey scoops
      if (s.mel) {
        const dur = s.hold ?? 0.25;
        const mOsc = ctx.createOscillator();
        const mOver = ctx.createOscillator();
        const mOverGain = ctx.createGain();
        const mGain = ctx.createGain();

        mOsc.type = 'sine';
        if (s.scoop) {
          mOsc.frequency.setValueAtTime(s.mel * s.scoop, t);
          mOsc.frequency.exponentialRampToValueAtTime(s.mel, t + 0.044);
        } else {
          mOsc.frequency.setValueAtTime(s.mel, t);
        }

        mOver.type = 'triangle';
        if (s.scoop) {
          mOver.frequency.setValueAtTime(s.mel * 2 * s.scoop, t);
          mOver.frequency.exponentialRampToValueAtTime(s.mel * 2, t + 0.044);
        } else {
          mOver.frequency.setValueAtTime(s.mel * 2, t);
        }
        mOverGain.gain.setValueAtTime(0.085, t);

        mGain.gain.setValueAtTime(0.0001, t);
        mGain.gain.linearRampToValueAtTime(0.28, t + 0.018);
        mGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        mOsc.connect(mGain);
        mOver.connect(mOverGain);
        mOverGain.connect(mGain);
        mGain.connect(filter);

        mOsc.start(t);
        mOver.start(t);
        mOsc.stop(t + dur + 0.03);
        mOver.stop(t + dur + 0.03);
      }

      step = (step + 1) % MICKEY_STROLL_SCORE.length;
    };

    scheduleStep();

    const setDucked = (ducked: boolean) => {
      if (stopped) return;
      try {
        const t = ctx.currentTime;
        duckGain.gain.setTargetAtTime(ducked ? 0.16 : 1.0, t, 0.14);
      } catch {
        // ignore
      }
    };

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (activeAmbientSession?.stop === cleanup) {
        activeAmbientSession = null;
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      detachUnlock();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      try {
        const t = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(t);
        masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), t);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        window.setTimeout(() => {
          for (const osc of padOscs) {
            try {
              osc.stop();
              osc.disconnect();
            } catch {
              // ignore
            }
          }
          for (const g of padGains) {
            try {
              g.disconnect();
            } catch {
              // ignore
            }
          }
          try {
            filter.disconnect();
            duckGain.disconnect();
            masterGain.disconnect();
          } catch {
            // ignore
          }
        }, 400);
      } catch {
        // ignore
      }
    };

    activeAmbientSession = { stop: cleanup, setDucked };
    return cleanup;
  } catch {
    return () => undefined;
  }
}

export function playLaunchTransitionCue(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Popping ascending crystalline sweep as Stage 2 spinning ball launches
    const notes = [440.0, 587.33, 880.0];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.065;
      const duration = idx === notes.length - 1 ? 0.34 : 0.18;

      const osc = ctx.createOscillator();
      const shimmer = ctx.createOscillator();
      const gain = ctx.createGain();
      const shimmerGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.015, start + duration);

      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(freq * 2, start);
      shimmerGain.gain.setValueAtTime(0.14, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      shimmer.start(start);
      osc.stop(start + duration + 0.02);
      shimmer.stop(start + duration + 0.02);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

export function playIntroPopInMusic(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => undefined);
      return;
    }

    const now = ctx.currentTime;

    // 1. Crisp cartoon bubble "bloop-pop!" upward scoop as the icon drops in
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(320, now);
    popOsc.frequency.exponentialRampToValueAtTime(780, now + 0.09);

    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(0.14, now + 0.014);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    popOsc.connect(popGain);
    popGain.connect(ctx.destination);
    popOsc.start(now);
    popOsc.stop(now + 0.14);

    // 2. Cheerful 3-note flash pop-in chime (C5 -> E5 -> G5)
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const start = now + 0.07 + idx * 0.068;
      const osc = ctx.createOscillator();
      const harm = ctx.createOscillator();
      const harmGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      harm.type = 'triangle';
      harm.frequency.setValueAtTime(freq * 2, start);
      harmGain.gain.setValueAtTime(0.09, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);

      osc.connect(gain);
      harm.connect(harmGain);
      harmGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      harm.start(start);
      osc.stop(start + 0.22);
      harm.stop(start + 0.22);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

export function playIntroBucketSwellMusic(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => undefined);
      return;
    }

    const now = ctx.currentTime;
    // Soft luminous swell shimmer chord (C5 -> G5 -> D6 -> E6) while bucket enlarges
    const notes = [523.25, 783.99, 1174.66, 1318.51];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.065;
      const dur = idx === notes.length - 1 ? 0.38 : 0.26;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

export function playIntroPopOutMusic(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => undefined);
      return;
    }

    const now = ctx.currentTime;

    // 1. Springy "pop-out!" bubble release (high -> bright dip -> hop)
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(860, now);
    popOsc.frequency.exponentialRampToValueAtTime(420, now + 0.075);
    popOsc.frequency.exponentialRampToValueAtTime(587.33, now + 0.14);

    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(0.13, now + 0.012);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

    popOsc.connect(popGain);
    popGain.connect(ctx.destination);
    popOsc.start(now);
    popOsc.stop(now + 0.19);

    // 2. Playful descending-resolving flash notes (G5 -> E5 -> C5) as ball glides back
    const notes = [783.99, 659.25, 523.25];
    notes.forEach((freq, idx) => {
      const start = now + 0.085 + idx * 0.075;
      const dur = idx === notes.length - 1 ? 0.28 : 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

export function playReplyChime(isError = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = isError ? [392.0, 311.13] : [523.25, 783.99];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.11;
      const duration = idx === 0 ? 0.16 : 0.24;

      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(freq * 2, start);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.18, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      harmonic.start(start);
      osc.stop(start + duration + 0.02);
      harmonic.stop(start + duration + 0.02);
    });
  } catch {
    // Ignore Web Audio errors
  }
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

export function showDesktopNotification(title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    const cleanBody = body.replace(/\s+/g, ' ').trim();
    const preview = cleanBody.length > 180 ? `${cleanBody.slice(0, 177)}...` : cleanBody;
    const brandedTitle = title.includes("What's up") ? title : `What's up · ${title}`;
    const finalTitle = brandedTitle.includes('🤙') ? brandedTitle : `🤙 ${brandedTitle}`;
    const note = new Notification(finalTitle, {
      body: preview,
      icon: '/favicon.svg',
      silent: true, // Custom Web Audio chime handles sound cleanly without double beep
    });
    note.onclick = () => {
      window.focus();
      note.close();
    };
    setTimeout(() => note.close(), 6000);
    return true;
  } catch {
    return false;
  }
}
