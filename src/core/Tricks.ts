import type { Car } from '../entities/Car';
import { accelerate } from '../entities/hazards/core';

export interface TrickEvent {
  /** Big popup text, e.g. "BACKFLIP!" or "DOUBLE FRONTFLIP!". */
  title: string;
  /** Small line under it, e.g. "+NITRO  ×2 combo". */
  sub: string;
  /** 0..1 — how big a deal this was (drives popup size, sound pitch, shake). */
  power: number;
  flips: number;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Air tricks. Tracks how far the car rotates while airborne; a landing that survives (both wheels down, no crash)
 * scores flips / big air, and pays out a nitro burst — so the skilful line through a level is also the fast one.
 * Runs at the physics rate and is fully deterministic. The bot never flips on purpose, so level validation is
 * unaffected; players just get faster.
 */
export class Tricks {
  private rot = 0;
  private lastAngle = 0;
  private wasGrounded = true;
  private airTime = 0;
  /** Landing being evaluated: rotation + airtime of the jump, and time since touchdown. */
  private judging: { rot: number; air: number; t: number; both: number } | null = null;
  /** Remaining nitro (seconds) and its strength (m/s²). */
  nitro = 0;
  private nitroAccel = 0;
  /** Combo: tricks landed in a row with no more than COMBO_GAP seconds on the ground between them. */
  combo = 0;
  private sinceTrick = 99;
  /** Total tricks this run (shown on the complete card). */
  count = 0;

  reset(): void {
    this.rot = 0;
    this.wasGrounded = true;
    this.airTime = 0;
    this.judging = null;
    this.nitro = 0;
    this.combo = 0;
    this.sinceTrick = 99;
  }

  /** Call once per physics step, after the world stepped. Returns a trick when one lands. */
  step(car: Car, dt: number): TrickEvent | null {
    if (car.crashed) {
      this.judging = null;
      this.nitro = 0;
      this.combo = 0;
      return null;
    }
    const a = car.chassis.getAngle();
    const g = car.grounded;
    this.sinceTrick += dt;
    if (this.sinceTrick > 3.2) this.combo = 0;

    if (!g) {
      if (this.wasGrounded) {
        this.rot = 0;
        this.airTime = 0;
        this.lastAngle = a;
      }
      this.rot += wrap(a - this.lastAngle);
      this.lastAngle = a;
      this.airTime += dt;
      this.judging = null;
    } else if (!this.wasGrounded && this.airTime > 0.25) {
      this.judging = { rot: this.rot, air: this.airTime, t: 0, both: 0 };
    }
    this.wasGrounded = g;

    // Nitro burst: pushes along the car's facing direction.
    if (this.nitro > 0) {
      this.nitro -= dt;
      const c = Math.cos(a);
      const s = Math.sin(a);
      if (car.forwardSpeed < car.def.motor.maxSpeed * 1.32) accelerate(car, c * this.nitroAccel, s * this.nitroAccel);
    }

    const j = this.judging;
    if (!j || !g) return null;
    j.t += dt;
    if (car.wheelContacts[0] > 0 && car.wheelContacts[1] > 0) j.both += dt;
    if (j.t < 0.14) return null;
    this.judging = null;
    // Landed on the wheels (not still teetering on one) — it counts.
    if (j.both < 0.04) return null;
    const flips = Math.floor((Math.abs(j.rot) + 0.9) / TAU);
    const big = j.air > 1.05;
    if (!flips && !big) return null;
    const back = j.rot > 0; // counter-clockwise while driving right = nose over the back
    const names = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD '];
    let title: string;
    let boost: number;
    if (flips) {
      title = `${names[Math.min(4, flips)]}${back ? 'BACKFLIP' : 'FRONTFLIP'}!`;
      boost = 0.42 + 0.2 * (flips - 1);
    } else {
      title = j.air > 1.7 ? 'HUGE AIR!' : 'BIG AIR!';
      boost = 0.22;
    }
    if (flips && big) title = title.replace('!', ' + AIR!');
    const perfect = j.t - j.both < 0.06 && flips > 0;
    if (perfect) boost += 0.1;
    this.combo = this.sinceTrick < 3.2 ? this.combo + 1 : 1;
    this.sinceTrick = 0;
    this.count++;
    this.nitro = boost;
    this.nitroAccel = 18 + Math.min(3, this.combo) * 2.5;
    const parts = [perfect ? 'PERFECT LANDING' : '', '+NITRO', this.combo > 1 ? `×${this.combo} COMBO` : ''].filter(Boolean);
    return { title, sub: parts.join('  ·  '), power: Math.min(1, (flips * 0.45 + (big ? 0.25 : 0) + this.combo * 0.1)), flips };
  }
}
