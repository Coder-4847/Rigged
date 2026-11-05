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

- **Phase 4 — Obstacle catalog:** every entity type from the design is data-driven (`EntityData` in
  `src/levels/types.ts`), has a headless physics behavior (`src/entities/hazards/`), a view
  (`src/render/hazards/`), telegraphing and sound. Six demo playgrounds: `?level=901` … `?level=906`.

  | Family | Types |
  | --- | --- |
  | Surfaces | ice / snow / sand / metal / rock / goo terrain friction, sand + goo drag zones, conveyors, boost strips, bounce pads, one-way platforms |
  | Forces | wind fans, low-gravity and flipped-gravity zones, magnets (attract/repel), vacuum tubes, cannons |
  | Movers | moving platforms, rotating gears, swinging wrecking balls / pendulum platforms, tilting plates, sliding doors (rhythm or switch), spinning saws on rails |
  | Crushers | pistons (any direction) with idle → warn (shake + lamp + beeps) → slam → hold → retract; period/phase configurable for rhythm sequences |
  | Lasers | static, sweeping, pulsing (charge-up preview line), slow tracking turret, switch-controlled, mirrors (up to 4 bounces), kill on contact |
  | Hazards | floor/wall spikes, saws, wrecking balls — all use the hazard accent + stripes/spikes/triangle signs so they aren't colour-only |
  | Breakables | crumbling blocks, collapsing bridges, falling icicles/rocks/signs (ground ring warns ~1 s ahead), TNT (hit → flashing fuse → blast), pushable crates, dominoes, rolling boulders |
  | Misc | switches, transform pads (resize the car; vehicle swap hooks in once more vehicles exist), ceilings/tunnels |

- **Phase 5 — UI shell:** main menu (Play/Continue), world select (parallax scene cards, locked/coming-soon states),
  level select (stars, best time, finish/par/all-stars medals, lock + skip allowance), HUD with pause/restart buttons,
  pause menu, level-complete card (new best, new stars, world-unlock note, Next/Retry/Levels), settings (volumes,
  mute, graphics Auto/Low/Med/High, camera shake, reduced motion, touch-controls mode, full keyboard remapping with
  conflict swapping), credits. A live AI-driven "attract mode" plays behind the menus. Versioned, corruption-safe
  `localStorage` save (`src/core/Save.ts`). Auto-quality drops graphics if frames stay slow. Auto-pause on tab blur.
  Menus are fully keyboard-navigable (arrows/WASD, Enter, Esc/Backspace); `UI.move/confirm/cancel` are the hooks the
  gamepad layer will use in the next phase. `M` toggles mute.

  Unlock rules: a level opens when either of the two before it is cleared (so one hard level never blocks you);
  a world opens when 8/10 of the previous world are cleared **or** you hold 9×(world−1) stars.

- **Phase 6 — Input expansion:** every device feeds the same `InputState`.
  - *Gamepad* (`src/core/Gamepad.ts`): RT gas, LT brake/reverse, left stick / LB·RB / D-pad air tilt, A boost, Y or Select
    restart, Start pause; radial deadzone, hot-plug toasts, auto-pause on unplug, dual-rumble on crash/landings/finish
    (setting + reduced-motion aware). Xbox vs PlayStation detection drives the glyphs.
  - *Touch* (`src/ui/Touch.ts`): BRAKE bottom-left with the tilt pair above it, GAS bottom-right (BOOST when a level
    allows), restart/pause in the top corners, true multi-touch, no zoom/scroll/long-press, safe-area insets, haptics,
    landscape prompt + fullscreen/orientation lock attempt on the first Play tap.
  - *Menus*: D-pad/stick/A/B/Start drive the same focus navigation as the keyboard; the footer prompt bar and level
    hints switch glyphs (keyboard keys follow your remaps, ✕○△ vs ABXY, GAS/BRAKE for touch) based on the last device used.
  - Phones default to Low graphics under Auto and the FPS watchdog can lower it further.

- **Phase 7 — Content:** all **100 levels** (10 worlds × 10). Worlds 2–10 are authored from a tuned *segment kit*
  (`src/levels/author/kit.ts`) so every piece is consistent and fair: jump presets with proven gap sizes, rhythm rows
  whose phases are synced to a cruising car (one well-timed run clears the whole row), flat run-ups before anything
  dangerous, and an automatic rule of **at most one timed hazard cluster between checkpoints**.
  New engine pieces for these worlds: snow drag, steam vents, lava pools / rising lava, geysers, metal crates,
  spinning lasers, tracking turrets that charge and fire at where you *were*, boulder chases, ice-coloured crumble blocks.
  Each world introduces two ideas and ends in a gauntlet (levels 20, 30 … 100, with extra checkpoints).

  | World | Levels | Twist |
  | --- | --- | --- |
  | 1 Grasslands | 1–10 | tutorial: ramps, gaps, tilt, seesaws |
  | 2 Desert Ruins | 11–20 | sand, crumbling blocks, collapsing bridges, boulder chases, spike pits |
  | 3 Frostbite | 21–30 | ice, snowdrifts, icicles, icy slopes, thin ice |
  | 4 Factory | 31–40 | conveyors, gears, crushers, ferry platforms, steam vents, saws |
  | 5 Laser Lab | 41–50 | pulse / spinning / switch lasers, mirrors, doors, turrets |
  | 6 Magnet Mines | 51–60 | magnets, metal crates, dark tunnels with headlights, TNT |
  | 7 Skyline | 61–70 | rooftop gaps, wind, springboards, tilting plates, falling signs |
  | 8 Lava Core | 71–80 | lava pits, geysers, wrecking balls, rock bridges, rising lava |
  | 9 Zero-G Station | 81–90 | half gravity, low-gravity bubbles, a gravity-flip room (87, manual) |
  | 10 Chaos Circuit | 91–100 | remix, faster rhythms, size-changing pads, a ~3 minute final run |

  **Validation:** `npm run check -- --world N` (or ids) bot-tests levels straight from the authoring code. The bot
  retries with a different start delay each attempt so hazard rhythms can line up, brakes for ferry platforms, and
  its best line is used to place stars (star 0 on the line, star 1 on an airborne stretch of it — so both are
  provably reachable — star 2 hidden behind the start) and par times (clean-run time + 20%).
  All 99 non-manual levels are cleared by the bot; level 87 (gravity flip) is flagged `manual` and only checked for
  physics blow-ups. `npm run levels` regenerates the JSON.

Design decisions (ambiguities resolved for fun/readability): brake doubles as reverse once stopped; gas+brake together
is a handbrake; air tilt is a dedicated axis (Up = nose up).

- Only a thin roof slab counts as "roof" for the crash rule (the cabin body is a normal bump), so clipping a crate or
  domino with the hood doesn't kill you but touching terrain with the roof does.
- Hazard `ctrl` ids: lasers are OFF while their switch is on, doors are OPEN, crushers are paused.
- Not yet done from the catalog: shielded checkpoints, curved loop/half-pipe helpers and "ramps that appear after a
  trigger" (needs a level that uses them), vehicle-swap transform pads (waiting on the garage phase).
