import { MAX_ENEMIES, type EnemyType } from './catalogue';
import { ADVENTURE_BOSS_COUNT } from './bosses';
import type { BossDirector, BossHost } from './BossDirector';
import { clamp, pick, rnd } from './maths';
import { playMusic } from './music';
import { ringFx, spark } from './particles';
import type { Enemy, Particle, Player, Ring } from './types';

export type AdventurePhase = 'scroll' | 'closing' | 'boss' | 'bridge' | 'done';

/** Ground-anchored tower — collidable, scrolls with the world. */
type Building = {
  x: number;
  w: number;
  h: number;
  /** Body fill shade 0 = darkest … 1 = slightly lighter. */
  tone: number;
  /** Accent hue family for outline / lit slits. */
  accent: 'ion' | 'violet' | 'amber';
  /** Floors for horizontal banding. */
  floors: number;
  /** Window columns. */
  cols: number;
  /** Bit-ish pattern seed — which slits are lit (static). */
  seed: number;
  /** Setback crown on top. */
  cap: boolean;
  hp: number;
  maxhp: number;
  flash: number;
  hitCd: number;
  /** Exit anim remaining (0 = solid). Fade + sink. */
  exit: number;
  exitMax: number;
};

/** Distant non-collidable skyline — positions are WORLD space. */
type FarBuilding = {
  /** World-space left edge (not screen x). */
  wx: number;
  w: number;
  h: number;
  tone: number;
};

/** Mid-ground non-collidable towers — between horizon and playfield. */
type MidBuilding = {
  wx: number;
  w: number;
  h: number;
  tone: number;
  seed: number;
};

export type AdventureHost = {
  W: number;
  H: number;
  parts: Particle[];
  rings: Ring[];
  enemies: Enemy[];
  player: Player;
  buffs: { timewarp: number };
  elapsed: number;
  sector: number;
  toast: (txt: string, sub?: string, ms?: number, col?: string) => void;
  spawnEnemy: (type: EnemyType, x: number, y: number) => Enemy;
  hurtPlayer: () => void;
  bosses: BossDirector;
  bossHost: () => BossHost;
  onVictory: () => void;
  /** Explode all live enemies with FX, no score/gems/drops. */
  purgeEnemies: () => void;
};

const GATE_INSET = 52;
const BASE_SCROLL = 195;
const BASE_SEGMENT = 7800;
const GROUND = 12;
/**
 * Classic 3-layer city parallax vs foreground (1.0).
 * Far crawls, mid drifts, fore races — depth reads from relative motion.
 */
const FAR_PARALLAX = 0.03;
const MID_PARALLAX = 0.18;
const GRID_PARALLAX = 0.5;
const EXIT_DUR = 0.55;

const ACCENT_RGB: Record<Building['accent'], [number, number, number]> = {
  ion: [99, 247, 255],
  violet: [169, 139, 255],
  amber: [255, 176, 46],
};

export class AdventureDirector {
  phase: AdventurePhase = 'scroll';
  level = 0;
  progress = 0;
  segmentGoal = BASE_SEGMENT;
  scrollSpeed = BASE_SCROLL;
  /** Foreground / world travel distance. */
  scrollX = 0;
  /** Mid-layer camera for the warp grid. */
  gridScrollX = 0;
  /** Far-layer camera for the horizon skyline. */
  farScrollX = 0;
  /** Mid-layer camera for mid-ground towers. */
  midScrollX = 0;
  timer = 0;
  spawnT = 0.8;
  buildings: Building[] = [];
  farBuildings: FarBuilding[] = [];
  midBuildings: MidBuilding[] = [];
  gateL = -80;
  gateR = 9999;
  gateTargetL = GATE_INSET;
  gateTargetR = 0;
  private closingDone = false;
  private nextBuildX = 0;
  /** Next far building spawn in world space. */
  private nextFarWx = 0;
  private nextMidWx = 0;

  reset(): void {
    this.phase = 'scroll';
    this.level = 0;
    this.progress = 0;
    this.segmentGoal = BASE_SEGMENT;
    this.scrollSpeed = BASE_SCROLL;
    this.scrollX = 0;
    this.gridScrollX = 0;
    this.farScrollX = 0;
    this.midScrollX = 0;
    this.timer = 0;
    this.spawnT = 0.8;
    this.buildings.length = 0;
    this.farBuildings.length = 0;
    this.midBuildings.length = 0;
    this.gateL = -80;
    this.gateR = 9999;
    this.closingDone = false;
    this.nextBuildX = 0;
    this.nextFarWx = 0;
    this.nextMidWx = 0;
  }

