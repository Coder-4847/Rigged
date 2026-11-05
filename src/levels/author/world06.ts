import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 6 — Magnet Mines (51–60). New ideas: magnets, metal crates, dark tunnels (headlights), crumbling supports, TNT. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], o: { hidden?: 'flat' | 'hill' | 'dip'; dark?: boolean } = {}) =>
  makeLevel({ id, name, world: 6, hint, deco: ['rock', 'crate', 'rock'], hidden: o.hidden ?? 'flat', dark: o.dark, antiFlip: 0.5, body });

export const world06: LevelData[] = [
  mk(51, 'Into the Mines', 'Headlights on — the tunnel is dark', (c) => {
    K.tunnel(c, 70);
    K.rolling(c, 2, 2.5, 22);
    K.crates(c, 2, 'metal');
    K.jump(c, 'S');
    K.tunnel(c, 50);
  }, { dark: true }),
  mk(52, 'Magnet Lift', 'Magnets pull you up — fly over the pit', (c) => {
    K.magnetPull(c, 14);
    K.rolling(c, 2, 2.5, 22);
    K.magnetPull(c, 17);
    K.cp(c);
    K.jump(c, 'S');
    K.magnetPull(c, 18);
  }, { hidden: 'hill' }),
  mk(53, 'Repulsion', 'Blue magnets push you away', (c) => {
    K.magnetPull(c, 16, 'below');
    K.rolling(c, 2, 3, 22);
    K.magnetPull(c, 20, 'below');
    K.cp(c);
    K.magnetPull(c, 14);
    K.magnetPull(c, 22, 'below');
  }),
  mk(54, 'Metal Crates', 'Heavy crates — hit them fast or go around', (c) => {
    K.crates(c, 3, 'metal');
    K.tnt(c);
    K.crates(c, 3, 'metal');
    K.cp(c);
    K.tunnel(c, 40);
    K.crates(c, 3, 'wood');
    K.rolling(c, 2, 2.5, 22);
  }, { dark: true }),
  mk(55, 'Crumbling Supports', 'The mine timbers give way', (c) => {
    K.tunnel(c, 40);
    K.crumbles(c, 4, 0.46);
    K.bridge(c, 24, 0.5);
    K.cp(c);
    K.crumbles(c, 5, 0.42);
    K.bridge(c, 30, 0.44);
  }, { dark: true, hidden: 'dip' }),
  mk(56, 'Minecart Alley', 'Belts, crates and carts', (c) => {
    K.conveyor(c, 26, 6);
    K.crates(c, 3, 'metal');
    K.conveyor(c, 30, -6);
    K.cp(c);
    K.jump(c, 'M');
    K.conveyor(c, 28, 7);
    K.crates(c, 3, 'metal');
  }),
  mk(57, 'Dynamite', 'Light the fuse by hitting it — then keep going', (c) => {
    K.tnt(c, 2);
    K.crumbles(c, 3, 0.46);
    K.cp(c);
    K.tnt(c, 2);
    K.tunnel(c, 30);
    K.crumbles(c, 4, 0.42);
    K.tnt(c, 2);
  }, { dark: true }),
  mk(58, 'Deep Shaft', 'Down, down, down', (c) => {
    K.downhill(c, 12, 60);
    K.valley(c, 8, 30, 14);
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.downhill(c, 10, 56);
    K.jump(c, 'M');
    K.valley(c, 8, 30, 14);
  }, { dark: true, hidden: 'hill' }),
  mk(59, 'Magnet Maze', 'Magnets, saws and weak floors', (c) => {
    K.magnetPull(c, 15);
    K.saw(c, 2);
    K.cp(c);
    K.crumbles(c, 4, 0.44);
    K.magnetPull(c, 18, 'below');
    K.cp(c);
    K.saw(c, 3, { period: 3.4 });
    K.magnetPull(c, 17);
  }),
  mk(60, 'Mines Gauntlet', 'Everything underground', (c) => {
    K.tunnel(c, 40);
    K.magnetPull(c, 16);
    K.crates(c, 3, 'metal');
    K.cp(c);
    K.tnt(c, 2);
    K.crumbles(c, 4, 0.42);
    K.cp(c);
    K.conveyor(c, 28, -6);
    K.saw(c, 3, { period: 3.4 });
    K.cp(c);
    K.magnetPull(c, 20, 'below');
    K.bridge(c, 30, 0.42);
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.crushers(c, 3, { period: 4.2 });
  }, { dark: true, hidden: 'dip' }),
];
