/** Where does the bot die? npx tsx scripts/diag.ts <levelId> */
import { loadLevelsFromDisk, runBot } from './lib/bot';
const id = Number(process.argv[2]);
const lv = loadLevelsFromDisk().find((l) => l.id === id)!;
const r = runBot(lv, { retries: 120 });
const hist = new Map<string, number>();
for (const d of r.deathLog) hist.set(`${Math.round(d.x / 5) * 5} ${d.reason}`, (hist.get(`${Math.round(d.x / 5) * 5} ${d.reason}`) ?? 0) + 1);
console.log(`${lv.name}: finished=${r.finished} progress=${(r.progress * 100).toFixed(0)}% deaths=${r.deaths} clean=${r.cleanTime.toFixed(1)}s`);
console.log('death clusters (x reason count):', [...hist.entries()].sort((a, b) => Number(a[0].split(' ')[0]) - Number(b[0].split(' ')[0])).map(([k, v]) => `${k}×${v}`).join(' | '));
console.log('checkpoints at', lv.checkpoints.map((c) => Math.round(c[0])).join(', '), '| finish', Math.round(lv.finish[0]));
console.log('terrain:', lv.entities.filter((e) => e.type === 'terrain').map((e) => (e.type === 'terrain' ? `${Math.round(e.points[0][0])}→${Math.round(e.points[e.points.length - 1][0])}` : '')).join(' '));
