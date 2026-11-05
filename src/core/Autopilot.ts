import type { Car } from '../entities/Car';
import type { LevelData } from '../levels/types';
import { surfaceY } from '../levels/builder';
import type { Pt } from '../levels/builder';
import type { InputState } from './Input';
import type { LevelPhysics } from '../entities/LevelPhysics';
import { MovingPlatform } from '../entities/hazards/movers';

/**
 * Simple driving AI: gas always, aim the nose at the predicted landing slope in the air, back up
 * when stuck. Powers the menu attract mode and the headless smoke-test bot.
 */
export class Autopilot {
  private lines: Pt[][];
  private stall = 0;
  private backup = 0;
  private backups = 0;
  private g: number;

  constructor(level: LevelData) {
    this.lines = level.entities.flatMap((e) => (e.type === 'terrain' ? [e.points as Pt[]] : []));
    this.g = -(level.gravity ?? -26);
  }

  reset(): void {
    this.stall = 0;
    this.backup = 0;
  }

  /** Predict where a ballistic flight lands and the ground angle there. */
  private landingAngle(x: number, y: number, vx: number, vy: number): number | null {
    for (let k = 1; k < 200; k++) {
      const t = k * 0.02;
      const px = x + vx * t;
      const py = y + vy * t - 0.5 * this.g * t * t;
      const sy = surfaceY(this.lines, px);
      if (sy !== null && py < sy + 0.9 && vy - this.g * t < 0) {
        const y0 = surfaceY(this.lines, px - 1.5);
        const y1 = surfaceY(this.lines, px + 1.5);
        if (y0 === null || y1 === null) return 0;
        return Math.atan2(y1 - y0, 3);
      }
    }
    return null;
  }

  /**
   * Ferry platforms: stop at the pit edge, board when the platform arrives, hold on with the handbrake
   * while it carries you across, then drive off when it reaches the far side.
   */
  private ferry(car: Car, lp: LevelPhysics, out: InputState): boolean {
    const p = car.chassis.getPosition();
    for (const b of lp.behaviors) {
      if (!(b instanceof MovingPlatform) || b.d.y2 !== b.d.y) continue;
      const start = b.d.x - b.d.w / 2 - 0.5; // pit edge (platform rests 0.5 m inside it)
      const end = b.d.x2 + b.d.w / 2 + 0.5;
      const pp = b.body.getPosition();
      const left = pp.x - b.d.w / 2;
      const right = pp.x + b.d.w / 2;
      if (p.x < start - 16 || p.x > end + 1) continue;
      const onPlat = p.x > left + 0.5 && p.x < right - 0.5 && p.y > pp.y && p.y < pp.y + 3;
      if (onPlat && p.x > start + 1) {
        // riding: lock the wheels so the car goes where the platform goes
        if (right >= end - 2.2) {
          out.throttle = 1;
          out.brake = 0;
        } else {
          out.throttle = 1;
          out.brake = 1;
        }
        return true;
      }
      if (p.x < start) {
        const dist = start - p.x;
        const vTarget = Math.max(0, Math.min(18, (dist - 3.4) * 1.1));
        const boardable = left <= start + 2.5 && left >= start - 0.8 && Math.abs(car.forwardSpeed) < 2.5;
        if (boardable && dist < 5.5) {
          out.throttle = 0.85;
          out.brake = 0;
        } else {
          out.throttle = car.forwardSpeed < vTarget ? 1 : 0;
          out.brake = car.forwardSpeed > vTarget + 1.2 ? 1 : 0;
        }
        return true;
      }
    }
    return false;
  }

  drive(car: Car, dt: number, out: InputState, lp?: LevelPhysics): void {
    out.throttle = 1;
    out.brake = 0;
    out.tilt = 0;
    out.boost = false;
    if (this.backup > 0) {
      this.backup -= dt;
      out.throttle = 0;
      out.brake = 1;
    } else if (car.grounded && Math.abs(car.forwardSpeed) < 1.2) {
      this.stall += dt;
      if (this.stall > 1.2) {
        // vary the back-up time so a retry loop can't lock onto a hazard's rhythm
        this.backup = 1.0 + 2.2 * ((this.backups++ * 0.618) % 1);
        this.stall = 0;
      }
    } else this.stall = 0;
    if (lp && this.ferry(car, lp, out)) return;
    if (!car.grounded && car.airTime > 0.15) {
      const p = car.chassis.getPosition();
      const v = car.chassis.getLinearVelocity();
      let want = Math.atan2(v.y, v.x);
      if (v.y < 2) {
        const la = this.landingAngle(p.x, p.y, v.x, v.y);
        if (la !== null) want = la;
      }
      const err = want - car.chassis.getAngle();
      out.tilt = Math.max(-1, Math.min(1, err * 2.2 - car.chassis.getAngularVelocity() * 0.35));
    }
  }
}
