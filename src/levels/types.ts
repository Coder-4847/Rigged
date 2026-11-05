import type { VehicleId } from '../config';

export type Vec = [number, number];
export type SurfaceType = 'grass' | 'sand' | 'ice' | 'snow' | 'metal' | 'rock' | 'goo';

export type DecoKind = 'tree' | 'pine' | 'bush' | 'rock' | 'flower' | 'sign' | 'cloud' | 'cactus' | 'crate';

export type EntityData =
  | { type: 'terrain'; points: Vec[]; depth?: number; surface?: SurfaceType }
  | { type: 'seesaw'; x: number; y: number; width?: number; maxAngle?: number; rest?: number }
  | { type: 'deco'; kind: DecoKind; x: number; y: number; z?: number; scale?: number; text?: string };

/** One playable level. Pure data; see `src/levels/builder.ts` for authoring helpers. */
export interface LevelData {
  id: number;
  name: string;
  /** 1..10 */
  world: number;
  vehicle: VehicleId;
  /** Gravity (m/s², negative). Defaults to CONFIG.physics.gravity. */
  gravity?: number;
  /** 0..1 anti-flip assist (fades out in later worlds). */
  antiFlip?: number;
  boost?: boolean;
  dark?: boolean;
  cameraBounds: { minX: number; maxX: number; minY: number; maxY: number };
  spawn: Vec;
  checkpoints: Vec[];
  entities: EntityData[];
  /** Exactly 3: [main path, risky, hidden]. */
  stars: Vec[];
  finish: Vec;
  /** Gold-medal time in seconds. */
  parTime: number;
  hint?: string;
}
