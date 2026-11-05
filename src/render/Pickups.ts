import * as THREE from 'three';
import { CONFIG } from '../config';

const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0xffa800, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.4 });

function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const R = 0.75;
  const r = 0.33;
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2 });
  g.translate(0, 0, -0.15);
  return g;
}
const STAR_GEO = starGeometry();

/** A collectible star: bobs, spins, and pops when collected. */
export class StarView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  collected = false;
  private pop = 0;
  /** Faded "ghost" look for stars already banked from a previous attempt. */
  private ghost = false;

  constructor(
    readonly x: number,
    readonly y: number,
    private phase: number,
  ) {
    this.mesh = new THREE.Mesh(STAR_GEO, goldMat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.group.position.set(x, y, 0);
    this.group.scale.setScalar(1.35);
  }

  collect(): void {
    this.collected = true;
    this.pop = 0.0001;
  }

  /** Put it back (respawn before a checkpoint). */
  restore(): void {
    this.collected = false;
    this.pop = 0;
    this.group.visible = true;
    this.group.scale.setScalar(1.35);
  }

  setGhost(g: boolean): void {
    this.ghost = g;
  }

  update(dt: number, t: number): void {
    if (this.collected) {
      if (this.pop > 0) {
        this.pop += dt * 3.2;
        const k = Math.max(0, 1 - this.pop);
        this.group.scale.setScalar(1.35 * (1 + this.pop * 0.9) * k);
        this.group.position.y = this.y + this.pop * 1.4;
        this.mesh.rotation.y += dt * 14;
        if (k <= 0) this.group.visible = false;
      }
      return;
    }
    this.group.position.y = this.y + Math.sin(t * 2.4 + this.phase) * 0.22;
    this.mesh.rotation.y = t * 1.8 + this.phase;
    goldMat.emissiveIntensity = 0.55 + Math.sin(t * 4) * 0.12;
    this.group.visible = true;
    if (this.ghost) this.group.scale.setScalar(1.15);
  }
}

/** Checkpoint flag: pulses until activated, then turns green. */
export class FlagView {
  readonly group = new THREE.Group();
  private flag: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  active = false;
  private pulse = 0;

  constructor(
    readonly x: number,
    readonly y: number,
    accent: number,
  ) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.4 }));
    pole.position.y = 1.6;
    pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), new THREE.MeshStandardMaterial({ color: 0x555b66 }));
    base.position.y = 0.15;
    this.mat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.5, roughness: 0.5, side: THREE.DoubleSide });
    this.flag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.1), this.mat);
    this.flag.position.set(0.8, 2.7, 0);
    this.flag.castShadow = true;
    this.group.add(pole, base, this.flag);
    this.group.position.set(x, y, 0);
  }

  activate(): void {
    this.active = true;
    this.pulse = 1;
    this.mat.color.set(0x4cd964);
    this.mat.emissive.set(0x1f9c3a);
  }

  reset(accent: number): void {
    this.active = false;
    this.mat.color.set(accent);
    this.mat.emissive.set(accent);
  }

  update(dt: number, t: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    this.flag.rotation.y = Math.sin(t * 3 + this.x) * 0.18;
    this.flag.scale.set(1 + this.pulse * 0.4, 1 + this.pulse * 0.4, 1);
    this.mat.emissiveIntensity = this.active ? 0.4 : 0.5 + Math.sin(t * 4 + this.x) * 0.35;
  }
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#ffffff' : '#1c2430';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Finish gate: two checkered pillars and a banner spanning the lane. */
export class FinishView {
  readonly group = new THREE.Group();
  private banner: THREE.Mesh;

  constructor(x: number, y: number) {
    const tex = checkerTexture();
    const pillarTex = tex.clone();
    pillarTex.repeat.set(1, 3);
    pillarTex.needsUpdate = true;
    const pillarMat = new THREE.MeshStandardMaterial({ map: pillarTex, roughness: 0.6 });
    const z = CONFIG.render.laneDepth / 2 + 0.4;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7, 0.9), pillarMat);
      p.position.set(0, 3.5, s * z);
      p.castShadow = true;
      this.group.add(p);
    }
    const bannerTex = tex.clone();
    bannerTex.repeat.set(10, 1.5);
    bannerTex.needsUpdate = true;
    this.banner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, z * 2), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }));
    this.banner.position.set(0, 7, 0);
    this.banner.castShadow = true;
    this.group.add(this.banner);
    // glowing strip on the ground so the line is readable from far away
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, z * 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    strip.position.set(0, 0.05, 0);
    this.group.add(strip);
    this.group.position.set(x, y, 0);
  }

  update(t: number): void {
    this.banner.position.y = 7 + Math.sin(t * 2) * 0.08;
  }
}
