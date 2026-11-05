import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BouncePad, Cannon, Conveyor, OneWay, TransformPad, Zone } from '../../entities/hazards/zones';
import { HazardView, Palette, box, chevronTexture, glow, line, ribbon, std } from './hz';

export interface ViewCtx {
  world: number;
  pal: Palette;
  ground: (x: number) => number;
}

const LANE = CONFIG.render.laneDepth;

/** Floating dots drifting through a rect (wind / gravity fields). */
function drift(count: number, w: number, h: number, color: number, vx: number, vy: number, size = 0.14): { obj: THREE.InstancedMesh; step: (dt: number) => void } {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }), count);
  const p = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, z: (Math.random() - 0.5) * LANE, s: 0.6 + Math.random() * 0.8 }));
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const step = (dt: number) => {
    p.forEach((d, i) => {
      d.x += vx * dt * d.s;
      d.y += vy * dt * d.s;
      if (d.x > w) d.x -= w;
      if (d.x < 0) d.x += w;
      if (d.y > h) d.y -= h;
      if (d.y < 0) d.y += h;
      const len = Math.abs(vx) > 1 ? Math.min(2.2, Math.abs(vx) * 0.09) : 1;
      sc.set(size * len, size, size);
      m.compose(new THREE.Vector3(d.x, d.y, d.z), q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  step(0);
  mesh.frustumCulled = false;
  return { obj: mesh, step };
}

export function zoneView(z: Zone, v: ViewCtx): HazardView {
  const d = z.d;
  const g = new THREE.Group();
  const h = d.h ?? 6;
  switch (d.kind) {
    case 'sand':
    case 'snow':
    case 'goo': {
      const goo = d.kind === 'goo';
      const snow = d.kind === 'snow';
      const mat = new THREE.MeshStandardMaterial({
        color: goo ? 0xa05ae0 : snow ? 0xf6fcff : 0xe0be6a,
        roughness: goo ? 0.15 : snow ? 0.8 : 0.95,
        metalness: goo ? 0.2 : 0,
        emissive: goo ? 0x4a1a8a : 0,
        emissiveIntensity: 0.6,
      });
      const r = ribbon(d.x, d.x + d.w, goo ? 0.22 : 0.16, 0.6, v.ground, LANE + 0.2, mat);
      g.add(r);
      // little mounds / bubbles so it reads as a different material from far away
      const dots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: goo ? 0xd09cff : snow ? 0xffffff : 0xc9a456, roughness: goo ? 0.2 : 1 }), Math.floor(d.w / 1.4));
      const mm = new THREE.Matrix4();
      for (let i = 0; i < dots.count; i++) {
        const x = d.x + (i + Math.random() * 0.8) * 1.4;
        mm.compose(new THREE.Vector3(x, v.ground(x) + 0.28, (Math.random() - 0.5) * LANE), new THREE.Quaternion(), new THREE.Vector3(0.35 + Math.random() * 0.4, 0.2 + Math.random() * 0.25, 0.35));
        dots.setMatrixAt(i, mm);
      }
      g.add(dots);
      return { object: g, update: (_a, t) => void (goo && (mat.emissiveIntensity = 0.5 + Math.sin(t * 3 + d.x) * 0.2)) };
    }
    case 'boost': {
      const tex = chevronTexture('#ffe066', '#1d2a3a');
      tex.repeat.set(d.w / 3, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const strip = ribbon(d.x, d.x + d.w, 0.07, 0.06, v.ground, 3.4, mat, 1 / 3);
      tex.repeat.set(1, 1);
      g.add(strip);
      const edge = ribbon(d.x, d.x + d.w, 0.075, 0.01, v.ground, 3.5, glow(0xffe066, 0.35));
      g.add(edge);
      return { object: g, update: (_a, t) => void (tex.offset.x = -t * 1.6) };
    }
    case 'wind':
    case 'vacuum': {
      const vac = d.kind === 'vacuum';
      const ang = z.angle;
      const dr = drift(Math.round((d.w * h) / 5) + 8, d.w, h, vac ? 0xb9f2ff : 0xffffff, Math.cos(ang) * (vac ? 26 : 16), Math.sin(ang) * (vac ? 26 : 16));
      dr.obj.position.set(d.x, d.y, 0);
      g.add(dr.obj);
      // faint field box so the area is readable
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(d.w, h, 0.1)), new THREE.LineBasicMaterial({ color: vac ? 0x9ae8ff : 0xdff6ff, transparent: true, opacity: vac ? 0.8 : 0.25 }));
      edges.position.set(d.x + d.w / 2, d.y + h / 2, 0);
      g.add(edges);
      if (vac) {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(d.w, h, LANE), glow(0x7fdcff, 0.07));
        tube.position.copy(edges.position);
        g.add(tube);
      } else {
        // fan housing at the upwind end
        const fan = new THREE.Group();
        fan.add(box(0.7, h * 0.7, 2.6, std(0x59616c, { metal: 0.4 }), 0.1));
        const blades = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const b = box(0.12, h * 0.32, 0.9, std(0xcfd6dc, { metal: 0.5 }), 0.03);
          b.position.y = h * 0.16;
          const pivot = new THREE.Group();
          pivot.rotation.x = (i * Math.PI) / 2;
          pivot.add(b);
          blades.add(pivot);
        }
        blades.position.x = 0.4;
        fan.add(blades);
        fan.position.set(d.x - 0.4, d.y + h / 2, 0);
        g.add(fan);
        return {
          object: g,
          update: (_a, t, dt) => {
            dr.step(dt);
            blades.rotation.x = t * 14;
          },
        };
      }
      return { object: g, update: (_a, _t, dt) => dr.step(dt) };
    }
    case 'lowgrav':
    case 'flipgrav': {
      const flip = d.kind === 'flipgrav';
      const col = flip ? 0xff7ae0 : 0x7affc8;
      const body = new THREE.Mesh(new THREE.BoxGeometry(d.w, h, LANE), glow(col, 0.06));
      body.position.set(d.x + d.w / 2, d.y + h / 2, 0);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(d.w, h, LANE)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 }));
      edges.position.copy(body.position);
      g.add(body, edges);
      const dr = drift(Math.round(d.w * h / 8) + 6, d.w, h, col, 0, flip ? 3.4 : 1.4, 0.2);
      dr.obj.position.set(d.x, d.y, 0);
      g.add(dr.obj);
      return { object: g, update: (_a, _t, dt) => dr.step(dt) };
    }
    case 'magnet': {
      const mag = new THREE.Group();
      const repel = z.strength < 0;
      const body = box(2.6, 1.8, 2.4, std(repel ? 0x3b82f6 : 0xd94a4a, { metal: 0.5 }), 0.2);
      const tip1 = box(0.9, 0.9, 2.5, std(0xe8e8ee, { metal: 0.6 }), 0.1);
      tip1.position.set(-0.85, -1.2, 0);
      const tip2 = tip1.clone();
      tip2.position.x = 0.85;
      mag.add(body, tip1, tip2);
      mag.position.set(d.x, d.y, 0);
      g.add(mag);
      const rings: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 36), new THREE.MeshBasicMaterial({ color: repel ? 0x3b82f6 : 0xe04a4a, transparent: true, opacity: 0.5, depthWrite: false }));
        r.position.set(d.x, d.y, 0);
        rings.push(r);
        g.add(r);
      }
      return {
        object: g,
        update: (_a, t) => {
          rings.forEach((r, i) => {
            const k = (t * 0.55 + i / 3) % 1;
            const s = (repel ? k : 1 - k) * d.w * 0.8;
            r.scale.setScalar(Math.max(0.01, s));
            (r.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.sin(Math.PI * k);
          });
        },
      };
    }
  }
}

