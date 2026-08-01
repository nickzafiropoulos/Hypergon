import type { EnemyType, PowerKey, WeaponKey } from './catalogue';
import type {
  BossRuntime,
  DamageSource,
  Drop,
  Enemy,
  Particle,
  Player,
  Ring,
} from './types';
import { BOSS_COUNT, bossAt, type BossDef } from './bosses';
import { bombDamageFor, computeBossDamage, type DamageCtx } from './bossDamage';
import { EnvSystem } from './EnvSystem';
import { clamp, len, norm, pick, rnd, TAU } from './maths';
import { playBossMusic } from './music';
import { ringFx, spark } from './particles';

export type BossHost = {
  W: number;
  H: number;
  parts: Particle[];
  rings: Ring[];
  enemies: Enemy[];
  drops: Drop[];
  player: Player;
  buffs: { magnet: number; timewarp: number };
  score: number;
  addScore: (n: number) => void;
  mult: number;
  kills: number;
  sector: number;
  shake: number;
  elapsed: number;
  toast: (txt: string, sub?: string, ms?: number, col?: string) => void;
  spawnEnemy: (type: EnemyType, x: number, y: number) => Enemy;
  pushScorePop: (x: number, y: number, value: number, col: string) => void;
  gridImpulse: (x: number, y: number, force: number, rad: number) => void;
  onBossVictory: () => void;
  hurtPlayer: () => void;
  spawnBossGems: (x: number, y: number, n: number) => void;
  pushFloatText: (x: number, y: number, text: string, col: string) => void;
  sfxHit: () => void;
  sfxPop: () => void;
  sfxBig: () => void;
  sfxBounce: () => void;
};

type Phase = 'intro' | 'fight' | 'intermission' | 'done';

export class BossDirector {
  env = new EnvSystem();
  boss: BossRuntime | null = null;
  index = 0;
  cleared = 0;
  phase: Phase = 'intro';
  timer = 0;
  gameT = 0;
  private critToastCd = 0;

  reset(): void {
    this.env.clear();
    this.boss = null;
    this.index = 0;
    this.cleared = 0;
    this.phase = 'intro';
    this.timer = 0.6;
    this.gameT = 0;
    this.critToastCd = 0;
  }

  begin(host: BossHost): void {
    this.reset();
    this.spawnFight(host);
  }

  private def(): BossDef {
    return bossAt(this.index);
  }

  /** Roster progress 0→1. */
  private progressT(): number {
    return this.index / Math.max(1, BOSS_COUNT - 1);
  }

  /** HP multiplier — index 0 → 1.0, last → ~2.55. */
  private difficultyScale(index = this.index): number {
    return Math.pow(1.05, index);
  }

  /** Speed — index 0 → 1.0, last → ~1.7. */
  private speedScale(): number {
    return Math.pow(1.028, this.index);
  }

  /** Ability cooldown divisor — index 0 → 1.0, last → ~2.55. */
  private aggroScale(): number {
    return Math.pow(1.05, this.index);
  }

  /** Effective max HP for a roster slot (used to enforce a strict climb). */
  private scaledHpFor(index: number): number {
    const def = bossAt(index);
    return Math.round(def.hp * this.difficultyScale(index));
  }

