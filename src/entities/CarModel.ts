import * as THREE from 'three';
import { VehicleDef } from '../config';
import { block, profile, tireGeometry } from '../render/geometry';

/** A detachable piece of the car (becomes a physics debris body on crash). */
export interface CarPart {
  obj: THREE.Object3D;
  /** Centre in chassis-local space (metres), and Z offset. */
  x: number;
  y: number;
  z: number;
  /** Half extents for the debris collider (boxes) or radius (wheels). */
  hx: number;
  hy: number;
  radius?: number;
  /** Extra spin flavour. */
  isHead?: boolean;
}

const MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.7, vertexColors: true }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.25, metalness: 0.7, vertexColors: true }),
  glass: new THREE.MeshStandardMaterial({ color: 0x7cc4e8, roughness: 0.12, metalness: 0.35, vertexColors: true }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.3, metalness: 0.6 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8, vertexColors: true }),
  cap: new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.7, vertexColors: true }),
};

const decalCache = new Map<string, THREE.CanvasTexture>();
/** Side-panel decal art drawn on a canvas (transparent background). */
function decalTexture(id: string): THREE.CanvasTexture {
  let t = decalCache.get(id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  if (id === 'checker') {
    const n = 16;
    for (let y = 0; y < 2; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#f6f2e6' : '#1c2028';
      g.fillRect((x * 512) / n, 54 + y * 26, 512 / n, 26);
    }
  } else if (id === 'flames') {
    const grad = g.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, '#ffd23a');
    grad.addColorStop(1, '#ff4a1e');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(512, 160);
    for (let i = 0; i <= 6; i++) {
      const x = 512 - i * 78;
      g.lineTo(x - 20, 160 - 40 - (i % 2) * 36);
      g.quadraticCurveTo(x - 40, 160 - 100 - (i % 2) * 20, x - 78, 160);
    }
    g.lineTo(0, 160);
    g.closePath();
    g.fill();
  } else if (id === 'stars') {
    g.fillStyle = '#f6f2e6';
    for (let i = 0; i < 5; i++) {
      const cx = 70 + i * 92;
      const cy = 80 + (i % 2 ? 22 : -14);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? 14 : 34;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
  } else if (id === 'camo') {
    const cols = ['#4a5a30', '#2f3a22', '#7a7a4a'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = cols[i % 3];
      g.beginPath();
      g.ellipse(rnd() * 512, rnd() * 160, 30 + rnd() * 50, 14 + rnd() * 26, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  decalCache.set(id, t);
  return t;
}

/** Procedural toy-block vehicle model: shape comes from the VehicleDef's `look`. */
export class CarModel {
  /** Everything for the body (chassis transform applied here). */
  readonly body = new THREE.Group();
  /** Squash/stretch pivot at the chassis bottom. */
  private readonly squashPivot = new THREE.Group();
  private readonly inner = new THREE.Group();
  /** Top-level group, parented to the scene. Wheels live here in world space. */
  readonly root = new THREE.Group();
  readonly parts: CarPart[] = [];
  readonly wheelGroups: THREE.Group[] = []; // [rearL, rearR, frontL, frontR] visual wheels
  private arms: THREE.Mesh[] = [];
  readonly paint: THREE.MeshStandardMaterial;
  private tailMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private headSpot?: THREE.SpotLight;
  private headBeams: THREE.Mesh[] = [];
  private driver!: THREE.Object3D;
  private decal: string;

  // visual dynamics
  private squash = 0;
  private squashV = 0;
  private lean = 0;
  private bottom: number;
  private halfZ: number;
  private wheelZ: number;
  private hubLocal = new THREE.Vector3();
  /** Uniform size multiplier (transform pads). The model is built at base size and scaled. */
  k = 1;

  constructor(readonly def: VehicleDef, color = def.color, decal = "none") {
    this.decal = decal;
    this.halfZ = def.look.halfZ;
    this.paint = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, vertexColors: true });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0xff2a1a, emissiveIntensity: 0.5, roughness: 0.4 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe9a6, emissiveIntensity: 0.9, roughness: 0.3 });
    this.bottom = def.body.cy - def.body.hy;
    this.wheelZ = this.halfZ + def.look.tireW / 2 - 0.01;

    this.squashPivot.position.y = this.bottom;
    this.inner.position.y = -this.bottom;
    this.body.add(this.squashPivot);
    this.squashPivot.add(this.inner);
    this.root.add(this.body);

    this.buildBody();
    this.buildWheels();
  }

  // ------------------------------------------------------------------ building

  private part(
    mesh: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    opts: Partial<CarPart> = {},
  ): THREE.Object3D {
    mesh.position.set(x, y, z);
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.inner.add(mesh);
    this.parts.push({ obj: mesh, x, y, z, hx, hy, ...opts });
    return mesh;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(geo, mat);
  }

  /** Dark tube helper for cages / racks / bars. */
  private tube(w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const m = this.mesh(block(w, h, d, Math.min(w, h, d) * 0.4, 1), MAT.dark);
    m.position.set(x, y, z);
    return m;
  }

  private buildBody(): void {
    const d = this.def;
    const L = d.look;
    const hz = this.halfZ;
    const bw = hz * 2;
    const bodyTop = d.body.cy + d.body.hy;

    // Lower chassis slab (decals ride on it).
    const slab = this.part(this.mesh(block(d.body.hx * 2, d.body.hy * 2, bw, 0.12), this.paint), 0, d.body.cy, 0, d.body.hx, d.body.hy);
    this.addDecal(slab as THREE.Mesh, this.decal);

    // Hood + tail lip depend on the style.
    if (L.cabin === 'box') {
      this.part(this.mesh(block(d.body.hx - d.cabin.hx - 0.1, 0.2, bw * 0.96, 0.05), this.paint), d.body.hx - (d.body.hx - d.cabin.hx) / 2 + 0.1, bodyTop + 0.1, 0, 0.5, 0.1);
    } else if (L.cabin !== 'open') {
      const hl = L.cabin === 'fast' ? 1.5 : 1.1;
      this.part(this.mesh(profile([[-hl / 2, 0], [hl / 2, 0], [hl / 2 - 0.05, 0.1], [-hl / 2 + 0.05, L.cabin === 'fast' ? 0.14 : 0.22]], bw * 0.96, 0.04), this.paint), d.body.hx - hl / 2 - 0.05, bodyTop, 0, hl / 2, 0.1);
      this.part(this.mesh(block(0.5, 0.16, bw * 0.94, 0.05), this.paint), -d.body.hx + 0.3, bodyTop + 0.06, 0, 0.25, 0.08);
    }

    // Cabin.
    const cx = d.cabin.cx;
    const cyb = d.cabin.cy - d.cabin.hy;
    const top = d.cabin.hy * 2;
    const hx = d.cabin.hx;
    let driverY = cyb + 0.3;
    if (L.cabin === 'open') {
      // Roll cage: four posts, roof hoops and a bucket seat, driver in the open.
      const cage = new THREE.Group();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cage.add(this.tube(0.1, top, 0.1, sx * hx * 0.85, top / 2, sz * (hz - 0.2)));
      for (const sz of [-1, 1]) cage.add(this.tube(hx * 1.9, 0.1, 0.1, 0, top, sz * (hz - 0.2)));
      cage.add(this.tube(0.1, 0.1, (hz - 0.2) * 2, hx * 0.85, top, 0), this.tube(0.1, 0.1, (hz - 0.2) * 2, -hx * 0.85, top, 0));
      const seat = this.mesh(block(0.5, 0.5, 0.7, 0.08, 0.8), MAT.dark);
      seat.position.set(-hx * 0.2, 0.25, 0);
      cage.add(seat);
      this.part(cage, cx, cyb, 0, hx, d.cabin.hy);
      driverY = cyb + 0.45;
    } else {
      let pts: Array<[number, number]>;
      let gl: Array<[number, number]>;
      const m = 0.1;
      if (L.cabin === 'box') {
        pts = [[-hx, 0], [hx, 0], [hx - 0.06, top], [-hx + 0.04, top]];
        gl = [[-hx + m, 0.08], [hx - m, 0.08], [hx - m - 0.04, top - 0.12], [-hx + m + 0.02, top - 0.12]];
      } else if (L.cabin === 'fast') {
        pts = [[-hx, 0], [hx, 0], [hx * 0.4, top], [-hx * 0.5, top], [-hx, top * 0.4]];
        gl = [[-hx + 0.25, 0.06], [hx - 0.18, 0.06], [hx * 0.4 - 0.1, top - 0.08], [-hx * 0.5 + 0.05, top - 0.08], [-hx + 0.2, top * 0.4]];
      } else {
        pts = [[-hx, 0], [hx + 0.02, 0], [hx - 0.42, top], [-hx + 0.12, top]];
        gl = [[-hx + m + 0.02, 0.07], [hx - m + 0.06, 0.07], [hx - 0.42 - m * 0.2, top - 0.1], [-hx + 0.12 + m * 0.4, top - 0.1]];
      }
      this.part(this.mesh(profile(pts, bw * 0.84, 0.05), this.paint), cx, cyb, 0, hx, d.cabin.hy);
      this.part(this.mesh(profile(gl, bw * 0.84 + 0.04, 0.02, 0.9), MAT.glass), cx, cyb, 0, hx * 0.9, d.cabin.hy * 0.8);
    }

    // Driver head (cartoon, with cap) visible through the glass / in the open.
    const head = new THREE.Group();
    head.add(this.mesh(block(0.38, 0.38, 0.38, 0.1, 0.9), MAT.skin));
    const cap = this.mesh(block(0.42, 0.14, 0.42, 0.05, 0.9), MAT.cap);
    cap.position.y = 0.2;
    const brim = this.mesh(block(0.22, 0.05, 0.38, 0.02, 0.9), MAT.cap);
    brim.position.set(0.28, 0.14, 0);
    head.add(cap, brim);
    this.driver = this.part(head, cx + 0.05, driverY, 0.12, 0.2, 0.2, { isHead: true });

    // Bumpers.
    this.part(this.mesh(block(0.2, 0.24, bw * 1.02, 0.07), MAT.dark), d.body.hx + 0.04, d.body.cy - 0.15, 0, 0.1, 0.12);
    this.part(this.mesh(block(0.2, 0.24, bw * 1.02, 0.07), MAT.dark), -d.body.hx - 0.04, d.body.cy - 0.15, 0, 0.1, 0.12);

    // Head/tail lights (mini gets big round-ish "eyes").
    const lw = L.bigLights ? 0.34 : 0.2;
    const lz = L.bigLights ? 0.32 : 0.3;
    for (const s of [-1, 1]) {
      this.part(this.mesh(block(0.1, lw, lz, 0.05, 1), this.headMat), d.body.hx + 0.02, d.body.cy + 0.08 + (L.bigLights ? 0.06 : 0), s * (hz * 0.64), 0.05, lw / 2);
      this.part(this.mesh(block(0.1, 0.18, 0.3, 0.04, 1), this.tailMat), -d.body.hx - 0.01, d.body.cy + 0.08, s * (hz * 0.64), 0.05, 0.09);
    }

    // Per-style extras.
    if (L.spoiler) {
      const spoiler = new THREE.Group();
      spoiler.add(this.mesh(block(0.5, 0.07, bw * 0.92, 0.03, 0.9), MAT.dark));
      for (const s of [-1, 1]) {
        const post = this.mesh(block(0.07, 0.2, 0.07, 0.02, 0.9), MAT.dark);
        post.position.set(0.05, -0.12, s * (hz * 0.6));
        spoiler.add(post);
      }
      this.part(spoiler, -d.body.hx + 0.2, bodyTop + (L.cabin === 'fast' ? 0.34 : 0.38), 0, 0.25, 0.12);
    }
    if (L.scoop) this.part(this.mesh(block(0.7, 0.14, 0.5, 0.05, 0.9), MAT.dark), d.body.hx - 0.9, bodyTop + 0.2, 0, 0.35, 0.07);
    if (L.rack) {
      const rack = new THREE.Group();
      for (const s of [-1, 1]) rack.add(this.tube(hx * 1.8, 0.07, 0.07, 0, 0.1, s * (hz - 0.2)));
      for (let i = -1; i <= 1; i++) rack.add(this.tube(0.07, 0.07, (hz - 0.2) * 2, i * hx * 0.7, 0.1, 0));
      const jerry = this.mesh(block(0.34, 0.4, 0.2, 0.05, 0.9), this.paint);
      jerry.position.set(-hx * 0.4, 0.34, 0.2);
      rack.add(jerry);
      this.part(rack, cx, cyb + top + 0.04, 0, hx * 0.9, 0.2);
    }
    if (L.spare) {
      const spare = new THREE.Group();
      const t = this.mesh(tireGeometry(d.wheel.radius * 0.8, 0.28), MAT.rubber);
      t.rotation.y = Math.PI / 2;
      const r = this.mesh(new THREE.CylinderGeometry(d.wheel.radius * 0.5, d.wheel.radius * 0.5, 0.3, 14).rotateZ(Math.PI / 2), MAT.rim);
      spare.add(t, r);
      this.part(spare, -d.body.hx - 0.4, d.body.cy + 0.3, 0, d.wheel.radius * 0.4, d.wheel.radius * 0.8);
    }
    if (L.bullbar) {
      const bar = new THREE.Group();
      for (const s of [-1, 1]) bar.add(this.tube(0.1, 0.55, 0.1, 0, 0, s * (hz * 0.55)));
      bar.add(this.tube(0.1, 0.1, hz * 1.5, 0, 0.2, 0), this.tube(0.1, 0.1, hz * 1.5, 0, -0.15, 0));
      this.part(bar, d.body.hx + 0.3, d.body.cy - 0.02, 0, 0.1, 0.3);
    }

    // Wheel arch liners (dark discs behind the wheels) + suspension arms (not separate debris).
    for (const lx of [d.wheel.rearX, d.wheel.frontX]) {
      for (const s of [-1, 1]) {
        const arch = this.mesh(block(d.wheel.radius * 2.15, d.wheel.radius * 1.4, 0.05, 0.02, 1), MAT.dark);
        arch.position.set(lx, d.body.cy - 0.02, s * (hz + 0.005));
        this.inner.add(arch);
      }
    }
    for (let i = 0; i < 4; i++) {
      const arm = this.mesh(block(0.09, 1, 0.09, 0.03, 1), MAT.chrome);
      this.inner.add(arm);
      this.arms.push(arm);
    }
  }

  /** Decal overlays, parented to the chassis slab so they break off with it. */
  private addDecal(slab: THREE.Mesh, id: string): void {
    if (id === 'none') return;
    const d = this.def;
    const w = d.body.hx * 2;
    const h = d.body.hy * 2;
    const hz = this.halfZ;
    if (id === 'stripes') {
      for (const z of [-0.2, 0.2]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.5 }));
        s.position.set(0, h / 2 + 0.005, z);
        slab.add(s);
      }
      return;
    }
    const tex = decalTexture(id);
    for (const side of [1, -1]) {
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.92), mat);
      p.position.set(0, 0, side * (hz + 0.006));
      if (side < 0) p.rotation.y = Math.PI;
      slab.add(p);
    }
  }

  private buildWheels(): void {
    const r = this.def.wheel.radius;
    const L = this.def.look;
    const tireW = L.tireW;
    const tire = tireGeometry(r, tireW);
    const rimGeo = new THREE.CylinderGeometry(r * 0.62, r * 0.62, tireW + 0.02, 18).rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(r * 0.16, r * 0.16, tireW + 0.08, 10).rotateX(Math.PI / 2);
    const spokeGeo = block(r * 1.15, r * 0.14, tireW + 0.04, 0.02, 1);
    const knobby = !!L.knobby;
    const treads = knobby ? 16 : 12;
    const treadGeo = knobby ? block(0.16 * Math.max(1, r * 1.3), r * 0.2, tireW * 0.9, 0.03, 1) : block(0.1, r * 0.12, tireW * 0.86, 0.02, 1);

    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.add(this.mesh(tire, MAT.rubber));
      g.add(this.mesh(rimGeo, MAT.rim));
      g.add(this.mesh(hubGeo, MAT.chrome));
      for (let s = 0; s < 3; s++) {
        const sp = this.mesh(spokeGeo, MAT.dark);
        sp.rotation.z = (s * Math.PI) / 3;
        g.add(sp);
      }
      for (let k = 0; k < treads; k++) {
        const t = this.mesh(treadGeo, MAT.dark);
        const a = (k / treads) * Math.PI * 2;
        const rr = r + (knobby ? 0.03 : 0.01);
        t.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
        t.rotation.z = a;
        g.add(t);
      }
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      this.root.add(g);
      this.wheelGroups.push(g);
    }
  }

  // ------------------------------------------------------------------ per-frame

  /**
   * Apply interpolated physics transforms. Chassis/wheel poses are world-space.
   */
  update(
    dt: number,
    chassis: { x: number; y: number; a: number },
    wheels: Array<{ x: number; y: number; a: number }>,
    accel: number,
    braking: boolean,
  ): void {
    // Spring-damper squash (visual only).
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.35, 0.35);
    // Lean: nose lifts under acceleration, dips under braking.
    const leanT = THREE.MathUtils.clamp(accel * 0.0032, -0.07, 0.07);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 9);

    this.body.position.set(chassis.x, chassis.y, 0);
    this.body.rotation.z = chassis.a;
    this.squashPivot.scale.set(1 + sq * 0.45, 1 - sq, 1 + sq * 0.2);
    this.inner.rotation.z = this.lean;

    this.tailMat.emissiveIntensity = braking ? 2.2 : 0.5;

    const d = this.def;
    const ca = Math.cos(-chassis.a);
    const sa = Math.sin(-chassis.a);
    for (let i = 0; i < 4; i++) {
      const src = wheels[i < 2 ? 0 : 1];
      const side = i % 2 === 0 ? -1 : 1;
      const g = this.wheelGroups[i];
      g.position.set(src.x, src.y, side * this.wheelZ * this.k);
      g.rotation.z = src.a;
      // Suspension arm from the chassis mount to the wheel hub, in chassis space.
      const dx = src.x - chassis.x;
      const dy = src.y - chassis.y;
      const lx = (dx * ca - dy * sa) / this.k;
      const ly = (dx * sa + dy * ca) / this.k;
      this.hubLocal.set(lx, ly, side * (this.halfZ - 0.1));
      const ax = lx;
      const ay = d.wheel.anchorY + 0.12;
      const len = Math.max(0.05, ay - ly);
      const arm = this.arms[i];
      arm.position.set(ax, (ay + ly) / 2, this.hubLocal.z);
      arm.scale.set(1, len, 1);
    }
  }

  /** Resize the whole vehicle (physics is rebuilt separately with scaleVehicle). */
  setScale(k: number): void {
    this.k = k;
    this.body.scale.setScalar(k);
    for (const g of this.wheelGroups) g.scale.setScalar(k);
  }

  /** Kick the visual squash spring (landing impact in m/s). */
  landed(impact: number): void {
    this.squashV += Math.min(impact, 16) * 0.9;
  }

  /** Toggle headlight beams (dark levels). */
  setHeadlights(on: boolean): void {
    if (on && !this.headSpot) {
      this.headSpot = new THREE.SpotLight(0xfff0c8, 90, 36, 0.5, 0.6, 1.2);
      this.headSpot.position.set(this.def.body.hx, this.def.body.cy + 0.1, 0);
      this.headSpot.target.position.set(this.def.body.hx + 10, this.def.body.cy - 1.2, 0);
      this.body.add(this.headSpot, this.headSpot.target);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfff0c8,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const cone = new THREE.ConeGeometry(1.6, 7, 14, 1, true);
      cone.rotateZ(-Math.PI / 2);
      cone.translate(3.5, 0, 0);
      const beam = new THREE.Mesh(cone, beamMat);
      beam.position.set(this.def.body.hx, this.def.body.cy + 0.1, 0);
      beam.rotation.z = -0.1;
      this.body.add(beam);
      this.headBeams.push(beam);
    }
    if (this.headSpot) this.headSpot.visible = on;
    for (const b of this.headBeams) b.visible = on;
  }

  /** Headlight/ taillight pulse while braking, plus the driver's head bob. */
  bobDriver(t: number, speedFrac: number): void {
    this.driver.rotation.z = Math.sin(t * 9) * 0.05 * (0.3 + speedFrac);
  }

  /** Remove from the scene graph (meshes/geometry are shared, so no dispose needed). */
  dispose(): void {
    this.root.removeFromParent();
    this.headSpot?.dispose();
  }

  /** Current world transform of a part (chassis frame -> world), for exploding. */
  partWorld(part: CarPart, chassis: { x: number; y: number; a: number }): { x: number; y: number; a: number } {
    const c = Math.cos(chassis.a);
    const s = Math.sin(chassis.a);
    const k = this.k;
    return { x: chassis.x + (part.x * c - part.y * s) * k, y: chassis.y + (part.x * s + part.y * c) * k, a: chassis.a };
  }
}
