import type { PowerKey, WeaponKey } from './catalogue';
import type { BossId, EnvKind } from './types';

export type EnvSpawn = {
  kind: EnvKind;
  /** Fraction of arena (0–1) or special: 'edge' | 'corners' | 'ring'. */
  layout: 'corners' | 'edge' | 'ring' | 'sides' | 'point';
  count: number;
  r?: number;
  hp?: number;
  col?: string;
  reflective?: boolean;
  healsBoss?: boolean;
  hurtPlayer?: boolean;
  hurtBoss?: boolean;
  slow?: number;
  orbitR?: number;
  tag?: string;
};

export type BossDef = {
  id: BossId;
  name: string;
  blurb: string;
  r: number;
  hp: number;
  col: string;
  spd: number;
  score: number;
  gems: number;
  phases: number;
  /** Suggested drop for the intermission before this fight. */
  hintDrop?: { kind: 'weapon' | 'power'; key: WeaponKey | PowerKey };
  env: EnvSpawn[];
  bombPolicy: 'chip' | 'peel' | 'stun';
};

export const BOSS_ROSTER: BossDef[] = [
  {
    id: 'prism',
    name: 'PRISM WARDEN',
    blurb: 'Bank shots off the pillars for CRITICAL HIT · or pierce with RAIL',
    r: 70,
    hp: 240,
    col: '#c9b4ff',
    spd: 42,
    score: 1200,
    gems: 8,
    phases: 2,
    hintDrop: { kind: 'weapon', key: 'rail' },
    env: [
      {
        kind: 'pillar',
        layout: 'sides',
        count: 6,
        r: 22,
        hp: 40,
        reflective: true,
        col: '#a98bff',
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'crown',
    name: 'ORBITAL CROWN',
    blurb: 'Destroy every satellite first — the Crown is shielded until then',
    r: 52,
    hp: 300,
    col: '#ffb02e',
    spd: 28,
    score: 1400,
    gems: 9,
    phases: 2,
    env: [
      {
        kind: 'satellite',
        layout: 'ring',
        count: 6,
        r: 16,
        hp: 18,
        orbitR: 120,
        col: '#ffd98a',
        hurtPlayer: true,
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'void_anchor',
    name: 'VOID ANCHOR',
    blurb: 'Drag it into the edge spikes — traps deal CRITICAL damage',
    r: 150,
    hp: 380,
    col: '#ff2d55',
    spd: 16,
    score: 1600,
    gems: 10,
    phases: 2,
    env: [
      {
        kind: 'spike',
        layout: 'edge',
        count: 12,
        r: 14,
        hp: 999,
        hurtPlayer: true,
        hurtBoss: true,
        col: '#ff6b8a',
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'hexstorm',
    name: 'HEXSTORM',
    blurb: 'Kite it through its own mines for CRITICAL HIT',
    r: 72,
    hp: 460,
    col: '#b8ff3d',
    spd: 55,
    score: 1500,
    gems: 9,
    phases: 2,
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'aegis_titan',
    name: 'AEGIS TITAN',
    blurb: 'RAIL pierces the plate · bomb peels armor layers',
    r: 120,
    hp: 560,
    col: '#ff7a3d',
    spd: 34,
    score: 1800,
    gems: 11,
    phases: 3,
    hintDrop: { kind: 'weapon', key: 'rail' },
    env: [],
    bombPolicy: 'peel',
  },
  {
    id: 'serpent_regent',
    name: 'SERPENT REGENT',
    blurb: 'Only the HEAD takes damage — ignore the body',
    r: 34,
    hp: 680,
    col: '#4dffc3',
    spd: 100,
    score: 1900,
    gems: 12,
    phases: 2,
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'mirror_core',
    name: 'MIRROR CORE',
    blurb: 'ARC finds the true core — decoys shatter but waste shots',
    r: 56,
    hp: 820,
    col: '#63f7ff',
    spd: 48,
    score: 1700,
    gems: 10,
    phases: 2,
    hintDrop: { kind: 'weapon', key: 'arc' },
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'phase_lattice',
    name: 'PHASE LATTICE',
    blurb: 'Hit only while SOLID · STASIS widens the window',
    r: 82,
    hp: 980,
    col: '#a98bff',
    spd: 40,
    score: 1800,
    gems: 11,
    phases: 2,
    hintDrop: { kind: 'power', key: 'timewarp' },
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'starforge',
    name: 'STARFORGE',
    blurb: 'Destroy the corner vents to slow the forge and open it up',
    r: 96,
    hp: 1160,
    col: '#ff3fa4',
    spd: 22,
    score: 2000,
    gems: 12,
    phases: 2,
    hintDrop: { kind: 'power', key: 'overdrive' },
    env: [
      {
        kind: 'crystal',
        layout: 'corners',
        count: 4,
        r: 20,
        hp: 28,
        col: '#ff8fd0',
        tag: 'vent',
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'crystal_nexus',
    name: 'CRYSTAL NEXUS',
    blurb: 'Break all healing crystals first — then unload for double damage',
    r: 88,
    hp: 1360,
    col: '#9ee9ff',
    spd: 30,
    score: 2100,
    gems: 12,
    phases: 2,
    env: [
      {
        kind: 'crystal',
        layout: 'corners',
        count: 4,
        r: 24,
        hp: 35,
        healsBoss: true,
        col: '#63f7ff',
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'pulse_maw',
    name: 'PULSE MAW',
    blurb: 'Unload hard when the maw OPENS — closed shell shrugs most fire',
    r: 130,
    hp: 1600,
    col: '#ff2d55',
    spd: 24,
    score: 2300,
    gems: 13,
    phases: 2,
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'grid_reaver',
    name: 'GRID REAVER',
    blurb: 'After each shockwave, strike hard in the RECOVERY window',
    r: 110,
    hp: 1860,
    col: '#ffb02e',
    spd: 48,
    score: 2400,
    gems: 13,
    phases: 3,
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'twin_helix',
    name: 'TWIN HELIX',
    blurb: 'Pressure BOTH bodies or the ignored one regenerates',
    r: 46,
    hp: 2140,
    col: '#b8ff3d',
    spd: 62,
    score: 2600,
    gems: 14,
    phases: 2,
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'lodestone',
    name: 'LODESTONE BEHEMOTH',
    blurb: 'Grab LODESTONE to reverse the pull and smash it',
    r: 125,
    hp: 2460,
    col: '#b8ff3d',
    spd: 22,
    score: 2500,
    gems: 14,
    phases: 2,
    hintDrop: { kind: 'power', key: 'magnet' },
    env: [
      {
        kind: 'well',
        layout: 'point',
        count: 1,
        r: 160,
        col: '#7cf9ff',
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'arc_throne',
    name: 'ARC THRONE',
    blurb: 'ARC through the minion ring to crack the throne open',
    r: 90,
    hp: 2820,
    col: '#a98bff',
    spd: 20,
    score: 2700,
    gems: 14,
    phases: 2,
    hintDrop: { kind: 'weapon', key: 'arc' },
    env: [
      {
        kind: 'satellite',
        layout: 'ring',
        count: 8,
        r: 14,
        hp: 12,
        orbitR: 150,
        col: '#c9b4ff',
        hurtPlayer: true,
        tag: 'minion',
      },
    ],
    bombPolicy: 'stun',
  },
  {
    id: 'railbait',
    name: 'RAILBAIT',
    blurb: 'RAIL along the telegraph line for a massive CRITICAL HIT',
    r: 48,
    hp: 3220,
    col: '#9ee9ff',
    spd: 145,
    score: 2800,
    gems: 15,
    phases: 2,
    hintDrop: { kind: 'weapon', key: 'rail' },
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'nest_queen',
    name: 'NEST QUEEN',
    blurb: 'Burn the nests · she takes more damage while nesting',
    r: 86,
    hp: 3660,
    col: '#ffd98a',
    spd: 34,
    score: 2900,
    gems: 15,
    phases: 2,
    env: [
      {
        kind: 'nest',
        layout: 'corners',
        count: 4,
        r: 26,
        hp: 40,
        col: '#ffb02e',
        hurtPlayer: true,
      },
    ],
    bombPolicy: 'chip',
  },
  {
    id: 'stasis_warden',
    name: 'STASIS WARDEN',
    blurb: 'Bait it into its own freeze zones for CRITICAL windows',
    r: 78,
    hp: 4160,
    col: '#a98bff',
    spd: 70,
    score: 3000,
    gems: 15,
    phases: 2,
    hintDrop: { kind: 'power', key: 'timewarp' },
    env: [],
    bombPolicy: 'chip',
  },
  {
    id: 'bulwark_colossus',
    name: 'BULWARK COLOSSUS',
    blurb: 'Bombs peel armor · then shatter the exposed core',
    r: 175,
    hp: 4720,
    col: '#ff7a3d',
    spd: 22,
    score: 3400,
    gems: 16,
    phases: 3,
    env: [],
    bombPolicy: 'peel',
  },
  {
    id: 'singularity_apex',
    name: 'SINGULARITY APEX',
    blurb: 'Survive the pull · clear satellites · strike when solid',
    r: 200,
    hp: 5400,
    col: '#ff2d55',
    spd: 18,
    score: 5000,
    gems: 20,
    phases: 3,
    hintDrop: { kind: 'power', key: 'shield' },
    env: [
      {
        kind: 'spike',
        layout: 'edge',
        count: 8,
        r: 12,
        hp: 999,
        hurtPlayer: true,
        hurtBoss: true,
        col: '#ff6b8a',
      },
      {
        kind: 'satellite',
        layout: 'ring',
        count: 6,
        r: 15,
        hp: 22,
        orbitR: 210,
        col: '#ff8fd0',
        hurtPlayer: true,
      },
    ],
    bombPolicy: 'peel',
  },
];

export const BOSS_COUNT = BOSS_ROSTER.length;
/** Adventure mode uses the first 10 bosses from the roster. */
export const ADVENTURE_BOSS_COUNT = 10;

export function bossDef(id: BossId): BossDef {
  const d = BOSS_ROSTER.find((b) => b.id === id);
  if (!d) throw new Error('unknown boss ' + id);
  return d;
}

export function bossAt(index: number): BossDef {
  return BOSS_ROSTER[clampIndex(index)]!;
}

function clampIndex(i: number): number {
  return Math.max(0, Math.min(BOSS_ROSTER.length - 1, i));
}
