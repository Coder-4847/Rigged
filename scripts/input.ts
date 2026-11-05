export {};
/** Unit checks for gamepad mapping, deadzones, device detection, menu nav and hint adaptation. Run: npx tsx scripts/input.ts */
const { GamepadSource, PAD, stick, padKind, readPad } = await import('../src/core/Gamepad');
const { PadNav } = await import('../src/ui/PadNav');
const { adaptHint, glyph } = await import('../src/ui/Prompts');

let failed = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) failed++;
};

interface FakePad { id: string; connected: boolean; mapping: string; buttons: { pressed: boolean; value: number }[]; axes: number[]; vibrationActuator?: { playEffect: (t: string, o: object) => Promise<void> } }
const mk = (id = 'Xbox 360 Controller (STANDARD GAMEPAD)'): FakePad => ({
  id, connected: true, mapping: 'standard',
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
});
const press = (p: FakePad, i: number, v = 1) => { p.buttons[i] = { pressed: v > 0.3, value: v }; };
const blank = () => ({ throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false });

let pad: FakePad | null = mk();
const src = new GamepadSource(() => [pad as unknown as Gamepad]);
let connected = 0;
src.onConnect = () => connected++;
const poll = () => { const o = blank(); src.poll(o); return o; };

check('device kind detection', padKind('Xbox One') === 'xbox' && padKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)') === 'ps' && padKind('Logitech F310') === 'generic');
check('hot-plug: first poll connects + fires event', poll().throttle === 0 && src.connected && connected === 1 && src.kind === 'xbox');

press(pad, PAD.RT, 0.6);
check('RT analog → throttle', Math.abs(poll().throttle - 0.6) < 1e-6);
press(pad, PAD.RT, 0); press(pad, PAD.LT, 1);
check('LT → brake', poll().brake === 1);
press(pad, PAD.LT, 0);
press(pad, PAD.RIGHT); check('D-pad right → gas', poll().throttle === 1); press(pad, PAD.RIGHT, 0);
press(pad, PAD.LEFT); check('D-pad left → brake', poll().brake === 1); press(pad, PAD.LEFT, 0);

pad.axes = [0, -1, 0, 0];
check('stick up → tilt +1 (nose up)', poll().tilt > 0.95);
pad.axes = [0, 1, 0, 0];
check('stick down → tilt -1', poll().tilt < -0.95);
pad.axes = [-1, 0, 0, 0];
check('stick left → nose up', poll().tilt > 0.95);
pad.axes = [0.15, 0.1, 0, 0];
check('inside deadzone → no tilt', poll().tilt === 0);
check('deadzone rescale reaches ±1 at full tilt', Math.abs(stick(1, 0)[0] - 1) < 1e-6 && stick(0.3, 0)[0] > 0 && stick(0.3, 0)[0] < 0.2);
pad.axes = [0, 0, 0, 0];
press(pad, PAD.LB); check('LB → nose up', poll().tilt === 1); press(pad, PAD.LB, 0);
press(pad, PAD.RB); check('RB → nose down', poll().tilt === -1); press(pad, PAD.RB, 0);
press(pad, PAD.A); check('A → boost', poll().boost); press(pad, PAD.A, 0); poll();

press(pad, PAD.Y);
check('Y → restart (edge)', poll().restart);
check('held Y does not repeat', !poll().restart);
press(pad, PAD.Y, 0); poll();
press(pad, PAD.START);
check('Start → pause (edge)', poll().pause);
press(pad, PAD.START, 0); poll();

let rumbled: object | null = null;
pad.vibrationActuator = { playEffect: async (_t, o) => { rumbled = o; } };
src.rumble(0.8, 0.4, 200);
check('rumble calls dual-rumble', !!rumbled && (rumbled as { duration: number }).duration === 200);
rumbled = null; src.rumbleEnabled = false; src.rumble(1, 1, 100);
check('rumble respects the setting', rumbled === null);

pad = null;
poll();
check('unplug → disconnected', !src.connected);
check('no pad → snapshot null', readPad(() => []) === null);

// --- menu navigation
const log: string[] = [];
let menuOpen = false;
const nav = new PadNav(() => readPad(() => (pad ? [pad as unknown as Gamepad] : [])), {
  active: () => menuOpen, activity: () => log.push('activity'),
  move: (d) => log.push('move:' + d), confirm: () => log.push('confirm'), back: () => log.push('back'), start: () => log.push('start'),
});
pad = mk();
nav.tick(0); // prev state baseline
menuOpen = true;
press(pad, PAD.A); nav.tick(16);
check('press that opened the menu is ignored (wasActive guard)', !log.includes('confirm'));
press(pad, PAD.A, 0); nav.tick(32); press(pad, PAD.A); nav.tick(48);
check('A confirms once the menu has been open', log.includes('confirm'));
press(pad, PAD.A, 0); press(pad, PAD.B); nav.tick(64);
check('B goes back', log.includes('back'));
press(pad, PAD.B, 0); press(pad, PAD.DOWN); nav.tick(80);
check('D-pad down moves focus', log.includes('move:down'));
const before = log.filter((x) => x === 'move:down').length;
nav.tick(200);
check('no repeat before the initial delay', log.filter((x) => x === 'move:down').length === before);
nav.tick(500); nav.tick(620);
check('auto-repeat after holding', log.filter((x) => x === 'move:down').length >= before + 2);
press(pad, PAD.DOWN, 0);
pad.axes = [0.9, 0, 0, 0]; nav.tick(700);
check('left stick right → move right', log.includes('move:right'));
pad.axes = [0, 0, 0, 0]; press(pad, PAD.START); nav.tick(800);
check('Start reported to the menu', log.includes('start'));

// --- prompts
check('hint rewrite for Xbox pad', adaptHint('Hold → to drive', 'gamepad', 'xbox') === 'Hold RT to drive');
check('hint rewrite for PlayStation', adaptHint('Press ← to brake', 'gamepad', 'ps') === 'Press L2 to brake');
check('hint rewrite for touch', adaptHint('Tilt with ↑ / ↓', 'touch', 'xbox') === 'Tilt with ⟲ / ⟳');
check('keyboard hints untouched', adaptHint('Hold → to drive', 'keyboard', 'xbox') === 'Hold → to drive');
check('glyphs follow controller family', glyph('confirm', 'gamepad', 'xbox').includes('>A<') && glyph('confirm', 'gamepad', 'ps').includes('✕') && glyph('gas', 'gamepad', 'ps').includes('R2'));
check('keyboard glyphs follow remapped keys', glyph('gas', 'keyboard', 'xbox', { gas: ['KeyH'], brake: [], tiltUp: [], tiltDown: [], boost: [], restart: [], pause: [] }).includes('>H<'));

process.exit(failed ? 1 : 0);
