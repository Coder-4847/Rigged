/** Bot-test levels straight from the authoring code. npx tsx scripts/check.ts 36 40 [--world 4] */
import { WORLDS } from '../src/levels/author';
import { runBot } from './lib/bot';

const args = process.argv.slice(2);
const wi = args.indexOf('--world');
const world = wi >= 0 ? Number(args[wi + 1]) : 0;
const ids = args.filter((a) => /^\d+$/.test(a) && args[args.indexOf(a) - 1] !== '--world').map(Number);
const levels = WORLDS.flat().filter((l) => (world ? l.world === world : ids.length ? ids.includes(l.id) : true));
for (const lv of levels) {
  const r = runBot(lv, { retries: 120 });
  const h = new Map<string, number>();
  for (const d of r.deathLog) {
    const k = `${Math.round(d.x / 5) * 5} ${d.reason}`;
    h.set(k, (h.get(k) ?? 0) + 1);
  }
  const top = [...h.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(' | ');
  console.log(`${r.finished ? 'OK  ' : lv.manual ? 'MAN ' : 'FAIL'} L${lv.id} ${lv.name.padEnd(22)} progress=${(r.progress * 100).toFixed(0)}% deaths=${r.deaths} clean=${r.cleanTime.toFixed(1)}s ${top}`);
}
