import { CONFIG, VEHICLES } from '../config';
import { InputManager } from './Input';
import { Loop } from './Loop';
import { DebugOverlay } from './DebugOverlay';
import { AudioEngine } from './Audio';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Car } from '../entities/Car';
import { CarModel } from '../entities/CarModel';
import { Debris } from '../entities/Debris';
import { Renderer } from '../render/Renderer';
import { CameraRig } from '../render/CameraRig';
import { DebugDraw } from '../render/DebugDraw';
import { Particles } from '../render/Particles';
import { buildTerrainMesh } from '../render/TerrainMesh';
import { sandboxTerrain } from '../levels/sandbox';
import { Wipe } from '../ui/Wipe';

const SPAWN = { x: -20, y: 1.5 };

type Phase = 'playing' | 'crashed';

/** Game shell: fixed-step physics, car with full model + fx, crash/instant-retry flow. */
export class Game {
  readonly input = new InputManager();
  readonly audio = new AudioEngine();
  readonly renderer: Renderer;
  readonly pw = new PhysicsWorld();
  readonly camRig: CameraRig;
  readonly debug: DebugDraw;
  readonly overlay: DebugOverlay;
  readonly loop: Loop;
  readonly particles: Particles;
  readonly debris: Debris;
  readonly wipe: Wipe;
  car!: Car;
  model!: CarModel;

  phase: Phase = 'playing';
  deaths = 0;
  private crashTimer = 0;
  private wipeStarted = false;
  private devSlow = false;
  private slowBeat = 0;
  private time = 0;
  private lastPos = { x: SPAWN.x, y: SPAWN.y };
  private tmpC = { x: 0, y: 0, a: 0 };
  private tmpW = [
    { x: 0, y: 0, a: 0 },
    { x: 0, y: 0, a: 0 },
  ];
  // fx accumulators
  private dustAcc = [0, 0];
  private exhaustAcc = 0;
  private sparkAcc = 0;
  private lineAcc = 0;
  private lastInput = { brake: false, throttle: 0, tilt: 0 };

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.camRig = new CameraRig(this.renderer.camera);
    this.debug = new DebugDraw(this.renderer.scene);
    this.overlay = new DebugOverlay(ui);
    this.wipe = new Wipe(ui);
    this.particles = new Particles(this.renderer.scene);
    this.particles.density = CONFIG.quality[this.renderer.quality].particles;
    this.debris = new Debris(this.pw, this.renderer.scene);
    this.buildWorld();
    this.spawnCar();
    this.loop = new Loop(
      (dt) => this.step(dt),
      (alpha, dt) => this.render(alpha, dt),
    );

    const unlock = () => this.audio.unlock();
    this.input.keyboard.onAnyKey = unlock;
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') (this.debug.toggle(), e.preventDefault());
      if (e.code === 'F2') (this.devSlow = !this.devSlow, e.preventDefault());
      if (e.code === 'F3') (this.overlay.toggle(), e.preventDefault());
      if (e.code === 'F5' && e.shiftKey) return; // allow hard reload
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

  // ------------------------------------------------------------------ car lifecycle

  private spawnCar(): void {
    this.debris.clear();
    this.model?.dispose();
    if (this.car && !this.car.crashed) this.car.destroy();
    this.car = new Car(this.pw, VEHICLES.hatch, SPAWN.x, SPAWN.y, { antiFlip: 1 });
    this.model = new CarModel(this.car.def);
    this.renderer.scene.add(this.model.root);
    this.phase = 'playing';
    this.crashTimer = 0;
    this.wipeStarted = false;
    this.slowBeat = 0;
    this.lastPos = { x: SPAWN.x, y: SPAWN.y };
    this.camRig.snapTo({ x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, speedFrac: 0 });
  }

  /** Called after a physics step in which the car crashed (never inside a contact callback). */
  private onCrash(): void {
    const car = this.car;
    const chassis = this.tmpC;
    car.tChassis.at(1, chassis);
    const wheels = [this.tmpW[0], this.tmpW[1]];
    car.tWheels[0].at(1, wheels[0]);
    car.tWheels[1].at(1, wheels[1]);
    const v = car.chassis.getLinearVelocity();
    const w = car.chassis.getAngularVelocity();
    // Snapshot current poses (copy; `at` writes into reused objects).
    const cp = { ...chassis };
    const wp = [{ ...wheels[0] }, { ...wheels[1] }];
    car.destroy();
    this.debris.explode(this.model, cp, wp, { x: v.x, y: v.y }, w);
    this.phase = 'crashed';
    this.crashTimer = 0;
    this.wipeStarted = false;
    this.deaths++;
    this.lastPos = { x: cp.x, y: cp.y };
    this.camRig.addShake(0.85);
    this.audio.crash();
    this.audio.silenceEngine();
    navigator.vibrate?.([40, 30, 60]);
    // Burst of sparks, smoke and paint-coloured chips.
    this.particles.burst(26, cp.x, cp.y, { speed: 9, up: 3, life: 0.7, size: 0.2, color: [0xffd34a, 0xff9a2e, 0xffffff], gravity: 1, drag: 0.4 });
    this.particles.burst(14, cp.x, cp.y, { speed: 4, up: 1, life: 0.9, size: 0.45, color: [0x555b63, 0x3a3f46], gravity: -0.3, drag: 1.6 });
    this.particles.burst(12, cp.x, cp.y, { speed: 7, up: 2, life: 0.8, size: 0.28, color: this.car.def.color, gravity: 1, drag: 0.5 });
  }

