import * as THREE from 'three';
import { block } from './geometry';
import { buildTerrainMesh } from './TerrainMesh';
import { Background } from './Background';
import { buildDeco } from './Scenery';
import { FinishView, FlagView, StarView } from './Pickups';
import type { LevelData } from '../levels/types';
import type { WorldTheme } from '../levels/themes';
import type { LevelPhysics, SeesawBody } from '../entities/LevelPhysics';

const plankMat = new THREE.MeshStandardMaterial({ color: 0xc8924f, roughness: 0.8, vertexColors: true });
const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, roughness: 0.7, vertexColors: true });
const fulcrumMat = new THREE.MeshStandardMaterial({ color: 0x6a707a, roughness: 0.6 });

class SeesawView {
  readonly group = new THREE.Group();
  readonly fulcrum: THREE.Mesh;
  private tmp = { x: 0, y: 0, a: 0 };

  constructor(private body: SeesawBody) {
    const w = body.width;
    const plank = new THREE.Mesh(block(w, 0.4, 3.4, 0.08), plankMat);
    plank.castShadow = plank.receiveShadow = true;
    this.group.add(plank);
    // hazard-style (but friendly) end stripes so the ends read clearly
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(block(0.9, 0.42, 3.42, 0.05), stripeMat);
      stripe.position.x = s * (w / 2 - 0.7);
      this.group.add(stripe);
    }
    // Fulcrum: triangular prism from the pivot down to the ground.
    const p = body.pivot.getPosition();
    const groundY = p.y - (w / 2) * Math.sin(body.maxAngle) + 0.2 * Math.cos(body.maxAngle);
    const h = Math.max(0.6, p.y - groundY + 0.1);
    const shape = new THREE.Shape();
    shape.moveTo(-1.1, 0);
    shape.lineTo(1.1, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
    geo.translate(0, 0, -1.2);
    this.fulcrum = new THREE.Mesh(geo, fulcrumMat);
    this.fulcrum.position.set(p.x, groundY - 0.1, 0);
    this.fulcrum.castShadow = this.fulcrum.receiveShadow = true;
  }

  update(alpha: number): void {
    this.body.tracked.at(alpha, this.tmp);
    this.group.position.set(this.tmp.x, this.tmp.y, 0);
    this.group.rotation.z = this.tmp.a;
  }
}

/** All visuals for one level (terrain, scenery, pickups, background). Disposable. */
export class LevelView {
  readonly root = new THREE.Group();
  readonly stars: StarView[] = [];
  readonly flags: FlagView[] = [];
  readonly finish: FinishView;
  readonly background: Background;
  private seesaws: SeesawView[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    readonly data: LevelData,
    readonly theme: WorldTheme,
    physics: LevelPhysics,
  ) {
    for (const e of data.entities) {
      if (e.type === 'terrain') {
        this.root.add(buildTerrainMesh(e.points, e.depth ?? 14, { dirt: theme.dirt, top: theme.top, turf: 0.7 }));
      } else if (e.type === 'deco') {
        const d = buildDeco(e.kind, theme, e.scale ?? 1, e.text);
        d.position.set(e.x, e.y, e.z ?? -6);
        if (e.kind !== 'sign') d.rotation.y = (e.x * 0.37) % 0.6;
        this.root.add(d);
      }
    }
    for (const s of physics.seesaws) {
      const v = new SeesawView(s);
      this.seesaws.push(v);
      this.root.add(v.group, v.fulcrum);
    }
    data.stars.forEach((s, i) => {
      const v = new StarView(s[0], s[1], i * 1.7);
      this.stars.push(v);
      this.root.add(v.group);
    });
    data.checkpoints.forEach((c) => {
      const f = new FlagView(c[0], c[1], theme.accent);
      this.flags.push(f);
      this.root.add(f.group);
    });
    this.finish = new FinishView(data.finish[0], data.finish[1]);
    this.root.add(this.finish.group);

    const xs = data.cameraBounds;
    this.background = new Background(theme, xs.maxX - xs.minX);
    this.root.add(this.background.group);
    scene.add(this.root);
  }

  update(alpha: number, dt: number, camX: number, camY: number): void {
    this.time += dt;
    for (const s of this.seesaws) s.update(alpha);
    for (const s of this.stars) s.update(dt, this.time);
    for (const f of this.flags) f.update(dt, this.time);
    this.finish.update(this.time);
    this.background.update(dt, camX, camY);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}
