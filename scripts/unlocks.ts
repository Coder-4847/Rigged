export {};
/** Unit checks for vehicle/paint/decal unlock rules and garage sanitising. Run: npx tsx scripts/unlocks.ts */
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { Save, levelId } = await import('../src/core/Save');
const U = await import('../src/core/Unlocks');
const { VEHICLES, VEHICLE_IDS, PAINTS, DECALS } = await import('../src/config');

let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};

const s = new Save();
check('fresh save: only the hatch, first paint, plain decal', U.vehicleUnlocked(s, 'hatch') && !U.vehicleUnlocked(s, 'jeep') && U.paintUnlocked(s, PAINTS[0].color) && !U.paintUnlocked(s, PAINTS[1].color) && U.decalUnlocked(s, 'none') && !U.decalUnlocked(s, 'stripes'));

const before = U.unlockedKeys(s);
for (let i = 1; i <= 4; i++) s.complete(i, 20, 0b111, 0); // 12 stars
check('12 stars unlocks the jeep and a few paints', U.vehicleUnlocked(s, 'jeep') && !U.vehicleUnlocked(s, 'buggy') && U.paintUnlocked(s, PAINTS[2].color));
const fresh = U.newlyUnlocked(s, before);
check('newlyUnlocked reports exactly the new items', fresh.some((f) => f.key === 'v:jeep') && !fresh.some((f) => f.key === 'v:hatch') && fresh.every((f) => f.unlocked));

check('decals need 8 cleared levels of their world', !U.decalUnlocked(s, 'stripes'));
for (let i = 1; i <= 8; i++) s.complete(levelId(2, i), 30, 0, 0);
check('8 levels of world 2 → racing stripes', U.decalUnlocked(s, 'stripes') && !U.decalUnlocked(s, 'checker'));

// sanitising: a garage pick that isn't unlocked falls back
s.data.garage = { vehicle: 'monster', color: PAINTS[11].color, decal: 'camo' };
const g = U.sanitizeGarage(s);
check('locked garage choices fall back to defaults', g.vehicle === 'hatch' && g.color === PAINTS[0].color && g.decal === 'none');
s.data.garage = { vehicle: 'jeep', color: PAINTS[1].color, decal: 'stripes' };
const g2 = U.sanitizeGarage(s);
check('unlocked choices are kept', g2.vehicle === 'jeep' && g2.color === PAINTS[1].color && g2.decal === 'stripes');
s.data.garage = { vehicle: 'nonsense' as never, color: 123, decal: 'x' };
const g3 = U.sanitizeGarage(s);
check('garbage in save → defaults', g3.vehicle === 'hatch' && g3.color === PAINTS[0].color && g3.decal === 'none');

// thresholds are strictly ordered and reachable (300 stars exist)
const thr = VEHICLE_IDS.map((id) => U.VEHICLE_STARS[id]);
check('vehicle thresholds increase and fit in 300 stars', thr.every((v, i) => i === 0 || v >= thr[i - 1]) && Math.max(...thr) <= 300, thr.join(','));
check('paint thresholds increase and fit in 300 stars', PAINTS.every((p, i) => i === 0 || p.stars >= PAINTS[i - 1].stars) && PAINTS[PAINTS.length - 1].stars <= 300);
check('decal worlds are valid', DECALS.every((d) => d.world >= 0 && d.world <= 10));

// every vehicle has sane stats and a complete look
for (const id of VEHICLE_IDS) {
  const st = U.stats(VEHICLES[id]);
  const vals = Object.values(st);
  check(`${id}: stats in 0..1`, vals.every((v) => v > 0 && v <= 1), vals.map((v) => v.toFixed(2)).join(' '));
}
const speeds = new Set(VEHICLE_IDS.map((id) => VEHICLES[id].motor.maxSpeed));
check('vehicles have distinct top speeds', speeds.size >= 5);
check('vehicles have distinct looks', new Set(VEHICLE_IDS.map((id) => JSON.stringify(VEHICLES[id].look))).size === VEHICLE_IDS.length);

process.exit(failed ? 1 : 0);
