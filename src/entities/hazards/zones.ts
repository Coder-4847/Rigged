import { Body, Box, Contact, Vec2 } from 'planck';
import { Cat, ContactOwner, FixtureTag } from '../../physics/PhysicsWorld';
import type { EntityData } from '../../levels/types';
import { Behavior, LevelCtx, accelerate, dragCar, setCarVelocity } from './core';

type Ent<T extends EntityData['type']> = Extract<EntityData, { type: T }>;

/**
 * Area effects: sand / goo drag, boost strips, wind, gravity fields, magnets, vacuum tubes.
 * Tested against the chassis centre, so they behave identically headless and in the game.
 */
export class Zone implements Behavior {
  readonly type = 'zone';
  /** Car currently inside (for views / enter events). */
  inside = false;
  readonly cx: number;
  readonly cy: number;
  readonly angle: number;
  readonly strength: number;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'zone'>,
  ) {
    this.angle = d.angle ?? 0;
    this.strength =
      d.strength ??
      { sand: 3, goo: 6.5, boost: 30, wind: 20, lowgrav: 0.3, flipgrav: -1, magnet: 70, vacuum: 55 }[d.kind];
    const h = d.h ?? 6;
    this.cx = d.kind === 'magnet' ? d.x : d.x + d.w / 2;
    this.cy = d.kind === 'magnet' ? d.y : d.y + h / 2;
  }

  /** Rect test (magnets use a radius = w). */
  contains(px: number, py: number): boolean {
    const d = this.d;
    if (d.kind === 'magnet') return Math.hypot(px - d.x, py - d.y) < d.w;
    const h = d.h ?? 6;
    return px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + h;
  }

  update(): void {
    const car = this.ctx.car;
    this.inside = false;
    if (!car || car.crashed) return;
    const p = car.chassis.getPosition();
    if (!this.contains(p.x, p.y)) return;
    const was = this.inside;
    this.inside = true;
    const d = this.d;
    const s = this.strength;
    const dx = Math.cos(this.angle);
    const dy = Math.sin(this.angle);
    switch (d.kind) {
      case 'sand':
      case 'goo':
        if (car.grounded) dragCar(car, s);
        break;
      case 'boost':
        accelerate(car, dx * s, dy * s);
        if (!was && car.grounded) this.ctx.emit('boost', p.x, p.y);
        break;
      case 'wind':
        accelerate(car, dx * s, dy * s);
        break;
      case 'lowgrav':
        this.ctx.gScale = Math.min(this.ctx.gScale, s);
        break;
      case 'flipgrav':
        this.ctx.gScale = s;
        break;
      case 'magnet': {
        // Attract (s>0) or repel (s<0); strongest at the core, fading to the rim.
        const ox = d.x - p.x;
        const oy = d.y - p.y;
        const dist = Math.max(0.6, Math.hypot(ox, oy));
        const f = s * (1 - dist / d.w);
        accelerate(car, (ox / dist) * f, (oy / dist) * f);
        break;
      }
      case 'vacuum': {
        // Accelerate along the tube and pull toward its centre line.
        const along = dx * s;
        const alongY = dy * s;
        const off = (p.x - this.cx) * -dy + (p.y - this.cy) * dx; // signed distance from centre line
        accelerate(car, along + dy * off * 6, alongY - dx * off * 6);
        break;
      }
    }
  }
}

/** Spring pad: launches the car upward (keeping horizontal speed). */
export class BouncePad implements Behavior {
  readonly type = 'bounce';
  readonly w: number;
  readonly power: number;
  /** 0..1 squash animation value for the view. */
  squash = 0;
  private cooldown = 0;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'bounce'>,
  ) {
    this.w = d.w ?? 4;
    this.power = d.power ?? 22;
  }

  update(dt: number): void {
    this.squash = Math.max(0, this.squash - dt * 4);
    this.cooldown -= dt;
    const car = this.ctx.car;
    if (!car || car.crashed || this.cooldown > 0) return;
    const p = car.chassis.getPosition();
    const lowest = Math.min(car.wheels[0].getPosition().y, car.wheels[1].getPosition().y) - car.def.wheel.radius;
    if (Math.abs(p.x - this.d.x) < this.w / 2 + 0.3 && lowest - (this.d.y + 0.3) < 0.15 && lowest > this.d.y - 0.6) {
      const v = car.chassis.getLinearVelocity();
      setCarVelocity(car, v.x, this.power);
      this.cooldown = 0.35;
      this.squash = 1;
      this.ctx.emit('bounce', this.d.x, this.d.y);
    }
  }
  reset(): void {
    this.cooldown = 0;
    this.squash = 0;
  }
}

