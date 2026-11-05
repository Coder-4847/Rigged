import { LevelBuilder, LevelMeta } from '../builder';
import type { DecoKind, LevelData, SurfaceType } from '../types';
import type { VehicleId } from '../../config';

/**
 * Segment kit: reusable, tuned level pieces. Every segment starts and ends on flat ground at the
 * cursor height (unless stated), puts a flat run-up before anything dangerous, and uses the
 * telegraphed hazards with proven-fair timings. Levels are just ordered lists of segments.
 */
export interface Ctx {
  L: LevelBuilder;
  id: number;
  /** Counter for unique switch ids. */
  sw: number;
  world: number;
  /** Jump-distance multiplier for low-gravity levels (26 / |gravity|). */
  gs: number;
  /** Timed hazard clusters since the last checkpoint (rule: at most one between checkpoints). */
  since: number;
  lastCpX: number;
}

const flat = (c: Ctx, w: number, surface: SurfaceType = 'grass') => void c.L.ground((t) => t.flat(w), surface);

/**
 * Phase for the i-th hazard of a row so that a car cruising at ~16 m/s meets every one at the same point of
 * its cycle (hazard i is reached i·spacing/v seconds later, so its clock must run that far *behind*).
 */
const sync = (i: number, spacing: number, period: number): number => ((((-i * spacing) / 16 / period) % 1) + 1) % 1;

/** Place a checkpoint 5 m back from the cursor (never twice in a row). */
function checkpoint(c: Ctx): void {
  const x = c.L.cursor.x - 5;
  if (x <= c.lastCpX + 12) return;
  c.L.checkpointAt(x);
  c.lastCpX = x;
  c.since = 0;
}

/** Call at the start of every timed hazard: guarantees a checkpoint separates it from the previous one. */
function gate(c: Ctx): void {
  if (c.since >= 1) checkpoint(c);
  c.since++;
}
const here = (c: Ctx) => c.L.cursor.x;
const gy = (c: Ctx) => c.L.cursor.y;

export type JumpSize = 'S' | 'M' | 'L' | 'XL';
const JUMPS: Record<JumpSize, { w: number; h: number; gap: number; drop: number }> = {
  S: { w: 8, h: 1.8, gap: 6, drop: 0 },
  M: { w: 10, h: 2.4, gap: 7, drop: 0 },
  L: { w: 14, h: 4.5, gap: 10, drop: -3 },
  XL: { w: 18, h: 6.5, gap: 13.5, drop: -4 },
};

