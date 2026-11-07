import { LevelBuilder } from '../builder';
import type { LevelData } from '../types';

/**
 * World 1 — Grasslands (levels 1–10). Tutorial world, but never a "hold → for 15 seconds" world: every level is
 * short (roughly 10–20 s for a clean run) and something happens every couple of seconds — water gaps, crests that
 * throw you into the air, boost strips, springs, seesaws, big ramps. Each level still leads with one idea.
 * Authoring helpers live in ../builder.ts; run `npm run levels` to regenerate the JSON in src/levels/world01/.
 */
const START = -30;
const mk = (id: number, name: string, hint?: string) => {
  const L = new LevelBuilder({ id, name, world: 1, parTime: 20, antiFlip: 1, hint });
  L.cursor = { x: START, y: 0 };
  return L;
};
const trees = ['tree', 'tree', 'bush', 'pine', 'rock', 'flower', 'bush'] as const;

/** Boost strip on the flat ground starting at the cursor (the ground must already exist there). */
function boost(L: LevelBuilder, w = 8): void {
  const x0 = L.cursor.x;
  L.ground((t) => t.flat(w));
  L.zone('boost', x0, x0 + w, { angle: 0 });
}

/** Spring pad at the cursor, then a water gap and a long landing. */
function spring(L: LevelBuilder, gap = 12, power = 21, landing = 34): void {
  L.ground((t) => t.flat(5));
  L.push({ type: 'bounce', x: L.cursor.x - 2.5, y: L.cursor.y, w: 4, power });
  L.ground((t) => t.gap(gap).flat(landing));
}

/** Wooden rope bridge over the water (planks drop a moment after you cross them). */
function bridge(L: LevelBuilder, w = 18, delay = 0.8): void {
  L.ground((t) => t.flat(6));
  const x0 = L.cursor.x;
  L.ground((t) => t.gap(w).flat(14));
  L.push({ type: 'bridge', x: x0, y: L.cursor.y, w, delay });
}

/** Finish pad + hidden star + scenery. */
function finish(L: LevelBuilder, runout = 26): LevelData {
  L.ground((t) => t.flat(runout));
  L.spawnAt(-12).finishAt(L.cursor.x - 12);
  L.ground((t) => t.flat(34)); // run-off past the gate so a fast finish coasts to a stop on land
  L.starAt(-26, 1.3);
  L.scatter([...trees], -34, L.cursor.x, 7);
  return L.build();
}

/** Two stars whose x the generator snaps onto the bot's line (0 = on it, 1 = on an airborne stretch). */
function stars(L: LevelBuilder, a: number, b: number): void {
  const at = (x: number, dy: number) => {
    try {
      return L.y(x) + dy;
    } catch {
      return 4; // over a gap
    }
  };
  L.starAt(a, 0, at(a, 2.6)).starAt(b, 0, at(b, 3.4));
}

/** 1 — First Drive: hold gas. Crests, little hops over water, one proper ramp. */
function l1(): LevelData {
  const L = mk(1, 'First Drive', 'Hold → to drive');
  L.ground((t) => t.flat(28).ease(12, 2).ease(12, -2).flat(8).launch(7, 1.4).gap(5).flat(14).ease(12, 2.4).ease(12, -2.4).flat(6));
  L.arrow(L.cursor.x + 6);
  L.ground((t) => t.launch(9, 2.2).gap(7).flat(16).ease(16, -2.2).flat(6).bumps(16, 0.45, 4));
  bridge(L, 18, 1);
  boost(L, 6);
  L.ground((t) => t.launch(10, 2.6).gap(8).flat(14).ease(14, -2.6));
  stars(L, 40, 82);
  L.sign(-6, 'HOLD → TO DRIVE');
  return finish(L);
}

