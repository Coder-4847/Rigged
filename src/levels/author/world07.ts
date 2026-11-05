import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 7 — Skyline (61–70). New ideas: rooftop gaps, wind gusts, bounce pads, tilting plates, falling signs. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], hidden: 'flat' | 'hill' | 'dip' = 'flat') =>
  makeLevel({ id, name, world: 7, hint, deco: ['crate', 'rock', 'crate'], hidden, antiFlip: 0.4, body });

export const world07: LevelData[] = [
  mk(61, 'Rooftops', 'Gap to gap — keep your speed', (c) => {
    K.jump(c, 'S');
    K.jump(c, 'M');
    K.jump(c, 'M');
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.jump(c, 'S');
  }),
  mk(62, 'Gusts', 'A tailwind stretches a jump, a headwind slows you', (c) => {
    K.windJump(c, 'M', 8);
    K.wind(c, 40, 10, true);
    K.cp(c);
    K.windJump(c, 'L', 7);
    K.wind(c, 44, 12, true);
    K.windJump(c, 'M', 8);
  }, 'hill'),
  mk(63, 'Bounce Up', 'Springboards fling you high — find the landing', (c) => {
    K.bounce(c);
    K.rolling(c, 2, 3, 22);
    K.bounce(c);
    K.cp(c);
    K.jump(c, 'M');
    K.bounce(c);
  }),
  mk(64, 'Tilting Roofs', 'The plates rock — cross them smoothly', (c) => {
    K.tiltGap(c, 14);
    K.run(c, 24);
    K.tiltGap(c, 16);
    K.cp(c);
    K.tiltGap(c, 18);
    K.jump(c, 'S');
    K.tiltGap(c, 16);
  }, 'dip'),
  mk(65, 'Falling Signs', 'Billboards drop — watch the warning ring', (c) => {
    K.fallers(c, ['sign', 'sign', 'sign']);
    K.rolling(c, 2, 3, 22);
    K.fallers(c, ['sign', 'sign', 'sign', 'sign'], 20);
    K.cp(c);
    K.jump(c, 'M');
    K.fallers(c, ['sign', 'sign', 'sign', 'sign'], 20);
  }),
  mk(66, 'Long Leap', 'Two big gaps — land on the downslope', (c) => {
    K.jump(c, 'XL', { recover: true });
    K.rolling(c, 2, 4, 26);
    K.cp(c);
    K.jump(c, 'XL', { recover: true });
    K.jump(c, 'L', { recover: true });
    K.jump(c, 'XL', { recover: true });
  }, 'hill'),
  mk(67, 'Crosswind', 'Wind and gaps together', (c) => {
    K.wind(c, 36, 12, true);
    K.windJump(c, 'L', 8);
    K.cp(c);
    K.wind(c, 40, 12, true);
    K.windJump(c, 'M', 8);
    K.bounce(c);
  }),
  mk(68, 'Antenna Run', 'Plates, gusts and springboards', (c) => {
    K.tiltGap(c, 16);
    K.windJump(c, 'M', 8);
    K.cp(c);
    K.bounce(c);
    K.tiltGap(c, 18);
    K.cp(c);
    K.windJump(c, 'L', 8);
    K.tiltGap(c, 16);
  }, 'dip'),
  mk(69, 'Billboard Bash', 'Signs, springs and gaps', (c) => {
    K.fallers(c, ['sign', 'sign', 'sign']);
    K.jump(c, 'L', { recover: true });
    K.cp(c);
    K.bounce(c);
    K.fallers(c, ['sign', 'sign', 'sign', 'sign'], 20);
    K.cp(c);
    K.tiltGap(c, 16);
    K.jump(c, 'XL', { recover: true });
  }),
  mk(70, 'Skyline Gauntlet', 'Across the whole city', (c) => {
    K.jump(c, 'M');
    K.windJump(c, 'L', 8);
    K.cp(c);
    K.tiltGap(c, 18);
    K.fallers(c, ['sign', 'sign', 'sign']);
    K.cp(c);
    K.bounce(c);
    K.wind(c, 40, 12, true);
    K.cp(c);
    K.jump(c, 'XL', { recover: true });
    K.tiltGap(c, 18);
    K.cp(c);
    K.fallers(c, ['sign', 'sign', 'sign', 'sign'], 20);
    K.windJump(c, 'L', 8);
  }, 'hill'),
];
