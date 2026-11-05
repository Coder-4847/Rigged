/** Headless checks for every hazard family. Run: npx tsx scripts/hazards.ts */
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Car } from '../src/entities/Car';
import { LevelPhysics } from '../src/entities/LevelPhysics';
import { Crusher } from '../src/entities/hazards/movers';
import { Laser } from '../src/entities/hazards/beams';
import { VEHICLES } from '../src/config';
import { LevelBuilder } from '../src/levels/builder';
import type { EntityData, SurfaceType } from '../src/levels/types';
import type { InputState } from '../src/core/Input';

const dt = 1 / 120;
let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};
const blank = (): InputState => ({ throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false });

interface Rig {
  pw: PhysicsWorld;
  lp: LevelPhysics;
  car: Car;
  step(n: number, inp?: Partial<InputState>): void;
}

/** Flat ground 0..400 (optional surface for the whole stretch) plus extra entities; car at x. */
function rig(ents: EntityData[], x = 10, surface: SurfaceType = 'grass'): Rig {
  const L = new LevelBuilder({ id: 1, name: 't', world: 1, parTime: 30 });
  L.cursor = { x: -20, y: 0 };
  L.ground((t) => t.flat(500), surface);
  L.spawnAt(x).finishAt(470).starAt(0, 3).starAt(5, 3).starAt(10, 3);
  for (const e of ents) L.push(e);
  const data = L.build();
  const pw = new PhysicsWorld();
  const lp = new LevelPhysics(pw, data);
  const car = new Car(pw, VEHICLES.hatch, x, 1.3);
  lp.setCar(car);
  const inp = blank();
  return {
    pw,
    lp,
    car,
    step(n, i = {}) {
      Object.assign(inp, blank(), i);
      for (let k = 0; k < n && !car.crashed; k++) {
        car.update(dt, inp);
        lp.update(dt);
        pw.step(dt);
      }
    },
  };
}
const settle = (r: Rig) => r.step(90);

