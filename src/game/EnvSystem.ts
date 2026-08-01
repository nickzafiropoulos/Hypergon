import { len, norm, rnd, TAU } from './maths';
import type { BossDef, EnvSpawn } from './bosses';
import type { EnvProp, Particle, Player, Ring } from './types';
import { ringFx, spark } from './particles';

export type EnvHooks = {
  W: number;
  H: number;
  parts: Particle[];
  rings: Ring[];
  spawnMinion?: (x: number, y: number) => void;
};

export class EnvSystem {
  props: EnvProp[] = [];

  clear(): void {
    this.props.length = 0;
  }

  spawnFromDef(def: BossDef, hooks: EnvHooks, bossX: number, bossY: number): void {
    this.clear();
    for (const spec of def.env) {
      this.spawnSpec(spec, hooks, bossX, bossY);
    }
  }

  private spawnSpec(spec: EnvSpawn, hooks: EnvHooks, bx: number, by: number): void {
    const pts = this.layoutPoints(spec, hooks.W, hooks.H, bx, by);
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]!;
      const p: EnvProp = {
        kind: spec.kind,
        x,
        y,
        r: spec.r ?? 18,
        hp: spec.hp ?? 20,
        maxhp: spec.hp ?? 20,
        col: spec.col ?? '#63f7ff',
        ang: rnd(TAU),
        life: 1e9,
        reflective: spec.reflective,
        healsBoss: spec.healsBoss,
        hurtPlayer: spec.hurtPlayer,
        hurtBoss: spec.hurtBoss,
        slow: spec.slow,
        orbitR: spec.orbitR,
        orbitSpd: 0.9 + i * 0.12,
        orbitAng: (i / Math.max(1, pts.length)) * TAU,
        dead: false,
        flash: 0,
        cd: rnd(1.4, 0.6),
        tag: spec.tag,
      };
      if (spec.kind === 'well') {
        p.x = bx;
        p.y = by;
        p.r = spec.r ?? 140;
        p.hp = 9999;
      }
      if (spec.kind === 'spike' || spec.kind === 'mine') {
        p.hp = spec.hp ?? 999;
      }
      this.props.push(p);
    }
  }

  private layoutPoints(
    spec: EnvSpawn,
    W: number,
    H: number,
    bx: number,
    by: number,
  ): [number, number][] {
    const n = spec.count;
    const out: [number, number][] = [];
    const pad = 70;
    if (spec.layout === 'corners') {
      const corners: [number, number][] = [
        [pad, pad],
        [W - pad, pad],
        [pad, H - pad],
        [W - pad, H - pad],
      ];
      for (let i = 0; i < Math.min(n, corners.length); i++) out.push(corners[i]!);
      return out;
    }
    if (spec.layout === 'edge') {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const side = i % 4;
        if (side === 0) out.push([pad * 0.55, pad + t * (H - pad * 2)]);
        else if (side === 1) out.push([W - pad * 0.55, pad + t * (H - pad * 2)]);
        else if (side === 2) out.push([pad + t * (W - pad * 2), pad * 0.55]);
        else out.push([pad + t * (W - pad * 2), H - pad * 0.55]);
      }
      return out;
    }
    if (spec.layout === 'sides') {
      const midY = H / 2;
      const midX = W / 2;
      const pts: [number, number][] = [
        [pad + 40, midY - 80],
        [pad + 40, midY + 80],
        [W - pad - 40, midY - 80],
        [W - pad - 40, midY + 80],
        [midX - 100, pad + 40],
        [midX + 100, pad + 40],
      ];
      for (let i = 0; i < Math.min(n, pts.length); i++) out.push(pts[i]!);
      return out;
    }
    if (spec.layout === 'ring') {
      const R = spec.orbitR ?? 110;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        out.push([bx + Math.cos(a) * R, by + Math.sin(a) * R]);
      }
      return out;
    }
    // point
    out.push([bx, by]);
    return out;
  }

  countAlive(kind?: EnvProp['kind'], tag?: string): number {
    let n = 0;
    for (const p of this.props) {
      if (p.dead) continue;
      if (kind && p.kind !== kind) continue;
      if (tag && p.tag !== tag) continue;
      n++;
    }
    return n;
  }

  update(
    dt: number,
    hooks: EnvHooks,
    boss: { x: number; y: number; vx: number; vy: number; r: number } | null,
    player: Player,
    onHurtPlayer: () => void,
    onHurtBoss: (amount: number) => void,
  ): void {
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i]!;
      if (p.dead) {
        this.props.splice(i, 1);
        continue;
      }
      p.flash = Math.max(0, p.flash - dt);
      p.ang += dt * 0.8;

      if (p.kind === 'satellite' && boss) {
        p.orbitAng = (p.orbitAng || 0) + (p.orbitSpd || 1) * dt;
        const R = p.orbitR || 110;
        p.x = boss.x + Math.cos(p.orbitAng) * R;
        p.y = boss.y + Math.sin(p.orbitAng) * R;
      }

      if (p.kind === 'well' && boss) {
        p.x = boss.x;
        p.y = boss.y;
      }

      if (p.kind === 'nest') {
        p.cd = (p.cd || 0) - dt;
        if (p.cd <= 0) {
          p.cd = 2.4;
          hooks.spawnMinion?.(p.x + rnd(20, -20), p.y + rnd(20, -20));
        }
      }

      if (p.kind === 'zone') {
        p.life -= dt;
        if (p.life <= 0) {
          p.dead = true;
          continue;
        }
      }

      // Player contact
      if (p.hurtPlayer && len(player.x - p.x, player.y - p.y) < p.r + player.r) {
        if (p.kind === 'mine') {
          this.destroyProp(p, hooks);
          onHurtPlayer();
        } else if (p.kind === 'spike' || p.kind === 'satellite' || p.kind === 'nest') {
          onHurtPlayer();
        } else if (p.kind === 'zone' && (p.slow || 0) <= 0) {
          onHurtPlayer();
        }
      }

      // Boss contact with mines / spikes
      if (boss && p.hurtBoss && len(boss.x - p.x, boss.y - p.y) < p.r + boss.r * 0.85) {
        if (p.kind === 'mine') {
          this.destroyProp(p, hooks);
          onHurtBoss(48);
        } else if (p.kind === 'spike') {
          onHurtBoss(32 * dt);
          // soft push boss inward
          const [nx, ny] = norm(hooks.W / 2 - boss.x, hooks.H / 2 - boss.y);
          boss.vx += nx * 40 * dt;
          boss.vy += ny * 40 * dt;
        }
      }
    }
  }

  /** Apply gravity wells to player. Returns slow multiplier from zones. */
  applyForces(dt: number, player: Player, reverse = false): number {
    let slow = 1;
    for (const p of this.props) {
      if (p.dead) continue;
      if (p.kind === 'well') {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        const d = len(dx, dy) || 1;
        if (d < p.r * 2.2) {
          const str = (reverse ? -1 : 1) * 520 * (1 - d / (p.r * 2.2));
          player.vx += (dx / d) * str * dt;
          player.vy += (dy / d) * str * dt;
        }
      }
      if (p.kind === 'zone' && p.slow && len(player.x - p.x, player.y - p.y) < p.r) {
        slow = Math.min(slow, p.slow);
      }
    }
    return slow;
  }

  bossInSlowZone(boss: { x: number; y: number }): boolean {
    for (const p of this.props) {
      if (p.dead || p.kind !== 'zone' || !p.slow) continue;
      if (len(boss.x - p.x, boss.y - p.y) < p.r) return true;
    }
    return false;
  }

  damageProp(p: EnvProp, amount: number, hooks: EnvHooks): boolean {
    if (p.dead || p.kind === 'spike' || p.kind === 'well' || p.kind === 'zone') return false;
    p.hp -= amount;
    p.flash = 0.12;
    if (p.hp <= 0) {
      this.destroyProp(p, hooks);
      return true;
    }
    spark(hooks.parts, p.x, p.y, p.col, 4, 160, 0.3, 2);
    return false;
  }

  destroyProp(p: EnvProp, hooks: EnvHooks): void {
    if (p.dead) return;
    p.dead = true;
    spark(hooks.parts, p.x, p.y, p.col, 14, 280, 0.55, 2.4);
    ringFx(hooks.rings, p.x, p.y, p.col, p.r * 0.6, p.r * 3.5, 0.35);
  }

  tryBlockBullet(
    x: number,
    y: number,
    r: number,
  ): { hit: EnvProp; reflective: boolean } | null {
    for (const p of this.props) {
      if (p.dead) continue;
      if (p.kind !== 'pillar' && p.kind !== 'crystal' && p.kind !== 'nest' && p.kind !== 'satellite')
        continue;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 <= (r + p.r) ** 2) {
        return { hit: p, reflective: !!p.reflective };
      }
    }
    return null;
  }

  spawnMine(x: number, y: number, col = '#b8ff3d'): void {
    this.props.push({
      kind: 'mine',
      x,
      y,
      r: 12,
      hp: 1,
      maxhp: 1,
      col,
      ang: 0,
      life: 1e9,
      hurtPlayer: true,
      hurtBoss: true,
      dead: false,
      flash: 0,
    });
  }

  spawnZone(x: number, y: number, r: number, life: number, slow: number, col: string): void {
    this.props.push({
      kind: 'zone',
      x,
      y,
      r,
      hp: 999,
      maxhp: 999,
      col,
      ang: 0,
      life,
      slow,
      hurtPlayer: false,
      dead: false,
      flash: 0,
    });
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    for (const p of this.props) {
      if (p.dead) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      const flash = p.flash > 0;
      ctx.globalAlpha = flash ? 1 : 0.9;
      ctx.strokeStyle = flash ? '#fff' : p.col;
      ctx.fillStyle = flash ? 'rgba(255,255,255,0.25)' : p.col + '22';
      ctx.lineWidth = 2.2;

      switch (p.kind) {
        case 'crystal':
        case 'pillar': {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            const rr = p.r * (i % 2 === 0 ? 1 : 0.62);
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'spike': {
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + (i * TAU) / 3;
            const x = Math.cos(a) * p.r;
            const y = Math.sin(a) * p.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        }
        case 'mine': {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + t * 2;
            const x = Math.cos(a) * p.r;
            const y = Math.sin(a) * p.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, TAU);
          ctx.fill();
          break;
        }
        case 'well': {
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(0, 0, p.r * (0.7 + 0.08 * Math.sin(t * 3)), 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.35, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'zone': {
          ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 4);
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, TAU);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'nest': {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * p.r * 0.7, Math.sin(a) * p.r * 0.7);
          }
          ctx.stroke();
          break;
        }
        case 'satellite': {
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i * TAU) / 5;
            const x = Math.cos(a) * p.r;
            const y = Math.sin(a) * p.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
  }

  healTick(dt: number): number {
    let heal = 0;
    for (const p of this.props) {
      if (p.dead || !p.healsBoss) continue;
      heal += 6 * dt;
    }
    return heal;
  }
}