  begin(host: AdventureHost): void {
    this.reset();
    this.gateR = host.W + 80;
    this.gateTargetR = host.W - GATE_INSET;
    this.seedSkyline(host);
    this.seedFarSkyline(host);
    this.seedMidSkyline(host);
    playMusic('adventure');
    host.sector = 1;
    host.player.x = host.W * 0.28;
    host.player.y = host.H * 0.38;
    host.toast('LEVEL 01', 'adventure begins', 1600, '#63f7ff');
  }

  isBossPhase(): boolean {
    return this.phase === 'boss';
  }

  boundLeft(): number {
    if (this.phase === 'closing' || this.phase === 'boss') return this.gateL + 16;
    return 16;
  }

  boundRight(W: number): number {
    if (this.phase === 'closing' || this.phase === 'boss') return this.gateR - 16;
    return W - 16;
  }

  progressLabel(): string {
    const n =
      this.phase === 'done'
        ? ADVENTURE_BOSS_COUNT
        : Math.min(this.level + 1, ADVENTURE_BOSS_COUNT);
    return String(n).padStart(2, '0') + '/' + String(ADVENTURE_BOSS_COUNT).padStart(2, '0');
  }

  private segmentLength(level: number): number {
    return BASE_SEGMENT + level * 520;
  }

  private scrollRate(level: number): number {
    return BASE_SCROLL + level * 14;
  }

  private seedSkyline(host: AdventureHost): void {
    let x = 40;
    while (x < host.W + 280) {
      const b = this.makeBuilding(host, x);
      this.buildings.push(b);
      x += b.w + rnd(70, 28);
    }
    this.nextBuildX = x;
  }

  private seedFarSkyline(host: AdventureHost): void {
    this.farBuildings.length = 0;
    this.nextFarWx = this.farScrollX - 40;
    while (this.nextFarWx < this.farScrollX + host.W + 500) {
      const f = this.makeFarBuilding(this.nextFarWx);
      this.farBuildings.push(f);
      this.nextFarWx += f.w + rnd(6, 0);
    }
  }

  private seedMidSkyline(host: AdventureHost): void {
    this.midBuildings.length = 0;
    this.nextMidWx = this.midScrollX - 20;
    while (this.nextMidWx < this.midScrollX + host.W + 400) {
      if (Math.random() < 0.12) {
        this.nextMidWx += rnd(70, 30);
        continue;
      }
      const m = this.makeMidBuilding(this.nextMidWx);
      this.midBuildings.push(m);
      this.nextMidWx += m.w + rnd(28, 8);
    }
  }

  private makeFarBuilding(wx: number): FarBuilding {
    // Continuous jagged silhouette — short blocks of varying height
    const cluster = Math.random() < 0.35;
    return {
      wx,
      w: cluster ? rnd(22, 10) : rnd(38, 14),
      h: cluster ? rnd(70, 28) : rnd(95, 40),
      tone: rnd(0.5, 0.08),
    };
  }

  private makeMidBuilding(wx: number): MidBuilding {
    return {
      wx,
      w: rnd(52, 26),
      h: rnd(130, 55),
      tone: rnd(0.65, 0.2),
      seed: (Math.random() * 0xffff) | 0,
    };
  }

  private makeBuilding(host: AdventureHost, x: number): Building {
    const h = rnd(host.H * 0.22, host.H * 0.09);
    const w = rnd(58, 30);
    const floors = Math.max(3, Math.round(h / 11));
    const cols = Math.max(2, Math.round(w / 10));
    const accent = pick(['ion', 'violet', 'amber'] as const);
    const hp = Math.round(24 + h * 0.12);
    return {
      x,
      w,
      h,
      tone: rnd(0.85, 0.15),
      accent,
      floors,
      cols,
      seed: (Math.random() * 0xffff) | 0,
      cap: Math.random() < 0.55,
      hp,
      maxhp: hp,
      flash: 0,
      hitCd: 0,
      exit: 0,
      exitMax: 0,
    };
  }

