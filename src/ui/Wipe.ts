/** Fast diagonal-ish slide wipe. `cover()` slides in, `reveal()` slides out the other side. */
export class Wipe {
  private el: HTMLDivElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'wipe';
    parent.appendChild(this.el);
  }

  private set(x: string, ms: number, ease = 'cubic-bezier(.7,0,.3,1)'): void {
    this.el.style.transition = ms > 0 ? `transform ${ms}ms ${ease}` : 'none';
    this.el.style.transform = `translateX(${x})`;
  }

  /** Slide in to fully cover the screen. */
  cover(ms = 150): void {
    clearTimeout(this.timer);
    this.set('-102%', 0);
    void this.el.offsetWidth; // flush
    this.set('0%', ms);
  }

  /** Slide out to reveal; resets off-screen left afterwards. */
  reveal(ms = 200): void {
    clearTimeout(this.timer);
    this.set('102%', ms);
    this.timer = window.setTimeout(() => this.set('-102%', 0), ms + 30);
  }

  /** Quick cover+reveal pulse for instant retries. */
  pulse(): void {
    this.set('0%', 0);
    this.reveal(170);
  }
}