/** Cannon: catches the car, charges briefly (telegraph), then fires it along `angle`. */
export class Cannon implements Behavior {
  readonly type = 'cannon';
  /** 0..1 charge for the view; >1 right after firing for recoil. */
  charge = 0;
  recoil = 0;
  private state: 'idle' | 'charge' | 'cool' = 'idle';
  private t = 0;
  readonly power: number;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'cannon'>,
  ) {
    this.power = d.power ?? 30;
  }

  update(dt: number): void {
    this.recoil = Math.max(0, this.recoil - dt * 3);
    const car = this.ctx.car;
    if (!car || car.crashed) {
      this.state = 'idle';
      this.charge = 0;
      return;
    }
    const p = car.chassis.getPosition();
    const near = Math.hypot(p.x - this.d.x, p.y - this.d.y) < 2.6;
    if (this.state === 'idle' && near) {
      this.state = 'charge';
      this.t = 0;
      this.ctx.emit('cannon-charge', this.d.x, this.d.y);
    } else if (this.state === 'charge') {
      this.t += dt;
      this.charge = Math.min(1, this.t / 0.5);
      // Hold the car in the barrel: bleed its speed and glue it to the mouth.
      const v = car.chassis.getLinearVelocity();
      setCarVelocity(car, v.x * 0.8, v.y * 0.8);
      if (this.t >= 0.5) {
        setCarVelocity(car, Math.cos(this.d.angle) * this.power, Math.sin(this.d.angle) * this.power);
        car.chassis.setAngularVelocity(0);
        this.state = 'cool';
        this.t = 0;
        this.charge = 0;
        this.recoil = 1;
        this.ctx.emit('cannon', this.d.x, this.d.y, 1);
      }
    } else if (this.state === 'cool') {
      this.t += dt;
      if (this.t > 1.4 && !near) this.state = 'idle';
    }
  }
  reset(): void {
    this.state = 'idle';
    this.charge = 0;
    this.recoil = 0;
  }
}

/** Belt that drags whatever drives on it. Positive speed = toward +x. */
export class Conveyor implements Behavior, ContactOwner {
  readonly type = 'conveyor';
  readonly body: Body;
  /** Belt scroll offset for the view. */
  scroll = 0;

  constructor(
    ctx: LevelCtx,
    readonly d: Ent<'conveyor'>,
  ) {
    this.body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(d.x + d.w / 2, d.y + 0.1 - 0.3) });
    this.body.createFixture({
      shape: new Box(d.w / 2, 0.3),
      friction: 1.6,
      filterCategoryBits: Cat.TERRAIN,
      filterMaskBits: Cat.CAR | Cat.PROP | Cat.DEBRIS,
      userData: { kind: 'terrain', surface: 'metal', owner: this } satisfies FixtureTag,
    });
  }
  update(dt: number): void {
    this.scroll += this.d.speed * dt;
  }
  onPreSolve(self: FixtureTag, _other: FixtureTag, c: Contact): void {
    // Tangent direction depends on which fixture is A (Box2D: B moves along cross(normal,1) relative to A).
    const aIsBelt = c.getFixtureA().getUserData() === self;
    c.setTangentSpeed(aIsBelt ? this.d.speed : -this.d.speed);
  }
}

/** Platform you can jump up through from below. */
export class OneWay implements Behavior, ContactOwner {
  readonly type = 'oneway';
  readonly body: Body;
  constructor(
    ctx: LevelCtx,
    readonly d: Ent<'oneway'>,
  ) {
    this.body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(d.x + d.w / 2, d.y - 0.15) });
    this.body.createFixture({
      shape: new Box(d.w / 2, 0.15),
      friction: 1,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.CAR | Cat.PROP,
      userData: { kind: 'platform', surface: 'oneway', owner: this } satisfies FixtureTag,
    });
  }
  onPreSolve(self: FixtureTag, other: FixtureTag, c: Contact): void {
    const aIsMe = c.getFixtureA().getUserData() === self;
    const otherBody = (aIsMe ? c.getFixtureB() : c.getFixtureA()).getBody();
    // Pass through unless the other body is already on top.
    if (otherBody.getPosition().y < this.d.y + (other.kind === 'wheel' ? 0.15 : 0.05)) c.setEnabled(false);
  }
}

/** Pad that resizes (or swaps) the car when driven through. The game rebuilds the car. */
export class TransformPad implements Behavior {
  readonly type = 'transform';
  private cooldown = 0;
  pulse = 0;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'transform'>,
  ) {}
  update(dt: number): void {
    this.cooldown -= dt;
    this.pulse = Math.max(0, this.pulse - dt * 2);
    const car = this.ctx.car;
    if (!car || car.crashed || this.cooldown > 0) return;
    const p = car.chassis.getPosition();
    const h = this.d.h ?? 5;
    if (Math.abs(p.x - this.d.x) < 1.2 && p.y > this.d.y - 1 && p.y < this.d.y + h) {
      this.cooldown = 1;
      this.pulse = 1;
      this.ctx.pendingTransform = { scale: this.d.scale ?? 1, vehicle: this.d.vehicle };
      this.ctx.emit('transform', this.d.x, p.y);
    }
  }
}
