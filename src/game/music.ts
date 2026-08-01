import { getAudioContext, isMuted } from './audio';
import type { BossId } from './types';

export type MusicTheme = 'menu' | 'survival' | 'adventure' | 'boss' | `boss:${BossId}`;

type Step = number | null; // MIDI note, or null = rest

type Track = {
  wave: OscillatorType;
  vol: number;
  /** Note length as a fraction of one step (0–1). */
  gate: number;
  pattern: Step[];
  /** Stack a second oscillator slightly detuned (cents). */
  detune?: number;
  /** Add a sine sub one octave down. */
  sub?: boolean;
  /** Soft lowpass for pads. */
  pad?: boolean;
  /** Moody resonant synth bass with filter envelope. */
  bass?: boolean;
  /** Hard hammered piano — sharp attack, bright partials, long ring. */
  piano?: boolean;
  /** Cinematic brass/impact sting — explosive open, long decay. */
  sting?: boolean;
  /** Send into hall reverb. */
  reverb?: boolean;
  /** Send into slap / feedback echo. */
  echo?: boolean;
};

type ThemeDef = {
  bpm: number;
  /** Steps per beat (4 = 16th notes). */
  div: number;
  tracks: Track[];
  /**
   * Percussion lane(s), same length as patterns.
   * k kick · s snare · h closed hat · o open hat · t tom · c crash · . rest
   * Multiple chars per step via parallel `drums` strings.
   */
  drums?: string;
  drumsB?: string;
};

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/** Quiet landing pulse — layered but restrained. */
const MENU: ThemeDef = {
  bpm: 92,
  div: 4,
  tracks: [
    {
      wave: 'sawtooth',
      vol: 0.01,
      gate: 1.8,
      bass: true,
      sub: true,
      pattern: [
        33, null, null, null, null, null, null, null, 36, null, null, null, null, null, null, null,
        33, null, null, null, null, null, null, null, 31, null, null, null, 29, null, null, null,
      ],
    },
    {
      wave: 'triangle',
      vol: 0.022,
      gate: 0.9,
      sub: true,
      pattern: [
        45, null, 45, null, 48, null, 52, null, 45, null, 48, null, 52, null, 55, null, 45, null, 45,
        null, 48, null, 53, null, 52, null, 48, null, 45, null, 43, null,
      ],
    },
    {
      wave: 'sawtooth',
      vol: 0.012,
      gate: 0.95,
      pad: true,
      detune: 8,
      reverb: true,
      pattern: [
        57, null, null, null, 60, null, null, null, 57, null, null, null, 64, null, null, null, 57,
        null, null, null, 65, null, null, null, 64, null, null, null, 55, null, null, null,
      ],
    },
    {
      wave: 'square',
      vol: 0.014,
      gate: 0.5,
      detune: 6,
      echo: true,
      reverb: true,
      pattern: [
        69, null, 72, null, 76, null, 72, null, 69, null, 72, null, 76, null, 79, null, 69, null, 72,
        null, 77, null, 76, null, 74, null, 72, null, 69, null, 67, null,
      ],
    },
  ],
  drums: 'k...h...k...h.o.k...h...k.h.s.h.',
  drumsB: '........t.......c.......t...c...',
};

/** Driving survival loop — denser rhythm section. */
const SURVIVAL: ThemeDef = {
  bpm: 132,
  div: 4,
  tracks: [
    {
      wave: 'sawtooth',
      vol: 0.011,
      gate: 1.35,
      bass: true,
      sub: true,
      pattern: [
        36, null, null, 36, null, null, 43, null, 36, null, null, 36, null, null, 41, null, 34, null,
        null, 34, null, null, 41, null, 36, null, 38, null, 40, null, 41, null,
      ],
    },
    {
      wave: 'square',
      vol: 0.016,
      gate: 0.55,
      detune: 5,
      pattern: [
        36, 36, null, 36, 36, null, 43, null, 36, 36, null, 36, 36, null, 41, null, 34, 34, null, 34,
        34, null, 41, null, 36, null, 38, null, 40, 41, null, 43,
      ],
    },
    {
      wave: 'square',
      vol: 0.018,
      gate: 0.65,
      detune: 7,
      pattern: [
        48, 48, null, 48, 51, null, 53, null, 48, 48, null, 48, 55, null, 53, null, 46, 46, null, 46,
        51, null, 53, null, 48, null, 51, null, 53, 55, null, 53,
      ],
    },
    {
      wave: 'sawtooth',
      vol: 0.01,
      gate: 0.95,
      pad: true,
      reverb: true,
      pattern: [
        60, null, null, null, 63, null, null, null, 60, null, null, null, 67, null, null, null, 58,
        null, null, null, 63, null, null, null, 60, null, null, null, 65, null, null, null,
      ],
    },
    {
      wave: 'square',
      vol: 0.012,
      gate: 0.35,
      detune: 10,
      echo: true,
      reverb: true,
      pattern: [
        72, null, 76, 79, null, 76, 72, null, 71, null, 74, 76, null, 74, 71, null, 69, null, 72, 76,
        null, 72, 69, null, 67, 69, 71, 72, null, 74, 76, null,
      ],
    },
  ],
  drums: 'k.h.s.h.k.h.s.ho.k.h.s.h.k.h.s.h.',
  drumsB: '..t.....t.c...t...t.....t...c.t.',
};

