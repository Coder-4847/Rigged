/** Where does the bot get stuck (speed ~0 for a long time)? npx tsx scripts/stuck.ts <id> */
import { WORLDS } from '../src/levels/author';
import { runBot } from './lib/bot';
const id = Number(process.argv[2]);
const lv = WORLDS.flat().find((l) => l.id === id)!;
const stuck = new Map<number, number>();
runBot(lv, { retries: 30, maxTime: 200, onStep: (car, _lp, t) => {
  if (Math.abs(car.forwardSpeed) < 0.8 && car.grounded) stuck.set(Math.round(car.x / 4) * 4, (stuck.get(Math.round(car.x / 4) * 4) ?? 0) + 1 / 120);
  void t;
} });
console.log([...stuck.entries()].filter(([, v]) => v > 3).map(([x, v]) => `x≈${x}: ${v.toFixed(0)}s`).join('\n') || 'no long stalls');
console.log('entities near:', lv.entities.filter((e: any) => e.x !== undefined).map((e: any) => `${e.type}@${Math.round(e.x)}`).join(' ').slice(0, 800));
