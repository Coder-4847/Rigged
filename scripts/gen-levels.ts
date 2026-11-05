/** Regenerates src/levels/worldNN/levelNN.json from the TypeScript authoring modules. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { world01 } from '../src/levels/author/world01';
import { demos } from '../src/levels/author/demos';
import type { LevelData } from '../src/levels/types';
import { runBot } from './lib/bot';

/**
 * Stars 0 and 1 are authored by x only: snap them to the proven bot line so they're always
 * reachable. Star 0 sits right on the path (easy); star 1 is lifted off it (needs a better line).
 */
function snapStars(lv: LevelData): void {
  const r = runBot(lv, { traceEvery: 0.05, retries: 0 });
  if (!r.finished) {
    console.warn(`  ! level ${lv.id}: bot could not finish, stars not snapped`);
    return;
  }
  for (const i of [0, 1]) {
    const x = lv.stars[i][0];
    let best = r.trace[0];
    for (const p of r.trace) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    lv.stars[i] = [round(best.x), round(best.y + (i === 0 ? 0.5 : best.g ? 3.0 : 2.4))];
  }
}
const round = (n: number) => Math.round(n * 100) / 100;

const worlds: Record<number, LevelData[]> = { 1: world01 };
const root = join(import.meta.dirname, '..', 'src', 'levels');
let n = 0;
for (const [w, levels] of Object.entries(worlds)) {
  const dir = join(root, `world${String(w).padStart(2, '0')}`);
  mkdirSync(dir, { recursive: true });
  for (const lv of levels) {
    snapStars(lv);
    writeFileSync(join(dir, `level${String(lv.id).padStart(2, '0')}.json`), JSON.stringify(lv));
    n++;
  }
}
// Hazard demo playgrounds (ids 901+): not part of the 100, but loadable with ?level=901.
const demoDir = join(root, 'demo');
mkdirSync(demoDir, { recursive: true });
for (const lv of demos) {
  writeFileSync(join(demoDir, `level${lv.id}.json`), JSON.stringify(lv));
  n++;
}
console.log(`wrote ${n} levels`);