/**
 * Adventure crawl — intense cinematic charge.
 * Drawn bass, hard pianos, driving pulse, big wet stings.
 */
const ADVENTURE: ThemeDef = {
  bpm: 118,
  div: 4,
  tracks: [
    // Deep held bass drones.
    {
      wave: 'sawtooth',
      vol: 0.018,
      gate: 6.5,
      bass: true,
      sub: true,
      pattern: [
        26, null, null, null, null, null, null, null, 26, null, null, null, null, null, null, null,
        29, null, null, null, null, null, null, null, 29, null, null, null, 26, null, null, null,
        24, null, null, null, null, null, null, null, 24, null, null, null, null, null, null, null,
        31, null, null, null, null, null, 29, null, 26, null, null, null, 24, null, null, null,
      ],
    },
    // Driving bass pulse under the drones.
    {
      wave: 'sawtooth',
      vol: 0.014,
      gate: 1.1,
      bass: true,
      pattern: [
        38, null, 38, null, 38, null, 45, null, 38, null, 38, null, 43, null, 45, null, 41, null, 41,
        null, 41, null, 48, null, 38, null, 40, null, 41, null, 43, null, 36, null, 36, null, 36, null,
        43, null, 36, null, 38, null, 40, null, 41, null, 43, null, 43, null, 45, null, 41, null, 38,
        null, 36, null, 38, null, 36, null,
      ],
    },
    // Dark pad wash — wet hall.
    {
      wave: 'sawtooth',
      vol: 0.011,
      gate: 3.2,
      pad: true,
      detune: 12,
      reverb: true,
      pattern: [
        50, null, null, null, null, null, null, null, 53, null, null, null, null, null, null, null,
        50, null, null, null, null, null, null, null, 55, null, null, null, 57, null, null, null, 48,
        null, null, null, null, null, null, null, 53, null, null, null, null, null, null, null, 50,
        null, null, null, 55, null, null, null, 53, null, 50, null, 48, null, null, null,
      ],
    },
    // Aggressive mid ostinato — urgency.
    {
      wave: 'square',
      vol: 0.015,
      gate: 0.55,
      detune: 8,
      echo: true,
      pattern: [
        50, 50, null, 50, 53, null, 55, null, 50, 50, null, 50, 57, null, 55, null, 48, 48, null, 48,
        53, null, 55, null, 50, null, 53, null, 55, 57, null, 55, 50, 50, null, 50, 53, null, 57, null,
        50, 50, null, 53, 55, null, 57, null, 48, null, 50, null, 53, 55, null, 53, 50, null, 48, null,
        45, 48, null, 50,
      ],
    },
    // Hard piano — low octaves, denser hits.
    {
      wave: 'triangle',
      vol: 0.03,
      gate: 2.0,
      piano: true,
      reverb: true,
      pattern: [
        38, null, null, null, 50, null, null, null, 38, null, null, 50, null, null, 53, null, 41, null,
        null, null, 53, null, 38, null, 41, null, null, 53, null, null, 50, null, 36, null, null, null,
        48, null, null, null, 36, null, 48, null, 36, null, null, 50, 43, null, null, null, 50, null,
        null, null, 38, null, 50, null, 43, null, 38, null,
      ],
    },
    // Hard piano — high hammers, more frequent.
    {
      wave: 'triangle',
      vol: 0.024,
      gate: 1.5,
      piano: true,
      reverb: true,
      echo: true,
      pattern: [
        62, null, null, 65, null, null, 62, null, 67, null, null, null, 69, null, 67, null, 62, null,
        65, null, 67, null, null, 69, null, null, 62, null, 67, null, 65, null, 60, null, null, 65,
        null, null, 60, null, 67, null, null, null, 65, null, 62, null, 62, null, 67, null, null, 69,
        null, 67, 62, null, 60, null, 62, null, 65, null,
      ],
    },
    // Big cinematic stings — wet and loud.
    {
      wave: 'sawtooth',
      vol: 0.022,
      gate: 3.8,
      sting: true,
      reverb: true,
      echo: true,
      pattern: [
        57, null, null, null, null, null, null, null, null, null, null, null, 64, null, null, null,
        null, null, null, null, 57, null, null, null, 64, null, null, null, null, null, 69, null, 55,
        null, null, null, null, null, null, null, null, null, null, null, 62, null, null, null, null,
        null, null, null, 57, null, null, null, 62, null, null, null, 57, null, 64, null,
      ],
    },
  ],
  drums: 'k.h.k.s.k.h.s.h.k.h.k.s.k.s.h.s.k.h.k.s.k.h.s.h.k.s.k.s.k.c.s.c.',
  drumsB: 'c...t...c...t.c.c...t...c.t.c...c...t...c...t.c.c...t.c.t.c.t.c.',
};

const SCALES = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  diminished: [0, 1, 3, 4, 6, 7, 9, 10],
} as const;

type ScaleName = keyof typeof SCALES;