  /** Instant retry. */
  restart(withWipe = true): void {
    this.spawnCar();
    this.particles.clear();
    if (withWipe) this.wipe.pulse();
  }

  start(): void {
    this.loop.start();
  }

  // ------------------------------------------------------------------ simulation

  private step(dt: number): void {
    const input = this.input.poll();
    if (input.restart) {
      this.restart();
      this.input.endFrame();
      return;
    }
    if (this.phase === 'playing') {
      this.car.update(dt, input);
      this.lastInput = { brake: input.brake > 0.05 && input.throttle < 0.05, throttle: input.throttle, tilt: input.tilt };
    }
    this.pw.step(dt);
    if (this.phase === 'playing' && this.car.crashed) this.onCrash();
    this.input.endFrame();
  }

  // ------------------------------------------------------------------ rendering

  private render(alpha: number, frameDt: number): void {
    this.time += frameDt;
    const phase = this.phase;

    // Crash -> wipe -> respawn timeline (wall-clock, independent of slow-mo).
    if (phase === 'crashed') {
      this.crashTimer += frameDt;
      if (!this.wipeStarted && this.crashTimer >= CONFIG.crash.wipeStart) {
        this.wipeStarted = true;
        this.wipe.cover(Math.max(60, (CONFIG.crash.respawnAt - CONFIG.crash.wipeStart) * 1000));
        this.audio.whoosh();
      }
      if (this.crashTimer >= CONFIG.crash.respawnAt) {
        this.restart(false);
        this.wipe.reveal(220);
      }
    }

    // Slow-mo beat after a big jump lands.
    if (this.slowBeat > 0) this.slowBeat -= frameDt;
    this.loop.timeScale = this.devSlow ? 0.25 : this.slowBeat > 0 ? 0.45 : 1;

    const car = this.car;
    const def = car.def;
    const c = this.tmpC;
    const w0 = this.tmpW[0];
    const w1 = this.tmpW[1];

    if (this.phase === 'playing') {
      car.tChassis.at(alpha, c);
      car.tWheels[0].at(alpha, w0);
      car.tWheels[1].at(alpha, w1);
      this.model.update(frameDt, c, [w0, w1], car.accel, this.lastInput.brake && car.forwardSpeed > 1);
      this.model.bobDriver(this.time, Math.min(1, Math.abs(car.forwardSpeed) / def.motor.maxSpeed));
      this.lastPos.x = c.x;
      this.lastPos.y = c.y;

      // Landing feedback.
      if (car.lastLanding > 0) {
        const imp = car.lastLanding;
        car.lastLanding = 0;
        this.model.landed(imp);
        this.audio.thump(imp);
        if (imp > CONFIG.fx.landingMin) this.camRig.addShake(Math.min(0.5, imp / 28));
        if (imp > CONFIG.fx.landingMin) navigator.vibrate?.(Math.min(40, 8 + imp * 2));
        for (let i = 0; i < 2; i++) {
          const w = i === 0 ? w0 : w1;
          this.particles.burst(Math.min(10, 3 + Math.round(imp / 2)), w.x, w.y - def.wheel.radius, {
            speed: 3 + imp * 0.3, up: 1.5, life: 0.5, size: 0.3, color: [0xd8c7a0, 0xc2ad80, 0x9bb86a], gravity: 0.3, drag: 1.2,
          });
        }
        if (car.lastAirTime > 0.9 && imp > 6) this.slowBeat = 0.28;
      }

      this.emitDriveFx(frameDt, c, w0, w1);

      this.audio.engine(
        Math.min(1, Math.abs(car.forwardSpeed) / def.motor.maxSpeed),
        this.lastInput.throttle,
        car.grounded,
        true,
      );
    }

    this.debris.update(alpha, frameDt);
    this.particles.update(frameDt);

    // Camera
    let vx = 0;
    let vy = 0;
    let speedFrac = 0;
    if (this.phase === 'playing') {
      const v = car.chassis.getLinearVelocity();
      vx = v.x;
      vy = v.y;
      speedFrac = Math.min(1, Math.abs(v.x) / def.motor.maxSpeed);
    }
    this.camRig.update(
      frameDt,
      { x: this.lastPos.x, y: this.lastPos.y, vx, vy, speedFrac },
      this.renderer.camera.aspect,
    );
    this.renderer.followSun(this.camRig.cx, this.camRig.cy);
    this.debug.update(this.pw.world);

    this.overlay.update(frameDt, [
      `speed ${this.phase === 'playing' ? car.forwardSpeed.toFixed(1) : '-'} m/s  deaths ${this.deaths}`,
      `grounded ${car.grounded} air ${car.airTime.toFixed(2)} inv ${car.invertedTime.toFixed(2)}`,
      `angle ${((car.chassis.getAngle() * 180) / Math.PI).toFixed(0)}°`,
      `bodies ${this.pw.world.getBodyCount()}  quality ${this.renderer.quality}`,
      '[F1] physics  [F2] slow-mo  [F3] stats  [R] restart',
    ]);
    this.renderer.render();
  }

