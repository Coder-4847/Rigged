import { Body, Box, Circle, Polygon, Vec2 } from 'planck';
import { Cat, FixtureTag, Tracked } from '../../physics/PhysicsWorld';
import type { EntityData } from '../../levels/types';
import { Behavior, LevelCtx, cycle, driveTo, wave } from './core';

type Ent<T extends EntityData['type']> = Extract<EntityData, { type: T }>;

const SOLID = { filterCategoryBits: Cat.PROP, filterMaskBits: Cat.CAR | Cat.PROP } as const;
const solidTag = (): FixtureTag => ({ kind: 'platform' });
const deadlyTag = (): FixtureTag => ({ kind: 'deadly' });

function kinematic(ctx: LevelCtx, x: number, y: number): { body: Body; tracked: Tracked } {
  const body = ctx.pw.world.createBody({ type: 'kinematic', position: new Vec2(x, y), allowSleep: false });
  return { body, tracked: ctx.pw.track(body) };
}

/** Platform that glides between two points (smooth ease, configurable period/phase). */
export class MovingPlatform implements Behavior {
  readonly type = 'platform';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly h: number;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'platform'>,
  ) {
    this.h = d.h ?? 0.5;
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, d.x, d.y));
    this.body.createFixture({ shape: new Box(d.w / 2, this.h / 2), friction: 1.2, ...SOLID, userData: solidTag() });
    this.place(0);
  }
  private place(dt: number): void {
    const k = wave(this.ctx.time + dt, this.d.period, this.d.phase);
    const x = this.d.x + (this.d.x2 - this.d.x) * k;
    const y = this.d.y + (this.d.y2 - this.d.y) * k;
    if (dt === 0) {
      this.body.setTransform(new Vec2(x, y), 0);
      this.tracked.snapshot();
    } else driveTo(this.body, x, y, 0, dt);
  }
  update(dt: number): void {
    this.place(dt);
  }
}

/** Rotating cog: solid body + teeth. */
export class Gear implements Behavior {
  readonly type = 'gear';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly teeth: number;
  constructor(
    ctx: LevelCtx,
    readonly d: Ent<'gear'>,
  ) {
    this.teeth = d.teeth ?? 8;
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, d.x, d.y));
    this.body.createFixture({ shape: new Circle(d.r), friction: 1.3, ...SOLID, userData: solidTag() });
    const tw = (Math.PI * d.r) / this.teeth * 0.55;
    for (let i = 0; i < this.teeth; i++) {
      const a = (i / this.teeth) * Math.PI * 2;
      this.body.createFixture({
        shape: new Box(0.14, tw, new Vec2(Math.cos(a) * (d.r + 0.08), Math.sin(a) * (d.r + 0.08)), a),
        friction: 1.3,
        ...SOLID,
        userData: solidTag(),
      });
    }
  }
  update(): void {
    // Angle is a pure function of time so it never drifts.
    this.body.setAngularVelocity(this.d.speed);
  }
}

/** Pendulum: swinging deadly wrecking ball, or a carriable swinging platform. */
export class Swing implements Behavior {
  readonly type = 'swing';
  readonly body: Body;
  readonly tracked: Tracked;
  angle = 0;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'swing'>,
  ) {
    const { x, y } = this.pos(0);
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, x, y));
    if ((d.kind ?? 'ball') === 'ball') {
      this.body.createFixture({ shape: new Circle(1.15), ...SOLID, userData: deadlyTag() });
    } else {
      this.body.createFixture({ shape: new Box(2.2, 0.2), friction: 1.2, ...SOLID, userData: solidTag() });
    }
    this.apply(0);
  }
  private theta(t: number): number {
    return this.d.amp * Math.sin(2 * Math.PI * (t / this.d.period + (this.d.phase ?? 0)));
  }
  pos(t: number): { x: number; y: number } {
    const th = this.theta(t);
    return { x: this.d.x + Math.sin(th) * this.d.len, y: this.d.y - Math.cos(th) * this.d.len };
  }
  private apply(dt: number): void {
    const t = this.ctx.time + dt;
    const { x, y } = this.pos(t);
    this.angle = this.theta(t);
    if (dt === 0) {
      this.body.setTransform(new Vec2(x, y), this.angle);
      this.tracked.snapshot();
    } else driveTo(this.body, x, y, this.angle, dt);
  }
  update(dt: number): void {
    this.apply(dt);
  }
}

