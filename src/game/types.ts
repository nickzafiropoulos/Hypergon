import type { EnemyType, PowerKey, WeaponKey } from './catalogue';

export type GameState = 'menu' | 'play' | 'paused' | 'over';

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
