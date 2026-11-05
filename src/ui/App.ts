import { Game, CompleteResult } from '../core/Game';
import { Save, LEVELS_PER_WORLD, WORLD_COUNT, levelId, worldOf } from '../core/Save';
import { UI } from './UI';
import { h } from './dom';
import { hasLevel } from '../levels/registry';
import { THEMES } from '../levels/themes';
import { creditsScreen, levelSelect, mainMenu, pauseMenu, settingsScreen, worldSelect } from './screens';

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
  private toastEl: HTMLElement;
  private toastTimer = 0;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.game = new Game(canvas, root);
    this.ui = new UI(root);
    this.toastEl = h('div.toast');
    root.appendChild(this.toastEl);

    for (const make of [mainMenu, worldSelect, levelSelect, pauseMenu, settingsScreen, creditsScreen]) this.ui.register(make(this));

    this.ui.onCue = (c) => (c === 'hover' ? this.audio.hover() : c === 'click' ? this.audio.click() : this.audio.hover());
    this.ui.onChange = () => document.body.classList.toggle('menu-open', this.ui.isOpen);

    this.game.onPauseRequest = () => this.pauseGame();
    this.game.onComplete = (r) => this.showComplete(r);
    this.game.onQualityDrop = (q) => this.toast(`Frame rate was low — graphics set to ${q}`);
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
    this.game.applySettings(this.save.settings);
  }

  boot(): void {
    this.applySettings();
    this.game.start();
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

  playLevel(id: number): void {
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
  }

  restartFromPause(): void {
    this.ui.closeAll();
    this.game.resume();
    this.game.restartLevel();
  }

  // ------------------------------------------------------------------ results

  private showComplete(r: CompleteResult): void {
    const wasOpen = this.save.worldUnlocked(worldOf(r.id) + 1);
    const res = this.save.complete(r.id, r.time, r.starMask, r.deaths);
    const w = worldOf(r.id);
    const unlockedNow = !wasOpen && this.save.worldUnlocked(w + 1) && hasLevel(levelId(w + 1, 1));
    const next = r.id + 1;
    const hasNext = hasLevel(next) && next < 900 && this.save.levelUnlocked(next);
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
