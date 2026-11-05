import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/**
 * World 9 — Zero-G Station (81–90). Low gravity everywhere (jumps are twice as long), low-gravity bubbles,
 * a gravity-flip room, and air tilt as the main skill.
 */
const G = -13;
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], o: { hidden?: 'flat' | 'hill' | 'dip'; manual?: boolean } = {}) =>
  makeLevel({ id, name, world: 9, hint, deco: ['crate', 'rock'], hidden: o.hidden ?? 'flat', gravity: G, manual: o.manual, antiFlip: 0.3, body });

export const world09: LevelData[] = [
  mk(81, 'Float On', 'Gravity is half — everything flies farther', (c) => {
    K.rolling(c, 2, 3, 26);
    K.jump(c, 'S');
    K.rolling(c, 2, 4, 28);
    K.jump(c, 'M');
    K.jump(c, 'S');
  }),
  mk(82, 'Low-G Leaps', 'Bubbles make gravity even weaker — tilt to land', (c) => {
    K.lowgravJump(c);
    K.rolling(c, 2, 3, 26);
    K.lowgravJump(c, 15);
    K.cp(c);
    K.lowgravJump(c, 17);
  }, { hidden: 'hill' }),
  mk(83, 'Moon Bounce', 'Springs in low gravity = serious air', (c) => {
    K.bounce(c);
    K.rolling(c, 2, 3, 26);
    K.bounce(c);
    K.cp(c);
    K.jump(c, 'M');
    K.bounce(c);
  }),
  mk(84, 'Spin Cycle', 'Big turning gears and rocking plates', (c) => {
    K.gears(c, 3);
    K.tiltGap(c, 16);
    K.cp(c);
    K.gears(c, 3);
    K.tiltGap(c, 18);
    K.gears(c, 4);
  }),
  mk(85, 'Air Control', 'Rotate in the air to match the landing slope', (c) => {
    K.jump(c, 'L', { recover: true });
    K.rolling(c, 2, 4, 28);
    K.cp(c);
    K.jump(c, 'XL', { recover: true });
    K.lowgravJump(c, 16);
    K.jump(c, 'L', { recover: true });
  }, { hidden: 'dip' }),
  mk(86, 'Rotating Room', 'Platforms and plates in orbit', (c) => {
    K.tiltGap(c, 16);
    K.gears(c, 2);
    K.cp(c);
    K.tiltGap(c, 18);
    K.gears(c, 2);
  }),
  mk(87, 'Gravity Flip', 'Inside the field gravity points UP — spin the car 180°', (c) => {
    K.rolling(c, 2, 3, 26);
    K.flipRoom(c, 46);
    K.cp(c);
    K.jump(c, 'S');
  }, { manual: true }),
  mk(88, 'Zero-G Slalom', 'Presses and floating jumps', (c) => {
    K.crushers(c, 2);
    K.lowgravJump(c);
    K.cp(c);
    K.crushers(c, 3, { period: 4.0 });
    K.lowgravJump(c, 15);
  }, { hidden: 'hill' }),
  mk(89, 'Station Alert', 'Lasers in the corridors', (c) => {
    K.laser(c, 'pulse', { n: 2 });
    K.lowgravJump(c);
    K.cp(c);
    K.laser(c, 'spin', { n: 2 });
    K.jump(c, 'L', { recover: true });
    K.cp(c);
    K.switchLaser(c, { n: 2 });
    K.lowgravJump(c, 16);
  }),
  mk(90, 'Zero-G Gauntlet', 'Float through the whole station', (c) => {
    K.lowgravJump(c);
    K.crushers(c, 3, { period: 4.0 });
    K.cp(c);
    K.laser(c, 'pulse', { n: 3, period: 3 });
    K.jump(c, 'XL', { recover: true });
    K.cp(c);
    K.gears(c, 3);
    K.tiltGap(c, 20);
    K.cp(c);
    K.laser(c, 'spin', { n: 2 });
    K.lowgravJump(c, 17);
    K.cp(c);
    K.tiltGap(c, 18);
    K.jump(c, 'L', { recover: true });
  }, { hidden: 'dip' }),
];
