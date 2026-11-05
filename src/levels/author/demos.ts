import { LevelBuilder } from '../builder';
import type { LevelData } from '../types';

/**
 * Hazard demo levels (ids 901+). One small playground per obstacle family — used to eyeball
 * telegraphing/sfx and by the smoke test (no physics explosions). Not part of the 100.
 * Open with `?level=901` … `?level=906`.
 */
const mk = (id: number, name: string, par: number, hint?: string, extra: Partial<ConstructorParameters<typeof LevelBuilder>[0]> = {}) => {
  const L = new LevelBuilder({ id, name, world: 1, parTime: par, hint, ...extra });
  L.cursor = { x: -30, y: 0 };
  return L;
};
const finish = (L: LevelBuilder, x: number) => {
  L.spawnAt(-10).finishAt(x).starAt(30, 3, 3.2).starAt(62, 3, 3.4).starAt(-26, 1.3);
  L.scatter(['bush', 'rock'], -34, x, 14);
  return L.build();
};

/** 901 — Surfaces: ice, sand, goo, conveyors, boost strip, bounce pad. */
function d901(): LevelData {
  const L = mk(901, 'Demo · Surfaces', 40, 'Ice → sand → goo → belts → boost → bounce');
  L.ground((t) => t.flat(50));
  L.ground((t) => t.flat(46), 'ice'); // x 20..66
  L.ground((t) => t.flat(300));
  L.zone('sand', 80, 120).zone('goo', 130, 148);
  L.push({ type: 'conveyor', x: 160, y: 0, w: 26, speed: 6 });
  L.push({ type: 'conveyor', x: 196, y: 0, w: 26, speed: -6 });
  L.zone('boost', 232, 256, { angle: 0 });
  L.push({ type: 'bounce', x: 280, y: 0, w: 5, power: 24 });
  L.sign(-4, 'ICE: LOW GRIP').sign(76, 'SAND: SLOW').sign(126, 'GOO: STICKY').sign(156, 'BELT →').sign(192, 'BELT ←').sign(228, 'BOOST').sign(272, 'BOUNCE PAD');
  return finish(L, 330);
}

/** 902 — Crushers: vertical rhythm sequence, a side piston, and a ceiling tunnel. */
function d902(): LevelData {
  const L = mk(902, 'Demo · Crushers', 40, 'Watch the lamp — slam follows the warning');
  L.ground((t) => t.flat(300));
  [30, 52, 74, 96].forEach((x, i) => L.push({ type: 'crusher', x, y: 7.4, stroke: 6.6, period: 4.2, phase: i * 0.22, w: 3.4 }));
  L.push({ type: 'crusher', x: 140, y: 1.6, dir: 'left', stroke: 6, period: 4.6, w: 3.0 });
  L.ceiling(165, 215, 7.2);
  [175, 188, 201].forEach((x, i) => L.push({ type: 'crusher', x, y: 7.2, stroke: 6.4, period: 3.6, phase: i * 0.33, w: 3.0 }));
  L.sign(0, 'LAMP FLASHES → SLAM');
  return finish(L, 250);
}

/** 903 — Lasers: switch-off, sweep, pulse, mirror, tracking turret, switch-door. */
function d903(): LevelData {
  const L = mk(903, 'Demo · Lasers', 45, 'Hit the switch to cut the beam', { dark: false });
  L.ground((t) => t.flat(330));
  L.push({ type: 'switch', id: 'a', x: 14, y: 0 });
  L.push({ type: 'laser', x: 36, y: 7, angle: -Math.PI / 2, mode: 'static', ctrl: 'a' });
  L.push({ type: 'laser', x: 72, y: 7.5, angle: -Math.PI / 2, mode: 'sweep', amp: 0.75, period: 4.4 });
  L.push({ type: 'laser', x: 106, y: 7, angle: -Math.PI / 2, mode: 'pulse', period: 3.2, on: 0.4 });
  L.push({ type: 'switch', id: 'b', x: 124, y: 0 });
  L.push({ type: 'laser', x: 134, y: 6, angle: 0, mode: 'static', ctrl: 'b' });
  L.push({ type: 'mirror', x: 156, y: 6, w: 3, angle: -Math.PI / 4 });
  L.push({ type: 'laser', x: 200, y: 9, angle: -Math.PI / 2, mode: 'track' });
  L.push({ type: 'switch', id: 'c', x: 226, y: 0 });
  L.push({ type: 'door', x: 244, y: 0, h: 6, ctrl: 'c' });
  L.sign(0, 'SWITCH TURNS LASER OFF').sign(100, 'PULSE: GO ON THE GAP').sign(228 - 16, 'SWITCH OPENS DOOR');
  return finish(L, 290);
}

