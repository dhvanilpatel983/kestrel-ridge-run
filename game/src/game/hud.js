// game/hud.js
// The instrument panel: a head-up display with airspeed, altitude and heading tapes, a pitch
// ladder, the throttle and fuel state, the mission card and the gate designator, plus the
// cockpit's own dashboard for the interior view.

import { clamp } from '../core/math3d.js';

const HUD = { r: 138, g: 240, b: 184 };
const AMBER = { r: 255, g: 198, b: 92 };
const DANGER = { r: 255, g: 118, b: 96 };

const FONT = "'JetBrains Mono', 'Consolas', 'Menlo', monospace";

function hudColor(alpha = 1) {
  return `rgba(${HUD.r},${HUD.g},${HUD.b},${alpha})`;
}

function amberColor(alpha = 1) {
  return `rgba(${AMBER.r},${AMBER.g},${AMBER.b},${alpha})`;
}

function dangerColor(alpha = 1) {
  return `rgba(${DANGER.r},${DANGER.g},${DANGER.b},${alpha})`;
}

function label(ctx, text, x, y, size, color, align = 'left', weight = '600', spacing = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (spacing) {
    ctx.save();
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.restore();
  } else {
    ctx.fillText(text, x, y);
  }
}

function panel(ctx, x, y, w, h, alpha = 0.32) {
  ctx.fillStyle = `rgba(6,22,26,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = hudColor(0.28);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Screen angle of the horizon, so the ladder, tapes and designator share the same tilt.
function horizonAngle(camera) {
  const right = camera.directionToCamera(camera.basis.right, { x: 0, y: 0, z: 0 });
  return Math.atan2(-right.y, right.x);
}

function projectDirection(camera, dir) {
  const cam = camera.directionToCamera(dir, { x: 0, y: 0, z: 0 });
  if (cam.z <= 0.08) return null;
  return {
    x: camera.cx + (cam.x / cam.z) * camera.focal,
    y: camera.cy - (cam.y / cam.z) * camera.focal,
  };
}

// The pitch ladder: rungs every 10 degrees of climb and dive, rolled with the horizon.
function drawPitchLadder(ctx, camera, model, tint) {
  const cx = camera.cx;
  const cy = camera.cy;
  const tilt = horizonAngle(camera);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, camera.width, camera.height);
  ctx.clip();
  for (let deg = -90; deg <= 90; deg += 10) {
    const pitch = (deg * Math.PI) / 180;
    const dir = {
      x: Math.sin(model.yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: Math.cos(model.yaw) * Math.cos(pitch),
    };
    const p = projectDirection(camera, dir);
    if (!p) continue;
    if (p.y < -200 || p.y > camera.height + 200) continue;
    const half = deg === 0 ? 210 : 84;
    const gap = deg === 0 ? 90 : 46;
    ctx.strokeStyle = tint(0.75);
    ctx.lineWidth = deg === 0 ? 2 : 1.4;
    const ux = Math.cos(tilt);
    const uy = Math.sin(tilt);
    const drawRung = (from, to) => {
      ctx.beginPath();
      ctx.moveTo(p.x + ux * from, p.y + uy * from);
      ctx.lineTo(p.x + ux * to, p.y + uy * to);
      ctx.stroke();
    };
    drawRung(-half, -gap);
    drawRung(gap, half);
    if (deg > 0) {
      // Climb rungs break upward at their ends.
      drawRung(-half, -half);
      ctx.beginPath();
      ctx.moveTo(p.x - ux * half, p.y - uy * half);
      ctx.lineTo(p.x - ux * half + Math.cos(tilt - Math.PI / 2) * 8, p.y - uy * half + Math.sin(tilt - Math.PI / 2) * 8);
      ctx.stroke();
    } else if (deg < 0) {
      const vx = Math.cos(tilt + Math.PI / 2);
      const vy = Math.sin(tilt + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(p.x + ux * half, p.y + uy * half);
      ctx.lineTo(p.x + ux * half + vx * 10, p.y + uy * half + vy * 10);
      ctx.moveTo(p.x - ux * half, p.y - uy * half);
      ctx.lineTo(p.x - ux * half + vx * 10, p.y - uy * half + vy * 10);
      ctx.stroke();
    }
    if (deg !== 0) {
      const lx = p.x + ux * (half + 26);
      const ly = p.y + uy * (half + 26);
      label(ctx, String(deg), lx, ly, 15, tint(0.8), 'center');
    }
  }
  ctx.restore();
}

// The compass tape across the top of the glass.
function drawHeadingTape(ctx, camera, model) {
  const width = 520;
  const x0 = camera.cx - width / 2;
  const y0 = 54;
  ctx.save();
  panel(ctx, x0, y0 - 20, width, 52, 0.34);
  ctx.beginPath();
  ctx.rect(x0, y0 - 20, width, 52);
  ctx.clip();
  const heading = model.headingDegrees;
  for (let deg = Math.floor(heading - 40); deg <= heading + 40; deg += 5) {
    const normalised = ((deg % 360) + 360) % 360;
    const x = camera.cx + (deg - heading) * 6.4;
    const major = normalised % 30 === 0;
    const cardinal = normalised % 90 === 0;
    ctx.strokeStyle = hudColor(major ? 0.9 : 0.45);
    ctx.lineWidth = major ? 1.8 : 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 14);
    ctx.lineTo(x, y0 + (major ? 2 : 7));
    ctx.stroke();
    if (major) {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      const text = cardinal ? names[normalised] : String(normalised).padStart(3, '0');
      label(ctx, text, x, y0 - 8, cardinal ? 17 : 13, cardinal ? hudColor(1) : hudColor(0.75), 'center');
    }
  }
  ctx.restore();
  // The caret and the numeric heading.
  ctx.fillStyle = hudColor(1);
  ctx.beginPath();
  ctx.moveTo(camera.cx, y0 + 22);
  ctx.lineTo(camera.cx - 7, y0 + 32);
  ctx.lineTo(camera.cx + 7, y0 + 32);
  ctx.closePath();
  ctx.fill();
  label(ctx, `HDG ${Math.round(heading).toString().padStart(3, '0')}`, camera.cx, y0 + 44, 20, hudColor(1), 'center', '700');
}

// Airspeed on the left, altitude on the right, both framed and both readable when thumbnailed.
function drawSpeedAndAltitude(ctx, camera, model) {
  const cy = camera.cy;
  const leftX = 64;
  const rightX = camera.width - 64;

  panel(ctx, leftX, cy - 58, 176, 116, 0.34);
  label(ctx, 'SPD', leftX + 14, cy - 36, 14, hudColor(0.75), 'left', '700', 2);
  label(ctx, String(Math.round(model.airspeedKnots)).padStart(3, '0'), leftX + 14, cy + 2, 46, hudColor(1), 'left', '700');
  label(ctx, 'KT', leftX + 146, cy + 22, 16, hudColor(0.8), 'right', '700');
  label(ctx, `M ${(model.speed / 340).toFixed(2)}`, leftX + 14, cy + 40, 14, hudColor(0.7), 'left', '600');

  panel(ctx, rightX - 176, cy - 58, 176, 116, 0.34);
  label(ctx, 'ALT', rightX - 14, cy - 36, 14, hudColor(0.75), 'right', '700', 2);
  label(ctx, Math.round(model.altitudeFeet).toLocaleString('en-US'), rightX - 14, cy + 2, 40, hudColor(1), 'right', '700');
  label(ctx, 'FT', rightX - 14, cy + 40, 16, hudColor(0.8), 'right', '700');
  const vs = Math.round(model.verticalSpeed * 196.85 / 10) * 10;
  label(ctx, `${vs >= 0 ? '+' : ''}${vs} FPM`, rightX - 96, cy + 40, 13, hudColor(0.7), 'right', '600');

  // A bug on each tape marks the safe band.
  label(ctx, model.onGround ? 'WOW' : model.aboveGround < 60 ? 'LOW' : 'AIR', leftX + 146, cy - 36, 13, model.aboveGround < 60 && !model.onGround ? amberColor() : hudColor(0.6), 'right', '700');
}

function drawCentreMark(ctx, camera) {
  const cx = camera.cx;
  const cy = camera.cy;
  ctx.strokeStyle = hudColor(0.9);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = hudColor(0.9);
  ctx.fill();
}

// Throttle, fuel, airframe health and gear: the decisions a sortie is made of.
function drawSystems(ctx, camera, model) {
  const x = camera.width - 264;
  const y = camera.height - 116;
  panel(ctx, x, y, 200, 84, 0.34);
  label(ctx, 'THR', x + 12, y + 16, 12, hudColor(0.75), 'left', '700', 1.5);
  ctx.fillStyle = 'rgba(8,30,34,0.9)';
  ctx.fillRect(x + 52, y + 9, 132, 13);
  const thrColor = model.throttle > 0.92 ? amberColor() : hudColor(0.95);
  ctx.fillStyle = thrColor;
  ctx.fillRect(x + 52, y + 9, 132 * model.throttle, 13);
  label(ctx, `${Math.round(model.throttle * 100)}%`, x + 190, y + 16, 12, hudColor(0.85), 'right', '700');

  label(ctx, 'FUEL', x + 12, y + 38, 12, hudColor(0.75), 'left', '700', 1.5);
  ctx.fillStyle = 'rgba(8,30,34,0.9)';
  ctx.fillRect(x + 52, y + 31, 132, 13);
  ctx.fillStyle = model.fuel < 0.22 ? dangerColor() : hudColor(0.95);
  ctx.fillRect(x + 52, y + 31, 132 * model.fuel, 13);
  label(ctx, `${Math.round(model.fuel * 100)}%`, x + 190, y + 38, 12, hudColor(0.85), 'right', '700');

  label(ctx, `G ${model.gLoad.toFixed(1)}`, x + 12, y + 62, 12, hudColor(0.75), 'left', '700');
  label(ctx, model.gearDown ? 'GEAR DOWN' : 'GEAR UP', x + 92, y + 62, 12, model.gearDown ? amberColor() : hudColor(0.7), 'left', '700');
  label(ctx, `DMG ${Math.round(model.damage * 100)}`, x + 190, y + 62, 12, model.damage > 0.3 ? dangerColor() : hudColor(0.7), 'right', '700');
}

function drawMissionCard(ctx, campaign, model) {
  const x = 32;
  const y = 104;
  panel(ctx, x, y, 452, 92, 0.36);
  label(ctx, campaign.mission.title, x + 16, y + 24, 17, amberColor(0.95), 'left', '700', 1.2);
  label(ctx, campaign.mission.goal, x + 16, y + 50, 13, hudColor(0.78), 'left', '500');
  const gateText = campaign.mission.id === 'gates' ? `GATES ${Math.min(campaign.gatesPassed, campaign.rings.length)}/${campaign.rings.length}` : campaign.mission.id === 'recovery' ? 'RUNWAY IN SIGHT' : 'AIRFIELD READY';
  label(ctx, gateText, x + 16, y + 76, 14, hudColor(1), 'left', '700', 1);
  label(ctx, `SCORE ${campaign.score}`, x + 436, y + 76, 14, hudColor(0.85), 'right', '700');
  const time = campaign.missionTime;
  label(ctx, `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`, x + 436, y + 24, 18, hudColor(0.9), 'right', '700');
}

// The gate designator: a diamond on the next ring, or an arrow at the screen edge.
function drawGateDesignator(ctx, camera, campaign, model) {
  const ring = campaign.targetRing;
  if (!ring) return;
  const cam = camera.toCamera(ring.center, { x: 0, y: 0, z: 0 });
  const dx = ring.center.x - model.position.x;
  const dy = ring.center.y - model.position.y;
  const dz = ring.center.z - model.position.z;
  const dist = Math.hypot(dx, dy, dz);
  const inFront = cam.z > 1;
  const sx = camera.cx + (cam.x / Math.max(cam.z, 1)) * camera.focal;
  const sy = camera.cy - (cam.y / Math.max(cam.z, 1)) * camera.focal;
  const onScreen = inFront && sx > 40 && sx < camera.width - 40 && sy > 60 && sy < camera.height - 60;
  ctx.save();
  ctx.strokeStyle = amberColor(0.95);
  ctx.fillStyle = amberColor(0.95);
  ctx.lineWidth = 2;
  if (onScreen) {
    const size = clamp((ring.radius / Math.max(cam.z, 1)) * camera.focal, 16, 120);
    ctx.beginPath();
    ctx.moveTo(sx, sy - size);
    ctx.lineTo(sx + size, sy);
    ctx.lineTo(sx, sy + size);
    ctx.lineTo(sx - size, sy);
    ctx.closePath();
    ctx.stroke();
    label(ctx, `GATE ${ring.index + 1}`, sx, sy - size - 16, 14, amberColor(1), 'center', '700');
    label(ctx, `${(dist / 1000).toFixed(2)} KM`, sx, sy + size + 18, 14, amberColor(0.9), 'center', '700');
  } else {
    // Point an arrow at the ring along the screen edge.
    const angle = Math.atan2(-(dy / Math.max(dist, 1)), dx / Math.max(dist, 1));
    const rx = camera.width / 2 - 60;
    const ry = camera.height / 2 - 70;
    const ax = camera.cx + Math.cos(angle) * Math.min(rx, ry * 1.6);
    const ay = camera.cy + Math.sin(angle) * Math.min(ry, rx * 0.62);
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    label(ctx, `GATE ${ring.index + 1} · ${(dist / 1000).toFixed(1)} KM`, ax, ay + 26, 13, amberColor(0.95), 'center', '700');
  }
  ctx.restore();
}

function drawWarnings(ctx, camera, model) {
  const warnings = [];
  if (model.speed < 58 && !model.onGround) warnings.push({ text: 'STALL', danger: true });
  if (!model.onGround && model.aboveGround < 70 && model.verticalSpeed < -8) warnings.push({ text: 'PULL UP', danger: true });
  if (model.fuel < 0.15) warnings.push({ text: 'LOW FUEL', danger: false });
  if (!model.gearDown && model.aboveGround < 200) warnings.push({ text: 'GEAR', danger: false });
  warnings.forEach((warning, index) => {
    const y = camera.cy + 120 + index * 34;
    const color = warning.danger ? dangerColor(0.95) : amberColor(0.95);
    ctx.fillStyle = 'rgba(24,6,6,0.45)';
    ctx.beginPath();
    ctx.roundRect(camera.cx - 82, y - 16, 164, 30, 4);
    ctx.fill();
    label(ctx, warning.text, camera.cx, y, 19, color, 'center', '700', 2);
  });
}

function drawMessage(ctx, campaign, camera) {
  if (!campaign.message || campaign.messageTimer <= 0) return;
  const alpha = clamp(campaign.messageTimer / 0.6, 0, 1);
  label(ctx, campaign.message, camera.cx, camera.cy - 150, 26, amberColor(alpha), 'center', '700', 2.5);
}

// The interior view's dashboard: three round gauges and the canopy framing.
export function drawCockpitFrame(ctx, camera, model) {
  const { width, height } = camera;
  // Canopy arches.
  ctx.fillStyle = 'rgba(16,20,24,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width * 0.16, 0);
  ctx.lineTo(width * 0.1, height * 0.55);
  ctx.lineTo(0, height * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, 0);
  ctx.lineTo(width * 0.84, 0);
  ctx.lineTo(width * 0.9, height * 0.55);
  ctx.lineTo(width, height * 0.7);
  ctx.closePath();
  ctx.fill();

  // Glare shield and dashboard.
  const dashTop = height * 0.72;
  const grad = ctx.createLinearGradient(0, dashTop, 0, height);
  grad.addColorStop(0, 'rgba(30,36,42,0.97)');
  grad.addColorStop(1, 'rgba(12,15,18,0.99)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, dashTop + 26);
  ctx.quadraticCurveTo(width / 2, dashTop - 26, width, dashTop + 26);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,132,140,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, dashTop + 26);
  ctx.quadraticCurveTo(width / 2, dashTop - 26, width, dashTop + 26);
  ctx.stroke();

  const gauge = (cx, cy, radius, title, value, unit, fraction) => {
    ctx.save();
    ctx.fillStyle = '#0a0d10';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,192,200,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      ctx.moveTo(cx + Math.cos(a) * (radius - 6), cy + Math.sin(a) * (radius - 6));
      ctx.lineTo(cx + Math.cos(a) * (radius - (i % 5 === 0 ? 18 : 12)), cy + Math.sin(a) * (radius - (i % 5 === 0 ? 18 : 12)));
    }
    ctx.strokeStyle = 'rgba(196,208,214,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const angle = Math.PI * 0.75 + clamp(fraction, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = '#ffb46a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (radius - 16), cy + Math.sin(angle) * (radius - 16));
    ctx.stroke();
    ctx.fillStyle = '#8ef0b8';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200,214,220,0.85)';
    ctx.fillText(title, cx, cy + radius * 0.52);
    ctx.fillStyle = '#e8f6ef';
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(`${value}`, cx, cy - radius * 0.34);
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = 'rgba(160,180,188,0.8)';
    ctx.fillText(unit, cx, cy + radius * 0.78);
    ctx.restore();
  };

  const gy = height - 74;
  gauge(width * 0.34, gy, 54, 'KNOTS', String(Math.round(model.airspeedKnots)), 'IAS', clamp(model.airspeedKnots / 480, 0, 1));
  gauge(width * 0.5, gy, 54, 'ALT', String(Math.round(model.altitudeFeet)), 'FEET', clamp(model.altitudeFeet / 12000, 0, 1));
  gauge(width * 0.66, gy, 54, 'HDG', String(Math.round(model.headingDegrees)).padStart(3, '0'), 'DEG', model.headingDegrees / 360);

  // A couple of switches and a standby compass, for the feel of a flown aircraft.
  ctx.fillStyle = 'rgba(210,220,226,0.75)';
  for (let i = 0; i < 6; i += 1) {
    ctx.fillRect(width * 0.2 + i * 18, dashTop + 18, 9, 12);
  }
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = 'rgba(150,168,176,0.75)';
  ctx.textAlign = 'left';
  ctx.fillText('KESTREL K-7 · NIMBUS REACH', 24, height - 18);
  ctx.textAlign = 'right';
  ctx.fillText(model.gearDown ? 'GEAR DN' : 'GEAR UP', width - 24, height - 18);
}

export function drawHud(ctx, camera, model, campaign, options = {}) {
  ctx.save();
  ctx.lineJoin = 'round';
  if (options.cockpit) drawCockpitFrame(ctx, camera, model);

  const tint = (alpha) => hudColor(alpha);
  drawPitchLadder(ctx, camera, model, tint);
  drawCentreMark(ctx, camera);
  drawHeadingTape(ctx, camera, model);
  drawSpeedAndAltitude(ctx, camera, model);
  drawSystems(ctx, camera, model);
  drawMissionCard(ctx, campaign, model);
  drawGateDesignator(ctx, camera, campaign, model);
  drawWarnings(ctx, camera, model);
  drawMessage(ctx, campaign, camera);

  // Vignette plus a red edge that deepens with airframe damage.
  const vignette = ctx.createRadialGradient(camera.cx, camera.cy, camera.height * 0.42, camera.cx, camera.cy, camera.height * 0.92);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${0.34 + model.damage * 0.2})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, camera.width, camera.height);
  if (model.damage > 0.05) {
    ctx.strokeStyle = dangerColor(model.damage * 0.55);
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, camera.width, camera.height);
  }

  if (campaign.crashed) {
    ctx.fillStyle = 'rgba(18,6,6,0.72)';
    ctx.fillRect(0, 0, camera.width, camera.height);
    label(ctx, 'AIRFRAME LOST', camera.cx, camera.cy - 40, 52, dangerColor(1), 'center', '700', 6);
    label(ctx, `SCORE ${campaign.score}`, camera.cx, camera.cy + 30, 24, hudColor(0.9), 'center', '700');
    label(ctx, 'PRESS R TO FLY AGAIN', camera.cx, camera.cy + 74, 17, hudColor(0.8), 'center', '600', 2);
  } else if (campaign.finished) {
    ctx.fillStyle = 'rgba(4,18,14,0.66)';
    ctx.fillRect(0, 0, camera.width, camera.height);
    label(ctx, 'SORTIE COMPLETE', camera.cx, camera.cy - 60, 46, hudColor(1), 'center', '700', 4);
    label(ctx, `SCORE ${campaign.score}`, camera.cx, camera.cy + 8, 30, amberColor(1), 'center', '700');
    label(ctx, `SORTIE TIME ${Math.floor(campaign.missionTime / 60)}:${String(Math.floor(campaign.missionTime % 60)).padStart(2, '0')}`, camera.cx, camera.cy + 52, 18, hudColor(0.85), 'center', '600', 1.5);
    label(ctx, 'PRESS R TO FLY AGAIN', camera.cx, camera.cy + 92, 16, hudColor(0.7), 'center', '600', 2);
  }
  ctx.restore();
}

export function drawTitle(ctx, camera) {
  const { width, height } = camera;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(4,14,22,0.55)');
  grad.addColorStop(0.5, 'rgba(4,14,22,0.22)');
  grad.addColorStop(1, 'rgba(4,14,22,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  label(ctx, 'KESTREL', width / 2, height * 0.3, 96, hudColor(1), 'center', '700', 18);
  label(ctx, 'RIDGE RUN OVER NIMBUS REACH', width / 2, height * 0.3 + 68, 22, amberColor(0.95), 'center', '600', 6);
  label(ctx, 'W/S pitch  ·  A/D roll  ·  Q/E rudder  ·  SHIFT throttle  ·  G gear  ·  C camera  ·  mouse drag to steer', width / 2, height * 0.62, 16, hudColor(0.85), 'center', '500');
  label(ctx, 'PRESS ENTER TO FLY', width / 2, height * 0.72, 26, amberColor(1), 'center', '700', 4);
  label(ctx, 'Three sorties: lift off, thread the six gates, bring her home.', width / 2, height * 0.79, 15, hudColor(0.7), 'center', '500');
}
