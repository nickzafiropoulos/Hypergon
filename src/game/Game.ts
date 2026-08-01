import {
  ETYPE,
  GEM_COL,
  GEM_COL_ACCENT,
  GEM_COL_CORE,
  GEM_FLASH,
  GEM_LIFE,
  MAX_ENEMIES,
  MAX_GEMS,
  POWERS,
  SHIP_MAGNET,
  WEAPONS,
  WORDER,
  type EnemyType,
  type PowerKey,
  type WeaponKey,
} from './catalogue';
import { resumeAudio, SFX, toggleMute, isMuted } from './audio';
import { playMusic, setMusicDucked, setMusicMuted, unlockMusic } from './music';
import { WarpGrid } from './grid';
import { depthScale, flipScale } from './depth';
import { BossDirector } from './BossDirector';
import {
  beatGameSession,
  clearSessionToken,
  startGameSession,
} from '../leaderboard/supabase';
import { angDiff, clamp, len, lerp, norm, pick, rnd, TAU } from './maths';
import { pushParticle, ringFx, spark } from './particles';
import type {
  Beam,
  Bolt,
  Bullet,
  DamageSource,
  Drop,
  EBullet,
  Enemy,
  GameMode,
  GameState,
  Gem,
  Particle,
  Player,
  RailFlash,
  Ring,
  ScorePop,
} from './types';
import { InputSystem } from '../input/InputSystem';

export type ToastFn = (txt: string, sub?: string, ms?: number, col?: string) => void;
export type OverlayFn = () => void;
export type GameOverFn = (stats: {
  score: number;
  best: number;
  kills: number;
  elapsed: number;
  sector: number;
  autofire: boolean;
  mode: GameMode;
}) => void;
export type VictoryFn = GameOverFn;

function loadBest(): number {
  try {
    return +(localStorage.getItem('hypergon.best') || 0) || 0;
  } catch {
    return 0;
  }
}

export class Game {
  cvs: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  bloomC = document.createElement('canvas');
  bctx: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  DPR = 1;
  bloomOn = true;
  isMobile = false;
  reducedMotion = false;

  grid = new WarpGrid();
  input!: InputSystem;

  state: GameState = 'menu';
  mode: GameMode = 'survival';
  bosses = new BossDirector();
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  ebullets: EBullet[] = [];
  parts: Particle[] = [];
  gems: Gem[] = [];
  drops: Drop[] = [];
  bolts: Bolt[] = [];
  rings: Ring[] = [];
  railFlashes: RailFlash[] = [];
  scorePops: ScorePop[] = [];
  /** Consecutive kill chain for floating score size. */
  hitChain = 0;
  hitChainT = 0;
  /** Seconds since last leaderboard session heartbeat. */
  sessionBeatT = 0;

  score = 0;
  best = loadBest();
  mult = 1;
  lives = 3;
  /** Next score threshold that grants an extra life (1k → 10k → 100k → 1m …). */
  nextLifeAt = 1000;
  bombs = 3;
  sector = 1;
  elapsed = 0;
  spawnT = 0;
  shake = 0;
  hitstop = 0;
  gameT = 0;
  kills = 0;
  curW: WeaponKey = 'pulse';
  ammo: Record<WeaponKey, number> = {
    pulse: Infinity,
    scatter: 0,
    lance: 0,
    swarm: 0,
    arc: 0,
    rail: 0,
  };
  fireCd = 0;
  beam: Beam | null = null;
  buffs = { overdrive: 0, timewarp: 0, magnet: 0, drones: 0 };
  shieldHits = 0;
  droneAng = 0;
  gemBank = 0;
  droneCd = [0, 0];
  usedAutofire = false;
  gemHintShown = false;
  gemHint: { gem: Gem; life: number; max: number; x: number; y: number } | null = null;
  attractT = 0;

  player: Player = { x: 0, y: 0, vx: 0, vy: 0, ang: 0, r: 12, invuln: 0, thrust: 0 };

  toast: ToastFn;
  onPause: OverlayFn;
  onResume: OverlayFn;
  onEnterPlay: OverlayFn;
  onGameOver: GameOverFn;
  onVictory: VictoryFn;
  onModeSelect: OverlayFn;

