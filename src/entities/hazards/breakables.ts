import { Body, Box, Circle, Contact, Vec2 } from 'planck';
import { Cat, ContactOwner, FixtureTag, Tracked } from '../../physics/PhysicsWorld';
import type { EntityData } from '../../levels/types';
import { Behavior, LevelCtx } from './core';

type Ent<T extends EntityData['type']> = Extract<EntityData, { type: T }>;

/**
 * Block that shakes when driven on, then falls. Used standalone (crumbling blocks) and as the
 * plank of a collapsing bridge.
 */
export class CrumbleBlock implements Behavior, ContactOwner {
  readonly type = 'crumble';
  readonly body: Body;
  readonly tracked: Tracked;
  /** 'solid' → 'shaking' → 'falling' */
  state: 'solid' | 'shaking' | 'falling' = 'solid';
  /** 0..1 shake progress (view). */
  shake = 0;
  private t = 0;
  private armed = false;
  /** Called when the car first touches it. */
  onTouched?: (b: CrumbleBlock) => void;

  constructor(
    protected ctx: LevelCtx,
    readonly d: { x: number; y: number; w: number; h: number; delay: number },
  ) {
    this.body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(d.x + d.w / 2, d.y - d.h / 2), allowSleep: false });
    this.body.createFixture({
      shape: new Box(d.w / 2, d.h / 2),
      friction: 1.1,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.CAR | Cat.PROP,
      userData: { kind: 'platform', owner: this } satisfies FixtureTag,
    });
    this.tracked = ctx.pw.track(this.body);
  }

  private d2 = 0;

  onBegin(_self: FixtureTag, other: FixtureTag): void {
    if (other.kind === 'wheel' || other.kind === 'chassis') {
      if (this.onTouched) this.onTouched(this);
      else this.arm();
    }
  }
  // Contact callbacks can't change the world; just flag it.
  private arm(): void {
    this.armed = true;
    this.t = 0;
    this.d2 = this.d.delay;
  }
  /** For the bridge: schedule with an explicit delay from outside a callback. */
  schedule(delay: number): void {
    if (this.state !== 'solid') return;
    this.armed = true;
    this.t = 0;
    this.d2 = delay;
  }

  update(dt: number): void {
    if (this.state === 'solid' && this.armed) {
      this.t += dt;
      this.shake = Math.min(1, this.t / Math.max(0.01, this.d2));
      if (this.t >= this.d2) {
        this.state = 'falling';
        this.body.setType('dynamic');
        this.body.setAwake(true);
        this.body.setLinearVelocity(new Vec2((Math.random() - 0.5) * 0.4, -1));
        this.body.setAngularVelocity((this.d.x % 1) - 0.5);
        this.ctx.emit('crumble', this.body.getPosition().x, this.body.getPosition().y);
      }
    } else if (this.state === 'falling' && this.body.getPosition().y < this.d.y - 40) {
      this.body.setActive(false);
    }
  }

  reset(): void {
    this.state = 'solid';
    this.armed = false;
    this.t = 0;
    this.shake = 0;
    this.body.setActive(true);
    this.body.setType('static');
    this.body.setTransform(new Vec2(this.d.x + this.d.w / 2, this.d.y - this.d.h / 2), 0);
    this.body.setLinearVelocity(new Vec2(0, 0));
    this.body.setAngularVelocity(0);
    this.tracked.snapshot();
  }
}

/** Row of planks that collapse outward from where you touch them. */
export class Bridge implements Behavior {
  readonly type = 'bridge';
  readonly planks: CrumbleBlock[] = [];
  private pending: { at: number; i: number } | null = null;

  constructor(
    ctx: LevelCtx,
    readonly d: Ent<'bridge'>,
  ) {
    const n = Math.max(2, Math.round(d.w / 1.8));
    const w = d.w / n;
    for (let i = 0; i < n; i++) {
      const p = new CrumbleBlock(ctx, { x: d.x + i * w, y: d.y, w: w + 0.02, h: 0.45, delay: d.delay ?? 0.7 });
      p.onTouched = () => {
        if (!this.pending) this.pending = { at: 0, i };
      };
      this.planks.push(p);
    }
  }
  update(dt: number): void {
    if (this.pending) {
      const { i } = this.pending;
      const base = this.d.delay ?? 0.7;
      this.planks.forEach((p, j) => p.schedule(base + Math.abs(j - i) * 0.16));
      this.pending = null;
    }
    for (const p of this.planks) p.update(dt);
  }
  reset(): void {
    this.pending = null;
    for (const p of this.planks) p.reset();
  }
}

