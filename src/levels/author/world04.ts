import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 4 — Factory (31–40). New ideas: conveyors, gears, crushers, moving platforms, steam vents. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], hidden: 'flat' | 'hill' | 'dip' = 'flat') =>
  makeLevel({ id, name, world: 4, hint, deco: ['crate', 'rock', 'crate'], hidden, antiFlip: 0.7, body });

export const world04: LevelData[] = [
  mk(31, 'Assembly Line', 'Belts carry you — gas keeps you ahead', (c) => {
    K.conveyor(c, 24, 6);
    K.rolling(c, 2, 2.5, 22);
    K.conveyor(c, 34, 7);
    K.jump(c, 'S');
    K.conveyor(c, 30, 6);
  }),
  mk(32, 'Backwards Belt', 'Some belts run against you', (c) => {
    K.conveyor(c, 24, -6);
    K.run(c, 20);
    K.conveyor(c, 34, -7);
    K.cp(c);
    K.jump(c, 'M');
    K.conveyor(c, 30, -6);
    K.conveyor(c, 24, 7);
  }, 'hill'),
  mk(33, 'Gear Works', 'Drive over the turning gears', (c) => {
    K.gears(c, 2);
    K.rolling(c, 2, 2.5, 22);
    K.gears(c, 3);
    K.cp(c);
    K.jump(c, 'S');
    K.gears(c, 4);
  }),
  mk(34, 'First Press', 'The lamp flashes before each slam', (c) => {
    K.crushers(c, 1);
    K.rolling(c, 2, 2.5, 22);
    K.crushers(c, 2);
    K.cp(c);
    K.crushers(c, 2, { period: 4.2 });
  }, 'dip'),
  mk(35, 'Press Row', 'Find the rhythm — one clean run clears the row', (c) => {
    K.crushers(c, 4);
    K.cp(c);
    K.rolling(c, 2, 3, 22);
    K.crushers(c, 3, { period: 4.0, jitter: 0.06 });
    K.cp(c);
    K.crushers(c, 4, { period: 4.2, jitter: 0.08, spacing: 20 });
  }),
  mk(36, 'Moving Parts', 'Wait for the platform, then go', (c) => {
    K.platformGap(c, 24, 7);
    K.rolling(c, 2, 3, 22);
    K.platformGap(c, 28, 7.5);
    K.cp(c);
    K.platformGap(c, 30, 8);
  }),
  mk(37, 'Steam Vents', 'Vents launch you — land on the flat', (c) => {
    K.bounce(c, { vent: true });
    K.rolling(c, 2, 3, 22);
    K.bounce(c, { vent: true });
    K.cp(c);
    K.jump(c, 'M');
    K.bounce(c, { vent: true });
  }, 'hill'),
  mk(38, 'Belt & Press', 'Conveyors into crushers', (c) => {
    K.conveyor(c, 24, 6);
    K.crushers(c, 2);
    K.cp(c);
    K.conveyor(c, 30, -6);
    K.run(c, 24);
    K.crushers(c, 3, { period: 4.2 });
    K.cp(c);
    K.conveyor(c, 28, 7);
    K.jump(c, 'S');
  }),
  mk(39, 'Sparks & Saws', 'Saws rise and fall — watch the blade', (c) => {
    K.saw(c, 2);
    K.gears(c, 2);
    K.cp(c);
    K.saw(c, 3, { period: 3.4 });
    K.crushers(c, 2);
    K.cp(c);
    K.conveyor(c, 26, 6);
    K.saw(c, 3, { period: 3.4 });
  }),
  mk(40, 'Factory Gauntlet', 'The whole production line', (c) => {
    K.conveyor(c, 26, 6);
    K.crushers(c, 3);
    K.cp(c);
    K.platformGap(c, 26, 7);
    K.saw(c, 2);
    K.cp(c);
    K.bounce(c, { vent: true });
    K.gears(c, 3);
    K.cp(c);
    K.conveyor(c, 30, -6);
    K.crushers(c, 4, { period: 4.2, jitter: 0.06 });
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.saw(c, 3, { period: 3.4 });
  }, 'dip'),
];