/** 904 — Movers: platform over a pit, gears, wrecking ball, tilt plate, door rhythm, saw, spikes. */
function d904(): LevelData {
  const L = mk(904, 'Demo · Movers', 50, 'Everything that moves');
  L.ground((t) => t.flat(50));
  L.ground((t) => t.gap(26).flat(70));
  L.push({ type: 'platform', x: 24.5, y: -0.25, w: 9, x2: 41.5, y2: -0.25, period: 7 });
  L.push({ type: 'gear', x: 92, y: 0.9, r: 2.2, speed: 1.6, teeth: 9 });
  L.push({ type: 'gear', x: 104, y: 0.9, r: 2.2, speed: -1.6, teeth: 9 });
  L.ground((t) => t.flat(50));
  L.push({ type: 'swing', x: 142, y: 11.5, len: 10, amp: 0.85, period: 4, kind: 'ball' });
  L.ground((t) => t.flat(14).gap(16).flat(40));
  L.push({ type: 'tilt', x: 188, y: -0.2, w: 10, amp: 0.22, period: 5 });
  L.push({ type: 'door', x: 208, y: 0, h: 5.5, period: 5.5, open: 0.55 });
  L.push({ type: 'saw', x: 232, y: 1.4, r: 1.3, x2: 250, y2: 1.4, period: 3.6 });
  L.ground((t) => t.flat(60).launch(8, 1.8).slope(0.2, -1.8).flat(60));
  L.push({ type: 'spikes', x: L.cursor.x - 60 + 0.4, y: 0, w: 5 });
  return finish(L, L.cursor.x - 30);
}

/** 905 — Breakables & props: crumble blocks, bridge, icicles/rock/sign, TNT, crates, dominoes, boulder. */
function d905(): LevelData {
  const L = mk(905, 'Demo · Breakables', 50, 'Crumbling, falling, exploding');
  L.ground((t) => t.flat(50));
  L.ground((t) => t.gap(32).flat(30));
  [21, 27.5, 34, 40.5, 47].forEach((x) => L.push({ type: 'crumble', x, y: 0, w: 6, h: 0.7, delay: 0.45 }));
  L.ground((t) => t.gap(26).flat(80));
  L.push({ type: 'bridge', x: 82, y: 0, w: 26, delay: 0.5 });
  L.ceiling(110, 175, 10.4);
  L.push({ type: 'falling', kind: 'icicle', x: 120, y: 9.3, lead: 18 });
  L.push({ type: 'falling', kind: 'rock', x: 140, y: 9.2, lead: 20 });
  L.push({ type: 'falling', kind: 'sign', x: 160, y: 8.6, lead: 20 });
  L.ground((t) => t.flat(150));
  L.push({ type: 'tnt', x: 200, y: 0 });
  L.push({ type: 'crate', x: 225, y: 0, size: 1.3 });
  L.push({ type: 'crate', x: 225, y: 1.3, size: 1.3 });
  L.push({ type: 'dominoes', x: 245, y: 0, n: 7, spacing: 1.2 });
  L.push({ type: 'boulder', x: 280, y: 0, r: 1.6, trigger: 262 });
  L.sign(190, 'TNT: GENTLE… OR NOT');
  return finish(L, 320);
}

/** 906 — Forces: wind, low-gravity, flipped gravity, magnets, vacuum tube, cannon, one-way, transform pads. */
function d906(): LevelData {
  const L = mk(906, 'Demo · Forces', 60, 'Wind, gravity, magnets, cannon, one-way, size pads');
  L.ground((t) => t.flat(900));
  L.zone('wind', 30, 70, { angle: Math.PI, strength: 12, h: 12 });
  L.zone('lowgrav', 100, 160, { h: 60, y: -1 });
  L.zone('flipgrav', 186, 236, { h: 40, y: -1 });
  L.ceiling(180, 240, 21);
  L.push({ type: 'zone', kind: 'magnet', x: 276, y: 7.5, w: 14, strength: 55 });
  L.push({ type: 'zone', kind: 'magnet', x: 312, y: 5, w: 12, strength: -60 });
  L.zone('vacuum', 346, 386, { angle: 0, h: 6, y: -1 });
  L.push({ type: 'cannon', x: 408, y: 1.2, angle: 0.75, power: 31 });
  L.push({ type: 'bounce', x: 452, y: 0, w: 5, power: 26 });
  L.push({ type: 'oneway', x: 462, y: 6, w: 20 });
  L.push({ type: 'transform', x: 500, y: 0, scale: 0.6 });
  L.push({ type: 'transform', x: 530, y: 0, scale: 1.5, h: 8 });
  L.push({ type: 'transform', x: 560, y: 0, scale: 1 });
  L.sign(26, 'HEADWIND').sign(96, 'LOW GRAVITY: TILT!').sign(180, 'GRAVITY FLIPS — ROTATE').sign(272, 'MAGNETS').sign(342, 'VACUUM TUBE').sign(400, 'CANNON').sign(496, 'SIZE PADS');
  return finish(L, 620);
}

export const demos: LevelData[] = [d901(), d902(), d903(), d904(), d905(), d906()];