/** 2 — Splash Jumps: ramp after ramp over the water, each a little bigger. */
function l2(): LevelData {
  const L = mk(2, 'Splash Jumps', 'Keep the gas down over the water');
  L.ground((t) => t.flat(24).launch(7, 1.4).gap(5).flat(12).launch(8, 1.8).gap(6).flat(12).launch(9, 2.2).gap(7).flat(12));
  L.arrow(L.cursor.x + 4);
  L.ground((t) => t.launch(11, 3).gap(9).flat(14).ease(20, -6.4).flat(8));
  boost(L, 8);
  L.ground((t) => t.flat(2).launch(12, 3.4).gap(12).flat(18).ease(16, -3.4));
  stars(L, 30, 120);
  L.sign(-6, 'RAMP → WATER → KEEP GOING');
  return finish(L);
}

/** 3 — Drop Zone: drive off ledges onto downhill runs, then brake for a tight landing pad. */
function l3(): LevelData {
  const L = mk(3, 'Drop Zone', 'Press ← to brake (hold to reverse)');
  L.cursor = { x: START, y: 8 };
  L.ground((t) => t.flat(26).gap(6, -2.5).slope(26, -5.5).flat(10).ease(10, 1.6).gap(6, -1.6).slope(20, -4).flat(10));
  L.ground((t) => t.bumps(18, 0.5, 4).flat(6).launch(9, 2.2).gap(7).flat(12).ease(12, -2.2));
  L.ground((t) => t.flat(10).slope(18, -6).flat(4).launch(9, 2.4).gap(8).flat(12).ease(12, -2.4).flat(4).gap(5, -2).slope(14, -3).flat(6));
  stars(L, 22, 70);
  L.sign(-6, '← BRAKES');
  return finish(L);
}

/** 4 — Nose Up: air tilt to match the landing slope. */
function l4(): LevelData {
  const L = mk(4, 'Nose Up', 'Tilt in the air with ↑ / ↓');
  L.ground((t) => t.flat(26).launch(12, 4).gap(10, -4).slope(20, -7).flat(12));
  L.ground((t) => t.launch(11, 3.6).gap(7, 1.4).slope(16, 5).flat(10));
  L.ground((t) => t.launch(12, 4).gap(10, -3.5).slope(18, -6).flat(8).ease(10, 2).ease(10, -2).flat(6));
  boost(L, 6);
  L.ground((t) => t.launch(14, 4.6).gap(12, -4).slope(22, -7).flat(8));
  stars(L, 30, 112);
  L.sign(-6, '↑ NOSE UP   ↓ NOSE DOWN');
  return finish(L);
}

/** 5 — Seesaw Sam: planks between hops. */
function l5(): LevelData {
  const L = mk(5, 'Seesaw Sam', 'Seesaws tip as you cross — or launch you at full speed!');
  L.ground((t) => t.flat(86));
  L.seesaw(START + 44, 12, 0.34);
  L.ground((t) => t.launch(8, 1.8).gap(6).flat(56));
  L.seesaw(L.cursor.x - 46, 14, 0.36);
  L.ground((t) => t.launch(8, 1.8).gap(6).flat(10).ease(10, -1.8).flat(54));
  L.seesaw(L.cursor.x - 44, 12, 0.38);
  boost(L, 6);
  L.ground((t) => t.launch(10, 2.6).gap(8).flat(14).ease(12, -2.6));
  stars(L, 40, 98);
  L.sign(-6, 'SEESAW: DRIVE ACROSS');
  return finish(L);
}

/** 6 — Whoops: fast crests throw you into the air — stars float above them. */
function l6(): LevelData {
  const L = mk(6, 'Whoops', 'Crests throw you up — tilt to land flat');
  L.ground((t) => {
    t.flat(24);
    const hills: Array<[number, number]> = [[10, 2.4], [10, -2.4], [11, 3], [11, -3], [12, 3.6], [12, -3.6]];
    for (const [w, h] of hills) t.ease(w, h);
    t.flat(6).launch(8, 1.8).gap(6).flat(10);
    for (const [w, h] of hills) t.ease(w, h);
    t.flat(6).bumps(16, 0.55, 4).flat(6);
  });
  boost(L, 6);
  L.ground((t) => t.ease(12, 3).ease(12, -3).ease(13, 4).ease(13, -4).flat(4));
  stars(L, 34, 64);
  L.sign(-6, 'WHOOPS AHEAD');
  return finish(L);
}

