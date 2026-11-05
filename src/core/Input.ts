/**
 * Unified input. Game code only ever sees `InputState`; device sources (keyboard now,
 * gamepad + touch in a later phase) are merged here.
 */
export interface InputState {
  /** 0..1 gas */
  throttle: number;
  /** 0..1 brake / reverse */
  brake: number;
  /** -1..1 air tilt. +1 = nose up (counter-clockwise when facing right). */
  tilt: number;
  boost: boolean;
  /** Edge-triggered (true for exactly one poll). */
  restart: boolean;
  pause: boolean;
}

import { GamepadSource } from './Gamepad';

export type Action = 'gas' | 'brake' | 'tiltUp' | 'tiltDown' | 'boost' | 'restart' | 'pause';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  gas: ['ArrowRight', 'KeyD'],
  brake: ['ArrowLeft', 'KeyA'],
  tiltUp: ['ArrowUp', 'KeyW'],
  tiltDown: ['ArrowDown', 'KeyS'],
  boost: ['Space'],
  restart: ['KeyR'],
  pause: ['Escape', 'KeyP'],
};

/** A device that contributes to the unified state each poll. */
export interface InputSource {
  /** Set by the manager: call when the player actively uses this device (drives glyph prompts). */
  onActivity?: () => void;
  poll(out: InputState): void;
  /** Called after the frame consumed edge-triggered values. */
  endFrame?(): void;
}

class KeyboardSource implements InputSource {
  private down = new Set<string>();
  private pressed = new Set<string>();
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  onActivity?: () => void;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.onActivity?.();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      // Stop arrows/space from scrolling the page.
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private held(a: Action): boolean {
    return this.bindings[a].some((c) => this.down.has(c));
  }
  private hit(a: Action): boolean {
    return this.bindings[a].some((c) => this.pressed.has(c));
  }
  /** Raw key press check for dev tools. */
  keyHit(code: string): boolean {
    return this.pressed.has(code);
  }

  poll(out: InputState): void {
    out.throttle = Math.max(out.throttle, this.held('gas') ? 1 : 0);
    out.brake = Math.max(out.brake, this.held('brake') ? 1 : 0);
    const t = (this.held('tiltUp') ? 1 : 0) - (this.held('tiltDown') ? 1 : 0);
    if (t !== 0) out.tilt = t;
    out.boost ||= this.held('boost');
    out.restart ||= this.hit('restart');
    out.pause ||= this.hit('pause');
  }

  endFrame(): void {
    this.pressed.clear();
  }
}

export type Device = 'keyboard' | 'gamepad' | 'touch';

export class InputManager {
  readonly keyboard = new KeyboardSource();
  readonly gamepad = new GamepadSource();
  private sources: InputSource[] = [];
  readonly state: InputState = InputManager.blank();
  /** Last device the player used; drives on-screen glyph prompts. */
  lastDevice: Device = 'keyboard';
  onDeviceChange?: (d: Device) => void;

  constructor() {
    this.addSource(this.keyboard, 'keyboard');
    this.addSource(this.gamepad, 'gamepad');
  }

  setDevice(d: Device): void {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    this.onDeviceChange?.(d);
  }

  private static blank(): InputState {
    return { throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false };
  }

  addSource(s: InputSource, device: Device): void {
    s.onActivity = () => this.setDevice(device);
    this.sources.push(s);
  }

  /**
   * Gather state from all devices. Held values are recomputed fresh each call; edge values
   * (restart/pause) latch until `endFrame()` so a press is never lost between physics steps.
   */
  poll(): InputState {
    const s = this.state;
    const restart = s.restart;
    const pause = s.pause;
    s.throttle = 0;
    s.brake = 0;
    s.tilt = 0;
    s.boost = false;
    s.restart = restart;
    s.pause = pause;
    for (const src of this.sources) src.poll(s);
    return s;
  }

  endFrame(): void {
    this.state.restart = false;
    this.state.pause = false;
    for (const src of this.sources) src.endFrame?.();
  }
}