/** Platform rocking about its centre. */
export class Tilt implements Behavior {
  readonly type = 'tilt';
  readonly body: Body;
  readonly tracked: Tracked;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'tilt'>,
  ) {
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, d.x, d.y));
    this.body.createFixture({ shape: new Box(d.w / 2, 0.22), friction: 1.4, ...SOLID, userData: solidTag() });
    this.body.setTransform(new Vec2(d.x, d.y), this.angleAt(0));
    this.tracked.snapshot();
  }
  private angleAt(t: number): number {
    return this.d.amp * Math.sin(2 * Math.PI * (t / this.d.period + (this.d.phase ?? 0)));
  }
  update(dt: number): void {
    driveTo(this.body, this.d.x, this.d.y, this.angleAt(this.ctx.time + dt), dt);
  }
}

/** Sliding door: rhythm-driven (period) or switch-controlled (ctrl). */
export class Door implements Behavior {
  readonly type = 'door';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly w: number;
  /** 0 closed .. 1 open. */
  amt = 0;
  /** True shortly before it closes (warning light). */
  warn = false;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'door'>,
  ) {
    this.w = d.w ?? 1.2;
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, d.x, d.y + d.h / 2));
    this.body.createFixture({ shape: new Box(this.w / 2, d.h / 2), friction: 0.6, ...SOLID, userData: solidTag() });
  }
  private wantOpen(): boolean {
    const d = this.d;
    if (d.ctrl) return !!this.ctx.switches.get(d.ctrl);
    if (!d.period) return false;
    const c = cycle(this.ctx.time, d.period, d.phase);
    const frac = d.open ?? 0.5;
    this.warn = c >= frac - 0.12 && c < frac;
    return c < frac;
  }
  update(dt: number): void {
    const target = this.wantOpen() ? 1 : 0;
    this.amt += Math.sign(target - this.amt) * Math.min(Math.abs(target - this.amt), dt * 2.8);
    driveTo(this.body, this.d.x, this.d.y + this.d.h / 2 + this.amt * (this.d.h + 0.3), 0, dt);
  }
  reset(): void {
    this.amt = 0;
  }
}

export type CrusherState = 'idle' | 'warn' | 'slam' | 'hold' | 'retract' | 'paused';

/**
 * Piston with a readable rhythm: idle → warn (shake + light + beeps) → slam → hold → retract.
 * The head is deadly; the housing is just scenery.
 */