/** Icicle / rock / sign that drops when you approach. A ground shadow warns ~1 s ahead. */
export class Falling implements Behavior {
  readonly type = 'falling';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly tag: FixtureTag;
  state: 'hanging' | 'warn' | 'falling' | 'landed' = 'hanging';
  /** 0..1 warning progress (view / shadow). */
  warn = 0;
  shake = 0;
  private t = 0;
  readonly size: { hx: number; hy: number };
  /** y of the ground below, for the warning shadow. */
  groundY: number;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'falling'>,
    groundY: number,
  ) {
    this.groundY = groundY;
    this.size = d.kind === 'icicle' ? { hx: 0.32, hy: 1.1 } : d.kind === 'rock' ? { hx: 0.85, hy: 0.85 } : { hx: 1.5, hy: 0.45 };
    this.tag = { kind: 'prop' };
    this.body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(d.x, d.y), allowSleep: false });
    this.body.createFixture({
      shape: new Box(this.size.hx, this.size.hy),
      density: d.kind === 'icicle' ? 1.2 : 2,
      friction: 0.8,
      restitution: 0.1,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.CAR | Cat.PROP | Cat.TERRAIN,
      userData: this.tag,
    });
    this.tracked = ctx.pw.track(this.body);
  }

  update(dt: number): void {
    const car = this.ctx.car;
    if (this.state === 'hanging' && car && !car.crashed) {
      const lead = this.d.lead ?? 22;
      const px = car.chassis.getPosition().x;
      if (px > this.d.x - lead && px < this.d.x + 4) {
        this.state = 'warn';
        this.t = 0;
        this.ctx.emit('fall-warn', this.d.x, this.d.y);
      }
    } else if (this.state === 'warn') {
      this.t += dt;
      this.warn = Math.min(1, this.t / 1.0);
      this.shake = Math.sin(this.t * 80) * 0.07 * this.warn;
      if (this.t >= 1.0) {
        this.state = 'falling';
        this.body.setType('dynamic');
        this.body.setAwake(true);
        this.tag.kind = 'deadly';
      }
    } else if (this.state === 'falling') {
      const v = this.body.getLinearVelocity();
      if (this.body.getPosition().y < this.groundY + this.size.hy + 0.4 && v.length() < 4) {
        this.state = 'landed';
        this.tag.kind = 'prop';
        this.ctx.emit('fall-hit', this.body.getPosition().x, this.groundY, 1);
      } else if (this.body.getPosition().y < this.groundY - 30) {
        this.body.setActive(false);
        this.state = 'landed';
      }
    }
  }

  /** Impact sound the first time a falling piece hits ground. */
  reset(): void {
    this.state = 'hanging';
    this.warn = 0;
    this.shake = 0;
    this.tag.kind = 'prop';
    this.body.setActive(true);
    this.body.setType('static');
    this.body.setTransform(new Vec2(this.d.x, this.d.y), 0);
    this.body.setLinearVelocity(new Vec2(0, 0));
    this.body.setAngularVelocity(0);
    this.tracked.snapshot();
  }
}

/** Dynamic prop that can be reset to its start pose. */
class Prop implements Behavior {
  readonly type: string = 'prop';
  protected body!: Body;
  tracked!: Tracked;
  protected x = 0;
  protected y = 0;
  reset(): void {
    this.body.setActive(true);
    this.body.setTransform(new Vec2(this.x, this.y), 0);
    this.body.setLinearVelocity(new Vec2(0, 0));
    this.body.setAngularVelocity(0);
    this.body.setAwake(true);
    this.tracked.snapshot();
  }
}

export class CrateBody extends Prop {
  readonly type = 'crate';
  readonly size: number;
  readonly pBody: Body;
  readonly metal: boolean;
  constructor(ctx: LevelCtx, d: Ent<'crate'>) {
    super();
    this.metal = d.style === 'metal';
    this.size = d.size ?? 1.3;
    this.x = d.x;
    this.y = d.y + this.size / 2;
    this.body = ctx.pw.world.createBody({ type: 'dynamic', position: new Vec2(this.x, this.y), allowSleep: true, linearDamping: 0.15 });
    this.body.createFixture({
      shape: new Box(this.size / 2, this.size / 2),
      density: this.metal ? 0.8 : 0.45,
      friction: 0.14, // slick enough to be knocked away instead of wedging under a wheel
      restitution: 0.4,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.TERRAIN | Cat.CAR | Cat.PROP,
      userData: { kind: 'prop' } satisfies FixtureTag,
    });
    this.pBody = this.body;
    this.tracked = ctx.pw.track(this.body);
  }
}

/**
 * Boulder: perched (static) until the car passes `trigger`, then it rolls. Deadly only while it is
 * moving fast, so a boulder that has come to rest is just a big rock.
 */
