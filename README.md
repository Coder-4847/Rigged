# RIGGED

Side-scrolling physics driving obstacle game for the browser (Vite + TypeScript, Planck.js physics, Three.js rendering).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npx tsx scripts/simulate.ts   # headless physics sim used for tuning
```

## Controls (current)

| Action | Keys |
| --- | --- |
| Gas / brake-reverse | Right / Left (D / A) |
| Air tilt | Up / Down (W / S) |
| Restart | R |
| Dev: physics wireframe / slow-mo / stats | F1 / F2 / F3 |

## Authoring levels

1. Add/modify a level function in `src/levels/author/worldNN.ts` (see `world01.ts` for examples).
2. `npm run levels` regenerates the JSON (it also runs the bot to snap star 0/1 onto a proven line:
   star 0 sits on the path, star 1 is lifted off it, star 2 is the hidden one).
3. `npm run validate` checks structure/geometry; `npm run smoke` runs a driving bot through every level.
4. Dev URL flags: `?level=N` jumps to a level, `?dev` enables `[` / `]` level skipping in production builds.

## Tuning / tests

- All feel tunables live in `src/config.ts` (global physics/camera/crash/fx + per-vehicle tables).
- `npx tsx scripts/feel.ts` runs headless scenario checks (accel, braking, reverse, air tilt, landings, steep climb,
  roof crash, determinism). Exits non-zero on failure.
- `npx tsx scripts/simulate.ts [full|none]` drives the sandbox track and prints a log.
- `npm test` = feel scenarios + level validation + bot smoke test over every level (`--strict`: bot must finish).
- `npx tsx scripts/trace.ts <levelId>` prints the bot's path (handy for placing stars / debugging jumps).

## Status

Built phase by phase (see the master prompt).

- **Phase 1 — Foundation:** fixed 120 Hz timestep with render interpolation, Planck world, Three.js side camera,
  input manager, debug overlay.
- **Phase 2 — Car feel:** spring-suspension car (motor, brake/reverse, downforce, landing grace, anti-flip assist,
  air tilt with angular cap), beveled toy-block model built from separate meshes, crash detection (roof contact,
  >0.6 s inverted, hazard, fall), explosion into physics debris, <0.5 s instant restart with wipe, look-ahead /
  speed-zoom / shake camera, pooled particles (dust, sparks, exhaust, speed lines), procedural WebAudio
  (engine, thumps, crash).

- **Phase 3 — Level system:** JSON levels (`src/levels/worldNN/levelNN.json`) loaded via a registry; builder helpers
  (`Terrain` cursor: `flat/slope/ease/launch/bumps/gap`, `LevelBuilder`: `ground/spawnAt/checkpointAt/starAt/finishAt/
  seesaw/sign/scatter`); terrain, teeter-totter seesaws, 3 stars (banked at checkpoints, lost on death), checkpoint
  flags, finish gate with confetti, per-world themes + parallax silhouettes, HUD and level-complete card.
  **World 1 (levels 1–10) is playable end to end** and a bot completes all 10 in the headless smoke test.

Design decisions (ambiguities resolved for fun/readability): brake doubles as reverse once stopped; gas+brake together
is a handbrake; air tilt is a dedicated axis (Up = nose up).
