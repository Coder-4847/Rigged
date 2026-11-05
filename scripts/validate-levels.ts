/** Validates every level JSON (structure + geometry). Exits 1 on any problem. */
import { loadLevelsFromDisk } from './lib/bot';
import { validateLevel } from '../src/levels/validate';

const levels = loadLevelsFromDisk();
let n = 0;
const ids = new Set<number>();
for (const l of levels) {
  if (ids.has(l.id)) {
    console.log(`duplicate id ${l.id}`);
    n++;
  }
  ids.add(l.id);
  for (const e of validateLevel(l)) {
    console.log(e);
    n++;
  }
}
// The shipped game is exactly levels 1..100.
for (let i = 1; i <= 100; i++)
  if (!ids.has(i)) {
    console.log(`missing level ${i}`);
    n++;
  }
console.log(n ? `${n} problem(s) in ${levels.length} levels` : `OK — ${levels.length} levels valid`);
process.exit(n ? 1 : 0);