export const K = {
  // ----------------------------------------------------------------------- terrain
  run: (c: Ctx, w = 30, surface: SurfaceType = 'grass') => flat(c, w, surface),

  /** Rolling hills that net out to zero height change. */
  rolling(c: Ctx, n = 3, amp = 3, w = 24, surface: SurfaceType = 'grass') {
    c.L.ground((t) => {
      for (let i = 0; i < n; i++) {
        t.ease(w, amp);
        t.ease(w, -amp);
      }
    }, surface);
  },

  bumps(c: Ctx, w = 30, amp = 0.55, n = 5) {
    c.L.ground((t) => t.bumps(w, amp, n));
  },

  /** Ramp + gap + landing at (almost) the same height. */
  jump(c: Ctx, size: JumpSize = 'M', opts: { recover?: boolean; landing?: number } = {}) {
    const j = JUMPS[size];
    c.L.ground((t) => {
      t.flat(10 * c.gs).launch(j.w, j.h).gap(j.gap * c.gs, j.drop * c.gs).flat(opts.landing ?? 16);
      if (opts.recover && j.drop) t.ease(26, -j.drop * c.gs);
    });
  },

  /** Steep descent then flat. Good for speed. */
  downhill(c: Ctx, drop = 8, w = 50) {
    c.L.ground((t) => t.ease(8, -0.5).slope(w, -drop).ease(10, -0.5).flat(16));
  },

  uphill(c: Ctx, rise = 8, w = 44) {
    c.L.ground((t) => t.flat(14).slope(w, rise).flat(14));
  },

  /** Down into a valley and up the far side (net zero). */
  valley(c: Ctx, depth = 8, w = 30, floor = 14) {
    c.L.ground((t) => t.ease(w, -depth).flat(floor).ease(w, depth));
  },

  cp(c: Ctx) {
    checkpoint(c);
  },

  // ----------------------------------------------------------------------- surfaces
  ice: (c: Ctx, w = 50) => flat(c, w, 'ice'),
  snowGround: (c: Ctx, w = 40) => flat(c, w, 'snow'),
  iceSlope(c: Ctx, drop = 6, w = 44) {
    c.L.ground((t) => t.flat(4).slope(w, -drop).flat(18), 'ice');
    c.L.ground((t) => t.ease(26, drop).flat(10));
  },

  zone(c: Ctx, kind: 'sand' | 'snow' | 'goo', w = 36, lead = 12) {
    flat(c, lead);
    const x0 = here(c);
    flat(c, w);
    c.L.zone(kind, x0, x0 + w, { h: 8 });
    flat(c, 24); // run-up to get back to speed before anything else
  },

  conveyor(c: Ctx, w = 24, speed = 6) {
    flat(c, 14);
    const x0 = here(c);
    flat(c, w);
    c.L.push({ type: 'conveyor', x: x0, y: gy(c), w, speed });
    flat(c, 10);
  },

  boost(c: Ctx, w = 22) {
    flat(c, 14);
    const x0 = here(c);
    flat(c, w);
    c.L.zone('boost', x0, x0 + w, { angle: 0 });
    flat(c, 10);
  },

  bounce(c: Ctx, o: { vent?: boolean; power?: number; over?: JumpSize } = {}) {
    flat(c, 16);
    const x = here(c);
    flat(c, 4);
    c.L.push({ type: 'bounce', x: x + 2, y: gy(c), w: o.vent ? 3.4 : 4, power: o.power ?? (o.vent ? 21 : 23), vent: o.vent });
    flat(c, Math.round(50 * c.gs)); // the launch carries ~30 m: make sure there is road to land on
  },

  // ----------------------------------------------------------------------- crushers
  /** Row of ceiling pistons, phase-synced to a ~16 m/s car so ONE well-timed run clears the whole row. */
  crushers(c: Ctx, n = 3, o: { period?: number; spacing?: number; jitter?: number; ceil?: boolean; w?: number } = {}) {
    gate(c);
    const period = o.period ?? 4.4;
    const spacing = o.spacing ?? 22;
    flat(c, 32);
    const x0 = here(c);
    flat(c, spacing * n + 8);
    const y = gy(c);
    if (o.ceil !== false) c.L.ceiling(x0 - 4, x0 + spacing * n + 8, y + 8.2);
    for (let i = 0; i < n; i++) {
      const ph = sync(i, spacing, period);
      c.L.push({ type: 'crusher', x: x0 + 4 + i * spacing, y: y + 7.4, stroke: 6.4, period, phase: ph + (o.jitter ?? 0) * Math.sin(i * 2.1), w: o.w ?? 3.4 });
    }
    flat(c, 12);
  },

  /** Piston from the side (a sliding gate). */
  sideCrusher(c: Ctx, o: { period?: number; side?: 'left' | 'right' } = {}) {
    gate(c);
    flat(c, 20);
    const x = here(c);
    flat(c, 18);
    const y = gy(c);
    c.L.push({ type: 'crusher', x: x + 8, y: y + 1.5, dir: o.side ?? 'left', stroke: 6, period: o.period ?? 4.6, w: 3 });
    // housing wall on the far side
    flat(c, 8);
  },

  // ----------------------------------------------------------------------- lasers
  laser(c: Ctx, mode: 'pulse' | 'sweep' | 'spin', o: { period?: number; on?: number; amp?: number; n?: number; spacing?: number } = {}) {
    gate(c);
    const n = o.n ?? 1;
    const spacing = o.spacing ?? 22;
    flat(c, 32);
    const x0 = here(c);
    flat(c, spacing * n + 8);
    const y = gy(c);
    const period = o.period ?? (mode === 'pulse' ? 3.2 : 4.4);
    for (let i = 0; i < n; i++) {
      const ph = sync(i, spacing, period);
      c.L.push({ type: 'laser', x: x0 + 6 + i * spacing, y: y + 7.5, angle: -Math.PI / 2, mode, period, phase: ph, ...(mode === 'pulse' ? { on: o.on ?? 0.4 } : mode === 'sweep' ? { amp: o.amp ?? 0.7 } : { range: 14 }) });
    }
    flat(c, 12);
  },

  /** Always-on beam that a floor switch turns off. */
  switchLaser(c: Ctx, o: { n?: number } = {}) {
    gate(c);
    const id = `s${c.sw++}`;
    flat(c, 20);
    c.L.push({ type: 'switch', id, x: here(c) - 4, y: gy(c) });
    flat(c, 24);
    const y = gy(c);
    for (let i = 0; i < (o.n ?? 1); i++) c.L.push({ type: 'laser', x: here(c) - 12 + i * 8, y: y + 7.5, angle: -Math.PI / 2, mode: 'static', ctrl: id });
    flat(c, 14);
  },

  /** Beam fired along the ceiling, bounced down by a mirror; a switch kills it. */
  mirrorLaser(c: Ctx) {
    gate(c);
    const id = `s${c.sw++}`;
    flat(c, 20);
    c.L.push({ type: 'switch', id, x: here(c) - 4, y: gy(c) });
    flat(c, 12);
    const x = here(c);
    flat(c, 26);
    const y = gy(c);
    c.L.push({ type: 'laser', x: x - 6, y: y + 6.5, angle: 0, mode: 'static', ctrl: id });
    c.L.push({ type: 'mirror', x: x + 14, y: y + 6.5, w: 3, angle: -Math.PI / 4 });
    flat(c, 12);
  },

  turret(c: Ctx) {
    gate(c);
    flat(c, 22);
    const x = here(c);
    flat(c, 50);
    c.L.push({ type: 'laser', x: x + 10, y: gy(c) + 9, angle: -Math.PI / 2, mode: 'track', range: 22 });
    flat(c, 10);
  },

  /** Door that a switch opens (or a rhythm door). */
  door(c: Ctx, o: { rhythm?: boolean } = {}) {
    gate(c);
    flat(c, 18);
    let id: string | undefined;
    if (!o.rhythm) {
      id = `s${c.sw++}`;
      c.L.push({ type: 'switch', id, x: here(c) - 4, y: gy(c) });
    }
    flat(c, 22);
    c.L.push({ type: 'door', x: here(c) - 6, y: gy(c), h: 6, ...(o.rhythm ? { period: 5.2, open: 0.55 } : { ctrl: id }) });
    flat(c, 14);
  },

  // ----------------------------------------------------------------------- sharp things
  /** Ramp over a spike bed. */
  spikes(c: Ctx, w = 5) {
    flat(c, 10);
    c.L.ground((t) => t.launch(8, 1.8).slope(0.2, -1.8));
    const x = here(c);
    flat(c, w + 14);
    c.L.push({ type: 'spikes', x: x + 0.4, y: gy(c), w });
  },

  /** Vertical saw on a rail: low = blocks the road, high = clear (rhythm like a crusher). */
  saw(c: Ctx, n = 1, o: { period?: number; spacing?: number } = {}) {
    gate(c);
    const period = o.period ?? 3.6;
    const spacing = o.spacing ?? 20;
    flat(c, 32);
    const x0 = here(c);
    flat(c, spacing * n + 8);
    const y = gy(c);
    for (let i = 0; i < n; i++) {
      const ph = sync(i, spacing, period);
      c.L.push({ type: 'saw', x: x0 + 6 + i * spacing, y: y + 1.5, r: 1.3, x2: x0 + 6 + i * spacing, y2: y + 8.4, period, phase: ph });
    }
    flat(c, 12);
  },

  swing(c: Ctx, n = 1, o: { len?: number; amp?: number; period?: number; spacing?: number } = {}) {
    gate(c);
    flat(c, 32);
    const x0 = here(c);
    const sp = o.spacing ?? 26;
    flat(c, sp * n + 6);
    const y = gy(c);
    const len = o.len ?? 10;
    for (let i = 0; i < n; i++) c.L.push({ type: 'swing', x: x0 + 8 + i * sp, y: y + len + 1.4, len, amp: o.amp ?? 0.85, period: o.period ?? 4, phase: (i * 0.25) % 1, kind: 'ball' });
    flat(c, 12);
  },

  /** Big half-buried cogs: a gentle rotating hump with small teeth. */
  gears(c: Ctx, n = 2) {
    flat(c, 16);
    const x0 = here(c);
    flat(c, n * 15 + 6);
    for (let i = 0; i < n; i++) c.L.push({ type: 'gear', x: x0 + 9 + i * 15, y: gy(c) - 3 + 0.5, r: 3, speed: (i % 2 ? -1 : 1) * 1.4, teeth: 12 });
    flat(c, 10);
  },

  /** Moving platform across a pit. */
  platformGap(c: Ctx, gap = 24, period = 7) {
    gate(c);
    flat(c, 14);
    const x0 = here(c);
    c.L.ground((t) => t.gap(gap).flat(24));
    c.L.push({ type: 'platform', x: x0 + 5, y: gy(c) - 0.3, w: 9, x2: x0 + gap - 5, y2: gy(c) - 0.3, period });
  },

  tiltGap(c: Ctx, gap = 14) {
    gate(c);
    flat(c, 14);
    const x0 = here(c);
    c.L.ground((t) => t.gap(gap).flat(24));
    c.L.push({ type: 'tilt', x: x0 + gap / 2, y: gy(c) - 0.2, w: gap - 1, amp: 0.12, period: 5 });
  },

  // ----------------------------------------------------------------------- breakables
  crumbles(c: Ctx, n = 4, delay = 0.45) {
    gate(c);
    flat(c, 14);
    const x0 = here(c);
    const bw = 6;
    const total = n * (bw + 0.5);
    c.L.ground((t) => t.gap(total + 1).flat(20));
    for (let i = 0; i < n; i++) c.L.push({ type: 'crumble', x: x0 + 0.5 + i * (bw + 0.5), y: gy(c), w: bw, h: 0.7, delay });
  },

  bridge(c: Ctx, w = 24, delay = 0.5) {
    gate(c);
    flat(c, 14);
    const x0 = here(c);
    c.L.ground((t) => t.gap(w).flat(22));
    c.L.push({ type: 'bridge', x: x0, y: gy(c), w, delay });
  },

  /** Cave with falling icicles / rocks / signs (each warns with a ground ring). */
  fallers(c: Ctx, kinds: Array<'icicle' | 'rock' | 'sign'>, spacing = 22) {
    gate(c);
    flat(c, 18);
    const x0 = here(c);
    flat(c, kinds.length * spacing + 14);
    const y = gy(c);
    c.L.ceiling(x0 - 2, x0 + kinds.length * spacing + 14, y + 10.4);
    kinds.forEach((k, i) => c.L.push({ type: 'falling', kind: k, x: x0 + 16 + i * spacing, y: y + (k === 'sign' ? 8.8 : 9.3), lead: 20 }));
    flat(c, 8);
  },

  tnt(c: Ctx, n = 1) {
    gate(c);
    flat(c, 24);
    for (let i = 0; i < n; i++) {
      c.L.push({ type: 'tnt', x: here(c) + 2, y: gy(c) });
      flat(c, 24);
    }
  },

  /** Single crates spread along the road (the car shoves them along; stacks would be a wall). */
  crates(c: Ctx, n = 2, style: 'wood' | 'metal' = 'wood') {
    flat(c, 22);
    const x = here(c);
    flat(c, n * 28 + 10);
    for (let i = 0; i < n; i++) c.L.push({ type: 'crate', x: x + 4 + i * 28, y: gy(c), size: 1.3, style });
    flat(c, 24);
  },

  dominoes(c: Ctx, n = 7) {
    flat(c, 22);
    c.L.push({ type: 'dominoes', x: here(c), y: gy(c), n, spacing: 1.2 });
    flat(c, 24);
  },

  /**
   * Boulder chase: a rock perched on a stone arch drops behind you once you pass under it and rolls down the
   * slope after you. Keep your speed up (sand, stalls and crumble delays are what get you).
   */
  boulder(c: Ctx) {
    gate(c);
    flat(c, 20);
    const x0 = here(c);
    const y0 = gy(c);
    c.L.ground((t) => t.flat(14).slope(38, -7).flat(34).ease(30, 7).flat(10));
    c.L.ceiling(x0 + 1, x0 + 8, y0 + 4.6, 2.4);
    c.L.push({ type: 'boulder', x: x0 + 4.5, y: y0 + 7, r: 1.6, trigger: x0 + 13 });
  },

  // ----------------------------------------------------------------------- forces
  wind(c: Ctx, w = 40, strength = 12, against = true) {
    flat(c, 14);
    const x0 = here(c);
    flat(c, w);
    c.L.zone('wind', x0, x0 + w, { angle: against ? Math.PI : 0, strength, h: 14 });
    flat(c, 10);
  },

  /** Wind gust across a jump: tailwind helps, headwind shortens it. */
  windJump(c: Ctx, size: JumpSize = 'M', strength = 8) {
    const x0 = here(c) + 10;
    K.jump(c, size);
    c.L.zone('wind', x0, x0 + JUMPS[size].w + JUMPS[size].gap + 8, { angle: 0, strength, h: 30, y: gy(c) - 6 });
  },

  /** Long jump through a low-gravity bubble. */
  lowgravJump(c: Ctx, gap = 13) {
    flat(c, 16);
    const x0 = here(c);
    const g = gap * c.gs;
    c.L.ground((t) => t.launch(10, 2.4).gap(g).flat(30 * c.gs));
    c.L.zone('lowgrav', x0, x0 + 10 + g + 14, { h: 60, y: gy(c) - 4, strength: 0.32 });
  },

  magnetPull(c: Ctx, gap = 14, mode: 'above' | 'below' = 'above') {
    flat(c, 16);
    const x0 = here(c);
    c.L.ground((t) => t.launch(8, 1.8).gap(gap).flat(24));
    if (mode === 'above') c.L.push({ type: 'zone', kind: 'magnet', x: x0 + 8 + gap / 2, y: gy(c) + 6, w: 15, strength: 55 });
    else c.L.push({ type: 'zone', kind: 'magnet', x: x0 + 8 + gap / 2, y: gy(c) - 5, w: 15, strength: -55 });
  },

  vacuum(c: Ctx, w = 34) {
    flat(c, 14);
    const x0 = here(c);
    flat(c, w);
    c.L.zone('vacuum', x0, x0 + w, { angle: 0, h: 6, y: gy(c) - 1 });
    flat(c, 10);
  },

  cannonGap(c: Ctx, gap = 32) {
    flat(c, 16);
    const x0 = here(c);
    c.L.ground((t) => t.flat(6).gap(gap).flat(30));
    c.L.push({ type: 'cannon', x: x0 + 3, y: gy(c) + 1.2, angle: 0.62, power: 31 });
  },

  oneway(c: Ctx, w = 20) {
    flat(c, 20);
    const x = here(c);
    flat(c, w + 10);
    c.L.push({ type: 'oneway', x, y: gy(c) + 5, w });
  },

  /** Size-change / vehicle-swap pad. `vehicle: 'garage'` hands back the player's own vehicle. */
  transform(c: Ctx, scale: number, vehicle?: VehicleId | 'garage') {
    flat(c, 18);
    c.L.push({ type: 'transform', x: here(c), y: gy(c), scale, h: 8, ...(vehicle ? { vehicle } : {}) });
    flat(c, 24);
  },

  /**
   * Gravity-flip room: inside the field gravity points UP, so the car falls to the ceiling. Rotate it 180° with
   * air tilt and drive along the ceiling; leaving the field drops you back down (rotate again!). Needs a human.
   */
  flipRoom(c: Ctx, w = 46) {
    flat(c, 24);
    const x0 = here(c);
    flat(c, w + 40);
    const y = gy(c);
    c.L.ceiling(x0 - 4, x0 + w + 40, y + 26, 8);
    c.L.zone('flipgrav', x0, x0 + w, { h: 60, y: y - 1 });
  },

  /** Low ceiling over a stretch of road (dark mines, caves). */
  tunnel(c: Ctx, w = 60, h = 7) {
    flat(c, 10);
    const x0 = here(c);
    flat(c, w);
    c.L.ceiling(x0 - 4, x0 + w + 4, gy(c) + h, 6);
  },

  // ----------------------------------------------------------------------- lava
  /** Collapsing rock bridge over a lava lake. */
  lavaBridge(c: Ctx, w = 26, delay = 0.5) {
    gate(c);
    flat(c, 14);
    const x0 = here(c);
    c.L.ground((t) => t.gap(w).flat(22));
    c.L.push({ type: 'bridge', x: x0, y: gy(c), w, delay });
    c.L.push({ type: 'lava', x: x0, y: gy(c) - 3.2, w, h: 12 });
  },

  lavaPit(c: Ctx, size: JumpSize = 'M') {
    flat(c, 14);
    const j = JUMPS[size];
    const x0 = here(c) + 10 * c.gs + j.w;
    const yLand = gy(c) + j.drop * c.gs;
    c.L.ground((t) => t.flat(10 * c.gs).launch(j.w, j.h).gap(j.gap * c.gs, j.drop * c.gs).flat(18));
    c.L.push({ type: 'lava', x: x0, y: yLand - 1.2, w: j.gap * c.gs });
    // recover any drop so levels stay roughly level
    if (j.drop) c.L.ground((t) => t.ease(26, -j.drop * c.gs));
  },

  geyser(c: Ctx, n = 1, period = 4.4) {
    gate(c);
    flat(c, 20);
    const x0 = here(c);
    flat(c, n * 24 + 6);
    for (let i = 0; i < n; i++) c.L.push({ type: 'geyser', x: x0 + 10 + i * 24, y: gy(c), w: 3.6, period, phase: sync(i, 24, period), height: 11 });
    flat(c, 10);
  },

  /** Valley that floods once you enter it: drive through before the lava tops the floor. */
  floodValley(c: Ctx, depth = 9, rise = 1.15) {
    gate(c);
    flat(c, 14);
    const x0 = here(c);
    const w = 34;
    c.L.ground((t) => t.ease(w, -depth).flat(10).ease(w, depth));
    c.L.push({ type: 'lava', x: x0 + 4, y: gy(c) - depth - 3, w: w * 2 + 12, rise, maxY: gy(c) + 0.5, trigger: x0 + 6 });
    flat(c, 12);
  },

  lavaPoolRun(c: Ctx, w = 30) {
    flat(c, 14);
    const x0 = here(c);
    c.L.ground((t) => t.ease(10, -1.6).flat(w).ease(10, 1.6));
    c.L.push({ type: 'lava', x: x0 + 10, y: gy(c) - 2.4, w, h: 6 });
    // a stone causeway of crumble blocks above the lava gives a safe-ish (timed) route
    flat(c, 12);
  },
};

