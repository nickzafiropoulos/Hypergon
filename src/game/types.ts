import type { EnemyType, PowerKey, WeaponKey } from './catalogue';

export type GameState = 'menu' | 'play' | 'paused' | 'over' | 'win';
export type GameMode = 'survival' | 'boss';

export type EnvKind =
  | 'crystal'
  | 'spike'
  | 'mine'
  | 'pillar'
  | 'well'
  | 'zone'
  | 'nest'
  | 'satellite';

export type EnvProp = {
  kind: EnvKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxhp: number;
  col: string;
  ang: number;
  life: number;
  /** Reflects player bullets (pillars). */
  reflective?: boolean;
  /** Heals boss while alive (crystals). */
  healsBoss?: boolean;
  /** Orbit anchor for satellites. */
  orbitR?: number;
  orbitSpd?: number;
  orbitAng?: number;
  /** Zone slow factor applied to entities inside. */
  slow?: number;
  /** Contact damage to player. */
  hurtPlayer?: boolean;
  /** Mines also damage bosses on contact. */
  hurtBoss?: boolean;
  dead: boolean;
  flash: number;
  /** Extra scratch for nests / timers. */
  cd?: number;
  tag?: string;
};

export type BossId =
  | 'prism'
  | 'crown'
  | 'void_anchor'
  | 'hexstorm'
  | 'aegis_titan'
  | 'serpent_regent'
  | 'mirror_core'
  | 'phase_lattice'
  | 'starforge'
  | 'crystal_nexus'
  | 'pulse_maw'
  | 'grid_reaver'
  | 'twin_helix'
  | 'lodestone'
  | 'arc_throne'
  | 'railbait'
  | 'nest_queen'
  | 'stasis_warden'
  | 'bulwark_colossus'
  | 'singularity_apex';

export type DamageSource =
  | 'pulse'
  | 'scatter'
  | 'lance'
  | 'swarm'
  | 'arc'
  | 'rail'
  | 'nova'
  | 'vortex'
  | 'helix'
  | 'drone'
  | 'bomb'
  | 'mine'
  | 'env'
  | 'razor'
  | 'ghost';

export type BossRuntime = {
  defId: BossId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxhp: number;
  col: string;
  spd: number;
  ang: number;
  spin: number;
  phase: number;
  dead: boolean;
  birth: number;
  flash: number;
  wob: number;
  sa: number;
  grow: number;
  pulse: number;
  cd: number;
  /** Serpent body / twin body parts. */
  segs: { x: number; y: number; r?: number }[];
  /** Armor layers remaining (aegis / colossus). */
  armor: number;
  /** Soft state flags packed as numbers for boss logic. */
  flags: Record<string, number>;
  open: boolean;
  solid: boolean;
  enraged: boolean;
};

export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  r: number;
  invuln: number;
  thrust: number;
};

export type Enemy = {
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxhp: number;
  col: string;
  spd: number;
  ang: number;
  spin: number;
  dead: boolean;
  birth: number;
  flash: number;
  wob: number;
  segs?: { x: number; y: number }[];
  cd?: number;
  sa?: number;
  grow?: number;
  pulse?: number;
  gen?: number;
};

export type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  col: string;
  pierce: number;
  life: number;
  homing: boolean;
  rail: boolean;
  px: number;
  py: number;
  /** Damage typing for boss weaknesses. */
  src?: DamageSource;
  /** Times bounced off reflective pillars / plates. */
  ricochet?: number;
};

export type EBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  col: string;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  size: number;
  drag: number;
  /** 0 near → 1 far; used for subtle size/alpha depth. */
  z?: number;
};

export type Gem = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ang: number;
};

export type Drop = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'weapon' | 'power';
  key: WeaponKey | PowerKey;
  life: number;
  ang: number;
  bob: number;
};

export type Ring = {
  x: number;
  y: number;
  col: string;
  r: number;
  r1: number;
  life: number;
  max: number;
};

export type Bolt = {
  pts: { x: number; y: number }[];
  life: number;
  max: number;
  col: string;
};

export type Beam = { ax: number; ay: number };

/** Full-screen rail discharge flash (fades quickly after each shot). */
export type RailFlash = {
  x: number;
  y: number;
  ax: number;
  ay: number;
  life: number;
  max: number;
};

/** Player-fired gravity well from the VORTEX weapon. */
export type VortexField = {
  x: number;
  y: number;
  life: number;
  max: number;
  r: number;
  pulse: number;
};

/** Floating +score readout over a killed enemy. */
export type ScorePop = {
  x: number;
  y: number;
  value: number;
  col: string;
  life: number;
  max: number;
  /** Visual scale from hit chain (1 → 2.4). */
  scale: number;
  /** True at max chain size — gradient + vibrate. */
  hot: boolean;
  /** Optional label (e.g. CRITICAL HIT) instead of +value. */
  text?: string;
};
