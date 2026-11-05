import { DEFAULT_BINDINGS, Action } from './Input';
import type { QualityName } from '../config';

export const LEVELS_PER_WORLD = 10;
export const WORLD_COUNT = 10;

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
  shake: boolean;
  reducedMotion: boolean;
  /** Controller vibration. */
  rumble: boolean;
  /** UI size multiplier for HUD + menus. */
  uiScale: number;
  /** Stronger outlines, opaque panels, brighter hazards cues. */
  highContrast: boolean;
  touch: 'auto' | 'on' | 'off';
  quality: QualityName | 'auto';
  bindings: Record<Action, string[]>;
}

export interface LevelRecord {
  /** Bitmask of collected stars (bit 0 = main path, 1 = risky, 2 = hidden). */
  stars: number;
  /** Best clear time in seconds (0 = never finished). */
  best: number;
  deaths: number;
  done: boolean;
}

export interface SaveData {
  /** Schema version; bump + add a migration when the shape changes. */
  v: 1;
  levels: Record<number, LevelRecord>;
  settings: Settings;
  lastLevel: number;
  totalDeaths: number;
  garage: { vehicle: string; color: number; decal: string };
  unlocked: { vehicles: string[]; colors: number[]; decals: string[] };
}

const KEY = 'rigged.save';

export const worldOf = (levelId: number): number => Math.floor((levelId - 1) / LEVELS_PER_WORLD) + 1;
export const levelId = (world: number, n: number): number => (world - 1) * LEVELS_PER_WORLD + n;
export const popcount = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

function defaults(): SaveData {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    v: 1,
    levels: {},
    settings: {
      master: 0.8,
      sfx: 1,
      music: 0.5,
      muted: false,
      shake: true,
      reducedMotion: reduce,
      rumble: true,
      uiScale: 1,
      highContrast: typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches,
      touch: 'auto',
      quality: 'auto',
      bindings: structuredClone(DEFAULT_BINDINGS),
    },
    lastLevel: 1,
    totalDeaths: 0,
    garage: { vehicle: 'hatch', color: 0xe8553a, decal: 'none' },
    unlocked: { vehicles: ['hatch'], colors: [0xe8553a], decals: ['none'] },
  };
}

/** Persistent progress + settings. Every storage call is guarded (private windows, quota, blocked storage). */
export class Save {
  data: SaveData;
  private timer: ReturnType<typeof setTimeout> | undefined;
  listeners = new Set<() => void>();

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    const d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      // Version migrations go here (parsed.v < 1 → ...). Unknown/newer versions fall back to defaults.
      if (parsed.v !== 1) return d;
      return {
        ...d,
        ...parsed,
        settings: { ...d.settings, ...parsed.settings, bindings: { ...d.settings.bindings, ...parsed.settings?.bindings } },
        garage: { ...d.garage, ...parsed.garage },
        unlocked: { ...d.unlocked, ...parsed.unlocked },
        levels: parsed.levels ?? {},
      };
    } catch {
      return d;
    }
  }

  /** Debounced write. */
  commit(): void {
    for (const l of this.listeners) l();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable: progress lasts for this session only */
    }
  }

  reset(): void {
    this.data = defaults();
    this.flush();
    for (const l of this.listeners) l();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  rec(id: number): LevelRecord {
    return this.data.levels[id] ?? { stars: 0, best: 0, deaths: 0, done: false };
  }

  /** Record a finished run. Returns what improved. */
  complete(id: number, time: number, starMask: number, deaths: number): { newBest: boolean; newStars: number; first: boolean } {
    const r = this.rec(id);
    const first = !r.done;
    const newBest = r.best === 0 || time < r.best;
    const merged = r.stars | starMask;
    const newStars = popcount(merged) - popcount(r.stars);
    this.data.levels[id] = { stars: merged, best: newBest ? time : r.best, deaths: r.deaths + deaths, done: true };
    this.data.totalDeaths += deaths;
    this.data.lastLevel = id;
    this.commit();
    return { newBest, newStars, first };
  }

  totalStars(): number {
    let n = 0;
    for (const r of Object.values(this.data.levels)) n += popcount(r.stars);
    return n;
  }

  worldStats(w: number): { done: number; stars: number } {
    let done = 0;
    let stars = 0;
    for (let i = 1; i <= LEVELS_PER_WORLD; i++) {
      const r = this.rec(levelId(w, i));
      if (r.done) done++;
      stars += popcount(r.stars);
    }
    return { done, stars };
  }

  /** Worlds unlock by finishing 8/10 of the previous world OR by total stars — so you can never get hard-stuck. */
  worldUnlocked(w: number): boolean {
    if (w <= 1) return true;
    return this.worldStats(w - 1).done >= 8 || this.totalStars() >= 9 * (w - 1);
  }

  /** A level is open if its world is, and one of the two levels before it is cleared (skip allowance). */
  levelUnlocked(id: number): boolean {
    const w = worldOf(id);
    if (!this.worldUnlocked(w)) return false;
    const n = id - (w - 1) * LEVELS_PER_WORLD;
    if (n <= 1) return true;
    return this.rec(id - 1).done || (n > 2 && this.rec(id - 2).done) || this.rec(id).done;
  }

  /** Stars still needed to open a world by the star route (for the lock hint). */
  starsToUnlock(w: number): number {
    return Math.max(0, 9 * (w - 1) - this.totalStars());
  }
}
