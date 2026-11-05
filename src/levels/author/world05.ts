import { K, makeLevel } from './kit';
import type { LevelData } from '../types';

/** World 5 — Laser Lab (41–50). New ideas: lasers (pulse, sweep, switch-off), mirrors, doors, tracking turrets. */
const mk = (id: number, name: string, hint: string, body: Parameters<typeof makeLevel>[0]['body'], hidden: 'flat' | 'hill' | 'dip' = 'flat') =>
  makeLevel({ id, name, world: 5, hint, deco: ['crate', 'rock'], hidden, antiFlip: 0.6, body });

export const world05: LevelData[] = [
  mk(41, 'First Beam', 'Beams burn — hit the floor switch to cut them', (c) => {
    K.switchLaser(c);
    K.rolling(c, 2, 2.5, 22);
    K.switchLaser(c, { n: 2 });
    K.jump(c, 'S');
    K.switchLaser(c);
  }),
  mk(42, 'Pulse', 'Beams pulse — a charge line warns before each flash', (c) => {
    K.laser(c, 'pulse');
    K.rolling(c, 2, 2.5, 22);
    K.laser(c, 'pulse', { n: 2 });
    K.cp(c);
    K.laser(c, 'pulse', { n: 2, period: 3 });
  }, 'hill'),
  mk(43, 'Spinner', 'The beam spins — cross while it points away', (c) => {
    K.laser(c, 'spin');
    K.rolling(c, 2, 2.5, 22);
    K.laser(c, 'spin', { n: 2 });
    K.cp(c);
    K.laser(c, 'spin', { n: 2, period: 4 });
  }),
  mk(44, 'Mirror Maze', 'Mirrors bounce beams — find the switch', (c) => {
    K.mirrorLaser(c);
    K.rolling(c, 2, 2.5, 22);
    K.mirrorLaser(c);
    K.cp(c);
    K.mirrorLaser(c);
    K.switchLaser(c);
  }, 'dip'),
  mk(45, 'Doors & Switches', 'Switches open doors and cut beams', (c) => {
    K.door(c);
    K.switchLaser(c);
    K.cp(c);
    K.door(c, { rhythm: true });
    K.door(c);
    K.cp(c);
    K.switchLaser(c, { n: 2 });
    K.door(c, { rhythm: true });
  }),
  mk(46, 'Turret', 'It tracks slowly — outrun it', (c) => {
    K.turret(c);
    K.rolling(c, 2, 2.5, 22);
    K.cp(c);
    K.turret(c);
    K.jump(c, 'S');
    K.turret(c);
  }),
  mk(47, 'Rhythm Gates', 'Pulse then sweep — keep the beat', (c) => {
    K.laser(c, 'pulse', { n: 3 });
    K.cp(c);
    K.laser(c, 'spin', { n: 2 });
    K.rolling(c, 2, 3, 22);
    K.cp(c);
    K.laser(c, 'pulse', { n: 3, period: 3 });
    K.laser(c, 'spin', { n: 2, period: 4 });
  }, 'hill'),
  mk(48, 'Lab Jumps', 'Lasers over the landing zones', (c) => {
    K.jump(c, 'M');
    K.laser(c, 'pulse');
    K.cp(c);
    K.jump(c, 'L', { recover: true });
    K.laser(c, 'spin');
    K.cp(c);
    K.jump(c, 'M');
    K.laser(c, 'pulse', { n: 2 });
  }),
  mk(49, 'Quarantine', 'Doors, mirrors, beams and a turret', (c) => {
    K.door(c);
    K.mirrorLaser(c);
    K.cp(c);
    K.laser(c, 'pulse', { n: 2 });
    K.turret(c);
    K.cp(c);
    K.switchLaser(c, { n: 2 });
    K.laser(c, 'spin', { n: 2 });
    K.cp(c);
    K.door(c, { rhythm: true });
  }, 'dip'),
  mk(50, 'Laser Lab Gauntlet', 'Every beam in the building', (c) => {
    K.switchLaser(c);
    K.laser(c, 'pulse', { n: 3 });
    K.cp(c);
    K.mirrorLaser(c);
    K.jump(c, 'L', { recover: true });
    K.laser(c, 'spin', { n: 2 });
    K.cp(c);
    K.turret(c);
    K.door(c);
    K.laser(c, 'pulse', { n: 3, period: 3 });
    K.cp(c);
    K.switchLaser(c, { n: 2 });
    K.laser(c, 'spin', { n: 3, period: 4 });
    K.cp(c);
    K.jump(c, 'M');
    K.laser(c, 'pulse', { n: 2, period: 3 });
  }),
];
