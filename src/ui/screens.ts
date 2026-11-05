import { h, fmt, hex, starIcon } from './dom';
import type { Screen } from './UI';
import type { App } from './App';
import { THEMES, WorldTheme } from '../levels/themes';
import { hasLevel } from '../levels/registry';
import { getLevel } from '../levels/registry';
import { LEVELS_PER_WORLD, WORLD_COUNT, levelId, popcount } from '../core/Save';
import { Action } from '../core/Input';
import { DEFAULT_BINDINGS } from '../core/Input';

const btn = (label: string, onClick: () => void, cls = '') =>
  h<HTMLButtonElement>('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { 'data-nav': true, onClick }, label);

/** Mini world scene for a card: sky gradient + three silhouette layers (SVG, shape per world). */
function worldScene(t: WorldTheme, w: number): HTMLElement {
  const el = h('div.scene', { style: { background: `linear-gradient(${hex(t.skyTop)}, ${hex(t.skyHorizon)})` } });
  const layers: Array<[number, number]> = [[0.22, 0.5], [0.4, 0.62], [0.62, 0.78]];
  layers.forEach(([depth, base], i) => {
    let seed = w * 31 + i * 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    let d = `M0 100 L0 ${base * 100}`;
    let x = 0;
    while (x < 100) {
      const step = 8 + rnd() * 10;
      const hgt = base * 100 - (6 + rnd() * 16) * (1 - i * 0.2);
      if (t.bgShape === 'mountains' || t.bgShape === 'blobs') d += ` L${x + step / 2} ${hgt} L${x + step} ${base * 100}`;
      else if (t.bgShape === 'spires') d += ` L${x + step * 0.4} ${base * 100} L${x + step * 0.5} ${hgt - 8} L${x + step * 0.6} ${base * 100} L${x + step} ${base * 100}`;
      else d += ` L${x} ${hgt} L${x + step * 0.7} ${hgt} L${x + step * 0.7} ${base * 100}`;
      x += step;
    }
    d += ' L100 100 Z';
    const svg = h('div.layer', { style: { '--depth': depth } as never });
    svg.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${d}" fill="${hex(t.bg[2 - i] ?? t.bg[0])}"/></svg>`;
    el.appendChild(svg);
  });
  el.appendChild(h('div.ground', { style: { background: `linear-gradient(${hex(t.top)} 0 14%, ${hex(t.dirt)} 14%)` } }));
  return el;
}

// ---------------------------------------------------------------------------------------------

export function mainMenu(app: App): Screen {
  const stars = h('div.tag');
  const cont = btn('Play', () => app.continueGame(), 'big primary');
  const el = h(
    'div.menu',
    {},
    h('div.logo', {}, ...'RIGGED'.split('').map((c, i) => h('span', { style: { '--i': i } as never }, c))),
    h('div.tagline', {}, 'Drive. Don’t flip. One more try.'),
    h(
      'div.stack',
      {},
      cont,
      btn('Levels', () => app.openWorlds()),
      btn('Settings', () => app.ui.show('settings')),
      btn('Credits', () => app.ui.show('credits')),
    ),
    stars,
  );
  return {
    id: 'main',
    el,
    focus: () => cont,
    onShow() {
      const done = Object.values(app.save.data.levels).filter((r) => r.done).length;
      stars.textContent = `★ ${app.save.totalStars()}   ·   ${done} levels cleared`;
      cont.textContent = done ? 'Continue' : 'Play';
    },
    onBack: () => true,
  };
}

export function worldSelect(app: App): Screen {
  const grid = h('div.worlds');
  const el = h('div.panel', {}, h('h1', {}, 'Choose a world'), grid, h('div.row.center', {}, btn('Back', () => app.ui.back(), 'alt')));
  return {
    id: 'worlds',
    el,
    focus: () => grid.querySelector<HTMLElement>('.world:not(.locked):not(.soon)') ?? grid.querySelector('.world'),
    onShow() {
      grid.replaceChildren();
      for (let w = 1; w <= WORLD_COUNT; w++) {
        const t = THEMES[w];
        const built = hasLevel(levelId(w, 1));
        const open = app.save.worldUnlocked(w);
        const st = app.save.worldStats(w);
        const state = !built ? 'soon' : !open ? 'locked' : '';
        const card: HTMLButtonElement = h<HTMLButtonElement>(
          'button.world' + (state ? '.' + state : ''),
          {
            'data-nav': true,
            disabled: state === 'soon' ? true : undefined,
            'aria-label': `World ${w}, ${t.name}`,
            onClick: () => (open && built ? app.openLevels(w) : app.shakeDeny(card)),
            onPointermove: (e: PointerEvent) => {
              const r = card.getBoundingClientRect();
              card.style.setProperty('--px', String(((e.clientX - r.left) / r.width - 0.5).toFixed(3)));
            },
            onFocus: () => card.style.setProperty('--px', '0.15'),
          },
          worldScene(t, w),
          h('div.info', {}, h('b', {}, String(w)), h('span.name', {}, t.name)),
          h(
            'div.meta',
            {},
            state === 'soon'
              ? 'Coming soon'
              : state === 'locked'
                ? `🔒 ${Math.max(0, 8 - app.save.worldStats(w - 1).done)} more clears in World ${w - 1} — or ${app.save.starsToUnlock(w)} ★`
                : `${st.done}/${LEVELS_PER_WORLD} cleared · ★ ${st.stars}/${LEVELS_PER_WORLD * 3}`,
          ),
        );
        card.style.setProperty('--accent', hex(t.accent));
        grid.appendChild(card);
      }
    },
  };
}

export function levelSelect(app: App): Screen {
  const title = h('h1');
  const sub = h('div.sub');
  const grid = h('div.levels');
  const el = h('div.panel', {}, title, sub, grid, h('div.row.center', {}, btn('Back', () => app.ui.back(), 'alt')));
  let firstOpen: HTMLElement | null = null;
  return {
    id: 'levels',
    el,
    focus: () => firstOpen ?? grid.querySelector('.tile'),
    onShow() {
      const w = app.currentWorld;
      const t = THEMES[w];
      title.textContent = `${w} · ${t.name}`;
      const st = app.save.worldStats(w);
      sub.textContent = `${st.done}/${LEVELS_PER_WORLD} cleared · ★ ${st.stars}/${LEVELS_PER_WORLD * 3}`;
      el.style.setProperty('--accent', hex(t.accent));
      document.documentElement.style.setProperty('--accent', hex(t.accent));
      grid.replaceChildren();
      firstOpen = null;
      for (let n = 1; n <= LEVELS_PER_WORLD; n++) {
        const id = levelId(w, n);
        const lv = getLevel(id);
        const rec = app.save.rec(id);
        const open = app.save.levelUnlocked(id);
        const tile: HTMLButtonElement = h<HTMLButtonElement>(
          'button.tile' + (!lv ? '.soon' : !open ? '.locked' : rec.done ? '.done' : ''),
          {
            'data-nav': true,
            disabled: !lv ? true : undefined,
            'aria-label': lv ? `Level ${id}, ${lv.name}${open ? '' : ', locked'}` : `Level ${id}, coming soon`,
            onClick: () => (open ? app.playLevel(id) : app.shakeDeny(tile)),
          },
          h('div.num', {}, String(id)),
          h('div.lname', {}, lv ? lv.name : 'Coming soon'),
          lv && open
            ? h('div.tstars', {}, ...[0, 1, 2].map((i) => starIcon(!!(rec.stars & (1 << i)))))
            : h('div.tstars.lock', {}, lv ? '🔒' : ''),
          lv && rec.done
            ? h(
                'div.tmeta',
                {},
                h('span', {}, fmt(rec.best)),
                h('span.medal.on', { title: 'Finished' }, '✓'),
                h('span.medal' + (rec.best <= lv.parTime ? '.on' : ''), { title: `Par ${fmt(lv.parTime)}` }, '⏱'),
                h('span.medal' + (popcount(rec.stars) === 3 ? '.on' : ''), { title: 'All stars' }, '★'),
              )
            : lv && open
              ? h('div.tmeta.dim', {}, `Par ${fmt(lv.parTime)}`)
              : false,
        );
        if (!firstOpen && lv && open && !rec.done) firstOpen = tile;
        grid.appendChild(tile);
      }
      if (!firstOpen) firstOpen = grid.querySelector('.tile:not(.locked):not(.soon)');
    },
  };
}

export function pauseMenu(app: App): Screen {
  const resume = btn('Resume', () => app.resume(), 'big primary');
  const el = h(
    'div.card.pause',
    {},
    h('h2', {}, 'Paused'),
    h('div.sub'),
    h('div.stack', {}, resume, btn('Restart level', () => app.restartFromPause()), btn('Settings', () => app.ui.show('settings')), btn('Level select', () => app.toLevelSelect()), btn('Main menu', () => app.toMainMenu())),
  );
  const sub = el.querySelector('.sub') as HTMLElement;
  return {
    id: 'pause',
    el,
    overlay: false,
    focus: () => resume,
    onShow() {
      sub.textContent = `${app.game.data.id} · ${app.game.data.name}`;
    },
    onBack() {
      app.resume();
      return true;
    },
  };
}

// ---------------------------------------------------------------------------------------------

const ACTION_LABELS: Array<[Action, string]> = [
  ['gas', 'Gas / forward'],
  ['brake', 'Brake / reverse'],
  ['tiltUp', 'Tilt nose up'],
  ['tiltDown', 'Tilt nose down'],
  ['boost', 'Boost / handbrake'],
  ['restart', 'Restart'],
  ['pause', 'Pause'],
];

export const keyName = (code: string): string =>
  ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Backspace: '⌫', Enter: 'Enter', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift' } as Record<string, string>)[code] ??
  code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');

export function settingsScreen(app: App): Screen {
  const s = app.save.settings;
  const commit = () => {
    app.save.commit();
    app.applySettings();
  };

  const slider = (label: string, key: 'master' | 'sfx' | 'music') => {
    const val = h('span.val', {}, `${Math.round(s[key] * 100)}%`);
    const input = h<HTMLInputElement>('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], 'data-nav': true, 'aria-label': label });
    let last = 0;
    input.addEventListener('input', () => {
      s[key] = Number(input.value);
      val.textContent = `${Math.round(s[key] * 100)}%`;
      commit();
      if (performance.now() - last > 120) (app.audio.click(), (last = performance.now()));
    });
    return h('label.setting', {}, h('span.lab', {}, label), input, val);
  };

  const toggle = (label: string, key: 'muted' | 'shake' | 'reducedMotion' | 'rumble', hint = '') => {
    const b = h('button.btn.toggle', { 'data-nav': true, role: 'switch' });
    const paint = () => {
      b.textContent = s[key] ? 'On' : 'Off';
      b.classList.toggle('on', !!s[key]);
      b.setAttribute('aria-checked', String(!!s[key]));
    };
    b.addEventListener('click', () => {
      (s[key] as boolean) = !s[key];
      paint();
      commit();
    });
    paint();
    return h('div.setting', {}, h('span.lab', {}, label, hint && h('small', {}, hint)), b);
  };

  const choice = <K extends 'touch' | 'quality'>(label: string, key: K, options: Array<[Settings[K], string]>, hint = '') => {
    const b = h('button.btn.toggle', { 'data-nav': true });
    const paint = () => (b.textContent = options.find((o) => o[0] === s[key])?.[1] ?? '');
    b.addEventListener('click', () => {
      const i = options.findIndex((o) => o[0] === s[key]);
      (s[key] as Settings[K]) = options[(i + 1) % options.length][0];
      paint();
      commit();
    });
    paint();
    return h('div.setting', {}, h('span.lab', {}, label, hint && h('small', {}, hint)), b);
  };

  // --- controls remap
  const rows = h('div.binds');
  let capture: { action: Action; slot: number; btn: HTMLElement } | null = null;
  const stopCapture = () => {
    capture = null;
    document.body.classList.remove('capturing-key');
    renderBinds();
  };
  const renderBinds = () => {
    rows.replaceChildren();
    for (const [a, label] of ACTION_LABELS) {
      const slots = [0, 1].map((i) => {
        const code = s.bindings[a][i];
        const b = h('button.keycap', {
          'data-nav': true,
          'aria-label': `${label}, slot ${i + 1}: ${code ? keyName(code) : 'empty'}`,
          onClick: () => {
            capture = { action: a, slot: i, btn: b };
            b.textContent = 'press a key…';
            b.classList.add('capturing');
            document.body.classList.add('capturing-key');
          },
        }, code ? keyName(code) : '—');
        return b;
      });
      rows.appendChild(h('div.bind', {}, h('span.lab', {}, label), ...slots));
    }
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (!capture) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return stopCapture();
      if (/^F\d+$/.test(e.code)) return; // dev keys stay reserved
      const { action, slot } = capture;
      if (e.code === 'Backspace' || e.code === 'Delete') {
        if (s.bindings[action].filter(Boolean).length > 1 || !s.bindings[action][slot]) s.bindings[action][slot] = '';
      } else {
        // a key can only do one thing: take it from whoever had it
        for (const k of Object.keys(s.bindings) as Action[]) s.bindings[k] = s.bindings[k].map((c) => (c === e.code ? '' : c));
        s.bindings[action][slot] = e.code;
      }
      s.bindings[action] = [s.bindings[action][0] || '', s.bindings[action][1] || ''];
      // keep at least one key on every action: fall back to defaults if emptied
      for (const k of Object.keys(s.bindings) as Action[]) if (!s.bindings[k].some(Boolean)) s.bindings[k] = [...DEFAULT_BINDINGS[k]];
      commit();
      stopCapture();
    },
    true,
  );

  const reset = btn('Reset progress', () => {
    if (reset.dataset.armed) {
      app.save.reset();
      app.applySettings();
      reset.textContent = 'Progress deleted';
      delete reset.dataset.armed;
    } else {
      reset.dataset.armed = '1';
      reset.textContent = 'Really delete? Press again';
      setTimeout(() => {
        if (reset.dataset.armed) {
          delete reset.dataset.armed;
          reset.textContent = 'Reset progress';
        }
      }, 4000);
    }
  }, 'danger');

  const padStatus = h('div.padstatus');
  const el = h(
    'div.panel.settings',
    {},
    h('h1', {}, 'Settings'),
    h(
      'div.cols',
      {},
      h(
        'section',
        {},
        h('h3', {}, 'Audio'),
        slider('Master', 'master'),
        slider('Effects', 'sfx'),
        slider('Music', 'music'),
        toggle('Mute all', 'muted'),
        h('h3', {}, 'Display & comfort'),
        choice('Graphics', 'quality', [['auto', 'Auto'], ['low', 'Low'], ['med', 'Medium'], ['high', 'High']], 'Auto drops quality if frames stay slow'),
        toggle('Camera shake', 'shake'),
        toggle('Reduced motion', 'reducedMotion', 'No shake, speed lines or slow-mo'),
        choice('Touch controls', 'touch', [['auto', 'Auto'], ['on', 'Always'], ['off', 'Never']]),
        toggle('Controller rumble', 'rumble'),
        padStatus,
      ),
      h('section', {}, h('h3', {}, 'Keyboard controls'), rows, btn('Restore defaults', () => {
        s.bindings = structuredClone(DEFAULT_BINDINGS);
        commit();
        renderBinds();
      }, 'alt small'), h('h3', {}, 'Data'), reset),
    ),
    h('div.row.center', {}, btn('Back', () => app.ui.back(), 'alt')),
  );
  return {
    id: 'settings',
    el,
    onShow() {
      renderBinds();
      const g = app.game.input.gamepad.refresh();
      padStatus.textContent = g ? `🎮 ${g.kind === 'ps' ? 'PlayStation' : g.kind === 'xbox' ? 'Xbox' : 'Generic'} controller connected` : '🎮 No controller detected — press a button on it';
    },
    onBack() {
      if (capture) {
        stopCapture();
        return true;
      }
    },
  };
}

import type { Settings } from '../core/Save';

export function creditsScreen(app: App): Screen {
  const el = h(
    'div.card.credits',
    {},
    h('h2', {}, 'Credits'),
    h('p', {}, 'RIGGED — a side-scrolling physics driving game.'),
    h('p', {}, 'Inspired by Drive Mad (Fancade / Martin Magni).'),
    h('p.dim', {}, 'Built with Vite, TypeScript, Planck.js (Box2D) and Three.js. All art and sound are generated in code.'),
    h('div.row.center', {}, btn('Back', () => app.ui.back(), 'alt')),
  );
  return { id: 'credits', el };
}