type MenaceSpec = {
  bpm: number;
  root: number;
  scale: ScaleName;
  drums: string;
  drumsB?: string;
  bassWave?: OscillatorType;
  midWave?: OscillatorType;
  leadWave?: OscillatorType;
  feel: 'march' | 'stalk' | 'pulse' | 'ritual' | 'chase' | 'crush';
};

function deg(scale: readonly number[], root: number, d: number, oct = 0): number {
  const n = scale.length;
  const o = Math.floor(d / n) + oct;
  const i = ((d % n) + n) % n;
  return root + scale[i]! + o * 12;
}

function patFrom(
  scale: readonly number[],
  root: number,
  degrees: (number | null)[],
  oct = 0,
): Step[] {
  return degrees.map((d) => (d == null ? null : deg(scale, root, d, oct)));
}

/** Harmony degrees — thirds above mid line where mid is active. */
function harmonyFrom(mid: (number | null)[]): (number | null)[] {
  return mid.map((d) => (d == null ? null : d + 2));
}

/** Sustained pad roots every bar. */
function padFrom(bass: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < bass.length; i++) {
    if (i % 8 === 0) out.push(bass[i] ?? bass.find((x) => x != null) ?? 0);
    else out.push(null);
  }
  return out;
}

/** Moody walking / held synth-bass degrees by feel. */
function basslineFor(feel: MenaceSpec['feel']): (number | null)[] {
  switch (feel) {
    case 'march':
      return [
        0, null, null, 0, null, null, 3, null, 0, null, null, 4, null, null, 3, null, 0, null, null, 0,
        null, null, 2, null, 0, null, 3, null, 4, null, 3, null,
      ];
    case 'stalk':
      return [
        0, null, null, null, null, null, 1, null, 0, null, null, null, 3, null, null, 1, 0, null, null,
        null, null, null, 4, null, 0, null, null, 1, 0, null, null, null,
      ];
    case 'pulse':
      return [
        0, null, 0, null, 0, null, 3, null, 0, null, 0, null, 4, null, 3, null, 0, null, 0, null, 0,
        null, 2, null, 0, null, 3, null, 4, null, 3, null,
      ];
    case 'ritual':
      return [
        0, null, null, null, 0, null, null, null, 3, null, null, null, 4, null, null, 3, 0, null, null,
        null, 1, null, null, null, 0, null, null, 3, 4, null, null, 6,
      ];
    case 'chase':
      return [
        0, null, 3, null, 0, null, 4, null, 0, null, 3, null, 0, null, 4, 3, 0, null, 2, null, 0, null,
        3, null, 0, null, 4, null, 3, null, 4, null,
      ];
    case 'crush':
    default:
      return [
        0, null, null, null, 0, null, null, 3, 0, null, null, null, 4, null, null, 3, 0, null, null,
        null, 0, null, null, 1, 0, null, null, 3, 4, null, 3, null,
      ];
  }
}

