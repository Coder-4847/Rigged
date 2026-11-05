import { Body, Box, RevoluteJoint, Vec2 } from 'planck';
import { Cat, FixtureTag, PhysicsWorld, Tracked } from '../physics/PhysicsWorld';
import type { EntityData, LevelData } from '../levels/types';
import type { Car } from './Car';
import type { Behavior, HazardEvent, LevelCtx } from './hazards/core';
import { BouncePad, Cannon, Conveyor, OneWay, TransformPad, Zone } from './hazards/zones';
import { Crusher, Door, Gear, MovingPlatform, Saw, Spikes, Swing, Tilt } from './hazards/movers';
import { Laser, Mirror, Switch } from './hazards/beams';
import { Boulder, Bridge, CrateBody, CrumbleBlock, Dominoes, Falling, Tnt } from './hazards/breakables';

export type { Behavior, HazardEvent } from './hazards/core';

/** Tilting plank over a pit. Pure physics (view lives in render/LevelView). */
export class SeesawBody implements Behavior {
  readonly type = 'seesaw';
  readonly plank: Body;
  readonly pivot: Body;
  readonly tracked: Tracked;
  readonly width: number;
  readonly maxAngle: number;
  private rest: number;
  private x: number;
  private y: number;

  constructor(pw: PhysicsWorld, d: Extract<EntityData, { type: 'seesaw' }>) {
    this.width = d.width ?? 10;
    this.maxAngle = d.maxAngle ?? 0.4;
    // Teeter-totter: rests with the entry (left) end down, flush with the ground, so the plank is a
    // ramp up to the pivot. Passing the middle tips it; the far end then lands flush on the ground.
    this.rest = d.rest ?? this.maxAngle;
    this.x = d.x;
    this.y = d.y + (this.width / 2) * Math.sin(this.maxAngle) - 0.2 * Math.cos(this.maxAngle);
    const w = pw.world;
    this.pivot = w.createBody({ type: 'static', position: new Vec2(this.x, this.y) });
    this.plank = w.createBody({
      type: 'dynamic',
      position: new Vec2(this.x, this.y),
      angle: this.rest,
      angularDamping: 2.6,
      allowSleep: false,
    });
    this.plank.createFixture({
      shape: new Box(this.width / 2, 0.2),
      density: 1.4,
      friction: 1.4,
      restitution: 0,
      filterCategoryBits: Cat.PROP,
      filterMaskBits: Cat.CAR | Cat.PROP,
      userData: { kind: 'platform' } satisfies FixtureTag,
    });
    w.createJoint(
      new RevoluteJoint(
        { enableLimit: true, lowerAngle: -this.maxAngle, upperAngle: this.maxAngle },
        this.pivot,
        this.plank,
        this.pivot.getPosition(),
      ),
    );
    this.tracked = pw.track(this.plank);
  }

  reset(): void {
    this.plank.setTransform(new Vec2(this.x, this.y), this.rest);
    this.plank.setLinearVelocity(new Vec2(0, 0));
    this.plank.setAngularVelocity(0);
    this.plank.setAwake(true);
    this.tracked.snapshot();
  }
}

/** Builds all physics for a level (terrain + dynamic entities + hazards) and steps them. */
export class LevelPhysics implements LevelCtx {
  readonly behaviors: Behavior[] = [];
  readonly seesaws: SeesawBody[] = [];
  readonly switches = new Map<string, boolean>();
  /** Events raised since the game last drained them. */
  events: HazardEvent[] = [];
  time = 0;
  car: Car | null = null;
  gScale = 1;
  pendingTransform: { scale: number; vehicle?: string } | null = null;
  private appliedG = 1;
  /** Ground height lookup used by entities that need to know where the floor is. */
  groundAt: (x: number) => number = () => 0;

