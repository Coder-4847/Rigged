import { CONFIG } from '../config';

/**
 * Fixed-timestep loop with accumulator. Physics always advances in exact `dt` steps
 * regardless of display refresh rate; rendering receives an interpolation alpha.
 */
export class Loop {
  /** Multiplier on simulated time (slow-mo < 1). Still steps in fixed dt, just fewer per second. */
  timeScale = 1;
  paused = false;

  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  /** Smoothed frame time for FPS display / auto quality. */
  frameMs = 16.7;

  constructor(
    private step: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let frame = (now - this.last) / 1000;
      this.last = now;
      // Tab was backgrounded or debugger paused: don't try to catch up.
      if (frame > 0.25) frame = CONFIG.physics.dt;
      this.frameMs += (frame * 1000 - this.frameMs) * 0.05;
      const dt = CONFIG.physics.dt;
      if (!this.paused) {
        this.acc += frame * this.timeScale;
        let steps = 0;
        while (this.acc >= dt && steps < CONFIG.physics.maxStepsPerFrame) {
          this.step(dt);
          this.acc -= dt;
          steps++;
        }
        if (steps === CONFIG.physics.maxStepsPerFrame) this.acc = 0;
      }
      this.render(this.paused ? 1 : this.acc / dt, frame);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