  private unlockedTypes(level: number, frac: number): EnemyType[] {
    const unlocked: EnemyType[] = ['drifter', 'seeker'];
    if (level >= 0 && frac > 0.2) unlocked.push('courier');
    if (level >= 1) unlocked.push('weaver');
    if (level >= 2 || frac > 0.5) unlocked.push('splitter');
    if (level >= 3) unlocked.push('sentry');
    if (level >= 4) unlocked.push('serpent');
    if (level >= 5) unlocked.push('bulwark');
    if (level >= 6) unlocked.push('singular');
    return unlocked;
  }

  update(dt: number, host: AdventureHost): void {
    if (this.phase === 'done') return;
    this.groundY = host.H - GROUND;

    if (this.phase === 'boss') {
      host.bosses.update(dt, host.bossHost());
      this.updateGates(dt, true);
      this.clampPlayer(host);
      return;
    }

    host.elapsed += dt;
    const ets = host.buffs.timewarp > 0 ? 0.32 : 1;

    if (this.phase === 'bridge') {
      this.timer -= dt;
      this.scrollWorld(dt * ets * 0.4, host);
      this.updateBuildings(dt, host, false);
      this.clampPlayer(host);
      if (this.timer <= 0) this.startScroll(host);
      return;
    }

    if (this.phase === 'closing') {
      this.timer -= dt;
      this.updateGates(dt, true);
      this.scrollWorld(dt * ets * 0.2, host);
      this.updateBuildings(dt, host, true);
      this.clampPlayer(host);
      if (!this.closingDone && this.gatesSettled() && this.timer <= 0.15) {
        this.closingDone = true;
        this.enterBoss(host);
      }
      return;
    }

    // scroll
    this.scrollSpeed = this.scrollRate(this.level);
    const scroll = this.scrollSpeed * dt * ets;
    this.progress += scroll;
    this.scrollWorld(dt * ets, host);
    this.spawnBuildings(host);
    this.spawnEnemies(dt, host);
    this.updateBuildings(dt, host, true);
    this.clampPlayer(host);

    if (this.progress >= this.segmentGoal) {
      this.startClosing(host);
    }
  }

  private startScroll(host: AdventureHost): void {
    this.phase = 'scroll';
    this.progress = 0;
    this.segmentGoal = this.segmentLength(this.level);
    this.scrollSpeed = this.scrollRate(this.level);
    this.spawnT = 0.7;
    this.gateL = -80;
    this.gateR = host.W + 80;
    this.buildings.length = 0;
    this.seedSkyline(host);
    if (this.farBuildings.length < 8) this.seedFarSkyline(host);
    if (this.midBuildings.length < 4) this.seedMidSkyline(host);
    host.sector = this.level + 1;
    host.toast(
      `LEVEL ${String(this.level + 1).padStart(2, '0')}`,
      'keep advancing',
      1400,
      '#63f7ff',
    );
    playMusic('adventure');
  }

  private startClosing(host: AdventureHost): void {
    this.phase = 'closing';
    this.timer = 1.35;
    this.closingDone = false;
    this.gateTargetL = GATE_INSET;
    this.gateTargetR = host.W - GATE_INSET;
    if (this.gateL < -40) this.gateL = -60;
    if (this.gateR > host.W + 40) this.gateR = host.W + 60;
    host.purgeEnemies();
    this.beginExitAll();
    host.toast('ARENA LOCK', `boss ${this.level + 1} / ${ADVENTURE_BOSS_COUNT}`, 1400, '#ffb02e');
    ringFx(host.rings, host.W / 2, host.H / 2, '#ffb02e', 40, Math.max(host.W, host.H) * 0.4, 0.5);
  }

  private gatesSettled(): boolean {
    return (
      Math.abs(this.gateL - this.gateTargetL) < 2 &&
      Math.abs(this.gateR - this.gateTargetR) < 2
    );
  }

  private updateGates(dt: number, closing: boolean): void {
    if (!closing && this.phase !== 'boss') return;
    const k = 1 - Math.pow(0.001, dt);
    this.gateL = lerp(this.gateL, this.gateTargetL, k * 2.4);
    this.gateR = lerp(this.gateR, this.gateTargetR, k * 2.4);
  }