/** Build a heavy multi-layer boss loop. */
function menace(spec: MenaceSpec): ThemeDef {
  const sc = SCALES[spec.scale];
  const root = spec.root;
  let bassDeg: (number | null)[];
  let midDeg: (number | null)[];
  let leadDeg: (number | null)[];

  switch (spec.feel) {
    case 'march':
      bassDeg = [
        0, 0, null, 0, 0, null, 3, 3, 0, 0, null, 0, 4, null, 3, null, 0, 0, null, 0, 0, null, 2, 2, 0,
        null, 0, null, 3, null, 4, null,
      ];
      midDeg = [
        0, null, 3, null, 4, null, 3, null, 0, null, 3, 4, null, 6, 4, 3, 0, null, 2, null, 3, null, 2,
        null, 0, null, 3, 4, null, 6, 7, null,
      ];
      leadDeg = [
        7, null, null, 6, null, 4, null, 3, 7, null, 6, null, 8, null, 6, null, 7, null, null, 4, null,
        3, null, 2, 4, null, 3, null, 6, null, 7, null,
      ];
      break;
    case 'stalk':
      bassDeg = [
        0, null, null, 0, null, null, 0, 1, 0, null, null, 0, null, 3, null, 1, 0, null, null, 0, null,
        null, 4, 3, 0, null, 1, null, 0, null, null, null,
      ];
      midDeg = [
        null, 0, null, null, 3, null, null, 4, null, 0, null, null, 6, null, 4, null, null, 0, null,
        null, 3, null, null, 1, null, 0, null, 4, null, 3, null, 1,
      ];
      leadDeg = [
        null, null, 7, null, null, null, 8, null, null, null, 6, null, null, 7, null, 4, null, null, 7,
        null, null, null, 10, null, null, 8, null, 7, null, 6, null, 4,
      ];
      break;
    case 'pulse':
      bassDeg = [
        0, 0, 0, null, 0, 0, 3, null, 0, 0, 0, null, 4, 4, 3, null, 0, 0, 0, null, 0, 0, 2, null, 0, 0,
        3, null, 4, null, 3, null,
      ];
      midDeg = [
        0, null, 0, 3, 0, null, 0, 4, 0, null, 0, 3, 0, null, 4, 6, 0, null, 0, 2, 0, null, 0, 3, 0,
        null, 3, 4, 0, null, 6, null,
      ];
      leadDeg = [
        4, 4, null, 7, 4, 4, null, 6, 4, 4, null, 7, 8, null, 6, null, 3, 3, null, 6, 3, 3, null, 4, 4,
        4, null, 7, 6, null, 4, null,
      ];
      break;
    case 'ritual':
      bassDeg = [
        0, null, 0, null, 0, null, 0, null, 3, null, 3, null, 4, null, 3, null, 0, null, 0, null, 1,
        null, 1, null, 0, null, 3, null, 4, null, 6, null,
      ];
      midDeg = [
        0, 3, 4, 3, 0, 3, 4, 6, 0, 3, 4, 3, 7, 6, 4, 3, 0, 2, 3, 2, 0, 1, 3, 4, 0, 3, 4, 6, 7, 6, 4,
        3,
      ];
      leadDeg = [
        7, null, 7, null, 8, null, 7, null, 10, null, 8, null, 7, null, 6, null, 7, null, 7, null, 6,
        null, 4, null, 7, null, 8, null, 10, null, 11, null,
      ];
      break;
    case 'chase':
      bassDeg = [
        0, null, 0, 0, 3, null, 0, 0, 0, null, 0, 0, 4, null, 3, 0, 0, null, 0, 0, 2, null, 0, 0, 0,
        null, 3, 4, 0, null, 4, 3,
      ];
      midDeg = [
        4, 3, 0, 4, 6, 4, 3, 0, 4, 3, 0, 4, 7, 6, 4, 3, 4, 2, 0, 4, 6, 4, 2, 0, 4, 3, 4, 6, 7, 6, 4,
        null,
      ];
      leadDeg = [
        7, 8, 7, 6, 7, 10, 8, 7, 7, 8, 10, 8, 11, 10, 8, 7, 7, 6, 4, 6, 7, 8, 6, 4, 7, 8, 7, 10, 11,
        null, 10, 8,
      ];
      break;
    case 'crush':
    default:
      bassDeg = [
        0, 0, null, null, 0, 0, null, 3, 0, 0, null, null, 4, null, null, 3, 0, 0, null, null, 0, 0,
        null, 1, 0, 0, null, 3, 4, 4, 3, null,
      ];
      midDeg = [
        0, null, null, 3, null, null, 4, null, 0, null, null, 6, null, null, 4, 3, 0, null, null, 2,
        null, null, 3, null, 0, null, 4, null, 6, null, 7, null,
      ];
      leadDeg = [
        null, 7, null, null, null, 6, null, 4, null, 7, null, null, null, 8, null, 6, null, 7, null,
        null, null, 4, null, 3, null, 7, null, 6, null, 10, null, 7,
      ];
      break;
  }

  const harmDeg = harmonyFrom(midDeg);
  const padDeg = padFrom(bassDeg);
  const lineDeg = basslineFor(spec.feel);

  return {
    bpm: spec.bpm,
    div: 4,
    tracks: [
      {
        // Moody synthy bassline — resonant filter, long notes
        wave: 'sawtooth',
        vol: 0.011,
        gate: 1.55,
        bass: true,
        sub: true,
        pattern: patFrom(sc, root, lineDeg, -1),
      },
      {
        wave: spec.bassWave ?? 'square',
        vol: 0.02,
        gate: 0.75,
        detune: 4,
        pattern: patFrom(sc, root, bassDeg, -1),
      },
      {
        wave: spec.midWave ?? 'square',
        vol: 0.016,
        gate: 0.55,
        detune: 9,
        pattern: patFrom(sc, root, midDeg, 0),
      },
      {
        wave: 'triangle',
        vol: 0.011,
        gate: 0.7,
        detune: 12,
        pattern: patFrom(sc, root, harmDeg, 0),
      },
      {
        wave: 'sawtooth',
        vol: 0.011,
        gate: 0.98,
        pad: true,
        detune: 14,
        reverb: true,
        pattern: patFrom(sc, root, padDeg, 1),
      },
      {
        wave: spec.leadWave ?? 'square',
        vol: 0.014,
        gate: 0.38,
        detune: 7,
        echo: true,
        reverb: true,
        pattern: patFrom(sc, root, leadDeg, 1),
      },
    ],
    drums: spec.drums,
    drumsB: spec.drumsB,
  };
}

const BOSS_FALLBACK = menace({
  bpm: 152,
  root: 28,
  scale: 'phrygian',
  feel: 'crush',
  drums: 'k.hsk.h.k.hsk.hs.k.hsk.h.k.hs.hs',
  drumsB: 't...t.c.t...t.c.t...t.c.t.c.t.c.',
});

