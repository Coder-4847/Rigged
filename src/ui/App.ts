import { Game, CompleteResult } from '../core/Game';
import { Save, LEVELS_PER_WORLD, WORLD_COUNT, levelId, worldOf } from '../core/Save';
import { UI } from './UI';
import { h } from './dom';
import { hasLevel } from '../levels/registry';
import { THEMES } from '../levels/themes';
import { TouchControls } from './Touch';
import { PadNav } from './PadNav';
import { adaptHint, glyph } from './Prompts';
import type { Device } from '../core/Input';
import { sanitizeGarage, unlockedKeys, newlyUnlocked } from '../core/Unlocks';
import { creditsScreen, garageScreen, levelSelect, mainMenu, pauseMenu, settingsScreen, worldSelect } from './screens';

/**
 * Application shell: owns save data, the game runtime and the menu screens, and wires the flow
 * (menu → worlds → levels → play → pause/complete → ...).
 */
export class App {
  readonly save = new Save();
  readonly game: Game;
  readonly ui: UI;
  /** World shown in the level-select screen. */
  currentWorld = 1;
  readonly touch: TouchControls;
  private promptBar: HTMLElement;
  private pads: PadNav;
  private toastEl: HTMLElement;
  private toastTimer = 0;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.game = new Game(canvas, root);
    this.ui = new UI(root);
    this.toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    root.appendChild(this.toastEl);
    this.promptBar = h('div.prompts');
    root.appendChild(this.promptBar);
    this.touch = new TouchControls(root);
    this.game.input.addSource(this.touch, 'touch');
    document.body.appendChild(h('div.rotate-prompt', {}, h('div', {}, h('div.big-ico', {}, '📱'), 'Rotate your device', h('small', {}, 'RIGGED plays in landscape'))));

    for (const make of [mainMenu, worldSelect, levelSelect, garageScreen, pauseMenu, settingsScreen, creditsScreen]) this.ui.register(make(this));

    this.ui.onCue = (c) => (c === 'hover' ? this.audio.hover() : c === 'click' ? this.audio.click() : this.audio.hover());
    this.ui.onChange = () => {
      document.body.classList.toggle('menu-open', this.ui.isOpen);
      this.refreshPrompts();
    };