// ------------------------------------------------------------------------------------------
// Level assembly
// ------------------------------------------------------------------------------------------

export interface LevelSpec {
  id: number;
  name: string;
  world: number;
  hint?: string;
  deco: DecoKind[];
  /** What's hidden behind the spawn point. */
  hidden?: 'flat' | 'hill' | 'dip';
  antiFlip?: number;
  dark?: boolean;
  gravity?: number;
  boost?: boolean;
  manual?: boolean;
  /** Force this vehicle for the whole level. */
  vehicle?: VehicleId;
  /** Level body; the start pad and finish are added around it. */
  body: (c: Ctx) => void;
}

/** Build one level from a spec: start pad (with hidden-star alcove) → body → finish. */
export function makeLevel(s: LevelSpec): LevelData {
  const meta: LevelMeta = {
    id: s.id,
    name: s.name,
    world: s.world,
    parTime: 30,
    antiFlip: s.antiFlip ?? 0.9,
    hint: s.hint,
    dark: s.dark,
    gravity: s.gravity,
    boost: s.boost,
    manual: s.manual,
    vehicle: s.vehicle,
  };
  const L = new LevelBuilder(meta);
  const c: Ctx = { L, id: s.id, sw: 0, world: s.world, gs: s.gravity ? 26 / Math.abs(s.gravity) : 1, since: 0, lastCpX: -1e9 };
  let hiddenXY: [number, number];
  switch (s.hidden ?? 'flat') {
    case 'hill':
      L.cursor = { x: -44, y: 3 };
      L.ground((t) => t.flat(8).ease(14, -3).flat(30));
      hiddenXY = [-41, 4.5];
      break;
    case 'dip':
      L.cursor = { x: -44, y: 0 };
      L.ground((t) => t.flat(4).ease(8, -3).flat(8).ease(8, 3).flat(22));
      hiddenXY = [-30, -1.7];
      break;
    default:
      L.cursor = { x: -30, y: 0 };
      L.ground((t) => t.flat(50));
      hiddenXY = [-26, 1.3];
  }
  const startX = -12;
  s.body(c);
  flat(c, 30);
  L.finishAt(L.cursor.x - 12);
  L.spawnAt(startX);
  const len = L.cursor.x - 12 - startX;
  // stars 0/1: x only — gen-levels snaps y onto the bot's proven line (0 = on it, 1 = lifted off it)
  // (manual levels keep these positions, so put them a sensible height above the ground)
  const above = (x: number) => {
    try {
      return L.y(x) + 2.6;
    } catch {
      return 3.5; // over a gap
    }
  };
  const xa = startX + len * 0.34;
  const xb = startX + len * 0.72;
  L.starAt(xa, 0, above(xa)).starAt(xb, 0, above(xb) + 1);
  L.starAt(hiddenXY[0], 0, hiddenXY[1]);
  L.scatter(s.deco, -46, L.cursor.x, 10);
  return L.build();
}
