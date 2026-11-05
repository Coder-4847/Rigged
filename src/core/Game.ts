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
import { LevelView } from '../render/LevelView';
import { LevelPhysics } from '../entities/LevelPhysics';
import { THEMES, WorldTheme } from '../levels/themes';
import { LEVEL_COUNT, getLevel, hasLevel } from '../levels/registry';
import type { LevelData } from '../levels/types';
import { Hud } from '../ui/Hud';
import { Wipe } from '../ui/Wipe';

type Phase = 'playing' | 'crashed' | 'finished';

const DEV = import.meta.env.DEV || location.search.includes('dev');

/** Game shell: fixed-step physics, car with full model + fx, crash/instant-retry flow. */
export class Game {
  readonly input = new InputManager();
  readonly audio = new AudioEngine();
  readonly renderer: Renderer;
  pw = new PhysicsWorld();
  readonly camRig: CameraRig;
  readonly debug: DebugDraw;
  readonly overlay: DebugOverlay;
  readonly loop: Loop;
  readonly particles: Particles;
  debris!: Debris;
  readonly wipe: Wipe;
  readonly hud: Hud;
  car!: Car;
  model!: CarModel;

  // --- level state ---
  data!: LevelData;
  theme!: WorldTheme;
  view?: LevelView;
  levelPhys!: LevelPhysics;
  levelTime = 0;
  private started = false;
  private cpIndex = -1;
  private respawnPoint = { x: 0, y: 0 };
  private banked = new Set<number>();
  private pending = new Set<number>();
  private finishTimer = 0;
  private finishFx = 0;
  private completeShown = false;
  private loading = false;

