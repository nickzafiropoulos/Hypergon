import { rnd } from './maths';

let actx: AudioContext | null = null;
let muted = false;
let lastBlip = 0;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

function ensureCtx(): AudioContext | null {
  try {
    if (!actx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actx = new AC();
    }
    if (actx.state === 'suspended') void actx.resume();
    return actx;
  } catch {
    return null;
  }
}

export function resumeAudio(): void {
  ensureCtx();
}

export function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.06,
  slide = 0,
): void {
  if (muted) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, freq + slide),
        ctx.currentTime + dur,
      );
    }
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export function noise(dur = 0.25, vol = 0.2): void {
  if (muted) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  try {
    const n = (ctx.sampleRate * dur) | 0;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    s.connect(f).connect(g).connect(ctx.destination);
    s.start();
  } catch {
    /* ignore */
  }
}

export const SFX = {
  shoot() {
    const t = performance.now();
    if (t - lastBlip < 38) return;
    lastBlip = t;
    tone(rnd(760, 620), 0.05, 'square', 0.028, -260);
  },
  rail() {
    tone(140, 0.32, 'sawtooth', 0.08, 620);
    noise(0.18, 0.12);
  },
  arc() {
    tone(rnd(1500, 1100), 0.09, 'sawtooth', 0.035, -700);
  },
  pop() {
    noise(0.22, 0.16);
    tone(rnd(200, 140), 0.2, 'triangle', 0.05, -90);
  },
  big() {
    noise(0.5, 0.3);
    tone(70, 0.55, 'sine', 0.12, -40);
  },
  gem() {
    tone(rnd(1450, 1150), 0.06, 'sine', 0.035, 320);
  },
  power() {
    tone(520, 0.09, 'sine', 0.07, 0);
    setTimeout(() => tone(780, 0.09, 'sine', 0.07), 70);
    setTimeout(() => tone(1180, 0.16, 'sine', 0.07), 140);
  },
  weapon() {
    tone(300, 0.08, 'square', 0.06, 0);
    setTimeout(() => tone(600, 0.14, 'square', 0.06, 180), 80);
  },
  bomb() {
    noise(0.9, 0.34);
    tone(52, 0.9, 'sine', 0.16, -20);
  },
  death() {
    noise(1.0, 0.3);
    tone(300, 0.9, 'sawtooth', 0.1, -260);
  },
};