    this.game.onPauseRequest = () => this.pauseGame();
    this.game.onComplete = (r) => this.showComplete(r);
    this.game.onStuck = () => this.toast('Stuck? Pause → Garage to try a different vehicle');
    this.game.onQualityDrop = (q) => this.toast(`Frame rate was low — graphics set to ${q}`);
    // --- input devices: glyph prompts, hot-plug, controller menus
    const input = this.game.input;
    input.onDeviceChange = (d) => this.deviceChanged(d);
    window.addEventListener('pointerdown', (e) => input.setDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard'), true);
    input.gamepad.onConnect = (_n, kind) => {
      this.toast(`🎮 ${kind === 'ps' ? 'PlayStation' : kind === 'xbox' ? 'Xbox' : 'Generic'} controller connected`);
      this.refreshPrompts();
    };
    input.gamepad.onDisconnect = () => {
      this.toast('🎮 Controller disconnected');
      if (this.game.mode === 'play') this.pauseGame();
      if (input.lastDevice === 'gamepad') input.setDevice('keyboard');
    };
    this.pads = new PadNav(() => input.gamepad.refresh(), {
      active: () => this.ui.isOpen || this.game.hud.completeOpen,
      activity: () => input.setDevice('gamepad'),
      move: (d) => (this.ui.isOpen ? this.ui.move(d) : this.game.hud.navigateCard(d)),
      confirm: () => (this.ui.isOpen ? this.ui.confirm() : this.game.hud.activateCard()),
      back: () => (this.ui.isOpen ? this.ui.cancel() : this.game.hud.backCard()),
      start: () => this.ui.top?.id === 'pause' && this.ui.cancel(),
    });
    this.game.hud.hintAdapter = (t) => adaptHint(t, input.lastDevice, input.gamepad.kind);
    this.game.hud.bindButtons({ onPause: () => this.pauseGame(), onRestart: () => this.game.restart() });
    // M toggles mute anywhere (except while typing / rebinding a key).
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !document.body.classList.contains('capturing-key')) {
        this.save.settings.muted = !this.save.settings.muted;
        this.save.commit();
        this.applySettings();
        this.toast(this.save.settings.muted ? 'Sound off' : 'Sound on');
      }
    });
    // Save on tab hide so progress is never lost.
    document.addEventListener('visibilitychange', () => document.hidden && this.save.flush());
    window.addEventListener('pagehide', () => this.save.flush());
  }

  get audio() {
    return this.game.audio;
  }

  applySettings(): void {
    const st = this.save.settings;
    document.documentElement.style.setProperty('--ui-scale', String(st.uiScale || 1));
    document.body.classList.toggle('hc', !!st.highContrast);
    document.body.classList.toggle('scaled', (st.uiScale || 1) !== 1);
    this.game.applySettings(st);
    this.applyGarage();
  }

  /** Push the (validated) garage selection into the game. */
  applyGarage(): void {
    const g = sanitizeGarage(this.save);
    Object.assign(this.save.data.garage, g);
    this.game.garage = g;
  }

  /** Called whenever the player switches between keyboard / gamepad / touch. */
  private deviceChanged(d: Device): void {
    document.body.dataset.device = d;
    this.refreshPrompts();
  }

  /** Footer button prompts + touch-control visibility (cheap; runs on events and a slow timer). */
  private refreshPrompts(): void {
    const input = this.game.input;
    const d = input.lastDevice;
    const k = input.gamepad.kind;
    const b = this.save.settings.bindings;
    const g = (x: Parameters<typeof glyph>[0]) => glyph(x, d, k, b);
    const card = this.game.hud.completeOpen;
    const menu = this.ui.isOpen;
    let html = '';
    if (d !== 'touch' && (menu || card)) {
      if (card) html = `<span>${g('confirm')} Select</span><span>${g('restart')} Retry</span><span>${g('back')} Levels</span>`;
      else if (this.ui.top?.id === 'pause') html = `<span>${g('move')} Navigate</span><span>${g('confirm')} Select</span><span>${g('back')} Resume</span>`;
      else html = `<span>${g('move')} Navigate</span><span>${g('confirm')} Select</span><span>${g('back')} Back</span>`;
    }
    if (html !== this.promptHtml) {
      this.promptHtml = html;
      this.promptBar.innerHTML = html;
    }
    this.promptBar.classList.toggle('show', !!html);

    // Touch controls: only while actually driving.
    const s = this.save.settings;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const want = s.touch === 'on' || (s.touch === 'auto' && (d === 'touch' || (coarse && d !== 'gamepad')));
    const driving = this.game.mode === 'play' && !this.game.paused && !menu && !card;
    this.touch.setVisible(want && driving);
    this.touch.setBoost(!!this.game.data?.boost);
    this.touch.setHaptics(!s.reducedMotion);
  }
  private promptHtml = '';

  boot(): void {
    this.applySettings();
    this.game.start();
    this.pads.start();
    setInterval(() => this.refreshPrompts(), 250);
    document.body.dataset.device = this.game.input.lastDevice;
    // ?level=N jumps straight into a level (dev/testing, shareable links).
    const q = new URLSearchParams(location.search).get('level');
    if (q && hasLevel(Number(q))) {
      this.game.startPlay(Number(q), false);
      return;
    }
    this.toMainMenu();
  }

  // ------------------------------------------------------------------ navigation

  /** First level worth playing next: earliest unlocked, uncleared level; else the last one played. */
  nextUnplayed(): number {
    for (let w = 1; w <= WORLD_COUNT; w++)
      for (let n = 1; n <= LEVELS_PER_WORLD; n++) {
        const id = levelId(w, n);
        if (hasLevel(id) && this.save.levelUnlocked(id) && !this.save.rec(id).done) return id;
      }
    return hasLevel(this.save.data.lastLevel) ? this.save.data.lastLevel : 1;
  }

  continueGame(): void {
    this.playLevel(this.nextUnplayed());
  }

  backdrop(id: number): void {
    if (!hasLevel(id)) id = 1;
    const w = worldOf(id);
    this.game.attractMin = hasLevel(levelId(w, 1)) ? levelId(w, 1) : 1;
    let max = this.game.attractMin;
    while (hasLevel(max + 1) && worldOf(max + 1) === w && max + 1 < 900) max++;
    this.game.attractMax = max;
    if (this.game.mode !== 'attract' || this.game.data?.id !== id) this.game.startAttract(id);
  }

  toMainMenu(): void {
    this.ui.closeAll();
    this.game.hud.hideComplete();
    this.backdrop(this.save.data.lastLevel);
    this.ui.show('main');
  }

  openWorlds(): void {
    this.ui.show('worlds');
  }

  openLevels(w: number): void {
    this.currentWorld = w;
    this.backdrop(levelId(w, 1));
    this.ui.show('levels');
  }

  /** From pause / complete: land on the level-select screen of the current world, with Back working. */
  toLevelSelect(): void {
    const w = worldOf(this.game.data.id);
    this.ui.closeAll();
    this.game.hud.hideComplete();
    this.currentWorld = w;
    this.backdrop(levelId(w, 1));
    this.ui.show('main');
    this.ui.show('worlds');
    this.ui.show('levels');
  }

  /** Phones: go fullscreen + lock landscape on the first Play tap (needs a user gesture; failures are fine). */
  private tryLandscape(): void {
    if (this.game.input.lastDevice !== 'touch' || document.fullscreenElement) return;
    void document.documentElement
      .requestFullscreen?.()
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  }

  playLevel(id: number): void {
    this.tryLandscape();
    this.ui.closeAll();
    this.save.data.lastLevel = id;
    this.game.startPlay(id);
  }

  shakeDeny(el: HTMLElement): void {
    el.classList.remove('deny');
    void el.offsetWidth;
    el.classList.add('deny');
    this.audio.hazard('crusher-warn', 0.2);
  }

  // ------------------------------------------------------------------ pause

  pauseGame(): void {
    if (this.game.mode !== 'play' || this.game.paused || this.ui.isOpen || this.game.hud.completeOpen) return;
    this.game.pause();
    this.ui.show('pause');
  }

  resume(): void {
    this.ui.closeAll();
    this.game.resume();
    // Changed vehicle/paint in the garage while paused → rebuild the car (from the last checkpoint).
    if (this.game.garageChanged()) this.game.restart(false);
  }

  restartFromPause(): void {
    this.ui.closeAll();
    this.game.resume();
    this.game.restartLevel();
  }

  // ------------------------------------------------------------------ results

  private showComplete(r: CompleteResult): void {
    const wasOpen = this.save.worldUnlocked(worldOf(r.id) + 1);
    const before = unlockedKeys(this.save);
    const res = this.save.complete(r.id, r.time, r.starMask, r.deaths);
    const w = worldOf(r.id);
    const unlockedNow = !wasOpen && this.save.worldUnlocked(w + 1) && hasLevel(levelId(w + 1, 1));
    const next = r.id + 1;
    const hasNext = hasLevel(next) && next < 900 && this.save.levelUnlocked(next);
    const fresh = newlyUnlocked(this.save, before);
    if (fresh.length) setTimeout(() => this.toast(`🔓 Unlocked: ${fresh.slice(0, 3).map((f) => f.name).join(', ')}${fresh.length > 3 ? ` +${fresh.length - 3}` : ''}`), 1800);
    const note = unlockedNow ? `World ${w + 1} unlocked — ${THEMES[w + 1]?.name ?? ''}!` : res.newStars > 0 ? `+${res.newStars} new star${res.newStars > 1 ? 's' : ''}` : '';
    this.game.hud.showComplete(
      { time: r.time, par: r.par, stars: r.stars, deaths: r.deaths, hasNext, name: r.name, newBest: res.newBest && !res.first, note },
      () => this.playLevel(next),
      () => this.game.restartLevel(),
      () => this.toLevelSelect(),
    );
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 3200);
  }
}
