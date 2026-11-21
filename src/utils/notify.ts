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
}

let activeAmbientSession: ActiveAmbientSession | null = null;

// Lush dreamy progression: Cmaj9 -> Fmaj7 -> Am9 -> G6
const AMBIENT_CHORDS: ReadonlyArray<ReadonlyArray<number>> = [
  [261.63, 329.63, 392.0, 493.88, 587.33],
  [220.0, 261.63, 349.23, 440.0, 523.25],
  [220.0, 261.63, 329.63, 493.88, 659.25],
  [196.0, 246.94, 329.63, 392.0, 587.33],
];

export function stopBucketAmbientMusic(): void {
  if (activeAmbientSession) {
    const session = activeAmbientSession;
    activeAmbientSession = null;
    session.stop();
  }
}

export function startBucketAmbientMusic(): () => void {
  stopBucketAmbientMusic();

  try {
    const ctx = getAudioContext();
    if (!ctx) return () => undefined;

    let stopped = false;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(860, now);
    filter.Q.setValueAtTime(0.7, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(0.075, now + 0.75);

    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Subtle warm sustained pad voices
    const padOscs: OscillatorNode[] = [];
    const padGains: GainNode[] = [];
    const padInitialFreqs = [130.81, 196.0, 246.94];
    for (const freq of padInitialFreqs) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.24, now);
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      padOscs.push(osc);
      padGains.push(g);
    }

    let step = 0;
    const playSoftPluck = () => {
      if (stopped) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }

      const chordIndex = Math.floor(step / 4) % AMBIENT_CHORDS.length;
      const chord = AMBIENT_CHORDS[chordIndex];
      const noteFreq = chord[(step * 2 + (step % 3)) % chord.length];
      const t = ctx.currentTime;

      // Gently shift warm pad root on bar transitions
      if (step % 4 === 0) {
        const rootScale = chord[0] * 0.5;
        const fifthScale = chord[2] * 0.5;
        const ninthScale = chord[3] * 0.5;
        padOscs[0]?.frequency.setTargetAtTime(rootScale, t, 0.45);
        padOscs[1]?.frequency.setTargetAtTime(fifthScale, t, 0.45);
        padOscs[2]?.frequency.setTargetAtTime(ninthScale, t, 0.45);
      }

      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const overtoneGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, t);

      overtone.type = 'triangle';
      overtone.frequency.setValueAtTime(noteFreq * 2, t);
      overtoneGain.gain.setValueAtTime(0.12, t);

      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.linearRampToValueAtTime(0.32, t + 0.09);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.95);

      osc.connect(noteGain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(noteGain);
      noteGain.connect(filter);

      osc.start(t);
      overtone.start(t);
      osc.stop(t + 2.05);
      overtone.stop(t + 2.05);

      step += 1;
    };

    playSoftPluck();
    const intervalId = window.setInterval(playSoftPluck, 780);

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(intervalId);
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
            masterGain.disconnect();
          } catch {
            // ignore
          }
        }, 400);
      } catch {
        // ignore
      }
    };

    activeAmbientSession = { stop: cleanup };
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
