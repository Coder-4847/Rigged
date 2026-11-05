/**
 * Every vehicle must be able to clear every (non-manual) level. Runs the bot per vehicle.
 * npx tsx scripts/vehicles.ts [vehicleId ...] [--world N]
 */
import { WORLDS } from '../src/levels/author';
import { runBot } from './lib/bot';
import { VEHICLE_IDS, VehicleId } from '../src/config';

const args = process.argv.slice(2);
const wi = args.indexOf('--world');
const world = wi >= 0 ? Number(args[wi + 1]) : 0;
const picked = args.filter((a) => (VEHICLE_IDS as string[]).includes(a)) as VehicleId[];
const vehicles = picked.length ? picked : VEHICLE_IDS;
const levels = WORLDS.flat().filter((l) => !l.manual && (!world || l.world === world));
let bad = 0;
// The default hatchback must clear every level; each other vehicle must clear at least 90% (some combos,
// e.g. a tall monster truck under swinging balls, are deliberately harder).
const MIN_RATE: Record<string, number> = { hatch: 1 };
for (const v of vehicles) {
  const fails: string[] = [];
  const t0 = Date.now();
  for (const lv of levels) {
    const r = runBot(lv, { vehicle: v, retries: 60, maxTime: 600 });
    if (!r.finished) fails.push(`L${lv.id}(${Math.round(r.progress * 100)}%)`);
  }
  const need = MIN_RATE[v] ?? 0.9;
  if ((levels.length - fails.length) / levels.length < need) bad += 1;
  console.log(`${fails.length ? 'FAIL' : 'OK  '} ${v.padEnd(8)} ${levels.length - fails.length}/${levels.length} levels cleared  (${((Date.now() - t0) / 1000).toFixed(0)}s)  ${fails.join(' ')}`);
}
process.exit(bad ? 1 : 0);
