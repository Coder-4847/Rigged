import type { InputSource, InputState } from '../core/Input';
import { h } from './dom';

type Btn = 'gas' | 'brake' | 'tiltUp' | 'tiltDown' | 'boost';

/**
 * On-screen controls: BRAKE bottom-left with the air-tilt pair above it, GAS bottom-right
 * (BOOST above it when a level allows it). Each button tracks its own pointer so multi-touch works
 * (gas + tilt together); `touch-action: none` and pointer capture stop scroll/zoom/double-tap.
 */
export class TouchControls implements InputSource {
  onActivity?: () => void;
  readonly el: HTMLElement;
  private down = new Map<Btn, Set<number>>();
  private boostBtn: HTMLElement;
  private vibrate = true;
  private visible = false;

  constructor(parent: HTMLElement) {
    const mk = (id: Btn, cls: string, label: string, aria: string) => {
      const b = h<HTMLElement>('div.tbtn.' + cls, { role: 'button', 'aria-label': aria, 'data-touch': id }, h('span', {}, label));
      const press = (e: PointerEvent) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        let set = this.down.get(id);
        if (!set) this.down.set(id, (set = new Set()));
        set.add(e.pointerId);
        b.classList.add('on');
        this.onActivity?.();
        if (this.vibrate) navigator.vibrate?.(6);
      };
      const release = (e: PointerEvent) => {
        const set = this.down.get(id);
        set?.delete(e.pointerId);
        if (!set || set.size === 0) b.classList.remove('on');
      };
      b.addEventListener('pointerdown', press);
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    this.boostBtn = mk('boost', 'boost', 'BOOST', 'Boost');
    this.el = h(
      'div.touch.hidden',
      {},
      h('div.left', {}, h('div.tilts', {}, mk('tiltUp', 'tilt', '⟲', 'Tilt nose up'), mk('tiltDown', 'tilt', '⟳', 'Tilt nose down')), mk('brake', 'brake', 'BRAKE', 'Brake or reverse')),
      h('div.right', {}, this.boostBtn, mk('gas', 'gas', 'GAS', 'Gas')),
    );
    this.boostBtn.style.display = 'none';
    parent.appendChild(this.el);
    // No pinch / double-tap zoom or long-press menus anywhere.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => document.hidden && this.releaseAll());
  }

  releaseAll(): void {
    this.down.clear();
    this.el.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
    document.body.classList.toggle('touch-on', v);
    if (!v) this.releaseAll();
  }

  setBoost(available: boolean): void {
    this.boostBtn.style.display = available ? '' : 'none';
  }

  setHaptics(on: boolean): void {
    this.vibrate = on;
  }

  private held(b: Btn): boolean {
    return (this.down.get(b)?.size ?? 0) > 0;
  }

  poll(out: InputState): void {
    if (!this.visible) return;
    if (this.held('gas')) out.throttle = 1;
    if (this.held('brake')) out.brake = 1;
    const t = (this.held('tiltUp') ? 1 : 0) - (this.held('tiltDown') ? 1 : 0);
    if (t !== 0) out.tilt = t;
    if (this.held('boost')) out.boost = true;
  }
}