export function conveyorView(c: Conveyor, v: ViewCtx): HazardView {
  const d = c.d;
  const g = new THREE.Group();
  const tex = chevronTexture('#ffb52e', '#2a313b');
  tex.repeat.set(d.w / 2.4, 1);
  const top = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.34, LANE - 0.4), [
    std(0x2a313b, { vc: false }),
    std(0x2a313b, { vc: false }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
    std(0x20252c, { vc: false }),
    std(0x2a313b, { vc: false }),
    std(0x2a313b, { vc: false }),
  ]);
  top.position.set(d.x + d.w / 2, d.y + 0.1 - 0.17 + 0.0, 0);
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);
  for (const s of [0, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, LANE - 0.3, 14).rotateX(Math.PI / 2), std(0x8a929c, { vc: false, metal: 0.6 }));
    roller.position.set(d.x + s * d.w, d.y - 0.07, 0);
    g.add(roller);
  }
  // side rails
  for (const s of [-1, 1]) {
    const rail = box(d.w, 0.18, 0.2, std(0x59616c, { metal: 0.4 }), 0.04);
    rail.position.set(d.x + d.w / 2, d.y + 0.15, s * (LANE / 2 - 0.2));
    g.add(rail);
  }
  void v;
  return { object: g, update: () => void (tex.offset.x = -c.scroll * 0.42) };
}

