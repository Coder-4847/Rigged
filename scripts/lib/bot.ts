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
import { Autopilot } from '../../src/core/Autopilot';
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
  /** Best-known line through the level (later attempts overwrite earlier ones; 0.5 m buckets). */
  path: Array<{ x: number; y: number; v: number; g: boolean }>;
  /** Time of a clean run: the successful stretches only, retries and start delays excluded. */
  cleanTime: number;
  /** Where each attempt ended (x, reason). */
  deathLog: Array<{ x: number; reason: string | null }>;
}

export interface BotOptions {
  maxTime?: number;
  /** Allow respawning at checkpoints (like a player would). */
  retries?: number;
  traceEvery?: number;
  /** Delay before the very first attempt (for timing experiments). */
  firstWait?: number;
  /** Override the spawn point. */
  from?: [number, number];
  /** Debug hook called every step. */
  onStep?: (car: Car, lp: LevelPhysics, t: number) => void;
}

export function runBot(level: LevelData, opts: BotOptions = {}): BotResult {
  const dt = 1 / 120;
  const maxTime = opts.maxTime ?? 900;
  const pw = new PhysicsWorld();
  const lp = new LevelPhysics(pw, level);
  const def = VEHICLES.hatch;
  let respawn: [number, number] = opts.from ?? level.spawn;
  let carCp = -1;
  let car = new Car(pw, def, respawn[0], respawn[1], { antiFlip: level.antiFlip ?? 1, boostAllowed: !!level.boost });
  lp.setCar(car);
  const inp: InputState = { throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false };
  let deaths = 0;
  let t = 0;
  const collected = new Set<number>();
  const pending = new Set<number>();
  const trace: BotResult['trace'] = [];
  let exploded = false;
  const deathLog: BotResult['deathLog'] = [];
  // Attempts start after a different delay each time, so hazard rhythms line up eventually.
  let attempt = 0;
  let attemptT0 = 0;
  let wait = opts.firstWait ?? 0;
  const pathMap = new Map<number, { x: number; y: number; v: number; g: boolean; att: number; rel: number }>();
  let result: Partial<BotResult> = {};
  const retries = opts.retries ?? 80;
  const pilot = new Autopilot(level);

  for (let i = 0; i < maxTime / dt; i++) {
    t = i * dt;
    pilot.drive(car, dt, inp, lp);
    if (wait > 0) {
      wait -= dt;
      inp.throttle = 0;
      inp.brake = 0;
      inp.tilt = 0;
    }
    car.update(dt, inp);
    lp.update(dt);
    pw.step(dt);

    opts.onStep?.(car, lp, t);
    {
      const q = car.chassis.getPosition();
      pathMap.set(Math.floor(q.x * 2), { x: q.x, y: q.y, v: car.forwardSpeed, g: car.grounded, att: attempt, rel: t - attemptT0 - 0 });
    }
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
      deathLog.push({ x: Math.round(p.x), reason: car.crashReason });
      if (deaths > retries) {
        result = { finished: false, crashed: true, crashReason: car.crashReason };
        break;
      }
      pending.clear();
      car.destroy();
      lp.reset();
      car = new Car(pw, def, respawn[0], respawn[1], { antiFlip: level.antiFlip ?? 1, boostAllowed: !!level.boost });
      lp.setCar(car);
      pilot.reset();
      attempt++;
      attemptT0 = t;
      wait = (attempt * 0.618 * 1.37) % 3.2;
    }
  }
  const path = [...pathMap.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e);
  // clean time = for each attempt that owns part of the final line, the time it spent on that part
  const span = new Map<number, [number, number]>();
  for (const e of path) {
    const s0 = span.get(e.att);
    if (!s0) span.set(e.att, [e.rel, e.rel]);
    else span.set(e.att, [Math.min(s0[0], e.rel), Math.max(s0[1], e.rel)]);
  }
  let cleanTime = 0;
  for (const [a, b] of span.values()) cleanTime += b - a;
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
    path: path.map(({ x, y, v, g }) => ({ x, y, v, g })),
    cleanTime,
    deathLog,
  };
}
