import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/**
 * World 2 — Desert Ruins (11–20). New ideas: sand slowdown, crumbling blocks, collapsing bridges,
 * rolling boulders, spike pits, ramps into dunes.
 */
const deco = ['cactus', 'rock', 'cactus', 'bush', 'crate'] as const;
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], hidden: 'flat' | 'hill' | 'dip' = 'flat') =>
  makeLevel({ id, name, world: 2, hint, deco: [...deco], hidden, antiFlip: 0.9, body });

export const world02: LevelData[] = [
  mk(11, 'Dune Drive', 'Dunes roll — let gravity do the work', (c) => {
    K.rolling(c, 3, 3.5, 26);
    K.run(c, 20);
    K.rolling(c, 3, 4.5, 28);
    K.jump(c, 'S');
    K.rolling(c, 2, 4, 30);
  }),
  mk(12, 'Sandy Slog', 'Sand drags you down — keep the gas on', (c) => {
    K.zone(c, 'sand', 30);
    K.rolling(c, 2, 3, 24);
    K.zone(c, 'sand', 44);
    K.cp(c);
    K.jump(c, 'S');
    K.zone(c, 'sand', 36);
    K.rolling(c, 2, 4, 26);
  }, 'hill'),
  mk(13, 'Crumble Canyon', 'Blocks crumble after you touch them — don’t stop', (c) => {
    K.crumbles(c, 3);
    K.run(c, 24);
    K.rolling(c, 2, 3, 22);
    K.crumbles(c, 4);
    K.cp(c);
    K.crumbles(c, 5, 0.42);
    K.jump(c, 'S');
  }),
  mk(14, 'Rickety Bridge', 'Bridges collapse behind you — keep moving', (c) => {
    K.bridge(c, 22);
    K.rolling(c, 2, 3.5, 24);
    K.bridge(c, 30, 0.45);
    K.cp(c);
    K.zone(c, 'sand', 26);
    K.bridge(c, 36, 0.42);
  }, 'dip'),
  mk(15, 'Spike Pit', 'Jump the spikes — they’re always lit orange', (c) => {
    K.spikes(c, 5);
    K.rolling(c, 2, 3, 24);
    K.spikes(c, 6);
    K.cp(c);
    K.zone(c, 'sand', 30);
    K.jump(c, 'M');
    K.spikes(c, 7);
  }),
  mk(16, 'Boulder Run', 'A boulder is coming — keep ahead of it', (c) => {
    K.boulder(c);
    K.rolling(c, 2, 3, 24);
    K.cp(c);
    K.boulder(c);
    K.zone(c, 'sand', 24);
    K.jump(c, 'M');
    K.boulder(c);
  }, 'hill'),
  mk(17, 'Dune Jumps', 'Land on the downslope of each dune', (c) => {
    K.jump(c, 'L', { recover: true });
    K.rolling(c, 2, 4, 28);
    K.cp(c);
    K.jump(c, 'XL', { recover: true });
    K.rolling(c, 2, 4.5, 28);
    K.jump(c, 'L', { recover: true });
    K.jump(c, 'M');
  }),
  mk(18, 'Buried Ruins', 'Crumbling floors over spikes', (c) => {
    K.crumbles(c, 3);
    K.spikes(c, 5);
    K.cp(c);
    K.bridge(c, 26, 0.45);
    K.zone(c, 'sand', 30);
    K.crumbles(c, 4, 0.42);
    K.spikes(c, 6);
    K.cp(c);
    K.jump(c, 'M');
  }, 'dip'),
  mk(19, 'Sand Trap', 'Slow sand, falling bridges, rolling rocks', (c) => {
    K.zone(c, 'sand', 40);
    K.bridge(c, 28, 0.42);
    K.cp(c);
    K.boulder(c);
    K.zone(c, 'sand', 30);
    K.spikes(c, 6);
    K.cp(c);
    K.crumbles(c, 4, 0.4);
    K.boulder(c);
    K.jump(c, 'L', { recover: true });
  }),
  mk(20, 'Tomb Gauntlet', 'Everything the desert has — one run', (c) => {
    K.rolling(c, 2, 3.5, 24);
    K.crumbles(c, 4, 0.42);
    K.spikes(c, 6);
    K.cp(c);
    K.zone(c, 'sand', 36);
    K.bridge(c, 34, 0.4);
    K.boulder(c);
    K.cp(c);
    K.jump(c, 'XL', { recover: true });
    K.zone(c, 'sand', 28);
    K.crumbles(c, 5, 0.4);
    K.spikes(c, 7);
    K.cp(c);
    K.boulder(c);
    K.jump(c, 'L', { recover: true });
  }, 'hill'),
];
