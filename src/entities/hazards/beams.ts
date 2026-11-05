import { Body, Box, Vec2 } from 'planck';
import { Cat, FixtureTag } from '../../physics/PhysicsWorld';
import type { EntityData } from '../../levels/types';
import { Behavior, LevelCtx, cycle } from './core';

type Ent<T extends EntityData['type']> = Extract<EntityData, { type: T }>;

/** Thin mirror that reflects laser beams (and is physically solid). */
export class Mirror implements Behavior {
  readonly type = 'mirror';
  readonly body: Body;
  readonly w: number;
  constructor(
    ctx: LevelCtx,
    readonly d: Ent<'mirror'>,
  ) {
    this.w = d.w ?? 3;
    this.body = ctx.pw.world.createBody({ type: 'static', position: new Vec2(d.x, d.y), angle: d.angle });
    this.body.createFixture({
      shape: new Box(this.w / 2, 0.12),
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.CAR | Cat.PROP,
      userData: { kind: 'prop', surface: 'mirror' } satisfies FixtureTag,
    });
  }
}

/** Floor button. Latches ON when driven over; lasers/doors/crushers with the same `ctrl` react. */
export class Switch implements Behavior {
  readonly type = 'switch';
  on = false;
  /** 0..1 plate depression for the view. */
  press = 0;
  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'switch'>,
  ) {}
  update(dt: number): void {
    const car = this.ctx.car;
    if (!this.on && car && !car.crashed) {
      const p = car.chassis.getPosition();
      if (Math.abs(p.x - this.d.x) < 1.6 && p.y - this.d.y < 2.2 && p.y > this.d.y - 1) {
        this.on = true;
        this.ctx.switches.set(this.d.id, true);
        this.ctx.emit('switch', this.d.x, this.d.y);
      }
    }
    this.press += ((this.on ? 1 : 0) - this.press) * Math.min(1, dt * 14);
  }
  reset(): void {
    this.on = false;
    this.press = 0;
    this.ctx.switches.set(this.d.id, false);
  }
}

export interface BeamSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Laser emitter. Modes: static (always on), sweep (oscillating angle), pulse (rhythm with
 * charge-up telegraph), track (slow turret that follows the car). Traces up to 4 mirror bounces
 * each step and kills the car on contact.
 */
export class Laser implements Behavior {
  readonly type = 'laser';
  /** 0..1 beam power (0 off). */
  power = 0;
  /** 0..1 charge-up telegraph before a pulse fires. */
  charge = 0;
  angle: number;
  readonly segs: BeamSeg[] = [];
  private wasOn = false;
  private static MAX = 60;
  /** Beam reach (m). Tracking turrets and spinners only reach part of the way, so the danger zone is bounded. */
  readonly range: number;

  constructor(
    private ctx: LevelCtx,
    readonly d: Ent<'laser'>,
  ) {
    this.angle = d.angle;
    this.range = d.range ?? (d.mode === 'track' ? 30 : d.mode === 'spin' ? 14 : Laser.MAX);
  }

  /** Respawn: turrets forget where they were aiming. */
  reset(): void {
    this.angle = this.d.angle;
  }

  get isOn(): boolean {
    return this.power > 0.5;
  }

