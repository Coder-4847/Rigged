/**
 * Smoke test: loads every level JSON, runs the bot, and checks for physics explosions.
 * Usage: npx tsx scripts/smoke.ts [levelId ...]   (--strict: also fail if the bot can't finish)
 */
import { loadLevelsFromDisk, runBot } from './lib/bot';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
const levels = loadLevelsFromDisk().filter((l) => !ids.length || ids.includes(l.id));
let bad = 0;
for (const lv of levels) {
  const r = runBot(lv);
  const ok = !r.exploded && (!strict || r.finished);
  if (!ok) bad++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} L${String(lv.id).padStart(3, '0')} ${lv.name.padEnd(22)} ` +
      `${r.finished ? 'finished' : 'NOT finished'} t=${r.time.toFixed(1)}s (par ${lv.parTime}) ` +
      `progress=${(r.progress * 100).toFixed(0)}% deaths=${r.deaths} stars=${r.stars}/3 ${r.crashReason ?? ''}${r.exploded ? ' EXPLODED' : ''}`,
  );
}
process.exit(bad ? 1 : 0);
