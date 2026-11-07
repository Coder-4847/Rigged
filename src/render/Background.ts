import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldTheme } from '../levels/themes';
import { bakeShade } from './geometry';

interface Layer {
  group: THREE.Group;
  /** on-screen scroll speed relative to the foreground (smaller = farther) */
  parallax: number;
  /** perspective scale at this depth */
  scale: number;
}

/**
 * Big chunky toy mountains (rounded, softly lit blocks) standing in the sea, a ring of little islands in the
 * middle distance, and puffy clouds. Far layers follow the camera at a fraction of its motion (parallax);
 * everything sits on the sea level so the world reads as one place.
 */
export class Background {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private clouds = new THREE.Group();
  private t = 0;

  constructor(
    theme: WorldTheme,
    private extentX: number,
    private seaY = -6,
    camDist = 46,
    minX = 0,
  ) {
    const depths = [190, 130, 82];
    const parallax = [0.1, 0.2, 0.34];
    const heights = [44, 30, 19];
    depths.forEach((d, i) => {
      const g = new THREE.Group();
      g.position.z = -d;
      g.position.y = seaY;
      const mat = new THREE.MeshLambertMaterial({ color: theme.bg[i], vertexColors: true, flatShading: theme.bgShape === 'mountains' });
      this.fill(g, mat, theme.bgShape, heights[i], i);
      this.group.add(g);
      this.layers.push({ group: g, parallax: parallax[i], scale: camDist / (camDist + d) });
    });
    if (theme.seaKind !== 'void') this.islands(theme, minX);
    this.buildClouds(theme);
    this.group.add(this.clouds);
  }

  private rng(seed: number) {
    let s = seed * 7919 + 17;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }

