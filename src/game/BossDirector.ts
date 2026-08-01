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

  reset(): void {
    this.env.clear();
    this.boss = null;
    this.index = 0;
    this.cleared = 0;
    this.phase = 'intro';
    this.timer = 0.6;
    this.gameT = 0;
  }

  begin(host: BossHost): void {
    this.reset();
    this.spawnFight(host);
  }

  private def(): BossDef {
    return bossAt(this.index);
  }

  private spawnFight(host: BossHost): void {
    const def = this.def();
    const x = host.W / 2;
    const y = host.H * 0.32;
    this.boss = {
      defId: def.id,
      x,
      y,
      vx: 0,
      vy: 0,
      r: def.r,
      hp: def.hp,
      maxhp: def.hp,
      col: def.col,
      spd: def.spd,
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
      armor: def.id === 'aegis_titan' ? 3 : def.id === 'bulwark_colossus' ? 4 : def.id === 'singularity_apex' ? 2 : 0,
      flags: {},
      open: false,
      solid: true,
      enraged: false,
    };

    if (def.id === 'serpent_regent') {
      for (let i = 0; i < 16; i++) this.boss.segs.push({ x, y, r: 22 - i * 0.6 });
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
    host.toast(def.name, def.blurb, 2200, def.col);
    ringFx(host.rings, x, y, def.col, def.r * 2, def.r * 0.5, 0.7);
    host.sfxBig();
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

    // Magnets / wells
    const reverse = host.buffs.magnet > 0 && def.id === 'lodestone';
    this.env.applyForces(dt, host.player, reverse);
    if (def.id === 'void_anchor' || def.id === 'lodestone' || def.id === 'singularity_apex') {
      const pull = def.id === 'lodestone' && reverse ? -380 : def.id === 'void_anchor' ? 420 : 360;
      const dx = b.x - host.player.x;
      const dy = b.y - host.player.y;
      const d = len(dx, dy) || 1;
      if (d < 420) {
        host.player.vx += (dx / d) * pull * (1 - d / 420) * dt * (reverse ? -1 : 1);
        host.player.vy += (dy / d) * pull * (1 - d / 420) * dt * (reverse ? -1 : 1);
      }
      host.gridImpulse(b.x, b.y, def.id === 'singularity_apex' ? 2.2 : 1.4, b.r * 3);
    }

    // Bounds
    b.x = clamp(b.x, b.r + 8, host.W - b.r - 8);
    b.y = clamp(b.y, b.r + 8, host.H - b.r - 8);
  }

  private ai(dt: number, host: BossHost, b: BossRuntime, def: BossDef): void {
    const [tx, ty] = norm(host.player.x - b.x, host.player.y - b.y);
    const d = len(host.player.x - b.x, host.player.y - b.y);
    b.cd -= dt;
    b.wob += dt;

    switch (def.id) {
      case 'prism': {
        b.sa += dt * 0.7;
        b.vx += tx * b.spd * 1.6 * dt;
        b.vy += ty * b.spd * 1.6 * dt;
        this.dampen(b, 0.92);
        this.integrate(b, dt);
        break;
      }
      case 'crown': {
        b.vx += Math.cos(b.wob * 0.7) * 30 * dt;
        b.vy += Math.sin(b.wob * 0.55) * 24 * dt;
        this.dampen(b, 0.96);
        this.integrate(b, dt);
        break;
      }
      case 'void_anchor': {
        b.vx += tx * b.spd * 1.2 * dt;
        b.vy += ty * b.spd * 1.2 * dt;
        b.grow = Math.min(40, b.grow + dt * 2);
        b.r = def.r + b.grow * 0.35;
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
          b.cd = 1.1 - b.phase * 0.15;
          const a = rnd(TAU);
          this.env.spawnMine(b.x + Math.cos(a) * 90, b.y + Math.sin(a) * 90);
        }
        break;
      }
      case 'aegis_titan': {
        b.sa += dt * (1.1 + b.phase * 0.35);
        b.vx += tx * b.spd * 1.8 * dt;
        b.vy += ty * b.spd * 1.8 * dt;
        this.dampen(b, 0.93);
        this.integrate(b, dt);
        break;
      }
      case 'serpent_regent': {
        b.wob += dt * 2.4;
        const perpx = -ty;
        const perpy = tx;
        const s = Math.sin(b.wob) * 0.85;
        b.vx += (tx + perpx * s) * b.spd * 2.4 * dt;
        b.vy += (ty + perpy * s) * b.spd * 2.4 * dt;
        this.dampen(b, 0.9);
        this.integrate(b, dt);
        let px = b.x;
        let py = b.y;
        for (const seg of b.segs) {
          const dx = px - seg.x;
          const dy = py - seg.y;
          const dist = len(dx, dy) || 1;
          const spacing = 18;
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
        // Decoys orbit
        for (let i = 0; i < b.segs.length; i++) {
          const a = b.wob * 0.8 + (i / 3) * TAU;
          b.segs[i]!.x = b.x + Math.cos(a) * 130;
          b.segs[i]!.y = b.y + Math.sin(a) * 90;
        }
        break;
      }
      case 'phase_lattice': {
        b.flags.phaseT = (b.flags.phaseT || 0) + dt;
        const cycle = host.buffs.timewarp > 0 ? 3.6 : 2.4;
        const solidWindow = host.buffs.timewarp > 0 ? 2.2 : 1.15;
        const t = b.flags.phaseT % cycle;
        b.solid = t < solidWindow;
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
        const rate = vents > 0 ? 0.85 : 1.8;
        if (b.cd <= 0) {
          b.cd = rate;
          if (host.enemies.length < 35) {
            const a = rnd(TAU);
            host.spawnEnemy('seeker', b.x + Math.cos(a) * (b.r + 30), b.y + Math.sin(a) * (b.r + 30));
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
        const cycle = 3.2;
        const t = b.flags.mawT % cycle;
        b.open = t > 1.6 && t < 2.6;
        b.vx += tx * b.spd * 1.4 * dt;
        b.vy += ty * b.spd * 1.4 * dt;
        this.dampen(b, 0.94);
        this.integrate(b, dt);
        if (b.open && b.cd <= 0) {
          b.cd = 0.35;
          // spit ebullets via seeker-like — spawn shards
          if (host.enemies.length < 30) {
            host.spawnEnemy('shard', b.x + tx * (b.r + 10), b.y + ty * (b.r + 10));
          }
        }
        break;
      }
      case 'grid_reaver': {
        b.flags.shockT = (b.flags.shockT || 0) - dt;
        b.flags.recovery = Math.max(0, (b.flags.recovery || 0) - dt);
        if (b.flags.shockT <= 0) {
          b.flags.shockT = 3.4 - b.phase * 0.4;
          b.flags.recovery = 1.15;
          host.shake = Math.max(host.shake, 22);
          host.gridImpulse(b.x, b.y, 40, Math.max(host.W, host.H));
          ringFx(host.rings, b.x, b.y, b.col, 20, Math.max(host.W, host.H) * 0.45, 0.55);
          if (d < 220) {
            // knock player
            host.player.vx -= tx * 520;
            host.player.vy -= ty * 520;
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
          // Regen if one hasn't been hit
          b.flags.lastHit0 = (b.flags.lastHit0 || 0) + dt;
          b.flags.lastHit1 = (b.flags.lastHit1 || 0) + dt;
          if (b.flags.lastHit0 > 2.5 && b.flags.lastHit1 < 1) b.hp = Math.min(b.maxhp, b.hp + 14 * dt);
          if (b.flags.lastHit1 > 2.5 && b.flags.lastHit0 < 1) b.hp = Math.min(b.maxhp, b.hp + 14 * dt);
        }
        b.vx += tx * b.spd * 1.6 * dt;
        b.vy += ty * b.spd * 1.6 * dt;
        this.dampen(b, 0.91);
        this.integrate(b, dt);
        break;
      }
      case 'lodestone': {
        b.vx += tx * b.spd * 1.3 * dt;
        b.vy += ty * b.spd * 1.3 * dt;
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
          // Start telegraph then dash
          b.flags.dashAng = Math.atan2(ty, tx);
          b.flags.telegraph = 0.55;
          b.cd = 1.8 - b.phase * 0.25;
          b.flags.pendingDash = 1;
        }
        if ((b.flags.pendingDash || 0) > 0 && (b.flags.telegraph || 0) <= 0) {
          const a = b.flags.dashAng || 0;
          b.vx = Math.cos(a) * (b.enraged ? 920 : 780);
          b.vy = Math.sin(a) * (b.enraged ? 920 : 780);
          b.flags.pendingDash = 0;
        }
        // Missed rail during telegraph → enrage
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
        b.flags.nesting = nests > 0 && b.cd > 0.8 ? 1 : 0;
        if (nests > 0) {
          // drift toward nearest nest conceptually — slow chase
          b.vx += tx * b.spd * 1.1 * dt;
          b.vy += ty * b.spd * 1.1 * dt;
        } else {
          b.vx += tx * b.spd * 2.4 * dt;
          b.vy += ty * b.spd * 2.4 * dt;
        }
        this.dampen(b, 0.92);
        this.integrate(b, dt);
        break;
      }
      case 'stasis_warden': {
        if (b.cd <= 0) {
          b.cd = 2.8 - b.phase * 0.3;
          this.env.spawnZone(
            host.player.x,
            host.player.y,
            95,
            5.5,
            0.35,
            '#a98bff',
          );
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
        b.sa += dt * 0.85;
        b.vx += tx * b.spd * 1.5 * dt;
        b.vy += ty * b.spd * 1.5 * dt;
        this.dampen(b, 0.94);
        this.integrate(b, dt);
        if (b.cd <= 0 && host.enemies.length < 12) {
          b.cd = 4.5;
          const a = rnd(TAU);
          host.spawnEnemy('bulwark', b.x + Math.cos(a) * 100, b.y + Math.sin(a) * 100);
        }
        break;
      }
      case 'singularity_apex': {
        b.flags.phaseT = (b.flags.phaseT || 0) + dt;
        if (b.phase >= 2) {
          const cycle = 2.8;
          b.solid = b.flags.phaseT % cycle < 1.4;
        } else b.solid = true;
        b.grow = Math.min(50, b.grow + dt * 1.5);
        b.r = def.r + b.grow * 0.25;
        if (b.cd <= 0) {
          b.cd = 2.2 - b.phase * 0.25;
          const a = rnd(TAU);
          this.env.spawnMine(b.x + Math.cos(a) * 140, b.y + Math.sin(a) * 140, '#ff2d55');
          if (host.enemies.length < 20) host.spawnEnemy('seeker', b.x + Math.cos(a) * 80, b.y + Math.sin(a) * 80);
        }
        b.vx += tx * b.spd * 1.4 * dt;
        b.vy += ty * b.spd * 1.4 * dt;
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
      if (result.blocked) host.sfxBounce();
      return false;
    }
    b.hp -= result.applied;
    b.flash = 0.14;
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
    if (def.id === 'railbait' && result.message === 'CRIT') {
      host.toast('CRIT', '', 400, '#9ee9ff');
      b.flags.gotCrit = 1;
    } else if (result.message === 'PLATE STRIPPED' || result.message === 'REFLECTED') {
      /* noop visual */
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
    opts: { ang?: number; twinOk?: boolean } = {},
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
        this.applyDamage(host, amount, { source, ang: opts.ang ?? Math.atan2(b.y - y, b.x - x) });
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
        this.applyDamage(host, amount, { source, ang: opts.ang, twinIndex: 1 });
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
    host.score += gained;
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
    ] as const);
    if (next.hintDrop) {
      kind = next.hintDrop.kind;
      key = next.hintDrop.key;
    } else if (Math.random() < 0.45) {
      kind = 'weapon';
      key = pick(['scatter', 'lance', 'swarm', 'arc', 'rail'] as const);
    }
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
      this.poly(ctx, tw.x, tw.y, tw.r || b.r, 6, b.ang + 0.4, b.col, flash, alpha);
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
        this.poly(ctx, seg.x, seg.y, seg.r || b.r, 5, b.ang, b.col, false, alpha * 0.55);
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

    const sides =
      def.id === 'prism'
        ? 6
        : def.id === 'crown'
          ? 8
          : def.id === 'hexstorm'
            ? 6
            : def.id === 'aegis_titan' || def.id === 'bulwark_colossus'
              ? 8
              : def.id === 'pulse_maw'
                ? 7
                : def.id === 'singularity_apex'
                  ? 6
                  : 5;

    this.poly(ctx, b.x, b.y, b.r, sides, b.ang, b.col, flash, alpha);

    // Inner core
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = flash ? '#fff' : b.col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * (def.id === 'pulse_maw' && b.open ? 0.55 : 0.35), 0, TAU);
    ctx.stroke();
    if (def.id === 'aegis_titan' || def.id === 'bulwark_colossus' || def.id === 'prism') {
      ctx.beginPath();
      ctx.arc(0, 0, b.r + 6, b.sa - 1.15, b.sa + 1.15);
      ctx.strokeStyle = '#ffb02e';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    if (def.id === 'void_anchor' || def.id === 'singularity_apex') {
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 1.6 + Math.sin(t * 3) * 8, 0, TAU);
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
