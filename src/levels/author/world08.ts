import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 8 — Lava Core (71–80). New ideas: lava pits, geysers, swinging chains, rock bridges, rising lava. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], hidden: 'flat' | 'hill' | 'dip' = 'flat') =>
  makeLevel({ id, name, world: 8, hint, deco: ['rock', 'rock', 'bush'], hidden, antiFlip: 0.4, body });

export const world08: LevelData[] = [
  mk(71, 'Hot Start', 'Lava is deadly — jump it', (c) => {
    K.lavaPit(c, 'M');
    K.rolling(c, 2, 3, 22);
    K.lavaPit(c, 'L');
    K.cp(c);
    K.lavaPit(c, 'L');
  }),
  mk(72, 'Geysers', 'Bubbling means it’s about to blow', (c) => {
    K.geyser(c, 1);
    K.rolling(c, 2, 3, 22);
    K.geyser(c, 2);
    K.cp(c);
    K.geyser(c, 3, 4.2);
  }, 'dip'),
  mk(73, 'Swinging Chains', 'Time the wrecking ball', (c) => {
    K.swing(c, 1);
    K.rolling(c, 2, 3, 22);
    K.swing(c, 2);
    K.cp(c);
    K.swing(c, 2, { len: 12, period: 4.4 });
  }),
  mk(74, 'Rock Bridge', 'The bridge falls into the lava — don’t stop', (c) => {
    K.lavaBridge(c, 24);
    K.rolling(c, 2, 3, 22);
    K.lavaBridge(c, 30, 0.46);
    K.cp(c);
    K.lavaBridge(c, 36, 0.42);
  }, 'hill'),
  mk(75, 'Rising Heat', 'The valley floods — climb out fast', (c) => {
    K.floodValley(c, 9, 1.0);
    K.run(c, 24);
    K.floodValley(c, 11, 1.1);
    K.cp(c);
    K.floodValley(c, 12, 1.2);
  }),
  mk(76, 'Magma Hop', 'Pits, geysers and hops', (c) => {
    K.lavaPit(c, 'M');
    K.geyser(c, 2);
    K.cp(c);
    K.jump(c, 'M');
    K.lavaPit(c, 'L');
    K.geyser(c, 2, 4.2);
  }),
  mk(77, 'Chain Gang', 'Balls, blades and lava', (c) => {
    K.swing(c, 2);
    K.saw(c, 2);
    K.cp(c);
    K.lavaPit(c, 'L');
    K.swing(c, 2, { len: 12, period: 4.4 });
    K.cp(c);
    K.saw(c, 3, { period: 3.4 });
  }, 'dip'),
  mk(78, 'Lava Falls', 'Rising lava and rock bridges', (c) => {
    K.floodValley(c, 10, 1.1);
    K.lavaBridge(c, 28, 0.46);
    K.cp(c);
    K.floodValley(c, 12, 1.2);
    K.geyser(c, 2);
    K.cp(c);
    K.lavaBridge(c, 34, 0.42);
  }),
  mk(79, 'Caldera', 'The crater rim', (c) => {
    K.lavaPit(c, 'L');
    K.floodValley(c, 11, 1.15);
    K.cp(c);
    K.swing(c, 2);
    K.geyser(c, 2, 4.2);
    K.cp(c);
    K.lavaBridge(c, 32, 0.44);
    K.jump(c, 'L', { recover: true });
  }, 'hill'),
  mk(80, 'Lava Core Gauntlet', 'Into the heart', (c) => {
    K.lavaPit(c, 'L');
    K.geyser(c, 2);
    K.cp(c);
    K.floodValley(c, 12, 1.2);
    K.swing(c, 2, { len: 12, period: 4.4 });
    K.cp(c);
    K.lavaBridge(c, 34, 0.42);
    K.saw(c, 3, { period: 3.4 });
    K.cp(c);
    K.geyser(c, 3, 4.2);
    K.lavaPit(c, 'XL');
    K.cp(c);
    K.floodValley(c, 13, 1.25);
    K.jump(c, 'L', { recover: true });
  }, 'dip'),
];
