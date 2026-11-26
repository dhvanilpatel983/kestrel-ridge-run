// game/campaign.js
// Three sorties that make a complete game: lift off from Nimbus Airfield, thread the six gates
// strung around the island, then bring the Kestrel home. The campaign owns the clock, the score
// and which gate is next, and turns flight-model events into mission progress.

import { buildRing } from '../render/scenery.js';
import { RUNWAY } from '../render/scenery.js';

export const MISSIONS = [
  {
    id: 'launch',
    title: 'MISSION 1 · LIFT OFF',
    goal: 'Push the throttle to 100% (Shift) and get airborne from Nimbus Airfield',
  },
  {
    id: 'gates',
    title: 'MISSION 2 · THE GATES',
    goal: 'Thread all six marker rings around the island, in order',
  },
  {
    id: 'recovery',
    title: 'MISSION 3 · RECOVERY',
    goal: 'Land back on the runway, gear down, under 180 knots',
  },
];

// Six gates on a circuit around the island, each facing the one after it.
export const GATE_LAYOUT = [
  { angle: -0.55, radius: 1500, altitude: 210 },
  { angle: 0.35, radius: 2200, altitude: 300 },
  { angle: 1.35, radius: 2000, altitude: 250 },
  { angle: 2.25, radius: 2400, altitude: 340 },
  { angle: 3.15, radius: 1700, altitude: 230 },
  { angle: 4.05, radius: 900, altitude: 170 },
];

export class Campaign {
  constructor(model) {
    this.model = model;
    this.reset();
  }

  reset() {
    this.rings = GATE_LAYOUT.map((gate, index) => {
      const next = GATE_LAYOUT[(index + 1) % GATE_LAYOUT.length];
      const center = {
        x: Math.sin(gate.angle) * gate.radius,
        y: gate.altitude,
        z: Math.cos(gate.angle) * gate.radius,
      };
      const toward = {
        x: Math.sin(next.angle) * next.radius - center.x,
        z: Math.cos(next.angle) * next.radius - center.z,
      };
      const heading = Math.atan2(toward.x, toward.z);
      const ring = buildRing(center, heading, index === 5 ? 54 : 46);
      ring.index = index;
      ring.previousSide = null;
      return ring;
    });
    this.missionIndex = 0;
    this.gatesPassed = 0;
    this.score = 0;
    this.elapsed = 0;
    this.missionTime = 0;
    this.message = '';
    this.messageTimer = 0;
    this.finished = false;
    this.crashed = false;
    this.landed = false;
  }

  get mission() {
    return MISSIONS[Math.min(this.missionIndex, MISSIONS.length - 1)];
  }

  get targetRing() {
    if (this.mission.id !== 'gates') return null;
    return this.rings.find((ring) => !ring.passed) ?? null;
  }

  announce(text) {
    this.message = text;
    this.messageTimer = 2.6;
  }

  update(dt, model) {
    this.elapsed += dt;
    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.crashed || this.landed) return;

    for (const event of model.events) {
      if (event.type === 'crash') {
        this.crashed = true;
      } else if (event.type === 'liftoff' && this.missionIndex === 0) {
        this.missionIndex = 1;
        this.missionTime = 0;
        this.score += 250;
        this.announce('AIRBORNE · GATES ARMED');
      } else if (event.type === 'touchdown' && this.missionIndex >= 1) {
        this.landed = true;
        this.finished = true;
        this.score += 500 + Math.max(0, Math.round(600 - model.airspeedKnots));
        this.announce('ON THE NUMBERS · SORTIE COMPLETE');
      }
    }

    if (this.mission.id === 'launch') {
      if (model.aboveGround > 55 && !model.onGround) {
        this.missionIndex = 1;
        this.score += 250;
        this.announce('AIRBORNE · GATES ARMED');
      }
      return;
    }

    if (this.mission.id === 'gates') {
      this.missionTime += dt;
      for (const ring of this.rings) {
        if (ring.passed) continue;
        const dx = model.position.x - ring.center.x;
        const dy = model.position.y - ring.center.y;
        const dz = model.position.z - ring.center.z;
        const side = dx * ring.dir.x + dz * ring.dir.z;
        const radial = Math.hypot(dx, dy, dz);
        if (ring.previousSide !== null && ring.previousSide < 0 && side >= 0 && radial < ring.radius * 1.15) {
          ring.passed = true;
          this.gatesPassed += 1;
          this.score += 300;
          if (this.gatesPassed >= this.rings.length) {
            this.missionIndex = 2;
            this.score += Math.max(0, Math.round(1200 - this.missionTime * 4));
            this.announce('ALL GATES CLEARED · RETURN TO BASE');
          } else {
            this.announce(`GATE ${this.gatesPassed} OF ${this.rings.length} · CLEARED`);
          }
        }
        ring.previousSide = side;
      }
    }

    if (this.mission.id === 'recovery') {
      if (model.onGround && RUNWAY && Math.abs(model.position.x - RUNWAY.x) < RUNWAY.width) {
        this.landed = true;
        this.finished = true;
        this.score += 500 + Math.max(0, Math.round(400 - model.airspeedKnots));
        this.announce('SORTIE COMPLETE · WHEELS STOPPED');
      }
    }
  }
}
