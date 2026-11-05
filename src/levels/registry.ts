import type { LevelData } from './types';

/** Browser-side level registry: every levels/worldNN/levelNN.json, bundled eagerly by Vite. */
const modules = import.meta.glob<LevelData>(['./world*/level*.json', './demo/level*.json'], { eager: true, import: 'default' });

const byId = new Map<number, LevelData>();
for (const lv of Object.values(modules)) byId.set(lv.id, lv);

/** Number of real levels (demo playgrounds use ids >= 900). */
export const LEVEL_COUNT = [...byId.keys()].filter((id) => id < 900).length;
export const getLevel = (id: number): LevelData | undefined => byId.get(id);
export const allLevels = (): LevelData[] => [...byId.values()].sort((a, b) => a.id - b.id);
export const hasLevel = (id: number): boolean => byId.has(id);