export function bounceView(b: BouncePad): HazardView {
  const g = new THREE.Group();
  const w = b.w;
  if (b.d.vent) return ventView(b);
  const base = box(w, 0.35, 2.6, std(0x59616c, { metal: 0.4 }), 0.08);
  base.position.set(b.d.x, b.d.y + 0.17, 0);
  const plate = box(w - 0.3, 0.26, 2.5, std(0xff4fa3, { emissive: 0xaa1166, ei: 0.5 }), 0.08);
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1, 10), std(0xdfe4e8, { metal: 0.7, vc: false }));
  g.add(base, plate, coil);
  // chevrons on the plate so the direction reads
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  arrow.rotation.x = 0;
  arrow.position.y = 0.2;
  plate.add(arrow);
  return {
    object: g,
    update: (_a, t) => {
      const lift = 0.5 * (1 - b.squash) + 0.1 + (b.squash > 0 ? 0 : Math.sin(t * 3 + b.d.x) * 0.03);
      plate.position.set(b.d.x, b.d.y + 0.3 + lift, 0);
      coil.scale.y = Math.max(0.1, lift + 0.05);
      coil.position.set(b.d.x, b.d.y + 0.3 + (lift + 0.05) / 2, 0);
    },
  };
}

export function cannonView(c: Cannon): HazardView {
  const d = c.d;
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.9, 14), std(0x4a525d, { metal: 0.5, vc: false }));
  base.position.set(d.x, d.y - 0.5, 0);
  const barrel = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 2.6, 16).rotateZ(-Math.PI / 2), std(0x2f353d, { metal: 0.6, vc: false }));
  tube.position.x = 1.0;
  tube.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.09, 8, 20).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a2e }));
  ring.position.x = 2.3;
  barrel.add(tube, ring);
  barrel.rotation.z = d.angle;
  barrel.position.set(d.x, d.y, 0);
  g.add(base, barrel);
  const mat = ring.material as THREE.MeshBasicMaterial;
  return {
    object: g,
    update: (_a, t) => {
      const k = c.charge;
      mat.color.setHex(k > 0 ? (Math.floor(t * 14) % 2 ? 0xffffff : 0xff4a2e) : 0xff8a2e);
      const rec = c.recoil * 0.5;
      barrel.position.set(d.x - Math.cos(d.angle) * rec, d.y - Math.sin(d.angle) * rec, 0);
      barrel.scale.setScalar(1 + k * 0.06);
    },
  };
}

