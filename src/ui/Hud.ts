const STAR_SVG =
  '<svg viewBox="-1 -1 2 2"><path d="M0 -0.9 L0.27 -0.3 L0.9 -0.28 L0.4 0.12 L0.58 0.78 L0 0.4 L-0.58 0.78 L-0.4 0.12 L-0.9 -0.28 L-0.27 -0.3Z" fill="#ffc933" stroke="#b9801a" stroke-width="0.12" stroke-linejoin="round"/></svg>';

export const fmtTime = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

export interface CompleteInfo {
  time: number;
  par: number;
  stars: number;
  deaths: number;
  hasNext: boolean;
  name: string;
  newBest: boolean;
  /** Extra line (new stars, world unlocked). */
  note?: string;
}

/** In-level HUD + level-complete card (DOM overlay). */
export class Hud {
  private root: HTMLDivElement;
  private timer: HTMLElement;
  private lvl: HTMLElement;
  private stars: HTMLElement[] = [];
  private pips: HTMLElement;
  private deaths: HTMLElement;
  private hint: HTMLElement;
  private hintTimer = 0;
  private card?: HTMLDivElement;
  private cardBack?: () => void;
  /** Rewrites hint text for the active input device (set by App). */
  hintAdapter: (t: string) => string = (t) => t;

  constructor(private parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <button class="hud-btn" data-pause aria-label="Pause" title="Pause (Esc)">❚❚</button>
          <button class="hud-btn" data-restart aria-label="Restart" title="Restart (R)">⟲</button>
          <div class="pill lvl"></div>
        </div>
        <div class="pill" data-r>
          <span class="cp-pips"></span>
          <span data-stars style="display:inline-flex;gap:3px"></span>
        </div>
      </div>
      <div class="hud-center"><div class="pill timer">00:00.0</div></div>
      <div class="hud-hint"></div>
      <div class="hud-bottom"><span class="pill deaths">☠ 0</span></div>`;
    parent.appendChild(this.root);
    this.timer = this.root.querySelector('.timer')!;
    this.lvl = this.root.querySelector('.lvl')!;
    this.pips = this.root.querySelector('.cp-pips')!;
    this.deaths = this.root.querySelector('.deaths')!;
    this.hint = this.root.querySelector('.hud-hint')!;
    const holder = this.root.querySelector('[data-stars]')!;
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = 'star-slot';
      s.innerHTML = STAR_SVG;
      holder.appendChild(s);
      this.stars.push(s);
    }
  }

  bindButtons(h: { onPause: () => void; onRestart: () => void }): void {
    this.root.querySelector('[data-pause]')!.addEventListener('click', h.onPause);
    this.root.querySelector('[data-restart]')!.addEventListener('click', h.onRestart);
  }

  setLevel(id: number, name: string, checkpoints: number, accent: number, hint?: string): void {
    this.lvl.innerHTML = `<b>${id}</b>${name}`;
    this.pips.innerHTML = '';
    for (let i = 0; i < checkpoints; i++) {
      const p = document.createElement('span');
      p.className = 'cp-pip';
      this.pips.appendChild(p);
    }
    document.documentElement.style.setProperty('--accent', '#' + accent.toString(16).padStart(6, '0'));
    this.setStars([false, false, false]);
    this.setDeaths(0);
    this.setTime(0);
    this.hideComplete();
    if (hint) this.showHint(hint, 4200);
  }

  setTime(t: number): void {
    this.timer.textContent = fmtTime(t);
  }
  setDeaths(n: number): void {
    this.deaths.textContent = `☠ ${n}`;
  }
  setStars(on: boolean[]): void {
    this.stars.forEach((s, i) => s.classList.toggle('on', !!on[i]));
  }
  setCheckpoints(reached: number): void {
    [...this.pips.children].forEach((p, i) => p.classList.toggle('on', i < reached));
  }

  showHint(text: string, ms = 3000): void {
    this.hint.textContent = this.hintAdapter(text);
    this.hint.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.remove('show'), ms);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  showComplete(info: CompleteInfo, onNext: () => void, onRetry: () => void, onLevels?: () => void): void {
    this.hideComplete();
    const el = document.createElement('div');
    el.className = 'complete';
    const medals = [
      ['Finish', true],
      ['Par time', info.time <= info.par],
      ['All stars', info.stars >= 3],
    ] as const;
    el.innerHTML = `
      <div class="card">
        <h2>LEVEL COMPLETE</h2>
        <div class="sub">${info.name}${info.newBest ? ' · New best!' : ''}</div>
        ${info.note ? `<div class="note">${info.note}</div>` : ''}
        <div class="stars">${[0, 1, 2].map(() => `<span class="star-slot">${STAR_SVG}</span>`).join('')}</div>
        <div class="time">00:00.0</div>
        <div class="par">Par ${fmtTime(info.par)} · ☠ ${info.deaths}</div>
        <div class="medals">${medals.map(([n, on]) => `<span class="medal ${on ? 'on' : ''}">${n}</span>`).join('')}</div>
        <div class="btns">
          <button class="btn alt" data-levels>Levels</button>
          <button class="btn alt" data-retry>Retry <small>(R)</small></button>
          ${info.hasNext ? '<button class="btn" data-next>Next ▶</button>' : ''}
        </div>
      </div>`;
    this.parent.appendChild(el);
    this.card = el;
    this.cardBack = onLevels;
    el.querySelector('[data-retry]')!.addEventListener('click', onRetry);
    el.querySelector('[data-levels]')!.addEventListener('click', () => onLevels?.());
    el.querySelector('[data-next]')?.addEventListener('click', onNext);
    requestAnimationFrame(() => el.classList.add('show'));
    // staged reveal: stars pop one by one, time counts up
    const slots = [...el.querySelectorAll<HTMLElement>('.stars .star-slot')];
    slots.forEach((s, i) => {
      setTimeout(() => {
        s.classList.add('pop');
        if (i >= info.stars) s.classList.add('off');
      }, 450 + i * 280);
    });
    const tEl = el.querySelector<HTMLElement>('.time')!;
    const t0 = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      tEl.textContent = fmtTime(info.time * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && this.card === el) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') onLevels?.();
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const b = [...el.querySelectorAll<HTMLElement>('.btn')];
        const i = b.indexOf(document.activeElement as HTMLElement);
        b[(i + (e.code === 'ArrowRight' ? 1 : -1) + b.length) % b.length]?.focus();
      }
    });
    (el.querySelector<HTMLElement>('[data-next]') ?? el.querySelector<HTMLElement>('[data-retry]'))?.focus();
  }

  /** Gamepad/keyboard helpers for the complete card (it isn't part of the screen stack). */
  navigateCard(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.card) return;
    const b = [...this.card.querySelectorAll<HTMLElement>('.btn')];
    const i = b.indexOf(document.activeElement as HTMLElement);
    const step = dir === 'right' || dir === 'down' ? 1 : -1;
    b[(i + step + b.length) % b.length]?.focus();
  }

  activateCard(): void {
    (document.activeElement as HTMLElement | null)?.closest('.complete') && (document.activeElement as HTMLElement).click();
  }

  backCard(): void {
    this.cardBack?.();
  }

  hideComplete(): void {
    this.card?.remove();
    this.card = undefined;
  }

  get completeOpen(): boolean {
    return !!this.card;
  }
}
