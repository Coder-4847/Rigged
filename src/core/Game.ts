import * as THREE from 'three';
import { CONFIG, VEHICLES } from '../config';
import { InputManager } from './Input';
import { Loop } from './Loop';
import { DebugOverlay } from './DebugOverlay';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Car } from '../entities/Car';
import { Renderer } from '../render/Renderer';
import { CameraRig } from '../render/CameraRig';
import { DebugDraw } from '../render/DebugDraw';
import { buildTerrainMesh } from '../render/TerrainMesh';
import { sandboxTerrain } from '../levels/sandbox';

const SPAWN = { x: -20, y: 1.5 };

/** Phase 1 game shell: fixed-step physics, side camera, placeholder car on the sandbox track. */
export class Game {
  readonly input = new InputManager();
  readonly renderer: Renderer;
  readonly pw = new PhysicsWorld();
  readonly camRig: CameraRig;
  readonly debug: DebugDraw;
  readonly overlay: DebugOverlay;
  readonly loop: Loop;
  car!: Car;

  private chassisMesh = new THREE.Group();
  private wheelMeshes: THREE.Mesh[] = [];
  private tmp = { x: 0, y: 0, a: 0 };

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.camRig = new CameraRig(this.renderer.camera);
    this.debug = new DebugDraw(this.renderer.scene);
    this.overlay = new DebugOverlay(ui);
    this.buildWorld();
    this.spawnCar();
    this.loop = new Loop(
      (dt) => this.step(dt),
      (alpha, dt) => this.render(alpha, dt),
    );
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') (this.debug.toggle(), e.preventDefault());
      if (e.code === 'F2') (this.loop.timeScale = this.loop.timeScale === 1 ? 0.25 : 1, e.preventDefault());
      if (e.code === 'F3') (this.overlay.toggle(), e.preventDefault());
    });
    document.addEventListener('visibilitychange', () => {
      this.loop.paused = document.hidden;
    });
  }

  private buildWorld(): void {
    for (const line of sandboxTerrain()) {
      this.pw.addTerrain(line, 12);
      this.renderer.scene.add(buildTerrainMesh(line, 12, { dirt: 0x7a5a3c, top: 0x6fae4a, turf: 0.7 }));
    }
  }

  private spawnCar(): void {
    this.car?.destroy();
    this.car = new Car(this.pw, VEHICLES.hatch, SPAWN.x, SPAWN.y);
    const def = this.car.def;
    // Placeholder visuals (replaced by the full model in the car-feel phase).
    this.renderer.scene.remove(this.chassisMesh);
    this.chassisMesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(def.body.hx * 2, def.body.hy * 2, 1.8),
      new THREE.MeshStandardMaterial({ color: def.color }),
    );
    body.position.set(0, def.body.cy, 0);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(def.cabin.hx * 2, def.cabin.hy * 2, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x9ad0ea }),
    );
    cabin.position.set(def.cabin.cx, def.cabin.cy, 0);
    this.chassisMesh.add(body, cabin);
    this.renderer.scene.add(this.chassisMesh);
    for (const w of this.wheelMeshes) this.renderer.scene.remove(w);
    this.wheelMeshes = [0, 1].map(() => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(def.wheel.radius, def.wheel.radius, 0.5, 16).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x222831 }),
      );
      m.add(new THREE.Mesh(new THREE.BoxGeometry(def.wheel.radius * 1.6, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: 0xdddddd })));
      this.renderer.scene.add(m);
      return m;
    });
    this.camRig.snapTo({ x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, speedFrac: 0 });
  }

  start(): void {
    this.loop.start();
  }

  private step(dt: number): void {
    const input = this.input.poll();
    if (input.restart) {
      this.spawnCar();
      this.input.endFrame();
      return;
    }
    this.car.update(dt, input);
    this.pw.step(dt);
    this.input.endFrame();
  }

  private render(alpha: number, frameDt: number): void {
    const car = this.car;
    const t = this.tmp;
    car.tChassis.at(alpha, t);
    this.chassisMesh.position.set(t.x, t.y, 0);
    this.chassisMesh.rotation.z = t.a;
    for (let i = 0; i < 2; i++) {
      car.tWheels[i].at(alpha, t);
      this.wheelMeshes[i].position.set(t.x, t.y, 0);
      this.wheelMeshes[i].rotation.z = t.a;
    }
    const v = car.chassis.getLinearVelocity();
    this.camRig.update(
      frameDt,
      { x: car.x, y: car.y, vx: v.x, vy: v.y, speedFrac: Math.min(1, Math.abs(v.x) / car.def.motor.maxSpeed) },
      this.renderer.camera.aspect,
    );
    this.renderer.followSun(this.camRig.cx, this.camRig.cy);
    this.debug.update(this.pw.world);
    this.overlay.update(frameDt, [
      `speed ${car.forwardSpeed.toFixed(1)} m/s`,
      `grounded ${car.grounded} air ${car.airTime.toFixed(2)}`,
      `angle ${((car.chassis.getAngle() * 180) / Math.PI).toFixed(0)}°`,
      `bodies ${this.pw.world.getBodyCount()} step ${CONFIG.physics.dt.toFixed(4)}`,
      '[F1] physics  [F2] slow-mo  [F3] stats  [R] restart',
    ]);
    this.renderer.render();
  }
}
