import { world01 } from './world01';
import { world02 } from './world02';
import { world03 } from './world03';
import { world04 } from './world04';
import { world05 } from './world05';
import { world06 } from './world06';
import { world07 } from './world07';
import { world08 } from './world08';
import { world09 } from './world09';
import { world10 } from './world10';
import type { LevelData } from '../types';

/**
 * Levels that force a vehicle (everything else uses the player's garage pick). Each is chosen so the
 * vehicle suits the level's idea, and validated with the bot (npm run vehicles / npm run check).
 */
export const FORCED_VEHICLES: Record<number, import('../../config').VehicleId> = {
  12: 'jeep', // Sandy Slog — grip + torque through the sand
  33: 'monster', // Gear Works — big wheels over the cogs
  45: 'mini', // Doors & Switches — squeezes through
  47: 'muscle', // Rhythm Gates — fast through the beat
  62: 'buggy', // Gusts — light and floaty in the wind
};

/** Every authored world, in order. Add new world modules here (and nowhere else). */
export const WORLDS: LevelData[][] = [world01, world02, world03, world04, world05, world06, world07, world08, world09, world10].map((w) =>
  w.map((l) => (FORCED_VEHICLES[l.id] ? { ...l, vehicle: FORCED_VEHICLES[l.id] } : l)),
);