  phase: Phase = 'playing';
  deaths = 0;
  private crashTimer = 0;
  private wipeStarted = false;
  private devSlow = false;
  private slowBeat = 0;
  private time = 0;
  private lastPos = { x: 0, y: 0 };
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
    this.hud = new Hud(ui);
    this.wipe = new Wipe(ui);
    this.particles = new Particles(this.renderer.scene);
    this.particles.density = CONFIG.quality[this.renderer.quality].particles;
    const q = new URLSearchParams(location.search).get('level');
    this.loadLevel(q ? Number(q) : 1);
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
      if (DEV && e.code === 'BracketRight') this.goToLevel(this.data.id + 1);
      if (DEV && e.code === 'BracketLeft') this.goToLevel(this.data.id - 1);
      if (e.code === 'Enter' && this.hud.completeOpen) this.nextLevel();
    });
    document.addEventListener('visibilitychange', () => {
      this.loop.paused = document.hidden;
    });
  }

  // ------------------------------------------------------------------ level lifecycle

  /** Tear down the current level and build a new one (fresh physics world). */
  loadLevel(id: number): void {
    const data = getLevel(id);
    if (!data) return;
    this.view?.dispose();
    this.debris?.clear();
    this.model?.dispose();
    this.particles.clear();
    this.pw = new PhysicsWorld();
    this.debris = new Debris(this.pw, this.renderer.scene);
    this.data = data;
    this.theme = THEMES[data.world] ?? THEMES[1];
    this.levelPhys = new LevelPhysics(this.pw, data);
    this.view = new LevelView(this.renderer.scene, data, this.theme, this.levelPhys);
    this.camRig.bounds = data.cameraBounds;

    const th = this.theme;
    this.renderer.setSky(th.skyTop, th.skyHorizon);
    this.renderer.sun.color.set(th.sun);
    const dark = !!data.dark;
    this.renderer.hemi.intensity = dark ? 0.35 : 1.15;
    this.renderer.sun.intensity = dark ? 0.7 : 2.3;

    this.levelTime = 0;
    this.started = false;
    this.cpIndex = -1;
    this.banked.clear();
    this.pending.clear();
    this.deaths = 0;
    this.finishTimer = 0;
    this.completeShown = false;
    this.respawnPoint = { x: data.spawn[0], y: data.spawn[1] };
    this.hud.setLevel(data.id, data.name, data.checkpoints.length, th.accent, data.hint);
    this.spawnCar();
  }

  /** Slide-wipe transition to another level. */
  goToLevel(id: number): void {
    if (this.loading || !hasLevel(id)) return;
    this.loading = true;
    this.audio.whoosh();
    this.wipe.cover(180);
    setTimeout(() => {
      this.loadLevel(id);
      this.wipe.reveal(260);
      this.loading = false;
    }, 190);
  }

  nextLevel(): void {
    if (this.data.id < LEVEL_COUNT) this.goToLevel(this.data.id + 1);
  }

  private spawnCar(): void {
    this.debris.clear();
    this.model?.dispose();
    if (this.car && !this.car.crashed) this.car.destroy();
    const d = this.data;
    const { x, y } = this.respawnPoint;
    this.car = new Car(this.pw, VEHICLES[d.vehicle as 'hatch'] ?? VEHICLES.hatch, x, y, {
      antiFlip: d.antiFlip ?? 1,
      boostAllowed: !!d.boost,
    });
    this.model = new CarModel(this.car.def);
    this.model.setHeadlights(!!d.dark);
    this.renderer.scene.add(this.model.root);
    this.levelPhys.reset();
    this.phase = 'playing';
    this.crashTimer = 0;
    this.wipeStarted = false;
    this.slowBeat = 0;
    this.lastPos = { x, y };
    // Stars collected since the last checkpoint are lost on death.
    this.pending.clear();
    this.view?.stars.forEach((st, i) => {
      if (this.banked.has(i)) {
        st.collect();
        st.group.visible = false;
      } else st.restore();
    });
    this.hud.setStars(this.view!.stars.map((_, i) => this.banked.has(i)));
    this.camRig.snapTo({ x, y, vx: 0, vy: 0, speedFrac: 0 });
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
    const cp = { ...chassis };
    const wp = [{ ...wheels[0] }, { ...wheels[1] }];
    car.destroy();
    this.debris.explode(this.model, cp, wp, { x: v.x, y: v.y }, w);
    this.phase = 'crashed';
    this.crashTimer = 0;
    this.wipeStarted = false;
    this.deaths++;
    this.hud.setDeaths(this.deaths);
    this.lastPos = { x: cp.x, y: cp.y };
    this.camRig.addShake(0.85);
    this.audio.crash();
    this.audio.silenceEngine();
    navigator.vibrate?.([40, 30, 60]);
    this.particles.burst(26, cp.x, cp.y, { speed: 9, up: 3, life: 0.7, size: 0.2, color: [0xffd34a, 0xff9a2e, 0xffffff], gravity: 1, drag: 0.4 });
    this.particles.burst(14, cp.x, cp.y, { speed: 4, up: 1, life: 0.9, size: 0.45, color: [0x555b63, 0x3a3f46], gravity: -0.3, drag: 1.6 });
    this.particles.burst(12, cp.x, cp.y, { speed: 7, up: 2, life: 0.8, size: 0.28, color: car.def.color, gravity: 1, drag: 0.5 });
  }

  /** Instant retry from the last checkpoint (or the start, which also resets the clock). */
  restart(withWipe = true): void {
    if (this.cpIndex < 0) {
      this.levelTime = 0;
      this.started = false;
      this.banked.clear();
    }
    this.hud.hideComplete();
    this.completeShown = false;
    this.finishTimer = 0;
    this.spawnCar();
    this.particles.clear();
    if (withWipe) this.wipe.pulse();
  }

  /** Full restart from the very beginning (clears checkpoints). */
  restartLevel(): void {
    this.cpIndex = -1;
    this.respawnPoint = { x: this.data.spawn[0], y: this.data.spawn[1] };
    this.view?.flags.forEach((f) => f.reset(this.theme.accent));
    this.hud.setCheckpoints(0);
    this.deaths = 0;
    this.hud.setDeaths(0);
    this.restart();
  }

  private checkpointReached(i: number): void {
    this.cpIndex = i;
    const c = this.data.checkpoints[i];
    this.respawnPoint = { x: c[0], y: c[1] + 1.3 };
    this.pending.forEach((s) => this.banked.add(s));
    this.pending.clear();
    this.view!.flags[i].activate();
    this.hud.setCheckpoints(i + 1);
    this.audio.checkpoint();
    this.particles.burst(14, c[0], c[1] + 2.8, { speed: 5, up: 3, life: 0.8, size: 0.22, color: [0x4cd964, 0xffffff, 0xffe066], gravity: 0.6 });
    this.hud.showHint('Checkpoint!', 1200);
  }

  private collectStar(i: number): void {
    const st = this.view!.stars[i];
    st.collect();
    this.pending.add(i);
    this.audio.chime(this.pending.size - 1 + this.banked.size);
    this.particles.burst(16, st.x, st.y, { speed: 6, up: 1, life: 0.7, size: 0.2, color: [0xffd23a, 0xffffff, 0xffa800], gravity: 0.3, drag: 0.8 });
    const on = this.view!.stars.map((_, k) => this.banked.has(k) || this.pending.has(k));
    this.hud.setStars(on);
    navigator.vibrate?.(10);
  }

  private onFinish(): void {
    this.phase = 'finished';
    this.finishTimer = 0;
    this.finishFx = 1.1;
    this.pending.forEach((s) => this.banked.add(s));
    this.pending.clear();
    this.audio.fanfare();
    this.audio.silenceEngine();
    this.slowBeat = 0.45;
    this.camRig.addShake(0.25);
    navigator.vibrate?.([30, 40, 30, 40, 90]);
  }

  private confetti(): void {
    const [fx, fy] = this.data.finish;
    const colors = [0xffd23a, 0xff5a8a, 0x4cd0ff, 0x7dff7a, 0xffffff, this.theme.accent];
    for (const side of [-1, 1]) {
      this.particles.burst(36, fx, fy + 7, {
        speed: 11, up: 8, life: 1.6, size: 0.32, color: colors, gravity: 0.7, drag: 0.7, z: side * 3,
      });
    }
  }

  start(): void {
    this.loop.start();
  }

  // ------------------------------------------------------------------ simulation

  private step(dt: number): void {
    if (this.loading) {
      this.input.poll();
      this.input.endFrame();
      return;
    }
    const input = this.input.poll();
    if (input.restart) {
      if (this.hud.completeOpen) this.restartLevel();
      else this.restart();
      this.input.endFrame();
      return;
    }
    const playing = this.phase === 'playing';
    if (this.phase !== 'crashed') {
      // After the finish the car just coasts to a gentle stop.
      const drive = playing ? input : { ...input, throttle: 0, brake: 0.45, tilt: 0, boost: false };
      this.car.update(dt, drive);
      this.lastInput = { brake: drive.brake > 0.05 && drive.throttle < 0.05, throttle: drive.throttle, tilt: drive.tilt };
    }
    if (playing) {
      if (!this.started && (input.throttle > 0.05 || input.brake > 0.05)) this.started = true;
      if (this.started) this.levelTime += dt;
    }
    this.levelPhys.update(dt);
    this.pw.step(dt);

    if (this.phase === 'playing') {
      if (this.car.crashed) this.onCrash();
      else this.checkTriggers();
    }
    this.input.endFrame();
  }

  /** Stars, checkpoints and the finish line (cheap proximity tests at the physics rate). */
  private checkTriggers(): void {
    const p = this.car.chassis.getPosition();
    const stars = this.data.stars;
    for (let i = 0; i < stars.length; i++) {
      if (this.banked.has(i) || this.pending.has(i)) continue;
      if (Math.hypot(p.x - stars[i][0], p.y - stars[i][1]) < 1.9) this.collectStar(i);
    }
    const cps = this.data.checkpoints;
    for (let i = this.cpIndex + 1; i < cps.length; i++) {
      if (p.x > cps[i][0]) this.checkpointReached(i);
      else break;
    }
    if (p.x > this.data.finish[0]) this.onFinish();
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

    // Finish: confetti stream, then the complete card.
    if (this.phase === 'finished') {
      this.finishTimer += frameDt;
      if (this.finishFx > 0) {
        this.finishFx -= frameDt;
        this.confetti();
      }
      if (!this.completeShown && this.finishTimer > 1.35) {
        this.completeShown = true;
        const total = this.view!.stars.filter((_, i) => this.banked.has(i)).length;
        this.hud.showComplete(
          {
            time: this.levelTime,
            par: this.data.parTime,
            stars: total,
            deaths: this.deaths,
            hasNext: this.data.id < LEVEL_COUNT,
            name: this.data.name,
            newBest: false,
          },
          () => this.nextLevel(),
          () => this.restartLevel(),
        );
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

    if (this.phase !== 'crashed') {
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
            speed: 3 + imp * 0.3, up: 1.5, life: 0.5, size: 0.3, color: this.theme.dust, gravity: 0.3, drag: 1.2,
          });
        }
        if (car.lastAirTime > 0.9 && imp > 6) this.slowBeat = 0.28;
      }

      this.emitDriveFx(frameDt, c, w0, w1);

      if (this.phase === 'playing') {
        this.audio.engine(
          Math.min(1, Math.abs(car.forwardSpeed) / def.motor.maxSpeed),
          this.lastInput.throttle,
          car.grounded,
          true,
        );
      }
    }

    this.debris.update(alpha, frameDt);
    this.particles.update(frameDt);

    // Camera
    let vx = 0;
    let vy = 0;
    let speedFrac = 0;
    if (this.phase !== 'crashed') {
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
    this.view?.update(alpha, frameDt, this.camRig.cx, this.camRig.cy);
    if (this.phase === 'playing' && this.started) this.hud.setTime(this.levelTime);
    this.debug.update(this.pw.world);

    this.overlay.update(frameDt, [
      `speed ${this.phase === 'playing' ? car.forwardSpeed.toFixed(1) : '-'} m/s  deaths ${this.deaths}`,
      `grounded ${car.grounded} air ${car.airTime.toFixed(2)} inv ${car.invertedTime.toFixed(2)}`,
      `angle ${((car.chassis.getAngle() * 180) / Math.PI).toFixed(0)}°`,
      `bodies ${this.pw.world.getBodyCount()}  quality ${this.renderer.quality}`,
      `level ${this.data.id} · cp ${this.cpIndex + 1}/${this.data.checkpoints.length} · t ${this.levelTime.toFixed(1)}`,
      '[F1] physics  [F2] slow-mo  [F3] stats  [R] restart  [ ] ] level',
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
            color: this.theme.dust[Math.random() < 0.5 ? 0 : 1],
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
