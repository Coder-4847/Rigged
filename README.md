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

## Status

Built phase by phase (see the master prompt). Phase 1 — foundation — is in place: fixed 120 Hz timestep, Planck world,
Three.js side camera, input manager, debug overlay and a drivable placeholder car.
