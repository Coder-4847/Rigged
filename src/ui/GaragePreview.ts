import * as THREE from 'three';
import { VEHICLES, VehicleId } from '../config';
import { CarModel } from '../entities/CarModel';

/**
 * Turntable preview for the garage: its own small WebGL renderer + scene (so the main game scene stays
 * untouched). Only animates while the garage is visible.
 */
export class GaragePreview {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 100);
  private turntable = new THREE.Group();
  private model?: CarModel;
  private raf = 0;
  private t = 0;
  private last = 0;
  private spin = true;
  private okGL = true;

  constructor(readonly canvas: HTMLCanvasElement) {
    try {
      this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      this.okGL = false;
      this.gl = undefined as never;
      return;
    }
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.shadowMap.enabled = true;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xdbeaff, 0x4a4036, 1.3));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(-6, 10, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -6;
    sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -6;
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.4, 40), new THREE.MeshStandardMaterial({ color: 0x3a4d66, roughness: 0.8 }));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.07, 8, 60).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb52e }));
    this.scene.add(floor, ring, this.turntable);
    this.camera.position.set(0, 3.1, 11);
    this.camera.lookAt(0, 0.9, 0);
  }

  setReducedMotion(r: boolean): void {
    this.spin = !r;
  }

  /** (Re)build the model for the chosen vehicle/colour/decal. */
  show(vehicle: VehicleId, color: number, decal: string): void {
    if (!this.okGL) return;
    if (this.model) {
      this.turntable.remove(this.model.root);
      this.model.dispose();
    }
    const def = VEHICLES[vehicle];
    this.model = new CarModel(def, color, decal);
    // Scale so every vehicle fills the stage similarly (the monster is much bigger than the mini).
    const height = def.cabin.cy + def.cabin.hy - (def.wheel.anchorY - def.wheel.radius);
    const size = Math.max(def.body.hx * 2 + 1.2, height * 1.9);
    this.turntable.scale.setScalar(Math.min(1.4, 5.2 / size));
    this.turntable.add(this.model.root);
    this.pose(0);
  }

  private pose(dt: number): void {
    if (!this.model) return;
    const d = this.model.def;
    const y0 = d.wheel.radius - d.wheel.anchorY;
    const spin = this.t * 2.5;
    this.model.update(
      dt,
      { x: 0, y: y0, a: 0 },
      [
        { x: d.wheel.rearX, y: y0 + d.wheel.anchorY, a: -spin },
        { x: d.wheel.frontX, y: y0 + d.wheel.anchorY, a: -spin },
      ],
      0,
      false,
    );
    this.model.bobDriver(this.t, 0.3);
  }

  start(): void {
    if (!this.okGL || this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      const r = this.canvas.getBoundingClientRect();
      const w = Math.max(2, Math.round(r.width));
      const h = Math.max(2, Math.round(r.height));
      if (this.canvas.width !== w * this.gl.getPixelRatio() || this.canvas.height !== h * this.gl.getPixelRatio()) {
        this.gl.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      if (this.spin) this.turntable.rotation.y = 0.55 + Math.sin(this.t * 0.5) * 0.0 + this.t * 0.45;
      else this.turntable.rotation.y = 0.55;
      this.pose(dt);
      this.gl.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
