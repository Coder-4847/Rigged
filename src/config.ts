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
    pitchDeg: 16,
    /** Camera yaw (degrees): a slight 3/4 angle so block ends and the causeway's depth read like toys on a table. */
    yawDeg: -9,
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
  /** Damps nose-up rotation while grounded (stops very torquey vehicles wheelie-flipping, esp. in low gravity). */
  wheelieGuard?: number;
  /** Rotation damping right after landing (default 1.4): higher = fewer landing flips. */
  landGrace?: number;
  /** Extra forward push when boosting (m/s²). */
  boostAccel: number;
  /** Paint area default colour. */
  color: number;
  /** Visual style (the model is built from this + the physical dims above). */
  look: VehicleLook;
  /** One-line personality shown in the garage. */
  blurb: string;
}

export interface VehicleLook {
  /** Cabin shape: sloped hatch glass, boxy 4x4 cab, open roll-cage, low fastback. */
  cabin: 'slope' | 'box' | 'open' | 'fast';
  /** Half body width (z). */
  halfZ: number;
  tireW: number;
  spoiler?: boolean;
  rack?: boolean;
  spare?: boolean;
  bullbar?: boolean;
  /** Long hood stripe + scoop (muscle). */
  scoop?: boolean;
  /** Oversized round headlights (mini). */
  bigLights?: boolean;
  /** Chunky tread blocks. */
  knobby?: boolean;
  /** Contrasting white roof cap on the cabin. */
  roof?: boolean;
}

export const VEHICLE_IDS: VehicleId[] = ['hatch', 'jeep', 'buggy', 'monster', 'muscle', 'mini'];

