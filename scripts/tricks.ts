/**
 * Trick detection: a launched car that rotates a full turn in the air and lands on its wheels scores a flip
 * and gets nitro; a plain hop scores nothing; a crash scores nothing. Run: npx tsx scripts/tricks.ts
 */
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Car } from '../src/entities/Car';
import { VEHICLES } from '../src/config';
import { Terrain } from '../src/levels/builder';
import { Tricks, type TrickEvent } from '../src/core/Tricks';
import type { InputState } from '../src/core/Input';

const dt = 1 / 120;
let failed = 0;
const check = (name: string, ok: boolean, info: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};

/** Throw the car up with spin `w` (rad/s) and let it land; tilt input steers the rotation. */
function throwCar(vy: number, w: number, tilt: (t: number, car: Car) => number) {
  const pw = new PhysicsWorld();
  const t = new Terrain(-60, 0);
  t.flat(600);
  for (const l of t.build()) pw.addTerrain(l, 12);
  const car = new Car(pw, VEHICLES.hatch, 0, 1.4);
  const tricks = new Tricks();
  const inp: InputState = { throttle: 1, brake: 0, tilt: 0, boost: false, restart: false, pause: false };
  const events: TrickEvent[] = [];
  let launched = false;
  let vBefore = 0;
  let vAfter = 0;
  for (let i = 0; i < 120 * 6; i++) {
    const time = i * dt;
    if (!launched && time > 1.2) {
      launched = true;
      for (const b of [car.chassis, car.wheels[0], car.wheels[1]]) b.setLinearVelocity({ x: b.getLinearVelocity().x, y: vy } as never);
      car.chassis.setAngularVelocity(w);
    }
    inp.tilt = launched ? tilt(time, car) : 0;
    car.update(dt, inp);
    pw.step(dt);
    const e = tricks.step(car, dt);
    if (e) {
      events.push(e);
      vBefore = car.forwardSpeed;
    }
    if (events.length && !vAfter && tricks.nitro <= 0) vAfter = car.forwardSpeed;
  }
  return { events, crashed: car.crashed, vBefore, vAfter, count: tricks.count };
}

{
  // Backflip: strong upward throw, keep tilting nose-up until most of a turn is done, then level out.
  const r = throwCar(17, 3.5, (_t, car) => {
    const a = car.chassis.getAngle();
    return a < Math.PI * 2 - 0.9 ? 1 : 0;
  });
  check('backflip is detected', r.events.some((e) => e.flips === 1 && e.title.includes('BACKFLIP')), r.events.map((e) => e.title).join(', ') + (r.crashed ? ' (crashed)' : ''));
  check('nitro speeds the car up', r.vAfter > r.vBefore + 1.5, `v ${r.vBefore.toFixed(1)} → ${r.vAfter.toFixed(1)}`);
}
{
  const r = throwCar(4, 0, () => 0);
  check('a small hop is not a trick', r.events.length === 0, r.events.map((e) => e.title).join(', '));
}
{
  const r = throwCar(16, 0, () => 0);
  check('big air is detected', r.events.some((e) => e.title.includes('AIR')), r.events.map((e) => e.title).join(', '));
}
{
  // Half a turn and land on the roof: crash, no trick.
  const r = throwCar(15, 5, (_t, car) => (car.chassis.getAngle() < Math.PI ? 1 : 0));
  check('roof landing scores nothing', r.crashed && r.events.length === 0, `crashed=${r.crashed} events=${r.events.length}`);
}
process.exit(failed ? 1 : 0);