  private enterBoss(host: AdventureHost): void {
    this.phase = 'boss';
    host.purgeEnemies();
    // Finish any leftover exit anims
    this.buildings.length = 0;
    host.bosses.beginFight(host.bossHost(), this.level);
  }

  private beginExit(b: Building, delay = 0): void {
    if (b.exit > 0) return;
    b.exit = EXIT_DUR + delay;
    b.exitMax = EXIT_DUR + delay;
    b.hitCd = 99;
  }

  private beginExitAll(): void {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i]!;
      if (b.exit > 0) continue;
      this.beginExit(b, (i % 7) * 0.04);
    }
  }

  onFightCleared(host: AdventureHost): void {
    host.bosses.endFight();
    this.level++;
    if (this.level >= ADVENTURE_BOSS_COUNT) {
      this.phase = 'done';
      host.toast('ADVENTURE CLEAR', '10 bosses down', 2400, '#b8ff3d');
      setTimeout(() => host.onVictory(), 1200);
      return;
    }
    this.phase = 'bridge';
    this.timer = 2.2;
    this.gateL = -80;
    this.gateR = host.W + 80;
    host.toast('SECTOR OPEN', 'resume scroll', 1200, '#63f7ff');
  }

  private scrollWorld(dtFactor: number, host: AdventureHost): void {
    const dx = this.scrollSpeed * dtFactor;
    // Three camera layers — classic side-scroller depth
    this.scrollX += dx;
    this.gridScrollX += dx * GRID_PARALLAX;
    this.midScrollX += dx * MID_PARALLAX;
    this.farScrollX += dx * FAR_PARALLAX;

    for (const b of this.buildings) b.x -= dx;
    this.nextBuildX -= dx;
    this.spawnFarBuildings(host);
    this.spawnMidBuildings(host);

    for (const e of host.enemies) {
      if (!e.dead) e.x -= dx;
    }
  }

  private spawnBuildings(host: AdventureHost): void {
    while (this.nextBuildX < host.W + 220) {
      if (Math.random() < 0.22) {
        this.nextBuildX += rnd(160, 90);
        continue;
      }
      const b = this.makeBuilding(host, this.nextBuildX);
      this.buildings.push(b);
      const gap = clamp(rnd(100, 40) - this.level * 2, 32, 120);
      this.nextBuildX += b.w + gap;
    }
  }

  private spawnFarBuildings(host: AdventureHost): void {
    const viewRight = this.farScrollX + host.W + 420;
    while (this.nextFarWx < viewRight) {
      const f = this.makeFarBuilding(this.nextFarWx);
      this.farBuildings.push(f);
      this.nextFarWx += f.w + rnd(4, 0);
    }
    const cullLeft = this.farScrollX - 120;
    for (let i = this.farBuildings.length - 1; i >= 0; i--) {
      const f = this.farBuildings[i]!;
      if (f.wx + f.w < cullLeft) this.farBuildings.splice(i, 1);
    }
  }

  private spawnMidBuildings(host: AdventureHost): void {
    const viewRight = this.midScrollX + host.W + 360;
    while (this.nextMidWx < viewRight) {
      if (Math.random() < 0.15) {
        this.nextMidWx += rnd(80, 36);
        continue;
      }
      const m = this.makeMidBuilding(this.nextMidWx);
      this.midBuildings.push(m);
      this.nextMidWx += m.w + rnd(32, 10);
    }
    const cullLeft = this.midScrollX - 100;
    for (let i = this.midBuildings.length - 1; i >= 0; i--) {
      const m = this.midBuildings[i]!;
      if (m.wx + m.w < cullLeft) this.midBuildings.splice(i, 1);
    }
  }

  private spawnEnemies(dt: number, host: AdventureHost): void {
    this.spawnT -= dt;
    if (this.spawnT > 0 || host.enemies.length >= MAX_ENEMIES) return;
    const frac = this.progress / Math.max(1, this.segmentGoal);
    const types = this.unlockedTypes(this.level, frac);
    // Steeper pressure: shorter gaps + bigger packs as levels climb.
    const interval = clamp(1.05 - this.level * 0.09 - frac * 0.7, 0.16, 1.15);
    this.spawnT = interval * rnd(1.15, 0.7);
    const group = clamp(Math.round(2 + this.level * 0.55 + frac * 3.2), 2, 8);
    // Spawn in the open air above the skyline
    const skyTop = 40;
    const skyBot = host.H * 0.55;
    for (let i = 0; i < group; i++) {
      if (host.enemies.length >= MAX_ENEMIES) break;
      const type = pick(types);
      const x = host.W + 40 + rnd(70);
      const y = clamp(rnd(skyBot, skyTop), 40, host.H - 40);
      host.spawnEnemy(type, x, y);
    }
  }

  private updateBuildings(dt: number, host: AdventureHost, collide: boolean): void {
    const player = host.player;
    const groundY = host.H - GROUND;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]!;
      if (b.exit > 0) {
        b.exit = Math.max(0, b.exit - dt);
        if (b.exit <= 0) {
          this.buildings.splice(i, 1);
          continue;
        }
      } else if (b.x + b.w * 0.5 < -80) {
        this.buildings.splice(i, 1);
        continue;
      }
      b.flash = Math.max(0, b.flash - dt);
      b.hitCd = Math.max(0, b.hitCd - dt);
      if (!collide || b.exit > 0 || b.hitCd > 0) continue;
      if (this.hitsBuilding(player.x, player.y, player.r, b, groundY)) {
        b.hitCd = 0.55;
        b.flash = 0.15;
        const mid = b.x;
        player.vx += player.x < mid ? -220 : 220;
        player.vy -= 180;
        spark(host.parts, player.x, player.y, accentHex(b.accent), 10, 220, 0.4, 2);
        host.hurtPlayer();
      }
    }
  }

  private hitsBuilding(
    px: number,
    py: number,
    pr: number,
    b: Building,
    groundY: number,
  ): boolean {
    const left = b.x - b.w * 0.5;
    const right = b.x + b.w * 0.5;
    const top = groundY - b.h;
    const bottom = groundY;
    const cx = clamp(px, left, right);
    const cy = clamp(py, top, bottom);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= pr * pr;
  }

  private clampPlayer(host: AdventureHost): void {
    const p = host.player;
    const L = this.boundLeft();
    const R = this.boundRight(host.W);
    if (p.x < L) {
      p.x = L;
      p.vx = Math.abs(p.vx) * 0.35;
    }
    if (p.x > R) {
      p.x = R;
      p.vx = -Math.abs(p.vx) * 0.35;
    }
  }

  /** Damage skyscrapers from player fire. Returns true if bullet should die. */
  tryHitHazard(x: number, y: number, r: number, dmg: number, parts: Particle[], rings: Ring[]): boolean {
    const ground = this.groundY;
    for (const b of this.buildings) {
      if (b.exit > 0) continue;
      if (!this.hitsBuilding(x, y, r, b, ground)) continue;
      b.hp -= dmg;
      b.flash = 0.1;
      if (b.hp <= 0) {
        this.beginExit(b);
        spark(parts, b.x, ground - b.h * 0.35, accentHex(b.accent), 10, 200, 0.4, 2);
        ringFx(rings, b.x, ground - b.h * 0.4, accentHex(b.accent), b.w * 0.25, b.w, 0.28);
      }
      return true;
    }
    return false;
  }

  /** Floor Y — refreshed from host.H each update/draw. */
  groundY = 900;

  draw(ctx: CanvasRenderingContext2D, _t: number, W: number, H: number): void {
    this.groundY = H - GROUND;
    const ground = this.groundY;

    // Layer 1 — far horizon (almost crawls)
    this.drawFarSkyline(ctx, ground, W);

    // Depth haze between far and mid
    const hazeFar = ctx.createLinearGradient(0, ground - 160, 0, ground);
    hazeFar.addColorStop(0, 'rgba(5,6,15,0)');
    hazeFar.addColorStop(0.55, 'rgba(5,8,18,0.2)');
    hazeFar.addColorStop(1, 'rgba(5,8,18,0.35)');
    ctx.fillStyle = hazeFar;
    ctx.fillRect(0, ground - 160, W, 160);

    // Layer 2 — mid-ground city (drifts)
    this.drawMidSkyline(ctx, ground);

    // Soft separation before playfield towers
    ctx.fillStyle = 'rgba(5,6,15,0.18)';
    ctx.fillRect(0, ground - 120, W, 120);

    // Street plane
    ctx.fillStyle = '#070a14';
    ctx.fillRect(0, ground, W, H - ground);
    ctx.strokeStyle = 'rgba(99,247,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, ground + 0.5);
    ctx.lineTo(W, ground + 0.5);
    ctx.stroke();

    // Layer 3 — collidable foreground (full speed)
    const ordered = this.buildings.slice().sort((a, b) => a.h - b.h);
    for (const b of ordered) this.drawBuilding(ctx, b, ground);
    ctx.globalAlpha = 1;

    if (this.phase === 'closing' || this.phase === 'boss') {
      this.drawGate(ctx, this.gateL, true, H);
      this.drawGate(ctx, this.gateR, false, H);
      ctx.fillStyle = 'rgba(4,6,14,0.55)';
      if (this.gateL > 0) ctx.fillRect(0, 0, this.gateL, H);
      if (this.gateR < W) ctx.fillRect(this.gateR, 0, W - this.gateR, H);
    }
  }

  private drawFarSkyline(ctx: CanvasRenderingContext2D, ground: number, W: number): void {
    ctx.save();
    // Continuous base fill so gaps don't flash the grid
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0a0e1c';
    ctx.fillRect(0, ground - 28, W, 28);

    for (const f of this.farBuildings) {
      const left = f.wx - this.farScrollX;
      const top = ground - f.h;
      // Cool, muted distant palette
      const shade = 12 + Math.round(f.tone * 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 18})`;
      ctx.fillRect(left, top, f.w + 0.5, f.h);
    }
    // Soft roof glow line across the silhouette
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#63f7ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of this.farBuildings) {
      const left = f.wx - this.farScrollX;
      const top = ground - f.h;
      ctx.moveTo(left, top + 0.5);
      ctx.lineTo(left + f.w, top + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawMidSkyline(ctx: CanvasRenderingContext2D, ground: number): void {
    ctx.save();
    for (const m of this.midBuildings) {
      const left = m.wx - this.midScrollX;
      const top = ground - m.h;
      const shade = 20 + Math.round(m.tone * 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 22})`;
      ctx.fillRect(left, top, m.w, m.h);

      // Quiet depth edge
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(left + m.w - 4, top, 4, m.h);

      // Sparse static windows — fewer / dimmer than foreground
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#7ab8ff';
      const cols = Math.max(2, Math.floor(m.w / 12));
      const rows = Math.max(2, Math.floor(m.h / 14));
      const padX = m.w * 0.16;
      const padY = m.h * 0.1;
      const cellW = (m.w - padX * 2) / cols;
      const cellH = (m.h - padY * 2) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bit = ((m.seed * 1664525 + r * 97 + c * 53) >>> 0) % 100;
          if (bit < 55) continue;
          ctx.fillRect(
            left + padX + c * cellW + cellW * 0.25,
            top + padY + r * cellH + cellH * 0.3,
            Math.max(1.5, cellW * 0.35),
            Math.max(1.5, cellH * 0.35),
          );
        }
      }

      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = 'rgba(99,247,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, top + 0.5);
      ctx.lineTo(left + m.w, top + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building, ground: number): void {
    const exitT =
      b.exitMax > 0 ? clamp(1 - b.exit / b.exitMax, 0, 1) : 0;
    // Ease-in sink + fade (only while exiting)
    const sink = exitT * exitT;
    const fade = 1 - sink;
    const slide = sink * (b.h * 0.9 + 24);

    const left = b.x - b.w * 0.5;
    const top = ground - b.h;
    const flash = b.flash > 0 && exitT < 0.2;
    const [ar, ag, ab] = ACCENT_RGB[b.accent];
    const body = 16 + Math.round(b.tone * 18);
    const body2 = body + 8;

    ctx.save();
    ctx.translate(0, slide);
    ctx.globalAlpha = fade;

    // Contact shadow on the street
    ctx.globalAlpha = 0.45 * fade;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(b.x, ground + 1 - slide * 0.15, b.w * 0.55 * (1 - sink * 0.4), 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main mass — fully opaque (covers grid behind)
    ctx.globalAlpha = fade;
    ctx.fillStyle = flash ? `rgb(${body2 + 30},${body2 + 34},${body2 + 48})` : `rgb(${body},${body + 4},${body + 16})`;
    ctx.fillRect(left, top, b.w, b.h);

    // Right-face fake depth (narrow darker strip)
    ctx.globalAlpha = 0.4 * fade;
    ctx.fillStyle = '#000';
    ctx.fillRect(left + b.w - Math.max(3, b.w * 0.12), top, Math.max(3, b.w * 0.12), b.h);

    // Left catch-light
    ctx.globalAlpha = 0.16 * fade;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, top, Math.max(2, b.w * 0.06), b.h);

    // Outline — thin neon wire
    ctx.globalAlpha = (flash ? 1 : 0.55) * fade;
    ctx.strokeStyle = flash ? '#fff' : `rgb(${ar},${ag},${ab})`;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(left + 0.5, top + 0.5, b.w - 1, b.h - 1);

    // Floor bands
    ctx.globalAlpha = 0.16 * fade;
    ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
    ctx.lineWidth = 1;
    for (let f = 1; f < b.floors; f++) {
      const fy = top + (f / b.floors) * b.h;
      ctx.beginPath();
      ctx.moveTo(left + 2, fy);
      ctx.lineTo(left + b.w - 2, fy);
      ctx.stroke();
    }

    // Vertical mullions
    ctx.globalAlpha = 0.1 * fade;
    for (let c = 1; c < b.cols; c++) {
      const mx = left + (c / b.cols) * b.w;
      ctx.beginPath();
      ctx.moveTo(mx, top + 2);
      ctx.lineTo(mx, ground - 2);
      ctx.stroke();
    }

    // Lit window slits — static
    const padX = b.w * 0.14;
    const padY = b.h * 0.08;
    const cellW = (b.w - padX * 2) / b.cols;
    const cellH = (b.h - padY * 2) / b.floors;
    const slitW = Math.max(1.5, cellW * 0.34);
    const slitH = Math.max(2, cellH * 0.38);

    for (let row = 0; row < b.floors; row++) {
      for (let col = 0; col < b.cols; col++) {
        const bit = ((b.seed * 1664525 + row * 1013904223 + col * 374761393) >>> 0) % 100;
        if (bit < 48) continue;
        const bright = bit > 78;
        const wx = left + padX + col * cellW + (cellW - slitW) * 0.5;
        const wy = top + padY + row * cellH + (cellH - slitH) * 0.55;
        ctx.globalAlpha = (bright ? 0.7 : 0.4) * fade;
        ctx.fillStyle = `rgb(${ar},${ag},${ab})`;
        ctx.fillRect(wx, wy, slitW, slitH);
      }
    }

    // Crown / cap
    if (b.cap) {
      const capH = Math.min(8, b.h * 0.1);
      const capW = b.w * 0.72;
      const cx = b.x - capW * 0.5;
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgb(${body + 10},${body + 14},${body + 24})`;
      ctx.fillRect(cx, top - capH, capW, capH);
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, top - capH + 0.5, capW - 1, capH - 1);
      ctx.globalAlpha = 0.65 * fade;
      ctx.beginPath();
      ctx.moveTo(left, top);
      ctx.lineTo(left + b.w, top);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.45 * fade;
      ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(left + 1, top);
      ctx.lineTo(left + b.w - 1, top);
      ctx.stroke();
    }

    // Street plinth
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#050810';
    ctx.fillRect(left - 2, ground - 5, b.w + 4, 5);
    ctx.globalAlpha = 0.35 * fade;
    ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left - 2, ground - 5);
    ctx.lineTo(left + b.w + 2, ground - 5);
    ctx.stroke();

    ctx.restore();
  }

  private drawGate(ctx: CanvasRenderingContext2D, x: number, left: boolean, H: number): void {
    const w = 22;
    ctx.save();
    ctx.fillStyle = '#0c1228';
    ctx.strokeStyle = '#63f7ff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.92;
    const gx = left ? x - w : x;
    ctx.fillRect(gx, 0, w, H);
    ctx.strokeRect(gx + 0.5, 0.5, w - 1, H - 1);
    ctx.strokeStyle = 'rgba(99,247,255,0.35)';
    ctx.lineWidth = 1;
    for (let y = 24; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(gx + 5, y);
      ctx.lineTo(gx + w - 5, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function accentHex(a: Building['accent']): string {
  const [r, g, b] = ACCENT_RGB[a];
  return `rgb(${r},${g},${b})`;
}
