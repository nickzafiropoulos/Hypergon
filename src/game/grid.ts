export type GridPoint = {
  ax: number;
  ay: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export class WarpGrid {
  gap = 42;
  cols = 0;
  rows = 0;
  points: GridPoint[] = [];
  private active = false;
  private idleFrames = 0;
  reduced = false;

  build(W: number, H: number): void {
    this.gap = this.reduced || Math.min(W, H) < 700 ? 52 : 42;
    this.cols = Math.ceil(W / this.gap) + 2;
    this.rows = Math.ceil(H / this.gap) + 2;
    this.points = new Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ax = (c - 1) * this.gap;
        const ay = (r - 1) * this.gap;
        this.points[r * this.cols + c] = { ax, ay, x: ax, y: ay, vx: 0, vy: 0 };
      }
    }
    this.active = false;
  }

  impulse(x: number, y: number, power: number, radius: number): void {
    const m = 3;
    const gap = this.gap;
    const c0 = Math.max(0, Math.floor((x - radius) / gap) + 1 - m);
    const c1 = Math.min(this.cols - 1, Math.ceil((x + radius) / gap) + 1 + m);
    const r0 = Math.max(0, Math.floor((y - radius) / gap) + 1 - m);
    const r1 = Math.min(this.rows - 1, Math.ceil((y + radius) / gap) + 1 + m);
    const r2 = radius * radius;
    const P = power * 60;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const p = this.points[r * this.cols + c]!;
        const dx = p.x - x;
        const dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2 || d2 < 4) continue;
        const d = Math.sqrt(d2);
        const f = (P * (1 - d / radius)) / d;
        p.vx += dx * f;
        p.vy += dy * f;
        this.active = true;
        this.idleFrames = 0;
      }
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    const damp = Math.pow(0.9, dt * 60);
    const MAXPULL = 92;
    let moving = false;
    const couple = !this.reduced;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const p = this.points[i]!;
        const ox = p.x - p.ax;
        const oy = p.y - p.ay;

        if (couple) {
          let nx = 0;
          let ny = 0;
          let n = 0;
          if (c > 0) {
            const q = this.points[i - 1]!;
            nx += q.x - q.ax;
            ny += q.y - q.ay;
            n++;
          }
          if (c < this.cols - 1) {
            const q = this.points[i + 1]!;
            nx += q.x - q.ax;
            ny += q.y - q.ay;
            n++;
          }
          if (r > 0) {
            const q = this.points[i - this.cols]!;
            nx += q.x - q.ax;
            ny += q.y - q.ay;
            n++;
          }
          if (r < this.rows - 1) {
            const q = this.points[i + this.cols]!;
            nx += q.x - q.ax;
            ny += q.y - q.ay;
            n++;
          }
          if (n) {
            p.vx += ((nx / n) - ox) * 260 * dt;
            p.vy += ((ny / n) - oy) * 260 * dt;
          }
        }

        p.vx += -ox * 70 * dt;
        p.vy += -oy * 70 * dt;
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const dx = p.x - p.ax;
        const dy = p.y - p.ay;
        const dd = Math.hypot(dx, dy);
        if (dd > MAXPULL) {
          p.x = p.ax + (dx / dd) * MAXPULL;
          p.y = p.ay + (dy / dd) * MAXPULL;
          p.vx *= 0.4;
          p.vy *= 0.4;
        }
        if (Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(dx) + Math.abs(dy) > 0.4) {
          moving = true;
        }
      }
    }

    if (!moving) {
      this.idleFrames++;
      if (this.idleFrames > 8) this.active = false;
    } else {
      this.idleFrames = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 1;
    ctx.beginPath();
    const hot: GridPoint[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const p = this.points[i]!;
        if (c < this.cols - 1) {
          const q = this.points[i + 1]!;
          const s =
            Math.abs(p.x - p.ax) +
            Math.abs(q.x - q.ax) +
            Math.abs(p.y - p.ay) +
            Math.abs(q.y - q.ay);
          if (s > 16) hot.push(p, q);
          else {
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
          }
        }
        if (r < this.rows - 1) {
          const q = this.points[i + this.cols]!;
          const s =
            Math.abs(p.x - p.ax) +
            Math.abs(q.x - q.ax) +
            Math.abs(p.y - p.ay) +
            Math.abs(q.y - q.ay);
          if (s > 16) hot.push(p, q);
          else {
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
          }
        }
      }
    }
    ctx.strokeStyle = 'rgba(58,84,158,.42)';
    ctx.stroke();
    if (hot.length) {
      ctx.beginPath();
      for (let i = 0; i < hot.length; i += 2) {
        ctx.moveTo(hot[i]!.x, hot[i]!.y);
        ctx.lineTo(hot[i + 1]!.x, hot[i + 1]!.y);
      }
      ctx.strokeStyle = 'rgba(126,196,255,.85)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
}
