export {};
/** Score data checks: every track is deterministic, loops cleanly, stays in range and in key. Run: npx tsx scripts/music.ts */
const { TRACKS, generate, STEPS_PER_BAR, BARS } = await import('../src/core/music/tracks');

let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};

const ids = Object.keys(TRACKS).map((k) => (k === 'menu' ? 'menu' : Number(k))) as Array<'menu' | number>;
check('a track exists for the menu and every world', ids.length === 11 && ids.includes('menu') && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((w) => ids.includes(w)));

const hashes = new Set<string>();
for (const id of ids) {
  const a = generate(id as never);
  const b = generate(id as never);
  const h = JSON.stringify(a.events);
  hashes.add(h);
  const def = a.def;
  const tag = `[${def.name}]`;
  check(`${tag} deterministic`, h === JSON.stringify(b.events));
  check(`${tag} loops over ${BARS} bars`, a.steps === BARS * STEPS_PER_BAR && a.events.every((e) => e.step >= 0 && e.step < a.steps));
  check(`${tag} notes in playable range`, a.events.filter((e) => e.kind !== 'kick' && e.kind !== 'snare' && e.kind !== 'hat').every((e) => e.midi >= 28 && e.midi <= 100));
  const pcs = new Set(def.scale.map((s) => (def.root + s) % 12));
  const lead = a.events.filter((e) => e.kind === 'lead');
  check(`${tag} lead stays in key`, lead.every((e) => pcs.has(e.midi % 12)), `${lead.length} notes`);
  const perBar = lead.length / BARS;
  check(`${tag} lead is calm (0.4–5 notes/bar)`, perBar >= 0.4 && perBar <= 5, `${perBar.toFixed(1)}/bar`);
  const drums = a.events.filter((e) => ['kick', 'snare', 'hat'].includes(e.kind)).length;
  check(`${tag} drum density matches setting`, def.drums === 'none' ? drums === 0 : drums > 4, `${drums} hits`);
  check(`${tag} tempo sane (70–135 bpm)`, def.bpm >= 70 && def.bpm <= 135, `${def.bpm}`);
  check(`${tag} velocities within 0..1`, a.events.every((e) => e.vel > 0 && e.vel <= 1));
}
check('every track is different', hashes.size === ids.length);

process.exit(failed ? 1 : 0);
