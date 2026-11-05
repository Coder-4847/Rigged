import type { InputSource, InputState } from './Input';

export type PadKind = 'xbox' | 'ps' | 'generic';

/** Raw snapshot used by both gameplay input and menu navigation. */
export interface PadSnapshot {
  id: string;
  kind: PadKind;
  buttons: boolean[];
  /** analog value per button (triggers) */
  values: number[];
  axes: number[];
}

/** Standard-mapping button indices (Xbox layout; PlayStation reports the same indices). */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export function padKind(id: string): PadKind {
  const s = id.toLowerCase();
  if (/(playstation|dualshock|dualsense|054c|wireless controller|ps4|ps5)/.test(s)) return 'ps';
  if (/(xbox|xinput|045e|microsoft)/.test(s)) return 'xbox';
  return 'generic';
}

export const DEADZONE = 0.22;

/** Radial deadzone with rescale so the usable range still reaches ±1. */
export function stick(x: number, y: number, dz = DEADZONE): [number, number] {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

/** First connected pad (preferring ones with the standard mapping), as a plain snapshot. */
export function readPad(getPads: () => ArrayLike<Gamepad | null>): PadSnapshot | null {
  const pads = getPads();
  let best: Gamepad | null = null;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected && (!best || (p.mapping === 'standard' && best.mapping !== 'standard'))) best = p;
  }
  if (!best) return null;
  return {
    id: best.id,
    kind: padKind(best.id),
    buttons: best.buttons.map((b) => b.pressed),
    values: best.buttons.map((b) => b.value),
    axes: [...best.axes],
  };
}

const defaultPads = (): ArrayLike<Gamepad | null> => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);

/**
 * Gamepad → gameplay input.
 *   RT gas · LT brake/reverse · left stick (or LB/RB, D-pad ↑↓) air tilt · A boost · Y/Select restart · Start pause.
 * The D-pad ←/→ also brake/gas so pads without analog triggers still work.
 */
export class GamepadSource implements InputSource {
  onActivity?: () => void;
  connected = false;
  kind: PadKind = 'generic';
  name = '';
  rumbleEnabled = true;
  /** Fired on hot-plug. */
  onConnect?: (name: string, kind: PadKind) => void;
  onDisconnect?: () => void;
  private prev: boolean[] = [];
  private lastActive = false;

  constructor(private getPads: () => ArrayLike<Gamepad | null> = defaultPads) {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', (e) => {
        const g = (e as GamepadEvent).gamepad;
        if (!g) return this.refresh() && undefined;
        this.connected = true;
        this.kind = padKind(g.id);
        this.name = g.id;
        this.onConnect?.(g.id, this.kind);
      });
      window.addEventListener('gamepaddisconnected', () => {
        // Another pad may still be connected.
        const still = readPad(this.getPads);
        this.connected = !!still;
        if (!still) this.onDisconnect?.();
      });
    }
  }

  /** Re-scan (some browsers only expose pads after the first button press). */
  refresh(): PadSnapshot | null {
    const s = readPad(this.getPads);
    if (s && !this.connected) {
      this.connected = true;
      this.kind = s.kind;
      this.name = s.id;
      this.onConnect?.(s.id, s.kind);
    }
    if (!s && this.connected) {
      this.connected = false;
      this.onDisconnect?.();
    }
    return s;
  }

  poll(out: InputState): void {
    const s = this.refresh();
    if (!s) return;
    const b = s.buttons;
    const v = s.values;
    const [lx, ly] = stick(s.axes[0] ?? 0, s.axes[1] ?? 0);

    const rt = Math.max(v[PAD.RT] ?? 0, b[PAD.RIGHT] ? 1 : 0);
    const lt = Math.max(v[PAD.LT] ?? 0, b[PAD.LEFT] ? 1 : 0);
    out.throttle = Math.max(out.throttle, rt > 0.05 ? rt : 0);
    out.brake = Math.max(out.brake, lt > 0.05 ? lt : 0);

    // Tilt: stick up / left = nose up (counter-clockwise), down / right = nose down; bumpers and D-pad too.
    const stickTilt = Math.abs(ly) >= Math.abs(lx) ? -ly : -lx;
    let tilt = stickTilt;
    if (b[PAD.LB] || b[PAD.UP]) tilt = 1;
    if (b[PAD.RB] || b[PAD.DOWN]) tilt = -1;
    if (b[PAD.LB] && b[PAD.RB]) tilt = 0;
    if (Math.abs(tilt) > Math.abs(out.tilt)) out.tilt = tilt;

    out.boost ||= !!b[PAD.A];
    // Edge-triggered actions
    const hit = (i: number) => !!b[i] && !this.prev[i];
    if (hit(PAD.Y) || hit(PAD.SELECT)) out.restart = true;
    if (hit(PAD.START)) out.pause = true;

    const active = b.some(Boolean) || Math.hypot(lx, ly) > 0.4 || rt > 0.2 || lt > 0.2;
    if (active && !this.lastActive) this.onActivity?.();
    if (active) this.onActivity?.();
    this.lastActive = active;
    this.prev = b;
  }

  /** Vibration (Chrome/Edge dual-rumble). Silent no-op where unsupported. */
  rumble(strong: number, weak: number, ms: number): void {
    if (!this.rumbleEnabled || !this.connected) return;
    const pads = this.getPads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i] as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
      if (p?.connected && p.vibrationActuator?.playEffect) {
        void p.vibrationActuator
          .playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })
          .catch(() => undefined);
        return;
      }
    }
  }
}
