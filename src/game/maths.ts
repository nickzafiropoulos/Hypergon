export const TAU = Math.PI * 2;

export const rnd = (a = 1, b = 0): number => b + Math.random() * (a - b);
export const rndi = (a: number, b: number): number => (rnd(a, b) | 0);
export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const pick = <T>(arr: readonly T[]): T =>
  arr[(Math.random() * arr.length) | 0]!;

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

export function angDiff(a: number, b: number): number {
  let d = (a - b + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

/** Spawn-in ease: scale + opacity from 0→1 over a birth timer. */
export function spawnVisual(birth: number, birthMax: number): { alpha: number; scale: number } {
  if (birthMax <= 0 || birth <= 0) return { alpha: 1, scale: 1 };
  const t = clamp(1 - birth / birthMax, 0, 1);
  const e = 1 - Math.pow(1 - t, 3);
  return {
    alpha: e,
    scale: 0.18 + 0.82 * e,
  };
}
