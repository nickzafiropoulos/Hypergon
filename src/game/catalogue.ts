export type WeaponKey = 'pulse' | 'scatter' | 'lance' | 'swarm' | 'arc' | 'rail';
export type EnemyType =
  | 'drifter'
  | 'seeker'
  | 'weaver'
  | 'splitter'
  | 'shard'
  | 'serpent'
  | 'sentry'
  | 'bulwark'
  | 'singular';
export type PowerKey =
  | 'shield'
  | 'overdrive'
  | 'timewarp'
  | 'magnet'
  | 'drones'
  | 'bomb'
  | 'life';

export const WEAPONS: Record<
  WeaponKey,
  { name: string; colour: string; rate: number; dmg: number; cap: number; blurb: string }
> = {
  pulse: { name: 'PULSE', colour: '#63f7ff', rate: 0.085, dmg: 1, cap: Infinity, blurb: 'twin stream' },
  scatter: { name: 'SCATTER', colour: '#ffb02e', rate: 0.3, dmg: 1, cap: 70, blurb: 'nine-shard burst' },
  lance: { name: 'LANCE', colour: '#ff3fa4', rate: 0, dmg: 26, cap: 340, blurb: 'continuous beam' },
  swarm: { name: 'SWARM', colour: '#b8ff3d', rate: 0.2, dmg: 2.5, cap: 90, blurb: 'homing seekers' },
  arc: { name: 'ARC', colour: '#a98bff', rate: 0.16, dmg: 1.6, cap: 120, blurb: 'chains 4 targets' },
  rail: { name: 'RAIL', colour: '#9ee9ff', rate: 0.62, dmg: 9, cap: 32, blurb: 'pierces everything' },
};

export const WORDER: WeaponKey[] = ['pulse', 'scatter', 'lance', 'swarm', 'arc', 'rail'];

export const ETYPE: Record<
  EnemyType,
  { r: number; hp: number; score: number; col: string; spd: number; gems: number }
> = {
  drifter: { r: 15, hp: 1, score: 20, col: '#a06bff', spd: 58, gems: 1 },
  seeker: { r: 13, hp: 1, score: 35, col: '#63f7ff', spd: 132, gems: 1 },
  weaver: { r: 15, hp: 2, score: 60, col: '#b8ff3d', spd: 118, gems: 2 },
  splitter: { r: 24, hp: 4, score: 70, col: '#ffb02e', spd: 66, gems: 2 },
  shard: { r: 11, hp: 1, score: 25, col: '#ffd98a', spd: 150, gems: 1 },
  serpent: { r: 14, hp: 7, score: 180, col: '#4dffc3', spd: 112, gems: 5 },
  sentry: { r: 19, hp: 5, score: 110, col: '#ff3fa4', spd: 34, gems: 3 },
  bulwark: { r: 21, hp: 7, score: 150, col: '#ff7a3d', spd: 76, gems: 4 },
  singular: { r: 24, hp: 16, score: 400, col: '#ff2d55', spd: 16, gems: 8 },
};

export const POWERS: Record<PowerKey, { name: string; col: string; blurb: string }> = {
  shield: { name: 'AEGIS', col: '#63f7ff', blurb: 'absorbs 3 hits' },
  overdrive: { name: 'OVERDRIVE', col: '#ffb02e', blurb: 'double fire rate' },
  timewarp: { name: 'STASIS', col: '#a98bff', blurb: 'enemies crawl' },
  magnet: { name: 'LODESTONE', col: '#b8ff3d', blurb: 'gems come to you' },
  drones: { name: 'WINGMEN', col: '#ff3fa4', blurb: 'two escort drones' },
  bomb: { name: '+1 SHOCK', col: '#ffffff', blurb: '' },
  life: { name: '+1 LIFE', col: '#4dffc3', blurb: '' },
};

/** Multiplier geodes — tiny cyan triangles, distinct from weaver acid-green. */
export const GEM_COL = '#7cf9ff';
export const GEM_COL_CORE = '#e8ffff';
export const GEM_COL_ACCENT = '#63f7ff';
/** Seconds before a geode despawns; flashes in the last GEM_FLASH window. */
export const GEM_LIFE = 4.5;
export const GEM_FLASH = 0.7;

export const MAX_ENEMIES = 90;
export const MAX_PARTICLES = 420;
export const MAX_RINGS = 48;
export const MAX_GEMS = 180;

/** Ship pulls multiplier cores inward when they enter this radius. */
export const SHIP_MAGNET = {
  radius: 300,
  strength: 2600,
  lodeRadius: 1e4,
  lodeStrength: 3200,
  /** Within this distance gems lock onto the hull instead of orbiting. */
  snapRadius: 72,
  snapSpeed: 900,
  collectPad: 22,
} as const;
