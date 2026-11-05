/** Regenerates src/levels/worldNN/levelNN.json from the TypeScript authoring modules. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLDS } from '../src/levels/author';
import { demos } from '../src/levels/author/demos';
import type { LevelData } from '../src/levels/types';
import { runBot } from './lib/bot';

/**
 * Bot-driven post-processing: stars 0 and 1 are authored by x only — snap them onto the bot's proven
 * line (star 0 right on it, star 1 lifted off it so it takes a better line), and set par from the
 * bot's clean-run time (+20%) for worlds 2+ (World 1 pars were set by hand).
 */
function snap(lv: LevelData): { finished: boolean; clean: number } {
  const r = runBot(lv, { retries: 120 });
  if (!r.finished) {
    if (!lv.manual) console.warn(`  ! level ${lv.id} "${lv.name}": bot could not finish (progress ${(r.progress * 100).toFixed(0)}%)`);
    return { finished: false, clean: 0 };
  }
  // Star 0: on the line. Star 1 ("risky"): on an airborne stretch of the same line, so it is provably
  // reachable but you have to commit to the jump. (Anything higher than the bot's own arc could be unreachable.)
  const near = (x: number, pool: typeof r.path) => pool.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b), pool[0]);
  const p0 = near(lv.stars[0][0], r.path);
  lv.stars[0] = [round(p0.x), round(p0.y + 0.4)];
  const air = r.path.filter((p) => !p.g);
  const p1 = air.length ? near(lv.stars[1][0], air) : near(lv.stars[1][0], r.path);
  lv.stars[1] = [round(p1.x), round(p1.y + (p1.g ? 0.4 : 1.1))];
  // keep the two apart
  if (Math.hypot(lv.stars[0][0] - lv.stars[1][0], lv.stars[0][1] - lv.stars[1][1]) < 6) {
    const far = (air.length ? air : r.path).filter((p) => Math.abs(p.x - lv.stars[0][0]) > 14);
    if (far.length) {
      const q = near(lv.stars[1][0], far);
      lv.stars[1] = [round(q.x), round(q.y + (q.g ? 0.4 : 1.1))];
    }
  }
  if (lv.world > 1) lv.parTime = Math.max(14, Math.round(r.cleanTime * 1.2 + 0.5));
  return { finished: true, clean: r.cleanTime };
}
const round = (n: number) => Math.round(n * 100) / 100;

const worlds: Record<number, LevelData[]> = Object.fromEntries(WORLDS.map((w, i) => [i + 1, w]));
const root = join(import.meta.dirname, '..', 'src', 'levels');
let n = 0;
for (const [w, levels] of Object.entries(worlds)) {
  const dir = join(root, `world${String(w).padStart(2, '0')}`);
  mkdirSync(dir, { recursive: true });
  for (const lv of levels) {
    snap(lv);
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
