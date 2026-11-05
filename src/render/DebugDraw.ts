import * as THREE from 'three';
import type { World } from 'planck';

/** Wireframe overlay of every Box2D fixture. Dev-only; rebuilt each frame while enabled. */
export class DebugDraw {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private attr: THREE.BufferAttribute;
  enabled = false;
  private static readonly MAX = 40000;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(DebugDraw.MAX * 3);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x00ff88, depthTest: false, transparent: true }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.position.z = 3.5;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.lines.visible = this.enabled;
    return this.enabled;
  }

  update(world: World): void {
    if (!this.enabled) return;
    let n = 0;
    const p = this.pos;
    const seg = (ax: number, ay: number, bx: number, by: number) => {
      if (n + 2 > DebugDraw.MAX) return;
      p[n * 3] = ax;
      p[n * 3 + 1] = ay;
      p[n * 3 + 2] = 0;
      n++;
      p[n * 3] = bx;
      p[n * 3 + 1] = by;
      p[n * 3 + 2] = 0;
      n++;
    };
    for (let b = world.getBodyList(); b; b = b.getNext()) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = f.getShape() as any;
        const type = s.getType() as string;
        if (type === 'circle') {
          const c = b.getWorldPoint(s.m_p);
          const r = s.m_radius as number;
          const k = 20;
          for (let i = 0; i < k; i++) {
            const a0 = (i / k) * Math.PI * 2;
            const a1 = ((i + 1) / k) * Math.PI * 2;
            seg(c.x + Math.cos(a0) * r, c.y + Math.sin(a0) * r, c.x + Math.cos(a1) * r, c.y + Math.sin(a1) * r);
          }
          const e = b.getWorldPoint({ x: s.m_p.x + r, y: s.m_p.y });
          seg(c.x, c.y, e.x, e.y);
        } else if (type === 'polygon' || type === 'chain') {
          const vs = s.m_vertices as { x: number; y: number }[];
          const loop = type === 'polygon' || s.m_isLoop;
          const cnt = vs.length;
          for (let i = 0; i < (loop ? cnt : cnt - 1); i++) {
            const a = b.getWorldPoint(vs[i]);
            const c = b.getWorldPoint(vs[(i + 1) % cnt]);
            seg(a.x, a.y, c.x, c.y);
          }
        } else if (type === 'edge') {
          const a = b.getWorldPoint(s.m_vertex1);
          const c = b.getWorldPoint(s.m_vertex2);
          seg(a.x, a.y, c.x, c.y);
        }
      }
    }
    this.lines.geometry.setDrawRange(0, n);
    this.attr.needsUpdate = true;
  }
}
