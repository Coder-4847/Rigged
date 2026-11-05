/**
 * Headless level runner + simple driving bot used by the smoke test and level tuning.
 * The bot holds gas, aligns the nose with its velocity in the air, and backs up when stalled.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { Car } from '../../src/entities/Car';
import { LevelPhysics } from '../../src/entities/LevelPhysics';
import { VEHICLES } from '../../src/config';
import type { LevelData } from '../../src/levels/types';
import { surfaceY } from '../../src/levels/builder';
import type { Pt } from '../../src/levels/builder';
import type { InputState } from '../../src/core/Input';

export function loadLevelsFromDisk(): LevelData[] {
  const root = join(import.meta.dirname, '..', '..', 'src', 'levels');
  const out: LevelData[] = [];
  for (const d of readdirSync(root).filter((n) => /^(world\d+|demo)$/.test(n)).sort()) {
    for (const f of readdirSync(join(root, d)).filter((n) => n.endsWith('.json')).sort()) {
      out.push(JSON.parse(readFileSync(join(root, d, f), 'utf8')) as LevelData);
    }
  }
  return out.sort((a, b) => a.id - b.id);
}

export interface BotResult {
  finished: boolean;
  crashed: boolean;
  crashReason: string | null;
  time: number;
  progress: number;
  deaths: number;
  stars: number;
  exploded: boolean;
  trace: Array<{ t: number; x: number; y: number; v: number; g: boolean }>;
}

export interface BotOptions {
  maxTime?: number;
  /** Allow respawning at checkpoints (like a player would). */
  retries?: number;
  traceEvery?: number;
  /** Debug hook called every step. */
  onStep?: (car: Car, lp: LevelPhysics, t: number) => void;
}

export function runBot(level: LevelData, opts: BotOptions = {}): BotResult {
  const dt = 1 / 120;
  const maxTime = opts.maxTime ?? 150;
  const pw = new PhysicsWorld();
  const lp = new LevelPhysics(pw, level);
  const def = VEHICLES.hatch;
  let respawn: [number, number] = level.spawn;
  let carCp = -1;
  let car = new Car(pw, def, respawn[0], respawn[1], { antiFlip: level.antiFlip ?? 1, boostAllowed: !!level.boost });
  lp.setCar(car);
  const inp: InputState = { throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false };
  let deaths = 0;
  let t = 0;
  let stall = 0;
  let backup = 0;
  const collected = new Set<number>();
  const pending = new Set<number>();
  const trace: BotResult['trace'] = [];
  let exploded = false;
  let result: Partial<BotResult> = {};
  const retries = opts.retries ?? 3;
  const lines: Pt[][] = level.entities.flatMap((e) => (e.type === 'terrain' ? [e.points as Pt[]] : []));

  /** Predict where a ballistic flight lands and the ground angle there (what a good player aims for). */
  const landingAngle = (x: number, y: number, vx: number, vy: number): number | null => {
    const g = -(level.gravity ?? -26);
    for (let k = 1; k < 200; k++) {
      const tt = k * 0.02;
      const px = x + vx * tt;
      const py = y + vy * tt - 0.5 * g * tt * tt;
      const sy = surfaceY(lines, px);
      if (sy !== null && py < sy + 0.9 && vy - g * tt < 0) {
        const y0 = surfaceY(lines, px - 1.5);
        const y1 = surfaceY(lines, px + 1.5);
        if (y0 === null || y1 === null) return 0;
        return Math.atan2(y1 - y0, 3);
      }
    }
    return null;
  };

  for (let i = 0; i < maxTime / dt; i++) {
    t = i * dt;
    inp.throttle = 1;
    inp.brake = 0;
    inp.tilt = 0;
    if (backup > 0) {
      backup -= dt;
      inp.throttle = 0;
      inp.brake = 1;
    } else if (car.grounded && Math.abs(car.forwardSpeed) < 1.2) {
      stall += dt;
      if (stall > 1.2) {
        backup = 1.6;
        stall = 0;
      }
    } else stall = 0;
    const p0 = car.chassis.getPosition();
    if (!car.grounded && car.airTime > 0.15) {
      const v = car.chassis.getLinearVelocity();
      let want = Math.atan2(v.y, v.x);
      if (v.y < 2) {
        const la = landingAngle(p0.x, p0.y, v.x, v.y);
        if (la !== null) want = la;
      }
      const err = want - car.chassis.getAngle();
      inp.tilt = Math.max(-1, Math.min(1, err * 2.2 - car.chassis.getAngularVelocity() * 0.35));
    }
    car.update(dt, inp);
    lp.update(dt);
    pw.step(dt);

    opts.onStep?.(car, lp, t);
    const p = car.chassis.getPosition();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 5000 || Math.abs(p.y) > 5000) {
      exploded = true;
      break;
    }
    if (opts.traceEvery && i % Math.round(opts.traceEvery / dt) === 0)
      trace.push({ t, x: p.x, y: p.y, v: car.forwardSpeed, g: car.grounded });

    // stars / checkpoints / finish
    level.stars.forEach((s, k) => {
      if (Math.hypot(p.x - s[0], p.y - s[1]) < 1.9) pending.add(k);
    });
    level.checkpoints.forEach((c, k) => {
      if (k > carCp && p.x > c[0]) {
        carCp = k;
        respawn = [c[0], c[1] + 1.3];
        pending.forEach((s) => collected.add(s));
        pending.clear();
      }
    });
    if (p.x > level.finish[0]) {
      pending.forEach((s) => collected.add(s));
      result = { finished: true, crashed: false, crashReason: null };
      break;
    }
    if (car.crashed) {
      deaths++;
      if (deaths > retries) {
        result = { finished: false, crashed: true, crashReason: car.crashReason };
        break;
      }
      pending.clear();
      car.destroy();
      lp.reset();
      car = new Car(pw, def, respawn[0], respawn[1], { antiFlip: level.antiFlip ?? 1, boostAllowed: !!level.boost });
      lp.setCar(car);
      stall = 0;
      backup = 0;
    }
  }
  const x = car.chassis.getPosition().x;
  const progress = Math.max(0, Math.min(1, (x - level.spawn[0]) / (level.finish[0] - level.spawn[0])));
  return {
    finished: !!result.finished,
    crashed: !!result.crashed,
    crashReason: result.crashReason ?? null,
    time: t,
    progress,
    deaths,
    stars: collected.size,
    exploded,
    trace,
  };
}
