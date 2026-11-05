/**
 * Generative score as pure data: each track is a small set of rules; `generate()` expands them into a
 * deterministic, looping list of note events (no audio APIs here, so it can be unit-tested).
 * Goals: calm enough to play under for an hour — low density, soft timbres, long loops.
 */
export type TrackId = 'menu' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface TrackDef {
  name: string;
  bpm: number;
  /** MIDI root of the key. */
  root: number;
  /** Scale as semitone offsets from the root. */
  scale: number[];
  /** Chord roots (scale degree indexes), one per bar, looped. */
  prog: number[];
  /** Chord shape: scale steps above the chord root (default triad 0,2,4). */
  chord?: number[];
  lead: { wave: OscillatorType; octave: number; density: number; cutoff: number };
  bass: { wave: OscillatorType; style: 'root' | 'pulse' | 'walk' | 'none'; cutoff: number };
  drums: 'none' | 'soft' | 'four' | 'half' | 'busy';
  pad: boolean;
  /** Echo amount 0..1. */
  echo: number;
  vol: number;
}

const MAJ_PENT = [0, 2, 4, 7, 9];
const MIN_PENT = [0, 3, 5, 7, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYG = [0, 1, 4, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

export const TRACKS: Record<string, TrackDef> = {
  menu: { name: 'Garage', bpm: 78, root: 60, scale: LYDIAN, prog: [0, 3, 4, 3], lead: { wave: 'sine', octave: 1, density: 0.3, cutoff: 3000 }, bass: { wave: 'sine', style: 'root', cutoff: 300 }, drums: 'none', pad: true, echo: 0.45, vol: 0.9 },
  1: { name: 'Grasslands', bpm: 104, root: 60, scale: MAJ_PENT, prog: [0, 3, 4, 2], lead: { wave: 'triangle', octave: 1, density: 0.42, cutoff: 3200 }, bass: { wave: 'triangle', style: 'walk', cutoff: 420 }, drums: 'soft', pad: true, echo: 0.3, vol: 1 },
  2: { name: 'Desert Ruins', bpm: 94, root: 62, scale: PHRYG, prog: [0, 1, 0, 6], lead: { wave: 'triangle', octave: 1, density: 0.38, cutoff: 2600 }, bass: { wave: 'sine', style: 'root', cutoff: 380 }, drums: 'half', pad: true, echo: 0.4, vol: 1 },
  3: { name: 'Frostbite', bpm: 84, root: 67, scale: MAJ_PENT, prog: [0, 2, 3, 2], lead: { wave: 'sine', octave: 2, density: 0.4, cutoff: 5000 }, bass: { wave: 'sine', style: 'none', cutoff: 300 }, drums: 'none', pad: true, echo: 0.6, vol: 0.95 },
  4: { name: 'Factory', bpm: 108, root: 57, scale: MINOR, prog: [0, 0, 5, 3], lead: { wave: 'square', octave: 1, density: 0.28, cutoff: 1800 }, bass: { wave: 'sawtooth', style: 'pulse', cutoff: 520 }, drums: 'four', pad: false, echo: 0.2, vol: 0.85 },
  5: { name: 'Laser Lab', bpm: 118, root: 64, scale: MIN_PENT, prog: [0, 3, 4, 3], lead: { wave: 'square', octave: 1, density: 0.42, cutoff: 2400 }, bass: { wave: 'square', style: 'pulse', cutoff: 450 }, drums: 'busy', pad: false, echo: 0.35, vol: 0.8 },
  6: { name: 'Magnet Mines', bpm: 76, root: 49, scale: MINOR, prog: [0, 5, 0, 6], lead: { wave: 'sine', octave: 1, density: 0.2, cutoff: 1400 }, bass: { wave: 'sine', style: 'root', cutoff: 260 }, drums: 'half', pad: true, echo: 0.5, vol: 1 },
  7: { name: 'Skyline', bpm: 112, root: 65, scale: MAJ_PENT, prog: [0, 4, 5, 3], chord: [0, 2, 4, 6], lead: { wave: 'triangle', octave: 1, density: 0.5, cutoff: 3600 }, bass: { wave: 'triangle', style: 'walk', cutoff: 460 }, drums: 'soft', pad: true, echo: 0.3, vol: 0.95 },
  8: { name: 'Lava Core', bpm: 96, root: 50, scale: PHRYG, prog: [0, 0, 1, 0], lead: { wave: 'sawtooth', octave: 1, density: 0.22, cutoff: 1500 }, bass: { wave: 'sawtooth', style: 'pulse', cutoff: 380 }, drums: 'half', pad: true, echo: 0.25, vol: 0.8 },
  9: { name: 'Zero-G Station', bpm: 80, root: 66, scale: LYDIAN, prog: [0, 1, 3, 4], lead: { wave: 'sine', octave: 2, density: 0.45, cutoff: 5000 }, bass: { wave: 'sine', style: 'root', cutoff: 280 }, drums: 'none', pad: true, echo: 0.65, vol: 0.95 },
  10: { name: 'Chaos Circuit', bpm: 128, root: 60, scale: [0, 2, 3, 6, 7, 8, 11], prog: [0, 3, 6, 4], lead: { wave: 'square', octave: 1, density: 0.5, cutoff: 2800 }, bass: { wave: 'sawtooth', style: 'pulse', cutoff: 520 }, drums: 'busy', pad: false, echo: 0.3, vol: 0.8 },
};

export type NoteKind = 'pad' | 'bass' | 'lead' | 'kick' | 'snare' | 'hat';
export interface NoteEvent {
  /** 16th-note step within the loop. */
  step: number;
  kind: NoteKind;
  /** MIDI note (pads: the chord root; `notes` holds the whole chord). */
  midi: number;
  notes?: number[];
  /** Length in steps. */
  len: number;
  vel: number;
}

export const STEPS_PER_BAR = 16;
export const BARS = 8; // two passes through the 4-bar progression, with a different melody each pass

/** Tiny seeded RNG (mulberry32) so the loop is identical every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold a note into a pleasant playable register (keeps the pitch class, so it stays in key). */
export const fold = (m: number, lo: number, hi: number): number => {
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
};

/** MIDI note for a scale degree (can exceed the scale length → next octave). */
export const degree = (def: TrackDef, d: number, octaves = 0): number => {
  const n = def.scale.length;
  const oct = Math.floor(d / n);
  return def.root + def.scale[((d % n) + n) % n] + 12 * (oct + octaves);
};

export function generate(id: TrackId): { def: TrackDef; events: NoteEvent[]; steps: number } {
  const def = TRACKS[String(id)];
  const r = rng(typeof id === 'number' ? id * 7919 : 4242);
  const events: NoteEvent[] = [];
  const total = BARS * STEPS_PER_BAR;
  const chordSteps = def.chord ?? [0, 2, 4];

  for (let bar = 0; bar < BARS; bar++) {
    const s0 = bar * STEPS_PER_BAR;
    const rootDeg = def.prog[bar % def.prog.length];
    const chord = chordSteps.map((c) => fold(degree(def, rootDeg + c, -1), 43, 76));
    if (def.pad) events.push({ step: s0, kind: 'pad', midi: chord[0], notes: chord, len: STEPS_PER_BAR, vel: 0.5 });

    const b = fold(degree(def, rootDeg, -2), 31, 52);
    if (def.bass.style === 'root') {
      events.push({ step: s0, kind: 'bass', midi: b, len: 8, vel: 0.8 });
      events.push({ step: s0 + 8, kind: 'bass', midi: b, len: 6, vel: 0.6 });
    } else if (def.bass.style === 'pulse') {
      for (let k = 0; k < 8; k++) events.push({ step: s0 + k * 2, kind: 'bass', midi: b + (k % 4 === 3 ? 12 : 0), len: 2, vel: k % 2 ? 0.45 : 0.75 });
    } else if (def.bass.style === 'walk') {
      const walk = [0, 0, 2, 0];
      for (let k = 0; k < 4; k++) events.push({ step: s0 + k * 4, kind: 'bass', midi: fold(degree(def, rootDeg + walk[k], -2), 31, 55), len: 3, vel: k === 0 ? 0.85 : 0.6 });
    }

    // lead: probabilistic random-walk melody around the chord
    let cur = rootDeg + 2 + Math.floor(r() * 3);
    for (let k = 0; k < STEPS_PER_BAR; k += 2) {
      const strong = k % 8 === 0;
      if (r() > def.lead.density * (strong ? 1.5 : 1)) continue;
      cur += Math.round((r() - 0.5) * 4);
      cur = Math.max(rootDeg - 1, Math.min(rootDeg + 9, cur));
      events.push({ step: s0 + k, kind: 'lead', midi: fold(degree(def, cur, def.lead.octave), 55, 93), len: strong ? 3 : 2, vel: strong ? 0.8 : 0.55 });
    }

    const d = def.drums;
    if (d !== 'none') {
      for (let k = 0; k < STEPS_PER_BAR; k++) {
        if (d === 'four' && k % 4 === 0) events.push({ step: s0 + k, kind: 'kick', midi: 36, len: 1, vel: 0.9 });
        if ((d === 'soft' || d === 'busy' || d === 'half') && (k === 0 || (d === 'busy' && k % 4 === 0) || (d === 'soft' && k === 8))) events.push({ step: s0 + k, kind: 'kick', midi: 36, len: 1, vel: d === 'soft' ? 0.55 : 0.85 });
        if (k % 8 === 4) events.push({ step: s0 + k, kind: 'snare', midi: 38, len: 1, vel: d === 'soft' ? 0.3 : 0.5 });
        if ((d === 'busy' && k % 2 === 0) || (d === 'four' && k % 4 === 2) || (d === 'soft' && k % 4 === 2) || (d === 'half' && k % 4 === 2 && bar % 2)) events.push({ step: s0 + k, kind: 'hat', midi: 42, len: 1, vel: 0.28 });
      }
    }
  }
  return { def, events, steps: total };
}
