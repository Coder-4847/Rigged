import { Body, Box, RevoluteJoint, Vec2 } from 'planck';
import { Cat, FixtureTag, PhysicsWorld, Tracked } from '../physics/PhysicsWorld';
import type { EntityData, LevelData } from '../levels/types';

/** Anything dynamic in a level: stepped each physics tick and reset on respawn. */
export interface Behavior {
  update?(dt: number): void;
  reset?(): void;
}

/** Tilting plank over a pit. Pure physics (view lives in render/LevelView). */
export class SeesawBody implements Behavior {
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

/** Builds all physics for a level (terrain + dynamic entities). */
export class LevelPhysics {
  readonly behaviors: Behavior[] = [];
  readonly seesaws: SeesawBody[] = [];

  constructor(
    readonly pw: PhysicsWorld,
    readonly data: LevelData,
  ) {
    if (data.gravity !== undefined) pw.setGravity(data.gravity);
    for (const e of data.entities) {
      switch (e.type) {
        case 'terrain':
          pw.addTerrain(e.points, e.depth ?? 14, e.surface ?? 'grass');
          break;
        case 'seesaw': {
          const s = new SeesawBody(pw, e);
          this.seesaws.push(s);
          this.behaviors.push(s);
          break;
        }
        default:
          break; // decorations are visual only
      }
    }
  }

  update(dt: number): void {
    for (const b of this.behaviors) b.update?.(dt);
  }

  reset(): void {
    for (const b of this.behaviors) b.reset?.();
  }
}
