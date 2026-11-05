/**
 * Scenario checks for car feel / stability. Run: npx tsx scripts/feel.ts
 * Exits non-zero if an assertion fails (usable as a smoke test).
 */
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Car } from '../src/entities/Car';
import { VEHICLES } from '../src/config';
import { Terrain } from '../src/levels/builder';
import type { InputState } from '../src/core/Input';

const dt = 1 / 120;
const blank = (): InputState => ({ throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false });
let failed = 0;
const check = (name: string, ok: boolean, info: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};

function world(build: (t: Terrain) => void) {
  const pw = new PhysicsWorld();
  const t = new Terrain(-60, 0);
  build(t);
  for (const l of t.build()) pw.addTerrain(l, 12);
  return pw;
}

// A. Accelerate / brake / reverse on flat ground
{
  const pw = world((t) => t.flat(400));
  const car = new Car(pw, VEHICLES.hatch, 0, 1);
  const inp = blank();
  let t95 = -1;
  for (let i = 0; i < 120 * 4; i++) {
    inp.throttle = 1;
    car.update(dt, inp);
    pw.step(dt);
    if (t95 < 0 && car.forwardSpeed > VEHICLES.hatch.motor.maxSpeed * 0.95) t95 = i * dt;
  }
  const vTop = car.forwardSpeed;
  check('top speed reached', vTop > 17 && vTop < 22, `v=${vTop.toFixed(1)} t95=${t95.toFixed(2)}s`);
  check('accel time sensible (0.8-2.5s)', t95 > 0.8 && t95 < 2.5, `${t95.toFixed(2)}s`);
  const x0 = car.x;
  let stopT = -1;
  let stopD = 0;
  for (let i = 0; i < 120 * 3; i++) {
    inp.throttle = 0;
    inp.brake = 1;
    car.update(dt, inp);
    pw.step(dt);
    if (stopT < 0 && car.forwardSpeed < 0.6) {
      stopT = i * dt;
      stopD = car.x - x0;
    }
  }
  check('brakes to a stop (0.6-1.6s, <20m)', stopT > 0.6 && stopT < 1.6 && stopD < 20, `t=${stopT.toFixed(2)}s dist=${stopD.toFixed(1)}m`);
  for (let i = 0; i < 120 * 2; i++) {
    inp.brake = 1;
    car.update(dt, inp);
    pw.step(dt);
  }
  check('reverses (v < -4)', car.forwardSpeed < -4, `v=${car.forwardSpeed.toFixed(1)}`);
  check('no crash on flat', !car.crashed, '');
}

// B. Air tilt authority
{
  const pw = world((t) => t.flat(400));
  const car = new Car(pw, VEHICLES.hatch, 0, 40);
  const inp = blank();
  for (let i = 0; i < 20; i++) {
    car.update(dt, inp);
    pw.step(dt);
  }
  const a0 = car.chassis.getAngle();
  let wMax = 0;
  for (let i = 0; i < 60; i++) {
    inp.tilt = 1;
    car.update(dt, inp);
    pw.step(dt);
    wMax = Math.max(wMax, car.chassis.getAngularVelocity());
  }
  const da = ((car.chassis.getAngle() - a0) * 180) / Math.PI;
  check('air tilt rotates ~60-200° in 0.5s', da > 60 && da < 200, `Δ=${da.toFixed(0)}° ωmax=${wMax.toFixed(1)}`);
  check('air tilt respects angular cap', wMax <= VEHICLES.hatch.air.maxAngVel * 1.25, `ωmax=${wMax.toFixed(2)} cap=${VEHICLES.hatch.air.maxAngVel}`);
}

// C. Landings (no input, forward speed) from various attitudes should survive when sane
for (const deg of [0, 20, -25, 35]) {
  const pw = world((t) => t.flat(400));
  const car = new Car(pw, VEHICLES.hatch, 0, 8);
  car.chassis.setLinearVelocity({ x: 12, y: 0 } as never);
  car.chassis.setAngle((deg * Math.PI) / 180);
  const inp = blank();
  inp.throttle = 1;
  for (let i = 0; i < 120 * 4; i++) {
    car.update(dt, inp);
    pw.step(dt);
  }
  check(`survives landing at ${deg}°`, !car.crashed && car.grounded, `crashed=${car.crashed} ${car.crashReason ?? ''} ang=${((car.chassis.getAngle() * 180) / Math.PI).toFixed(0)}`);
}

// D. Steep climb (30°) at full throttle
{
  const pw = world((t) => t.flat(20).slope(30, 17).flat(400));
  const car = new Car(pw, VEHICLES.hatch, -40, 1);
  const inp = blank();
  inp.throttle = 1;
  for (let i = 0; i < 120 * 12; i++) {
    car.update(dt, inp);
    pw.step(dt);
  }
  check('climbs 30° slope and reaches top', !car.crashed && car.x > 5, `x=${car.x.toFixed(1)} crashed=${car.crashed} ${car.crashReason ?? ''}`);
}

// E. Roof contact / inverted time crash
{
  const pw = world((t) => t.flat(400));
  const car = new Car(pw, VEHICLES.hatch, 0, 6);
  car.chassis.setAngle(Math.PI);
  const inp = blank();
  for (let i = 0; i < 120 * 2 && !car.crashed; i++) {
    car.update(dt, inp);
    pw.step(dt);
  }
  check('upside-down landing crashes (roof)', car.crashed, `reason=${car.crashReason}`);
}

// F. Determinism: two identical runs match bit-for-bit
{
  const run = () => {
    const pw = world((t) => t.flat(30).ease(20, 4).bumps(30, 0.7, 5).flat(100));
    const car = new Car(pw, VEHICLES.hatch, -40, 1);
    const inp = blank();
    inp.throttle = 1;
    for (let i = 0; i < 120 * 10; i++) {
      car.update(dt, inp);
      pw.step(dt);
    }
    return car.x;
  };
  const a = run();
  const b = run();
  check('deterministic', a === b, `${a} vs ${b}`);
}

process.exit(failed ? 1 : 0);