const BOSS_SPECS: Record<BossId, MenaceSpec> = {
  prism: {
    bpm: 136,
    root: 29,
    scale: 'harmonic',
    feel: 'ritual',
    drums: 'k...k.h.k...s.h.k...k.h.k.s.h.s.',
    drumsB: '....t...c...t.......t...c...t...',
    midWave: 'triangle',
  },
  crown: {
    bpm: 142,
    root: 31,
    scale: 'natural',
    feel: 'march',
    drums: 'k.h.k.h.k.h.s.h.k.h.k.h.k.s.s.h.',
    drumsB: 't...t...t.c.t...t...t...t.c.t.c.',
    leadWave: 'square',
  },
  void_anchor: {
    bpm: 108,
    root: 26,
    scale: 'locrian',
    feel: 'stalk',
    drums: 'k.......k...s...k.......k.s.h.s.',
    drumsB: '....t.......c.......t.......c...',
    bassWave: 'triangle',
    midWave: 'sawtooth',
  },
  hexstorm: {
    bpm: 168,
    root: 33,
    scale: 'phrygian',
    feel: 'chase',
    drums: 'k.hsk.hsk.hsk.hsk.hsk.hsk.hsk.hs',
    drumsB: 't.t.t.c.t.t.t.c.t.t.t.c.t.t.c.c.',
    leadWave: 'sawtooth',
  },
  aegis_titan: {
    bpm: 128,
    root: 28,
    scale: 'harmonic',
    feel: 'march',
    drums: 'k...s...k...s...k...s...k.h.s.h.',
    drumsB: 't.c.t...t.c.t...t.c.t...t.c.t.c.',
    bassWave: 'square',
  },
  serpent_regent: {
    bpm: 148,
    root: 30,
    scale: 'phrygian',
    feel: 'stalk',
    drums: 'k.h...k.h...k.h.s.h.k.h...k.s.h.',
    drumsB: '..t.c...t.....t.c...t.c...t...c.',
    midWave: 'sawtooth',
  },
  mirror_core: {
    bpm: 140,
    root: 32,
    scale: 'diminished',
    feel: 'pulse',
    drums: 'k.h.k.h.k.h.k.h.k.h.k.h.s.h.s.h.',
    drumsB: 't...t.c.t...t.c.t...t.c.t.c.t.c.',
    leadWave: 'square',
  },
  phase_lattice: {
    bpm: 120,
    root: 27,
    scale: 'locrian',
    feel: 'ritual',
    drums: 'k.....h.k.....s.k.....h.k...s.h.',
    drumsB: '....t...c.......t...c.......t.c.',
    bassWave: 'triangle',
  },
  starforge: {
    bpm: 156,
    root: 34,
    scale: 'harmonic',
    feel: 'pulse',
    drums: 'k.hsk.h.k.hsk.h.k.hsk.h.k.hs.hs',
    drumsB: 't.t.c.t.t.t.c.t.t.t.c.t.t.c.t.c.',
    leadWave: 'sawtooth',
  },
  crystal_nexus: {
    bpm: 132,
    root: 35,
    scale: 'natural',
    feel: 'ritual',
    drums: 'k...h.h.k...s...k...h.h.k.s.h.s.',
    drumsB: '..t.....c...t.....t.....c...t...',
    midWave: 'triangle',
    leadWave: 'triangle',
  },
  pulse_maw: {
    bpm: 144,
    root: 25,
    scale: 'phrygian',
    feel: 'crush',
    drums: 'k.k.s.h.k.k.s.h.k.k.s.h.k.hs.hs',
    drumsB: 't...t.c.t...t.c.t...t.c.t.c.c.c.',
    bassWave: 'sawtooth',
  },
  grid_reaver: {
    bpm: 160,
    root: 29,
    scale: 'diminished',
    feel: 'chase',
    drums: 'k.h.s.h.k.h.s.h.k.h.s.h.k.s.s.h.',
    drumsB: 't.t.c.t.t.t.c.t.t.t.c.t.t.c.s.c.',
    midWave: 'square',
  },
  twin_helix: {
    bpm: 150,
    root: 31,
    scale: 'harmonic',
    feel: 'pulse',
    drums: 'k.h.k.h.s.h.k.h.k.h.k.h.s.h.s.h.',
    drumsB: 't...t...t.c.t...t...t...t.c.t.c.',
    leadWave: 'square',
    midWave: 'triangle',
  },
  lodestone: {
    bpm: 118,
    root: 26,
    scale: 'natural',
    feel: 'stalk',
    drums: 'k.....k.s.....k.....k.s...h.s.',
    drumsB: '....t.......c.......t.......c...',
    bassWave: 'triangle',
    midWave: 'sawtooth',
  },
  arc_throne: {
    bpm: 138,
    root: 33,
    scale: 'phrygian',
    feel: 'ritual',
    drums: 'k...s.h.k...s.h.k...s.h.k.s.h.s.',
    drumsB: 't.c.t...t.c.t...t.c.t...t.c.t.c.',
    leadWave: 'sawtooth',
  },
  railbait: {
    bpm: 172,
    root: 36,
    scale: 'diminished',
    feel: 'chase',
    drums: 'k.hsk.hsk.hsk.hsk.hsk.hsk.k.s.hs',
    drumsB: 't.t.t.c.t.t.t.c.t.t.t.c.t.c.t.c.',
    midWave: 'square',
    leadWave: 'square',
  },
  nest_queen: {
    bpm: 134,
    root: 30,
    scale: 'harmonic',
    feel: 'stalk',
    drums: 'k.h...s.h.k...s.h.k.h...s.k.s.h.',
    drumsB: '..t.c...t...t.c...t.c...t...c...',
    midWave: 'triangle',
  },
  stasis_warden: {
    bpm: 100,
    root: 24,
    scale: 'locrian',
    feel: 'ritual',
    drums: 'k.........k...s...k.........s...',
    drumsB: '....t...c.......t...c.......t.c.',
    bassWave: 'triangle',
    leadWave: 'triangle',
  },
  bulwark_colossus: {
    bpm: 124,
    root: 27,
    scale: 'phrygian',
    feel: 'crush',
    drums: 'k...k...k...s...k...k...k.s.s.h.',
    drumsB: 't.c.t.c.t.c.t.c.t.c.t.c.t.c.t.c.',
    bassWave: 'sawtooth',
    midWave: 'square',
  },
  singularity_apex: {
    bpm: 166,
    root: 23,
    scale: 'locrian',
    feel: 'crush',
    drums: 'k.hsk.hsk.hsk.hsk.k.hsk.hsk.hs.hs',
    drumsB: 't.t.c.t.t.t.c.t.t.t.c.t.t.c.c.c.',
    bassWave: 'sawtooth',
    midWave: 'sawtooth',
    leadWave: 'square',
  },
};