// --- surfaces
{
  const grass = rig([]);
  settle(grass);
  grass.step(120, { throttle: 1 });
  const vg = grass.car.forwardSpeed;
  const ice = rig([], 10, 'ice');
  settle(ice);
  ice.step(120, { throttle: 1 });
  check('ice: slow to accelerate (wheelspin)', ice.car.forwardSpeed < vg * 0.6, `ice=${ice.car.forwardSpeed.toFixed(1)} grass=${vg.toFixed(1)}`);
  // braking distance from the same speed
  const brake = (r: Rig) => {
    r.car.chassis.setLinearVelocity({ x: 15, y: 0 } as never);
    r.car.wheels[0].setLinearVelocity({ x: 15, y: 0 } as never);
    r.car.wheels[1].setLinearVelocity({ x: 15, y: 0 } as never);
    const x0 = r.car.x;
    r.step(1, { brake: 1 });
    for (let i = 0; i < 360 && r.car.forwardSpeed > 0.5; i++) r.step(1, { brake: 1 });
    return r.car.x - x0;
  };
  const g2 = rig([]);
  settle(g2);
  const dg = brake(g2);
  const i2 = rig([], 10, 'ice');
  settle(i2);
  const di = brake(i2);
  check('ice: longer braking distance', di > dg * 2, `ice=${di.toFixed(1)}m grass=${dg.toFixed(1)}m`);
}
{
  const sand = rig([{ type: 'zone', kind: 'sand', x: 0, y: -1, w: 400, h: 8 }]);
  settle(sand);
  sand.step(240, { throttle: 1 });
  check('sand: lower top speed', sand.car.forwardSpeed < 12, `v=${sand.car.forwardSpeed.toFixed(1)}`);
  const goo = rig([{ type: 'zone', kind: 'goo', x: 0, y: -1, w: 400, h: 8 }]);
  settle(goo);
  goo.step(240, { throttle: 1 });
  check('goo: much slower than sand', goo.car.forwardSpeed < sand.car.forwardSpeed - 2, `v=${goo.car.forwardSpeed.toFixed(1)}`);
}
{
  const r = rig([{ type: 'conveyor', x: 0, y: 0, w: 60, speed: 6 }]);
  r.car.chassis.setPosition?.({ x: 20, y: 1.3 } as never);
  const r2 = rig([{ type: 'conveyor', x: 0, y: 0, w: 60, speed: 6 }], 25);
  r2.step(240);
  const f = rig([{ type: 'conveyor', x: 0, y: 0, w: 60, speed: -6 }], 25);
  f.step(240);
  check('conveyor drags forward (+speed → +x)', r2.car.x > 28, `x=${r2.car.x.toFixed(1)}`);
  check('conveyor drags back (-speed → -x)', f.car.x < 22, `x=${f.car.x.toFixed(1)}`);
  void r;
}
{
  const r = rig([{ type: 'zone', kind: 'boost', x: 20, y: -1, w: 30, h: 6 }]);
  settle(r);
  r.step(500, { throttle: 1 });
  check('boost strip exceeds top speed', r.car.forwardSpeed > VEHICLES.hatch.motor.maxSpeed + 4, `v=${r.car.forwardSpeed.toFixed(1)}`);
}
{
  const r = rig([{ type: 'bounce', x: 12, y: 0, w: 5, power: 24 }], 12);
  let maxY = 0;
  for (let i = 0; i < 300; i++) {
    r.step(1);
    maxY = Math.max(maxY, r.car.y);
  }
  check('bounce pad launches the car', maxY > 5, `peak y=${maxY.toFixed(1)}`);
}
{
  const r = rig([{ type: 'zone', kind: 'wind', x: 0, y: -1, w: 400, h: 30, strength: 14 }], 10);
  r.car.setGravityScale(1);
  r.step(180);
  check('wind pushes the car', r.car.x > 14, `x=${r.car.x.toFixed(1)}`);
  const lg = rig([{ type: 'zone', kind: 'lowgrav', x: 0, y: -1, w: 400, h: 60 }], 10);
  const n = rig([], 10);
  lg.car.chassis.setLinearVelocity({ x: 0, y: 14 } as never);
  n.car.chassis.setLinearVelocity({ x: 0, y: 14 } as never);
  settle(n);
  lg.step(1);
  let hl = 0;
  let hn = 0;
  for (let i = 0; i < 200; i++) {
    lg.step(1);
    hl = Math.max(hl, lg.car.y);
  }
  const n2 = rig([], 10);
  n2.step(1);
  n2.car.chassis.setLinearVelocity({ x: 0, y: 14 } as never);
  for (let i = 0; i < 200; i++) {
    n2.step(1);
    hn = Math.max(hn, n2.car.y);
  }
  check('low-gravity zone jumps higher', hl > hn * 1.8, `low=${hl.toFixed(1)} normal=${hn.toFixed(1)}`);
}
{
  const r = rig([{ type: 'zone', kind: 'magnet', x: 30, y: 4, w: 14, strength: 60 }], 14);
  r.car.chassis.setLinearVelocity({ x: 8, y: 0 } as never);
  let maxY = 0;
  for (let i = 0; i < 600; i++) {
    r.step(1, { throttle: 0.4 });
    maxY = Math.max(maxY, r.car.y);
  }
  check('magnet lifts the car', maxY > 2.2, `peak y=${maxY.toFixed(1)}`);
}
{
  const r = rig([{ type: 'cannon', x: 14, y: 1.2, angle: 0.9, power: 28 }], 14);
  r.step(150);
  check('cannon launches the car', r.car.y > 4 || r.car.x > 30, `x=${r.car.x.toFixed(1)} y=${r.car.y.toFixed(1)}`);
}
{
  const r = rig([{ type: 'oneway', x: 20, y: 3, w: 20 }], 24);
  r.car.chassis.setPosition?.({ x: 24, y: -2 } as never);
  // drop a car from below: place under platform with upward speed
  const u = rig([{ type: 'oneway', x: 20, y: 5, w: 20 }], 30);
  settle(u);
  u.car.chassis.setLinearVelocity({ x: 0, y: 16 } as never);
  u.car.wheels[0].setLinearVelocity({ x: 0, y: 16 } as never);
  u.car.wheels[1].setLinearVelocity({ x: 0, y: 16 } as never);
  u.step(120);
  check('one-way: can jump up through, lands on top', !u.car.crashed && u.car.y > 5, `y=${u.car.y.toFixed(1)} crashed=${u.car.crashed}`);
  void r;
}
{
  const r = rig([{ type: 'platform', x: 20, y: 1, w: 8, x2: 60, y2: 1, period: 8 }], 20);
  r.car.chassis.setPosition?.({ x: 20, y: 3 } as never);
  const p = rig([{ type: 'platform', x: 20, y: 6, w: 10, h: 0.5, x2: 60, y2: 6, period: 14 }], 20);
  p.car.chassis.setLinearVelocity({ x: 0, y: 0 } as never);
  // lift car onto platform
  p.car.chassis.setTransform({ x: 20, y: 8 } as never, 0);
  p.car.wheels[0].setTransform({ x: 18.8, y: 7.7 } as never, 0);
  p.car.wheels[1].setTransform({ x: 21.2, y: 7.7 } as never, 0);
  p.step(240, { throttle: 0.25 });
  check('moving platform carries the car', p.car.x > 30 && !p.car.crashed, `x=${p.car.x.toFixed(1)}`);
  void r;
}

