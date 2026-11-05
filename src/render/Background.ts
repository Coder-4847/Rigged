import * as THREE from 'three';
import type { WorldTheme } from '../levels/themes';

interface Layer {
  group: THREE.Group;
  /** on-screen scroll speed relative to the foreground (smaller = farther) */
  parallax: number;
  /** perspective scale at this depth */
  scale: number;
  baseY: number;
}

/**
 * Three layers of blocky silhouettes plus drifting clouds. Layers follow the camera at a
 * fraction of its motion, so they scroll slower than the playfield (true parallax).
 */
export class Background {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private clouds = new THREE.Group();
  private t = 0;

  constructor(
    theme: WorldTheme,
    private extentX: number,
    camDist = 46,
  ) {
    const depths = [150, 105, 66];
    const parallax = [0.1, 0.2, 0.36];
    const heights = [15, 11, 8];
    depths.forEach((d, i) => {
      const g = new THREE.Group();
      g.position.z = -d;
      const mat = new THREE.MeshBasicMaterial({ color: theme.bg[i], fog: true });
      this.fill(g, mat, theme.bgShape, heights[i], i);
      this.group.add(g);
      this.layers.push({ group: g, parallax: parallax[i], scale: camDist / (camDist + d), baseY: -4 + i * 1.5 });
    });
    this.buildClouds();
    this.group.add(this.clouds);
  }

  private rng(seed: number) {
    let s = seed * 7919 + 17;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }

  private fill(g: THREE.Group, mat: THREE.Material, shape: WorldTheme['bgShape'], maxH: number, layer: number): void {
    const rnd = this.rng(layer + 3);
    const span = this.extentX * 0.9 + 400;
    let x = -160;
    const add = (w: number, h: number, d: number, px: number, py: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py + h / 2 - 60, 0);
      g.add(m);
    };
    while (x < span) {
      const w = 10 + rnd() * 22;
      const h = maxH * (0.45 + rnd() * 0.55);
      switch (shape) {
        case 'mountains': {
          // base block reaches below the camera, then a stepped pyramid of blocks on top
          add(w, 60, 14, x, 0);
          const steps = 4;
          for (let s = 0; s < steps; s++) add(w * (1 - s / steps), h / steps, 14, x, 60 + (h / steps) * s);
          break;
        }
        case 'towers':
          add(w * 0.6, h * 1.4 + 60, 12, x, 0);
          if (rnd() > 0.5) add(w * 0.3, h * 0.6, 8, x, 60 + h * 1.4);
          break;
        case 'spires':
          add(w * 0.35, h * 1.8 + 60, 10, x, 0);
          add(w * 0.18, h * 0.6, 6, x, 60 + h * 1.8);
          break;
        case 'pipes':
          add(w * 0.28, h * 1.6 + 60, 10, x, 0);
          add(w * 1.1, 3, 6, x + w * 0.4, 60 + h * 1.1);
          break;
        case 'blobs':
          add(w * 1.2, h * 0.9 + 60, 14, x, 0);
          add(w * 0.7, h * 0.5, 10, x + 2, 60 + h * 0.9);
          break;
      }
      x += w * (0.7 + rnd() * 0.6);
    }
  }

  private buildClouds(): void {
    const rnd = this.rng(99);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(6 + rnd() * 6, 1.6 + rnd() * 1.4, 2.5), mat);
        b.position.set(k * 5 - n * 2.5, rnd() * 1.2, 0);
        c.add(b);
      }
      c.position.set(-60 + i * 55 + rnd() * 30, 22 + rnd() * 14, -120 - rnd() * 20);
      this.clouds.add(c);
    }
  }

  /** Call every frame with the camera focus and elapsed time. */
  update(dt: number, cx: number, cy: number): void {
    this.t += dt;
    for (const l of this.layers) {
      const f = 1 - l.parallax / l.scale;
      l.group.position.x = f * cx;
      l.group.position.y = cy * 0.6 + l.baseY - 6;
    }
    this.clouds.position.x = cx * 0.72 + this.t * 0.8;
    this.clouds.position.y = cy * 0.7;
    // wrap clouds so they never run out
    this.clouds.children.forEach((c) => {
      const wx = c.position.x + this.clouds.position.x - cx;
      if (wx > 260) c.position.x -= 520;
      if (wx < -260) c.position.x += 520;
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
