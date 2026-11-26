// game/src/main.js
// Boot, the frame loop and the camera: it builds the island, wires the flight model, campaign,
// controls, sound and HUD together, and switches between the title card and the sortie.

import { Camera, headingBasis, DEG, clamp } from './core/math3d.js';
import { Terrain, PLATEAU_Y } from './world/terrain.js';
import { Renderer } from './render/renderer.js';
import { buildKestrel } from './render/aircraft.js';
import { buildRunway, buildRing, buildForest, buildClouds, buildWindsock, RUNWAY } from './render/scenery.js';
import { FlightModel } from './flight/flight-model.js';
import { Controls } from './flight/controls.js';
import { Campaign } from './game/campaign.js';
import { drawHud, drawTitle } from './game/hud.js';
import { Sound } from './game/audio.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const WIDTH = 1280;
const HEIGHT = 720;
canvas.width = WIDTH;
canvas.height = HEIGHT;

const terrain = new Terrain(17);
const renderer = new Renderer(canvas);
const camera = new Camera();
camera.setSize(WIDTH, HEIGHT);
camera.fov = 64 * DEG;

const runwayParts = buildRunway();
const forest = buildForest(terrain, 460, 5);
const clouds = buildClouds(30, 21);
const windsock = buildWindsock();
const kestrel = buildKestrel();

const model = new FlightModel(terrain);
const campaign = new Campaign(model);
const controls = new Controls(canvas);
const sound = new Sound();

const sun = { direction: { x: -0.42, y: 0.46, z: -0.78 } };
const sunLength = Math.hypot(sun.direction.x, sun.direction.y, sun.direction.z);
sun.direction = { x: sun.direction.x / sunLength, y: sun.direction.y / sunLength, z: sun.direction.z / sunLength };

const state = {
  view: 'chase',
  started: false,
  paused: false,
  showcaseRings: [],
  shot: null,
};

controls.on('camera', () => {
  state.view = state.view === 'chase' ? 'cockpit' : 'chase';
});
controls.on('gear', () => {
  model.gearDown = !model.gearDown;
});
controls.on('restart', () => restart());
controls.on('mute', () => sound.toggle());
controls.on('start', () => startFlying());

function startFlying() {
  sound.start();
  if (!state.started) {
    state.started = true;
    campaign.announce('THROTTLE UP · HOLD THE CENTRELINE');
  }
}

function restart() {
  model.reset();
  campaign.reset();
  state.started = true;
  campaign.announce('SORTIE RESET · RUNWAY CLEAR');
}

// ---- camera -------------------------------------------------------------------------------

function placeChaseCamera() {
  const b = model.basis;
  const back = 24;
  const lift = 7.6;
  const px = model.position.x - b.fwd.x * back + b.up.x * lift;
  const py = model.position.y - b.fwd.y * back + b.up.y * lift;
  const pz = model.position.z - b.fwd.z * back + b.up.z * lift;
  const floor = terrain.groundAt(px, pz) + 3.2;
  camera.place({ x: px, y: Math.max(py, floor), z: pz }, headingBasis(model.yaw, model.pitch * 0.8 + 0.03, model.roll * 0.55));
}

function placeCockpitCamera() {
  const b = model.basis;
  camera.place(
    {
      x: model.position.x + b.up.x * 1.2 + b.fwd.x * 1.1,
      y: model.position.y + b.up.y * 1.2 + b.fwd.y * 1.1,
      z: model.position.z + b.up.z * 1.2 + b.fwd.z * 1.1,
    },
    model.basis,
  );
}

// ---- the scene handed to the renderer -----------------------------------------------------

function buildScene() {
  return {
    camera,
    terrain,
    runwayParts,
    forest,
    clouds,
    windsock,
    sun,
    rings: state.showcaseRings.length ? state.showcaseRings : campaign.rings,
    targetRing: campaign.targetRing,
    aircraft: {
      visible: state.view === 'chase',
      position: model.position,
      basis: model.basis,
      faces: model.gearDown ? kestrel.faces.concat(kestrel.gear) : kestrel.faces,
    },
    throttle: model.throttle,
  };
}

// ---- screenshots --------------------------------------------------------------------------

// Four deterministic poses, selected with ?shot=, so the entry's screenshots are real renders of
// this code in a browser: a chase view over the coast, a gate run, a landing approach and the
// cockpit view.
function placeShowcaseRing(distance, lateral, vertical, radius) {
  const b = model.basis;
  const center = {
    x: model.position.x + b.fwd.x * distance + b.right.x * lateral,
    y: model.position.y + vertical,
    z: model.position.z + b.fwd.z * distance + b.right.z * lateral,
  };
  const ring = buildRing(center, model.yaw, radius);
  ring.index = 1;
  return ring;
}