  private spawnFight(host: BossHost): void {
    const def = this.def();
    const x = host.W / 2;
    const y = host.H * 0.32;
    // Always tougher than the previous fight — no dips in the ladder.
    let hp = this.scaledHpFor(this.index);
    if (this.index > 0) {
      hp = Math.max(hp, Math.round(this.scaledHpFor(this.index - 1) * 1.14));
    }
    const spd = def.spd * this.speedScale();
    const armor =
      def.id === 'aegis_titan'
        ? 3 + (this.index > 10 ? 1 : 0)
        : def.id === 'bulwark_colossus'
          ? 5
          : def.id === 'singularity_apex'
            ? 3
            : 0;
    this.boss = {
      defId: def.id,
      x,
      y,
      vx: 0,
      vy: 0,
      r: def.r,
      hp,
      maxhp: hp,
      col: def.col,
      spd,
      ang: 0,
      spin: 0.6,
      phase: 0,
      dead: false,
      birth: 1.1,
      flash: 0,
      wob: 0,
      sa: 0,
      grow: 0,
      pulse: 0,
      cd: 1.2,
      segs: [],
      armor,
      flags: {},
      open: false,
      solid: true,
      enraged: false,
    };

    if (def.id === 'serpent_regent') {
      for (let i = 0; i < 18; i++) this.boss.segs.push({ x, y, r: 20 - i * 0.55 });
    }
    if (def.id === 'twin_helix') {
      this.boss.segs.push({ x: x + 90, y, r: def.r });
      this.boss.flags.twinHpSync = 0;
      this.boss.flags.lastHit0 = 0;
      this.boss.flags.lastHit1 = 0;
    }
    if (def.id === 'mirror_core') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        this.boss.segs.push({
          x: x + Math.cos(a) * 120,
          y: y + Math.sin(a) * 80,
          r: def.r * 0.92,
        });
      }
      this.boss.flags.real = 0;
    }

    this.env.spawnFromDef(def, this.envHooks(host), x, y);
    this.phase = 'fight';
    this.timer = 0;
    host.sector = this.index + 1;
    playBossMusic(def.id);
    // Name only — tip only on first hard gate.
    host.toast(def.name, '', 1600, def.col);
    this.boss.flags.tipShown = 0;
    ringFx(host.rings, x, y, def.col, def.r * 2, def.r * 0.5, 0.7);
    host.sfxBig();
  }

  /** One-shot tip only when the player hits a damage gate. */
  private offerTip(host: BossHost): void {
    if (!this.boss || this.boss.flags.tipShown) return;
    this.boss.flags.tipShown = 1;
    host.toast('TIP', this.def().blurb, 2400, '#ffb02e');
  }

  private envHooks(host: BossHost) {
    return {
      W: host.W,
      H: host.H,
      parts: host.parts,
      rings: host.rings,
      spawnMinion: (x: number, y: number) => {
        if (host.enemies.length < 40) host.spawnEnemy('shard', x, y);
      },
    };
  }

  update(dt: number, host: BossHost): void {
    this.gameT += dt;
    host.elapsed += dt;
    this.critToastCd = Math.max(0, this.critToastCd - dt);

    if (this.phase === 'intro') {
      this.timer -= dt;
      if (this.timer <= 0) this.spawnFight(host);
      return;
    }

    if (this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.index >= BOSS_COUNT) {
          this.phase = 'done';
          host.onBossVictory();
          return;
        }
        this.spawnFight(host);
      }
      return;
    }

    if (this.phase !== 'fight' || !this.boss || this.boss.dead) return;

    const b = this.boss;
    const def = this.def();
    const ets = host.buffs.timewarp > 0 ? 0.32 : 1;

    if (b.birth > 0) {
      b.birth -= dt;
      return;
    }

    b.flash = Math.max(0, b.flash - dt);
    b.ang += b.spin * dt * ets;
    b.flags.atkCd = Math.max(0, (b.flags.atkCd || 0) - dt);

    // Phase thresholds
    const hpFrac = b.hp / b.maxhp;
    if (hpFrac < 0.66 && b.phase < 1) b.phase = 1;
    if (hpFrac < 0.33 && b.phase < 2 && def.phases >= 3) b.phase = 2;

    this.ai(dt * ets, host, b, def);

    // Crystal heal
    const heal = this.env.healTick(dt);
    if (heal > 0) b.hp = Math.min(b.maxhp, b.hp + heal);

    this.env.update(
      dt,
      this.envHooks(host),
      b,
      host.player,
      () => host.hurtPlayer(),
      (amt) => {
        this.applyDamage(host, amt, { source: 'mine' });
      },
    );

    // Magnets / wells — scale pull with roster progress
    const reverse = host.buffs.magnet > 0 && def.id === 'lodestone';
    this.env.applyForces(dt, host.player, reverse);
    if (def.id === 'void_anchor' || def.id === 'lodestone' || def.id === 'singularity_apex') {
      const pullMul = 1 + this.progressT() * 0.4;
      const pull =
        (def.id === 'lodestone' && reverse ? -380 : def.id === 'void_anchor' ? 480 : 420) * pullMul;
      const reach = 380 + b.r * 0.35;
      const dx = b.x - host.player.x;
      const dy = b.y - host.player.y;
      const d = len(dx, dy) || 1;
      if (d < reach) {
        host.player.vx += (dx / d) * pull * (1 - d / reach) * dt * (reverse ? -1 : 1);
        host.player.vy += (dy / d) * pull * (1 - d / reach) * dt * (reverse ? -1 : 1);
      }
      host.gridImpulse(b.x, b.y, def.id === 'singularity_apex' ? 2.6 : 1.5, b.r * 3);
    }

    // Giants may sit partially off-arena so the player can flank
    const pad = b.r > 140 ? b.r * 0.35 : b.r + 8;
    b.x = clamp(b.x, pad, host.W - pad);
    b.y = clamp(b.y, pad, host.H - pad);
  }

  private ai(dt: number, host: BossHost, b: BossRuntime, def: BossDef): void {
    const [tx, ty] = norm(host.player.x - b.x, host.player.y - b.y);
    const d = len(host.player.x - b.x, host.player.y - b.y);
    b.cd -= dt;
    b.wob += dt;
    const aggro = this.aggroScale();
    const prog = this.progressT();

    switch (def.id) {
      case 'prism': {
        b.sa += dt * (0.7 + prog * 0.35);
        b.vx += tx * b.spd * 1.6 * dt;
        b.vy += ty * b.spd * 1.6 * dt;
        // Plate-slam dash
        if ((b.flags.atkCd || 0) <= 0) {
          b.flags.atkCd = 2.8 / aggro;
          b.vx += tx * (420 + prog * 180);
          b.vy += ty * (420 + prog * 180);
          ringFx(host.rings, b.x, b.y, b.col, b.r * 0.4, b.r * 1.6, 0.28);
          host.gridImpulse(b.x, b.y, 8, b.r * 2);
        }
        this.dampen(b, 0.92);
        this.integrate(b, dt);
        break;
      }
      case 'crown': {
        b.vx += Math.cos(b.wob * 0.7) * (30 + prog * 18) * dt;
        b.vy += Math.sin(b.wob * 0.55) * (24 + prog * 14) * dt;
        this.dampen(b, 0.96);
        this.integrate(b, dt);
        break;
      }
      case 'void_anchor': {
        // Slow drift — giant footprint, not a chase
        b.vx += Math.cos(b.wob * 0.4) * 22 * dt + tx * b.spd * 0.55 * dt;
        b.vy += Math.sin(b.wob * 0.35) * 18 * dt + ty * b.spd * 0.55 * dt;
        b.grow = Math.min(55 + prog * 20, b.grow + dt * (2.2 + prog));
        b.r = def.r + b.grow * 0.4;
        if ((b.flags.atkCd || 0) <= 0) {
          b.flags.atkCd = 3.2 / aggro;
          ringFx(host.rings, b.x, b.y, b.col, b.r * 0.5, b.r * 2.2, 0.45);
          host.gridImpulse(b.x, b.y, 18, b.r * 3.5);
          host.shake = Math.max(host.shake, 12);
          if (d < b.r + 140) {
            host.player.vx -= tx * 380;
            host.player.vy -= ty * 380;
          }
        }
        this.dampen(b, 0.97);
        this.integrate(b, dt);
        break;
      }
      case 'hexstorm': {
        b.vx += tx * b.spd * 2.2 * dt;
        b.vy += ty * b.spd * 2.2 * dt;
        this.dampen(b, 0.9);
        this.integrate(b, dt);
        if (b.cd <= 0) {
          b.cd = (1.05 - b.phase * 0.15) / aggro;
          const n = 1 + (b.phase > 0 ? 1 : 0) + (prog > 0.5 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const a = rnd(TAU);
            const dist = 55 + rnd(70);
            this.env.spawnMine(b.x + Math.cos(a) * dist, b.y + Math.sin(a) * dist);
          }
        }
        break;
      }
      case 'aegis_titan': {
        b.sa += dt * (1.1 + b.phase * 0.35 + prog * 0.25);
        b.vx += tx * b.spd * 1.6 * dt;
        b.vy += ty * b.spd * 1.6 * dt;
        // Shield charge
        if ((b.flags.atkCd || 0) <= 0) {
          b.flags.atkCd = 2.4 / aggro;
          const a = b.sa;
          b.vx += Math.cos(a) * (520 + prog * 200);
          b.vy += Math.sin(a) * (520 + prog * 200);
          ringFx(host.rings, b.x, b.y, '#ffb02e', b.r * 0.3, b.r * 1.8, 0.3);
        }
        this.dampen(b, 0.93);
        this.integrate(b, dt);
        break;
      }
      case 'serpent_regent': {
        b.wob += dt * (2.6 + prog * 0.8);
        const perpx = -ty;
        const perpy = tx;
        const s = Math.sin(b.wob) * (0.95 + prog * 0.25);
        b.vx += (tx + perpx * s) * b.spd * 2.55 * dt;
        b.vy += (ty + perpy * s) * b.spd * 2.55 * dt;
        this.dampen(b, 0.9);
        this.integrate(b, dt);
        let px = b.x;
        let py = b.y;
        const spacing = 16;
        for (const seg of b.segs) {
          const dx = px - seg.x;
          const dy = py - seg.y;
          const dist = len(dx, dy) || 1;
          if (dist > spacing) {
            seg.x += (dx / dist) * (dist - spacing);
            seg.y += (dy / dist) * (dist - spacing);
          }
          px = seg.x;
          py = seg.y;
        }
        break;
      }
      case 'mirror_core': {
        b.vx += tx * b.spd * 2 * dt;
        b.vy += ty * b.spd * 2 * dt;
        this.dampen(b, 0.91);
        this.integrate(b, dt);
        const orbit = 120 + prog * 30;
        for (let i = 0; i < b.segs.length; i++) {
          const a = b.wob * (0.8 + prog * 0.3) + (i / 3) * TAU;
          b.segs[i]!.x = b.x + Math.cos(a) * orbit;
          b.segs[i]!.y = b.y + Math.sin(a) * (orbit * 0.7);
        }
        break;
      }
      case 'phase_lattice': {
        b.flags.phaseT = (b.flags.phaseT || 0) + dt;
        const cycle = host.buffs.timewarp > 0 ? 3.6 : 2.4 - prog * 0.35;
        const solidWindow =
          (host.buffs.timewarp > 0 ? 2.2 : 1.15) * (1 - prog * 0.22);
        const t = b.flags.phaseT % Math.max(1.4, cycle);
        b.solid = t < Math.max(0.55, solidWindow);
        b.vx += tx * b.spd * 1.7 * dt;
        b.vy += ty * b.spd * 1.7 * dt;
        this.dampen(b, 0.93);
        this.integrate(b, dt);
        break;
      }
      case 'starforge': {
        b.vx += Math.cos(b.wob) * 20 * dt;
        b.vy += Math.sin(b.wob * 0.7) * 16 * dt;
        this.dampen(b, 0.97);
        this.integrate(b, dt);
        const vents = this.env.countAlive('crystal', 'vent');
        const rate = ((vents > 0 ? 0.85 : 1.8) - b.phase * 0.12) / aggro;
        if (b.cd <= 0) {
          b.cd = Math.max(0.35, rate);
          const burst = vents > 0 ? 1 + (prog > 0.4 ? 1 : 0) : 1;
          for (let i = 0; i < burst && host.enemies.length < 38; i++) {
            const a = rnd(TAU);
            host.spawnEnemy(
              'seeker',
              b.x + Math.cos(a) * (b.r + 30),
              b.y + Math.sin(a) * (b.r + 30),
            );
          }
        }
        break;
      }
      case 'crystal_nexus': {
        b.vx += tx * b.spd * 1.5 * dt;
        b.vy += ty * b.spd * 1.5 * dt;
        this.dampen(b, 0.94);
        this.integrate(b, dt);
        break;
      }
      case 'pulse_maw': {
        b.flags.mawT = (b.flags.mawT || 0) + dt;
        const cycle = 3.0 - prog * 0.25;
        const t = b.flags.mawT % cycle;
        b.open = t > 1.45 && t < 2.45;
        // Slow orbit when closed; lunge when open
        if (b.open) {
          b.vx += tx * b.spd * 2.4 * dt;
          b.vy += ty * b.spd * 2.4 * dt;
          if (b.cd <= 0) {
            b.cd = 0.32 / aggro;
            if (host.enemies.length < 32) {
              host.spawnEnemy('shard', b.x + tx * (b.r + 10), b.y + ty * (b.r + 10));
            }
            if ((b.flags.atkCd || 0) <= 0) {
              b.flags.atkCd = 1.6 / aggro;
              b.vx += tx * 480;
              b.vy += ty * 480;
              ringFx(host.rings, b.x, b.y, b.col, b.r * 0.4, b.r * 1.5, 0.28);
            }
          }
        } else {
          b.vx += tx * b.spd * 0.9 * dt;
          b.vy += ty * b.spd * 0.9 * dt;
        }
        this.dampen(b, 0.94);
        this.integrate(b, dt);
        break;
      }
      case 'grid_reaver': {
        b.flags.shockT = (b.flags.shockT || 0) - dt;
        b.flags.recovery = Math.max(0, (b.flags.recovery || 0) - dt);
        if (b.flags.shockT <= 0) {
          b.flags.shockT = (3.2 - b.phase * 0.45) / aggro;
          b.flags.recovery = Math.max(0.7, 1.15 - prog * 0.25);
          const knockR = 240 + prog * 100;
          host.shake = Math.max(host.shake, 22 + prog * 8);
          host.gridImpulse(b.x, b.y, 44, Math.max(host.W, host.H));
          ringFx(host.rings, b.x, b.y, b.col, 20, Math.max(host.W, host.H) * (0.45 + prog * 0.1), 0.55);
          if (d < knockR) {
            host.player.vx -= tx * (560 + prog * 180);
            host.player.vy -= ty * (560 + prog * 180);
          }
        }
        b.vx += tx * b.spd * 2 * dt;
        b.vy += ty * b.spd * 2 * dt;
        this.dampen(b, 0.9);
        this.integrate(b, dt);
        break;
      }
      case 'twin_helix': {
        const twin = b.segs[0];
        if (twin) {
          const [t2x, t2y] = norm(host.player.x - twin.x, host.player.y - twin.y);
          twin.x += t2x * b.spd * 1.6 * dt + Math.cos(b.wob) * 40 * dt;
          twin.y += t2y * b.spd * 1.6 * dt + Math.sin(b.wob) * 40 * dt;
          twin.x = clamp(twin.x, b.r + 8, host.W - b.r - 8);
          twin.y = clamp(twin.y, b.r + 8, host.H - b.r - 8);
          b.flags.lastHit0 = (b.flags.lastHit0 || 0) + dt;
          b.flags.lastHit1 = (b.flags.lastHit1 || 0) + dt;
          const regen = 14 + prog * 10;
          if (b.flags.lastHit0 > 2.5 && b.flags.lastHit1 < 1) b.hp = Math.min(b.maxhp, b.hp + regen * dt);
          if (b.flags.lastHit1 > 2.5 && b.flags.lastHit0 < 1) b.hp = Math.min(b.maxhp, b.hp + regen * dt);
        }
        b.vx += tx * b.spd * 1.6 * dt;
        b.vy += ty * b.spd * 1.6 * dt;
        this.dampen(b, 0.91);
        this.integrate(b, dt);
        break;
      }
      case 'lodestone': {
        // Heavy drift + periodic well pulse
        b.vx += tx * b.spd * 1.1 * dt + Math.cos(b.wob * 0.5) * 14 * dt;
        b.vy += ty * b.spd * 1.1 * dt + Math.sin(b.wob * 0.4) * 12 * dt;
        if ((b.flags.atkCd || 0) <= 0) {
          b.flags.atkCd = 2.6 / aggro;
          const strength = (host.buffs.magnet > 0 ? -520 : 620) * (1 + prog * 0.35);
          const reach = 360 + b.r * 0.4;
          if (d < reach) {
            host.player.vx += tx * strength * (1 - d / reach) * 0.08;
            host.player.vy += ty * strength * (1 - d / reach) * 0.08;
          }
          ringFx(host.rings, b.x, b.y, b.col, b.r * 0.5, reach * 0.7, 0.4);
          host.gridImpulse(b.x, b.y, 16, reach);
        }
        this.dampen(b, 0.96);
        this.integrate(b, dt);
        break;
      }
      case 'arc_throne': {
        b.flags.opened = Math.max(0, (b.flags.opened || 0) - dt);
        b.vx += Math.cos(b.wob * 0.5) * 18 * dt;
        b.vy += Math.sin(b.wob * 0.4) * 14 * dt;
        this.dampen(b, 0.97);
        this.integrate(b, dt);
        break;
      }
      case 'railbait': {
        b.flags.telegraph = Math.max(0, (b.flags.telegraph || 0) - dt);
        if ((b.flags.telegraph || 0) <= 0 && b.cd <= 0) {
          b.flags.dashAng = Math.atan2(ty, tx);
          b.flags.telegraph = 0.55 + prog * 0.2;
          b.cd = (1.75 - b.phase * 0.25) / aggro;
          b.flags.pendingDash = 1;
          b.flags.gotCrit = 0;
        }
        if ((b.flags.pendingDash || 0) > 0 && (b.flags.telegraph || 0) <= 0) {
          const a = b.flags.dashAng || 0;
          const dash = (b.enraged ? 980 : 820) * (1 + prog * 0.15);
          b.vx = Math.cos(a) * dash;
          b.vy = Math.sin(a) * dash;
          b.flags.pendingDash = 0;
        }
        if ((b.flags.wasTele || 0) > 0 && (b.flags.telegraph || 0) <= 0 && (b.flags.gotCrit || 0) <= 0) {
          b.enraged = true;
        }
        b.flags.wasTele = (b.flags.telegraph || 0) > 0 ? 1 : 0;
        this.dampen(b, 0.97);
        this.integrate(b, dt);
        break;
      }
      case 'nest_queen': {
        const nests = this.env.countAlive('nest');
        b.flags.nesting = nests > 0 ? 1 : 0;
        if (nests > 0) {
          b.vx += tx * b.spd * 1.1 * dt;
          b.vy += ty * b.spd * 1.1 * dt;
        } else {
          b.vx += tx * b.spd * 2.5 * dt;
          b.vy += ty * b.spd * 2.5 * dt;
          // Respawn pressure when nests are down
          if (b.cd <= 0) {
            b.cd = 5.5 / aggro;
            if (host.enemies.length < 28) {
              const a = rnd(TAU);
              host.spawnEnemy('seeker', b.x + Math.cos(a) * 80, b.y + Math.sin(a) * 80);
              host.spawnEnemy('shard', b.x + Math.cos(a + 1) * 70, b.y + Math.sin(a + 1) * 70);
            }
          }
        }
        this.dampen(b, 0.92);
        this.integrate(b, dt);
        break;
      }
      case 'stasis_warden': {
        if (b.cd <= 0) {
          b.cd = (2.6 - b.phase * 0.3) / aggro;
          this.env.spawnZone(host.player.x, host.player.y, 95 + prog * 20, 5.5, 0.32, '#a98bff');
          if (prog > 0.45) {
            const a = rnd(TAU);
            this.env.spawnZone(
              host.player.x + Math.cos(a) * 90,
              host.player.y + Math.sin(a) * 90,
              70,
              4,
              0.4,
              '#a98bff',
            );
          }
        }
        b.flags.inZone = this.env.bossInSlowZone(b) ? 1 : 0;
        const spdMul = b.flags.inZone ? 0.35 : 1;
        b.vx += tx * b.spd * 2.2 * spdMul * dt;
        b.vy += ty * b.spd * 2.2 * spdMul * dt;
        this.dampen(b, 0.9);
        this.integrate(b, dt);
        break;
      }
      case 'bulwark_colossus': {
        b.sa += dt * (0.7 + prog * 0.2);
        // Slow sweep — giant
        b.vx += Math.cos(b.wob * 0.35) * 28 * dt + tx * b.spd * 0.85 * dt;
        b.vy += Math.sin(b.wob * 0.3) * 22 * dt + ty * b.spd * 0.85 * dt;
        this.dampen(b, 0.95);
        this.integrate(b, dt);
        if ((b.flags.atkCd || 0) <= 0) {
          b.flags.atkCd = 3.4 / aggro;
          host.shake = Math.max(host.shake, 18);
          host.gridImpulse(b.x, b.y, 28, b.r * 3.5);
          ringFx(host.rings, b.x, b.y, b.col, b.r * 0.4, b.r * 2.4, 0.4);
          if (d < b.r + 100) {
            host.player.vx -= tx * 640;
            host.player.vy -= ty * 640;
          }
        }
        if (b.cd <= 0 && host.enemies.length < 14) {
          b.cd = 4.0 / aggro;
          const a = rnd(TAU);
          host.spawnEnemy('bulwark', b.x + Math.cos(a) * (b.r + 40), b.y + Math.sin(a) * (b.r + 40));
        }
        break;
      }
      case 'singularity_apex': {
        b.flags.phaseT = (b.flags.phaseT || 0) + dt;
        if (b.phase >= 2) {
          const cycle = 2.6 - prog * 0.15;
          b.solid = b.flags.phaseT % cycle < 1.25;
        } else b.solid = true;
        b.grow = Math.min(70, b.grow + dt * (1.6 + prog * 0.4));
        b.r = def.r + b.grow * 0.28;
        // Slow orbit + occasional mine ring
        b.vx += Math.cos(b.wob * 0.45) * 20 * dt + tx * b.spd * 0.7 * dt;
        b.vy += Math.sin(b.wob * 0.4) * 16 * dt + ty * b.spd * 0.7 * dt;
        if (b.cd <= 0) {
          b.cd = (2.0 - b.phase * 0.25) / aggro;
          const mines = 2 + b.phase + (prog > 0.7 ? 1 : 0);
          for (let i = 0; i < mines; i++) {
            const a = (i / mines) * TAU + b.ang;
            this.env.spawnMine(
              b.x + Math.cos(a) * (b.r + 50),
              b.y + Math.sin(a) * (b.r + 50),
              '#ff2d55',
            );
          }
          if (host.enemies.length < 22) {
            const a = rnd(TAU);
            host.spawnEnemy('seeker', b.x + Math.cos(a) * (b.r + 20), b.y + Math.sin(a) * (b.r + 20));
          }
        }
        this.dampen(b, 0.96);
        this.integrate(b, dt);
        break;
      }
    }
  }

  private dampen(b: BossRuntime, f: number): void {
    b.vx *= f;
    b.vy *= f;
  }

  private integrate(b: BossRuntime, dt: number): void {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  private dmgCtx(host: BossHost, source: DamageSource, extra: Partial<DamageCtx> = {}): DamageCtx {
    return {
      source,
      magnetActive: host.buffs.magnet > 0,
      healCrystalsAlive: this.env.countAlive('crystal'),
      ventsAlive: this.env.countAlive('crystal', 'vent'),
      nestsAlive: this.env.countAlive('nest'),
      satellitesAlive: this.env.countAlive('satellite'),
      ...extra,
    };
  }

  applyDamage(host: BossHost, amount: number, ctx: DamageCtx): boolean {
    if (!this.boss || this.boss.dead) return false;
    const def = this.def();
    const b = this.boss;
    const result = computeBossDamage(b, def, amount, this.dmgCtx(host, ctx.source, ctx));
    if (result.blocked || result.applied <= 0) {
      if (result.blocked) {
        host.sfxBounce();
        if (result.message && result.message !== 'CRITICAL HIT') this.offerTip(host);
      }
      return false;
    }
    // Late bosses shrug chip fire — crits / mines / bombs stay full strength.
    let dealt = result.applied;
    if (
      result.message !== 'CRITICAL HIT' &&
      ctx.source !== 'bomb' &&
      ctx.source !== 'mine' &&
      ctx.source !== 'env'
    ) {
      dealt *= 1 / (1 + this.progressT() * 1.1);
    }
    b.hp -= dealt;
    b.flash = 0.14;
    // Soft gates still teach once
    if (
      result.message === 'SHELL' ||
      result.message === 'ARMORED' ||
      result.message === 'SHIELDED' ||
      result.message === 'PLATED'
    ) {
      this.offerTip(host);
    }
    if (def.id === 'void_anchor' || def.id === 'singularity_apex') {
      b.grow += result.applied * 0.15;
    }
    if (def.id === 'twin_helix') {
      if ((ctx.twinIndex ?? 0) === 0) b.flags.lastHit0 = 0;
      else b.flags.lastHit1 = 0;
    }
    if (def.id === 'arc_throne' && ctx.source === 'arc') {
      b.flags.opened = 2.5;
    }
    if (def.id === 'railbait' && result.message === 'CRITICAL HIT') {
      b.flags.gotCrit = 1;
    }
    if (result.message === 'CRITICAL HIT' && this.critToastCd <= 0) {
      host.pushFloatText(b.x, b.y - b.r * 0.55, 'CRITICAL HIT', '#ffb02e');
      host.shake = Math.max(host.shake, 8);
      spark(host.parts, b.x, b.y, '#ffb02e', 10, 260, 0.35, 2);
      this.critToastCd = 0.4;
    }
    host.sfxHit();
    spark(host.parts, b.x, b.y, b.col, 5, 180, 0.3, 2);
    if (b.hp <= 0) {
      this.killBoss(host);
      return true;
    }
    return true;
  }

  applyBomb(host: BossHost): void {
    if (!this.boss || this.boss.dead) return;
    const def = this.def();
    const b = this.boss;
    const result = bombDamageFor(b, def);
    if (def.bombPolicy === 'peel' && b.armor > 0) {
      b.armor--;
      b.flash = 0.2;
      host.toast('PLATE STRIPPED', `${b.armor} remaining`, 900, b.col);
      host.sfxBig();
      ringFx(host.rings, b.x, b.y, '#ffffff', b.r, b.r * 2.5, 0.4);
      if (def.id === 'arc_throne') b.flags.opened = 2;
      return;
    }
    if (def.bombPolicy === 'stun') {
      b.flags.opened = 2.2;
      b.flash = 0.15;
    }
    if (result.applied > 0) {
      this.applyDamage(host, result.applied, { source: 'bomb' });
    }
  }

  /** Returns true if a boss hitbox absorbed the shot. */
  tryHit(
    host: BossHost,
    x: number,
    y: number,
    r: number,
    amount: number,
    source: DamageSource,
    opts: { ang?: number; twinOk?: boolean; ricochet?: number } = {},
  ): 'boss' | 'decoy' | 'body' | 'env' | null {
    // Env props first
    const block = this.env.tryBlockBullet(x, y, r);
    if (block) {
      if (block.reflective && source !== 'rail') return 'env';
      this.env.damageProp(block.hit, amount, this.envHooks(host));
      return 'env';
    }

    if (!this.boss || this.boss.dead || this.boss.birth > 0) return null;
    const b = this.boss;
    const def = this.def();
    const ricochet = opts.ricochet ?? 0;

    // Mirror decoys
    if (def.id === 'mirror_core') {
      for (const seg of b.segs) {
        if ((x - seg.x) ** 2 + (y - seg.y) ** 2 <= (r + (seg.r || b.r)) ** 2) {
          // shatter decoy
          spark(host.parts, seg.x, seg.y, b.col, 16, 240, 0.45, 2);
          seg.x = -9999;
          seg.y = -9999;
          return 'decoy';
        }
      }
    }

    // Serpent: head first, then body (body rejects damage)
    if (def.id === 'serpent_regent') {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (r + b.r) ** 2) {
        this.applyDamage(host, amount, {
          source,
          ang: opts.ang ?? Math.atan2(b.y - y, b.x - x),
          ricochet,
        });
        return 'boss';
      }
      for (const seg of b.segs) {
        if ((x - seg.x) ** 2 + (y - seg.y) ** 2 <= (r + 16) ** 2) {
          return 'body';
        }
      }
      return null;
    }

    // Twin secondary
    if (def.id === 'twin_helix' && b.segs[0]) {
      const t = b.segs[0];
      if ((x - t.x) ** 2 + (y - t.y) ** 2 <= (r + (t.r || b.r)) ** 2) {
        this.applyDamage(host, amount, { source, ang: opts.ang, twinIndex: 1, ricochet });
        return 'boss';
      }
    }

    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (r + b.r) ** 2) {
      const ang = opts.ang ?? Math.atan2(b.y - y, b.x - x);
      this.applyDamage(host, amount, {
        source,
        ang,
        twinIndex: 0,
        railTelegraph: def.id === 'railbait' && (b.flags.telegraph || 0) > 0,
        arcHit: source === 'arc',
        ricochet,
      });
      return 'boss';
    }
    return null;
  }

  /** Player contact damage checks. */
  touchesPlayer(player: Player): boolean {
    if (!this.boss || this.boss.dead || this.boss.birth > 0) return false;
    const b = this.boss;
    if (len(player.x - b.x, player.y - b.y) < b.r + player.r) return true;
    if (b.defId === 'serpent_regent') {
      for (const seg of b.segs) {
        if (len(player.x - seg.x, player.y - seg.y) < 16 + player.r) return true;
      }
    }
    if (b.defId === 'twin_helix' && b.segs[0]) {
      const t = b.segs[0];
      if (len(player.x - t.x, player.y - t.y) < (t.r || b.r) + player.r) return true;
    }
    if (b.defId === 'mirror_core') {
      for (const seg of b.segs) {
        if (seg.x < -100) continue;
        if (len(player.x - seg.x, player.y - seg.y) < (seg.r || b.r) + player.r) return true;
      }
    }
    return false;
  }

  private killBoss(host: BossHost): void {
    if (!this.boss || this.boss.dead) return;
    const b = this.boss;
    const def = this.def();
    b.dead = true;
    const gained = def.score * host.mult;
    host.addScore(gained);
    host.kills++;
    this.cleared++;
    host.pushScorePop(b.x, b.y, gained, b.col);
    host.sfxBig();
    spark(host.parts, b.x, b.y, b.col, 50, 600, 1.0, 3);
    host.gridImpulse(b.x, b.y, 36, b.r * 8);
    ringFx(host.rings, b.x, b.y, b.col, b.r, b.r * 5, 0.55);
    host.shake = Math.max(host.shake, 24);
    host.spawnBossGems(b.x, b.y, def.gems);

    // Clear adds + env
    for (const e of host.enemies) e.dead = true;
    this.env.clear();

    this.index++;
    if (this.index >= BOSS_COUNT) {
      this.phase = 'done';
      host.toast('ALL BOSSES DOWN', 'sector cleared', 2400, '#b8ff3d');
      setTimeout(() => host.onBossVictory(), 1200);
      return;
    }

    // Intermission drop
    this.phase = 'intermission';
    this.timer = 2.5;
    this.boss = null;
    const next = bossAt(this.index);
    host.toast('NEXT', `${this.index + 1} / ${BOSS_COUNT}`, 1200, '#63f7ff');
    this.spawnIntermissionDrop(host, next);
  }

  private spawnIntermissionDrop(host: BossHost, next: BossDef): void {
    const cx = host.W / 2;
    const cy = host.H / 2;
    let kind: 'weapon' | 'power' = 'power';
    let key: WeaponKey | PowerKey = pick([
      'shield',
      'overdrive',
      'timewarp',
      'magnet',
      'drones',
      'bomb',
      'mirror',
      'razor',
      'ghost',
    ] as const);
    if (next.hintDrop) {
      kind = next.hintDrop.kind;
      key = next.hintDrop.key;
    } else if (Math.random() < 0.45) {
      kind = 'weapon';
      key = pick(['scatter', 'lance', 'swarm', 'arc', 'rail', 'nova', 'vortex', 'helix'] as const);
    }
    host.drops.length = 0;
    host.drops.push({
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      kind,
      key,
      life: 12,
      ang: 0,
      bob: 0,
    });
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    this.env.draw(ctx, t);
    if (!this.boss || this.boss.dead) return;
    const b = this.boss;
    const def = this.def();
    this.drawBossShape(ctx, b, def, t);
    this.drawHpBar(ctx, b, def);
  }

  private drawHpBar(ctx: CanvasRenderingContext2D, b: BossRuntime, def: BossDef): void {
    const w = Math.min(420, Math.max(180, b.r * 3.2));
    const h = 10;
    const x = b.x - w / 2;
    const y = b.y - b.r - 36;
    const frac = clamp(b.hp / b.maxhp, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : b.col;
    ctx.shadowColor = b.col;
    ctx.shadowBlur = 12;
    ctx.fillRect(x, y, w * frac, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '600 11px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.18em';
    ctx.fillText(def.name, b.x, y - 8);
    if (b.armor > 0) {
      ctx.fillStyle = '#ffb02e';
      ctx.fillText(`ARMOR ×${b.armor}`, b.x, y + h + 14);
    }
    ctx.restore();
  }

  private drawBossShape(
    ctx: CanvasRenderingContext2D,
    b: BossRuntime,
    def: BossDef,
    t: number,
  ): void {
    const flash = b.flash > 0;
    const alpha = b.birth > 0 ? 0.35 : def.id === 'phase_lattice' && !b.solid ? 0.28 : 1;

    // Serpent body
    if (def.id === 'serpent_regent') {
      ctx.save();
      ctx.strokeStyle = flash ? '#fff' : b.col;
      ctx.lineWidth = 10;
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      for (const seg of b.segs) ctx.lineTo(seg.x, seg.y);
      ctx.stroke();
      ctx.restore();
    }

    // Twin
    if (def.id === 'twin_helix' && b.segs[0]) {
      const tw = b.segs[0];
      this.drawHelixBody(ctx, tw.x, tw.y, tw.r || b.r, b.ang + 0.4, b.col, flash, alpha);
      ctx.save();
      ctx.strokeStyle = b.col;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(tw.x, tw.y);
      ctx.stroke();
      ctx.restore();
    }

    // Mirror decoys
    if (def.id === 'mirror_core') {
      for (const seg of b.segs) {
        if (seg.x < -100) continue;
        this.drawMirrorShard(ctx, seg.x, seg.y, seg.r || b.r, b.ang, b.col, false, alpha * 0.55);
      }
    }

    // Railbait telegraph
    if (def.id === 'railbait' && (b.flags.telegraph || 0) > 0) {
      const a = b.flags.dashAng || 0;
      ctx.save();
      ctx.strokeStyle = '#9ee9ff';
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(a) * 500, b.y + Math.sin(a) * 500);
      ctx.stroke();
      ctx.restore();
    }

    this.strokeBossBody(ctx, b, def, flash, alpha, t);

    // Shared plate arc for armored fronts
    if (def.id === 'aegis_titan' || def.id === 'bulwark_colossus' || def.id === 'prism') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 6, b.sa - 1.15, b.sa + 1.15);
      ctx.strokeStyle = '#ffb02e';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#ffb02e';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }
  }

  private strokeBossBody(
    ctx: CanvasRenderingContext2D,
    b: BossRuntime,
    def: BossDef,
    flash: boolean,
    alpha: number,
    t: number,
  ): void {
    const { x, y, r, ang, col } = b;
    switch (def.id) {
      case 'prism':
        this.drawPrism(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'crown':
        this.drawCrown(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'void_anchor':
        this.drawVoidAnchor(ctx, x, y, r, ang, col, flash, alpha, t);
        break;
      case 'hexstorm':
        this.drawStormHex(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'aegis_titan':
        this.drawShield(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'serpent_regent':
        this.drawSerpentHead(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'mirror_core':
        this.drawMirrorShard(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'phase_lattice':
        this.drawLattice(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'starforge':
        this.drawStar(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'crystal_nexus':
        this.drawCrystal(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'pulse_maw':
        this.drawMaw(ctx, x, y, r, ang, col, flash, alpha, b.open);
        break;
      case 'grid_reaver':
        this.drawGridCross(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'twin_helix':
        this.drawHelixBody(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'lodestone':
        this.drawMagnet(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'arc_throne':
        this.drawThrone(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'railbait':
        this.drawChevron(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'nest_queen':
        this.drawCatHead(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'stasis_warden':
        this.drawHourglass(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'bulwark_colossus':
        this.drawFortress(ctx, x, y, r, ang, col, flash, alpha);
        break;
      case 'singularity_apex':
        this.drawSingularity(ctx, x, y, r, ang, col, flash, alpha, t);
        break;
      default:
        this.poly(ctx, x, y, r, 5, ang, col, flash, alpha);
    }
  }

  private beginBossStroke(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = flash ? '#ffffff' : col;
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.18)' : col + '18';
    ctx.lineWidth = 3.2;
    ctx.shadowColor = col;
    ctx.shadowBlur = flash ? 22 : 12;
    ctx.lineJoin = 'round';
  }

  private drawPrism(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, r * 0.55);
    ctx.lineTo(-r * 0.85, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.15);
    ctx.lineTo(r * 0.4, r * 0.35);
    ctx.lineTo(-r * 0.4, r * 0.35);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawCrown(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.55);
    ctx.lineTo(-r, -r * 0.1);
    ctx.lineTo(-r * 0.55, r * 0.15);
    ctx.lineTo(-r * 0.25, -r);
    ctx.lineTo(0, r * 0.05);
    ctx.lineTo(r * 0.25, -r);
    ctx.lineTo(r * 0.55, r * 0.15);
    ctx.lineTo(r, -r * 0.1);
    ctx.lineTo(r, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawVoidAnchor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
    t: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35 + Math.sin(t * 3) * 6, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  private drawStormHex(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.62 : r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawShield(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, -r * 0.35);
    ctx.lineTo(r * 0.7, r * 0.35);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, r * 0.35);
    ctx.lineTo(-r * 0.85, -r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(0, r * 0.55);
    ctx.moveTo(-r * 0.4, -r * 0.05);
    ctx.lineTo(r * 0.4, -r * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  private drawSerpentHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(r * 0.15, -r * 0.75);
    ctx.lineTo(-r * 0.85, -r * 0.35);
    ctx.lineTo(-r * 0.55, 0);
    ctx.lineTo(-r * 0.85, r * 0.35);
    ctx.lineTo(r * 0.15, r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.35, -r * 0.2);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(r * 0.35, r * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  private drawMirrorShard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(r * 0.3, 0);
    ctx.lineTo(0, r * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  private drawLattice(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, 0);
    ctx.lineTo(r * 0.85, 0);
    ctx.moveTo(0, -r * 0.85);
    ctx.lineTo(0, r * 0.85);
    ctx.moveTo(-r * 0.85, -r * 0.85);
    ctx.lineTo(r * 0.85, r * 0.85);
    ctx.moveTo(r * 0.85, -r * 0.85);
    ctx.lineTo(-r * 0.85, r * 0.85);
    ctx.stroke();
    ctx.restore();
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawCrystal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    const shards: [number, number, number][] = [
      [0, 0, 1],
      [-0.55, 0.2, 0.55],
      [0.55, 0.15, 0.5],
    ];
    for (const [ox, oy, s] of shards) {
      const rr = r * s;
      ctx.beginPath();
      ctx.moveTo(ox * r, oy * r - rr);
      ctx.lineTo(ox * r + rr * 0.45, oy * r);
      ctx.lineTo(ox * r, oy * r + rr * 0.85);
      ctx.lineTo(ox * r - rr * 0.45, oy * r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGridCross(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    const t = r * 0.32;
    ctx.beginPath();
    ctx.moveTo(-t, -r);
    ctx.lineTo(t, -r);
    ctx.lineTo(t, -t);
    ctx.lineTo(r, -t);
    ctx.lineTo(r, t);
    ctx.lineTo(t, t);
    ctx.lineTo(t, r);
    ctx.lineTo(-t, r);
    ctx.lineTo(-t, t);
    ctx.lineTo(-r, t);
    ctx.lineTo(-r, -t);
    ctx.lineTo(-t, -t);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawHelixBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r);
    ctx.quadraticCurveTo(r, -r * 0.4, -r * 0.15, 0);
    ctx.quadraticCurveTo(-r, r * 0.4, r * 0.2, r);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r);
    ctx.quadraticCurveTo(-r, -r * 0.4, r * 0.15, 0);
    ctx.quadraticCurveTo(r, r * 0.4, -r * 0.2, r);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      const px = Math.cos(a) * r * 0.32;
      const py = Math.sin(a) * r * 0.32;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawMagnet(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.85);
    ctx.lineTo(-r * 0.7, r * 0.15);
    ctx.quadraticCurveTo(-r * 0.7, r * 0.85, 0, r * 0.85);
    ctx.quadraticCurveTo(r * 0.7, r * 0.85, r * 0.7, r * 0.15);
    ctx.lineTo(r * 0.7, -r * 0.85);
    ctx.stroke();
    ctx.lineWidth = 3.2;
    ctx.strokeRect(-r * 0.95, -r, r * 0.5, r * 0.35);
    ctx.strokeRect(r * 0.45, -r, r * 0.5, r * 0.35);
    ctx.restore();
  }

  private drawThrone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, r * 0.9);
    ctx.lineTo(-r * 0.85, -r * 0.15);
    ctx.lineTo(-r * 0.55, -r * 0.15);
    ctx.lineTo(-r * 0.55, -r * 0.85);
    ctx.lineTo(-r * 0.15, -r * 0.35);
    ctx.lineTo(0, -r);
    ctx.lineTo(r * 0.15, -r * 0.35);
    ctx.lineTo(r * 0.55, -r * 0.85);
    ctx.lineTo(r * 0.55, -r * 0.15);
    ctx.lineTo(r * 0.85, -r * 0.15);
    ctx.lineTo(r * 0.85, r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawChevron(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.75);
    ctx.lineTo(r * 0.15, 0);
    ctx.lineTo(-r * 0.9, r * 0.75);
    ctx.lineTo(-r * 0.45, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.55);
    ctx.lineTo(r * 0.9, 0);
    ctx.lineTo(-r * 0.2, r * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  /** Geometric cat head — hex face + triangular ears + diamond eyes. */
  private drawCatHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      const rr = i === 0 || i === 3 ? r * 0.78 : r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.92;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const ear = (side: number) => {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.35, -r * 0.55);
      ctx.lineTo(side * r * 0.78, -r * 1.18);
      ctx.lineTo(side * r * 0.95, -r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    ear(-1);
    ear(1);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.38, -r * 0.08);
    ctx.lineTo(-r * 0.18, -r * 0.22);
    ctx.lineTo(-r * 0.18, 0.06 * r);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.38, -r * 0.08);
    ctx.lineTo(r * 0.18, -r * 0.22);
    ctx.lineTo(r * 0.18, 0.06 * r);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, r * 0.12);
    ctx.lineTo(-r * 0.1, r * 0.28);
    ctx.lineTo(0, r * 0.4);
    ctx.lineTo(r * 0.1, r * 0.28);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawHourglass(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r);
    ctx.lineTo(r * 0.75, -r);
    ctx.lineTo(r * 0.12, 0);
    ctx.lineTo(r * 0.75, r);
    ctx.lineTo(-r * 0.75, r);
    ctx.lineTo(-r * 0.12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, 0);
    ctx.lineTo(r * 0.35, 0);
    ctx.stroke();
    ctx.restore();
  }

  private drawFortress(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.7);
    ctx.lineTo(-r, -r * 0.2);
    ctx.lineTo(-r * 0.7, -r * 0.2);
    ctx.lineTo(-r * 0.7, -r * 0.7);
    ctx.lineTo(-r * 0.35, -r * 0.7);
    ctx.lineTo(-r * 0.35, -r);
    ctx.lineTo(-r * 0.05, -r);
    ctx.lineTo(-r * 0.05, -r * 0.7);
    ctx.lineTo(r * 0.05, -r * 0.7);
    ctx.lineTo(r * 0.05, -r);
    ctx.lineTo(r * 0.35, -r);
    ctx.lineTo(r * 0.35, -r * 0.7);
    ctx.lineTo(r * 0.7, -r * 0.7);
    ctx.lineTo(r * 0.7, -r * 0.2);
    ctx.lineTo(r, -r * 0.2);
    ctx.lineTo(r, r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(-r * 0.25, r * 0.05, r * 0.5, r * 0.45);
    ctx.restore();
  }

  private drawSingularity(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
    t: number,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (0.95 - i * 0.22), r * (0.55 - i * 0.1), i * 0.4, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.4 + Math.sin(t * 3) * 8, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** Open/closed geometric jaw for Pulse Maw. */
  private drawMaw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
    open: boolean,
  ): void {
    this.beginBossStroke(ctx, x, y, ang, col, flash, alpha);
    const gap = open ? 0.55 : 0.12;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(-r * 0.55, -r * (0.85 + gap));
    ctx.lineTo(r * 0.55, -r * (0.85 + gap));
    ctx.lineTo(r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(-r * 0.5, r * (0.7 + gap * 0.6));
    ctx.lineTo(r * 0.5, r * (0.7 + gap * 0.6));
    ctx.lineTo(r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (open) {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.1);
      ctx.lineTo(0, r * 0.15);
      ctx.lineTo(r * 0.35, -r * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private poly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    sides: number,
    ang: number,
    col: string,
    flash: boolean,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = flash ? '#ffffff' : col;
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.2)' : col + '18';
    ctx.lineWidth = 3;
    ctx.shadowColor = col;
    ctx.shadowBlur = flash ? 20 : 10;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  progressLabel(): string {
    const n = Math.min(this.cleared + (this.phase === 'fight' ? 1 : 0), BOSS_COUNT);
    return String(n).padStart(2, '0') + '/' + String(BOSS_COUNT).padStart(2, '0');
  }
}
