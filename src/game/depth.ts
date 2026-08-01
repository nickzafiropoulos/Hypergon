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

/** Coin/card tumble foreshortening — never fully vanishes. */
export function flipScale(phase: number, min = 0.22): number {
  return Math.max(min, Math.abs(Math.cos(phase)));
}

/** Mild vertical squash from travel speed / lateral lean (seekers). */
export function bankScale(vx: number, vy: number, amount = 0.14): number {
  const sp = Math.hypot(vx, vy);
  if (sp < 1e-4) return 1;
  const t = Math.min(1, sp / 280);
  const hx = Math.abs(vx) / sp;
  return Math.max(0.78, 1 - amount * t * (0.45 + hx * 0.55));
}
