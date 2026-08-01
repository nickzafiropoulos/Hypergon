/** Full-screen neon confetti behind the overlay panel. */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  spin: number;
  col: string;
  shape: 0 | 1 | 2;
};

const COLORS = ['#63f7ff', '#ff3fa4', '#ffb02e', '#b8ff3d', '#ffffff', '#7cf9ff', '#ff8fd0'];

let raf = 0;
let canvas: HTMLCanvasElement | null = null;
let onResize: (() => void) | null = null;

function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function stopConfetti(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (onResize) {
    removeEventListener('resize', onResize);
    onResize = null;
  }
  if (canvas) {
    canvas.remove();
    canvas = null;
  }
}

function spawnBurst(parts: Particle[], cx: number, cy: number, count: number, speedScale: number): void {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = (180 + Math.random() * 520) * speedScale;
    const life = 2.4 + Math.random() * 2.2;
    parts.push({
      x: cx + (Math.random() - 0.5) * 60,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed * 0.7 - 120 - Math.random() * 220,
      life,
      max: life,
      size: 2.2 + Math.random() * 3.2,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      col: COLORS[(Math.random() * COLORS.length) | 0]!,
      shape: ((Math.random() * 3) | 0) as 0 | 1 | 2,
    });
  }
}

function spawnRain(parts: Particle[], w: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const life = 2.8 + Math.random() * 2.4;
    parts.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 180,
      vx: (Math.random() - 0.5) * 140,
      vy: 140 + Math.random() * 280,
      life,
      max: life,
      size: 1.8 + Math.random() * 2.8,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 12,
      col: COLORS[(Math.random() * COLORS.length) | 0]!,
      shape: ((Math.random() * 3) | 0) as 0 | 1 | 2,
    });
  }
}

/** Full-viewport confetti on `#veil`, behind the panel content. */
export function burstBoardConfetti(host: HTMLElement = document.getElementById('veil')!): void {
  stopConfetti();
  if (prefersReducedMotion() || !host) return;

  const c = document.createElement('canvas');
  c.className = 'screen-confetti';
  c.setAttribute('aria-hidden', 'true');
  host.prepend(c);
  canvas = c;

  const ctx = c.getContext('2d');
  if (!ctx) return;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.width = Math.max(2, (w * dpr) | 0);
    c.height = Math.max(2, (h * dpr) | 0);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  onResize = resize;
  addEventListener('resize', resize);

  const w = () => window.innerWidth;
  const h = () => window.innerHeight;

  const parts: Particle[] = [];
  // Big center pop + side bursts + rain so the whole screen fills.
  spawnBurst(parts, w() * 0.5, h() * 0.38, 160, 1.15);
  spawnBurst(parts, w() * 0.18, h() * 0.28, 70, 0.95);
  spawnBurst(parts, w() * 0.82, h() * 0.28, 70, 0.95);
  spawnBurst(parts, w() * 0.5, h() * 0.72, 80, 0.85);
  spawnRain(parts, w(), 120);

  let last = performance.now();
  let elapsed = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    ctx.clearRect(0, 0, w(), h());

    // Keep raining briefly so coverage stays dense.
    if (elapsed < 1.6 && Math.random() < 0.55) {
      spawnRain(parts, w(), 4);
    }
    if (elapsed > 0.35 && elapsed < 0.55) {
      spawnBurst(parts, w() * 0.35, h() * 0.45, 40, 1);
      spawnBurst(parts, w() * 0.65, h() * 0.45, 40, 1);
    }

    let alive = 0;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive++;
      p.life -= dt;
      p.vy += 380 * dt;
      p.vx *= Math.pow(0.99, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;

      const t = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.col;
      ctx.shadowColor = p.col;
      ctx.shadowBlur = 6;
      const s = p.size;
      if (p.shape === 0) {
        // Thin ribbon strip
        ctx.fillRect(-s * 0.9, -s * 0.12, s * 1.8, s * 0.24);
      } else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.7);
        ctx.lineTo(s * 0.35, s * 0.45);
        ctx.lineTo(-s * 0.35, s * 0.45);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (alive > 0 && canvas === c) {
      raf = requestAnimationFrame(tick);
    } else {
      stopConfetti();
    }
  };
  raf = requestAnimationFrame(tick);
}
