import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Bake a cheap "ambient occlusion" look into a geometry: vertex colours darken toward the
 * bottom (and slightly toward the back). Used with `vertexColors: true` materials.
 */
export function bakeShade(geo: THREE.BufferGeometry, bottom = 0.7, top = 1): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = Math.max(1e-4, bb.max.y - bb.min.y);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / h;
    const c = bottom + (top - bottom) * t;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Beveled toy-block box, centred on origin, with baked AO gradient. */
export function block(w: number, h: number, d: number, radius = 0.07, bottomShade = 0.72): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return bakeShade(new RoundedBoxGeometry(w, h, d, 3, r), bottomShade);
}

/** Extrude a 2D side profile (x forward, y up) across z with a small bevel. Centred on z. */
export function profile(
  pts: Array<[number, number]>,
  depth: number,
  bevel = 0.05,
  bottomShade = 0.75,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -depth / 2 + bevel);
  return bakeShade(geo, bottomShade);
}

/** Tire cross-section revolved around the wheel axis (rounded shoulders). Axis = Z. */
export function tireGeometry(radius: number, width: number): THREE.BufferGeometry {
  const hw = width / 2;
  const s = Math.min(0.12, width * 0.3);
  const inner = radius * 0.5;
  const pts = [
    new THREE.Vector2(inner, -hw),
    new THREE.Vector2(radius - s, -hw),
    new THREE.Vector2(radius, -hw + s),
    new THREE.Vector2(radius, hw - s),
    new THREE.Vector2(radius - s, hw),
    new THREE.Vector2(inner, hw),
  ];
  const g = new THREE.LatheGeometry(pts, 24);
  g.rotateX(Math.PI / 2); // lathe axis Y -> Z
  return g;
}
