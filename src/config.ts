/**
 * RIGGED — central tunables.
 * Everything that affects game feel lives here so it can be tuned in one place.
 * Units: metres, seconds, radians, kilograms-ish (Box2D units).
 */

export const CONFIG = {
  physics: {
    /** Fixed simulation step (120 Hz). Deterministic and stable on any refresh rate. */
    dt: 1 / 120,
    /** Safety cap on steps per rendered frame (prevents the spiral of death after a tab stall). */
    maxStepsPerFrame: 12,
    /** Gravity in m/s². Slightly heavier than Earth: snappier, less floaty jumps. */
    gravity: -26,
    velocityIterations: 8,
    positionIterations: 3,
  },

  render: {
    fov: 26,
    /** Camera pitch (degrees) looking slightly down at the lane — gives the blocks visible tops. */
    pitchDeg: 9,
    /** Visible world width (metres) at the car plane, before speed zoom. */
    baseViewWidth: 34,
    /** Extra view width (metres) added at full speed. */
    speedZoomExtra: 9,
    /** Depth of the play lane in Z (metres). Terrain blocks are this thick. */
    laneDepth: 6,
  },

  camera: {
    /** Seconds of velocity the camera looks ahead by. */
    lookAheadTime: 0.55,
    /** Max look-ahead distance (m). */
    lookAheadMax: 7,
    /** Smoothing (higher = snappier). Critically-damped follow rates. */
    followX: 5.5,
    followY: 4.0,
    zoomRate: 1.6,
    /** Car must stay inside this fraction of the half-view (never leave the frame). */
    safeFrac: 0.62,
    /** Vertical offset: car sits a bit below centre so we see what's ahead/above. */
    yBias: 1.6,
    shakeDecay: 2.6,
    shakeMaxOffset: 0.55,
    shakeMaxRoll: 0.03,
  },

  crash: {
    /** Seconds on roof (while touching terrain) before it counts as a crash. */
    invertedTime: 0.6,
    /** Pitch beyond which the car counts as "upside down". */
    invertedAngle: 1.95,
    /** Y below which the car is considered fallen out of the world. */
    killY: -60,
    /** Time from crash to the screen being fully wiped (seconds). */
    wipeStart: 0.28,
    /** Time from crash to respawn (must stay < 0.5s for instant-retry feel). */
    respawnAt: 0.46,
    /** Outward kick on debris pieces. */
    debrisKick: 5.5,
  },

  fx: {
    maxParticles: 900,
    /** Landing impact (Δv m/s) that triggers shake + thump. */
    landingMin: 3.5,
    landingHard: 9,
    speedLinesFrom: 15,
  },

  /** Quality presets, applied by the renderer. */
  quality: {
    low: { pixelRatio: 1, shadows: false, shadowMap: 512, particles: 0.35 },
    med: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, particles: 0.7 },
    high: { pixelRatio: 2, shadows: true, shadowMap: 2048, particles: 1 },
  },
} as const;

export type QualityName = keyof typeof CONFIG.quality;

export type VehicleId = 'hatch' | 'jeep' | 'monster' | 'buggy' | 'muscle' | 'mini';

/** Visual + physical definition for a drivable vehicle. */
export interface VehicleDef {
  id: VehicleId;
  name: string;
  /** Chassis lower slab half extents + offset from body origin. */
  body: { hx: number; hy: number; cy: number; density: number };
  /** Cabin (top) half extents + offset. The cabin roof fixture kills the car on terrain contact. */
  cabin: { hx: number; hy: number; cx: number; cy: number; density: number };
  /** Wheel placement relative to chassis origin and size. */
  wheel: {
    radius: number;
    /** x offset of rear/front axle from chassis centre. */
    rearX: number;
    frontX: number;
    /** Anchor y (suspension top) relative to chassis origin. */
    anchorY: number;
    density: number;
    friction: number;
    /** Rolling grip multiplier on the front wheel (1 = same as rear). */
    frontFriction: number;
  };
  suspension: {
    /** Spring frequency (Hz). Higher = stiffer. */
    hz: number;
    /** Damping ratio, 1 = critical. */
    damping: number;
    /** Visual: how far the wheel may hang below the anchor (m). */
    travel: number;
  };
  motor: {
    /** Drive torque per wheel (N·m). Governs acceleration. */
    torque: number;
    /** Top speed in m/s. */
    maxSpeed: number;
    /** Reverse top speed as fraction of maxSpeed. */
    reverseFrac: number;
    /** Brake torque per wheel. */
    brakeTorque: number;
    /** Coasting engine braking torque. */
    idleTorque: number;
    /** Share of drive torque to [rear, front]. */
    drive: [number, number];
  };
  air: {
    /** Torque (per kg of chassis) for air tilt. */
    tilt: number;
    /** Angular speed cap (rad/s) from air tilt. */
    maxAngVel: number;
    /** Angular damping while airborne. */
    damping: number;
  };
  /** Downward force per (m/s of ground speed), per kg — keeps the car planted at speed. */
  downforce: number;
  /** Anti-flip assist base strength (0..1). Levels scale this down in harder worlds. */
  antiFlip: number;
  /** Extra forward push when boosting (m/s²). */
  boostAccel: number;
  /** Paint area default colour. */
  color: number;
}

export const VEHICLES: Record<'hatch', VehicleDef> = {
  hatch: {
    id: 'hatch',
    name: 'Blockhead',
    body: { hx: 1.75, hy: 0.38, cy: -0.05, density: 1.6 },
    cabin: { hx: 0.95, hy: 0.36, cx: -0.25, cy: 0.69, density: 0.35 },
    wheel: {
      radius: 0.52,
      rearX: -1.2,
      frontX: 1.2,
      anchorY: -0.28,
      density: 1.1,
      friction: 1.5,
      frontFriction: 1.3,
    },
    suspension: { hz: 4.6, damping: 0.62, travel: 0.35 },
    motor: {
      torque: 44,
      maxSpeed: 19,
      reverseFrac: 0.55,
      brakeTorque: 60,
      idleTorque: 3,
      drive: [1, 1],
    },
    air: { tilt: 15, maxAngVel: 4.2, damping: 0.6 },
    downforce: 0.35,
    antiFlip: 1,
    boostAccel: 14,
    color: 0xe8553a,
  },
};

/**
 * Uniformly scale a vehicle (transform pads). Torques scale with k³ (traction ∝ mass·r) and air
 * tilt with k² so the car keeps the same acceleration and rotational feel at any size.
 */
export function scaleVehicle(d: VehicleDef, k: number): VehicleDef {
  if (k === 1) return d;
  return {
    ...d,
    body: { ...d.body, hx: d.body.hx * k, hy: d.body.hy * k, cy: d.body.cy * k },
    cabin: { ...d.cabin, hx: d.cabin.hx * k, hy: d.cabin.hy * k, cx: d.cabin.cx * k, cy: d.cabin.cy * k },
    wheel: { ...d.wheel, radius: d.wheel.radius * k, rearX: d.wheel.rearX * k, frontX: d.wheel.frontX * k, anchorY: d.wheel.anchorY * k },
    suspension: { ...d.suspension, travel: d.suspension.travel * k },
    motor: {
      ...d.motor,
      torque: d.motor.torque * k ** 3,
      brakeTorque: d.motor.brakeTorque * k ** 3,
      idleTorque: d.motor.idleTorque * k ** 3,
    },
    air: { ...d.air, tilt: d.air.tilt * k * k },
  };
}
