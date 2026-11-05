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
