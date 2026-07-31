import { MAX_PARTICLES, MAX_RINGS } from './catalogue';
import { rnd, TAU } from './maths';
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
      size,
      drag: 0.965,
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
