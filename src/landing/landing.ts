import './landing.css';
import { startHero } from './hero';

/**
 * Landing page controller. This file (plus hero.ts and the theme data) is ALL that loads up front — the game
 * bundle (Three.js, Planck, levels) is fetched only when the player presses Play (and prefetched when they
 * hover the button or the page goes idle). `?level=N` / `?play` skip the landing page entirely.
 */
const landing = document.getElementById('landing') as HTMLElement;
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let gameModule: Promise<typeof import('../main')> | null = null;
const loadGame = () => (gameModule ??= import('../main'));

let hero: { stop(): void } | null = null;
let starting = false;

async function play(btn?: HTMLElement): Promise<void> {
  if (starting) return;
  starting = true;
  document.querySelectorAll<HTMLButtonElement>('.play').forEach((b) => {
    b.disabled = true;
    b.classList.add('loading');
  });
  const label = btn?.querySelector('.play-label');
  if (label) label.textContent = 'Loading…';
  try {
    const mod = await loadGame();
    const app = await mod.start();
    app.audio.unlock(); // the Play click is the user gesture that lets audio start
    // slide the landing page away, revealing the main menu underneath
    landing.classList.add('leaving');
    document.body.classList.remove('landing-open');
    window.setTimeout(() => {
      hero?.stop();
      landing.remove();
    }, reduced ? 50 : 750);
  } catch (e) {
    starting = false;
    document.querySelectorAll<HTMLButtonElement>('.play').forEach((b) => {
      b.disabled = false;
      b.classList.remove('loading');
    });
    if (label) label.textContent = 'Play';
    const hint = document.getElementById('play-hint');
    if (hint) hint.textContent = 'Could not load the game — check your connection and try again.';
    console.error(e);
  }
}

if (params.has('level') || params.has('play')) {
  // Straight into the game (deep links, tests, returning from an external page).
  landing.remove();
  document.body.classList.remove('landing-open');
  void loadGame().then((m) => m.start());
} else {
  hero = startHero(document.getElementById('hero-canvas') as HTMLCanvasElement, reduced);
  for (const id of ['play', 'play2']) {
    const b = document.getElementById(id) as HTMLButtonElement;
    b.addEventListener('click', () => void play(b));
    b.addEventListener('pointerenter', () => void loadGame(), { once: true });
    b.addEventListener('focus', () => void loadGame(), { once: true });
  }
  // Prefetch the game while the player reads the page.
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  window.addEventListener('load', () => (idle ? idle(() => void loadGame(), { timeout: 4000 }) : setTimeout(() => void loadGame(), 2500)));
  // Enter on the page starts the game too.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.body.classList.contains('landing-open') && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) void play(document.getElementById('play') as HTMLElement);
  });
  // Count-up for the "100 levels" card when it scrolls into view.
  const counter = document.querySelector<HTMLElement>('[data-count]');
  if (counter && !reduced && 'IntersectionObserver' in window) {
    const target = Number(counter.dataset.count);
    counter.textContent = '0';
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 1100);
        counter.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(counter);
  }
}
