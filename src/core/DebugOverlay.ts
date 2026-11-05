/** Tiny DOM stats panel (FPS + car telemetry). Toggle with F3. */
export class DebugOverlay {
  private el: HTMLPreElement;
  private visible = false;
  private fps = 60;
  private acc = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '8px',
      top: '8px',
      margin: '0',
      padding: '6px 8px',
      font: '12px/1.35 ui-monospace, Menlo, Consolas, monospace',
      color: '#b6ffd2',
      background: 'rgba(8,16,24,.72)',
      borderRadius: '6px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '50',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(frameDt: number, lines: string[]): void {
    this.fps += (1 / Math.max(frameDt, 1e-4) - this.fps) * 0.08;
    if (!this.visible) return;
    this.acc += frameDt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.el.textContent = [`fps ${this.fps.toFixed(0)}`, ...lines].join('\n');
  }
}
