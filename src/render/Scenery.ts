import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { block } from './geometry';
import type { DecoKind } from '../levels/types';
import type { WorldTheme } from '../levels/themes';

const cache = new Map<string, THREE.Material>();
function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}`;
  let m = cache.get(k) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, vertexColors: true });
    cache.set(k, m);
  }
  return m;
}
const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Block geometries are shared between every deco of the same shape (never disposed per level). */
const blockCache = new Map<string, THREE.BufferGeometry>();
export const isShared = (g: THREE.BufferGeometry): boolean => g.userData.shared === true;
function sharedBlock(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const k = `${w}|${h}|${d}|${r}`;
  let g = blockCache.get(k);
  if (!g) {
    g = block(w, h, d, r);
    g.userData.shared = true;
    blockCache.set(k, g);
  }
  return g;
}

function mesh(w: number, h: number, d: number, color: number, r = 0.08): THREE.Mesh {
  const m = new THREE.Mesh(sharedBlock(w, h, d, r), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9d3a3';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#6b4a2b';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 150);
  g.fillStyle = '#4a2f18';
  g.font = '800 46px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // wrap on spaces into at most 2 lines
  const words = text.split(' ');
  const half = Math.ceil(words.length / 2);
  const lines = text.length > 14 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [text];
  lines.forEach((ln, i) => g.fillText(ln, 256, 80 + (i - (lines.length - 1) / 2) * 54, 470));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Build one piece of scenery standing with its base at the local origin. */
export function buildDeco(kind: DecoKind, theme: WorldTheme, scale: number, text?: string): THREE.Object3D {
  const g = new THREE.Group();
  const leaf = theme.top;
  switch (kind) {
    case 'tree': {
      const t = mesh(0.5, 1.8, 0.5, 0x7a5232);
      t.position.y = 0.9;
      const c1 = mesh(2.2, 1.4, 2.2, shade(leaf, 0.9), 0.25);
      c1.position.y = 2.3;
      const c2 = mesh(1.6, 1.2, 1.6, shade(leaf, 1.08), 0.22);
      c2.position.y = 3.4;
      g.add(t, c1, c2);
      break;
    }
    case 'pine': {
      const t = mesh(0.4, 1.2, 0.4, 0x6b4a2f);
      t.position.y = 0.6;
      g.add(t);
      [2.4, 1.8, 1.2].forEach((w, i) => {
        const c = mesh(w, 1.1, w, shade(leaf, 0.7 + i * 0.1), 0.15);
        c.position.y = 1.6 + i * 0.95;
        g.add(c);
      });
      break;
    }
    case 'bush': {
      const a = mesh(1.4, 0.8, 1.2, shade(leaf, 0.85), 0.3);
      a.position.set(-0.3, 0.4, 0);
      const b = mesh(1.0, 0.65, 1.0, shade(leaf, 1.0), 0.28);
      b.position.set(0.5, 0.33, 0.15);
      g.add(a, b);
      break;
    }
    case 'rock': {
      const a = mesh(1.8, 1.1, 1.4, 0x9aa0a8, 0.3);
      a.position.y = 0.5;
      a.rotation.y = 0.4;
      const b = mesh(1.0, 0.7, 0.9, 0x868c94, 0.25);
      b.position.set(1.0, 0.3, 0.3);
      g.add(a, b);
      break;
    }
    case 'flower': {
      const s = mesh(0.08, 0.7, 0.08, 0x4f8f3a, 0.03);
      s.position.y = 0.35;
      const h = mesh(0.34, 0.34, 0.34, [0xff7a9c, 0xffd23a, 0xffffff, 0xb28aff][Math.floor((text?.length ?? 0) + scale * 7) % 4], 0.12);
      h.position.y = 0.8;
      g.add(s, h);
      break;
    }
    case 'cactus': {
      const t = mesh(0.55, 2.4, 0.55, 0x5f9a4a, 0.2);
      t.position.y = 1.2;
      const a = mesh(0.9, 0.4, 0.4, 0x5f9a4a, 0.15);
      a.position.set(0.55, 1.4, 0);
      const a2 = mesh(0.4, 0.8, 0.4, 0x5f9a4a, 0.15);
      a2.position.set(0.95, 1.8, 0);
      g.add(t, a, a2);
      break;
    }
    case 'crate': {
      const c = mesh(1.2, 1.2, 1.2, 0xb98650, 0.1);
      c.position.y = 0.6;
      g.add(c);
      break;
    }
    case 'sign': {
      const post = mesh(0.22, 2.2, 0.22, 0x6b4a2b, 0.05);
      post.position.y = 1.1;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 1.15, 0.18),
        [mat(0x6b4a2b), mat(0x6b4a2b), mat(0x6b4a2b), mat(0x6b4a2b), new THREE.MeshStandardMaterial({ map: signTexture(text ?? ''), roughness: 0.9 }), mat(0x6b4a2b)],
      );
      board.position.set(0, 2.55, 0.1);
      board.castShadow = true;
      g.add(post, board);
      break;
    }
    case 'cloud':
      break;
  }
  g.scale.setScalar(kind === 'sign' ? 1 : scale);
  return g;
}


/**
 * Bake many static scenery pieces into a few meshes: grouped by material and by 40 m slice of
 * the level (so frustum culling still works). Cuts hundreds of draw calls down to a handful.
 */
export function mergeStatic(items: THREE.Object3D[], slice = 40): THREE.Group {
  const out = new THREE.Group();
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  for (const it of items) {
    it.updateMatrixWorld(true);
    const bucket = Math.floor(it.position.x / slice);
    it.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const material = m.material as THREE.Material;
      const key = `${material.uuid}|${bucket}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: material, geos: [] }));
      b.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
    });
  }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}
