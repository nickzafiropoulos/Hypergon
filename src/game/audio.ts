import { rnd } from './maths';

let actx: AudioContext | null = null;
let muted = false;
let lastBlip = 0;
let lastHit = 0;
let lastLance = 0;
let lastBounce = 0;

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
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

/** Soften stacked SFX — keep the mix from clipping. */
function voice(vol: number): number {
  return vol * 0.85;
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
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(voice(vol), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch {
    /* ignore */
  }
}

/** Two stacked oscillators for thicker hits. */
function chord(
  f1: number,
  f2: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slide = 0,
): void {
  tone(f1, dur, type, vol * 0.7, slide);
  tone(f2, dur, type, vol * 0.45, slide * 0.85);
}

export function noise(
  dur = 0.25,
  vol = 0.2,
  cutoff = 1400,
  type: BiquadFilterType = 'lowpass',
): void {
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
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(voice(vol), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t0);
  } catch {
    /* ignore */
  }
}

function later(ms: number, fn: () => void): void {
  setTimeout(fn, ms);
}

export const SFX = {
  /** UI / run start */
  launch() {
    chord(220, 330, 0.12, 'sine', 0.05, 180);
    later(90, () => chord(440, 660, 0.18, 'sine', 0.055, 220));
  },

  swap() {
    tone(380, 0.04, 'square', 0.035, 160);
    later(40, () => tone(560, 0.05, 'square', 0.03, 80));
  },

  sector() {
    tone(196, 0.12, 'sine', 0.06, 0);
    later(100, () => tone(247, 0.12, 'sine', 0.06, 0));
    later(200, () => tone(330, 0.22, 'sine', 0.07, 80));
  },

  /** Weapons */
  shoot() {
    const t = performance.now();
    if (t - lastBlip < 34) return;
    lastBlip = t;
    tone(rnd(820, 640), 0.045, 'square', 0.026, -320);
    tone(rnd(1600, 1200), 0.025, 'triangle', 0.012, -600);
  },

  scatter() {
    noise(0.1, 0.1, 2800, 'bandpass');
    tone(160, 0.12, 'square', 0.05, -70);
    later(20, () => tone(120, 0.08, 'sawtooth', 0.03, -40));
  },

  swarm() {
    tone(rnd(980, 820), 0.11, 'sine', 0.035, -280);
    later(30, () => tone(rnd(720, 580), 0.1, 'triangle', 0.025, -160));
  },

  lance() {
    const t = performance.now();
    if (t - lastLance < 70) return;
    lastLance = t;
    tone(180 + rnd(40), 0.08, 'sawtooth', 0.018, 40);
    tone(720 + rnd(80), 0.06, 'triangle', 0.012, -40);
  },

  arc() {
    noise(0.06, 0.08, 4200, 'highpass');
    tone(rnd(1700, 1200), 0.08, 'sawtooth', 0.04, -900);
    later(35, () => tone(rnd(2200, 1600), 0.05, 'square', 0.02, -1100));
  },

  rail() {
    tone(90, 0.08, 'sawtooth', 0.05, 40);
    later(40, () => {
      tone(160, 0.28, 'sawtooth', 0.07, 720);
      tone(2400, 0.18, 'triangle', 0.04, -1400);
      noise(0.22, 0.14, 2200);
    });
  },

  /** Combat feedback */
  hit() {
    const t = performance.now();
    if (t - lastHit < 45) return;
    lastHit = t;
    tone(rnd(420, 300), 0.03, 'triangle', 0.02, -180);
  },

  bounce() {
    const t = performance.now();
    if (t - lastBounce < 60) return;
    lastBounce = t;
    tone(980, 0.04, 'square', 0.028, -520);
    noise(0.04, 0.05, 3000, 'highpass');
  },

  /** Kill — pitch rises slightly with hit chain. */
  pop(chain = 1) {
    const p = 1 + Math.min(chain, 8) * 0.055;
    noise(0.16, 0.12, 1800);
    tone(rnd(220, 150) * p, 0.16, 'triangle', 0.048, -100 * p);
    tone(rnd(520, 380) * p, 0.08, 'sine', 0.022, -200);
  },

  big() {
    noise(0.55, 0.28, 900);
    tone(60, 0.5, 'sine', 0.14, -25);
    later(80, () => tone(110, 0.35, 'sawtooth', 0.06, -50));
  },

  comboMax() {
    chord(660, 990, 0.1, 'sine', 0.05, 120);
    later(70, () => chord(880, 1320, 0.16, 'sine', 0.055, 80));
  },

  gem() {
    tone(rnd(1500, 1200), 0.05, 'sine', 0.032, 380);
    later(40, () => tone(rnd(1900, 1600), 0.05, 'triangle', 0.02, 200));
  },

  multUp(mult: number) {
    const base = 480 + Math.min(mult, 40) * 6;
    tone(base, 0.07, 'sine', 0.045, 0);
    later(55, () => tone(base * 1.33, 0.1, 'sine', 0.05, 160));
  },

  power() {
    tone(480, 0.08, 'sine', 0.06, 0);
    later(65, () => tone(720, 0.08, 'sine', 0.06, 0));
    later(130, () => tone(1080, 0.14, 'sine', 0.065, 200));
  },

  weapon() {
    tone(280, 0.07, 'square', 0.05, 0);
    later(70, () => tone(560, 0.1, 'square', 0.05, 160));
    later(140, () => tone(840, 0.12, 'triangle', 0.04, 80));
  },

  bomb() {
    noise(0.85, 0.32, 700);
    tone(48, 0.85, 'sine', 0.15, -18);
    later(60, () => noise(0.35, 0.12, 1600));
  },

  shield() {
    tone(880, 0.12, 'sine', 0.055, -520);
    tone(1320, 0.1, 'triangle', 0.03, -700);
    noise(0.08, 0.06, 3500, 'highpass');
  },

  hurt() {
    noise(0.35, 0.18, 1200);
    tone(240, 0.35, 'sawtooth', 0.08, -160);
    later(90, () => tone(140, 0.28, 'triangle', 0.06, -60));
  },

  death() {
    noise(0.95, 0.28, 1000);
    tone(280, 0.85, 'sawtooth', 0.09, -240);
    later(120, () => tone(90, 0.7, 'sine', 0.08, -40));
  },

  gameOver() {
    tone(330, 0.25, 'sawtooth', 0.06, -80);
    later(180, () => tone(220, 0.35, 'sawtooth', 0.06, -60));
    later(360, () => {
      tone(110, 0.7, 'sine', 0.08, -30);
      noise(0.5, 0.12, 800);
    });
  },

  singularity() {
    tone(70, 0.4, 'sine', 0.07, -20);
    later(100, () => noise(0.3, 0.1, 600));
    later(200, () => tone(55, 0.5, 'sawtooth', 0.05, 15));
  },

  drone() {
    const t = performance.now();
    if (t - lastBlip < 28) return;
    lastBlip = t;
    tone(1280, 0.03, 'square', 0.018, -300);
  },

  enemyShot() {
    tone(160, 0.14, 'sawtooth', 0.035, -60);
    noise(0.05, 0.04, 900);
  },
};
