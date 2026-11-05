import type { LevelData } from './types';
import { surfaceY } from './builder';
import type { Pt } from './builder';

/** Cheap structural + geometric sanity checks. Returns a list of problems (empty = OK). */
export function validateLevel(l: LevelData): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(`L${l.id} "${l.name}": ${m}`);
  const lines: Pt[][] = l.entities.flatMap((x) => (x.type === 'terrain' ? [x.points as Pt[]] : []));

  if (!l.spawn || l.spawn.length !== 2) e('missing spawn');
  if (!l.finish || l.finish.length !== 2) e('missing finish');
  if (l.world < 1 || l.world > 10) e(`bad world ${l.world}`);
  if (!lines.length) e('no terrain');
  if (!(l.parTime > 5)) e('parTime too small');
  if (l.stars.length !== 3) e(`needs exactly 3 stars (has ${l.stars.length})`);
  if (l.finish[0] <= l.spawn[0]) e('finish must be to the right of spawn');

  const sSpawn = surfaceY(lines, l.spawn[0]);
  if (sSpawn === null) e('no ground under spawn');
  else if (l.spawn[1] - sSpawn < 0.5 || l.spawn[1] - sSpawn > 4) e(`spawn height off (${(l.spawn[1] - sSpawn).toFixed(1)} above ground)`);
  const sFin = surfaceY(lines, l.finish[0]);
  if (sFin === null) e('no ground under finish');

  for (const [i, c] of l.checkpoints.entries()) {
    const s = surfaceY(lines, c[0]);
    if (s === null || Math.abs(s - c[1]) > 0.6) e(`checkpoint ${i} not on ground`);
    if (c[0] <= l.spawn[0] || c[0] >= l.finish[0]) e(`checkpoint ${i} outside spawn..finish`);
  }
  for (let i = 1; i < l.checkpoints.length; i++) if (l.checkpoints[i][0] <= l.checkpoints[i - 1][0]) e('checkpoints must be ordered left to right');

  const b = l.cameraBounds;
  for (const [i, s] of l.stars.entries()) {
    if (s[0] < b.minX || s[0] > b.maxX || s[1] < b.minY || s[1] > b.maxY) e(`star ${i} outside camera bounds`);
    const g = surfaceY(lines, s[0]);
    if (g !== null && s[1] < g + 0.4) e(`star ${i} is inside terrain`);
    if (g !== null && s[1] > g + 14) e(`star ${i} is unreachably high (${(s[1] - g).toFixed(1)} m above ground)`);
  }
  // stars must be distinct
  for (let i = 0; i < l.stars.length; i++)
    for (let j = i + 1; j < l.stars.length; j++)
      if (Math.hypot(l.stars[i][0] - l.stars[j][0], l.stars[i][1] - l.stars[j][1]) < 3) e(`stars ${i} and ${j} overlap`);

  for (const ent of l.entities) {
    if (ent.type === 'terrain') {
      if (ent.points.length < 2) e('terrain with <2 points');
      for (let i = 1; i < ent.points.length; i++) if (ent.points[i][0] <= ent.points[i - 1][0]) e('terrain x must increase');
      if (ent.points.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) e('terrain has non-finite point');
    }
  }
  return errs;
}