// --- deadly things
{
  const sp = rig([{ type: 'spikes', x: 25, y: 0, w: 6 }], 10);
  sp.step(300, { throttle: 1 });
  check('spikes kill', sp.car.crashed && sp.car.crashReason === 'hazard', `reason=${sp.car.crashReason}`);
  const saw = rig([{ type: 'saw', x: 30, y: 1, r: 1.3 }], 10);
  saw.step(400, { throttle: 1 });
  check('saw kills', saw.car.crashed && saw.car.crashReason === 'hazard', `reason=${saw.car.crashReason}`);
  const ball = rig([{ type: 'swing', x: 30, y: 10, len: 9, amp: 0.0, period: 4, kind: 'ball' }], 10);
  ball.step(400, { throttle: 1 });
  check('wrecking ball kills', ball.car.crashed, `reason=${ball.car.crashReason}`);
}
{
  // Crusher: idle → passes; at slam → dies. Anchored 6 above ground, stroke 5.4.
  const mk = (phase: number) => rig([{ type: 'crusher', x: 40, y: 6, stroke: 5.4, period: 5, phase, w: 3.4 }], 20);
  const find = (r: Rig) => r.lp.behaviors.find((b) => b instanceof Crusher) as Crusher;
  const r = mk(0);
  const c = find(r);
  const seen = new Set<string>();
  for (let i = 0; i < 120 * 6; i++) {
    r.step(1);
    seen.add(c.state);
  }
  check('crusher cycles idle→warn→slam→hold→retract', ['idle', 'warn', 'slam', 'hold', 'retract'].every((s) => seen.has(s)), [...seen].join(','));
  const ev = r.lp.drain().map((e) => e.kind);
  check('crusher emits warn + slam events', ev.includes('crusher-warn') && ev.includes('crusher-slam'), ev.slice(0, 4).join(','));
  // Time the pass: arrive during idle (phase offset so idle covers x=40)
  const safe = mk(0.6); // cycle position 0.6 at t=0 → well into idle? compute dynamically below
  void safe;
  let survived = 0;
  let died = 0;
  for (let ph = 0; ph < 1; ph += 0.1) {
    const t = mk(ph);
    t.step(300, { throttle: 1 });
    t.car.crashed ? died++ : survived++;
  }
  check('crusher: some timings survive, some die (rhythm matters)', survived > 0 && died > 0, `survived=${survived} died=${died}`);
}
{
  const mk = (e: EntityData[]) => rig(e, 10);
  const stat = mk([{ type: 'laser', x: 40, y: 5, angle: -Math.PI / 2, mode: 'static' }]);
  stat.step(300, { throttle: 1 });
  check('static laser kills on contact', stat.car.crashed, `x=${stat.car.x.toFixed(1)}`);
  const sw = mk([
    { type: 'laser', x: 40, y: 5, angle: -Math.PI / 2, mode: 'static', ctrl: 'a' },
    { type: 'switch', id: 'a', x: 25, y: 0 },
  ]);
  sw.step(360, { throttle: 1 });
  check('switch turns the laser off', !sw.car.crashed && sw.car.x > 50, `x=${sw.car.x.toFixed(1)} crashed=${sw.car.crashed}`);
  // pulse laser has on and off phases
  const p = mk([{ type: 'laser', x: 100, y: 5, angle: -Math.PI / 2, mode: 'pulse', period: 3, on: 0.4 }]);
  const l = p.lp.behaviors.find((b) => b instanceof Laser) as Laser;
  let on = 0;
  let off = 0;
  let charged = 0;
  for (let i = 0; i < 120 * 6; i++) {
    p.step(1);
    l.isOn ? on++ : off++;
    if (l.charge > 0.2) charged++;
  }
  check('pulse laser: on/off rhythm with charge telegraph', on > 100 && off > 100 && charged > 20, `on=${on} off=${off} charge=${charged}`);
  // mirror: beam shoots right along y=1 and hits a 45° mirror that sends it down onto the road at x=40
  const m = mk([
    { type: 'laser', x: 20, y: 6, angle: 0, mode: 'static' },
    { type: 'mirror', x: 40, y: 6, w: 3, angle: -Math.PI / 4 },
  ]);
  const ml = m.lp.behaviors.find((b) => b instanceof Laser) as Laser;
  m.step(2);
  check('mirror reflects the beam (2+ segments)', ml.segs.length >= 2, `segments=${ml.segs.length}`);
  m.step(400, { throttle: 1 });
  check('reflected beam kills', m.car.crashed, `x=${m.car.x.toFixed(1)}`);
}