export const VEHICLES: Record<VehicleId, VehicleDef> = {
  hatch: {
    id: 'hatch',
    name: 'Blockhead',
    blurb: 'Chunky little lifted runabout. Forgiving, honest, a little cheeky.',
    body: { hx: 1.75, hy: 0.38, cy: -0.05, density: 1.6 },
    cabin: { hx: 0.95, hy: 0.36, cx: -0.25, cy: 0.69, density: 0.35 },
    wheel: { radius: 0.52, rearX: -1.2, frontX: 1.2, anchorY: -0.28, density: 1.1, friction: 1.5, frontFriction: 1.3 },
    suspension: { hz: 4.6, damping: 0.62, travel: 0.35 },
    motor: { torque: 57.2, maxSpeed: 21.8, reverseFrac: 0.55, brakeTorque: 72, idleTorque: 3, drive: [1, 1] },
    air: { tilt: 19.5, maxAngVel: 6.1, damping: 0.6 },
    downforce: 0.35,
    antiFlip: 1,
    boostAccel: 14,
    color: 0xffc21a,
    look: { cabin: 'box', halfZ: 0.85, tireW: 0.56, knobby: true, roof: true },
  },
  jeep: {
    id: 'jeep',
    name: 'Trailhound',
    blurb: '4x4 with high clearance and a soft ride. Grips everything and climbs like a goat.',
    body: { hx: 1.7, hy: 0.45, cy: 0.05, density: 1.9 },
    cabin: { hx: 1.1, hy: 0.55, cx: -0.1, cy: 0.95, density: 0.4 },
    wheel: { radius: 0.62, rearX: -1.25, frontX: 1.25, anchorY: -0.3, density: 1.2, friction: 1.9, frontFriction: 1.2 },
    suspension: { hz: 3.9, damping: 0.7, travel: 0.45 },
    motor: { torque: 96.2, maxSpeed: 21.4, reverseFrac: 0.6, brakeTorque: 102, idleTorque: 4, drive: [1, 1] },
    air: { tilt: 31.2, maxAngVel: 5.2, damping: 0.7 },
    downforce: 0.4,
    antiFlip: 1.2,
    boostAccel: 14,
    color: 0x5d8f3c,
    look: { cabin: 'box', halfZ: 0.92, tireW: 0.52, rack: true, spare: true, bullbar: true, knobby: true },
  },
  buggy: {
    id: 'buggy',
    name: 'Dune Skipper',
    blurb: 'Feather-light and bouncy. Great in the air, twitchy on the ground.',
    body: { hx: 1.55, hy: 0.3, cy: -0.12, density: 1.7 },
    cabin: { hx: 0.7, hy: 0.45, cx: -0.1, cy: 0.62, density: 0.12 },
    wheel: { radius: 0.6, rearX: -1.15, frontX: 1.25, anchorY: -0.2, density: 0.8, friction: 1.35, frontFriction: 1.2 },
    suspension: { hz: 5.2, damping: 0.55, travel: 0.5 },
    motor: { torque: 53, maxSpeed: 23.5, reverseFrac: 0.55, brakeTorque: 66, idleTorque: 3, drive: [1, 1] },
    air: { tilt: 33.8, maxAngVel: 7.5, damping: 0.4 },
    downforce: 0.5,
    antiFlip: 1.2,
    landGrace: 2.6,
    boostAccel: 16,
    color: 0x38b6ff,
    look: { cabin: 'open', halfZ: 0.88, tireW: 0.5, knobby: true },
  },
  monster: {
    id: 'monster',
    name: 'Crushalot',
    blurb: 'Huge wheels, huge weight. Steamrolls bumps, slow to rotate in the air.',
    body: { hx: 1.9, hy: 0.55, cy: 0.35, density: 2.2 },
    cabin: { hx: 1.0, hy: 0.6, cx: -0.1, cy: 1.25, density: 0.5 },
    wheel: { radius: 1.0, rearX: -1.4, frontX: 1.4, anchorY: -0.5, density: 1.3, friction: 2.0, frontFriction: 1.1 },
    suspension: { hz: 3.1, damping: 0.5, travel: 0.7 },
    motor: { torque: 325, maxSpeed: 20.9, reverseFrac: 0.6, brakeTorque: 228, idleTorque: 8, drive: [1, 1] },
    air: { tilt: 57.2, maxAngVel: 5.4, damping: 1.4 },
    downforce: 0.55,
    antiFlip: 2.0,
    landGrace: 3.2,
    wheelieGuard: 4,
    boostAccel: 12,
    color: 0xffb52e,
    look: { cabin: 'box', halfZ: 1.05, tireW: 0.8, bullbar: true, knobby: true },
  },
  muscle: {
    id: 'muscle',
    name: 'Redline',
    blurb: 'Rear-wheel-drive and fast. Stiff, twitchy, wheelspins if you stomp it.',
    body: { hx: 1.95, hy: 0.34, cy: -0.08, density: 1.7 },
    cabin: { hx: 0.85, hy: 0.3, cx: -0.55, cy: 0.58, density: 0.35 },
    wheel: { radius: 0.5, rearX: -1.35, frontX: 1.4, anchorY: -0.26, density: 1.2, friction: 1.25, frontFriction: 0.9 },
    suspension: { hz: 6.5, damping: 0.8, travel: 0.3 },
    motor: { torque: 80.6, maxSpeed: 25.9, reverseFrac: 0.5, brakeTorque: 90, idleTorque: 3, drive: [1, 0.15] },
    air: { tilt: 16.9, maxAngVel: 6.7, damping: 0.5 },
    downforce: 0.55,
    antiFlip: 0.8,
    boostAccel: 16,
    color: 0x2f55e8,
    look: { cabin: 'fast', halfZ: 0.88, tireW: 0.5, spoiler: true, scoop: true },
  },
  mini: {
    id: 'mini',
    name: 'Pocket Rocket',
    blurb: 'Tiny, short wheelbase, spins like a top. Fits where nothing else does.',
    body: { hx: 1.25, hy: 0.32, cy: -0.05, density: 1.5 },
    cabin: { hx: 0.72, hy: 0.34, cx: -0.1, cy: 0.6, density: 0.35 },
    wheel: { radius: 0.4, rearX: -0.8, frontX: 0.85, anchorY: -0.22, density: 1.0, friction: 1.4, frontFriction: 1.2 },
    suspension: { hz: 5.0, damping: 0.6, travel: 0.28 },
    motor: { torque: 28.6, maxSpeed: 20.1, reverseFrac: 0.55, brakeTorque: 36, idleTorque: 2, drive: [1, 1] },
    air: { tilt: 8.5, maxAngVel: 7.8, damping: 0.5 },
    downforce: 0.3,
    antiFlip: 0.9,
    boostAccel: 14,
    color: 0x2ec4b6,
    look: { cabin: 'slope', halfZ: 0.72, tireW: 0.36, bigLights: true },
  },
};

/** Paint colours (unlocked by stars). */
export const PAINTS: Array<{ color: number; name: string; stars: number }> = [
  { color: 0xffc21a, name: 'Sunny', stars: 0 },
  { color: 0x38b6ff, name: 'Sky', stars: 4 },
  { color: 0xe8553a, name: 'Brick', stars: 8 },
  { color: 0x6fcf4a, name: 'Lime', stars: 14 },
  { color: 0xff8a3d, name: 'Tangerine', stars: 20 },
  { color: 0xb06bff, name: 'Grape', stars: 28 },
  { color: 0x2ec4b6, name: 'Teal', stars: 38 },
  { color: 0xff6fa8, name: 'Bubblegum', stars: 50 },
  { color: 0xf2f2f2, name: 'Frost', stars: 64 },
  { color: 0x2a2f38, name: 'Midnight', stars: 80 },
  { color: 0xd9a520, name: 'Gold', stars: 110 },
  { color: 0x9aa6b4, name: 'Chrome', stars: 150 },
];

export const DECALS: Array<{ id: string; name: string; world: number }> = [
  { id: 'none', name: 'Plain', world: 0 },
  { id: 'stripes', name: 'Racing stripes', world: 2 },
  { id: 'checker', name: 'Checkered band', world: 4 },
  { id: 'flames', name: 'Flames', world: 6 },
  { id: 'stars', name: 'Star burst', world: 8 },
  { id: 'camo', name: 'Camo', world: 10 },
];

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