export class Boulder extends Prop {
  readonly type = 'boulder';
  readonly r: number;
  readonly pBody: Body;
  private released = false;
  private tag: FixtureTag = { kind: 'prop' };
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'boulder'>,
  ) {
    super();
    this.r = d.r ?? 1.6;
    this.x = d.x;
    this.y = d.y + this.r;
    this.body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(this.x, this.y), allowSleep: false, angularDamping: 0.35 });
    this.body.createFixture({
      shape: new Circle(this.r),
      density: 0.9,
      friction: 0.9,
      restitution: 0.1,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.TERRAIN | Cat.CAR | Cat.PROP,
      userData: this.tag,
    });
    this.pBody = this.body;
    this.tracked = ctx.pw.track(this.body);
  }
  update(): void {
    const car = this.ctx.car;
    if (!this.released && car && !car.crashed && car.chassis.getPosition().x > (this.d.trigger ?? this.d.x + 10)) {
      this.released = true;
      this.body.setType('dynamic');
      this.body.setAwake(true);
      this.body.setLinearVelocity(new Vec2(3.5, 0));
      this.body.setAngularVelocity(-2.2);
      this.ctx.emit('boulder', this.x, this.y);
    }
    if (this.released) this.tag.kind = this.body.getLinearVelocity().length() > 5 ? 'deadly' : 'prop';
  }
  reset(): void {
    this.released = false;
    this.tag.kind = 'prop';
    this.body.setType('static');
    super.reset();
  }
}

/** Explosive crate: a hard hit lights the fuse (flashing), then it blasts. */
export class Tnt extends Prop implements ContactOwner {
  readonly type = 'tnt';
  readonly pBody: Body;
  fuse = -1;
  exploded = false;
  private triggered = false;
  private mass = 1;
  static RADIUS = 6;

  constructor(
    private ctx: LevelCtx,
    d: Ent<'tnt'>,
  ) {
    super();
    this.x = d.x;
    this.y = d.y + 0.65;
    this.body = ctx.pw.world.createBody({ type: 'dynamic', position: new Vec2(this.x, this.y) });
    this.body.createFixture({
      shape: new Box(0.65, 0.65),
      density: 0.8,
      friction: 0.8,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.TERRAIN | Cat.CAR | Cat.PROP,
      userData: { kind: 'prop', owner: this } satisfies FixtureTag,
    });
    this.pBody = this.body;
    this.tracked = ctx.pw.track(this.body);
    this.mass = this.body.getMass();
  }

  onImpact(_s: FixtureTag, other: FixtureTag, impulse: number, _c: Contact): void {
    if (this.triggered) return;
    if ((other.kind === 'wheel' || other.kind === 'chassis' || other.kind === 'roof') && impulse / this.mass > 2.5) this.triggered = true;
  }

  update(dt: number): void {
    if (this.exploded) return;
    if (this.triggered && this.fuse < 0) {
      this.fuse = 0.4;
      this.ctx.emit('tnt-fuse', this.body.getPosition().x, this.body.getPosition().y);
    }
    if (this.fuse >= 0) {
      this.fuse -= dt;
      if (this.fuse < 0) this.explode();
    }
  }

  private explode(): void {
    this.exploded = true;
    const p = this.body.getPosition().clone();
    const car = this.ctx.car;
    if (car && !car.crashed) {
      const c = car.chassis.getPosition();
      const dist = Math.hypot(c.x - p.x, c.y - p.y);
      if (dist < Tnt.RADIUS) {
        const k = 1 - dist / Tnt.RADIUS;
        const nx = (c.x - p.x) / Math.max(0.3, dist);
        const ny = (c.y - p.y) / Math.max(0.3, dist) + 0.5;
        for (const b of [car.chassis, car.wheels[0], car.wheels[1]]) b.applyLinearImpulse(new Vec2(nx * 14 * k * b.getMass(), ny * 14 * k * b.getMass()), b.getWorldCenter(), true);
        // Too close to the blast = crash; at the edge you just get thrown (fair + readable).
        if (dist < 2.3) car.crash('hazard');
      }
    }
    this.ctx.emit('explosion', p.x, p.y, 1);
    this.body.setActive(false);
  }

  reset(): void {
    this.exploded = false;
    this.triggered = false;
    this.fuse = -1;
    super.reset();
  }
}

/** A row of tall thin dominoes: knock the first over and watch. */
export class Dominoes implements Behavior {
  readonly type = 'dominoes';
  readonly bodies: Body[] = [];
  readonly tracked: Tracked[] = [];
  private start: Vec2[] = [];
  constructor(ctx: LevelCtx, d: Ent<'dominoes'>) {
    const n = d.n ?? 8;
    const sp = d.spacing ?? 1.1;
    for (let i = 0; i < n; i++) {
      const pos = new Vec2(d.x + i * sp, d.y + 1.1);
      const b = ctx.pw.world.createBody({ type: 'dynamic', position: pos });
      b.createFixture({
        shape: new Box(0.17, 1.1),
        density: 1.1,
        friction: 3,
        filterCategoryBits: Cat.PROP,
        filterMaskBits: Cat.TERRAIN | Cat.CAR | Cat.PROP,
        userData: { kind: 'prop' } satisfies FixtureTag,
      });
      this.bodies.push(b);
      this.tracked.push(ctx.pw.track(b));
      this.start.push(pos.clone());
    }
  }
  reset(): void {
    this.bodies.forEach((b, i) => {
      b.setTransform(this.start[i], 0);
      b.setLinearVelocity(new Vec2(0, 0));
      b.setAngularVelocity(0);
      b.setAwake(true);
      this.tracked[i].snapshot();
    });
  }
}
