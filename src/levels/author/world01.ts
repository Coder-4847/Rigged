import { LevelBuilder } from '../builder';
import type { LevelData } from '../types';

/**
 * World 1 — Grasslands (levels 1–10). Tutorial world: throttle, brake, ramps, gaps, air tilt, seesaws.
 * Each level introduces or twists exactly one idea. Authoring helpers live in ../builder.ts;
 * run `npm run levels` to regenerate the JSON in src/levels/world01/.
 */
const START = -30;
const mk = (id: number, name: string, parTime: number, hint?: string) => {
  const L = new LevelBuilder({ id, name, world: 1, parTime, antiFlip: 1, hint });
  L.cursor = { x: START, y: 0 };
  return L;
};
const trees = ['tree', 'tree', 'bush', 'rock', 'flower'] as const;

/** 1 — First Drive: just hold gas. Hidden star is *behind* you. */
function l1(): LevelData {
  const L = mk(1, 'First Drive', 18, 'Hold → to drive');
  L.ground((t) => t.flat(55).ease(24, 3).flat(16).ease(26, -3).flat(28).bumps(36, 0.45, 5).flat(22).ease(30, 4).flat(56));
  L.spawnAt(-10).finishAt(L.cursor.x - 14);
  L.starAt(57, 2.4).starAt(137, 2.8).starAt(-26, 1.3);
  L.sign(-8, 'HOLD → TO DRIVE').sign(110, 'BUMPS AHEAD');
  L.scatter([...trees], -34, L.cursor.x, 9);
  return L.build();
}

/** 2 — Brake Check: a long descent builds speed; ease off and use ← to stay in control. */
function l2(): LevelData {
  const L = mk(2, 'Brake Check', 22, 'Press ← to brake (hold to reverse)');
  L.ground((t) =>
    t
      .flat(40)
      .ease(20, -1)
      .slope(56, -11)
      .ease(14, -1)
      .flat(26)
      .ease(18, 2.5)
      .ease(18, -2.5)
      .flat(14)
      .ease(18, 2.5)
      .ease(18, -2.5)
      .flat(16)
      .launch(8, 1.4)
      .gap(5)
      .flat(34)
      .ease(24, 3)
      .flat(50),
  );
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(40, 3).starAt(180, 3.2).starAt(-26, 1.3);
  L.sign(-10, '← BRAKE').sign(20, 'STEEP HILL — EASE OFF');
  L.scatter([...trees], -34, L.cursor.x, 10);
  return L.build();
}

/** 3 — Little Hops: ramps and small gaps. */
function l3(): LevelData {
  const L = mk(3, 'Little Hops', 18, 'Ramps launch you over gaps');
  L.ground((t) =>
    t
      .flat(46)
      .launch(7, 1.4)
      .gap(4)
      .flat(26)
      .launch(8, 1.8)
      .gap(5.5)
      .flat(26)
      .launch(9, 2.2)
      .gap(6.5)
      .flat(30)
      .ease(20, 2)
      .flat(12)
      .launch(9, 2)
      .gap(6)
      .flat(60),
  );
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(21, 3, 3.6).starAt(89, 3.4, 4.2).starAt(-26, 1.3);
  L.sign(0, 'RAMP → GAP: KEEP YOUR SPEED');
  L.scatter([...trees], -34, L.cursor.x, 10);
  return L.build();
}

/** 4 — Nose Up: air tilt. Land with your wheels on the slope. */
function l4(): LevelData {
  const L = mk(4, 'Nose Up', 18, 'Tilt in the air with ↑ / ↓');
  L.ground((t) =>
    t
      .flat(46)
      .launch(14, 4.5)
      .gap(11, -5)
      .slope(24, -8) // downhill landing: tilt nose DOWN to match
      .flat(26)
      .launch(12, 4.2)
      .gap(7, 1.5)
      .slope(22, 6) // uphill landing: tilt nose UP
      .flat(24)
      .launch(14, 4.5)
      .gap(10, -3)
      .flat(60),
  );
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(26, 3, 6).starAt(130, 3, 11).starAt(-26, 1.3);
  L.sign(8, '↑ NOSE UP   ↓ NOSE DOWN');
  L.scatter([...trees], -34, L.cursor.x, 10);
  return L.build();
}

/** 5 — Seesaw Sam: first seesaws. Drive steady across; the plank tips as you pass the middle. */
function l5(): LevelData {
  const L = mk(5, 'Seesaw Sam', 21, 'Drive steadily across the seesaw');
  L.ground((t) => t.flat(70));
  L.seesaw(START + 54, 12, 0.34);
  L.ground((t) => t.flat(14).ease(18, 2).flat(60));
  L.seesaw(L.cursor.x - 30, 14, 0.36);
  L.ground((t) => t.flat(20).ease(16, -2).flat(24).launch(8, 1.6).gap(5).flat(60));
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(36, 3.2, 3.2).starAt(112, 3, 4).starAt(-26, 1.3);
  L.sign(10, 'SEESAW: DRIVE ACROSS');
  L.scatter([...trees], -34, L.cursor.x, 10);
  return L.build();
}

