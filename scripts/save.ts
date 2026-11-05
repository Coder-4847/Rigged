export {};
/** Unit checks for the save schema, migration and unlock rules. Run: npx tsx scripts/save.ts */
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { Save, levelId, worldOf } = await import('../src/core/Save');
let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};

const s = new Save();
check('fresh save: world 1 open, world 2 locked', s.worldUnlocked(1) && !s.worldUnlocked(2));
check('fresh save: only level 1 open', s.levelUnlocked(1) && !s.levelUnlocked(2) && !s.levelUnlocked(3));
check('level/world id helpers', levelId(3, 4) === 24 && worldOf(24) === 3 && worldOf(30) === 3 && worldOf(31) === 4);

const r = s.complete(1, 20, 0b001, 2);
check('first clear is flagged, +1 star', r.first && r.newStars === 1 && r.newBest);
check('clearing 1 opens 2 and 3 (skip allowance) but not 4', s.levelUnlocked(2) && s.levelUnlocked(3) && !s.levelUnlocked(4));
const r2 = s.complete(1, 25, 0b101, 0);
check('slower rerun keeps best time, merges stars', !r2.newBest && r2.newStars === 1 && s.rec(1).best === 20 && s.rec(1).stars === 0b101);
const r3 = s.complete(1, 18, 0b101, 0);
check('faster rerun is a new best', r3.newBest && s.rec(1).best === 18);
check('stars total counts bits', s.totalStars() === 2);
check('deaths accumulate', s.rec(1).deaths === 2 && s.data.totalDeaths === 2);

for (let i = 2; i <= 8; i++) s.complete(i, 30, 0, 0);
check('8/10 cleared unlocks the next world (finish route)', s.worldUnlocked(2) && !s.worldUnlocked(3));
const t = new Save();
t.data.levels[5] = { stars: 0b111, best: 10, deaths: 0, done: true };
for (let i = 11; i <= 18; i++) t.data.levels[i] = { stars: 0b111, best: 10, deaths: 0, done: true };
check('star route unlocks worlds too (never hard-blocked)', t.worldUnlocked(3));

s.flush();
const again = new Save();
check('save round-trips through storage', again.rec(1).best === 18 && again.worldUnlocked(2));

store.set('rigged.save', '{not json');
check('corrupt save falls back to defaults', new Save().totalStars() === 0);
store.set('rigged.save', JSON.stringify({ v: 99, levels: { 1: { stars: 7, best: 1, deaths: 0, done: true } } }));
check('unknown future version falls back to defaults', new Save().totalStars() === 0);
store.set('rigged.save', JSON.stringify({ v: 1, levels: {}, settings: { master: 0.3 } }));
const partial = new Save();
check('partial save is filled with defaults', partial.settings.master === 0.3 && partial.settings.sfx === 1 && partial.settings.bindings.gas.length === 2);

process.exit(failed ? 1 : 0);