/** 7 — Big Air: boost strips into mega ramps. Room for a backflip. */
function l7(): LevelData {
  const L = mk(7, 'Big Air', 'Hit the ramp at full speed — try a flip!');
  L.ground((t) => t.flat(22));
  boost(L, 8);
  L.arrow(L.cursor.x + 6);
  L.ground((t) => t.flat(2).launch(16, 6).gap(16, -6).slope(26, -6).flat(10).ease(10, 2).ease(10, -2).flat(6));
  boost(L, 8);
  L.ground((t) => t.flat(2).launch(18, 7).gap(18, -6).slope(28, -8).flat(14));
  stars(L, 30, 58);
  L.sign(-6, 'MEGA RAMP AHEAD');
  return finish(L);
}

/** 8 — Bounce House: springs fling you over the water. */
function l8(): LevelData {
  const L = mk(8, 'Bounce House', 'Springs fling you — keep moving');
  L.ground((t) => t.flat(26));
  spring(L, 10, 19, 22);
  L.ground((t) => t.ease(10, 2).ease(10, -2).flat(4));
  spring(L, 12, 21, 18);
  L.ground((t) => t.launch(8, 1.8).gap(6).flat(10).ease(10, -1.8).flat(6));
  spring(L, 14, 23, 30);
  stars(L, 22, 70);
  L.sign(-6, 'SPRINGS!');
  return finish(L);
}

/** 9 — Mixed Bag: seesaw, springs, whoops and a drop, back to back. */
function l9(): LevelData {
  const L = mk(9, 'Mixed Bag', 'A bit of everything — stay smooth');
  L.ground((t) => t.flat(72));
  L.seesaw(START + 38, 12, 0.36);
  L.ground((t) => t.ease(10, 2.6).ease(10, -2.6).ease(11, 3.2).ease(11, -3.2).flat(4));
  spring(L, 12, 21, 26);
  L.seesaw(L.cursor.x - 13, 12, 0.36);
  L.ground((t) => t.flat(2).launch(11, 3.6).gap(8, -3.6).slope(16, -4).flat(6));
  bridge(L, 22, 0.6);
  boost(L, 6);
  L.ground((t) => t.launch(12, 3.2).gap(10).flat(14).ease(14, -3.2));
  stars(L, 26, 110);
  return finish(L);
}

/** 10 — Grasslands Gauntlet: everything, two checkpoints. */
function l10(): LevelData {
  const L = mk(10, 'Grasslands Gauntlet', 'Everything you learned — one run');
  L.ground((t) => t.flat(26).ease(10, 2.4).ease(10, -2.4).launch(8, 1.8).gap(6).flat(10).launch(12, 4).gap(10, -4).slope(18, -6).flat(10));
  L.ground((t) => t.flat(50));
  L.seesaw(L.cursor.x - 36, 12, 0.36);
  const cp1 = L.cursor.x - 12;
  spring(L, 12, 21, 24);
  boost(L, 8);
  L.ground((t) => t.flat(2).launch(16, 6).gap(16, -6).slope(24, -6).flat(14));
  const cp2 = L.cursor.x - 6;
  bridge(L, 20, 0.6);
  L.ground((t) => t.ease(11, 3).ease(11, -3).ease(12, 3.6).ease(12, -3.6).flat(4).launch(11, 3.6).gap(7, 1.4).slope(14, 4).flat(10).ease(14, -9).flat(32));
  L.seesaw(L.cursor.x - 16, 14, 0.38);
  L.ground((t) => t.flat(12));
  spring(L, 12, 22, 20);
  boost(L, 6);
  L.ground((t) => t.launch(14, 4.6).gap(12, -4).slope(22, -7).flat(10));
  L.checkpointAt(cp1).checkpointAt(cp2);
  stars(L, 60, cp2 + 30);
  L.sign(-6, 'GAUNTLET: 2 CHECKPOINTS');
  return finish(L);
}

export const world01: LevelData[] = [l1(), l2(), l3(), l4(), l5(), l6(), l7(), l8(), l9(), l10()];
