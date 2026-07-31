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
