import * as THREE from 'three';
import { CONFIG } from '../config';

export interface ParticleSpec {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  color: number;
  /** Gravity multiplier (1 = world gravity feel, negative rises). */
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
  /** Stretch along x relative to size (speed lines). */
  stretch?: number;
  spin?: number;
  /** 'shrink' scales to 0 over life, 'pop' grows then shrinks. */
  mode?: 'shrink' | 'pop';
}

/** Pooled instanced particle system: zero allocation per emit, one draw call. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private alive: Uint8Array;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private stretch: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private mode: Uint8Array;
  private cursor = 0;
  private count = 0;
  /** Scales how many particles are emitted (quality setting). */
  density = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  private colorsDirty = false;

  constructor(scene: THREE.Scene, max: number = CONFIG.fx.maxParticles) {
    this.n = max;
    const f = () => new Float32Array(max);
    this.alive = new Uint8Array(max);
    this.mode = new Uint8Array(max);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.maxLife = f();
    this.size = f();
    this.grav = f();
    this.drag = f();
    this.stretch = f();
    this.rot = f();
    this.spin = f();
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      max,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Allocate instanceColor up-front.
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  emit(s: ParticleSpec): void {
    if (this.density < 1 && Math.random() > this.density) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.alive[i] = 1;
    this.px[i] = s.x;
    this.py[i] = s.y;
    this.pz[i] = s.z ?? 0;
    this.vx[i] = s.vx ?? 0;
    this.vy[i] = s.vy ?? 0;
    this.vz[i] = s.vz ?? 0;
    this.life[i] = this.maxLife[i] = s.life;
    this.size[i] = s.size;
    this.grav[i] = s.gravity ?? 0;
    this.drag[i] = s.drag ?? 0;
    this.stretch[i] = s.stretch ?? 1;
    this.rot[i] = s.stretch && s.stretch > 1 ? 0 : Math.random() * 6.28;
    this.spin[i] = s.spin ?? 0;
    this.mode[i] = s.mode === 'pop' ? 1 : 0;
    this.mesh.setColorAt(i, this.c.set(s.color));
    this.colorsDirty = true;
    if (i >= this.count) this.count = i + 1;
  }

  /** Emit `n` particles in a burst with random directions. */
  burst(
    n: number,
    x: number,
    y: number,
    opts: { speed: number; up?: number; life: number; size: number; color: number | number[]; gravity?: number; drag?: number; z?: number },
  ): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = opts.speed * (0.4 + Math.random() * 0.6);
      const col = Array.isArray(opts.color) ? opts.color[(Math.random() * opts.color.length) | 0] : opts.color;
      this.emit({
        x,
        y,
        z: (opts.z ?? 0) + (Math.random() - 0.5) * 1.6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + (opts.up ?? 0),
        vz: (Math.random() - 0.5) * sp * 0.4,
        life: opts.life * (0.6 + Math.random() * 0.6),
        size: opts.size * (0.6 + Math.random() * 0.8),
        color: col,
        gravity: opts.gravity ?? 1,
        drag: opts.drag ?? 0.5,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  update(dt: number): void {
    const g = CONFIG.physics.gravity;
    let hi = 0;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) {
        // Hide dead instance cheaply.
        this.s.set(0, 0, 0);
        this.m.compose(this.p.set(0, 0, 0), this.q.identity(), this.s);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        this.s.set(0, 0, 0);
        this.m.compose(this.p.set(0, 0, 0), this.q.identity(), this.s);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + g * this.grav[i] * dt * 0.5;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      const k = this.mode[i] === 1 ? Math.sin(Math.PI * (1 - t)) : t;
      const sz = this.size[i] * k;
      this.e.set(0, 0, this.rot[i]);
      this.q.setFromEuler(this.e);
      this.s.set(sz * this.stretch[i], sz, sz);
      this.m.compose(this.p.set(this.px[i], this.py[i], this.pz[i]), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      hi = i + 1;
    }
    this.mesh.count = this.count;
    // Shrink the iterated range when the tail is dead.
    if (hi < this.count) {
      let h = this.count;
      while (h > 0 && !this.alive[h - 1]) h--;
      this.count = h;
      this.mesh.count = Math.max(h, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorsDirty && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.colorsDirty = false;
    }
  }

  clear(): void {
    this.alive.fill(0);
    this.count = 0;
    this.mesh.count = 0;
  }
}
