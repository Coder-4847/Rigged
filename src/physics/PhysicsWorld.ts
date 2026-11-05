import { World, Vec2, Chain, Contact, ContactImpulse, Body } from 'planck';
import { CONFIG } from '../config';

/** Collision categories. */
export const Cat = {
  TERRAIN: 0x0001,
  CAR: 0x0002,
  DEBRIS: 0x0004,
  PROP: 0x0008,
} as const;

export type FixtureKind =
  | 'terrain'
  | 'platform'
  | 'prop'
  | 'wheel'
  | 'chassis'
  | 'roof'
  | 'deadly'
  | 'debris';

/** Attached to every fixture as userData; contact listeners route on it. */
export interface FixtureTag {
  kind: FixtureKind;
  /** Object that wants contact callbacks for this fixture. */
  owner?: ContactOwner;
  /** Free index (wheel 0/1 etc.). */
  index?: number;
  /** Surface type for friction/sfx ("grass", "ice"...). */
  surface?: string;
}

export interface ContactOwner {
  onBegin?(self: FixtureTag, other: FixtureTag, contact: Contact): void;
  onEnd?(self: FixtureTag, other: FixtureTag, contact: Contact): void;
  onImpact?(self: FixtureTag, other: FixtureTag, normalImpulse: number, contact: Contact): void;
  /** May disable the contact or set a tangent speed (one-way platforms, conveyors). */
  onPreSolve?(self: FixtureTag, other: FixtureTag, contact: Contact): void;
}

/** Terrain friction by surface type (mixed with the wheel's own grip by Box2D). */
export const SURFACE_FRICTION: Record<string, number> = {
  grass: 1,
  sand: 0.9,
  snow: 0.7,
  ice: 0.035,
  metal: 0.9,
  rock: 1,
  goo: 1.4,
};

/** True for fixtures that physically support/obstruct the car. */
export function isSolid(tag: FixtureTag | undefined): boolean {
  return !!tag && (tag.kind === 'terrain' || tag.kind === 'platform' || tag.kind === 'prop');
}

/** Body wrapper that remembers last-step transform so rendering can interpolate. */
export class Tracked {
  px: number;
  py: number;
  pa: number;
  constructor(public body: Body) {
    const p = body.getPosition();
    this.px = p.x;
    this.py = p.y;
    this.pa = body.getAngle();
  }
  snapshot(): void {
    const p = this.body.getPosition();
    this.px = p.x;
    this.py = p.y;
    this.pa = this.body.getAngle();
  }
  /** Interpolated transform for rendering. */
  at(alpha: number, out: { x: number; y: number; a: number }): void {
    const p = this.body.getPosition();
    out.x = this.px + (p.x - this.px) * alpha;
    out.y = this.py + (p.y - this.py) * alpha;
    out.a = this.pa + (this.body.getAngle() - this.pa) * alpha;
  }
}

/**
 * Thin wrapper around the planck World: fixed stepping, contact routing,
 * and snapshot tracking for render interpolation.
 */
export class PhysicsWorld {
  readonly world: World;
  private tracked = new Set<Tracked>();
  /** Total simulated time. */
  time = 0;
  /** Y above which a car is considered lost (matters for flipped-gravity zones). */
  ceilingY = 400;

  constructor(gravity = CONFIG.physics.gravity) {
    this.world = new World({ gravity: new Vec2(0, gravity) });
    this.world.on('begin-contact', (c) => this.route(c, 'onBegin'));
    this.world.on('end-contact', (c) => this.route(c, 'onEnd'));
    this.world.on('post-solve', (c, imp) => this.routeImpact(c, imp));
    this.world.on('pre-solve', (c) => this.routePre(c));
  }

  setGravity(g: number): void {
    this.world.setGravity(new Vec2(0, g));
  }

  track(body: Body): Tracked {
    const t = new Tracked(body);
    this.tracked.add(t);
    return t;
  }

  untrack(t: Tracked): void {
    this.tracked.delete(t);
  }

  step(dt: number): void {
    for (const t of this.tracked) t.snapshot();
    this.world.step(dt, CONFIG.physics.velocityIterations, CONFIG.physics.positionIterations);
    this.time += dt;
  }

  /**
   * Static solid terrain from a surface polyline. The collider is a closed loop (surface +
   * floor) so ghost collisions at vertices are handled and the inside is consistently solid.
   */
  addTerrain(points: ReadonlyArray<readonly [number, number]>, depth: number, surface = 'grass'): Body {
    const body = this.world.createBody({ type: 'static' });
    const verts = points.map(([x, y]) => new Vec2(x, y));
    const first = points[0];
    const last = points[points.length - 1];
    const floorY = Math.min(...points.map((p) => p[1])) - depth;
    verts.push(new Vec2(last[0], floorY), new Vec2(first[0], floorY));
    body.createFixture({
      shape: new Chain(verts, true),
      friction: SURFACE_FRICTION[surface] ?? 1,
      restitution: 0,
      filterCategoryBits: Cat.TERRAIN,
      filterMaskBits: Cat.CAR | Cat.DEBRIS | Cat.PROP,
      userData: { kind: 'terrain', surface } satisfies FixtureTag,
    });
    return body;
  }

  /** Hanging ceiling slab: `points` is the lower (visible) edge, extruded upward by `thickness`. */
  addCeiling(points: ReadonlyArray<readonly [number, number]>, thickness: number): Body {
    const body = this.world.createBody({ type: 'static' });
    const verts = points.map(([x, y]) => new Vec2(x, y));
    const first = points[0];
    const last = points[points.length - 1];
    const topY = Math.max(...points.map((p) => p[1])) + thickness;
    verts.push(new Vec2(last[0], topY), new Vec2(first[0], topY));
    body.createFixture({
      shape: new Chain(verts, true),
      friction: 0.6,
      filterCategoryBits: Cat.TERRAIN,
      filterMaskBits: Cat.CAR | Cat.DEBRIS | Cat.PROP,
      userData: { kind: 'terrain', surface: 'rock' } satisfies FixtureTag,
    });
    return body;
  }

  private routePre(c: Contact): void {
    const a = c.getFixtureA().getUserData() as FixtureTag | undefined;
    const b = c.getFixtureB().getUserData() as FixtureTag | undefined;
    if (!a || !b) return;
    a.owner?.onPreSolve?.(a, b, c);
    b.owner?.onPreSolve?.(b, a, c);
  }

  private route(c: Contact, fn: 'onBegin' | 'onEnd'): void {
    const a = c.getFixtureA().getUserData() as FixtureTag | undefined;
    const b = c.getFixtureB().getUserData() as FixtureTag | undefined;
    if (!a || !b) return;
    a.owner?.[fn]?.(a, b, c);
    b.owner?.[fn]?.(b, a, c);
  }

  private routeImpact(c: Contact, imp: ContactImpulse): void {
    const a = c.getFixtureA().getUserData() as FixtureTag | undefined;
    const b = c.getFixtureB().getUserData() as FixtureTag | undefined;
    if (!a || !b) return;
    let n = 0;
    for (const v of imp.normalImpulses) n = Math.max(n, v);
    if (n <= 0) return;
    a.owner?.onImpact?.(a, b, n, c);
    b.owner?.onImpact?.(b, a, n, c);
  }
}
