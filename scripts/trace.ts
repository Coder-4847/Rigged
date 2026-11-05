/** Print the bot's path through a level (for placing stars / debugging jumps). npx tsx scripts/trace.ts <id> [interval] */
import { loadLevelsFromDisk, runBot } from './lib/bot';
const id = Number(process.argv[2] ?? 1);
const every = Number(process.argv[3] ?? 0.4);
const lv = loadLevelsFromDisk().find((l) => l.id === id)!;
const r = runBot(lv, { traceEvery: every, retries: 0 });
for (const p of r.trace) console.log(`t=${p.t.toFixed(1)} x=${p.x.toFixed(1)} y=${p.y.toFixed(2)} v=${p.v.toFixed(1)} ${p.g ? 'G' : 'air'}`);
console.log(`finished=${r.finished} crashed=${r.crashReason} progress=${(r.progress * 100).toFixed(0)}%`);
console.log('terrain ends:', lv.entities.filter((e) => e.type === 'terrain').map((e) => (e.type === 'terrain' ? `${e.points[0][0].toFixed(0)}→${e.points[e.points.length - 1][0].toFixed(0)}@${e.points[e.points.length - 1][1].toFixed(1)}` : '')).join('  '));