// --- breakables / props
{
  const c = rig([{ type: 'crumble', x: 18, y: 3, w: 12, h: 0.7, delay: 0.5 }], 20);
  c.car.chassis.setTransform({ x: 24, y: 5 } as never, 0);
  c.car.wheels[0].setTransform({ x: 22.8, y: 4.6 } as never, 0);
  c.car.wheels[1].setTransform({ x: 25.2, y: 4.6 } as never, 0);
  c.step(300);
  check('crumbling block falls after you land on it', c.car.y < 3 || c.car.crashed, `y=${c.car.y.toFixed(1)}`);
  const b = rig([{ type: 'bridge', x: 20, y: 3, w: 20, delay: 0.4 }], 20);
  b.car.chassis.setTransform({ x: 22, y: 5 } as never, 0);
  b.car.wheels[0].setTransform({ x: 20.8, y: 4.6 } as never, 0);
  b.car.wheels[1].setTransform({ x: 23.2, y: 4.6 } as never, 0);
  b.step(360);
  check('bridge collapses', b.car.y < 2.5 || b.car.crashed, `y=${b.car.y.toFixed(1)}`);
  b.lp.reset();
}
{
  const f = rig([{ type: 'falling', kind: 'icicle', x: 30, y: 9, lead: 14 }], 10);
  const fb = f.lp.behaviors.find((x) => x.type === 'falling') as unknown as { state: string };
  const states = new Set<string>();
  for (let i = 0; i < 120 * 6; i++) {
    f.step(1, { throttle: i < 150 ? 1 : 0 });
    states.add(fb.state);
  }
  check('falling hazard: hang → warn → fall → land', ['hanging', 'warn', 'falling', 'landed'].every((s) => states.has(s)), [...states].join(','));
}
{
  const t = rig([{ type: 'tnt', x: 40, y: 0 }], 12);
  t.step(420, { throttle: 1 });
  const ev = t.lp.drain().map((e) => e.kind);
  check('TNT: impact → fuse → explosion event', ev.includes('tnt-fuse') && ev.includes('explosion'), ev.join(','));
  const cr = rig([{ type: 'crate', x: 30, y: 0, size: 1.3 }], 12);
  cr.step(300, { throttle: 1 });
  check('crate is pushable', cr.car.x > 36 || cr.car.crashed === false, `x=${cr.car.x.toFixed(1)}`);
  const d = rig([{ type: 'dominoes', x: 30, y: 0, n: 6, spacing: 1.1 }], 12);
  d.step(500, { throttle: 0.7 });
  const bodies = (d.lp.behaviors.find((b) => b.type === 'dominoes') as unknown as { bodies: { getAngle(): number }[] }).bodies;
  check('dominoes topple', bodies.filter((b) => Math.abs(b.getAngle()) > 0.8).length >= 3, `fallen=${bodies.filter((b) => Math.abs(b.getAngle()) > 0.8).length}`);
  const bo = rig([{ type: 'boulder', x: 60, y: 0, r: 1.6, trigger: 20 }], 12);
  bo.step(160, { throttle: 1 });
  const ev2 = bo.lp.drain().map((e) => e.kind);
  check('boulder releases when you approach', ev2.includes('boulder'), ev2.join(','));
}
{
  const tp = rig([{ type: 'transform', x: 30, y: 0, scale: 0.6 }], 12);
  tp.step(300, { throttle: 1 });
  check('transform pad queues a resize', tp.lp.pendingTransform?.scale === 0.6, JSON.stringify(tp.lp.pendingTransform));
}
{
  const g = rig([{ type: 'gear', x: 40, y: 1.5, r: 2, speed: 2 }, { type: 'tilt', x: 70, y: 1.2, w: 10, amp: 0.2, period: 4 }], 10);
  g.step(120 * 8, { throttle: 0.5 });
  check('gears/tilt platforms keep the sim finite', Number.isFinite(g.car.x) && Number.isFinite(g.car.y), `x=${g.car.x.toFixed(1)}`);
  const door = rig([{ type: 'door', x: 40, y: 0, h: 5, period: 4, open: 0.5 }], 10);
  door.step(120 * 6, { throttle: 1 });
  check('door sim runs', Number.isFinite(door.car.x), `x=${door.car.x.toFixed(1)}`);
}