export class Crusher implements Behavior {
  readonly type = 'crusher';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly dir: Vec2;
  state: CrusherState = 'idle';
  /** 0..1 telegraph intensity. */
  warn = 0;
  /** Extension in metres from the housing. */
  ext = 0;
  /** Random shake offset while warning. */
  shake = 0;
  readonly headHalf = 0.6;
  readonly width: number;
  private prevState: CrusherState = 'idle';
  private static SLAM = 0.09;
  private static HOLD = 0.45;
  private static RETRACT = 0.7;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'crusher'>,
  ) {
    const dir = d.dir ?? 'down';
    this.dir = new Vec2(dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'down' ? -1 : dir === 'up' ? 1 : 0);
    this.width = d.w ?? 3.2;
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, d.x, d.y));
    const vertical = this.dir.x === 0;
    this.body.createFixture({
      shape: vertical ? new Box(this.width / 2, this.headHalf) : new Box(this.headHalf, this.width / 2),
      friction: 0.5,
      ...SOLID,
      userData: deadlyTag(),
    });
    this.apply(0, 0);
  }

  private compute(t: number): void {
    const d = this.d;
    const tele = d.telegraph ?? 0.75;
    const active = Crusher.SLAM + Crusher.HOLD + Crusher.RETRACT + tele;
    const P = Math.max(d.period, active + 0.4);
    const u = cycle(t, P, d.phase) * P; // seconds into the cycle
    const idleEnd = P - active;
    this.warn = 0;
    this.shake = 0;
    if (d.ctrl && this.ctx.switches.get(d.ctrl)) {
      this.state = 'paused';
      this.ext = 0;
      return;
    }
    if (u < idleEnd) {
      this.state = 'idle';
      this.ext = 0;
    } else if (u < idleEnd + tele) {
      this.state = 'warn';
      this.warn = (u - idleEnd) / tele;
      this.ext = 0;
      this.shake = Math.sin(u * 95) * 0.09 * this.warn;
    } else if (u < idleEnd + tele + Crusher.SLAM) {
      this.state = 'slam';
      const k = (u - idleEnd - tele) / Crusher.SLAM;
      this.ext = d.stroke * k * k;
    } else if (u < idleEnd + tele + Crusher.SLAM + Crusher.HOLD) {
      this.state = 'hold';
      this.ext = d.stroke;
    } else {
      this.state = 'retract';
      const k = (u - idleEnd - tele - Crusher.SLAM - Crusher.HOLD) / Crusher.RETRACT;
      this.ext = d.stroke * (1 - k * k * (3 - 2 * k));
    }
  }

  private apply(t: number, dt: number): void {
    const off = this.ext + this.headHalf + (this.state === 'warn' ? this.shake : 0);
    const x = this.d.x + this.dir.x * off + (this.dir.x === 0 ? this.shake * 0.4 : 0);
    const y = this.d.y + this.dir.y * off + (this.dir.y === 0 ? this.shake * 0.4 : 0);
    if (dt === 0) {
      this.body.setTransform(new Vec2(x, y), 0);
      this.tracked.snapshot();
    } else driveTo(this.body, x, y, 0, dt);
    void t;
  }

  update(dt: number): void {
    this.compute(this.ctx.time + dt);
    const head = this.d.x + this.dir.x * (this.ext + this.headHalf);
    const headY = this.d.y + this.dir.y * (this.ext + this.headHalf);
    if (this.state !== this.prevState) {
      if (this.state === 'warn') this.ctx.emit('crusher-warn', this.d.x, this.d.y);
      if (this.state === 'hold') this.ctx.emit('crusher-slam', head + this.dir.x * 0.6, headY + this.dir.y * 0.6, 1);
      this.prevState = this.state;
    }
    this.apply(this.ctx.time, dt);
  }
}

/** Spinning saw blade, fixed or travelling along a rail. */
export class Saw implements Behavior {
  readonly type = 'saw';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly r: number;
  spin = 0;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'saw'>,
  ) {
    this.r = d.r ?? 1.15;
    ({ body: this.body, tracked: this.tracked } = kinematic(ctx, d.x, d.y));
    this.body.createFixture({ shape: new Circle(this.r * 0.92), ...SOLID, userData: deadlyTag() });
  }
  private at(t: number): Vec2 {
    const d = this.d;
    if (d.x2 === undefined || d.y2 === undefined) return new Vec2(d.x, d.y);
    const k = wave(t, d.period ?? 4, d.phase);
    return new Vec2(d.x + (d.x2 - d.x) * k, d.y + (d.y2 - d.y) * k);
  }
  update(dt: number): void {
    const p = this.at(this.ctx.time + dt);
    this.spin += 9 * dt;
    driveTo(this.body, p.x, p.y, this.body.getAngle(), dt);
    this.body.setAngularVelocity(9);
  }
}

/** Row of spikes. `x` is the left end of the base, `angle` rotates the row about it (wall spikes). */
export class Spikes implements Behavior {
  readonly type = 'spikes';
  readonly count: number;
  constructor(ctx: LevelCtx, readonly d: Ent<'spikes'>) {
    this.count = Math.max(1, Math.round(d.w / 0.7));
    const body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(d.x, d.y), angle: d.angle ?? 0 });
    const step = d.w / this.count;
    for (let i = 0; i < this.count; i++) {
      const x0 = i * step;
      body.createFixture({
        shape: new Polygon([new Vec2(x0 + 0.04, 0), new Vec2(x0 + step - 0.04, 0), new Vec2(x0 + step / 2, 0.78)]),
        filterCategoryBits: Cat.PROP,
        filterMaskBits: Cat.CAR | Cat.PROP,
        userData: deadlyTag(),
      });
    }
  }
}
