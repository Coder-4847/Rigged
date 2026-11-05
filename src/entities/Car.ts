import { Body, Box, Circle, Vec2, WheelJoint, Contact } from 'planck';
import { CONFIG, VehicleDef } from '../config';
import { InputState } from '../core/Input';
import { Cat, ContactOwner, FixtureTag, PhysicsWorld, Tracked, isSolid } from '../physics/PhysicsWorld';

export type CrashReason = 'roof' | 'flipped' | 'hazard' | 'fell';

export interface CarOptions {
  /** 0..1 — how much the anti-flip assist helps (fades out in harder worlds). */
  antiFlip?: number;
  boostAllowed?: boolean;
}

export interface CarEvents {
  onLand?: (impact: number, wheel: number) => void;
  onCrash?: (reason: CrashReason) => void;
}

/**
 * Pure-physics car: chassis + two wheels on spring/motor wheel joints.
 * No rendering dependencies so it can be simulated headlessly for tuning/tests.
 */
export class Car implements ContactOwner {
  readonly chassis: Body;
  readonly wheels: [Body, Body]; // [rear, front]
  readonly joints: [WheelJoint, WheelJoint];
  readonly tChassis: Tracked;
  readonly tWheels: [Tracked, Tracked];
  readonly mass: number;

  // --- state exposed to rendering / audio / camera ---
  grounded = false;
  wheelContacts: [number, number] = [0, 0];
  airTime = 0;
  /** Time since last touching ground (for grace). */
  sinceGrounded = 0;
  /** Time since landing (0 while airborne). */
  sinceLanded = 99;
  invertedTime = 0;
  crashed = false;
  crashReason: CrashReason | null = null;
  /** Signed speed along the chassis facing direction (m/s). */
  forwardSpeed = 0;
  /** Smoothed motor drive command (-1..1) for visuals/audio. */
  drive = 0;
  /** Wheel angular velocities for visuals. */
  options: Required<CarOptions>;
  events: CarEvents = {};
  /** Highest recent landing impact (for fx); reset by consumer. */
  lastLanding = 0;
  /** Duration of the airtime that just ended (valid when lastLanding > 0). */
  lastAirTime = 0;
  /** Chassis angular acceleration estimate -> visual lean. */
  accel = 0;
  private prevVx = 0;
  private bodyContacts = 0;
  /** Seconds before another landing impact may be reported (debounces bounces). */
  private impactCooldown = 0;

