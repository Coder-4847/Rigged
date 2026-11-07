import * as THREE from 'three';
import { CONFIG } from '../config';

export interface CamTarget {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0..1 fraction of the vehicle's top speed. */
  speedFrac: number;
}

/**
 * Side-on follow camera: look-ahead in travel direction, speed zoom, trauma shake, and a hard
 * safety clamp so the car can never leave the frame.
 */
export class CameraRig {
  cx = 0;
  cy = 0;
  viewW: number = CONFIG.render.baseViewWidth;
  private trauma = 0;
  private t = 0;
  private lookAhead = 0;
  /** Level camera limits (world metres); null = unbounded. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  /** Developer free-cam offset (null = off). */
  free: { x: number; y: number; w: number } | null = null;

  constructor(private camera: THREE.PerspectiveCamera) {}

  snapTo(t: CamTarget): void {
    this.cx = t.x;
    this.cy = t.y + CONFIG.camera.yBias;
    this.lookAhead = 0;
    this.viewW = CONFIG.render.baseViewWidth;
  }

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, tgt: CamTarget, aspect: number, shakeEnabled = true): void {
    const C = CONFIG.camera;
    this.t += dt;

    if (this.free) {
      this.apply(this.free.x, this.free.y, this.free.w, aspect, 0, 0, 0);
      return;
    }

    // Look-ahead eases toward velocity-based target (direction changes don't snap).
    const laTarget = THREE.MathUtils.clamp(tgt.vx * C.lookAheadTime, -C.lookAheadMax, C.lookAheadMax);
    this.lookAhead += (laTarget - this.lookAhead) * (1 - Math.exp(-2.4 * dt));

    const fx = tgt.x + this.lookAhead;
    // Vertical look-ahead for falling/rising fast so we see where we're going.
    const fy = tgt.y + C.yBias + THREE.MathUtils.clamp(tgt.vy * 0.18, -5, 3);
    this.cx += (fx - this.cx) * (1 - Math.exp(-C.followX * dt));
    this.cy += (fy - this.cy) * (1 - Math.exp(-C.followY * dt));

    // Zoom out with speed.
    const wTarget = CONFIG.render.baseViewWidth + CONFIG.render.speedZoomExtra * tgt.speedFrac;
    this.viewW += (wTarget - this.viewW) * (1 - Math.exp(-C.zoomRate * dt));

    // Hard safety clamp: the car always stays inside the central safe region.
    const halfW = this.viewW / 2;
    const halfH = halfW / Math.max(aspect, 1.2);
    const limX = halfW * C.safeFrac;
    const limY = halfH * C.safeFrac;
    const dx = tgt.x - this.cx;
    if (Math.abs(dx) > limX) this.cx = tgt.x - Math.sign(dx) * limX;
    const dy = tgt.y + C.yBias * 0.4 - this.cy;
    if (Math.abs(dy) > limY) this.cy = tgt.y + C.yBias * 0.4 - Math.sign(dy) * limY;

    // Level bounds (soft preference — the car-in-frame clamp above wins at the edges).
    if (this.bounds) {
      const b = this.bounds;
      if (b.maxX - b.minX > this.viewW) this.cx = THREE.MathUtils.clamp(this.cx, b.minX + halfW, b.maxX - halfW);
      this.cy = Math.max(this.cy, b.minY + halfH);
      this.cy = Math.min(this.cy, b.maxY - halfH);
      // Re-apply the safety clamp in case bounds pushed the car toward the edge.
      const ddx = tgt.x - this.cx;
      if (Math.abs(ddx) > limX) this.cx = tgt.x - Math.sign(ddx) * limX;
    }

    // Shake
    this.trauma = Math.max(0, this.trauma - C.shakeDecay * dt);
    let sx = 0;
    let sy = 0;
    let roll = 0;
    if (shakeEnabled && this.trauma > 0) {
      const s = this.trauma * this.trauma;
      sx = Math.sin(this.t * 71.3) * s * C.shakeMaxOffset;
      sy = Math.sin(this.t * 93.7 + 1.3) * s * C.shakeMaxOffset;
      roll = Math.sin(this.t * 53.1 + 2.1) * s * C.shakeMaxRoll;
    }
    this.apply(this.cx, this.cy, this.viewW, aspect, sx, sy, roll);
  }

  private apply(cx: number, cy: number, viewW: number, aspect: number, sx: number, sy: number, roll: number): void {
    const cam = this.camera;
    // Fit by width in landscape; in tall windows fit a minimum height.
    const viewH = Math.max(viewW / aspect, viewW / 1.6);
    const dist = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(CONFIG.render.fov / 2));
    const pitch = THREE.MathUtils.degToRad(CONFIG.render.pitchDeg);
    const yaw = THREE.MathUtils.degToRad(CONFIG.render.yawDeg);
    const flat = Math.cos(pitch) * dist;
    cam.position.set(cx + sx + Math.sin(yaw) * flat, cy + sy + Math.sin(pitch) * dist, Math.cos(yaw) * flat);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(cx + sx, cy + sy, 0);
  }
}
