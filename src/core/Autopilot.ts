import type { Car } from '../entities/Car';
import type { LevelData } from '../levels/types';
import { surfaceY } from '../levels/builder';
import type { Pt } from '../levels/builder';
import type { InputState } from './Input';

/**
 * Simple driving AI: gas always, aim the nose at the predicted landing slope in the air, back up
 * when stuck. Powers the menu attract mode and the headless smoke-test bot.
 */
export class Autopilot {
  private lines: Pt[][];
  private stall = 0;
  private backup = 0;
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

  drive(car: Car, dt: number, out: InputState): void {
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
        this.backup = 1.6;
        this.stall = 0;
      }
    } else this.stall = 0;
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