  constructor(
    private pw: PhysicsWorld,
    readonly def: VehicleDef,
    x: number,
    y: number,
    opts: CarOptions = {},
  ) {
    this.options = { antiFlip: 1, boostAllowed: false, ...opts };
    const w = pw.world;
    const filter = {
      filterCategoryBits: Cat.CAR,
      filterMaskBits: Cat.TERRAIN | Cat.PROP,
      // Negative group: parts of the car never collide with each other.
      filterGroupIndex: -1,
    };

    // Chassis
    this.chassis = w.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      angularDamping: 0.15,
      linearDamping: 0.02,
      allowSleep: false,
    });
    const b = def.body;
    this.chassis.createFixture({
      shape: new Box(b.hx, b.hy, new Vec2(0, b.cy), 0),
      density: b.density,
      friction: 0.3,
      restitution: 0.05,
      ...filter,
      userData: { kind: 'chassis', owner: this } satisfies FixtureTag,
    });
    const c = def.cabin;
    this.chassis.createFixture({
      shape: new Box(c.hx, c.hy, new Vec2(c.cx, c.cy), 0),
      density: c.density,
      friction: 0.2,
      restitution: 0.05,
      ...filter,
      userData: { kind: 'roof', owner: this } satisfies FixtureTag,
    });
    this.mass = this.chassis.getMass();

    // Wheels
    const wd = def.wheel;
    const makeWheel = (lx: number, friction: number, idx: number): Body => {
      const wb = w.createBody({
        type: 'dynamic',
        position: new Vec2(x + lx, y + wd.anchorY),
        bullet: true, // wheels carry the car: never let them tunnel through terrain
        angularDamping: 0.02,
        allowSleep: false,
      });
      wb.createFixture({
        shape: new Circle(wd.radius),
        density: wd.density,
        friction,
        restitution: 0.02,
        ...filter,
        userData: { kind: 'wheel', owner: this, index: idx } satisfies FixtureTag,
      });
      return wb;
    };
    this.wheels = [makeWheel(wd.rearX, wd.friction, 0), makeWheel(wd.frontX, wd.friction * wd.frontFriction, 1)];

    const joint = (wb: Body): WheelJoint =>
      w.createJoint(
        new WheelJoint(
          {
            enableMotor: true,
            maxMotorTorque: 0,
            motorSpeed: 0,
            frequencyHz: def.suspension.hz,
            dampingRatio: def.suspension.damping,
          },
          this.chassis,
          wb,
          wb.getPosition(),
          new Vec2(0, 1),
        ),
      ) as WheelJoint;
    this.joints = [joint(this.wheels[0]), joint(this.wheels[1])];

    this.tChassis = pw.track(this.chassis);
    this.tWheels = [pw.track(this.wheels[0]), pw.track(this.wheels[1])];
  }

  // ------------------------------------------------------------------ contacts

  onBegin(self: FixtureTag, other: FixtureTag, _c: Contact): void {
    if (this.crashed) return;
    if (other.kind === 'deadly') {
      this.crash('hazard');
      return;
    }
    if (!isSolid(other)) return;
    if (self.kind === 'roof') {
      this.crash('roof');
    } else if (self.kind === 'wheel') {
      this.wheelContacts[self.index ?? 0]++;
    } else if (self.kind === 'chassis') {
      this.bodyContacts++;
    }
  }

  onEnd(self: FixtureTag, other: FixtureTag, _c: Contact): void {
    if (!isSolid(other)) return;
    if (self.kind === 'wheel') {
      const i = self.index ?? 0;
      this.wheelContacts[i] = Math.max(0, this.wheelContacts[i] - 1);
    } else if (self.kind === 'chassis') {
      this.bodyContacts = Math.max(0, this.bodyContacts - 1);
    }
  }

  onImpact(self: FixtureTag, other: FixtureTag, impulse: number): void {
    if (this.crashed || !isSolid(other)) return;
    if (self.kind !== 'wheel' && self.kind !== 'chassis') return;
    // Normal impulse -> approximate velocity change of the whole car.
    const dv = impulse / this.mass;
    if (dv > CONFIG.fx.landingMin && this.impactCooldown <= 0) {
      this.lastLanding = Math.max(this.lastLanding, dv);
      this.impactCooldown = 0.15;
      this.events.onLand?.(dv, self.index ?? -1);
    }
  }

  // ------------------------------------------------------------------ control

  crash(reason: CrashReason): void {
    if (this.crashed) return;
    this.crashed = true;
    this.crashReason = reason;
    // NB: may be called from inside a contact callback — flags only, no structural changes.
    this.events.onCrash?.(reason);
  }

  /** Advance control logic one fixed step. Call BEFORE world.step(). */
  update(dt: number, input: InputState): void {
    if (this.crashed) return;
    const def = this.def;
    const ch = this.chassis;
    this.impactCooldown -= dt;
    const angle = ch.getAngle();
    const vel = ch.getLinearVelocity();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.forwardSpeed = vel.x * cos + vel.y * sin;

    // Ground state
    const wasGrounded = this.grounded;
    this.grounded = this.wheelContacts[0] > 0 || this.wheelContacts[1] > 0;
    if (this.grounded) {
      if (!wasGrounded) {
        this.sinceLanded = 0;
        this.lastAirTime = this.airTime;
      }
      this.sinceLanded += dt;
      this.airTime = 0;
      this.sinceGrounded = 0;
    } else {
      this.airTime += dt;
      this.sinceGrounded += dt;
      this.sinceLanded = 99;
    }
    const controlGrounded = this.grounded || this.sinceGrounded < 0.1;

    // ---- Motor ----
    const m = def.motor;
    const wr = def.wheel.radius;
    const maxOmega = m.maxSpeed / wr;
    let target = 0;
    let torque = m.idleTorque;
    let braking = false;
    const gas = input.throttle;
    const brk = input.brake;
    if (gas > 0.05 && brk > 0.5) {
      // Both pressed = handbrake: lock wheels hard.
      target = 0;
      torque = m.brakeTorque;
      braking = true;
    } else if (gas > 0.05) {
      // Wheel angular velocity is negative when rolling right (clockwise).
      target = -gas * maxOmega;
      torque = m.torque;
      // Soft-limit: don't fight if already above top speed.
      if (this.forwardSpeed > m.maxSpeed) torque = m.idleTorque;
    } else if (brk > 0.05) {
      if (this.forwardSpeed > 1.2) {
        target = 0;
        torque = m.brakeTorque * brk;
        braking = true;
      } else {
        target = brk * maxOmega * m.reverseFrac;
        torque = m.torque * 0.8;
      }
    }
    this.drive += ((gas > 0.05 ? gas : brk > 0.05 ? -brk : 0) - this.drive) * Math.min(1, dt * 10);
    for (let i = 0; i < 2; i++) {
      const j = this.joints[i];
      j.enableMotor(true);
      j.setMotorSpeed(target);
      // Brakes act on both wheels; drive torque is split per the vehicle's drivetrain.
      const share = braking ? 1 : m.drive[i];
      j.setMaxMotorTorque(torque * share);
    }

    // ---- Downforce (keeps the car planted at speed) ----
    if (controlGrounded) {
      const f = def.downforce * Math.abs(this.forwardSpeed) * this.mass;
      ch.applyForceToCenter(new Vec2(0, -f), true);
    }

    // ---- Air control ----
    const inAir = !this.grounded && this.airTime > 0.06;
    const w = ch.getAngularVelocity();
    if (inAir) {
      const a = def.air;
      if (input.tilt !== 0) {
        // Torque tapers off as we approach the angular speed cap.
        const room = Math.max(0, 1 - (input.tilt * w) / a.maxAngVel);
        ch.applyTorque(input.tilt * a.tilt * this.mass * room * 2.2, true);
      } else {
        // No input: bleed spin so the car feels controllable.
        ch.applyTorque(-w * a.damping * this.mass * 0.6, true);
      }
    }

    // ---- Landing grace: briefly damp rotation so awkward landings don't tumble ----
    if (this.grounded && this.sinceLanded < 0.25) {
      ch.applyTorque(-w * this.mass * 1.4, true);
    }

    // ---- Anti-flip assist ----
    if (this.grounded && this.options.antiFlip > 0) {
      const wrapped = Math.atan2(sin, cos);
      const start = 0.95; // ~54°: beyond what ordinary slopes produce
      const over = Math.abs(wrapped) - start;
      if (over > 0 && Math.abs(wrapped) < Math.PI * 0.62) {
        const strength = def.antiFlip * this.options.antiFlip;
        ch.applyTorque(-Math.sign(wrapped) * over * strength * this.mass * 14, true);
      }
    }

    // ---- Boost ----
    if (input.boost && this.options.boostAllowed) {
      ch.applyForceToCenter(new Vec2(cos * def.boostAccel * this.mass, sin * def.boostAccel * this.mass), true);
    }

    // ---- Crash checks ----
    const wrapped = Math.atan2(sin, cos);
    const inverted = Math.abs(wrapped) > CONFIG.crash.invertedAngle;
    const touching = this.grounded || this.bodyContacts > 0;
    if (inverted && touching) {
      this.invertedTime += dt;
      if (this.invertedTime > CONFIG.crash.invertedTime) this.crash('flipped');
    } else {
      this.invertedTime = Math.max(0, this.invertedTime - dt * 2);
    }
    if (ch.getPosition().y < CONFIG.crash.killY) this.crash('fell');

    // Acceleration estimate for visual lean
    this.accel += ((vel.x - this.prevVx) / dt - this.accel) * Math.min(1, dt * 8);
    this.prevVx = vel.x;
  }

  /** True while the chassis body is touching solid ground (scraping). */
  get scraping(): boolean {
    return this.bodyContacts > 0;
  }

  get x(): number {
    return this.chassis.getPosition().x;
  }
  get y(): number {
    return this.chassis.getPosition().y;
  }
  get speed(): number {
    return this.chassis.getLinearVelocity().length();
  }

  /** Remove all bodies from the world. */
  destroy(): void {
    this.pw.untrack(this.tChassis);
    this.pw.untrack(this.tWheels[0]);
    this.pw.untrack(this.tWheels[1]);
    const w = this.pw.world;
    for (const j of this.joints) w.destroyJoint(j);
    w.destroyBody(this.wheels[0]);
    w.destroyBody(this.wheels[1]);
    w.destroyBody(this.chassis);
  }
}