  private fill(g: THREE.Group, mat: THREE.Material, shape: WorldTheme['bgShape'], maxH: number, layer: number): void {
    const rnd = this.rng(layer + 3);
    const span = this.extentX * 0.9 + 500;
    const geos: THREE.BufferGeometry[] = [];
    const add = (w: number, h: number, d: number, px: number, py: number, r: number) => {
      const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
      bakeShade(geo, 0.62, 1.08);
      geo.translate(px, py + h / 2, 0);
      geos.push(geo);
    };
    const peak = (rad: number, h: number, px: number, rnd: () => number) => {
      const geo = new THREE.ConeGeometry(rad, h, 5 + Math.floor(rnd() * 3), 3).toNonIndexed();
      // jitter the inner rings so every peak is a little lumpy, then flatten front-to-back
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > -h / 2 + 0.01 && y < h / 2 - 0.01) {
          const k = 1 + Math.sin(pos.getX(i) * 1.7 + y * 0.9 + px) * 0.12;
          pos.setX(i, pos.getX(i) * k);
          pos.setZ(i, pos.getZ(i) * k);
        }
      }
      geo.scale(1, 1, 0.55);
      geo.computeVertexNormals();
      bakeShade(geo, 0.7, 1.12);
      geo.translate(px, h / 2 - 6, 0);
      geos.push(geo);
    };
    let x = -220;
    while (x < span) {
      const w = 18 + rnd() * 34;
      const h = maxH * (0.45 + rnd() * 0.55);
      const r = 2.2 + layer * 0.4;
      switch (shape) {
        case 'mountains': {
          // low-poly faceted peaks: a big one with a smaller shoulder peak beside it
          peak(w * 0.75, h * 1.15, x, rnd);
          if (rnd() > 0.3) peak(w * 0.5, h * (0.55 + rnd() * 0.3), x + w * (0.35 + rnd() * 0.2), rnd);
          break;
        }
        case 'towers':
          add(w * 0.5, h * 1.3, 14, x, -4, r);
          if (rnd() > 0.5) add(w * 0.28, h * 0.4, 9, x, h * 1.3 - 5, r * 0.6);
          break;
        case 'spires':
          add(w * 0.45, h * 1.2, 16, x, -4, r);
          add(w * 0.25, h * 0.5, 10, x, h * 1.2 - 5, r * 0.8);
          break;
        case 'pipes':
          add(w * 0.3, h * 1.4, 12, x, -4, r);
          add(w * 1.1, 3.6, 7, x + w * 0.4, h * 0.9, 1.4);
          break;
        case 'blobs':
          add(w * 1.1, h * 0.9, 22, x, -4, r * 2.4);
          add(w * 0.6, h * 0.45, 14, x + 3, h * 0.9 - 6, r * 2);
          break;
      }
      x += w * (0.6 + rnd() * 0.55);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((q) => q.dispose());
    if (merged) g.add(new THREE.Mesh(merged, mat));
  }

  /** Little grass-topped islands scattered in the middle distance (real depth, no parallax trick needed). */
  private islands(theme: WorldTheme, minX: number): void {
    const rnd = this.rng(42);
    const top: THREE.BufferGeometry[] = [];
    const side: THREE.BufferGeometry[] = [];
    const leaf: THREE.BufferGeometry[] = [];
    let x = minX - 60;
    while (x < minX + this.extentX + 120) {
      const w = 6 + rnd() * 12;
      const d = 5 + rnd() * 7;
      const h = 1.5 + rnd() * 3;
      const z = -26 - rnd() * 28;
      const s = new RoundedBoxGeometry(w, h + 6, d, 2, 0.5);
      bakeShade(s, 0.65, 1);
      s.translate(x, this.seaY + (h - 6) / 2, z);
      side.push(s);
      const tp = new RoundedBoxGeometry(w + 0.4, 0.8, d + 0.4, 2, 0.3);
      bakeShade(tp, 0.8, 1);
      tp.translate(x, this.seaY + h + 0.2, z);
      top.push(tp);
      if (rnd() > 0.35) {
        const n = 1 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) {
          const tw = 1.6 + rnd() * 1.4;
          const c = new RoundedBoxGeometry(tw, tw * 1.1, tw, 2, 0.35);
          bakeShade(c, 0.75, 1.05);
          c.translate(x + (rnd() - 0.5) * w * 0.6, this.seaY + h + 0.6 + tw * 0.55 + 1.2, z + (rnd() - 0.5) * d * 0.4);
          leaf.push(c);
        }
      }
      x += w + 10 + rnd() * 40;
    }
    const sideMat = new THREE.MeshLambertMaterial({ color: theme.dirt, vertexColors: true });
    const topMat = new THREE.MeshLambertMaterial({ color: theme.top, vertexColors: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.top).multiplyScalar(0.85), vertexColors: true });
    for (const [geos, mat] of [[side, sideMat], [top, topMat], [leaf, leafMat]] as const) {
      const merged = geos.length ? mergeGeometries(geos as THREE.BufferGeometry[], false) : null;
      geos.forEach((q) => q.dispose());
      if (merged) this.group.add(new THREE.Mesh(merged, mat));
    }
  }

  private buildClouds(theme: WorldTheme): void {
    const rnd = this.rng(99);
    const dark = theme.seaKind === 'void' || theme.skyTop < 0x303030;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: dark ? 0.05 : 0.35, transparent: true, opacity: dark ? 0.25 : 0.95 });
    for (let i = 0; i < 16; i++) {
      const geos: THREE.BufferGeometry[] = [];
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const w = 5 + rnd() * 6;
        const h = 2.4 + rnd() * 2.4;
        const b = new RoundedBoxGeometry(w, h, 4, 2, 1.1);
        b.translate(k * 4 - n * 2 + rnd(), (k === 1 || k === 2 ? 1.2 : 0) + h / 2, 0);
        geos.push(b);
      }
      const c = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
      geos.forEach((q) => q.dispose());
      c.position.set(-80 + i * 50 + rnd() * 30, this.seaY + 34 + rnd() * 22, -110 - rnd() * 40);
      this.clouds.add(c);
    }
  }

  /** Call every frame with the camera focus and elapsed time. */
  update(dt: number, cx: number, _cy: number): void {
    this.t += dt;
    for (const l of this.layers) {
      const f = 1 - l.parallax / l.scale;
      l.group.position.x = f * cx;
    }
    this.clouds.position.x = cx * 0.7 + this.t * 0.8;
    // wrap clouds so they never run out
    this.clouds.children.forEach((c) => {
      const wx = c.position.x + this.clouds.position.x - cx;
      if (wx > 400) c.position.x -= 800;
      if (wx < -400) c.position.x += 800;
    });
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
