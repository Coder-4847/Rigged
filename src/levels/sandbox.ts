import { Terrain } from './builder';

/**
 * Tuning sandbox: a stretch of everything the car should handle well.
 * (Replaced by the JSON level system in the level-system phase; the builder stays.)
 */
export function sandboxTerrain() {
  const t = new Terrain(-30, 0);
  t.flat(50) // start pad
    .ease(24, 3) // gentle hill up
    .flat(10)
    .ease(26, -3) // and down
    .bumps(30, 0.7, 6) // washboard
    .flat(12)
    .launch(18, 5) // curved ramp
    .gap(11) // jump
    .flat(30)
    .slope(16, 9) // steep climb
    .flat(8)
    .slope(14, -9) // steep descent
    .flat(20)
    .launch(14, 7) // big ramp
    .gap(20, -3) // mega jump with lower landing
    .flat(60);
  return t.build();
}
