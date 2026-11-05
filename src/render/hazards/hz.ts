import * as THREE from 'three';
import { block } from '../geometry';

/** A drawable hazard. `update` runs every rendered frame. */
export interface HazardView {
  object: THREE.Object3D;
  update(alpha: number, t: number, dt: number): void;
  /** Loose physics props can end up anywhere, so they are never distance-culled. */
  roams?: boolean;
}

export interface Palette {
  hazard: number;
  accent: number;
  metal: number;
}

const cache = new Map<string, THREE.Material>();
export function std(color: number, opts: { rough?: number; metal?: number; emissive?: number; ei?: number; vc?: boolean } = {}): THREE.MeshStandardMaterial {
  const k = JSON.stringify([color, opts]);
  let m = cache.get(k) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.6,
      metalness: opts.metal ?? 0.1,
      emissive: opts.emissive ?? 0,
      emissiveIntensity: opts.ei ?? 1,
      vertexColors: opts.vc ?? true,
    });
    cache.set(k, m);
  }
  return m;
}

export function glow(color: number, opacity = 0.6): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

export function box(w: number, h: number, d: number, mat: THREE.Material, r = 0.06): THREE.Mesh {
  const m = new THREE.Mesh(block(w, h, d, r), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Diagonal warning stripes (shape-based cue, not just colour). */
let stripeTex: THREE.CanvasTexture | null = null;
export function stripeTexture(hazard: number): THREE.CanvasTexture {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1f27';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#' + hazard.toString(16).padStart(6, '0');
  for (let i = -2; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 32, 64);
    g.lineTo(i * 32 + 16, 64);
    g.lineTo(i * 32 + 16 + 64, 0);
    g.lineTo(i * 32 + 64, 0);
    g.fill();
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  return stripeTex;
}

export function stripedBox(w: number, h: number, d: number, hazard: number, repeat = 1): THREE.Mesh {
  const tex = stripeTexture(hazard).clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, (w * repeat) / 1.5), Math.max(1, (h * repeat) / 1.5));
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.2 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Chevron arrows for belts / boost strips. Scroll with texture.offset.x. */
export function chevronTexture(fg: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg;
  g.beginPath();
  g.moveTo(24, 8);
  g.lineTo(64, 32);
  g.lineTo(24, 56);
  g.lineTo(44, 56);
  g.lineTo(84, 32);
  g.lineTo(44, 8);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A thin glowing line between two points (rails, chains, field edges). */
export function line(a: THREE.Vector3, b: THREE.Vector3, color: number, opacity = 0.5): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** Flat terrain-following ribbon (for sand, goo, boost strips). u runs along x in metres. */
export function ribbon(x0: number, x1: number, lift: number, thick: number, ground: (x: number) => number, depthZ: number, mat: THREE.Material, uvScale = 1): THREE.Mesh {
  const n = Math.max(2, Math.ceil((x1 - x0) / 0.75));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const z = depthZ / 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = ground(x) + lift;
    // top front/back, bottom front/back
    pos.push(x, y, z, x, y, -z, x, y - thick, z, x, y - thick, -z);
    const u = (x - x0) * uvScale;
    uv.push(u, 1, u, 0, u, 1, u, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // top (counter-clockwise seen from above)
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    // front face (counter-clockwise seen from +z)
    idx.push(a, a + 2, b, b, a + 2, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}
