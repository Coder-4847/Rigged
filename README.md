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

## Tuning / tests

- All feel tunables live in `src/config.ts` (global physics/camera/crash/fx + per-vehicle tables).
- `npx tsx scripts/feel.ts` runs headless scenario checks (accel, braking, reverse, air tilt, landings, steep climb,
  roof crash, determinism). Exits non-zero on failure.
- `npx tsx scripts/simulate.ts [full|none]` drives the sandbox track and prints a log.

## Status

Built phase by phase (see the master prompt).

- **Phase 1 — Foundation:** fixed 120 Hz timestep with render interpolation, Planck world, Three.js side camera,
  input manager, debug overlay.
- **Phase 2 — Car feel:** spring-suspension car (motor, brake/reverse, downforce, landing grace, anti-flip assist,
  air tilt with angular cap), beveled toy-block model built from separate meshes, crash detection (roof contact,
  >0.6 s inverted, hazard, fall), explosion into physics debris, <0.5 s instant restart with wipe, look-ahead /
  speed-zoom / shake camera, pooled particles (dust, sparks, exhaust, speed lines), procedural WebAudio
  (engine, thumps, crash).

Design decisions (ambiguities resolved for fun/readability): brake doubles as reverse once stopped; gas+brake together
is a handbrake; air tilt is a dedicated axis (Up = nose up).
