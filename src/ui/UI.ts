import { h } from './dom';

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Screen {
  id: string;
  el: HTMLElement;
  /** Called every time the screen becomes visible (refresh dynamic content here). */
  onShow?(): void;
  /** Escape / B / Backspace. Return true if handled (e.g. closed a sub-state). */
  onBack?(): boolean | void;
  /** Overlay screens (pause) keep the game visible without the menu backdrop dimming. */
  overlay?: boolean;
  /** Element to focus first. */
  focus?: () => HTMLElement | null;
}

/**
 * Screen stack with slide/fade transitions and spatial focus navigation.
 * Navigation is device-agnostic: keyboard calls move()/confirm()/back() here and the gamepad
 * layer (later phase) calls the same methods.
 */
export class UI {
  readonly layer: HTMLDivElement;
  private screens = new Map<string, Screen>();
  private wraps = new Map<Screen, HTMLElement>();
  private stack: Screen[] = [];
  /** Hooks for sound cues. */
  onCue?: (cue: 'hover' | 'click' | 'back') => void;
  onChange?: (top: Screen | null) => void;

  constructor(root: HTMLElement) {
    this.layer = h('div.screens');
    root.appendChild(this.layer);
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    this.layer.addEventListener('mouseover', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
      if (t && !t.hasAttribute('disabled') && document.activeElement !== t) {
        t.focus({ preventScroll: true });
        this.onCue?.('hover');
      }
    });
    this.layer.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
      if (t && !t.hasAttribute('disabled')) this.onCue?.('click');
    });
  }

  register(s: Screen): void {
    const wrap = h('div.screen', { 'data-screen': s.id });
    wrap.hidden = true;
    wrap.appendChild(s.el);
    this.layer.appendChild(wrap);
    this.wraps.set(s, wrap);
    this.screens.set(s.id, s);
  }

  private W(s: Screen): HTMLElement {
    return this.wraps.get(s)!;
  }

  get top(): Screen | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  /** Push a screen on top (hides nothing for overlays, otherwise replaces visually). */
  show(id: string, opts: { replace?: boolean } = {}): void {
    const s = this.screens.get(id);
    if (!s) return;
    if (opts.replace) { const t = this.stack.pop(); if (t) this.W(t).classList.remove('shown'); };
    const prev = this.top;
    if (prev && !s.overlay) this.hideEl(prev);
    this.stack.push(s);
    s.onShow?.();
    this.W(s).hidden = false;
    // restart the enter animation
    this.W(s).classList.remove('shown');
    void this.W(s).offsetWidth;
    this.W(s).classList.add('shown');
    this.layer.classList.toggle('open', true);
    requestAnimationFrame(() => (s.focus?.() ?? this.focusables(this.W(s))[0])?.focus({ preventScroll: true }));
    this.onChange?.(s);
  }

  /** Pop the top screen and reveal the one below. */
  back(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.hideEl(s);
    const below = this.top;
    if (below) {
      below.onShow?.();
      this.W(below).hidden = false;
      this.W(below).classList.remove('shown');
      void this.W(below).offsetWidth;
      this.W(below).classList.add('shown');
      requestAnimationFrame(() => (below.focus?.() ?? this.focusables(this.W(below))[0])?.focus({ preventScroll: true }));
    }
    this.layer.classList.toggle('open', this.stack.length > 0);
    this.onCue?.('back');
    this.onChange?.(this.top);
  }

  closeAll(): void {
    while (this.stack.length) this.hideEl(this.stack.pop()!);
    this.layer.classList.remove('open');
    this.onChange?.(null);
  }

  private hideEl(s: Screen): void {
    this.W(s).classList.remove('shown');
    this.W(s).hidden = true;
  }

  // ------------------------------------------------------------------ navigation

  private focusables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('[data-nav]:not([disabled])')].filter((e) => e.offsetParent !== null);
  }

  /** Spatial focus move. Sliders consume left/right. */
  move(dir: Dir): void {
    const s = this.top;
    if (!s) return;
    const cur = document.activeElement as HTMLElement | null;
    if (cur instanceof HTMLInputElement && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = Number(cur.step) || 0.05;
      cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + (dir === 'right' ? step : -step))));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const list = this.focusables(this.W(s));
    if (!list.length) return;
    if (!cur || !list.includes(cur)) {
      list[0].focus();
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax;
      const dy = r.top + r.height / 2 - ay;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      if (along <= 4) continue;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus({ preventScroll: false });
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this.onCue?.('hover');
    }
  }

  confirm(): void {
    const cur = document.activeElement as HTMLElement | null;
    if (cur && (this.top && this.W(this.top).contains(cur))) cur.click();
  }

  cancel(): void {
    const s = this.top;
    if (!s) return;
    if (s.onBack?.()) return;
    this.back();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    // Rebinding capture screens set this flag and handle keys themselves.
    if (document.body.classList.contains('capturing-key')) return;
    const t = e.target as HTMLElement;
    const inField = t instanceof HTMLInputElement && t.type !== 'range';
    if (inField) return;
    const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    const d = map[e.code];
    if (d) {
      e.preventDefault();
      e.stopPropagation();
      this.move(d);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      // Native button activation handles it, but make sure focus exists.
      if (!(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.confirm();
      }
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
    }
  }
}