/** 6 — Rolling Hills: pure throttle control over big rolling terrain. */
function l6(): LevelData {
  const L = mk(6, 'Rolling Hills', 22, 'Ease off at the crests to stay grounded');
  L.ground((t) => {
    t.flat(44);
    const hills: Array<[number, number]> = [[20, 4], [22, -5], [24, 6], [20, -4], [26, 7], [22, -7], [20, 5], [24, -6], [28, 8], [24, -8]];
    for (const [w, h] of hills) t.ease(w, h);
    t.flat(8).bumps(30, 0.6, 5).flat(40);
  });
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(30, 3).starAt(110, 3.5).starAt(-26, 1.3);
  L.scatter([...trees], -34, L.cursor.x, 9);
  return L.build();
}

/** 7 — Big Air: long, high jumps with generous landings. */
function l7(): LevelData {
  const L = mk(7, 'Big Air', 22, 'Hit the ramp at full speed');
  L.ground((t) =>
    t
      .flat(60)
      .launch(18, 6.5)
      .gap(13.5, -4)
      .slope(34, -9)
      .flat(26)
      .launch(16, 6)
      .gap(12, -3)
      .flat(30)
      .launch(20, 8)
      .gap(15, -5)
      .slope(30, -8)
      .flat(60),
  );
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(33, 4, 10).starAt(122, 4, 8).starAt(-26, 1.3);
  L.sign(10, 'MEGA RAMP AHEAD');
  L.scatter([...trees], -34, L.cursor.x, 10);
  return L.build();
}

/** 8 — Valley Run: build momentum down, then carry it up the far wall. */
function l8(): LevelData {
  const L = mk(8, 'Valley Run', 21, 'Carry your speed up the far side');
  L.ground((t) =>
    t
      .flat(34)
      .ease(30, -12)
      .flat(16)
      .ease(34, 14)
      .flat(24)
      .ease(30, -10)
      .flat(12)
      .ease(30, 13)
      .flat(20)
      .slope(22, 8)
      .flat(14)
      .launch(10, 2.4)
      .gap(7)
      .flat(60),
  );
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(60, 4).starAt(220, 4, 7).starAt(-26, 1.3);
  L.scatter([...trees, 'rock'], -34, L.cursor.x, 10);
  return L.build();
}

/** 9 — Seesaw Gauntlet: three planks, changing heights. */
function l9(): LevelData {
  const L = mk(9, 'Seesaw Gauntlet', 23, 'Plank after plank — stay smooth');
  L.ground((t) => t.flat(66));
  L.seesaw(START + 54, 12, 0.36);
  L.ground((t) => t.flat(4).ease(12, 2.5).flat(34));
  L.seesaw(L.cursor.x - 16, 14, 0.38);
  L.ground((t) => t.flat(8).ease(14, -3).flat(34));
  L.seesaw(L.cursor.x - 18, 16, 0.4);
  L.ground((t) => t.flat(14).launch(9, 1.8).gap(6).flat(26).ease(20, 3).flat(50));
  L.spawnAt(-12).finishAt(L.cursor.x - 14);
  L.starAt(40, 3, 3.6).starAt(120, 3.4, 5).starAt(-26, 1.3);
  L.scatter([...trees], -34, L.cursor.x, 10);
  return L.build();
}

/** 10 — Grasslands Gauntlet: boss run mixing hills, ramps, tilt landings and a seesaw. 2 checkpoints. */
function l10(): LevelData {
  const L = mk(10, 'Grasslands Gauntlet', 48, 'Everything you learned — one run');
  L.ground((t) =>
    t.flat(44).ease(24, 3).ease(24, -4).bumps(28, 0.55, 4).flat(10).launch(10, 2.4).gap(6).flat(24).launch(14, 4.5).gap(11, -5).slope(22, -7).flat(20),
  );
  const cp1 = L.cursor.x - 8;
  L.ground((t) => t.flat(30));
  L.seesaw(L.cursor.x - 15, 14, 0.38);
  L.ground((t) => t.flat(10).ease(20, 4).ease(20, -5).flat(18).launch(18, 6.5).gap(14, -4).slope(30, -8).flat(28));
  const cp2 = L.cursor.x - 8;
  L.ground((t) => t.launch(12, 4.2).gap(7, 1.5).slope(22, 6).flat(20).bumps(30, 0.6, 5).flat(14).launch(9, 2).gap(6).flat(40));
  L.seesaw(L.cursor.x - 18, 16, 0.38);
  L.ground((t) => t.flat(30).launch(14, 4.5).gap(10, -3).flat(60));
  L.spawnAt(-12).checkpointAt(cp1).checkpointAt(cp2).finishAt(L.cursor.x - 14);
  L.starAt(40, 3).starAt(cp1 - 30, 4, 6).starAt(-26, 1.3);
  L.sign(0, 'GAUNTLET: 2 CHECKPOINTS');
  L.scatter([...trees], -34, L.cursor.x, 9);
  return L.build();
}

export const world01: LevelData[] = [l1(), l2(), l3(), l4(), l5(), l6(), l7(), l8(), l9(), l10()];
