import { CONFIG, VEHICLES, VehicleId, scaleVehicle } from '../config';
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
import type { HazardEvent } from '../entities/hazards/core';
import { Laser } from '../entities/hazards/beams';
import { Saw } from '../entities/hazards/movers';
import { THEMES, WorldTheme } from '../levels/themes';
import { getLevel, hasLevel } from '../levels/registry';
import type { LevelData } from '../levels/types';
import { Vec2 } from 'planck';
import { Hud } from '../ui/Hud';
import { Autopilot } from './Autopilot';
import type { TrackId } from './music/tracks';
import { popcount, Settings } from './Save';
import { Wipe } from '../ui/Wipe';

type Phase = 'playing' | 'crashed' | 'finished';

export interface CompleteResult {
  id: number;
  name: string;
  time: number;
  par: number;
  starMask: number;
  stars: number;
  deaths: number;
}

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
  /** Vehicle size multiplier from transform pads (kept across checkpoints). */
  private carScale = 1;
  private cpScale = 1;
  /** Player's garage pick (used unless the level forces a vehicle). */
  garage: { vehicle: VehicleId; color: number; decal: string } = { vehicle: 'hatch', color: 0xe8553a, decal: 'none' };
  /** Garage selection the current car was built with. */
  private builtWith = '';
  /** Vehicle currently driven (a level can force one; transform pads can swap it mid-level). */
  private curVehicle: VehicleId = 'hatch';
  private cpVehicle: VehicleId = 'hatch';

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

  /** 'attract' = AI drives behind the menus; 'play' = the player is in control. */
  mode: 'attract' | 'play' = 'attract';
  paused = false;
  private pilot?: Autopilot;
  private pilotInput = { throttle: 0, brake: 0, tilt: 0, boost: false, restart: false, pause: false };
  /** Fired when a level is cleared (play mode). */
  onComplete?: (r: CompleteResult) => void;
  /** Fired when the pause key is pressed during play. */
  onPauseRequest?: () => void;
  /** Fired once per level after many deaths in a row (suggests trying another vehicle). */
  onStuck?: () => void;
  private stuckShown = false;
  /** Fired when auto-quality lowers the graphics setting. */
  onQualityDrop?: (q: string) => void;
  private shakeOn = true;
  private reduced = false;
  autoQuality = true;
  private slowFrames = 0;
  private qualityCool = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.camRig = new CameraRig(this.renderer.camera);
    this.debug = new DebugDraw(this.renderer.scene);
    this.overlay = new DebugOverlay(ui);
    this.hud = new Hud(ui);
    this.wipe = new Wipe(ui);
    this.particles = new Particles(this.renderer.scene);
    this.particles.density = CONFIG.quality[this.renderer.quality].particles;
    this.loop = new Loop(
      (dt) => this.step(dt),
      (alpha, dt) => this.render(alpha, dt),
    );

    const unlock = () => this.audio.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') (this.debug.toggle(), e.preventDefault());
      if (e.code === 'F2') (this.devSlow = !this.devSlow, e.preventDefault());
      if (e.code === 'F3') (this.overlay.toggle(), e.preventDefault());
      if (DEV && e.code === 'BracketRight') this.goToLevel(this.data.id + 1);
      if (DEV && e.code === 'BracketLeft') this.goToLevel(this.data.id - 1);
    });
    document.addEventListener('visibilitychange', () => {
      this.loop.paused = document.hidden || this.paused;
      if (document.hidden && this.mode === 'play' && !this.paused) this.onPauseRequest?.();
    });
    window.addEventListener('blur', () => {
      if (this.mode === 'play' && !this.paused) this.onPauseRequest?.();
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
    this.pilot = new Autopilot(data);
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
    this.stuckShown = false;
    this.carScale = 1;
    this.cpScale = 1;
    this.curVehicle = data.vehicle ?? this.garage.vehicle;
    this.cpVehicle = this.curVehicle;
    if (this.mode === 'play') this.audio.playMusic(data.world as TrackId);
    this.hud.setLevel(data.id, data.name, data.checkpoints.length, th.accent, data.vehicle ? `Vehicle: ${VEHICLES[data.vehicle].name}${data.hint ? ' · ' + data.hint : ''}` : data.hint);
    this.spawnCar();
  }

  /** Dev shortcut: wipe-transition to another level. */
  goToLevel(id: number): void {
    if (this.loading || this.mode !== 'play') return;
    this.startPlay(id);
  }

  private spawnCar(): void {
    this.debris.clear();
    this.model?.dispose();
    if (this.car && !this.car.crashed) this.car.destroy();
    const d = this.data;
    const { x, y } = this.respawnPoint;
    this.carScale = this.cpIndex < 0 ? 1 : this.cpScale;
    this.curVehicle = this.cpIndex < 0 ? (d.vehicle ?? this.garage.vehicle) : this.cpVehicle;
    this.buildCar(x, y);
    this.levelPhys.reset();
    this.levelPhys.setCar(this.car);
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

  /** Create the car + model at a pose, honouring the current transform-pad scale. */
  private buildCar(x: number, y: number, vel?: { x: number; y: number }): void {
    const d = this.data;
    const base = VEHICLES[this.curVehicle];
    this.car = new Car(this.pw, scaleVehicle(base, this.carScale), x, y, { antiFlip: d.antiFlip ?? 1, boostAllowed: !!d.boost });
    if (vel) for (const b of [this.car.chassis, this.car.wheels[0], this.car.wheels[1]]) b.setLinearVelocity(new Vec2(vel.x, vel.y));
    this.builtWith = `${this.garage.vehicle}|${this.garage.color}|${this.garage.decal}`;
    this.model = new CarModel(base, this.garage.color, this.garage.decal);
    this.model.setScale(this.carScale);
    this.model.setHeadlights(!!d.dark);
    this.renderer.scene.add(this.model.root);
  }

  /** Transform pad: rebuild the car at its current spot with a new size, keeping momentum. */
  private applyTransform(scale: number, vehicleReq?: string): void {
    const vehicle = vehicleReq === 'garage' ? (this.data.vehicle ?? this.garage.vehicle) : vehicleReq;
    const swap = !!vehicle && vehicle !== this.curVehicle && vehicle in VEHICLES;
    if (this.phase !== 'playing' || (scale === this.carScale && !swap)) return;
    const old = this.car;
    const p = old.chassis.getPosition();
    const v = old.chassis.getLinearVelocity();
    const lift = swap ? 0.8 : (scale - this.carScale) * 0.6;
    const pos = { x: p.x, y: p.y + Math.max(0, lift) + 0.1 };
    old.destroy();
    this.model.dispose();
    this.carScale = scale;
    if (swap) this.curVehicle = vehicle as VehicleId;
    this.buildCar(pos.x, pos.y, { x: v.x, y: Math.max(0, v.y) });
    this.levelPhys.setCar(this.car);
    this.camRig.addShake(0.2);
    this.particles.burst(24, p.x, p.y, { speed: 7, up: 2, life: 0.8, size: 0.25, color: scale > 1 ? [0xffa23a, 0xffe066, 0xffffff] : [0x4ad8ff, 0xaaf0ff, 0xffffff], gravity: 0.2, drag: 1 });
  }

  /** Turn level events into sound, particles and shake (volume falls off with distance to the car). */
  private handleEvents(): void {
    const evs = this.levelPhys.drain();
    if (this.levelPhys.pendingTransform) {
      const t = this.levelPhys.pendingTransform;
      this.levelPhys.pendingTransform = null;
      this.applyTransform(t.scale, t.vehicle);
    }
    if (!evs.length) return;
    const cx = this.lastPos.x;
    const cy = this.lastPos.y;
    for (const e of evs) this.reactTo(e, cx, cy);
  }

  private reactTo(e: HazardEvent, cx: number, cy: number): void {
    const dist = Math.hypot(e.x - cx, e.y - cy);
    const vol = Math.pow(Math.max(0, 1 - dist / 48), 1.6);
    if (this.mode === 'play') this.audio.hazard(e.kind, vol);
    const P = this.particles;
    const dust = this.theme.dust;
    switch (e.kind) {
      case 'crusher-slam':
        this.camRig.addShake(0.5 * vol);
        P.burst(14, e.x, e.y, { speed: 6, up: 1.5, life: 0.6, size: 0.35, color: dust, gravity: 0.2, drag: 1.2 });
        break;
      case 'explosion':
        this.camRig.addShake(0.9 * vol);
        P.burst(40, e.x, e.y, { speed: 14, up: 4, life: 0.8, size: 0.4, color: [0xffd34a, 0xff7a2e, 0xff4a1e, 0x333333], gravity: 0.5, drag: 0.8 });
        this.buzz(vol > 0.3 ? 60 : 0);
        break;
      case 'fall-hit':
        this.camRig.addShake(0.3 * vol);
        P.burst(12, e.x, e.y + 0.3, { speed: 5, up: 2, life: 0.6, size: 0.3, color: dust, gravity: 0.4, drag: 1 });
        break;
      case 'crumble':
        P.burst(8, e.x, e.y, { speed: 3, up: 0.5, life: 0.7, size: 0.28, color: dust, gravity: 0.6, drag: 1 });
        break;
      case 'bounce':
        P.burst(12, e.x, e.y + 0.4, { speed: 5, up: 1, life: 0.5, size: 0.22, color: [0xff4fa3, 0xffffff], gravity: 0.2, drag: 1.2 });
        break;
      case 'cannon':
        this.camRig.addShake(0.45 * vol);
        P.burst(22, e.x, e.y, { speed: 9, up: 2, life: 0.7, size: 0.4, color: [0x555b63, 0xffb52e, 0xffffff], gravity: -0.1, drag: 1.4 });
        break;
      case 'boost':
        P.burst(10, e.x, e.y - 0.5, { speed: 6, up: 0, life: 0.4, size: 0.16, color: [0xffe066, 0xffffff], gravity: 0, drag: 0.6 });
        break;
      case 'laser-zap':
        P.burst(18, e.x, e.y, { speed: 9, up: 1, life: 0.4, size: 0.14, color: [this.theme.hazard, 0xffffff], gravity: 0.2, drag: 1 });
        break;
      case 'switch':
        P.burst(10, e.x, e.y + 0.4, { speed: 4, up: 1, life: 0.5, size: 0.18, color: [0x4cd964, 0xffffff], gravity: 0.2, drag: 1.2 });
        break;
      case 'boulder':
        P.burst(10, e.x, e.y, { speed: 4, up: 1, life: 0.8, size: 0.4, color: dust, gravity: 0.2, drag: 1 });
        break;
    }
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
    if (this.deaths >= 10 && !this.stuckShown && this.mode === 'play') {
      this.stuckShown = true;
      this.onStuck?.();
    }
    this.lastPos = { x: cp.x, y: cp.y };
    this.camRig.addShake(0.85);
    if (this.mode === 'play') {
      this.audio.crash();
      this.audio.duckMusic(0.8, 0.3);
    }
    this.audio.silenceEngine();
    this.buzz([40, 30, 60]);
    this.particles.burst(26, cp.x, cp.y, { speed: 9, up: 3, life: 0.7, size: 0.2, color: [0xffd34a, 0xff9a2e, 0xffffff], gravity: 1, drag: 0.4 });
    this.particles.burst(14, cp.x, cp.y, { speed: 4, up: 1, life: 0.9, size: 0.45, color: [0x555b63, 0x3a3f46], gravity: -0.3, drag: 1.6 });
    this.particles.burst(12, cp.x, cp.y, { speed: 7, up: 2, life: 0.8, size: 0.28, color: car.def.color, gravity: 1, drag: 0.5 });
  }

  /** True if the garage choice differs from the car on the track (and the level doesn't force one). */
  garageChanged(): boolean {
    return this.builtWith !== `${this.garage.vehicle}|${this.garage.color}|${this.garage.decal}`;
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
    this.cpScale = 1;
    this.cpVehicle = this.data.vehicle ?? this.garage.vehicle;
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
    this.cpScale = this.carScale;
    this.cpVehicle = this.curVehicle;
    this.pending.forEach((s) => this.banked.add(s));
    this.pending.clear();
    this.view!.flags[i].activate();
    this.hud.setCheckpoints(i + 1);
    if (this.mode === 'play') this.audio.checkpoint();
    this.particles.burst(14, c[0], c[1] + 2.8, { speed: 5, up: 3, life: 0.8, size: 0.22, color: [0x4cd964, 0xffffff, 0xffe066], gravity: 0.6 });
    this.hud.showHint('Checkpoint!', 1200);
  }

  private collectStar(i: number): void {
    const st = this.view!.stars[i];
    st.collect();
    this.pending.add(i);
    if (this.mode === 'play') this.audio.chime(this.pending.size - 1 + this.banked.size);
    this.particles.burst(16, st.x, st.y, { speed: 6, up: 1, life: 0.7, size: 0.2, color: [0xffd23a, 0xffffff, 0xffa800], gravity: 0.3, drag: 0.8 });
    const on = this.view!.stars.map((_, k) => this.banked.has(k) || this.pending.has(k));
    this.hud.setStars(on);
    this.buzz(10);
  }

  private onFinish(): void {
    this.phase = 'finished';
    this.finishTimer = 0;
    this.finishFx = 1.1;
    this.pending.forEach((s) => this.banked.add(s));
    this.pending.clear();
    if (this.mode === 'play') {
      this.audio.fanfare();
      this.audio.duckMusic(2.4, 0.22);
    }
    this.audio.silenceEngine();
    this.slowBeat = 0.45;
    this.camRig.addShake(0.25);
    this.buzz([30, 40, 30, 40, 90]);
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

  /** Haptics only while actually playing. */
  private buzz(p: number | number[]): void {
    if (this.mode !== 'play' || this.reduced) return;
    const ms = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
    if (this.input.lastDevice === 'gamepad') {
      // Map the vibration pattern to a dual-rumble pulse: longer = stronger.
      const k = Math.min(1, ms / 140);
      this.input.gamepad.rumble(0.25 + k * 0.75, 0.15 + k * 0.6, Math.min(450, 60 + ms * 2));
    } else if (this.input.lastDevice === 'touch') navigator.vibrate?.(p);
  }

  /** Menus: run the AI on a level behind the UI. */
  startAttract(id: number): void {
    this.mode = 'attract';
    this.paused = false;
    this.loop.paused = document.hidden;
    this.audio.silenceEngine();
    this.audio.ambient(0, 0);
    this.audio.muffleMusic(false);
    this.audio.playMusic('menu');
    this.loadLevel(hasLevel(id) ? id : 1);
    this.hud.setVisible(false);
    this.camRig.snapTo({ x: this.data.spawn[0], y: this.data.spawn[1], vx: 0, vy: 0, speedFrac: 0 });
  }

  /** Start (or restart) a level for the player. */
  startPlay(id: number, withWipe = true): void {
    if (!hasLevel(id)) return;
    const go = () => {
      this.mode = 'play';
      this.paused = false;
      this.loop.paused = document.hidden;
      this.loadLevel(id);
      this.hud.setVisible(true);
    };
    if (!withWipe) return go();
    this.loading = true;
    this.audio.whoosh();
    this.wipe.cover(this.reduced ? 80 : 170);
    setTimeout(() => {
      go();
      this.wipe.reveal(this.reduced ? 120 : 260);
      this.loading = false;
    }, this.reduced ? 90 : 180);
  }

  /** Attract mode: when the AI clears a level, pick the next so the backdrop keeps changing. */
  private attractCycle(): void {
    const next = this.data.id + 1;
    this.loadLevel(hasLevel(next) && next < 900 && next <= this.attractMax ? next : this.attractMin);
  }
  attractMin = 1;
  attractMax = 1;

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.loop.paused = true;
    this.audio.muffleMusic(true);
    this.audio.silenceEngine();
    this.audio.ambient(0, 0);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.loop.paused = document.hidden;
    this.audio.muffleMusic(false);
  }

  /** Apply user settings (called on boot and whenever they change). */
  applySettings(s: Settings): void {
    this.audio.setVolumes({ master: s.master, sfx: s.sfx, music: s.music });
    this.audio.setMuted(s.muted);
    this.shakeOn = s.shake;
    this.input.gamepad.rumbleEnabled = s.rumble && !s.reducedMotion;
    this.reduced = s.reducedMotion;
    document.documentElement.classList.toggle('reduce-motion', s.reducedMotion);
    this.autoQuality = s.quality === 'auto';
    const q = s.quality === 'auto' ? (this.renderer.quality === 'low' && !this.autoQuality ? 'low' : this.autoQualityStart(s)) : s.quality;
    if (q !== this.renderer.quality) this.setQuality(q);
    this.input.keyboard.bindings = structuredClone(s.bindings);
  }

  private autoQualityStart(s: Settings): 'low' | 'med' | 'high' {
    if (s.quality !== 'auto') return s.quality;
    // Phones/tablets and weak GPUs start lower; the FPS watchdog drops further if needed.
    const coarse = matchMedia('(pointer: coarse)').matches;
    return coarse ? 'low' : this.renderer.quality === 'high' ? 'high' : 'med';
  }

  setQuality(q: 'low' | 'med' | 'high'): void {
    this.renderer.setQuality(q);
    this.particles.density = CONFIG.quality[q].particles;
  }

  /** Auto-quality: if frames stay slow for ~3 s, step graphics down once and tell the player. */
  private watchPerformance(frameDt: number): void {
    this.qualityCool -= frameDt;
    if (!this.autoQuality || this.qualityCool > 0 || this.renderer.quality === 'low') return;
    this.slowFrames = frameDt > 1 / 36 ? this.slowFrames + frameDt : Math.max(0, this.slowFrames - frameDt * 2);
    if (this.slowFrames > 3) {
      this.slowFrames = 0;
      this.qualityCool = 8;
      const next = this.renderer.quality === 'high' ? 'med' : 'low';
      this.setQuality(next);
      this.onQualityDrop?.(next);
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
    if (this.paused) {
      this.input.endFrame();
      return;
    }
    let input = this.input.poll();
    if (this.mode === 'attract') {
      // AI drives behind the menus; player input is ignored.
      if (this.phase === 'playing' && this.car) this.pilot!.drive(this.car, dt, this.pilotInput, this.levelPhys);
      else {
        this.pilotInput.throttle = 0;
        this.pilotInput.brake = 0.4;
      }
      input = this.pilotInput;
    } else {
      if (input.pause && !this.hud.completeOpen && this.phase !== 'finished') {
        this.onPauseRequest?.();
        this.input.endFrame();
        return;
      }
      if (input.restart) {
        if (this.hud.completeOpen) this.restartLevel();
        else this.restart();
        this.input.endFrame();
        return;
      }
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
    this.handleEvents();

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
    if (this.paused) {
      this.renderer.render();
      return;
    }
    this.time += frameDt;
    const phase = this.phase;
    this.watchPerformance(frameDt);

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
      if (!this.completeShown && this.finishTimer > (this.mode === 'attract' ? 1.0 : 1.35)) {
        this.completeShown = true;
        if (this.mode === 'attract') {
          this.attractCycle();
        } else {
          let mask = 0;
          this.view!.stars.forEach((_, i) => {
            if (this.banked.has(i)) mask |= 1 << i;
          });
          this.onComplete?.({
            id: this.data.id,
            name: this.data.name,
            time: this.levelTime,
            par: this.data.parTime,
            starMask: mask,
            stars: popcount(mask),
            deaths: this.deaths,
          });
        }
      }
    }

    // Slow-mo beat after a big jump lands.
    if (this.slowBeat > 0) this.slowBeat -= frameDt;
    this.loop.timeScale = this.devSlow ? 0.25 : this.slowBeat > 0 && !this.reduced ? 0.45 : 1;

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
        if (this.mode === 'play') this.audio.thump(imp);
        if (imp > CONFIG.fx.landingMin) this.camRig.addShake(Math.min(0.5, imp / 28));
        if (imp > CONFIG.fx.landingMin) this.buzz(Math.min(40, 8 + imp * 2));
        for (let i = 0; i < 2; i++) {
          const w = i === 0 ? w0 : w1;
          this.particles.burst(Math.min(10, 3 + Math.round(imp / 2)), w.x, w.y - def.wheel.radius, {
            speed: 3 + imp * 0.3, up: 1.5, life: 0.5, size: 0.3, color: this.theme.dust, gravity: 0.3, drag: 1.2,
          });
        }
        if (car.lastAirTime > 0.9 && imp > 6) this.slowBeat = 0.28;
      }

      this.emitDriveFx(frameDt, c, w0, w1);

      if (this.phase === 'playing' && this.mode === 'play') {
        this.audio.engine(
          Math.min(1, Math.abs(car.forwardSpeed) / def.motor.maxSpeed),
          this.lastInput.throttle,
          car.grounded,
          true,
        );
      }
    }

    if (this.phase === 'playing' && this.mode === 'play') this.updateAmbient();
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
      this.shakeOn && !this.reduced,
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

  /** Laser hum / saw whir get louder as you approach the nearest active one. */
  private updateAmbient(): void {
    const px = this.lastPos.x;
    const py = this.lastPos.y;
    let laser = 0;
    let saw = 0;
    for (const b of this.levelPhys.behaviors) {
      if (b instanceof Laser && b.isOn) {
        for (const s of b.segs) {
          // distance from the car to the beam segment
          const dx = s.x1 - s.x0;
          const dy = s.y1 - s.y0;
          const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
          const d = Math.hypot(px - (s.x0 + dx * t), py - (s.y0 + dy * t));
          laser = Math.max(laser, Math.pow(Math.max(0, 1 - d / 22), 1.5));
        }
      } else if (b instanceof Saw) {
        const p = b.body.getPosition();
        saw = Math.max(saw, Math.pow(Math.max(0, 1 - Math.hypot(px - p.x, py - p.y) / 24), 1.5));
      }
    }
    this.audio.ambient(laser, saw, this.time);
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
    if (speed > CONFIG.fx.speedLinesFrom && !this.reduced) {
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
