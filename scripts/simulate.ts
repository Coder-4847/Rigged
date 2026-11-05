/**
 * Headless physics sim for tuning: drives the car with scripted input on the sandbox terrain
 * and prints a log. Run: npx tsx scripts/simulate.ts
 */
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Car } from '../src/entities/Car';
import { VEHICLES } from '../src/config';
import { sandboxTerrain } from '../src/levels/sandbox';
import type { InputState } from '../src/core/Input';

const pw = new PhysicsWorld();
for (const line of sandboxTerrain()) pw.addTerrain(line, 12);
const car = new Car(pw, VEHICLES.hatch, -20, 1.5);
const dt = 1 / 120;
const input: InputState = { throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false };

const log: string[] = [];
let t = 0;
let maxSpeed = 0;
let t20 = -1;
const mode = process.argv[2] ?? 'full';
for (let i = 0; i < 120 * 60 && !car.crashed; i++) {
  t = i * dt;
  input.throttle = 1;
  input.tilt = 0;
  if (mode === 'full' && !car.grounded && car.airTime > 0.2) {
    // crude autopilot: keep nose near velocity angle while airborne
    const v = car.chassis.getLinearVelocity();
    const want = Math.atan2(v.y, v.x);
    const err = want - car.chassis.getAngle();
    input.tilt = Math.max(-1, Math.min(1, err * 2));
  }
  car.update(dt, input);
  pw.step(dt);
  maxSpeed = Math.max(maxSpeed, car.forwardSpeed);
  if (t20 < 0 && car.forwardSpeed >= 19 * 0.95) t20 = t;
  if (i % 60 === 0)
    log.push(
      `t=${t.toFixed(1)} x=${car.x.toFixed(1)} y=${car.y.toFixed(2)} v=${car.forwardSpeed.toFixed(1)} ang=${(
        (car.chassis.getAngle() * 180) / Math.PI
      ).toFixed(0)} g=${car.grounded ? 1 : 0}`,
    );
}
console.log(log.join('\n'));
console.log(
  `END t=${t.toFixed(1)} x=${car.x.toFixed(1)} crashed=${car.crashed} reason=${car.crashReason} maxSpeed=${maxSpeed.toFixed(1)} timeTo95%=${t20.toFixed(1)}s`,
);