function setupShot(name) {
  state.shot = name;
  state.started = true;
  const yawTo = (tx, tz) => Math.atan2(tx - model.position.x, tz - model.position.z);
  // Rings are placed from the aircraft's heading, so the basis is refreshed before they go in.
  const heading = (yaw) => {
    model.yaw = yaw;
    model.basis = headingBasis(model.yaw, model.pitch, model.roll);
  };
  // A pose shows one gate ahead, but the mission card still counts the course: five gates behind
  // the aircraft are marked cleared so the HUD reads as it does mid-sortie.
  const showRings = (count, distance, lateral, vertical, radius) => {
    const ring = placeShowcaseRing(distance, lateral, vertical, radius);
    ring.index = count;
    state.showcaseRings = [ring];
    const cleared = [];
    for (let i = 0; i < 5; i += 1) {
      cleared.push({
        center: { x: 0, y: -4000, z: 0 },
        heading: 0,
        radius: 40,
        dir: { x: 0, y: 0, z: 1 },
        quads: [],
        passed: true,
        index: count + 1 + i,
      });
    }
    campaign.rings = [ring, ...cleared];
  };

  // Every pose sits a comfortable height over whatever the island is doing underneath it.
  const above = (x, z, height) => Math.max(terrain.groundAt(x, z) + height, height + 60);

  if (name === 'cover') {
    model.reset({
      position: { x: -2450, y: above(-2450, 1750, 170), z: 1750 },
      yaw: 0, pitch: 0.045, roll: -0.16, speed: 138, throttle: 0.88, fuel: 0.72, onGround: false, gearDown: false,
    });
    heading(yawTo(200, -1900) - 0.18);
    campaign.missionIndex = 1;
    campaign.gatesPassed = 2;
    campaign.score = 1850;
    campaign.missionTime = 63;
    showRings(2, 430, 26, 12, 58);
  } else if (name === 'gates') {
    model.reset({
      position: { x: 980, y: above(980, 1620, 140), z: 1620 },
      yaw: 0, pitch: 0.02, roll: 0.34, speed: 152, throttle: 0.95, fuel: 0.64, onGround: false, gearDown: true,
    });
    heading(yawTo(-300, -1200));
    campaign.missionIndex = 1;
    campaign.gatesPassed = 3;
    campaign.score = 2650;
    campaign.missionTime = 88;
    showRings(3, 330, -8, 4, 50);
  } else if (name === 'approach') {
    // Final approach fix: on the extended centreline, a mile and a bit out from the threshold.
    const approachZ = RUNWAY.z - 820;
    model.reset({
      position: { x: RUNWAY.x + 3, y: PLATEAU_Y + 30, z: approachZ },
      yaw: 0, pitch: -0.06, roll: 0.02, speed: 78, throttle: 0.34, fuel: 0.38, onGround: false, gearDown: true,
    });
    campaign.missionIndex = 2;
    campaign.gatesPassed = 6;
    campaign.score = 4100;
    campaign.missionTime = 152;
    state.showcaseRings = [];
    campaign.rings = [];
  } else if (name === 'cockpit') {
    model.reset({
      position: { x: -1750, y: above(-1750, 900, 165), z: 900 },
      yaw: 0, pitch: 0.03, roll: -0.3, speed: 132, throttle: 0.82, fuel: 0.58, onGround: false, gearDown: false,
    });
    heading(yawTo(400, -1600));
    state.view = 'cockpit';
    campaign.missionIndex = 1;
    campaign.gatesPassed = 4;
    campaign.score = 3250;
    campaign.missionTime = 114;
    showRings(4, 520, 30, 22, 54);
  } else if (name === 'title') {
    model.reset({
      position: { x: -1600, y: above(-1600, 2400, 240), z: 2400 },
      yaw: 0, pitch: 0.02, roll: 0.22, speed: 140, throttle: 0.7, onGround: false, gearDown: false,
    });
    heading(yawTo(300, -1200));
    state.started = false;
  }
  model.basis = headingBasis(model.yaw, model.pitch, model.roll);
  campaign.messageTimer = 0;
  placeCameraForShot();
}

function placeCameraForShot() {
  if (state.view === 'cockpit') placeCockpitCamera();
  else placeChaseCamera();
}

// ---- the loop -----------------------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.06);
  last = now;

  if (!state.shot) {
    if (state.started && !state.paused) {
      const sticks = controls.read();
      model.update(dt, sticks);
      campaign.update(dt, model);
      for (const event of model.events) {
        if (event.type === 'crash') sound.crash();
        if (event.type === 'touchdown') sound.tone(180, 0.25, 'triangle', 0.18);
      }
      if (campaign.message.startsWith('GATE') && campaign.messageTimer > 2.4) sound.gate();
      sound.update(model);
      if (campaign.crashed) state.paused = true;
    }
  }

  if (state.shot) placeCameraForShot();
  else if (state.view === 'cockpit') placeCockpitCamera();
  else placeChaseCamera();

  renderer.render(buildScene());

  const ctx = canvas.getContext('2d');
  if (!state.started) drawTitle(ctx, camera);
  else drawHud(ctx, camera, model, campaign, { cockpit: state.view === 'cockpit' });

  if (state.shot && !window.__shotReady) {
    window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

// A shot can be requested by URL, and the page announces what it is showing for screen readers.
const shot = new URLSearchParams(location.search).get('shot');
if (shot) setupShot(shot);
if (status) status.textContent = 'Kestrel: ridge run over Nimbus Reach. Fly with W and S for pitch, A and D for roll.';
requestAnimationFrame(frame);

window.__kestrel = { model, campaign, camera, state, renderer, terrain };
