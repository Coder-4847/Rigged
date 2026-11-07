import * as THREE from 'three';
import type { WorldTheme } from '../levels/themes';
import { LANE_BACK, LANE_FRONT } from './TerrainMesh';

const texCache = new Map<string, THREE.CanvasTexture>();

/** Tileable sea texture: base colour with soft, lighter ripple dashes (lava: glowing cracks; goo: bubbles). */
function seaTexture(color: number, kind: WorldTheme['seaKind']): THREE.CanvasTexture {
  const key = `${color}|${kind}`;
  let t = texCache.get(key);
  if (t) return t;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(color);
  g.fillStyle = '#' + base.getHexString();
  g.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const light = '#' + base.clone().lerp(new THREE.Color(kind === 'lava' ? 0xffe27a : 0xffffff), kind === 'lava' ? 0.7 : 0.55).getHexString();
  const dark = '#' + base.clone().multiplyScalar(kind === 'lava' ? 0.55 : 0.86).getHexString();
  // darker swells
  for (let i = 0; i < 18; i++) {
    g.fillStyle = dark;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 30 + rnd() * 40, 8 + rnd() * 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = light;
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const w = 14 + rnd() * 26;
    g.lineWidth = kind === 'lava' ? 3 + rnd() * 3 : 3 + rnd() * 2;
    g.globalAlpha = 0.5 + rnd() * 0.4;
    for (const dx of [0, -S, S]) {
      g.beginPath();
      if (kind === 'goo') {
        g.arc(x + dx, y, w * 0.18, 0, Math.PI * 2);
      } else {
        g.moveTo(x + dx - w / 2, y);
        g.quadraticCurveTo(x + dx - w / 4, y - 5, x + dx, y);
        g.quadraticCurveTo(x + dx + w / 4, y + 5, x + dx + w / 2, y);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/**
 * The sea the islands float in: a big animated plane at `level` with foam rings where blocks meet it.
 * Lava worlds get a glowing magma sea, labs/chaos glowing goo, the space station nothing (open space).
 */
export class Sea {
  readonly group = new THREE.Group();
  private tex?: THREE.CanvasTexture;
  private tex2?: THREE.CanvasTexture;
  private foam: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(
    private theme: WorldTheme,
    minX: number,
    maxX: number,
    readonly level: number,
  ) {
    this.foam = new THREE.MeshBasicMaterial({ color: theme.seaKind === 'lava' ? 0xffd36a : 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    if (theme.seaKind === 'void') return;
    const w = maxX - minX + 600;
    const d = 420;
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const glow = theme.seaKind !== 'water';
    this.tex = seaTexture(theme.sea, theme.seaKind).clone();
    this.tex.needsUpdate = true;
    this.tex.repeat.set(w / 14, d / 14);
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex,
      roughness: glow ? 0.6 : 0.35,
      metalness: 0,
      emissive: glow ? theme.sea : 0x000000,
      emissiveMap: glow ? this.tex : null,
      emissiveIntensity: theme.seaKind === 'lava' ? 0.85 : glow ? 0.16 : 0,
    });
    const sea = new THREE.Mesh(geo, mat);
    sea.position.set((minX + maxX) / 2, level, -d / 2 + 30);
    sea.receiveShadow = true;
    this.group.add(sea);

    // A second, faint layer drifting the other way makes the surface shimmer.
    this.tex2 = this.tex.clone();
    this.tex2.needsUpdate = true;
    this.tex2.repeat.set(w / 23, d / 23);
    const over = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: this.tex2, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    over.position.copy(sea.position);
    over.position.y += 0.02;
    this.group.add(over);
  }

  /** Foam ring around a block that stands in the sea (x range of the block). */
  addFoam(x0: number, x1: number): void {
    if (this.theme.seaKind === 'void') return;
    const m = 0.7;
    const depth = LANE_FRONT + LANE_BACK;
    const geo = new THREE.BoxGeometry(x1 - x0 + m * 2, 0.1, depth + m * 2);
    const ring = new THREE.Mesh(geo, this.foam);
    ring.position.set((x0 + x1) / 2, this.level + 0.05, LANE_FRONT - depth / 2);
    this.group.add(ring);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.tex) {
      this.tex.offset.x = this.t * 0.012;
      this.tex.offset.y = Math.sin(this.t * 0.4) * 0.01;
    }
    if (this.tex2) {
      this.tex2.offset.x = -this.t * 0.02;
      this.tex2.offset.y = this.t * 0.006;
    }
    this.foam.opacity = 0.6 + Math.sin(this.t * 2.2) * 0.18;
  }

  dispose(): void {
    this.tex?.dispose();
    this.tex2?.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
