import * as THREE from 'three';
import { CONFIG } from '../config';

export interface TerrainStyle {
  dirt: number;
  top: number;
  /** Thickness of the turf strip (m). */
  turf: number;
  /** Front-face pattern. */
  face?: 'brick' | 'stone' | 'plate';
}

/** How far the playfield blocks reach behind the lane (m): a narrow causeway with sea behind it. */
export const LANE_BACK = 9;
/** Front edge of the blocks (m). */
export const LANE_FRONT = CONFIG.render.laneDepth / 2;

const faceCache = new Map<string, THREE.CanvasTexture>();

/**
 * Tileable front-face texture, 4 m × 4 m per tile: chunky toy bricks / stone blocks / riveted plates in tints of
 * the base colour. Extrude caps use shape-space UVs (metres), so `repeat = 1/4` gives world-scale bricks.
 */
function faceTexture(color: number, kind: 'brick' | 'stone' | 'plate'): THREE.CanvasTexture {
  const key = `${color}|${kind}`;
  let t = faceCache.get(key);
  if (t) return t;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(color);
  const css = (k: number) => '#' + base.clone().multiplyScalar(k).getHexString();
  g.fillStyle = css(0.78);
  g.fillRect(0, 0, S, S);
  let seed = (color % 997) + 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const brick = (x: number, y: number, w: number, h: number, gap: number) => {
    const k = 0.94 + rnd() * 0.14;
    g.fillStyle = css(k);
    rr(x + gap, y + gap, w - gap * 2, h - gap * 2, 7);
    g.fill();
    // top highlight + bottom shade = chunky bevel
    g.fillStyle = css(k * 1.1);
    rr(x + gap, y + gap, w - gap * 2, (h - gap * 2) * 0.28, 6);
    g.fill();
    g.fillStyle = css(k * 0.86);
    g.fillRect(x + gap + 4, y + h - gap - 7, w - gap * 2 - 8, 5);
  };
  if (kind === 'brick') {
    const rows = 4;
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? rh : 0;
      for (let x = -off; x < S; x += rh * 2) brick(x, r * rh, rh * 2, rh, 4);
      // wrap the half brick so the tile stays seamless
      if (off) brick(S - off, r * rh, rh * 2, rh, 4);
    }
  } else if (kind === 'stone') {
    let y = 0;
    while (y < S) {
      const h = 40 + Math.floor(rnd() * 3) * 12;
      const hh = Math.min(h, S - y);
      let x = -Math.floor(rnd() * 40);
      while (x < S) {
        const w = 60 + rnd() * 70;
        brick(x, y, w, hh, 4);
        x += w;
      }
      y += hh;
    }
  } else {
    const n = 2;
    const w = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        brick(i * w, j * w, w, w, 3);
        g.fillStyle = css(0.6);
        for (const [px, py] of [[12, 12], [w - 12, 12], [12, w - 12], [w - 12, w - 12]]) {
          g.beginPath();
          g.arc(i * w + px, j * w + py, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 4, 1 / 4);
  t.anisotropy = 4;
  faceCache.set(key, t);
  return t;
}

/** Vertical shade: lighter near the top of the block, darker toward the sea. */
function shadeByHeight(geo: THREE.BufferGeometry, topY: number, span: number, bottom = 0.62): void {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(1 - (topY - pos.getY(i)) / span, 0, 1);
    const c = bottom + (1 - bottom) * t;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Chunky toy terrain: a brick/stone block following the physics polyline, topped by a thick, slightly
 * overhanging turf slab. The block is a narrow causeway (the sea shows behind it).
 */
export function buildTerrainMesh(
  points: ReadonlyArray<readonly [number, number]>,
  depth: number,
  style: TerrainStyle,
): THREE.Group {
  const group = new THREE.Group();
  const first = points[0];
  const last = points[points.length - 1];
  const minY = Math.min(...points.map((p) => p[1]));
  const maxY = Math.max(...points.map((p) => p[1]));
  const floorY = minY - depth;

  // The block sits just under the turf so their top faces never z-fight.
  const sink = style.turf * 0.5;
  const slab = new THREE.Shape();
  slab.moveTo(first[0], floorY);
  slab.lineTo(first[0], first[1] - sink);
  for (let i = 1; i < points.length; i++) slab.lineTo(points[i][0], points[i][1] - sink);
  slab.lineTo(last[0], floorY);
  slab.closePath();

  const back = LANE_BACK;
  const front = LANE_FRONT;
  const bevel = 0.22;
  const slabGeo = new THREE.ExtrudeGeometry(slab, {
    depth: front + back - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    steps: 1,
  });
  slabGeo.translate(0, 0, -back + bevel);
  shadeByHeight(slabGeo, maxY, Math.max(8, maxY - floorY) * 0.9);
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: faceTexture(style.dirt, style.face ?? 'brick'),
    roughness: 0.92,
    vertexColors: true,
  });
  const slabMesh = new THREE.Mesh(slabGeo, slabMat);
  slabMesh.castShadow = true;
  slabMesh.receiveShadow = true;
  group.add(slabMesh);

  // Turf slab: surface polyline and the same polyline offset downward; it overhangs the block a little.
  const turf = new THREE.Shape();
  const lip = 0.18;
  turf.moveTo(first[0] - lip, first[1] - style.turf);
  turf.lineTo(first[0] - lip, first[1]);
  for (let i = 1; i < points.length; i++) turf.lineTo(points[i][0], points[i][1]);
  turf.lineTo(last[0] + lip, last[1]);
  turf.lineTo(last[0] + lip, last[1] - style.turf);
  for (let i = points.length - 2; i >= 1; i--) turf.lineTo(points[i][0], points[i][1] - style.turf);
  turf.closePath();
  const tb = 0.16;
  const turfGeo = new THREE.ExtrudeGeometry(turf, {
    depth: front + back + 0.36 - tb * 2,
    bevelEnabled: true,
    bevelThickness: tb,
    bevelSize: tb,
    bevelOffset: -tb,
    bevelSegments: 3,
  });
  turfGeo.translate(0, 0, -back - 0.18 + tb);
  // darker underside of the turf, bright top
  {
    const pos = turfGeo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const n = points.length;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      // surface height under this vertex (polyline lookup by nearest segment)
      let sy = first[1];
      for (let k = 1; k < n; k++) {
        if (x <= points[k][0]) {
          const [x0, y0] = points[k - 1];
          const [x1, y1] = points[k];
          sy = y0 + (y1 - y0) * (x1 === x0 ? 0 : (x - x0) / (x1 - x0));
          break;
        }
        sy = points[k][1];
      }
      const below = sy - pos.getY(i);
      const c = below > style.turf * 0.6 ? 0.72 : 1;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
    }
    turfGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const turfMesh = new THREE.Mesh(turfGeo, new THREE.MeshStandardMaterial({ color: style.top, roughness: 0.78, vertexColors: true }));
  turfMesh.castShadow = true;
  turfMesh.receiveShadow = true;
  group.add(turfMesh);

  return group;
}
