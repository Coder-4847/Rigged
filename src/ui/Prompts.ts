import type { Device } from '../core/Input';
import type { PadKind } from '../core/Gamepad';
import type { Action } from '../core/Input';

export type Glyph = 'confirm' | 'back' | 'move' | 'gas' | 'brake' | 'tilt' | 'restart' | 'pause' | 'boost';

const KEY_NAMES: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Backspace: '⌫', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift' };
export const keyName = (code: string): string => KEY_NAMES[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');

const cap = (t: string) => `<span class="glyph key">${t}</span>`;
const xb = (t: string, c: string) => `<span class="glyph pad xb ${c}">${t}</span>`;
const ps = (t: string, c: string) => `<span class="glyph pad ps ${c}">${t}</span>`;
const plain = (t: string) => `<span class="glyph pad">${t}</span>`;

const TOUCH: Record<Glyph, string> = { confirm: 'Tap', back: 'Back', move: 'Tap', gas: 'GAS', brake: 'BRAKE', tilt: '⟲ ⟳', restart: '⟲', pause: '❚❚', boost: 'BOOST' };

/**
 * Glyph HTML for an action on the device the player last used. Keyboard glyphs follow the
 * player's own key bindings; gamepad glyphs follow the controller family (Xbox / PlayStation).
 */
export function glyph(g: Glyph, device: Device, pad: PadKind, bindings?: Record<Action, string[]>): string {
  const first = (a: Action, i = 0) => bindings?.[a]?.[i] ?? bindings?.[a]?.[0] ?? '';
  if (device === 'keyboard') {
    switch (g) {
      case 'confirm': return cap('Enter');
      case 'back': return cap('Esc');
      case 'move': return cap('↑') + cap('↓') + cap('←') + cap('→');
      case 'gas': return cap(keyName(first('gas')));
      case 'brake': return cap(keyName(first('brake')));
      case 'tilt': return cap(keyName(first('tiltUp'))) + cap(keyName(first('tiltDown')));
      case 'restart': return cap(keyName(first('restart')));
      case 'pause': return cap(keyName(first('pause')));
      case 'boost': return cap(keyName(first('boost')));
    }
  }
  if (device === 'touch') return plain(TOUCH[g]);
  if (pad === 'ps') {
    switch (g) {
      case 'confirm': return ps('✕', 'cross');
      case 'back': return ps('○', 'circle');
      case 'move': return plain('D-pad');
      case 'gas': return plain('R2');
      case 'brake': return plain('L2');
      case 'tilt': return plain('L-stick');
      case 'restart': return ps('△', 'triangle');
      case 'pause': return plain('Options');
      case 'boost': return ps('✕', 'cross');
    }
  }
  switch (g) {
    case 'confirm': return xb('A', 'a');
    case 'back': return xb('B', 'b');
    case 'move': return plain('D-pad');
    case 'gas': return plain('RT');
    case 'brake': return plain('LT');
    case 'tilt': return plain('L-stick');
    case 'restart': return xb('Y', 'y');
    case 'pause': return plain('Menu');
    case 'boost': return xb('A', 'a');
  }
}

/** Rewrite keyboard-flavoured level hints ("Hold → to drive") for the active device. */
export function adaptHint(text: string, device: Device, pad: PadKind): string {
  if (device === 'keyboard') return text;
  const gas = device === 'touch' ? 'GAS' : pad === 'ps' ? 'R2' : 'RT';
  const brake = device === 'touch' ? 'BRAKE' : pad === 'ps' ? 'L2' : 'LT';
  const tilt = device === 'touch' ? '⟲ / ⟳' : 'stick';
  return text.replace(/↑ ?\/ ?↓/g, tilt).replace(/→/g, gas).replace(/←/g, brake);
}
