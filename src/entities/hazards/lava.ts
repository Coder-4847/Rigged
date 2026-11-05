import { Body, Box, Vec2 } from 'planck';
import { Cat, FixtureTag, Tracked } from '../../physics/PhysicsWorld';
import type { EntityData } from '../../levels/types';
import { Behavior, LevelCtx, accelerate, cycle, driveTo } from './core';

type Ent<T extends EntityData['type']> = Extract<EntityData, { type: T }>;

/**
 * Lava. A static pool (no `rise`) is just a deadly surface; with `rise` (m/s) it starts climbing once the
 * car passes `trigger` and stops at `maxY`, flooding the low points of the level. Always visibly glowing.
 */
export class Lava implements Behavior {
  readonly type = 'lava';
  readonly body: Body;
  readonly tracked: Tracked;
  readonly h: number;
  /** Current surface height. */
  top: number;
  private started = -1;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'lava'>,
  ) {
    this.h = d.h ?? 30;
    this.top = d.y;
    this.body = ctx.pw.world.createBody({ type: 'kinematic', position: new Vec2(d.x + d.w / 2, d.y - this.h / 2), allowSleep: false });
    this.body.createFixture({
      shape: new Box(d.w / 2, this.h / 2),
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.CAR | Cat.PROP,
      userData: { kind: 'deadly' } satisfies FixtureTag,
    });
    this.tracked = ctx.pw.track(this.body);
  }

  update(dt: number): void {
    const d = this.d;
    if (!d.rise) return;
    const car = this.ctx.car;
    if (this.started < 0 && car && !car.crashed && car.chassis.getPosition().x > (d.trigger ?? d.x)) {
      this.started = this.ctx.time;
      this.ctx.emit('lava-rise', d.x, d.y);
    }
    if (this.started >= 0) this.top = Math.min(d.maxY ?? d.y + 40, d.y + d.rise * (this.ctx.time + dt - this.started));
    driveTo(this.body, d.x + d.w / 2, this.top - this.h / 2, 0, dt);
  }

  reset(): void {
    this.started = -1;
    this.top = this.d.y;
    this.body.setTransform(new Vec2(this.d.x + this.d.w / 2, this.d.y - this.h / 2), 0);
    this.tracked.snapshot();
  }
}

/**
 * Lava geyser: idle → bubbling warning (~0.9 s, shakes + glows) → eruption column that launches the car upward.
 * The column itself isn't deadly (the lava you land in might be) — readable, fair launches.
 */
export class Geyser implements Behavior {
  readonly type = 'geyser';
  state: 'idle' | 'warn' | 'erupt' = 'idle';
  warn = 0;
  private prev = 'idle';
  readonly w: number;
  readonly height: number;
  static WARN = 0.9;
  static ERUPT = 0.9;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'geyser'>,
  ) {
    this.w = d.w ?? 3;
    this.height = d.height ?? 12;
  }

  update(dt: number): void {
    const d = this.d;
    const P = Math.max(d.period, Geyser.WARN + Geyser.ERUPT + 0.8);
    const u = cycle(this.ctx.time + dt, P, d.phase) * P;
    const idleEnd = P - Geyser.WARN - Geyser.ERUPT;
    this.warn = 0;
    if (u < idleEnd) this.state = 'idle';
    else if (u < idleEnd + Geyser.WARN) {
      this.state = 'warn';
      this.warn = (u - idleEnd) / Geyser.WARN;
    } else this.state = 'erupt';
    if (this.state !== this.prev) {
      if (this.state === 'warn') this.ctx.emit('geyser-warn', d.x, d.y);
      if (this.state === 'erupt') this.ctx.emit('geyser', d.x, d.y, 1);
      this.prev = this.state;
    }
    if (this.state !== 'erupt') return;
    const car = this.ctx.car;
    if (!car || car.crashed) return;
    const p = car.chassis.getPosition();
    if (Math.abs(p.x - d.x) < this.w / 2 + 0.6 && p.y > d.y - 1 && p.y < d.y + this.height) accelerate(car, 0, 62);
  }
}
