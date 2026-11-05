import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 3 — Frostbite (21–30). New ideas: ice, snowdrifts, falling icicles, icy slopes, breakable ice floors. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], hidden: 'flat' | 'hill' | 'dip' = 'flat') =>
  makeLevel({ id, name, world: 3, hint, deco: ['pine', 'pine', 'rock', 'bush'], hidden, antiFlip: 0.8, body });

export const world03: LevelData[] = [
  mk(21, 'Icy Start', 'Ice is slippery — brake early, steer with the gas', (c) => {
    K.run(c, 20);
    K.ice(c, 46);
    K.rolling(c, 2, 3, 24);
    K.ice(c, 60);
    K.run(c, 24);
    K.jump(c, 'S');
  }),
  mk(22, 'Snowdrifts', 'Deep snow drags — keep the gas down', (c) => {
    K.zone(c, 'snow', 30);
    K.rolling(c, 2, 3.5, 24);
    K.zone(c, 'snow', 44);
    K.cp(c);
    K.jump(c, 'M');
    K.zone(c, 'snow', 36);
    K.rolling(c, 2, 4, 26);
  }, 'hill'),
  mk(23, 'Slippery Slopes', 'Downhill on ice is fast — and hard to stop', (c) => {
    K.iceSlope(c, 5);
    K.ice(c, 36);
    K.run(c, 24);
    K.iceSlope(c, 8);
    K.cp(c);
    K.jump(c, 'S');
    K.iceSlope(c, 7);
  }),
  mk(24, 'Falling Icicles', 'A ring on the ground marks where one will drop', (c) => {
    K.fallers(c, ['icicle', 'icicle']);
    K.rolling(c, 2, 3, 22);
    K.fallers(c, ['icicle', 'icicle', 'icicle']);
    K.cp(c);
    K.fallers(c, ['icicle', 'icicle', 'icicle', 'icicle'], 20);
  }, 'dip'),
  mk(25, 'Thin Ice', 'The ice floor breaks — don’t stop on it', (c) => {
    K.crumbles(c, 3, 0.5);
    K.run(c, 24);
    K.crumbles(c, 4, 0.46);
    K.cp(c);
    K.rolling(c, 2, 3, 22);
    K.crumbles(c, 5, 0.42);
    K.jump(c, 'S');
  }),
  mk(26, 'Frozen Lake', 'Long ice, then a jump — build speed first', (c) => {
    K.run(c, 40);
    K.ice(c, 70);
    K.run(c, 60);
    K.cp(c);
    K.jump(c, 'M');
    K.ice(c, 50);
    K.rolling(c, 2, 3, 26);
    K.run(c, 40);
    K.jump(c, 'L', { recover: true });
  }, 'hill'),
  mk(27, 'Avalanche Alley', 'Rocks and icicles fall — keep moving', (c) => {
    K.fallers(c, ['rock', 'icicle', 'rock']);
    K.zone(c, 'snow', 30);
    K.cp(c);
    K.boulder(c);
    K.fallers(c, ['icicle', 'rock', 'icicle', 'rock'], 20);
    K.cp(c);
    K.jump(c, 'M');
  }),
  mk(28, 'Glacier Jumps', 'Big air over crevasses', (c) => {
    K.jump(c, 'L', { recover: true });
    K.ice(c, 40);
    K.run(c, 30);
    K.jump(c, 'XL', { recover: true });
    K.cp(c);
    K.rolling(c, 2, 4, 28);
    K.jump(c, 'L', { recover: true });
    K.zone(c, 'snow', 26);
    K.jump(c, 'M');
  }, 'dip'),
  mk(29, 'Ice Cave', 'Ice, icicles and thin floors — in one tunnel', (c) => {
    K.ice(c, 40);
    K.fallers(c, ['icicle', 'icicle', 'icicle']);
    K.cp(c);
    K.crumbles(c, 4, 0.44);
    K.zone(c, 'snow', 28);
    K.fallers(c, ['rock', 'icicle'], 22);
    K.cp(c);
    K.iceSlope(c, 6);
    K.crumbles(c, 4, 0.42);
  }),
  mk(30, 'Frostbite Gauntlet', 'Everything frozen — one run', (c) => {
    K.ice(c, 40);
    K.crumbles(c, 4, 0.44);
    K.fallers(c, ['icicle', 'icicle', 'icicle']);
    K.cp(c);
    K.zone(c, 'snow', 34);
    K.jump(c, 'XL', { recover: true });
    K.boulder(c);
    K.cp(c);
    K.iceSlope(c, 7);
    K.fallers(c, ['rock', 'icicle', 'rock'], 20);
    K.crumbles(c, 5, 0.4);
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.ice(c, 30);
    K.jump(c, 'M');
  }, 'hill'),
];
