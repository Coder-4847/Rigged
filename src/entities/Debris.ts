import * as THREE from 'three';
import { Body, Box, Circle, Vec2 } from 'planck';
import { CONFIG } from '../config';
import { Cat, FixtureTag, PhysicsWorld, Tracked } from '../physics/PhysicsWorld';
import { CarModel } from './CarModel';

interface Piece {
  pivot: THREE.Group;
  inner: THREE.Object3D;
  tracked: Tracked;
  body: Body;
  spinX: number;
}

/**
 * Crash explosion: turns each visual part of the car into its own tumbling physics body.
 * Bodies only collide with terrain, so the pile can't interfere with respawning.
 */
export class Debris {
  private pieces: Piece[] = [];
  private tmp = { x: 0, y: 0, a: 0 };

  constructor(
    private pw: PhysicsWorld,
    private scene: THREE.Scene,
  ) {}

  /**
   * @param model the car's visual model (parts are detached from it)
   * @param chassis/wheels world poses at the moment of the crash
   * @param vel chassis linear velocity (pieces inherit it)
   */
  explode(
    model: CarModel,
    chassis: { x: number; y: number; a: number },
    wheels: Array<{ x: number; y: number; a: number }>,
    vel: { x: number; y: number },
    angVel: number,
  ): void {
    const kick = CONFIG.crash.debrisKick;
    const spawn = (
      obj: THREE.Object3D,
      pose: { x: number; y: number; a: number },
      z: number,
      shape: Box | Circle,
      head = false,
    ) => {
      const body = this.pw.world.createBody({
        type: 'dynamic',
        position: new Vec2(pose.x, pose.y),
        angle: pose.a,
        linearDamping: 0.15,
        angularDamping: 0.3,
      });
      body.createFixture({
        shape,
        density: 1,
        friction: 0.7,
        restitution: head ? 0.7 : 0.38, // bouncy, comedic
        filterCategoryBits: Cat.DEBRIS,
        filterMaskBits: Cat.TERRAIN,
        userData: { kind: 'debris' } satisfies FixtureTag,
      });
      const ang = Math.random() * Math.PI * 2;
      const k = kick * (0.5 + Math.random() * 0.8) * (head ? 1.5 : 1);
      body.setLinearVelocity(new Vec2(vel.x * 0.7 + Math.cos(ang) * k, vel.y * 0.7 + Math.abs(Math.sin(ang)) * k + 3));
      body.setAngularVelocity(angVel * 0.5 + (Math.random() - 0.5) * 22);
      const pivot = new THREE.Group();
      pivot.position.set(pose.x, pose.y, 0);
      pivot.rotation.z = pose.a;
      obj.removeFromParent();
      obj.position.set(0, 0, z);
      obj.rotation.set(0, 0, 0);
      pivot.add(obj);
      this.scene.add(pivot);
      this.pieces.push({ pivot, inner: obj, tracked: this.pw.track(body), body, spinX: (Math.random() - 0.5) * 9 });
    };

    for (const part of model.parts) {
      const w = model.partWorld(part, chassis);
      spawn(
        part.obj,
        w,
        part.z,
        new Box(Math.max(0.06, part.hx * model.k), Math.max(0.06, part.hy * model.k)),
        !!part.isHead,
      );
    }
    for (let i = 0; i < 4; i++) {
      const wp = wheels[i < 2 ? 0 : 1];
      const g = model.wheelGroups[i];
      const z = g.position.z;
      spawn(g, { x: wp.x, y: wp.y, a: wp.a }, z, new Circle(model.def.wheel.radius * model.k));
    }
  }

  update(alpha: number, dt: number): void {
    const t = this.tmp;
    for (const p of this.pieces) {
      p.tracked.at(alpha, t);
      p.pivot.position.set(t.x, t.y, 0);
      p.pivot.rotation.z = t.a;
      p.inner.rotation.x += p.spinX * dt;
    }
  }

  clear(): void {
    for (const p of this.pieces) {
      this.pw.untrack(p.tracked);
      this.pw.world.destroyBody(p.body);
      p.pivot.removeFromParent();
    }
    this.pieces.length = 0;
  }

  get active(): boolean {
    return this.pieces.length > 0;
  }
}