const BOSS_THEMES = Object.fromEntries(
  (Object.keys(BOSS_SPECS) as BossId[]).map((id) => [id, menace(BOSS_SPECS[id])]),
) as Record<BossId, ThemeDef>;

function resolveTheme(name: MusicTheme): ThemeDef {
  if (name === 'menu') return MENU;
  if (name === 'survival') return SURVIVAL;
  if (name === 'adventure') return ADVENTURE;
  if (name === 'boss') return BOSS_FALLBACK;
  if (name.startsWith('boss:')) {
    const id = name.slice(5) as BossId;
    return BOSS_THEMES[id] ?? BOSS_FALLBACK;
  }
  return BOSS_FALLBACK;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;

let theme: MusicTheme | null = null;
let desired: MusicTheme | null = null;
let step = 0;
let nextNoteTime = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let master: GainNode | null = null;
let echoSend: GainNode | null = null;
let reverbSend: GainNode | null = null;
let fxBuiltFor: AudioContext | null = null;
let ducking = false;
let started = false;

function masterGain(ctx: AudioContext): GainNode {
  if (!master || master.context !== ctx) {
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    fxBuiltFor = null;
  }
  return master;
}

/** Impulse for a cheap algorithmic hall. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, (rate * seconds) | 0);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** Shared echo + reverb sends into the music master. */
function ensureFx(ctx: AudioContext): void {
  if (fxBuiltFor === ctx && echoSend && reverbSend) return;
  const m = masterGain(ctx);

  echoSend = ctx.createGain();
  echoSend.gain.value = 0.55;
  const delay = ctx.createDelay(1.2);
  delay.delayTime.value = 0.3;
  const fb = ctx.createGain();
  fb.gain.value = 0.36;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 2400;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0.48;
  echoSend.connect(delay);
  delay.connect(fb).connect(echoLp).connect(delay);
  delay.connect(echoWet).connect(m);

  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.7;
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.4, 2.6);
  const revLp = ctx.createBiquadFilter();
  revLp.type = 'lowpass';
  revLp.frequency.value = 3800;
  const revWet = ctx.createGain();
  revWet.gain.value = 0.38;
  reverbSend.connect(conv).connect(revLp).connect(revWet).connect(m);

  fxBuiltFor = ctx;
}

type VoiceOpts = {
  detune?: number;
  sub?: boolean;
  pad?: boolean;
  bass?: boolean;
  piano?: boolean;
  sting?: boolean;
  reverb?: boolean;
  echo?: boolean;
};

function wireOut(ctx: AudioContext, node: AudioNode, opts: VoiceOpts): void {
  const dest = masterGain(ctx);
  node.connect(dest);
  if (opts.reverb || opts.echo) {
    ensureFx(ctx);
    if (opts.reverb && reverbSend) node.connect(reverbSend);
    if (opts.echo && echoSend) node.connect(echoSend);
  }
}

function targetGain(): number {
  if (isMuted() || !theme) return 0;
  return ducking ? 0.2 : 1;
}

function fadeMaster(ctx: AudioContext, to: number, secs = 0.18): void {
  const g = masterGain(ctx);
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + secs);
}