  constructor(
    readonly pw: PhysicsWorld,
    readonly data: LevelData,
  ) {
    if (data.gravity !== undefined) pw.setGravity(data.gravity);
    const lines = data.entities.flatMap((e) => (e.type === 'terrain' ? [e.points] : []));
    this.groundAt = (x) => {
      let best = -1e9;
      for (const l of lines) {
        if (x < l[0][0] || x > l[l.length - 1][0]) continue;
        for (let i = 1; i < l.length; i++)
          if (x <= l[i][0]) {
            const t = (x - l[i - 1][0]) / Math.max(1e-6, l[i][0] - l[i - 1][0]);
            best = Math.max(best, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t);
            break;
          }
      }
      return best < -1e8 ? -50 : best;
    };
    for (const e of data.entities) this.build(e);
    for (const b of this.behaviors) if (b instanceof Switch) this.switches.set(b.d.id, false);
  }

  emit(kind: string, x: number, y: number, strength = 1): void {
    this.events.push({ kind, x, y, strength });
  }

  private add<T extends Behavior>(b: T): T {
    this.behaviors.push(b);
    return b;
  }

  private build(e: EntityData): void {
    const pw = this.pw;
    switch (e.type) {
      case 'terrain':
        pw.addTerrain(e.points, e.depth ?? 14, e.surface ?? 'grass');
        break;
      case 'ceiling':
        pw.addCeiling(e.points, e.thickness ?? 8);
        break;
      case 'seesaw': {
        const s = new SeesawBody(pw, e);
        this.seesaws.push(s);
        this.add(s);
        break;
      }
      case 'zone':
        this.add(new Zone(this, e));
        break;
      case 'conveyor':
        this.add(new Conveyor(this, e));
        break;
      case 'bounce':
        this.add(new BouncePad(this, e));
        break;
      case 'cannon':
        this.add(new Cannon(this, e));
        break;
      case 'oneway':
        this.add(new OneWay(this, e));
        break;
      case 'transform':
        this.add(new TransformPad(this, e));
        break;
      case 'platform':
        this.add(new MovingPlatform(this, e));
        break;
      case 'gear':
        this.add(new Gear(this, e));
        break;
      case 'swing':
        this.add(new Swing(this, e));
        break;
      case 'tilt':
        this.add(new Tilt(this, e));
        break;
      case 'door':
        this.add(new Door(this, e));
        break;
      case 'crusher':
        this.add(new Crusher(this, e));
        break;
      case 'saw':
        this.add(new Saw(this, e));
        break;
      case 'spikes':
        this.add(new Spikes(this, e));
        break;
      case 'laser':
        this.add(new Laser(this, e));
        break;
      case 'mirror':
        this.add(new Mirror(this, e));
        break;
      case 'switch':
        this.add(new Switch(this, e));
        break;
      case 'crumble':
        this.add(new CrumbleBlock(this, { x: e.x, y: e.y, w: e.w, h: e.h ?? 0.7, delay: e.delay ?? 0.6 }));
        break;
      case 'bridge':
        this.add(new Bridge(this, e));
        break;
      case 'falling':
        this.add(new Falling(this, e, this.groundAt(e.x)));
        break;
      case 'crate':
        this.add(new CrateBody(this, e));
        break;
      case 'boulder':
        this.add(new Boulder(this, e));
        break;
      case 'tnt':
        this.add(new Tnt(this, e));
        break;
      case 'dominoes':
        this.add(new Dominoes(this, e));
        break;
      case 'deco':
        break; // visual only
    }
  }

  /** Call once per physics step BEFORE world.step(). */
  update(dt: number): void {
    this.time = this.pw.time;
    this.gScale = 1;
    for (const b of this.behaviors) b.update?.(dt);
    if (this.car && this.gScale !== this.appliedG) {
      this.car.setGravityScale(this.gScale);
      this.appliedG = this.gScale;
    }
  }

  /** Respawn: put dynamic things back (kinematic movers just keep following the clock). */
  reset(): void {
    for (const b of this.behaviors) b.reset?.();
    this.gScale = 1;
    this.appliedG = 1;
    this.pendingTransform = null;
  }

  /** Attach the (new) car after a respawn or transform. */
  setCar(car: Car | null): void {
    this.car = car;
    this.appliedG = 1;
  }

  /** Drain queued events. */
  drain(): HazardEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
