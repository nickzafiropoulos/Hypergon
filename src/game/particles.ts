import { MAX_PARTICLES, MAX_RINGS } from './catalogue';
import { pick, rnd, TAU } from './maths';
import type { Particle, Ring } from './types';

export function spark(
  parts: Particle[],
  x: number,
  y: number,
  col: string,
  count: number,
  speed: number,
  life = 1,
  size = 2.4,
  drag = 0.965,
): void {
  const room = MAX_PARTICLES - parts.length;
  const n = Math.min(count, Math.max(0, room));
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU);
    const s = speed * rnd(1, 0.15);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * rnd(1, 0.45),
      max: life,
      col,
      size: size * rnd(1.15, 0.7),
      drag,
      z: rnd(0.85, 0.12),
    });
  }
}

/** Scatter with a rotating colour palette for denser, more colourful bursts. */
function sparkMix(
  parts: Particle[],
  x: number,
  y: number,
  palette: string[],
  count: number,
  speed: number,
  life: number,
  size: number,
  drag = 0.965,
): void {
  const room = MAX_PARTICLES - parts.length;
  const n = Math.min(count, Math.max(0, room));
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU);
    const s = speed * rnd(1, 0.12);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * rnd(1, 0.4),
      max: life,
      col: palette[i % palette.length]!,
      size: size * rnd(1.25, 0.55),
      drag,
      z: rnd(0.9, 0.08),
    });
  }
}

export function pushParticle(parts: Particle[], p: Particle): void {
  if (parts.length >= MAX_PARTICLES) {
    parts.splice(0, Math.ceil(parts.length * 0.15));
  }
  parts.push(p);
}

export function ringFx(
  rings: Ring[],
  x: number,
  y: number,
  col: string,
  r0: number,
  r1: number,
  life: number,
): void {
  if (rings.length >= MAX_RINGS) rings.shift();
  rings.push({ x, y, col, r: r0, r1, life, max: life });
}

function killPalette(col: string): string[] {
  return [
    col,
    '#ffffff',
    '#eaf6ff',
    '#63f7ff',
    '#ff3fa4',
    '#ffb02e',
    '#b8ff3d',
    '#a98bff',
    col,
    '#ffe08a',
    '#ff8fd0',
    '#9ee9ff',
  ];
}

/**
 * Dense multicolour kill burst — core flash, shrapnel, debris, streaks, shock rings.
 * `power` scales count/speed/size (≈0.7 small foe → ≈2.5 singularity).
 */
export function explode(
  parts: Particle[],
  rings: Ring[],
  x: number,
  y: number,
  col: string,
  power = 1,
): void {
  const p = Math.max(0.35, power);
  const palette = killPalette(col);

  // Blinding white core
  spark(parts, x, y, '#ffffff', Math.round(40 * p), 860 * p, 0.34, 3.5, 0.95);
  // Dense mixed shrapnel cloud
  sparkMix(parts, x, y, palette, Math.round(72 * p), 560 * p, 1.0, 3.3);
  // Enemy-coloured mid burst
  spark(parts, x, y, col, Math.round(48 * p), 420 * p, 1.1, 3.6);
  // Slow chunky debris in accent colours
  sparkMix(parts, x, y, palette, Math.round(32 * p), 210 * p, 1.5, 4.8, 0.972);
  // Tiny glitter
  sparkMix(parts, x, y, ['#ffffff', '#63f7ff', '#ffb02e', '#ff3fa4', '#b8ff3d'], Math.round(44 * p), 700 * p, 0.5, 1.7, 0.94);

  // Dense radial streaks
  const streaks = Math.round(48 * p);
  const room = Math.max(0, MAX_PARTICLES - parts.length);
  const n = Math.min(streaks, room);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * TAU + rnd(0.2, -0.2);
    const s = 620 * p * rnd(1.3, 0.35);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.78 * rnd(1, 0.35),
      max: 0.78,
      col: pick(palette),
      size: rnd(4.6, 1.7) * Math.min(p, 2.1),
      drag: 0.91,
      z: rnd(0.6, 0.05),
    });
  }

  // Extra short sparks at random offsets for denser volume
  const nests = Math.round(8 * p);
  for (let i = 0; i < nests; i++) {
    const ox = rnd(22, -22) * p;
    const oy = rnd(22, -22) * p;
    sparkMix(
      parts,
      x + ox,
      y + oy,
      palette,
      Math.round(14 * p),
      320 * p,
      0.75,
      2.6,
    );
  }

  ringFx(rings, x, y, col, 10 * p, 110 * p + 48, 0.5);
  ringFx(rings, x, y, '#ffffff', 5, 56 * p + 22, 0.3);
  ringFx(rings, x, y, '#ff3fa4', 6 * p, 82 * p + 28, 0.38);
  ringFx(rings, x, y, '#63f7ff', 4 * p, 64 * p + 20, 0.34);
  ringFx(rings, x, y, '#ffb02e', 3 * p, 48 * p + 14, 0.28);
  if (p > 0.95) {
    ringFx(rings, x, y, '#ffb02e', 14 * p, 145 * p, 0.6);
    ringFx(rings, x, y, col, 18 * p, 170 * p, 0.52);
    ringFx(rings, x, y, '#a98bff', 8 * p, 100 * p, 0.4);
  }
}