function voice(
  ctx: AudioContext,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  opts: VoiceOpts = {},
): void {
  try {
    const release = Math.max(0.05, dur);

    if (opts.bass) {
      // Classic moody synth bass: saw + square, resonant LP envelope.
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o1.type = 'sawtooth';
      o2.type = 'square';
      o1.frequency.setValueAtTime(Math.max(28, freq), when);
      o2.frequency.setValueAtTime(Math.max(28, freq), when);
      o2.detune.setValueAtTime(-7, when);
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(3.8, when);
      const open = Math.min(2200, freq * 8);
      const closed = Math.max(90, freq * 1.6);
      filter.frequency.setValueAtTime(closed, when);
      filter.frequency.exponentialRampToValueAtTime(open, when + 0.04);
      filter.frequency.exponentialRampToValueAtTime(closed * 0.65, when + release * 0.85);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.018);
      g.gain.setValueAtTime(vol * 0.75, when + release * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, when + release);
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(g);
      wireOut(ctx, g, opts);
      o1.start(when);
      o2.start(when);
      o1.stop(when + release + 0.05);
      o2.stop(when + release + 0.05);
      if (opts.sub) {
        const sub = ctx.createOscillator();
        const sg = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(Math.max(20, freq * 0.5), when);
        sg.gain.setValueAtTime(0.0001, when);
        sg.gain.exponentialRampToValueAtTime(vol * 0.28, when + 0.02);
        sg.gain.exponentialRampToValueAtTime(0.0001, when + release);
        sub.connect(sg);
        wireOut(ctx, sg, opts);
        sub.start(when);
        sub.stop(when + release + 0.05);
      }
      return;
    }

    if (opts.piano) {
      // Hard piano: hammer transient + bright partials, long ringing decay.
      const ring = Math.max(release, 1.1);
      const partials: [number, number, OscillatorType][] = [
        [1, 1, 'triangle'],
        [2, 0.42, 'sine'],
        [3, 0.18, 'triangle'],
        [4, 0.08, 'sine'],
      ];
      for (const [mult, amp, wave] of partials) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = wave;
        o.frequency.setValueAtTime(Math.max(20, freq * mult), when);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol * amp, when + 0.004);
        g.gain.exponentialRampToValueAtTime(vol * amp * 0.35, when + 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, when + ring);
        o.connect(g);
        wireOut(ctx, g, opts);
        o.start(when);
        o.stop(when + ring + 0.05);
      }
      // Felt hammer noise
      noiseHit(ctx, when, 0.035, 'bandpass', Math.min(4200, freq * 18), vol * 0.55, 4);
      return;
    }

    if (opts.sting) {
      // Big cinematic sting: brass burst + filter open, long epic tail.
      const ring = Math.max(release, 1.6);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o1.type = 'sawtooth';
      o2.type = 'square';
      o1.frequency.setValueAtTime(Math.max(40, freq), when);
      o2.frequency.setValueAtTime(Math.max(40, freq), when);
      o2.detune.setValueAtTime(6, when);
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(2.4, when);
      filter.frequency.setValueAtTime(800, when);
      filter.frequency.exponentialRampToValueAtTime(4800, when + 0.03);
      filter.frequency.exponentialRampToValueAtTime(900, when + ring * 0.7);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
      g.gain.setValueAtTime(vol * 0.55, when + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, when + ring);
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(g);
      wireOut(ctx, g, opts);
      o1.start(when);
      o2.start(when);
      o1.stop(when + ring + 0.05);
      o2.stop(when + ring + 0.05);
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(Math.max(28, freq * 0.5), when);
      sg.gain.setValueAtTime(0.0001, when);
      sg.gain.exponentialRampToValueAtTime(vol * 0.4, when + 0.01);
      sg.gain.exponentialRampToValueAtTime(0.0001, when + ring);
      sub.connect(sg);
      wireOut(ctx, sg, opts);
      sub.start(when);
      sub.stop(when + ring + 0.05);
      noiseHit(ctx, when, 0.12, 'highpass', 3500, vol * 0.7, 2.2);
      return;
    }

    const mk = (f: number, wave: OscillatorType, v: number, detune = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(Math.max(20, f), when);
      if (detune) o.detune.setValueAtTime(detune, when);
      let node: AudioNode = o;
      if (opts.pad) {
        const f2 = ctx.createBiquadFilter();
        f2.type = 'lowpass';
        f2.frequency.setValueAtTime(900, when);
        f2.Q.value = 0.7;
        o.connect(f2);
        node = f2;
      }
      const attack = opts.pad ? 0.04 : 0.006;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(v, when + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, when + release);
      node.connect(g);
      wireOut(ctx, g, opts);
      o.start(when);
      o.stop(when + release + 0.04);
    };

    mk(freq, type, vol, 0);
    if (opts.detune) mk(freq, type, vol * 0.7, opts.detune);
    if (opts.sub) mk(freq * 0.5, 'sine', vol * 0.55, 0);
  } catch {
    /* ignore */
  }
}

type DrumKind = 'k' | 'h' | 's' | 'o' | 't' | 'c';