  constructor(
    canvas: HTMLCanvasElement,
    hooks: {
      toast: ToastFn;
      onPause: OverlayFn;
      onResume: OverlayFn;
      onEnterPlay: OverlayFn;
      onGameOver: GameOverFn;
      onVictory: VictoryFn;
      onModeSelect: OverlayFn;
    },
  ) {
    this.cvs = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    const bctx = this.bloomC.getContext('2d');
    if (!bctx) throw new Error('bloom context unavailable');
    this.bctx = bctx;

    this.toast = hooks.toast;
    this.onPause = hooks.onPause;
    this.onResume = hooks.onResume;
    this.onEnterPlay = hooks.onEnterPlay;
    this.onGameOver = hooks.onGameOver;
    this.onVictory = hooks.onVictory;
    this.onModeSelect = hooks.onModeSelect;

    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isMobile =
      matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.bloomOn = !this.isMobile && !this.reducedMotion;
    this.grid.reduced = this.isMobile || this.reducedMotion;

    this.input = new InputSystem(canvas, {
      onPause: () => this.togglePause(),
      onMute: () => {
        const m = toggleMute();
        setMusicMuted(m);
        this.toast(m ? 'MUTED' : 'SOUND ON', '', 420);
      },
      onAutofire: () => {
        if (this.input.autofire) this.usedAutofire = true;
        this.toast(
          this.input.autofire ? 'AUTO-FIRE ON' : 'AUTO-FIRE OFF',
          '',
          520,
          '#ffb02e',
        );
      },
      onCycleWeapon: (d) => this.cycleWeapon(d),
      onBomb: () => this.fireBomb(),
      onStart: () => this.handleStartKey(),
      isPlaying: () => this.state === 'play',
      getPlayerPos: () => this.player,
      getSize: () => ({ W: this.W, H: this.H }),
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Enter: landing → mode select; mode select → survival; over/win → retry mode. */
  handleStartKey(): void {
    if (this.state === 'over' || this.state === 'win') {
      this.startRun();
      return;
    }
    if (this.state === 'menu') {
      this.onModeSelect();
    }
  }

  resize(): void {
    const maxDpr = this.isMobile ? 1.25 : 1.5;
    this.DPR = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.cvs.width = (this.W * this.DPR) | 0;
    this.cvs.height = (this.H * this.DPR) | 0;
    this.cvs.style.width = this.W + 'px';
    this.cvs.style.height = this.H + 'px';
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.bloomC.width = Math.max(2, (this.W / 4) | 0);
    this.bloomC.height = Math.max(2, (this.H / 4) | 0);
    this.grid.build(this.W, this.H);
  }

  resetRun(): void {
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.ebullets.length = 0;
    this.parts.length = 0;
    this.gems.length = 0;
    this.drops.length = 0;
    this.bolts.length = 0;
    this.rings.length = 0;
    this.railFlashes.length = 0;
    this.scorePops.length = 0;
    this.hitChain = 0;
    this.hitChainT = 0;
    this.sessionBeatT = 0;
    clearSessionToken();
    this.score = 0;
    this.mult = 1;
    this.lives = 3;
    this.nextLifeAt = 1000;
    this.bombs = 3;
    this.sector = 1;
    this.elapsed = 0;
    this.spawnT = 1.2;
    this.shake = 0;
    this.kills = 0;
    this.curW = 'pulse';
    this.fireCd = 0;
    this.beam = null;
    this.shieldHits = 0;
    this.gemBank = 0;
    this.usedAutofire = false;
    this.input.autofire = false;
    this.gemHintShown = false;
    this.gemHint = null;
    this.bosses.reset();
    for (const k of Object.keys(this.buffs) as (keyof typeof this.buffs)[]) {
      this.buffs[k] = 0;
    }
    for (const k of WORDER) this.ammo[k] = k === 'pulse' ? Infinity : 0;
    this.player.x = this.W / 2;
    this.player.y = this.H / 2;
    this.player.vx = this.player.vy = 0;
    this.player.invuln = 2.2;
  }

  startRun(mode?: GameMode): void {
    if (mode) this.mode = mode;
    this.resetRun();
    this.state = 'play';
    this.onEnterPlay();
    resumeAudio();
    unlockMusic();
    setMusicDucked(false);
    SFX.launch();
    if (this.mode === 'boss') {
      // Per-boss beds start inside BossDirector.spawnFight.
      this.bosses.begin(this.bossHost());
    } else {
      playMusic('survival');
      this.toast('SECTOR 01', this.sectorName(1), 1500, '#63f7ff');
    }
    void startGameSession(this.mode).then((ok) => {
      if (ok) void this.pulseSession();
    });
  }

  private bossHost() {
    const g = this;
    return {
      get W() {
        return g.W;
      },
      get H() {
        return g.H;
      },
      get parts() {
        return g.parts;
      },
      get rings() {
        return g.rings;
      },
      get enemies() {
        return g.enemies;
      },
      get drops() {
        return g.drops;
      },
      get player() {
        return g.player;
      },
      get buffs() {
        return g.buffs;
      },
      get score() {
        return g.score;
      },
      set score(v: number) {
        g.setScore(v);
      },
      addScore: (n: number) => g.addScore(n),
      get mult() {
        return g.mult;
      },
      get kills() {
        return g.kills;
      },
      set kills(v: number) {
        g.kills = v;
      },
      get sector() {
        return g.sector;
      },
      set sector(v: number) {
        g.sector = v;
      },
      get shake() {
        return g.shake;
      },
      set shake(v: number) {
        g.shake = v;
      },
      get elapsed() {
        return g.elapsed;
      },
      set elapsed(v: number) {
        g.elapsed = v;
      },
      toast: g.toast.bind(g),
      spawnEnemy: (type: EnemyType, x: number, y: number) => g.spawnEnemy(type, x, y),
      pushScorePop: (x: number, y: number, value: number, col: string) =>
        g.pushScorePop(x, y, value, col),
      gridImpulse: (x: number, y: number, force: number, rad: number) =>
        g.grid.impulse(x, y, force, rad),
      onBossVictory: () => g.victory(),
      hurtPlayer: () => g.hurtPlayer(),
      spawnBossGems: (x: number, y: number, n: number) => {
        for (let i = 0; i < n; i++) {
          if (g.gems.length >= MAX_GEMS) break;
          const a = rnd(TAU);
          const s = rnd(220, 80);
          g.gems.push({
            x,
            y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: GEM_LIFE,
            ang: rnd(TAU),
          });
        }
      },
      pushFloatText: (x: number, y: number, text: string, col: string) =>
        g.pushFloatText(x, y, text, col),
      sfxHit: () => SFX.hit(),
      sfxPop: () => SFX.pop(g.hitChain),
      sfxBig: () => SFX.big(),
      sfxBounce: () => SFX.bounce(),
    };
  }

  private sessionStats() {
    return {
      mode: this.mode,
      score: this.score,
      kills: this.kills,
      sector: this.sector,
      bosses_killed: this.mode === 'boss' ? this.bosses.cleared : 0,
      elapsed: this.elapsed,
      autofire: this.usedAutofire,
    };
  }

  private pulseSession(): Promise<boolean> {
    this.sessionBeatT = 0;
    return beatGameSession(this.sessionStats());
  }

  togglePause(): void {
    if (this.state === 'play') {
      this.state = 'paused';
      setMusicDucked(true);
      this.onPause();
    } else if (this.state === 'paused') {
      this.state = 'play';
      setMusicDucked(false);
      this.onResume();
    }
  }

  /** Add points and grant hull at 1k / 10k / 100k / 1m / … milestones. */
  addScore(n: number): void {
    if (n <= 0) return;
    this.setScore(this.score + n);
  }

  setScore(v: number): void {
    this.score = v;
    while (this.nextLifeAt <= this.score) {
      const at = this.nextLifeAt;
      this.nextLifeAt *= 10;
      SFX.power();
      if (this.lives < 5) {
        this.lives++;
        this.toast('+1 HULL', `${at.toLocaleString('en-GB')} score`, 1200, '#4dffc3');
      } else {
        this.toast('HULL MAX', `${at.toLocaleString('en-GB')} score`, 900, '#4dffc3');
      }
    }
  }

  gameOver(): void {
    this.state = 'over';
    playMusic('menu');
    void this.pulseSession();
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem('hypergon.best', String(this.best));
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      if (this.state === 'over') {
        SFX.gameOver();
        this.onGameOver({
          score: this.score,
          best: this.best,
          kills: this.kills,
          elapsed: this.elapsed,
          sector: this.mode === 'boss' ? this.bosses.cleared : this.sector,
          autofire: this.usedAutofire,
          mode: this.mode,
        });
      }
    }, 900);
  }

  victory(): void {
    if (this.state !== 'play') return;
    this.state = 'win';
    playMusic('menu');
    void this.pulseSession();
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem('hypergon.best', String(this.best));
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      if (this.state === 'win') {
        SFX.big();
        this.onVictory({
          score: this.score,
          best: this.best,
          kills: this.kills,
          elapsed: this.elapsed,
          sector: 20,
          autofire: this.usedAutofire,
          mode: 'boss',
        });
      }
    }, 1100);
  }

  cycleWeapon(dir: number): void {
    const owned = WORDER.filter((w) => this.ammo[w] > 0);
    if (owned.length < 2) return;
    let i = owned.indexOf(this.curW);
    if (i < 0) i = 0;
    this.curW = owned[(i + dir + owned.length) % owned.length]!;
    SFX.swap();
  }

  equip(w: WeaponKey, amount: number): void {
    const cur = this.ammo[w] === Infinity ? 0 : this.ammo[w];
    this.ammo[w] = Math.min(cur + amount, WEAPONS[w].cap);
    this.curW = w;
    SFX.weapon();
    this.toast(WEAPONS[w].name, WEAPONS[w].blurb, 1100, WEAPONS[w].colour);
  }

  private mkBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    dmg: number,
    r: number,
    col: string,
    pierce: number,
    life = 1.6,
    src: DamageSource = 'pulse',
  ): Bullet {
    return { x, y, vx, vy, dmg, r, col, pierce, life, homing: false, rail: false, px: x, py: y, src };
  }

  private RECOIL: Record<WeaponKey, number> = {
    pulse: 5,
    scatter: 150,
    lance: 0,
    swarm: 25,
    arc: 0,
    rail: 0,
  };

  shoot(ax: number, ay: number, dt: number): void {
    if (this.ammo[this.curW] <= 0) this.curW = 'pulse';
    const w = WEAPONS[this.curW];
    const rateMul = this.buffs.overdrive > 0 ? 0.5 : 1;

    if (this.curW === 'lance') {
      this.beam = { ax, ay };
      this.ammo.lance -= dt * 60;
      SFX.lance();
      if (this.ammo.lance <= 0) {
        this.ammo.lance = 0;
        this.curW = 'pulse';
      }
      return;
    }
    if (this.fireCd > 0) return;
    this.fireCd = w.rate * rateMul;
    const spd = this.buffs.overdrive > 0 ? 1.18 : 1;
    const px = this.player.x + ax * 16;
    const py = this.player.y + ay * 16;
    const kick = this.RECOIL[this.curW] || 0;
    this.player.vx -= ax * kick;
    this.player.vy -= ay * kick;

    switch (this.curW) {
      case 'pulse': {
        for (const off of [-5, 5]) {
          const nx = -ay;
          const ny = ax;
          this.bullets.push(
            this.mkBullet(
              px + nx * off,
              py + ny * off,
              ax * 1180 * spd,
              ay * 1180 * spd,
              w.dmg,
              3,
              w.colour,
              1,
              1.6,
              'pulse',
            ),
          );
        }
        SFX.shoot();
        break;
      }
      case 'scatter': {
        for (let i = 0; i < 9; i++) {
          const a = Math.atan2(ay, ax) + rnd(0.3, -0.3);
          this.bullets.push(
            this.mkBullet(
              px,
              py,
              Math.cos(a) * rnd(1080, 780) * spd,
              Math.sin(a) * rnd(1080, 780) * spd,
              w.dmg,
              3,
              w.colour,
              1,
              0.45,
              'scatter',
            ),
          );
        }
        this.ammo.scatter--;
        SFX.scatter();
        break;
      }
      case 'swarm': {
        for (const off of [-14, 14]) {
          const nx = -ay;
          const ny = ax;
          const b = this.mkBullet(
            px + nx * off,
            py + ny * off,
            ax * 380 + nx * off * 9,
            ay * 380 + ny * off * 9,
            w.dmg,
            4,
            w.colour,
            1,
            2.4,
            'swarm',
          );
          b.homing = true;
          this.bullets.push(b);
        }
        this.ammo.swarm--;
        SFX.swarm();
        break;
      }
      case 'arc': {
        this.ammo.arc--;
        SFX.arc();
        this.chainLightning(ax, ay, w.dmg);
        break;
      }
      case 'rail': {
        const b = this.mkBullet(px, py, ax * 2600, ay * 2600, w.dmg, 10, '#e8fbff', 99, 1.15, 'rail');
        b.rail = true;
        this.bullets.push(b);
        this.railFlashes.push({ x: px, y: py, ax, ay, life: 0.32, max: 0.32 });
        this.ammo.rail--;
        SFX.rail();
        this.shake = Math.max(this.shake, 9);
        this.player.vx -= ax * 420;
        this.player.vy -= ay * 420;
        this.grid.impulse(px, py, 14, 280);
        break;
      }
    }
  }

  chainLightning(ax: number, ay: number, dmg: number): void {
    const pts = [{ x: this.player.x, y: this.player.y }];
    let from: { x: number; y: number } = this.player;
    const hitIds = new Set<Enemy>();
    let hops = 0;
    let reach = 460;
    let hitBoss = false;
    while (hops < 4) {
      let best: Enemy | null = null;
      let bd = reach * reach;
      for (const e of this.enemies) {
        if (e.dead || hitIds.has(e)) continue;
        const dx = e.x - from.x;
        const dy = e.y - from.y;
        const d2 = dx * dx + dy * dy;
        if (hops === 0) {
          const a = Math.atan2(dy, dx);
          if (Math.abs(angDiff(a, Math.atan2(ay, ax))) > 0.9) continue;
        }
        if (d2 < bd) {
          bd = d2;
          best = e;
        }
      }
      // Prefer boss if closer / in cone on first hops
      if (this.mode === 'boss' && this.bosses.boss && !this.bosses.boss.dead && !hitBoss) {
        const b = this.bosses.boss;
        const dx = b.x - from.x;
        const dy = b.y - from.y;
        const d2 = dx * dx + dy * dy;
        let ok = true;
        if (hops === 0) {
          const a = Math.atan2(dy, dx);
          if (Math.abs(angDiff(a, Math.atan2(ay, ax))) > 0.9) ok = false;
        }
        if (ok && d2 < bd) {
          pts.push({ x: b.x, y: b.y });
          this.bosses.tryHit(this.bossHost(), b.x, b.y, 8, dmg * (1 - hops * 0.12), 'arc', {
            ang: Math.atan2(b.y - from.y, b.x - from.x),
          });
          spark(this.parts, b.x, b.y, '#d5c6ff', 8, 240, 0.45, 2);
          from = b;
          reach = 300;
          hops++;
          hitBoss = true;
          continue;
        }
      }
      if (!best) break;
      hitIds.add(best);
      pts.push({ x: best.x, y: best.y });
      this.damage(best, dmg * (1 - hops * 0.12));
      spark(this.parts, best.x, best.y, '#d5c6ff', 6, 220, 0.4, 2);
      from = best;
      reach = 300;
      hops++;
    }
    if (pts.length > 1) this.bolts.push({ pts, life: 0.16, max: 0.16, col: '#c9b4ff' });
  }

  fireBomb(): void {
    if (this.state !== 'play' || this.bombs <= 0) return;
    this.bombs--;
    SFX.bomb();
    this.shake = 26;
    this.hitstop = 0.08;
    this.grid.impulse(this.player.x, this.player.y, 34, Math.max(this.W, this.H));
    ringFx(this.rings, this.player.x, this.player.y, '#ffffff', 30, Math.max(this.W, this.H) * 0.8, 0.75);
    ringFx(this.rings, this.player.x, this.player.y, '#63f7ff', 10, Math.max(this.W, this.H) * 0.55, 1.0);
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e, true);
    if (this.mode === 'boss') this.bosses.applyBomb(this.bossHost());
    this.ebullets.length = 0;
    spark(this.parts, this.player.x, this.player.y, '#ffffff', 60, 700, 1.1, 3);
  }

  spawnEnemy(type: EnemyType, x: number, y: number): Enemy {
    const t = ETYPE[type];
    const e: Enemy = {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      r: t.r,
      hp: t.hp,
      maxhp: t.hp,
      col: t.col,
      spd: t.spd,
      ang: rnd(TAU),
      spin: rnd(2.4, -2.4),
      dead: false,
      birth: 0.55,
      flash: 0,
      wob: rnd(TAU),
    };
    if (type === 'serpent') {
      e.segs = [];
      for (let i = 0; i < 9; i++) e.segs.push({ x, y });
    }
    if (type === 'sentry') e.cd = rnd(1.6, 0.6);
    if (type === 'bulwark') e.sa = rnd(TAU);
    if (type === 'singular') {
      e.grow = 0;
      e.pulse = 0;
    }
    if (type === 'splitter') e.gen = 0;
    this.enemies.push(e);
    ringFx(this.rings, x, y, t.col, t.r * 3.4, t.r * 0.6, 0.5);
    return e;
  }

  safeSpawnPoint(): [number, number] {
    for (let i = 0; i < 24; i++) {
      const x = rnd(this.W - 90, 90);
      const y = rnd(this.H - 90, 90);
      if (len(x - this.player.x, y - this.player.y) > 230) return [x, y];
    }
    return [rnd(this.W - 90, 90), rnd(this.H - 90, 90)];
  }

  damage(e: Enemy, amount: number): void {
    if (e.dead || e.birth > 0) return;
    e.hp -= amount;
    e.flash = 0.12;
    if (e.type === 'singular') e.grow = (e.grow || 0) + amount * 0.7;
    if (e.hp <= 0) this.killEnemy(e, false);
    else {
      SFX.hit();
      spark(this.parts, e.x, e.y, e.col, 3, 140, 0.28, 1.8);
    }
  }

  /** @param award false = death-clear / no credit (no score, gems, splits). */
  killEnemy(e: Enemy, byBomb: boolean, award = true): void {
    if (e.dead) return;
    e.dead = true;
    const t = ETYPE[e.type];
    if (award) {
      const gained = t.score * this.mult;
      this.addScore(gained);
      this.kills++;
      this.pushScorePop(e.x, e.y, gained, e.col);
    }
    spark(
      this.parts,
      e.x,
      e.y,
      e.col,
      e.type === 'singular' ? 40 : 12 + e.r,
      e.type === 'singular' ? 520 : 300,
      0.85,
      2.6,
    );
    this.grid.impulse(e.x, e.y, e.type === 'singular' ? 30 : 7, e.r * 9);
    ringFx(this.rings, e.x, e.y, e.col, e.r * 0.8, e.r * 4.5, 0.35);
    this.shake = Math.max(this.shake, e.r * 0.22);
    if (e.type === 'singular') {
      if (award) SFX.big();
      this.shake = Math.max(this.shake, 18);
      if (award) {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          this.spawnEnemy('shard', e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46);
        }
      }
    } else if (award) {
      SFX.pop(this.hitChain);
    }

    if (award && e.type === 'splitter' && (e.gen || 0) < 2) {
      const n = e.gen === 0 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = rnd(TAU);
        const c = this.spawnEnemy('splitter', e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22);
        c.gen = (e.gen || 0) + 1;
        c.r = ETYPE.splitter.r / (1 + c.gen);
        c.hp = c.maxhp = Math.max(1, 4 - c.gen * 2);
        c.spd = ETYPE.splitter.spd * (1 + c.gen * 0.45);
        c.birth = 0.18;
      }
    }

    if (!award) return;

    const gn = byBomb ? Math.ceil(t.gems / 2) : t.gems;
    let firstGem: Gem | null = null;
    for (let i = 0; i < gn; i++) {
      if (this.gems.length >= MAX_GEMS) break;
      const a = rnd(TAU);
      const s = rnd(190, 60);
      const gem: Gem = {
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: GEM_LIFE,
        ang: rnd(TAU),
      };
      this.gems.push(gem);
      if (!firstGem) firstGem = gem;
    }
    if (!this.gemHintShown && firstGem) {
      this.gemHintShown = true;
      this.gemHint = { gem: firstGem, life: 5.2, max: 5.2, x: firstGem.x, y: firstGem.y };
    }
    if (!byBomb) {
      const roll = Math.random();
      if (roll < 0.045) this.dropCrate(e.x, e.y, 'weapon');
      else if (roll < 0.1) this.dropCrate(e.x, e.y, 'power');
    }
  }

  dropCrate(x: number, y: number, kind: 'weapon' | 'power'): void {
    // One pickup on screen at a time — more than that gets noisy.
    if (this.drops.length > 0) return;
    let key: WeaponKey | PowerKey;
    if (kind === 'weapon') key = pick(['scatter', 'lance', 'swarm', 'arc', 'rail'] as const);
    else {
      const pool: PowerKey[] = ['shield', 'overdrive', 'timewarp', 'magnet', 'drones', 'bomb'];
      if (this.lives < 4 && Math.random() < 0.12) {
        pool.push('life', 'life');
      }
      key = pick(pool);
    }
    this.drops.push({
      x,
      y,
      vx: rnd(60, -60),
      vy: rnd(60, -60),
      kind,
      key,
      life: 14,
      ang: 0,
      bob: rnd(TAU),
    });
  }

  sectorName(n: number): string {
    const names = [
      'first light',
      'the swarm thickens',
      'shard rain',
      'deep static',
      'collapse',
      'event horizon',
      'no more mercy',
    ];
    return names[Math.min(n - 1, names.length - 1)]!;
  }

  director(dt: number): void {
    this.elapsed += dt;
    const newSector = 1 + Math.floor(this.elapsed / 40);
    if (newSector !== this.sector) {
      this.sector = newSector;
      this.toast('SECTOR ' + String(this.sector).padStart(2, '0'), this.sectorName(this.sector), 1400, '#63f7ff');
      SFX.sector();
      if (this.sector % 3 === 0) this.bombs = Math.min(this.bombs + 1, 5);
    }
    const diff = 1 + this.elapsed / 34;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length < MAX_ENEMIES) {
      this.spawnT = clamp(2.0 - this.elapsed / 70, 0.38, 2.0) * rnd(1.25, 0.75);
      const unlocked: EnemyType[] = ['drifter', 'seeker'];
      if (this.elapsed > 18) unlocked.push('weaver');
      if (this.elapsed > 36) unlocked.push('splitter');
      if (this.elapsed > 58) unlocked.push('sentry');
      if (this.elapsed > 80) unlocked.push('serpent');
      if (this.elapsed > 104) unlocked.push('bulwark');
      const type = pick(unlocked);
      const group = clamp(Math.round(rnd(diff * 1.4, 1)), 1, 7);
      if (Math.random() < 0.22) {
        const [cx, cy] = this.safeSpawnPoint();
        const rr = 60 + group * 7;
        for (let i = 0; i < group; i++) {
          if (this.enemies.length >= MAX_ENEMIES) break;
          const a = (i / group) * TAU;
          this.spawnEnemy(
            type,
            clamp(cx + Math.cos(a) * rr, 40, this.W - 40),
            clamp(cy + Math.sin(a) * rr, 40, this.H - 40),
          );
        }
      } else {
        for (let i = 0; i < group; i++) {
          if (this.enemies.length >= MAX_ENEMIES) break;
          const [x, y] = this.safeSpawnPoint();
          this.spawnEnemy(type, x, y);
        }
      }
      if (
        this.elapsed > 66 &&
        Math.random() < 0.09 &&
        this.enemies.filter((e) => e.type === 'singular').length < 2
      ) {
        const [x, y] = this.safeSpawnPoint();
        this.spawnEnemy('singular', x, y);
        this.toast('SINGULARITY', 'it eats the grid', 1100, '#ff2d55');
        SFX.singularity();
      }
    }
  }

  hitPlayer(x: number, y: number, r: number): boolean {
    if (this.player.invuln > 0) return false;
    return (x - this.player.x) ** 2 + (y - this.player.y) ** 2 < (r + this.player.r) ** 2;
  }

  hurtPlayer(): void {
    if (this.player.invuln > 0) return;
    if (this.shieldHits > 0) {
      this.shieldHits--;
      this.player.invuln = 0.7;
      this.shake = Math.max(this.shake, 10);
      ringFx(this.rings, this.player.x, this.player.y, '#63f7ff', 18, 190, 0.4);
      spark(this.parts, this.player.x, this.player.y, '#63f7ff', 20, 340, 0.5, 2.4);
      this.grid.impulse(this.player.x, this.player.y, 12, 300);
      SFX.shield();
      return;
    }
    this.lives--;
    this.player.invuln = 2.6;
    this.mult = 1;
    this.gemBank = 0;
    if (this.lives <= 0) SFX.death();
    else SFX.hurt();
    this.shake = 32;
    this.hitstop = 0.13;
    spark(this.parts, this.player.x, this.player.y, '#ffffff', 50, 560, 1.1, 3);
    ringFx(this.rings, this.player.x, this.player.y, '#ffffff', 20, 420, 0.6);
    this.grid.impulse(this.player.x, this.player.y, 26, Math.max(this.W, this.H) * 0.6);
    for (const e of this.enemies) {
      if (!e.dead && len(e.x - this.player.x, e.y - this.player.y) < 300) {
        this.killEnemy(e, true, false);
      }
    }
    this.ebullets.length = 0;
    this.player.vx = this.player.vy = 0;
    if (this.lives <= 0) this.gameOver();
  }

  collect(p: Drop): void {
    if (p.kind === 'weapon') {
      this.equip(p.key as WeaponKey, WEAPONS[p.key as WeaponKey].cap);
      return;
    }
    const meta = POWERS[p.key as PowerKey];
    SFX.power();
    spark(this.parts, p.x, p.y, meta.col, 18, 300, 0.6, 2.4);
    ringFx(this.rings, p.x, p.y, meta.col, 10, 150, 0.4);
    switch (p.key) {
      case 'shield':
        this.shieldHits = 3;
        break;
      case 'overdrive':
        this.buffs.overdrive = 12;
        break;
      case 'timewarp':
        this.buffs.timewarp = 9;
        break;
      case 'magnet':
        this.buffs.magnet = 14;
        break;
      case 'drones':
        this.buffs.drones = 16;
        break;
      case 'bomb':
        this.bombs = Math.min(this.bombs + 1, 5);
        break;
      case 'life':
        this.lives = Math.min(this.lives + 1, 5);
        break;
    }
    this.toast(meta.name, meta.blurb, 1000, meta.col);
  }

  update(dt: number): void {
    this.gameT += dt;
    if (this.hitChain > 0) {
      this.hitChainT -= dt;
      if (this.hitChainT <= 0) {
        this.hitChain = 0;
        this.hitChainT = 0;
      }
    }
    this.sessionBeatT += dt;
    if (this.sessionBeatT >= 5) void this.pulseSession();
    const ets = this.buffs.timewarp > 0 ? 0.32 : 1;
    for (const k of Object.keys(this.buffs) as (keyof typeof this.buffs)[]) {
      if (this.buffs[k] > 0) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    }

    const st = this.input.readSticks();
    const accel = 2400;
    this.player.vx += st.mx * accel * dt;
    this.player.vy += st.my * accel * dt;
    const fr = Math.pow(0.003, dt);
    this.player.vx *= fr;
    this.player.vy *= fr;
    const sp = len(this.player.vx, this.player.vy);
    const maxSp = 560;
    if (sp > maxSp) {
      this.player.vx = (this.player.vx / sp) * maxSp;
      this.player.vy = (this.player.vy / sp) * maxSp;
    }
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    if (this.player.x < 16) {
      this.player.x = 16;
      this.player.vx = Math.abs(this.player.vx) * 0.4;
      this.grid.impulse(this.player.x, this.player.y, 4, 170);
    }
    if (this.player.x > this.W - 16) {
      this.player.x = this.W - 16;
      this.player.vx = -Math.abs(this.player.vx) * 0.4;
      this.grid.impulse(this.player.x, this.player.y, 4, 170);
    }
    if (this.player.y < 16) {
      this.player.y = 16;
      this.player.vy = Math.abs(this.player.vy) * 0.4;
      this.grid.impulse(this.player.x, this.player.y, 4, 170);
    }
    if (this.player.y > this.H - 16) {
      this.player.y = this.H - 16;
      this.player.vy = -Math.abs(this.player.vy) * 0.4;
      this.grid.impulse(this.player.x, this.player.y, 4, 170);
    }
    this.player.thrust = Math.min(1, sp / 420);
    // Soft ship wake — strong wells made the grid hard to read around the player.
    this.grid.impulse(this.player.x, this.player.y, -0.1 - this.player.thrust * 0.14, 78);
    if (this.player.invuln > 0) this.player.invuln -= dt;

    // Don't use `ax || 1` — a pure vertical aim has ax === 0 and would lock right.
    let ax: number;
    let ay: number;
    if (Math.hypot(st.ax, st.ay) > 1e-6) {
      [ax, ay] = norm(st.ax, st.ay);
      this.player.ang = Math.atan2(ay, ax);
    } else {
      ax = Math.cos(this.player.ang);
      ay = Math.sin(this.player.ang);
    }
    this.fireCd -= dt;
    this.beam = null;
    if (st.firing) this.shoot(ax, ay, dt);
    const beam = this.beam as Beam | null;

    // Sparkly thruster trail — thin, dense, fades out toward the tip.
    if (this.player.thrust > 0.04) {
      const bx = -Math.cos(this.player.ang);
      const by = -Math.sin(this.player.ang);
      const px = -by;
      const py = bx;
      const od = this.buffs.overdrive > 0;
      const cols = od
        ? (['#ffb02e', '#ffe08a', '#ffffff', '#ff7a3d'] as const)
        : (['#ffffff', '#7cf9ff', '#63f7ff', '#eaf6ff'] as const);
      const n = 3 + ((this.player.thrust * 5 + Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const side = rnd(1.1, -1.1);
        const back = 8 + rnd(5);
        const twinkle = Math.random() < 0.3;
        const spit = 210 + this.player.thrust * 240;
        pushParticle(this.parts, {
          x: this.player.x + bx * back + px * side,
          y: this.player.y + by * back + py * side,
          vx: bx * rnd(spit, spit * 0.6) + px * rnd(10, -10) - this.player.vx * 0.5,
          vy: by * rnd(spit, spit * 0.6) + py * rnd(10, -10) - this.player.vy * 0.5,
          life: twinkle ? rnd(0.65, 0.3) : rnd(1.45, 0.85),
          max: twinkle ? 0.65 : 1.45,
          col: cols[(Math.random() * cols.length) | 0]!,
          size: twinkle ? rnd(2.0, 1.0) : rnd(1.35, 0.45),
          drag: twinkle ? 0.945 : 0.98,
          z: rnd(0.22, 0.06),
        });
      }
    }

    this.droneAng += dt * 2.1;
    if (this.buffs.drones > 0) {
      for (let d = 0; d < 2; d++) {
        const a = this.droneAng + d * Math.PI;
        const dx = this.player.x + Math.cos(a) * 58;
        const dy = this.player.y + Math.sin(a) * 58;
        this.droneCd[d]! -= dt;
        if (this.droneCd[d]! <= 0) {
          let best: Enemy | null = null;
          let bd = 1e9;
          for (const e of this.enemies) {
            if (e.dead || e.birth > 0) continue;
            const q = (e.x - dx) ** 2 + (e.y - dy) ** 2;
            if (q < bd) {
              bd = q;
              best = e;
            }
          }
          let tx = best?.x;
          let ty = best?.y;
          if (this.mode === 'boss' && this.bosses.boss && !this.bosses.boss.dead) {
            const b = this.bosses.boss;
            const q = (b.x - dx) ** 2 + (b.y - dy) ** 2;
            if (q < bd) {
              bd = q;
              tx = b.x;
              ty = b.y;
              best = null;
            }
          }
          if ((best || tx !== undefined) && bd < 560 * 560) {
            this.droneCd[d] = 0.3;
            const [bx, by] = norm((tx ?? 0) - dx, (ty ?? 0) - dy);
            this.bullets.push(
              this.mkBullet(dx, dy, bx * 980, by * 980, 0.9, 2.4, '#ff8fd0', 1, 1.1, 'drone'),
            );
            SFX.drone();
          }
        }
      }
    }

    if (beam) {
      const bx = beam.ax;
      const by = beam.ay;
      const end = 2400;
      for (const e of this.enemies) {
        if (e.dead || e.birth > 0) continue;
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const t = dx * bx + dy * by;
        if (t < 0 || t > end) continue;
        const perp = Math.abs(dx * by - dy * bx);
        if (perp < e.r + 9) {
          this.damage(e, WEAPONS.lance.dmg * dt);
          e.vx += bx * 90 * dt;
          e.vy += by * 90 * dt;
          if (Math.random() < 0.5) spark(this.parts, e.x, e.y, '#ff8fd0', 1, 120, 0.2, 1.6);
        }
      }
      if (this.mode === 'boss' && this.bosses.boss && !this.bosses.boss.dead) {
        const boss = this.bosses.boss;
        const dx = boss.x - this.player.x;
        const dy = boss.y - this.player.y;
        const t = dx * bx + dy * by;
        if (t > 0 && t < end) {
          const perp = Math.abs(dx * by - dy * bx);
          if (perp < boss.r + 9) {
            this.bosses.tryHit(
              this.bossHost(),
              boss.x,
              boss.y,
              8,
              WEAPONS.lance.dmg * dt,
              'lance',
              { ang: Math.atan2(dy, dx) },
            );
            if (Math.random() < 0.5) spark(this.parts, boss.x, boss.y, '#ff8fd0', 1, 120, 0.2, 1.6);
          }
        }
      }
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i]!;
        const dx = b.x - this.player.x;
        const dy = b.y - this.player.y;
        const t = dx * bx + dy * by;
        if (t > 0 && t < end && Math.abs(dx * by - dy * bx) < 12) {
          spark(this.parts, b.x, b.y, '#ff3fa4', 5, 180, 0.3, 2);
          this.ebullets.splice(i, 1);
        }
      }
      for (let s = 40; s < 1600; s += 90) {
        this.grid.impulse(this.player.x + bx * s, this.player.y + by * s, -0.35, 70);
      }
    }

    this.updateBullets(dt);
    this.updateEBullets(dt, ets);
    this.updateEnemies(dt, ets);
    this.updateGems(dt);
    this.updateDrops(dt);
    this.updateFx(dt);
    this.grid.update(dt);
    if (this.mode === 'boss') this.bosses.update(dt, this.bossHost());
    else this.director(dt);
    this.shake = Math.max(0, this.shake - dt * 46);
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) break;
      // Keep rail muzzle anchored so the trail grows into a full beam.
      if (!b.rail) {
        b.px = b.x;
        b.py = b.y;
      }
      if (b.homing) {
        let tx = 0;
        let ty = 0;
        let bd = 420 * 420;
        let found = false;
        for (const e of this.enemies) {
          if (e.dead || e.birth > 0) continue;
          const q = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (q < bd) {
            bd = q;
            tx = e.x;
            ty = e.y;
            found = true;
          }
        }
        if (this.mode === 'boss' && this.bosses.boss && !this.bosses.boss.dead) {
          const boss = this.bosses.boss;
          const q = (boss.x - b.x) ** 2 + (boss.y - b.y) ** 2;
          if (q < bd) {
            tx = boss.x;
            ty = boss.y;
            found = true;
          }
        }
        if (found) {
          const [hx, hy] = norm(tx - b.x, ty - b.y);
          b.vx = lerp(b.vx, hx * 760, 1 - Math.pow(0.0007, dt));
          b.vy = lerp(b.vy, hy * 760, 1 - Math.pow(0.0007, dt));
        } else {
          b.vx *= 1.012;
          b.vy *= 1.012;
        }
        if (Math.random() < 0.4) {
          pushParticle(this.parts, {
            x: b.x,
            y: b.y,
            vx: rnd(40, -40),
            vy: rnd(40, -40),
            life: 0.25,
            max: 0.25,
            col: '#b8ff3d',
            size: 1.6,
            drag: 0.9,
          });
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.rail) {
        this.grid.impulse(b.x, b.y, 1.4, 120);
        if (Math.random() < 0.5) {
          pushParticle(this.parts, {
            x: b.x,
            y: b.y,
            vx: rnd(90, -90),
            vy: rnd(90, -90),
            life: 0.3,
            max: 0.3,
            col: '#dff3ff',
            size: 2,
            drag: 0.9,
          });
        }
      }
      if (b.life <= 0 || b.x < -40 || b.x > this.W + 40 || b.y < -40 || b.y > this.H + 40) {
        this.bullets.splice(i, 1);
        continue;
      }
      if (this.mode === 'boss') {
        const src = b.src || (b.rail ? 'rail' : b.homing ? 'swarm' : 'pulse');
        const hit = this.bosses.tryHit(this.bossHost(), b.x, b.y, b.r, b.dmg, src, {
          ang: Math.atan2(b.vy, b.vx),
          ricochet: b.ricochet || 0,
        });
        if (hit === 'env' && !b.rail) {
          // Reflective pillar bounce
          const block = this.bosses.env.tryBlockBullet(b.x, b.y, b.r);
          if (block?.reflective) {
            const [nx, ny] = norm(b.x - block.hit.x, b.y - block.hit.y);
            b.vx = nx * 760 + rnd(160, -160);
            b.vy = ny * 760 + rnd(160, -160);
            b.life = Math.min(b.life, 0.65);
            b.ricochet = (b.ricochet || 0) + 1;
            spark(this.parts, b.x, b.y, block.hit.col, 4, 180, 0.25, 2);
            SFX.bounce();
            continue;
          }
          b.pierce--;
          if (b.pierce <= 0) {
            spark(this.parts, b.x, b.y, b.col, 4, 180, 0.25, 2);
            this.bullets.splice(i, 1);
            continue;
          }
        } else if (hit === 'boss' || hit === 'decoy') {
          b.pierce--;
          if (b.pierce <= 0) {
            spark(this.parts, b.x, b.y, b.col, 4, 180, 0.25, 2);
            this.bullets.splice(i, 1);
            continue;
          }
        } else if (hit === 'body') {
          // serpent body — no damage, bullet stops
          spark(this.parts, b.x, b.y, b.col, 3, 120, 0.2, 1.6);
          this.bullets.splice(i, 1);
          continue;
        }
      }
      for (const e of this.enemies) {
        if (e.dead || e.birth > 0) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > (e.r + b.r) ** 2) continue;
        if (e.type === 'bulwark') {
          const a = Math.atan2(-dy, -dx);
          if (Math.abs(angDiff(a, e.sa || 0)) < 1.15 && !b.rail) {
            const [nx, ny] = norm(-dx, -dy);
            b.vx = nx * 760 + rnd(160, -160);
            b.vy = ny * 760 + rnd(160, -160);
            b.life = Math.min(b.life, 0.65);
            b.ricochet = (b.ricochet || 0) + 1;
            spark(this.parts, b.x, b.y, '#ff7a3d', 4, 180, 0.25, 2);
            SFX.bounce();
            continue;
          }
        }
        this.damage(e, b.dmg);
        e.vx += b.vx * 0.045;
        e.vy += b.vy * 0.045;
        b.pierce--;
        if (b.pierce <= 0) {
          spark(this.parts, b.x, b.y, b.col, 4, 180, 0.25, 2);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  private updateEBullets(dt: number, ets: number): void {
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      if (!b) break;
      b.x += b.vx * dt * ets;
      b.y += b.vy * dt * ets;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > this.W + 30 || b.y < -30 || b.y > this.H + 30) {
        this.ebullets.splice(i, 1);
        continue;
      }
      if (this.hitPlayer(b.x, b.y, b.r)) {
        this.ebullets.splice(i, 1);
        this.hurtPlayer();
        continue;
      }
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const p = this.bullets[j]!;
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + p.r + 2) ** 2) {
          spark(this.parts, b.x, b.y, '#ff3fa4', 6, 200, 0.3, 2);
          this.ebullets.splice(i, 1);
          if (--p.pierce <= 0) this.bullets.splice(j, 1);
          break;
        }
      }
    }
  }

  private updateEnemies(dt: number, ets: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (e.birth > 0) {
        e.birth -= dt;
        continue;
      }
      e.flash = Math.max(0, e.flash - dt);
      e.ang += e.spin * dt * ets;
      const [tx, ty] = norm(this.player.x - e.x, this.player.y - e.y);
      const d = len(this.player.x - e.x, this.player.y - e.y);

      switch (e.type) {
        case 'drifter': {
          e.wob += dt * ets * 1.4;
          e.vx += Math.cos(e.wob * 1.3) * 40 * dt * ets;
          e.vy += Math.sin(e.wob) * 40 * dt * ets;
          break;
        }
        case 'seeker':
        case 'shard': {
          e.vx += tx * e.spd * 3.2 * dt * ets;
          e.vy += ty * e.spd * 3.2 * dt * ets;
          break;
        }
        case 'weaver': {
          let dx = tx;
          let dy = ty;
          for (const b of this.bullets) {
            const q = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
            if (q < 150 * 150) {
              const [fx, fy] = norm(e.x - b.x, e.y - b.y);
              dx += fx * 2.6;
              dy += fy * 2.6;
            }
          }
          const [nx, ny] = norm(dx, dy);
          e.vx += nx * e.spd * 3.4 * dt * ets;
          e.vy += ny * e.spd * 3.4 * dt * ets;
          break;
        }
        case 'splitter': {
          e.vx += tx * e.spd * 2.2 * dt * ets;
          e.vy += ty * e.spd * 2.2 * dt * ets;
          break;
        }
        case 'serpent': {
          e.wob += dt * ets * 3.2;
          const perpx = -ty;
          const perpy = tx;
          const s = Math.sin(e.wob) * 0.9;
          e.vx += (tx + perpx * s) * e.spd * 3.0 * dt * ets;
          e.vy += (ty + perpy * s) * e.spd * 3.0 * dt * ets;
          let px = e.x;
          let py = e.y;
          for (const sg of e.segs || []) {
            const dx = px - sg.x;
            const dy = py - sg.y;
            const dd = len(dx, dy);
            if (dd > 17) {
              sg.x += dx * (1 - 17 / dd);
              sg.y += dy * (1 - 17 / dd);
            }
            px = sg.x;
            py = sg.y;
          }
          break;
        }
        case 'sentry': {
          // Orbit / kite — no projectile spam.
          const ideal = 220;
          const push = d < ideal ? -1.15 : 1.35;
          e.vx += tx * e.spd * 3.4 * dt * ets * push;
          e.vy += ty * e.spd * 3.4 * dt * ets * push;
          e.vx += -ty * e.spd * 2.6 * dt * ets;
          e.vy += tx * e.spd * 2.6 * dt * ets;
          break;
        }
        case 'bulwark': {
          e.sa = (e.sa || 0) + dt * ets * 1.15;
          e.vx += tx * e.spd * 2.4 * dt * ets;
          e.vy += ty * e.spd * 2.4 * dt * ets;
          break;
        }
        case 'singular': {
          e.pulse = (e.pulse || 0) + dt * ets;
          e.grow = e.grow || 0;
          e.r = ETYPE.singular.r + Math.min(e.grow * 1.6, 26) + Math.sin(e.pulse * 4) * 1.6;
          e.vx += tx * e.spd * 2 * dt * ets;
          e.vy += ty * e.spd * 2 * dt * ets;
          const R = 460 + e.grow * 8;
          this.grid.impulse(e.x, e.y, -(0.55 + e.grow * 0.035), R);
          const pull = (o: { x: number; y: number; vx: number; vy: number }, strength: number) => {
            const dx = e.x - o.x;
            const dy = e.y - o.y;
            const dd = Math.max(28, len(dx, dy));
            if (dd < R) {
              const f = (strength * (1 - dd / R)) / dd;
              o.vx += dx * f * dt * 60;
              o.vy += dy * f * dt * 60;
            }
          };
          pull(this.player, 3.4);
          for (const g of this.gems) pull(g, 12);
          for (const b of this.bullets) if (!b.rail) pull(b, 1.2);
          for (const o of this.enemies) if (o !== e && !o.dead) pull(o, 0.9);
          if (Math.random() < 0.35) {
            const a = rnd(TAU);
            const rr = R * rnd(1, 0.35);
            pushParticle(this.parts, {
              x: e.x + Math.cos(a) * rr,
              y: e.y + Math.sin(a) * rr,
              vx: -Math.cos(a) * rr * 1.6,
              vy: -Math.sin(a) * rr * 1.6,
              life: 0.6,
              max: 0.6,
              col: '#ff2d55',
              size: 1.8,
              drag: 0.99,
            });
          }
          break;
        }
      }
      const es = len(e.vx, e.vy);
      const cap = e.spd * 1.9;
      if (es > cap) {
        e.vx = (e.vx / es) * cap;
        e.vy = (e.vy / es) * cap;
      }
      e.vx *= Math.pow(0.3, dt);
      e.vy *= Math.pow(0.3, dt);
      e.x += e.vx * dt * ets;
      e.y += e.vy * dt * ets;

      if (e.x < e.r) {
        e.x = e.r;
        e.vx = Math.abs(e.vx);
      }
      if (e.x > this.W - e.r) {
        e.x = this.W - e.r;
        e.vx = -Math.abs(e.vx);
      }
      if (e.y < e.r) {
        e.y = e.r;
        e.vy = Math.abs(e.vy);
      }
      if (e.y > this.H - e.r) {
        e.y = this.H - e.r;
        e.vy = -Math.abs(e.vy);
      }
      this.grid.impulse(e.x, e.y, e.type === 'singular' ? 0 : -0.22, e.r * 3.6);

      if (this.hitPlayer(e.x, e.y, e.r)) this.hurtPlayer();
      else if (e.segs) {
        for (const sg of e.segs) {
          if (this.hitPlayer(sg.x, sg.y, 10)) {
            this.hurtPlayer();
            break;
          }
        }
      }
    }
    if (this.mode === 'boss' && this.bosses.touchesPlayer(this.player)) {
      this.hurtPlayer();
    }
  }

  /** Pull a loose pickup toward the ship — stronger when closer; LODESTONE widens the field. */
  private applyShipMagnet(
    o: { x: number; y: number; vx: number; vy: number },
    dt: number,
    dx: number,
    dy: number,
    d: number,
  ): void {
    const lode = this.buffs.magnet > 0;
    const magR = lode ? SHIP_MAGNET.lodeRadius : SHIP_MAGNET.radius;
    if (d >= magR || d < 1e-4) return;

    const nx = dx / d;
    const ny = dy / d;
    const proximity = 1 - d / magR;
    const pull = proximity * proximity;
    const strength = lode ? SHIP_MAGNET.lodeStrength : SHIP_MAGNET.strength;
    const f = (strength * (0.35 + pull * 0.65)) / Math.max(d, 12);
    o.vx += nx * f * dt * 7;
    o.vy += ny * f * dt * 7;

    if (d < SHIP_MAGNET.snapRadius) {
      const t = 1 - d / SHIP_MAGNET.snapRadius;
      // Kill sideways drift so gems don't orbit when the ship moves.
      const radial = o.vx * nx + o.vy * ny;
      const kill = 0.15 + t * 0.55;
      o.vx = o.vx * (1 - kill) + nx * Math.max(radial, 0) * kill;
      o.vy = o.vy * (1 - kill) + ny * Math.max(radial, 0) * kill;
      const snap = SHIP_MAGNET.snapSpeed * (0.35 + t * 0.65);
      o.vx += nx * snap * dt;
      o.vy += ny * snap * dt;
      // Home onto the hull in the final stretch.
      const home = Math.min(1, (5 + t * 14) * dt);
      o.x += dx * home;
      o.y += dy * home;
    }
  }

  private updateGems(dt: number): void {
    const lode = this.buffs.magnet > 0;
    const magR = lode ? SHIP_MAGNET.lodeRadius : SHIP_MAGNET.radius;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]!;
      let dx = this.player.x - g.x;
      let dy = this.player.y - g.y;
      let d = len(dx, dy);
      this.applyShipMagnet(g, dt, dx, dy, d);
      const inSnap = d < SHIP_MAGNET.snapRadius;
      const inField = d < magR;
      const damp = inSnap
        ? Math.pow(0.14, dt)
        : inField
          ? Math.pow(0.5, dt)
          : Math.pow(0.22, dt);
      g.vx *= damp;
      g.vy *= damp;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.life -= dt;
      g.ang += dt * 4.2;
      g.x = clamp(g.x, 8, this.W - 8);
      g.y = clamp(g.y, 8, this.H - 8);
      dx = this.player.x - g.x;
      dy = this.player.y - g.y;
      d = len(dx, dy);
      if (d < this.player.r + SHIP_MAGNET.collectPad) {
        this.gems.splice(i, 1);
        this.gemBank++;
        this.addScore(2 * this.mult);
        SFX.gem();
        spark(this.parts, g.x, g.y, GEM_COL, 4, 120, 0.25, 1.6);
        if (this.gemHint) {
          // Fade tip out as soon as the first multiplier core is collected.
          this.gemHint.max = 0.32;
          this.gemHint.life = Math.min(this.gemHint.life, 0.3);
        }
        const need = Math.ceil(this.mult / 10);
        if (this.gemBank >= need && this.mult < 150) {
          this.gemBank -= need;
          this.mult++;
          SFX.multUp(this.mult);
          if (this.mult % 25 === 0) this.toast('×' + this.mult, 'multiplier', 700, GEM_COL);
        }
        continue;
      }
      if (g.life <= 0) this.gems.splice(i, 1);
    }

    if (this.gemHint) {
      const h = this.gemHint;
      h.life -= dt;
      if (this.gems.includes(h.gem)) {
        h.x = h.gem.x;
        h.y = h.gem.y;
      }
      if (h.life <= 0) this.gemHint = null;
    }
  }

  private updateDrops(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const p = this.drops[i]!;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.25, dt);
      p.vy *= Math.pow(0.25, dt);
      p.life -= dt;
      p.ang += dt * 1.6;
      p.bob += dt * 4;
      p.x = clamp(p.x, 24, this.W - 24);
      p.y = clamp(p.y, 24, this.H - 24);
      this.grid.impulse(p.x, p.y, -0.42, 78);

      const meta = p.kind === 'weapon' ? WEAPONS[p.key as WeaponKey] : POWERS[p.key as PowerKey];
      const col = ('colour' in meta ? meta.colour : meta.col) as string;
      const bob = Math.sin(p.bob) * 3;

      if (!this.reducedMotion) {
        // Rising orbit sparkles around the pickup.
        if (Math.random() < 0.7) {
          const a = p.ang * 2.4 + rnd(TAU);
          const rad = 14 + rnd(16);
          pushParticle(this.parts, {
            x: p.x + Math.cos(a) * rad,
            y: p.y + bob + Math.sin(a) * rad * 0.45,
            vx: Math.cos(a + 1.4) * rnd(55, 18) + rnd(20, -20),
            vy: -rnd(90, 35) + Math.sin(a) * rnd(25, -10),
            life: rnd(0.65, 0.28),
            max: 0.65,
            col: Math.random() < 0.35 ? '#ffffff' : col,
            size: rnd(2.4, 0.9),
            drag: 0.9,
            z: rnd(0.25, 0.08),
          });
        }
        // Occasional aura pulse.
        if (Math.random() < 0.012) {
          ringFx(this.rings, p.x, p.y + bob, col, 10, 48, 0.5);
        }
      }

      if (len(this.player.x - p.x, this.player.y - p.y) < this.player.r + 22) {
        this.collect(p);
        this.drops.splice(i, 1);
        continue;
      }
      if (p.life <= 0) this.drops.splice(i, 1);
    }
  }

  private updateFx(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dm = Math.pow(p.drag, dt * 60);
      p.vx *= dm;
      p.vy *= dm;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.life -= dt;
      if (b.life <= 0) this.bolts.splice(i, 1);
    }
    for (let i = this.railFlashes.length - 1; i >= 0; i--) {
      const f = this.railFlashes[i]!;
      f.life -= dt;
      if (f.life <= 0) this.railFlashes.splice(i, 1);
    }
    for (let i = this.scorePops.length - 1; i >= 0; i--) {
      const s = this.scorePops[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        this.scorePops.splice(i, 1);
        continue;
      }
      if (!this.reducedMotion) s.y -= 22 * dt;
    }
  }

  private pushScorePop(x: number, y: number, value: number, col: string): void {
    if (value <= 0) return;
    this.hitChain++;
    this.hitChainT = 2;
    // 7 chained hits → 2.4× (hard cap).
    const scale = clamp(1 + ((this.hitChain - 1) / 6) * 1.4, 1, 2.4);
    const hot = scale >= 2.4;
    if (this.hitChain === 7) SFX.comboMax();
    if (this.scorePops.length >= 36) this.scorePops.splice(0, 8);
    this.scorePops.push({
      x,
      y: y - 10,
      value,
      col,
      life: 0.55,
      max: 0.55,
      scale,
      hot,
    });
  }

  private pushFloatText(x: number, y: number, text: string, col: string): void {
    if (this.scorePops.length >= 36) this.scorePops.splice(0, 8);
    this.scorePops.push({
      x,
      y: y - 14,
      value: 0,
      col,
      life: 0.85,
      max: 0.85,
      scale: 1.55,
      hot: true,
      text,
    });
  }

  // ---- drawing ----
  private drawScorePops(): void {
    const ctx = this.ctx;
    for (const s of this.scorePops) {
      const t = clamp(s.life / s.max, 0, 1);
      const fade = t > 0.25 ? 1 : t / 0.25;
      const px =
        s.hot && !this.reducedMotion ? s.x + rnd(2.8, -2.8) : s.x;
      const py =
        s.hot && !this.reducedMotion ? s.y + rnd(2.2, -2.2) : s.y;
      const fontPx = Math.round((s.text ? 17 : 15) * s.scale);
      ctx.save();
      ctx.globalAlpha = fade * 0.95;
      ctx.font = `700 ${fontPx}px Chakra Petch, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = s.text ?? '+' + s.value.toLocaleString('en-GB');
      const tw = ctx.measureText(label).width;
      if (s.hot) {
        const g = ctx.createLinearGradient(px - tw * 0.55, py, px + tw * 0.55, py);
        const shift = (this.gameT * 2.4) % 1;
        g.addColorStop(0, '#63f7ff');
        g.addColorStop(clamp(0.35 + shift * 0.25, 0.05, 0.95), '#ff3fa4');
        g.addColorStop(1, '#ffb02e');
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 + s.scale * 0.35;
        ctx.shadowColor = s.text ? '#ffb02e' : '#ff3fa4';
        ctx.shadowBlur = this.reducedMotion ? 0 : 16;
        ctx.strokeText(label, px, py);
        ctx.shadowBlur = this.reducedMotion ? 0 : 12;
        ctx.shadowColor = '#63f7ff';
        ctx.fillStyle = g;
        ctx.fillText(label, px, py);
      } else {
        ctx.fillStyle = '#e8fbff';
        ctx.strokeStyle = s.col;
        ctx.lineWidth = 2.2 + s.scale * 0.35;
        ctx.shadowColor = s.col;
        ctx.shadowBlur = this.reducedMotion ? 0 : 8 + s.scale * 2;
        ctx.strokeText(label, px, py);
        ctx.shadowBlur = 0;
        ctx.fillText(label, px, py);
      }
      ctx.restore();
    }
  }

  private drawRailLaser(x0: number, y0: number, x1: number, y1: number, a = 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = '#3aa8ff';
    ctx.globalAlpha = 0.22 * a;
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.strokeStyle = '#7ad8ff';
    ctx.globalAlpha = 0.5 * a;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = '#d6f7ff';
    ctx.globalAlpha = 0.9 * a;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = a;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  private stroke2(col: string, w: number, a = 1): void {
    const ctx = this.ctx;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.2 * a;
    ctx.lineWidth = w * 3.4;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private polyPath(x: number, y: number, n: number, r: number, rot: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  private starPath(x: number, y: number, n: number, r1: number, r2: number, rot: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * TAU;
      const r = i % 2 ? r2 : r1;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  /** Cosmetic Y foreshortening — draw-only, gated by reduced motion. */
  private withYFlip(x: number, y: number, sy: number, draw: () => void): void {
    if (this.reducedMotion || sy >= 0.999) {
      draw();
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, sy);
    ctx.translate(-x, -y);
    draw();
    ctx.restore();
  }

  /** Temporary label on the first multiplier core of a run. */
  private drawGemHint(): void {
    const h = this.gemHint;
    if (!h) return;
    const ctx = this.ctx;
    const t = h.life / h.max;
    const fade = t > 0.75 ? (1 - t) / 0.25 : t < 0.2 ? t / 0.2 : 1;
    const bob = Math.sin(this.gameT * 3.2) * 3;
    let lx = h.x + 16;
    let ly = h.y - 22 + bob;
    const label = 'Collect these to increase your multiplier!';
    ctx.save();
    ctx.font = '600 13px Chakra Petch, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    // Keep on-screen
    lx = clamp(lx, 12, this.W - tw - 16);
    ly = clamp(ly, 18, this.H - 18);

    // Leader line back to gem
    ctx.strokeStyle = `rgba(124,249,255,${0.35 * fade})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(h.x + 4, h.y - 4);
    ctx.lineTo(lx - 4, ly);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = `rgba(5,6,15,${0.55 * fade})`;
    ctx.fillRect(lx - 8, ly - 12, tw + 16, 24);
    ctx.strokeStyle = `rgba(124,249,255,${0.45 * fade})`;
    ctx.strokeRect(lx - 8, ly - 12, tw + 16, 24);

    ctx.fillStyle = `rgba(232,255,255,${0.92 * fade})`;
    ctx.shadowColor = 'rgba(99,247,255,0.55)';
    ctx.shadowBlur = this.reducedMotion ? 0 : 8;
    ctx.fillText(label, lx, ly);
    ctx.restore();
  }

  /** Tiny spinning triangles for multiplier geodes. */
  private drawGem(g: Gem): void {
    const ctx = this.ctx;
    // Last GEM_FLASH seconds: a couple of blinks, then gone.
    const fade =
      g.life < GEM_FLASH ? (Math.floor(g.life * 5.5) % 2 === 0 ? 1 : 0.12) : 1;
    const pulse = 1 + Math.sin(this.gameT * 6 + g.ang) * 0.1;
    const r = 3.6 * pulse;

    ctx.beginPath();
    ctx.arc(g.x, g.y, r * 1.7, 0, TAU);
    ctx.strokeStyle = GEM_COL_ACCENT;
    ctx.globalAlpha = 0.2 * fade;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.polyPath(g.x, g.y, 3, r, g.ang);
    this.stroke2(GEM_COL, 1.4, fade);

    this.polyPath(g.x, g.y, 3, r * 0.4, g.ang + Math.PI);
    ctx.strokeStyle = GEM_COL_CORE;
    ctx.globalAlpha = 0.85 * fade;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx;
    const col = e.flash > 0 ? '#ffffff' : e.col;
    if (e.birth > 0) {
      const t = 1 - e.birth / 0.55;
      ctx.globalAlpha = t * 0.9;
      this.polyPath(e.x, e.y, 6, e.r * (2.6 - t * 1.6), e.ang);
      ctx.strokeStyle = e.col;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    switch (e.type) {
      case 'drifter': {
        this.polyPath(e.x, e.y, 4, e.r, e.ang);
        this.stroke2(col, 2.2);
        this.polyPath(e.x, e.y, 4, e.r * 0.5, -e.ang * 1.6);
        this.stroke2(col, 1.4);
        break;
      }
      case 'seeker':
      case 'shard': {
        ctx.beginPath();
        const a = Math.atan2(e.vy, e.vx) || e.ang;
        ctx.moveTo(e.x + Math.cos(a) * e.r * 1.5, e.y + Math.sin(a) * e.r * 1.5);
        ctx.lineTo(e.x + Math.cos(a + 2.5) * e.r, e.y + Math.sin(a + 2.5) * e.r);
        ctx.lineTo(e.x + Math.cos(a - 2.5) * e.r, e.y + Math.sin(a - 2.5) * e.r);
        ctx.closePath();
        this.stroke2(col, 2.2);
        break;
      }
      case 'weaver': {
        this.starPath(e.x, e.y, 3, e.r * 1.35, e.r * 0.55, e.ang);
        this.stroke2(col, 2.2);
        break;
      }
      case 'splitter': {
        this.polyPath(e.x, e.y, 6, e.r, e.ang);
        this.stroke2(col, 2.4);
        this.polyPath(e.x, e.y, 3, e.r * 0.55, -e.ang);
        this.stroke2(col, 1.6);
        break;
      }
      case 'serpent': {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        for (const s of e.segs || []) ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3.4;
        ctx.stroke();
        ctx.lineCap = 'butt';
        this.polyPath(e.x, e.y, 3, e.r, Math.atan2(e.vy, e.vx));
        this.stroke2('#ffffff', 2);
        for (let i = 0; i < (e.segs || []).length; i += 2) {
          const s = e.segs![i]!;
          this.polyPath(s.x, s.y, 4, 7 - i * 0.35, e.ang + i);
          this.stroke2(col, 1.3);
        }
        break;
      }
      case 'sentry': {
        this.polyPath(e.x, e.y, 5, e.r, e.ang * 0.4);
        this.stroke2(col, 2.4);
        const a = Math.atan2(this.player.y - e.y, this.player.x - e.x);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * e.r * 1.7, e.y + Math.sin(a) * e.r * 1.7);
        this.stroke2(col, 2.6);
        break;
      }
      case 'bulwark': {
        this.polyPath(e.x, e.y, 8, e.r, e.ang);
        this.stroke2(col, 2.4);
        const sa = e.sa || 0;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, sa - 1.15, sa + 1.15);
        ctx.strokeStyle = '#ffd0b8';
        ctx.lineWidth = 4;
        ctx.stroke();
        break;
      }
      case 'singular': {
        this.polyPath(e.x, e.y, 6, e.r, e.ang);
        this.stroke2(col, 2.8);
        this.polyPath(e.x, e.y, 6, e.r * 0.55, -e.ang);
        this.stroke2('#ffffff', 1.6);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 1.8 + Math.sin((e.pulse || 0) * 4) * 4, 0, TAU);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  /** Floating pickup with tumble, aura rings, orbit motes, and a soft ground shadow. */
  private drawDrop(p: Drop): void {
    const ctx = this.ctx;
    const meta = p.kind === 'weapon' ? WEAPONS[p.key as WeaponKey] : POWERS[p.key as PowerKey];
    const col = ('colour' in meta ? meta.colour : meta.col) as string;
    const bob = Math.sin(p.bob) * 3;
    const fade = p.life < 3 ? (Math.floor(p.life * 8) % 2 ? 0.3 : 1) : 1;
    const dx = p.x;
    const dy = p.y + bob;
    const lift = 10 + bob * 0.35;

    // Soft elliptical shadow — reads as hovering above the grid.
    if (!this.reducedMotion) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + lift + 18, 16, 5.5, 0, 0, TAU);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.12 * fade;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Pulsing aura discs.
    const pulse = 0.5 + 0.5 * Math.sin(this.gameT * 5 + p.bob);
    ctx.beginPath();
    ctx.arc(dx, dy, 22 + pulse * 6, 0, TAU);
    ctx.strokeStyle = col;
    ctx.globalAlpha = (0.18 + pulse * 0.12) * fade;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, dy, 30 + (1 - pulse) * 5, 0, TAU);
    ctx.globalAlpha = (0.1 + (1 - pulse) * 0.08) * fade;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Orbiting spark motes (drawn, not particles — crisp ring).
    if (!this.reducedMotion) {
      for (let i = 0; i < 5; i++) {
        const a = p.ang * 1.8 + (i / 5) * TAU + this.gameT * 1.4;
        const rr = 24 + Math.sin(this.gameT * 3 + i) * 3;
        const mx = dx + Math.cos(a) * rr;
        const my = dy + Math.sin(a) * rr * 0.42;
        const tw = 0.55 + 0.45 * Math.sin(this.gameT * 8 + i * 1.7);
        ctx.beginPath();
        ctx.arc(mx, my, 1.2 + tw * 1.4, 0, TAU);
        ctx.fillStyle = i % 2 ? '#ffffff' : col;
        ctx.globalAlpha = (0.55 + tw * 0.4) * fade;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Tumbled icon body.
    this.withYFlip(dx, dy, flipScale(p.ang * 0.85), () => {
      if (p.kind === 'weapon') {
        this.polyPath(dx, dy, 6, 15, p.ang);
        this.stroke2(col, 2.2, fade);
        this.polyPath(dx, dy, 6, 8, -p.ang * 1.4);
        this.stroke2(col, 1.4, fade);
      } else {
        this.starPath(dx, dy, 5, 16, 7, p.ang);
        this.stroke2(col, 2.2, fade);
        this.starPath(dx, dy, 5, 9, 4, -p.ang * 1.3);
        this.stroke2('#ffffff', 1.2, fade * 0.85);
      }
    });

    // Bright core glint.
    ctx.beginPath();
    ctx.arc(dx, dy, 2.4 + pulse * 1.2, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.75 * fade;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = '600 9px Chakra Petch, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillText((meta.name || '').slice(0, 9), p.x, p.y + bob + 34);
    ctx.globalAlpha = 1;
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const { player } = this;
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.ang);
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-9, 11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-9, -11);
    ctx.closePath();
    this.stroke2('#eaf6ff', 2.2);
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-3, 5);
    ctx.lineTo(-3, -5);
    ctx.closePath();
    this.stroke2('#63f7ff', 1.6);
    if (player.thrust > 0.1) {
      ctx.beginPath();
      ctx.moveTo(-6, 4);
      ctx.lineTo(-10 - player.thrust * 20 * rnd(1, 0.6), 0);
      ctx.lineTo(-6, -4);
      this.stroke2(this.buffs.overdrive > 0 ? '#ffb02e' : '#63f7ff', 1.8);
    }
    ctx.restore();

    if (this.shieldHits > 0) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, 22 + Math.sin(this.gameT * 5) * 2, 0, TAU);
      ctx.strokeStyle = '#63f7ff';
      ctx.globalAlpha = 0.35 + this.shieldHits * 0.12;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.buffs.drones > 0) {
      for (let d = 0; d < 2; d++) {
        const a = this.droneAng + d * Math.PI;
        const dx = player.x + Math.cos(a) * 58;
        const dy = player.y + Math.sin(a) * 58;
        this.polyPath(dx, dy, 3, 7, a);
        this.stroke2('#ff8fd0', 1.8);
      }
    }
    ctx.beginPath();
    ctx.arc(player.x, player.y, 38 + Math.sin(this.gameT * 4) * 2, 0, TAU);
    ctx.strokeStyle = GEM_COL;
    ctx.globalAlpha = this.buffs.magnet > 0 ? 0.14 : 0.06;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (this.buffs.magnet > 0) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, 40 + Math.sin(this.gameT * 3) * 6, 0, TAU);
      ctx.strokeStyle = '#b8ff3d';
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Subtle dashed aim tracer: ship → mouse (or stick aim on touch). */
  private drawAimTracer(): void {
    if (this.state !== 'play' && this.state !== 'paused') return;
    const ctx = this.ctx;
    const p = this.player;
    const usingTouchAim = this.input.touchAim.id !== null;

    let tx: number;
    let ty: number;
    if (usingTouchAim) {
      const reach = 260;
      tx = p.x + Math.cos(p.ang) * reach;
      ty = p.y + Math.sin(p.ang) * reach;
    } else {
      tx = this.input.pointer.x;
      ty = this.input.pointer.y;
    }

    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 28) return;

    const ax = dx / dist;
    const ay = dy / dist;
    const x0 = p.x + ax * 18;
    const y0 = p.y + ay * 18;
    const x1 = tx - ax * 8;
    const y1 = ty - ay * 8;

    const firing = this.input.pointer.down || this.input.autofire || usingTouchAim;

    ctx.save();
    ctx.strokeStyle = firing ? 'rgba(99,247,255,0.38)' : 'rgba(99,247,255,0.2)';
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    ctx.setLineDash([2.5, 6.5]);
    if (!this.reducedMotion) ctx.lineDashOffset = -(this.gameT * 52);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    const a = firing ? 0.5 : 0.3;
    ctx.strokeStyle = `rgba(99,247,255,${a})`;
    ctx.lineWidth = 1;
    const r = 5;
    ctx.beginPath();
    ctx.moveTo(tx - r, ty);
    ctx.lineTo(tx + r, ty);
    ctx.moveTo(tx, ty - r);
    ctx.lineTo(tx, ty + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx, ty, 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    ctx.fillStyle = this.buffs.timewarp > 0 ? '#080614' : '#05060f';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    if (this.shake > 0.2) ctx.translate(rnd(this.shake, -this.shake), rnd(this.shake, -this.shake));

    this.grid.draw(ctx, {
      fx: lerp(this.W * 0.5, this.player.x, 0.28),
      fy: lerp(this.H * 0.5, this.player.y, 0.28),
      t: this.gameT,
    });
    ctx.beginPath();
    ctx.rect(2, 2, this.W - 4, this.H - 4);
    ctx.strokeStyle = 'rgba(99,247,255,.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';

    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r, r.r1, t * t);
      const squash = this.reducedMotion
        ? 1
        : 0.84 + 0.16 * (1 - Math.abs(r.y - this.H * 0.5) / (this.H * 0.5 + 1));
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * squash, 0, 0, TAU);
      ctx.strokeStyle = r.col;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.lineWidth = lerp(5, 0.6, t);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const g of this.gems) this.drawGem(g);
    this.drawGemHint();

    for (const p of this.drops) this.drawDrop(p);

    for (const p of this.parts) {
      const lifeT = p.life / p.max;
      const z = this.reducedMotion ? 0.5 : (p.z ?? 0.45);
      const ds = depthScale(z);
      const fade = lifeT;
      ctx.globalAlpha = clamp(fade, 0, 1) * lerp(0.65, 1, 1 - z);
      ctx.strokeStyle = p.col;
      ctx.lineWidth = (p.size * lifeT + 0.35) * ds;
      const trail = 0.028 * ds;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * trail, p.y - p.vy * trail);
      ctx.stroke();
      if (p.size > 1.4 && fade > 0.3) {
        ctx.globalAlpha = clamp(fade, 0, 1) * 0.85;
        ctx.fillStyle = '#ffffff';
        const g = (0.55 + p.size * 0.22 * fade) * ds;
        ctx.fillRect(p.x - g * 0.5, p.y - g * 0.5, g, g);
      }
    }
    ctx.globalAlpha = 1;

    for (const b of this.ebullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      this.stroke2(b.col, 2);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.4, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const e of this.enemies) this.drawEnemy(e);
    if (this.mode === 'boss') this.bosses.draw(ctx, this.gameT);
    for (const b of this.bullets) {
      if (b.rail) {
        this.drawRailLaser(b.px, b.py, b.x, b.y, 1);
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      this.stroke2(b.col, 2.4);
    }
    for (const f of this.railFlashes) {
      const a = clamp(f.life / f.max, 0, 1);
      const fade = a * a;
      this.drawRailLaser(
        f.x,
        f.y,
        f.x + f.ax * 2800,
        f.y + f.ay * 2800,
        0.55 + 0.45 * fade,
      );
    }
    for (const bl of this.bolts) {
      const t = bl.life / bl.max;
      ctx.globalAlpha = t;
      ctx.beginPath();
      for (let i = 0; i < bl.pts.length - 1; i++) {
        const a = bl.pts[i]!;
        const b = bl.pts[i + 1]!;
        ctx.moveTo(a.x, a.y);
        const steps = 5;
        for (let s = 1; s <= steps; s++) {
          const f = s / steps;
          const jx = s < steps ? rnd(16, -16) : 0;
          const jy = s < steps ? rnd(16, -16) : 0;
          ctx.lineTo(lerp(a.x, b.x, f) + jx, lerp(a.y, b.y, f) + jy);
        }
      }
      this.stroke2(bl.col, 2.6);
      ctx.globalAlpha = 1;
    }
    if (this.beam) {
      const { ax, ay } = this.beam;
      ctx.beginPath();
      ctx.moveTo(this.player.x + ax * 14, this.player.y + ay * 14);
      ctx.lineTo(this.player.x + ax * 2400, this.player.y + ay * 2400);
      ctx.strokeStyle = '#ff3fa4';
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 26 + Math.sin(this.gameT * 40) * 5;
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffe6f5';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    this.drawPlayer();
    this.drawAimTracer();
    ctx.globalCompositeOperation = 'source-over';
    this.drawScorePops();
    ctx.restore();

    if (this.bloomOn) {
      this.bctx.setTransform(1, 0, 0, 1, 0, 0);
      this.bctx.clearRect(0, 0, this.bloomC.width, this.bloomC.height);
      this.bctx.filter = 'blur(2.5px)';
      this.bctx.drawImage(this.cvs, 0, 0, this.bloomC.width, this.bloomC.height);
      this.bctx.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.bloomC, 0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  renderAttract(dt: number): void {
    this.attractT += dt;
    if (Math.random() < 0.05) this.grid.impulse(rnd(this.W), rnd(this.H), rnd(-7, -2), rnd(360, 200));
    this.grid.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.W, this.H);
    const fx = this.W * 0.5 + Math.sin(this.attractT * 0.35) * this.W * 0.14;
    const fy = this.H * 0.5 + Math.cos(this.attractT * 0.28) * this.H * 0.1;
    this.grid.draw(ctx, { fx, fy, t: this.attractT });
    if (this.bloomOn) {
      this.bctx.setTransform(1, 0, 0, 1, 0, 0);
      this.bctx.clearRect(0, 0, this.bloomC.width, this.bloomC.height);
      this.bctx.filter = 'blur(2.5px)';
      this.bctx.drawImage(this.cvs, 0, 0, this.bloomC.width, this.bloomC.height);
      this.bctx.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.bloomC, 0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  getMuted(): boolean {
    return isMuted();
  }
}
