import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 10 — Chaos Circuit (91–100). Remix of everything, faster rhythms, size-changing pads, long final runs. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], o: { hidden?: 'flat' | 'hill' | 'dip'; dark?: boolean; gravity?: number } = {}) =>
  makeLevel({ id, name, world: 10, hint, deco: ['crate', 'rock', 'cactus', 'pine'], hidden: o.hidden ?? 'flat', dark: o.dark, gravity: o.gravity, antiFlip: 0.25, body });

export const world10: LevelData[] = [
  mk(91, 'Chaos Warm-up', 'Welcome to the circuit', (c) => {
    K.jump(c, 'M');
    K.crushers(c, 3, { period: 4.0 });
    K.cp(c);
    K.conveyor(c, 26, -6);
    K.laser(c, 'pulse', { n: 2, period: 3 });
    K.cp(c);
    K.zone(c, 'sand', 30);
    K.jump(c, 'L', { recover: true });
  }),
  mk(92, 'Shrink Ray', 'Small cars fit — and fall — differently', (c) => {
    K.transform(c, 0.6);
    K.jump(c, 'M');
    K.crushers(c, 2, { period: 4.0 });
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.saw(c, 2, { period: 3.4 });
    K.cp(c);
    K.transform(c, 1);
    K.jump(c, 'M');
  }, { hidden: 'hill' }),
  mk(93, 'Giant Mode', 'Big wheels roll over anything', (c) => {
    K.transform(c, 1, 'monster');
    K.crates(c, 3, 'metal');
    K.zone(c, 'sand', 34);
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.tnt(c);
    K.cp(c);
    K.crushers(c, 2, { period: 4.2 });
    K.transform(c, 1, 'garage');
  }),
  mk(94, 'Rhythm Remix', 'Presses, beams and blades on the same beat', (c) => {
    K.crushers(c, 3, { period: 3.8 });
    K.laser(c, 'pulse', { n: 2, period: 3 });
    K.cp(c);
    K.saw(c, 3, { period: 3.2 });
    K.laser(c, 'spin', { n: 2, period: 4 });
    K.cp(c);
    K.crushers(c, 4, { period: 3.8, jitter: 0.05 });
  }),
  mk(95, 'Hazard Soup', 'A bit of everything', (c) => {
    K.bridge(c, 26, 0.42);
    K.geyser(c, 2, 4.2);
    K.cp(c);
    K.transform(c, 1, 'jeep');
    K.fallers(c, ['icicle', 'rock', 'sign']);
    K.swing(c, 2, { period: 4.2 });
    K.cp(c);
    K.transform(c, 1, 'garage');
    K.crumbles(c, 4, 0.4);
    K.spikes(c, 6);
  }, { hidden: 'dip' }),
  mk(96, 'Lava & Lasers', 'Hot and bright', (c) => {
    K.lavaPit(c, 'L');
    K.laser(c, 'pulse', { n: 2, period: 3 });
    K.cp(c);
    K.floodValley(c, 11, 1.2);
    K.mirrorLaser(c);
    K.cp(c);
    K.lavaBridge(c, 30, 0.42);
    K.laser(c, 'spin', { n: 2, period: 4 });
  }, { dark: true }),
  mk(97, 'Frozen Factory', 'Ice, belts and presses', (c) => {
    K.ice(c, 40);
    K.run(c, 30);
    K.crushers(c, 3, { period: 4.0 });
    K.cp(c);
    K.conveyor(c, 30, -6);
    K.iceSlope(c, 6);
    K.cp(c);
    K.fallers(c, ['icicle', 'icicle', 'icicle']);
    K.platformGap(c, 28, 7.5);
  }, { hidden: 'hill' }),
  mk(98, 'Skyline Scramble', 'Wind, springs and giant gaps', (c) => {
    K.transform(c, 1, 'buggy');
    K.windJump(c, 'L', 8);
    K.tiltGap(c, 18);
    K.cp(c);
    K.bounce(c);
    K.jump(c, 'XL', { recover: true });
    K.cp(c);
    K.transform(c, 1, 'garage');
    K.fallers(c, ['sign', 'sign', 'sign']);
    K.windJump(c, 'XL', 8);
  }),
  mk(99, 'Zero-G Circuit', 'Low gravity with real hazards', (c) => {
    K.lowgravJump(c);
    K.crushers(c, 3, { period: 4.0 });
    K.cp(c);
    K.laser(c, 'pulse', { n: 3, period: 3 });
    K.bounce(c);
    K.cp(c);
    K.gears(c, 3);
    K.lowgravJump(c, 16);
  }, { gravity: -14, hidden: 'dip' }),
  mk(100, 'The Final Run', 'Every world, one last time', (c) => {
    K.rolling(c, 2, 4, 26);
    K.jump(c, 'L', { recover: true });
    K.crumbles(c, 4, 0.42);
    K.cp(c);
    K.transform(c, 1, 'jeep');
    K.zone(c, 'sand', 30);
    K.boulder(c);
    K.spikes(c, 6);
    K.cp(c);
    K.transform(c, 1, 'garage');
    K.ice(c, 40);
    K.run(c, 24);
    K.fallers(c, ['icicle', 'icicle', 'rock']);
    K.cp(c);
    K.conveyor(c, 30, -6);
    K.crushers(c, 3, { period: 4.0 });
    K.cp(c);
    K.platformGap(c, 28, 7.5);
    K.saw(c, 3, { period: 3.2 });
    K.cp(c);
    K.laser(c, 'pulse', { n: 3, period: 3 });
    K.laser(c, 'spin', { n: 2, period: 4 });
    K.cp(c);
    K.magnetPull(c, 18);
    K.tnt(c, 2);
    K.cp(c);
    K.lavaBridge(c, 34, 0.42);
    K.geyser(c, 3, 4.2);
    K.cp(c);
    K.floodValley(c, 13, 1.25);
    K.swing(c, 2, { len: 12, period: 4.4 });
    K.cp(c);
    K.transform(c, 1, 'buggy');
    K.windJump(c, 'XL', 8);
    K.tiltGap(c, 18);
    K.jump(c, 'XL', { recover: true });
    K.transform(c, 1, 'garage');
    K.transform(c, 0.6);
    K.jump(c, 'L', { recover: true });
    K.transform(c, 1);
    K.cp(c);
    K.crushers(c, 4, { period: 3.8, jitter: 0.05 });
    K.jump(c, 'L', { recover: true });
  }, { hidden: 'hill' }),
];
