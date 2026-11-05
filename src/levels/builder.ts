import type { EntityData, LevelData, SurfaceType, DecoKind, ZoneKind } from './types';
import type { VehicleId } from '../config';

/**
 * Level builder helpers. Levels are pure data; these helpers just make authoring terrain
 * profiles quick and consistent.
 */
export type Pt = [number, number];

/** Cursor-style terrain profile builder. Produces one or more surface polylines (gaps split them). */
export class Terrain {
  private lines: Pt[][] = [];
  private cur: Pt[];
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.cur = [[x, y]];
  }

  private push(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.cur.push([round(x), round(y)]);
    return this;
  }

  /** Flat run of width w. */
  flat(w: number): this {
    return this.push(this.x + w, this.y);
  }

  /** Straight slope: advance w, change height by dy. */
  slope(w: number, dy: number): this {
    return this.push(this.x + w, this.y + dy);
  }

  /** Smooth S-curve rise/fall (cosine ease), good for rolling hills and launch lips. */
  ease(w: number, dy: number, steps = Math.max(4, Math.round(w / 1.5))): this {
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.push(x0 + w * t, y0 + dy * (0.5 - 0.5 * Math.cos(Math.PI * t)));
    }
    return this;
  }

  /** Curved launch ramp: starts flat, steepens (quadratic). */
  launch(w: number, dy: number, steps = Math.max(5, Math.round(w / 1.2))): this {
    const x0 = this.x;
    const y0 = this.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.push(x0 + w * t, y0 + dy * t * t);
    }
    return this;
  }

  /** Rounded bumps rising `amp` above the base height; ends back at the start height. */
  bumps(w: number, amp: number, count: number, stepsPerBump = 6): this {
    const x0 = this.x;
    const y0 = this.y;
    const steps = count * stepsPerBump;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.push(x0 + w * t, y0 + amp * (0.5 - 0.5 * Math.cos(t * count * Math.PI * 2)));
    }
    return this;
  }

  /** Break the surface: a gap of width w (optionally landing at a different height). */
  gap(w: number, dy = 0): this {
    this.lines.push(this.cur);
    const nx = this.x + w;
    const ny = this.y + dy;
    this.cur = [[round(nx), round(ny)]];
    this.x = nx;
    this.y = ny;
    return this;
  }

  /** Finish and return every surface polyline (each with at least 2 points). */
  build(): Pt[][] {
    const all = [...this.lines, this.cur].filter((l) => l.length >= 2);
    return all;
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------------------------
// Level assembly
// ---------------------------------------------------------------------------------------------

/** Surface height at x across polylines (null where there is a gap). */
export function surfaceY(lines: ReadonlyArray<ReadonlyArray<Pt>>, x: number): number | null {
  let best: number | null = null;
  for (const l of lines) {
    if (x < l[0][0] || x > l[l.length - 1][0]) continue;
    for (let i = 1; i < l.length; i++) {
      if (x <= l[i][0]) {
        const [x0, y0] = l[i - 1];
        const [x1, y1] = l[i];
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        const y = y0 + (y1 - y0) * t;
        if (best === null || y > best) best = y;
        break;
      }
    }
  }
  return best;
}

export interface LevelMeta {
  id: number;
  name: string;
  world: number;
  parTime: number;
  vehicle?: VehicleId;
  gravity?: number;
  antiFlip?: number;
  boost?: boolean;
  dark?: boolean;
  hint?: string;
}

/**
 * Fluent level assembler. Typical use:
 *
 *   const L = new LevelBuilder({ id: 3, name: 'Little Hops', world: 1, parTime: 28 });
 *   L.ground((t) => t.flat(40).launch(8, 2).gap(5).flat(30));
 *   L.spawnAt(-30).checkpointAt(120).starAt(60, 3).finishAt(250);
 *   export default L.build();
 */
export class LevelBuilder {
  private lines: Pt[][] = [];
  private ents: EntityData[] = [];
  private cps: Array<[number, number]> = [];
  private starList: Array<[number, number]> = [];
  private spawn: [number, number] = [0, 0];
  private fin: [number, number] = [0, 0];
  /** Where the next `ground()` call starts. */
  cursor: { x: number; y: number } = { x: 0, y: 0 };

  constructor(private meta: LevelMeta) {}

  /** Add terrain. The callback receives a Terrain cursor starting where the last ground ended. */
  ground(fn: (t: Terrain) => void, surface: SurfaceType = 'grass', depth = 14): this {
    const t = new Terrain(this.cursor.x, this.cursor.y);
    fn(t);
    const built = t.build();
    for (let k = 0; k < built.length; k++) {
      const l = built[k];
      const last = this.lines[this.lines.length - 1];
      const lastEnt = this.ents.findLast((e) => e.type === 'terrain');
      const joins =
        k === 0 &&
        last &&
        lastEnt?.type === 'terrain' &&
        lastEnt.surface === surface &&
        last[last.length - 1][0] === l[0][0] &&
        last[last.length - 1][1] === l[0][1];
      if (joins && lastEnt?.type === 'terrain') {
        // Contiguous with the previous segment: extend it (no seam, no ghost collisions at the joint).
        for (let i = 1; i < l.length; i++) {
          last.push(l[i]);
        }
        lastEnt.points = last;
      } else {
        this.lines.push(l);
        this.ents.push({ type: 'terrain', points: l, depth, surface });
      }
    }
    this.cursor = { x: t.x, y: t.y };
    return this;
  }

  /** Height of the driving surface at x. */
  y(x: number): number {
    const y = surfaceY(this.lines, x);
    if (y === null) throw new Error(`level ${this.meta.id}: no ground at x=${x}`);
    return y;
  }

  spawnAt(x: number): this {
    this.spawn = [x, this.y(x) + 1.3];
    return this;
  }

  checkpointAt(x: number): this {
    this.cps.push([x, this.y(x)]);
    return this;
  }

  /** Star at height `dy` above the surface at x (or absolute y when `abs` is given). */
  starAt(x: number, dy: number, abs?: number): this {
    this.starList.push([x, abs ?? this.y(x) + dy]);
    return this;
  }

  finishAt(x: number): this {
    this.fin = [x, this.y(x)];
    return this;
  }

  /**
   * Teeter-totter centred on x over (flat) ground. It rests tilted with the entry end down, so
   * driving on is a ramp; it tips as you cross the middle and lands the far end flush on the ground.
   */
  seesaw(x: number, width = 12, maxAngle = 0.36): this {
    const y0 = this.y(x - width / 2);
    const y1 = this.y(x + width / 2);
    if (Math.abs(y0 - y1) > 0.3) throw new Error(`level ${this.meta.id}: seesaw at ${x} needs flat ground`);
    this.ents.push({ type: 'seesaw', x, y: (y0 + y1) / 2, width, maxAngle });
    return this;
  }

  deco(kind: DecoKind, x: number, z = -6, scale = 1, text?: string): this {
    const y = surfaceY(this.lines, x);
    if (y === null) return this;
    this.ents.push({ type: 'deco', kind, x, y, z, scale, ...(text ? { text } : {}) });
    return this;
  }

  sign(x: number, text: string): this {
    return this.deco('sign', x, -2.6, 1, text);
  }

  /** Scatter scenery along [x0,x1] with a seeded RNG so levels are stable between builds. */
  scatter(kinds: DecoKind[], x0: number, x1: number, every: number, seed = this.meta.id): this {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let x = x0; x < x1; x += every * (0.6 + rnd() * 0.8)) {
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      this.deco(kind, x, -(5 + rnd() * 26), 0.8 + rnd() * 0.7);
    }
    return this;
  }

  /** Zone resting on the ground between x0 and x1 (sand, goo, boost, wind, gravity...). */
  zone(kind: ZoneKind, x0: number, x1: number, opts: { h?: number; strength?: number; angle?: number; y?: number } = {}): this {
    const y = opts.y ?? this.y(x0) - 1;
    this.ents.push({ type: 'zone', kind, x: x0, y, w: x1 - x0, h: opts.h ?? 8, ...(opts.strength !== undefined ? { strength: opts.strength } : {}), ...(opts.angle !== undefined ? { angle: opts.angle } : {}) });
    return this;
  }

  /** Flat rock ceiling between x0 and x1 at height y (tunnels, cave roofs). */
  ceiling(x0: number, x1: number, y: number, thickness = 8): this {
    this.ents.push({ type: 'ceiling', points: [[x0, y], [x1, y]], thickness });
    return this;
  }

  push(e: EntityData): this {
    this.ents.push(e);
    return this;
  }

  build(): LevelData {
    const xs = this.lines.flatMap((l) => l.map((p) => p[0]));
    const ys = this.lines.flatMap((l) => l.map((p) => p[1]));
    const m = this.meta;
    return {
      id: m.id,
      name: m.name,
      world: m.world,
      vehicle: m.vehicle ?? 'hatch',
      ...(m.gravity !== undefined ? { gravity: m.gravity } : {}),
      ...(m.antiFlip !== undefined ? { antiFlip: m.antiFlip } : {}),
      ...(m.boost ? { boost: true } : {}),
      ...(m.dark ? { dark: true } : {}),
      cameraBounds: {
        minX: Math.min(...xs) - 4,
        maxX: Math.max(...xs) + 12,
        minY: Math.min(...ys) - 30,
        maxY: Math.max(...ys) + 40,
      },
      spawn: this.spawn,
      checkpoints: this.cps,
      entities: this.ents,
      stars: this.starList,
      finish: this.fin,
      parTime: m.parTime,
      ...(m.hint ? { hint: m.hint } : {}),
    };
  }
}