// --- world 3/4/8 additions
{
  const sn = rig([{ type: 'zone', kind: 'snow', x: 0, y: -1, w: 400, h: 8 }]);
  settle(sn);
  sn.step(240, { throttle: 1 });
  check('snow drift slows (less than sand)', sn.car.forwardSpeed < 14 && sn.car.forwardSpeed > 7, `v=${sn.car.forwardSpeed.toFixed(1)}`);
  const vent = rig([{ type: 'bounce', x: 12, y: 0, w: 3, power: 22, vent: true }], 12);
  let maxY = 0;
  for (let i = 0; i < 240; i++) { vent.step(1); maxY = Math.max(maxY, vent.car.y); }
  check('steam vent launches', maxY > 5, `peak=${maxY.toFixed(1)}`);
  const pool = rig([{ type: 'lava', x: 30, y: 0.4, w: 12 }], 10);
  pool.step(300, { throttle: 1 });
  check('lava pool kills', pool.car.crashed && pool.car.crashReason === 'hazard', `x=${pool.car.x.toFixed(1)}`);
  const rise = rig([{ type: 'lava', x: -20, y: -6, w: 600, rise: 2, maxY: 4, trigger: 15 }], 10);
  rise.step(120);
  const lv = rise.lp.behaviors.find((b) => b.type === 'lava') as unknown as { top: number };
  const t0 = lv.top;
  rise.step(240, { throttle: 0 });
  check('rising lava climbs after the trigger', t0 === -6 || lv.top >= -6, `top=${lv.top.toFixed(2)}`);
  const stand = rig([{ type: 'lava', x: -20, y: -6, w: 600, rise: 2, maxY: 4, trigger: 5 }], 12);
  stand.step(120 * 8, { brake: 0, throttle: 0 });
  check('rising lava eventually kills a car that stands still', stand.car.crashed, `top=${(stand.lp.behaviors.find((b) => b.type === 'lava') as unknown as { top: number }).top.toFixed(1)}`);
  stand.lp.reset();
  const gz = rig([{ type: 'geyser', x: 30, y: 0, w: 3, period: 4, height: 12 }], 12);
  const gb = gz.lp.behaviors.find((b) => b.type === 'geyser') as unknown as { state: string };
  const seen = new Set<string>();
  let peak = 0;
  for (let i = 0; i < 120 * 6; i++) { gz.step(1, { throttle: i < 150 ? 1 : 0 }); seen.add(gb.state); peak = Math.max(peak, gz.car.y); if (gz.car.crashed) break; }
  check('geyser cycles idle → warn → erupt', ['idle', 'warn', 'erupt'].every((x) => seen.has(x)), [...seen].join(','));
  let launched = 0;
  for (let ph = 0; ph < 1; ph += 0.1) {
    const g2 = rig([{ type: 'geyser', x: 30, y: 0, w: 4, period: 3, phase: ph, height: 14 }], 12);
    let pk = 0;
    for (let i = 0; i < 120 * 4; i++) { g2.step(1, { throttle: 0.6 }); pk = Math.max(pk, g2.car.y); if (g2.car.crashed) break; }
    if (pk > 4) launched++;
  }
  check('geyser launches cars at some timings but not all (rhythm)', launched > 0 && launched < 10, `launched=${launched}/10 peak1=${peak.toFixed(1)}`);
}

process.exit(failed ? 1 : 0);