  private emitDriveFx(dt: number, c: { x: number; y: number; a: number }, w0: { x: number; y: number }, w1: { x: number; y: number }): void {
    const car = this.car;
    const def = car.def;
    const speed = Math.abs(car.forwardSpeed);
    const P = this.particles;

    // Wheel dust: rate scales with speed and throttle (wheel-spin on launch kicks up more).
    const ws = [w0, w1];
    for (let i = 0; i < 2; i++) {
      if (car.wheelContacts[i] > 0 && (speed > 2 || this.lastInput.throttle > 0.5)) {
        this.dustAcc[i] += dt * (6 + speed * 1.5 + this.lastInput.throttle * 10);
        while (this.dustAcc[i] > 1) {
          this.dustAcc[i] -= 1;
          const dir = car.forwardSpeed >= 0 ? -1 : 1;
          P.emit({
            x: ws[i].x + (Math.random() - 0.5) * 0.4,
            y: ws[i].y - def.wheel.radius + 0.1,
            z: (Math.random() - 0.5) * 1.8,
            vx: dir * (1.5 + Math.random() * 2.5) + car.chassis.getLinearVelocity().x * 0.1,
            vy: 0.8 + Math.random() * 1.8,
            life: 0.45 + Math.random() * 0.25,
            size: 0.26 + Math.random() * 0.2,
            color: Math.random() < 0.5 ? 0xd8c7a0 : 0xbfa97a,
            gravity: -0.1,
            drag: 1.8,
            spin: (Math.random() - 0.5) * 8,
          });
        }
      }
    }

    // Sparks when the chassis scrapes terrain.
    if (car.scraping && speed > 2) {
      this.sparkAcc += dt * 70;
      while (this.sparkAcc > 1) {
        this.sparkAcc -= 1;
        P.emit({
          x: c.x + (Math.random() - 0.5) * 2.2,
          y: c.y - 0.45,
          vx: -car.forwardSpeed * 0.2 + (Math.random() - 0.5) * 4,
          vy: 1 + Math.random() * 4,
          life: 0.3 + Math.random() * 0.2,
          size: 0.1,
          color: Math.random() < 0.5 ? 0xffd34a : 0xff9a2e,
          gravity: 1,
          drag: 0.3,
        });
      }
    }

    // Exhaust puffs from the rear.
    const cos = Math.cos(c.a);
    const sin = Math.sin(c.a);
    const ex = -def.body.hx - 0.15;
    const ey = def.body.cy - 0.2;
    this.exhaustAcc += dt * (this.lastInput.throttle > 0.1 ? 18 : 5);
    while (this.exhaustAcc > 1) {
      this.exhaustAcc -= 1;
      P.emit({
        x: c.x + ex * cos - ey * sin,
        y: c.y + ex * sin + ey * cos,
        z: 0.45,
        vx: -cos * 2.5 - car.forwardSpeed * 0.15,
        vy: 0.5 + Math.random() * 0.8,
        life: 0.5,
        size: 0.17 + Math.random() * 0.1,
        color: this.lastInput.throttle > 0.1 ? 0x8a9099 : 0xb4bac2,
        gravity: -0.2,
        drag: 1.4,
        spin: (Math.random() - 0.5) * 6,
      });
    }

    // Speed lines streak past in front of the lane.
    if (speed > CONFIG.fx.speedLinesFrom) {
      this.lineAcc += dt * (speed - CONFIG.fx.speedLinesFrom) * 6;
      const halfW = this.camRig.viewW / 2;
      while (this.lineAcc > 1) {
        this.lineAcc -= 1;
        P.emit({
          x: this.camRig.cx + (Math.random() * 2 - 1) * halfW,
          y: this.camRig.cy + (Math.random() * 2 - 1) * (halfW / 1.8),
          z: 6 + Math.random() * 7,
          life: 0.35,
          size: 0.07,
          stretch: 45 + Math.random() * 50,
          color: 0xffffff,
          mode: 'pop',
        });
      }
    }
  }
}
