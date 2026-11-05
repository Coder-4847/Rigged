import { PAD, readPad, stick, PadSnapshot } from '../core/Gamepad';
import type { Dir } from './UI';

/**
 * Drives menus from a gamepad: D-pad / left stick move focus (with auto-repeat), A confirms,
 * B goes back, Start closes the pause menu. Runs on its own rAF loop so it works while the game
 * loop is paused. Edge state is tracked every frame so a press that opened a menu never
 * immediately activates something in it.
 */
export class PadNav {
  private prev: boolean[] = [];
  private heldDir: Dir | null = null;
  private nextRepeat = 0;
  private raf = 0;
  private wasActive = false;

  constructor(
    private read: () => PadSnapshot | null,
    private h: {
      active(): boolean;
      /** Any pad input at all (switches the prompt glyphs to the controller). */
      activity(): void;
      move(d: Dir): void;
      confirm(): void;
      back(): void;
      /** Start button while a menu is open (pause menu → resume). */
      start(): void;
    },
  ) {}

  start(): void {
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tick(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  tick(now: number): void {
    const s = this.read();
    if (!s) {
      this.prev = [];
      this.heldDir = null;
      return;
    }
    const b = s.buttons;
    if (b.some((x, i) => x && !this.prev[i]) || Math.hypot(s.axes[0] ?? 0, s.axes[1] ?? 0) > 0.6) this.h.activity();
    const edge = (i: number) => !!b[i] && !this.prev[i];
    // Only act on menus that were already open last frame, so the press that OPENED a menu
    // (e.g. Start → pause) can't also trigger something inside it.
    const now_ = this.h.active();
    const active = now_ && this.wasActive;
    this.wasActive = now_;
    if (active) {
      const [x, y] = stick(s.axes[0] ?? 0, s.axes[1] ?? 0, 0.5);
      let dir: Dir | null = null;
      if (b[PAD.UP] || y < -0.5) dir = 'up';
      else if (b[PAD.DOWN] || y > 0.5) dir = 'down';
      else if (b[PAD.LEFT] || x < -0.5) dir = 'left';
      else if (b[PAD.RIGHT] || x > 0.5) dir = 'right';
      if (dir !== this.heldDir) {
        this.heldDir = dir;
        if (dir) {
          this.h.move(dir);
          this.nextRepeat = now + 380;
        }
      } else if (dir && now >= this.nextRepeat) {
        this.h.move(dir);
        this.nextRepeat = now + 110;
      }
      if (edge(PAD.A)) this.h.confirm();
      if (edge(PAD.B)) this.h.back();
      if (edge(PAD.START)) this.h.start();
    } else this.heldDir = null;
    this.prev = b;
  }
}

export { readPad };
