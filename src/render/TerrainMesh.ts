import * as THREE from 'three';
import { CONFIG } from '../config';

export interface TerrainStyle {
  dirt: number;
  top: number;
  /** Thickness of the turf strip (m). */
  turf: number;
}

/**
 * Chunky extruded terrain: a beveled dirt slab with a slightly proud, beveled turf ribbon
 * following the driving surface. Matches the physics polyline exactly.
 */
export function buildTerrainMesh(
  points: ReadonlyArray<readonly [number, number]>,
  depth: number,
  style: TerrainStyle,
): THREE.Group {
  const group = new THREE.Group();
  const lane = CONFIG.render.laneDepth;
  const first = points[0];
  const last = points[points.length - 1];
  const floorY = Math.min(...points.map((p) => p[1])) - depth;

  // The dirt slab sits just under the turf so their top faces never z-fight.
  const sink = style.turf * 0.5;
  const slab = new THREE.Shape();
  slab.moveTo(first[0], floorY);
  slab.lineTo(first[0], first[1] - sink);
  for (let i = 1; i < points.length; i++) slab.lineTo(points[i][0], points[i][1] - sink);
  slab.lineTo(last[0], floorY);
  slab.closePath();

  const bevel = 0.18;
  const slabGeo = new THREE.ExtrudeGeometry(slab, {
    depth: lane - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    steps: 1,
  });
  slabGeo.translate(0, 0, -lane / 2 + bevel);
  const slabMesh = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: style.dirt, roughness: 0.95 }));
  slabMesh.castShadow = true;
  slabMesh.receiveShadow = true;
  group.add(slabMesh);

  // Turf ribbon: surface polyline and the same polyline offset downward.
  const turf = new THREE.Shape();
  turf.moveTo(first[0], first[1] - style.turf);
  turf.lineTo(first[0], first[1]);
  for (let i = 1; i < points.length; i++) turf.lineTo(points[i][0], points[i][1]);
  turf.lineTo(last[0], last[1] - style.turf);
  for (let i = points.length - 2; i >= 0; i--) turf.lineTo(points[i][0], points[i][1] - style.turf);
  turf.closePath();
  const tb = 0.12;
  const turfGeo = new THREE.ExtrudeGeometry(turf, {
    depth: lane + 0.12 - tb * 2,
    bevelEnabled: true,
    bevelThickness: tb,
    bevelSize: tb,
    bevelOffset: -tb,
    bevelSegments: 2,
  });
  turfGeo.translate(0, 0, -lane / 2 - 0.06 + tb);
  const turfMesh = new THREE.Mesh(turfGeo, new THREE.MeshStandardMaterial({ color: style.top, roughness: 0.85 }));
  turfMesh.castShadow = true;
  turfMesh.receiveShadow = true;
  group.add(turfMesh);

  return group;
}
