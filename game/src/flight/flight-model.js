// flight/flight-model.js
// The Kestrel's arcade flight model: the airframe flies where its nose points, throttle and
// banked turns do the work of a wing, and the model reports the events the missions listen for
// (lift-off, wheel contact, crash, stall) plus the numbers the HUD shows.

import { clamp, headingBasis, wrapAngle } from '../core/math3d.js';
import { RUNWAY } from '../render/scenery.js';

export const STALL_SPEED = 56; // m/s, roughly 110 knots
export const CRUISE_SPEED = 125;
export const GEAR_HEIGHT = 1.7;

export class FlightModel {
  constructor(terrain) {
    this.terrain = terrain;
    this.reset();
  }

  reset(state = {}) {
    this.position = state.position ?? { x: RUNWAY.x - 1, y: RUNWAY.y + GEAR_HEIGHT, z: RUNWAY.z - RUNWAY.length / 2 + 70 };
    this.yaw = state.yaw ?? 0;
    this.pitch = state.pitch ?? 0;
    this.roll = state.roll ?? 0;
    this.speed = state.speed ?? 0;
    this.throttle = state.throttle ?? 0.62;
    this.fuel = state.fuel ?? 1;
    this.damage = state.damage ?? 0;
    this.onGround = state.onGround ?? true;
    this.gearDown = state.gearDown ?? true;
    this.verticalSpeed = 0;
    this.gLoad = 1;
    this.basis = headingBasis(this.yaw, this.pitch, this.roll);
    this.events = [];
  }

  // Height of the surface below, including the raised runway shelf.
  surfaceAt(x, z) {
    const onRunway =
      Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 16 &&
      Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 30;
    const ground = this.terrain.groundAt(x, z);
    return onRunway ? Math.max(ground, RUNWAY.y) : ground;
  }

  isOnRunway(x, z) {
    return Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 12 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 10;
  }

  update(dt, controls) {
    this.events.length = 0;
    const step = Math.min(dt, 0.05);

    // Throttle runs to its commanded value at a fixed rate.
    const target = clamp(controls.throttle ?? this.throttle, 0, 1);
    this.throttle += clamp(target - this.throttle, -1.4 * step, 1.4 * step);
    this.throttle = clamp(this.throttle, 0, 1);

    const air = clamp(this.speed / 60, 0, 1); // control authority grows with airspeed
    const authority = 0.25 + 0.75 * air;
    const stalled = this.speed < STALL_SPEED && !this.onGround;

    // Stick and rudder.
    this.pitch += (controls.pitch ?? 0) * 0.95 * authority * step;
    this.roll += (controls.roll ?? 0) * 1.6 * authority * step;
    this.yaw += (controls.yaw ?? 0) * 0.45 * authority * step;

    // Roll left in, the aircraft turns: bank converts lift into a heading change.
    this.yaw += Math.sin(this.roll) * 0.62 * (this.speed / 90) * step;

    // Wings level themselves a little, and the nose eases down without input.
    if (!controls.pitch) this.pitch += (0 - this.pitch) * 0.1 * step;
    if (!controls.roll) this.roll += (0 - this.roll) * 0.5 * step;
    if (stalled) this.pitch -= (1 - this.speed / STALL_SPEED) * 1.6 * step;

    // Washout at the extremes, so the aircraft never flips or stands on its tail for long.
    this.pitch = clamp(this.pitch, -1.25, 1.25);
    this.roll = clamp(this.roll, -Math.PI, Math.PI);
    if (Math.abs(this.pitch) > 1.15) this.pitch *= 0.995;

    this.basis = headingBasis(this.yaw, this.pitch, this.roll);
    const basis = this.basis;

    // Thrust, drag and the component of gravity along the flight path.
    const fuelFactor = this.fuel <= 0 ? 0 : 1;
    const thrust = this.throttle * 15.5 * fuelFactor;
    const drag = 0.00042 * this.speed * this.speed + 0.02 * this.speed;
    const gravity = -9.81 * Math.sin(this.pitch);
    const accel = thrust - drag + gravity + (this.onGround ? this.throttle * 3.4 : 0);
    this.speed = Math.max(0, this.speed + accel * step);

    // Fly along the nose, plus sink when the wing is not carrying the aircraft.
    const sink = stalled ? (1 - this.speed / STALL_SPEED) * 26 : 0;
    this.position.x += basis.fwd.x * this.speed * step;
    this.position.y += (basis.fwd.y * this.speed - sink) * step;
    this.position.z += basis.fwd.z * this.speed * step;
    this.verticalSpeed = basis.fwd.y * this.speed - sink;

    // Fuel burn rises with throttle.
    this.fuel = Math.max(0, this.fuel - (0.0016 + this.throttle * 0.0032) * step);

    // Load factor, for the HUD's G readout and the airframe's stress.
    const load = 1 + Math.abs(controls.pitch ?? 0) * (this.speed / 70) * 2.4;
    this.gLoad += (load - this.gLoad) * Math.min(1, step * 6);

    // Ground contact.
    const surface = this.surfaceAt(this.position.x, this.position.z);
    const height = this.position.y - surface;
    if (this.onGround) {
      // On the wheels: the surface holds the aircraft up, the rudder steers the roll, and the
      // nose rotates once the wing has flying speed — that rotation is the take-off.
      this.position.y = surface + GEAR_HEIGHT;
      this.verticalSpeed = 0;
      this.roll *= 0.86;
      this.pitch = clamp(this.pitch, -0.05, 0.34);
      if (this.speed < 1 && this.throttle < 0.03) this.speed = 0;
      if (this.speed > 62 && this.pitch > 0.055) {
        this.onGround = false;
        this.events.push({ type: 'liftoff' });
      }
    } else {
      const onRunway = this.isOnRunway(this.position.x, this.position.z);
      if (height <= GEAR_HEIGHT + 0.15) {
        const softTouch = this.verticalSpeed > -7.5 && Math.abs(this.roll) < 0.34 && Math.abs(this.pitch) < 0.32;
        if (this.gearDown && onRunway && softTouch) {
          this.onGround = true;
          this.position.y = surface + GEAR_HEIGHT;
          this.verticalSpeed = 0;
          this.events.push({ type: 'touchdown', x: this.position.x, z: this.position.z });
        } else if (!this.gearDown && onRunway && this.verticalSpeed > -2.4) {
          this.onGround = true;
          this.position.y = surface + GEAR_HEIGHT;
          this.verticalSpeed = 0;
          this.damage = Math.min(1, this.damage + 0.15);
          this.events.push({ type: 'touchdown', x: this.position.x, z: this.position.z, belly: true });
        } else {
          this.damage = 1;
          this.events.push({ type: 'crash' });
          this.speed = 0;
          return;
        }
      }

      // Hitting the water is always fatal.
      if (!this.onGround && this.position.y < 2.4) {
        this.damage = 1;
        this.events.push({ type: 'crash' });
        this.speed = 0;
      }
    }

    // Keep the aircraft inside the island's airspace so the chase camera stays in the world.
    const radius = Math.hypot(this.position.x, this.position.z);
    if (radius > 7600) this.yaw += 0.9 * step;
  }

  get altitude() {
    return this.position.y;
  }

  get airspeedKnots() {
    return this.speed * 1.94384;
  }

  get headingDegrees() {
    let deg = (wrapAngle(this.yaw) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  get altitudeFeet() {
    return this.position.y * 3.28084;
  }

  get aboveGround() {
    return this.position.y - this.surfaceAt(this.position.x, this.position.z);
  }
}