export function onewayView(o: OneWay): HazardView {
  const d = o.d;
  const g = new THREE.Group();
  const slab = box(d.w, 0.3, 3.2, std(0x6aa8d8, { emissive: 0x2a6a9a, ei: 0.3 }), 0.07);
  slab.position.set(d.x + d.w / 2, d.y - 0.15, 0);
  g.add(slab);
  // dashed arrows on top = "pass through from below"
  const n = Math.floor(d.w / 1.4);
  for (let i = 0; i < n; i++) {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), new THREE.MeshBasicMaterial({ color: 0xeaf6ff }));
    a.position.set(d.x + 0.7 + i * 1.4, d.y + 0.08, 1.2);
    a.scale.set(1, 0.4, 1);
    g.add(a);
  }
  return { object: g, update: () => undefined };
}

export function transformView(p: TransformPad): HazardView {
  const d = p.d;
  const g = new THREE.Group();
  const grow = (d.scale ?? 1) > 1;
  const swap = !!d.vehicle;
  const col = swap ? 0xc77dff : grow ? 0xffa23a : 0x4ad8ff;
  const h = d.h ?? 5;
  for (const s of [-1, 1]) {
    const post = box(0.5, h + 0.6, 0.5, std(0x3a424d, { metal: 0.5 }), 0.1);
    post.position.set(d.x, d.y + (h + 0.6) / 2 - 0.3, s * (LANE / 2 + 0.2));
    g.add(post);
  }
  const field = new THREE.Mesh(new THREE.PlaneGeometry(LANE + 0.4, h).rotateY(Math.PI / 2), glow(col, 0.28));
  field.position.set(d.x, d.y + h / 2, 0);
  g.add(field);
  const arrows: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 3), new THREE.MeshBasicMaterial({ color: col }));
    a.rotation.z = swap ? Math.PI / 2 : grow ? 0 : Math.PI;
    a.rotation.y = Math.PI / 2;
    arrows.push(a);
    g.add(a);
  }
  return {
    object: g,
    update: (_a, t) => {
      (field.material as THREE.MeshBasicMaterial).opacity = 0.2 + p.pulse * 0.5 + Math.sin(t * 4) * 0.05;
      arrows.forEach((a, i) => {
        const k = (t * 0.7 + i / 3) % 1;
        a.position.set(d.x, d.y + 0.5 + (grow ? k : 1 - k) * (h - 1), 0);
      });
    },
  };
}

void line;

/** Steam vent: dark grate with a constant wisp of steam that bursts when it fires. */
function ventView(b: BouncePad): HazardView {
  const g = new THREE.Group();
  const grate = box(b.w, 0.3, 2.6, std(0x3a424d, { metal: 0.5 }), 0.06);
  grate.position.set(b.d.x, b.d.y + 0.15, 0);
  g.add(grate);
  for (let i = 0; i < Math.floor(b.w / 0.7); i++) {
    const slit = box(0.12, 0.05, 2.4, std(0xdfe4e8, { vc: false }), 0.01);
    slit.position.set(b.d.x - b.w / 2 + 0.5 + i * 0.7, b.d.y + 0.32, 0);
    g.add(slit);
  }
  const n = 14;
  const puffs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), n);
  puffs.frustumCulled = false;
  g.add(puffs);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  return {
    object: g,
    update: (_a, t) => {
      for (let i = 0; i < n; i++) {
        const k = (t * 0.9 + i / n) % 1;
        const burst = 1 + b.squash * 3;
        const sz = (0.25 + k * 0.7) * (0.8 + b.squash);
        m.compose(
          new THREE.Vector3(b.d.x + Math.sin(i * 12.9 + t) * 0.5 * k * burst, b.d.y + 0.4 + k * (2.2 + b.squash * 5), Math.sin(i * 7.1) * 0.8),
          q.setFromEuler(new THREE.Euler(0, 0, i + t)),
          new THREE.Vector3(sz * (1 - k * 0.5), sz * (1 - k * 0.5), sz),
        );
        puffs.setMatrixAt(i, m);
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
  };
}