  update(dt: number): void {
    const d = this.d;
    const t = this.ctx.time + dt;
    const disabled = !!d.ctrl && !!this.ctx.switches.get(d.ctrl);
    this.charge = 0;
    let on = !disabled;
    switch (d.mode) {
      case 'sweep':
        this.angle = d.angle + (d.amp ?? 0.8) * Math.sin(2 * Math.PI * (t / (d.period ?? 4) + (d.phase ?? 0)));
        break;
      case 'spin':
        // Full rotation: half of every turn the beam points away from the road, which is the safe window.
        this.angle = d.angle + 2 * Math.PI * (t / (d.period ?? 4.4) + (d.phase ?? 0));
        break;
      case 'pulse': {
        const c = cycle(t, d.period ?? 3, d.phase);
        const onFrac = d.on ?? 0.45;
        const tele = 0.7 / (d.period ?? 3); // charge window as a fraction of the cycle
        const beamOn = c < onFrac;
        if (!beamOn && c > 1 - tele) this.charge = (c - (1 - tele)) / tele;
        on = on && beamOn;
        break;
      }
      case 'track': {
        // Aims slowly at the car, charges (preview line), then fires at wherever it is pointing — which
        // lags behind a moving car. Standing still under it is what gets you.
        {
          const P = d.period ?? 2.8;
          const c = cycle(t, P, d.phase);
          const tele = 0.8 / P;
          const beamOn = c < 0.2;
          if (!beamOn && c > 1 - tele) this.charge = (c - (1 - tele)) / tele;
          on = on && beamOn;
        }
        const car = this.ctx.car;
        if (car && !car.crashed && Math.hypot(car.chassis.getPosition().x - d.x, car.chassis.getPosition().y - d.y) < this.range + 6) {
          const p = car.chassis.getPosition();
          const want = Math.atan2(p.y - d.y, p.x - d.x);
          let diff = want - this.angle;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          this.angle += Math.max(-0.45 * dt, Math.min(0.45 * dt, diff)); // deliberately slow
        }
        break;
      }
      default:
        break;
    }
    this.power += ((on ? 1 : 0) - this.power) * Math.min(1, dt * 30);
    if (this.isOn !== this.wasOn) {
      this.wasOn = this.isOn;
      if (this.isOn) this.ctx.emit('laser-on', d.x, d.y);
    }
    if (this.charge > 0 && Math.floor(this.charge * 4) !== Math.floor((this.charge - dt * 1.4) * 4)) this.ctx.emit('laser-charge', d.x, d.y);
    // Trace even when off (for the charge-line preview) but only kill when on.
    this.trace(this.isOn);
  }

  private trace(kill: boolean): void {
    this.segs.length = 0;
    let ox = this.d.x;
    let oy = this.d.y;
    let dx = Math.cos(this.angle);
    let dy = Math.sin(this.angle);
    let remaining = this.range;
    const world = this.ctx.pw.world;
    for (let bounce = 0; bounce < 5 && remaining > 0.1; bounce++) {
      let best = 1;
      const hit = { kind: 'none' as 'none' | 'car' | 'solid' | 'mirror' };
      let nx = 0;
      let ny = 0;
      world.rayCast(new Vec2(ox, oy), new Vec2(ox + dx * remaining, oy + dy * remaining), (fixture, _p, normal, fraction) => {
        const tag = fixture.getUserData() as FixtureTag | undefined;
        if (!tag || tag.kind === 'debris' || tag.kind === 'deadly') return -1;
        if (fixture.isSensor()) return -1;
        if (fraction < best) {
          best = fraction;
          nx = normal.x;
          ny = normal.y;
          hit.kind = tag.kind === 'wheel' || tag.kind === 'chassis' || tag.kind === 'roof' ? 'car' : tag.surface === 'mirror' ? 'mirror' : 'solid';
        }
        return fraction;
      });
      const len = remaining * best;
      const x1 = ox + dx * len;
      const y1 = oy + dy * len;
      this.segs.push({ x0: ox, y0: oy, x1, y1 });
      if (hit.kind === 'car') {
        if (kill && this.ctx.car && !this.ctx.car.crashed) {
          this.ctx.car.crash('hazard');
          this.ctx.emit('laser-zap', x1, y1, 1);
        }
        break;
      }
      if (hit.kind !== 'mirror') break;
      // reflect
      const dot = dx * nx + dy * ny;
      dx -= 2 * dot * nx;
      dy -= 2 * dot * ny;
      ox = x1 + dx * 0.02;
      oy = y1 + dy * 0.02;
      remaining -= len;
    }
  }
}
