import { Body, Vec2 } from 'planck';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import type { Car } from '../Car';

/** One-shot happening in the level that the game turns into sound / particles / shake. */
export interface HazardEvent {
  kind: string;
  x: number;
  y: number;
  strength?: number;
}

/** What hazards can see and touch. Implemented by LevelPhysics. */
export interface LevelCtx {
  readonly pw: PhysicsWorld;
  /** Simulated seconds (start of the current step). */
  time: number;
  car: Car | null;
  switches: Map<string, boolean>;
  /** Gravity multiplier requested this step (zones lower it; applied once all zones ran). */
  gScale: number;
  /** Set by transform pads; the game consumes it. */
  pendingTransform: { scale: number; vehicle?: string } | null;
  emit(kind: string, x: number, y: number, strength?: number): void;
}

/** Anything dynamic in a level: stepped each physics tick and reset on respawn. */
export interface Behavior {
  /** Entity type, used by the renderer to pick a view. */
  readonly type: string;
  update?(dt: number): void;
  reset?(): void;
}

/** Steer a kinematic body so it reaches (x, y, a) at the end of this step. */
export function driveTo(body: Body, x: number, y: number, a: number, dt: number): void {
  const p = body.getPosition();
  body.setLinearVelocity(new Vec2((x - p.x) / dt, (y - p.y) / dt));
  body.setAngularVelocity((a - body.getAngle()) / dt);
}

/** Smooth 0..1..0 oscillation: starts at 0, peaks at half period. */
export const wave = (t: number, period: number, phase = 0): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / period + phase));

/** Fractional part of t/period + phase (0..1 cycle position). */
export const cycle = (t: number, period: number, phase = 0): number => {
  const c = (t / period + phase) % 1;
  return c < 0 ? c + 1 : c;
};

/** Push every car body with the same acceleration (m/s²), independent of mass. */
export function accelerate(car: Car, ax: number, ay: number): void {
  for (const b of [car.chassis, car.wheels[0], car.wheels[1]]) {
    b.applyForceToCenter(new Vec2(ax * b.getMass(), ay * b.getMass()), true);
  }
}

/** Linear drag on every car body: F = -k·v·m. */
export function dragCar(car: Car, k: number): void {
  for (const b of [car.chassis, car.wheels[0], car.wheels[1]]) {
    const v = b.getLinearVelocity();
    b.applyForceToCenter(new Vec2(-v.x * k * b.getMass(), -v.y * k * b.getMass() * 0.25), true);
  }
}

/** Set car linear velocity (all bodies). */
export function setCarVelocity(car: Car, vx: number, vy: number): void {
  for (const b of [car.chassis, car.wheels[0], car.wheels[1]]) b.setLinearVelocity(new Vec2(vx, vy));
}
