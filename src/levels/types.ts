import type { VehicleId } from '../config';

export type Vec = [number, number];
export type SurfaceType = 'grass' | 'sand' | 'ice' | 'snow' | 'metal' | 'rock' | 'goo';

export type DecoKind = 'tree' | 'pine' | 'bush' | 'rock' | 'flower' | 'sign' | 'cloud' | 'cactus' | 'crate';

export type ZoneKind = 'sand' | 'goo' | 'boost' | 'wind' | 'lowgrav' | 'flipgrav' | 'magnet' | 'vacuum';

/**
 * Every level object. `ctrl` names a switch id: lasers are OFF while their switch is on,
 * doors are OPEN while it is on, crushers are paused while it is on.
 */
export type EntityData =
  | { type: 'terrain'; points: Vec[]; depth?: number; surface?: SurfaceType }
  | { type: 'ceiling'; points: Vec[]; thickness?: number }
  | { type: 'seesaw'; x: number; y: number; width?: number; maxAngle?: number; rest?: number }
  | { type: 'deco'; kind: DecoKind; x: number; y: number; z?: number; scale?: number; text?: string }
  // --- surfaces & forces
  | { type: 'zone'; kind: ZoneKind; x: number; y: number; w: number; h?: number; strength?: number; angle?: number }
  | { type: 'conveyor'; x: number; y: number; w: number; speed: number }
  | { type: 'bounce'; x: number; y: number; w?: number; power?: number }
  | { type: 'cannon'; x: number; y: number; angle: number; power?: number }
  | { type: 'oneway'; x: number; y: number; w: number }
  | { type: 'transform'; x: number; y: number; scale?: number; vehicle?: VehicleId; h?: number }
  // --- movers
  | { type: 'platform'; x: number; y: number; w: number; h?: number; x2: number; y2: number; period: number; phase?: number }
  | { type: 'gear'; x: number; y: number; r: number; speed: number; teeth?: number }
  | { type: 'swing'; x: number; y: number; len: number; amp: number; period: number; phase?: number; kind?: 'ball' | 'platform' }
  | { type: 'tilt'; x: number; y: number; w: number; amp: number; period: number; phase?: number }
  | { type: 'door'; x: number; y: number; w?: number; h: number; period?: number; phase?: number; open?: number; ctrl?: string }
  | { type: 'crusher'; x: number; y: number; dir?: 'down' | 'up' | 'left' | 'right'; w?: number; stroke: number; period: number; phase?: number; telegraph?: number; ctrl?: string }
  | { type: 'saw'; x: number; y: number; r?: number; x2?: number; y2?: number; period?: number; phase?: number }
  | { type: 'spikes'; x: number; y: number; w: number; angle?: number }
  // --- beams
  | { type: 'laser'; x: number; y: number; angle: number; mode: 'static' | 'sweep' | 'pulse' | 'track'; amp?: number; period?: number; phase?: number; on?: number; ctrl?: string }
  | { type: 'mirror'; x: number; y: number; w?: number; angle: number }
  | { type: 'switch'; id: string; x: number; y: number }
  // --- breakables / props
  | { type: 'crumble'; x: number; y: number; w: number; h?: number; delay?: number }
  | { type: 'bridge'; x: number; y: number; w: number; delay?: number }
  | { type: 'falling'; kind: 'icicle' | 'rock' | 'sign'; x: number; y: number; lead?: number }
  | { type: 'crate'; x: number; y: number; size?: number }
  | { type: 'boulder'; x: number; y: number; r?: number; trigger?: number }
  | { type: 'tnt'; x: number; y: number }
  | { type: 'dominoes'; x: number; y: number; n?: number; spacing?: number };

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
