/** Fake radial depth — pulls screen points slightly toward a focus (bowl). */
export function projectBowl(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
): { x: number; y: number; depth: number } {
  if (strength <= 0 || radius <= 0) {
    return { x, y, depth: 0 };
  }
  const dx = x - cx;
  const dy = y - cy;
  const nd = Math.hypot(dx, dy) / radius;
  const t = nd * nd;
  const k = 1 + Math.min(1.8, t) * strength;
  return {
    x: cx + dx / k,
    y: cy + dy / k,
    depth: Math.min(1, t),
  };
}

/** Near (0) → far (1) scale for spark streaks. */
export function depthScale(depth: number, near = 1.2, far = 0.55): number {
  const d = depth < 0 ? 0 : depth > 1 ? 1 : depth;
  return near + (far - near) * d;
}