function hitDrum(ctx: AudioContext, when: number, kind: DrumKind): void {
  try {
    const dest = masterGain(ctx);
    if (kind === 'k') {
      // Body noise
      noiseHit(ctx, when, 0.14, 'lowpass', 120, 0.07, 3.8);
      // Sub sine punch
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, when);
      o.frequency.exponentialRampToValueAtTime(38, when + 0.14);
      g.gain.setValueAtTime(0.08, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      o.connect(g).connect(dest);
      o.start(when);
      o.stop(when + 0.18);
      // Click transient
      const c = ctx.createOscillator();
      const cg = ctx.createGain();
      c.type = 'square';
      c.frequency.setValueAtTime(180, when);
      cg.gain.setValueAtTime(0.03, when);
      cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
      c.connect(cg).connect(dest);
      c.start(when);
      c.stop(when + 0.03);
      return;
    }
    if (kind === 's') {
      noiseHit(ctx, when, 0.12, 'bandpass', 1800, 0.07, 1.5);
      noiseHit(ctx, when, 0.08, 'highpass', 3200, 0.035, 2);
      return;
    }
    if (kind === 'h') {
      noiseHit(ctx, when, 0.035, 'highpass', 7000, 0.028, 2.2);
      return;
    }
    if (kind === 'o') {
      noiseHit(ctx, when, 0.16, 'highpass', 5500, 0.032, 1.2);
      return;
    }
    if (kind === 't') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, when);
      o.frequency.exponentialRampToValueAtTime(70, when + 0.12);
      g.gain.setValueAtTime(0.045, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
      o.connect(g).connect(dest);
      o.start(when);
      o.stop(when + 0.15);
      noiseHit(ctx, when, 0.08, 'bandpass', 400, 0.025, 2);
      return;
    }
    if (kind === 'c') {
      noiseHit(ctx, when, 0.28, 'highpass', 4500, 0.04, 0.9);
      noiseHit(ctx, when, 0.22, 'bandpass', 2200, 0.028, 1.1);
    }
  } catch {
    /* ignore */
  }
}

function noiseHit(
  ctx: AudioContext,
  when: number,
  dur: number,
  filter: BiquadFilterType,
  freq: number,
  vol: number,
  curve: number,
): void {
  const n = Math.max(1, (ctx.sampleRate * dur) | 0);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, curve);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g).connect(masterGain(ctx));
  src.start(when);
}

function scheduleDrums(ctx: AudioContext, lane: string | undefined, s: number, when: number): void {
  if (!lane) return;
  const ch = lane[s % lane.length]!;
  if (ch === 'k' || ch === 'h' || ch === 's' || ch === 'o' || ch === 't' || ch === 'c') {
    hitDrum(ctx, when, ch);
  }
}

function scheduleStep(ctx: AudioContext, def: ThemeDef, s: number, when: number): void {
  const stepDur = 60 / def.bpm / def.div;
  for (const track of def.tracks) {
    const note = track.pattern[s % track.pattern.length]!;
    if (note == null) continue;
    voice(ctx, when, midi(note), stepDur * track.gate, track.wave, track.vol, {
      detune: track.detune,
      sub: track.sub,
      pad: track.pad,
      bass: track.bass,
      piano: track.piano,
      sting: track.sting,
      reverb: track.reverb,
      echo: track.echo,
    });
  }
  scheduleDrums(ctx, def.drums, s, when);
  scheduleDrums(ctx, def.drumsB, s, when);
}

function advance(def: ThemeDef): void {
  const stepDur = 60 / def.bpm / def.div;
  const len = def.tracks[0]?.pattern.length || 16;
  nextNoteTime += stepDur;
  step = (step + 1) % len;
}

function tick(): void {
  timer = null;
  if (!theme || isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state === 'suspended') {
    timer = setTimeout(tick, LOOKAHEAD_MS);
    return;
  }
  const def = resolveTheme(theme);
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(ctx, def, step, nextNoteTime);
    advance(def);
  }
  timer = setTimeout(tick, LOOKAHEAD_MS);
}

function stopTimer(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

function beginTheme(name: MusicTheme): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  stopTimer();
  theme = name;
  desired = name;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.06;
  fadeMaster(ctx, targetGain(), 0.28);
  if (!isMuted()) tick();
  started = true;
}

/** Request a looping theme. Starts after the first unlocked AudioContext. */
export function playMusic(name: MusicTheme): void {
  desired = name;
  if (isMuted()) {
    theme = name;
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => {
      if (desired === name) beginTheme(name);
    });
    return;
  }
  if (theme === name && started && timer != null) return;
  beginTheme(name);
}

/** Switch to that boss's dedicated dramatic bed. */
export function playBossMusic(id: BossId): void {
  playMusic(`boss:${id}`);
}

export function stopMusic(fade = 0.25): void {
  desired = null;
  const ctx = getAudioContext();
  if (ctx) fadeMaster(ctx, 0, fade);
  stopTimer();
  theme = null;
  started = false;
}

export function setMusicMuted(muted: boolean): void {
  const ctx = getAudioContext();
  if (muted) {
    if (ctx) fadeMaster(ctx, 0, 0.08);
    stopTimer();
    return;
  }
  if (desired) beginTheme(desired);
  else if (ctx) fadeMaster(ctx, targetGain(), 0.12);
}

/** Soft duck while paused — keeps the loop position. */
export function setMusicDucked(on: boolean): void {
  ducking = on;
  const ctx = getAudioContext();
  if (ctx && theme && !isMuted()) fadeMaster(ctx, targetGain(), 0.12);
}

/** Call from the first user gesture so menu music can unlock. */
export function unlockMusic(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (desired && !started) beginTheme(desired);
  else if (desired && theme === desired && timer == null && !isMuted()) {
    nextNoteTime = ctx.currentTime + 0.05;
    fadeMaster(ctx, targetGain(), 0.2);
    tick();
  }
}
