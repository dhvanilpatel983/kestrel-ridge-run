// render/renderer.js
// A small software 3D renderer on the 2D canvas: everything in the world is a flat shaded
// polygon, painted far to near (painter's algorithm) under a rolled sky, a sun and an aerial
// haze that ties the island together. No WebGL, no library, no network.

import { clamp, mixColor, shade, dot } from '../core/math3d.js';
import { faceToWorld } from './aircraft.js';

const HAZE_DAY = { r: 193, g: 212, b: 228 };

const SKY_ZENITH = { r: 44, g: 92, b: 148 };
const SKY_MID = { r: 120, g: 172, b: 214 };
const SKY_HORIZON = { r: 214, g: 226, b: 234 };
const SEA_NEAR = { r: 26, g: 62, b: 96 };
const SEA_FAR = { r: 132, g: 168, b: 194 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.items = [];
    this.count = 0;
    this.colorCache = new Map();
    this.fogNear = 3400;
    this.fogFar = 17000;
  }

  // ---- primitive collection -------------------------------------------------------------

  item(index) {
    let it = this.items[index];
    if (!it) {
      it = { depth: 0, n: 0, xs: new Float32Array(12), ys: new Float32Array(12), color: '#000', alpha: 1, glow: null, kind: 0 };
      this.items[index] = it;
    }
    return it;
  }

  // Fog and sun shading folded into one colour, quantised so the string cache stays small.
  fogged(base, light, depth, emissive) {
    const fog = clamp((depth - this.fogNear) / (this.fogFar - this.fogNear), 0, 1);
    const shadeBucket = Math.round(clamp(light, 0.35, 1.5) * 8) / 8;
    const fogBucket = Math.round(fog * 18) / 18;
    const key = `${base.r},${base.g},${base.b}|${shadeBucket}|${fogBucket}|${emissive ? 1 : 0}`;
    let out = this.colorCache.get(key);
    if (!out) {
      let color = shade(base, shadeBucket);
      if (emissive) color = mixColor(color, { r: 255, g: 255, b: 255 }, 0.25);
      color = mixColor(color, HAZE_DAY, fogBucket * 0.8);
      out = `rgb(${color.r},${color.g},${color.b})`;
      this.colorCache.set(key, out);
    }
    return out;
  }

  addPolygon(worldVerts, base, camera, scene, options = {}) {
    const cam = { x: 0, y: 0, z: 0 };
    const screen = { x: 0, y: 0, z: 0 };
    const n = worldVerts.length;
    const xs = [];
    const ys = [];
    let depthSum = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const raw = worldVerts[i];
      // The terrain and scenery meshes keep vertices as [x, y, z]; aircraft faces build objects.
      const p = Array.isArray(raw) ? { x: raw[0], y: raw[1], z: raw[2] } : raw;
      camera.toCamera(p, cam);
      if (cam.z <= camera.near) return;
      if (!camera.toScreen(cam, screen)) return;
      xs.push(screen.x);
      ys.push(screen.y);
      depthSum += cam.z;
      if (screen.x < minX) minX = screen.x;
      if (screen.x > maxX) maxX = screen.x;
      if (screen.y < minY) minY = screen.y;
      if (screen.y > maxY) maxY = screen.y;
    }
    if (maxX < -40 || minX > this.width + 40 || maxY < -40 || minY > this.height + 40) return;
    if (maxX - minX < 1.2 && maxY - minY < 1.2) return;
    const depth = depthSum / n;
    if (depth > this.fogFar) return;

    let light = 1;
    if (options.normal && !options.emissive) {
      light = 0.46 + 0.92 * Math.max(0, dot(options.normal, scene.sun.direction));
    } else if (options.emissive) {
      light = 1;
    } else {
      light = 0.78 + 0.3 * Math.max(0, scene.sun.direction.y);
    }

    const it = this.item(this.count);
    it.depth = depth;
    it.n = n;
    for (let i = 0; i < n; i += 1) {
      it.xs[i] = xs[i];
      it.ys[i] = ys[i];
    }
    it.color = this.fogged(base, light, depth, options.emissive);
    it.alpha = options.alpha ?? 1;
    it.kind = 0;
    this.count += 1;
  }

  // A billboard: clouds, engine glow, the ring marker flare.
  addGlow(worldPos, radius, inner, outer, camera, scene, alpha = 0.5) {
    const cam = { x: 0, y: 0, z: 0 };
    const screen = { x: 0, y: 0, z: 0 };
    camera.toCamera(worldPos, cam);
    if (cam.z <= camera.near) return;
    if (!camera.toScreen(cam, screen)) return;
    if (screen.x < -radius * 4 || screen.x > this.width + radius * 4) return;
    if (screen.y < -radius * 4 || screen.y > this.height + radius * 4) return;
    const scale = (radius / cam.z) * camera.focal;
    if (scale < 2) return;
    const fog = clamp((cam.z - this.fogNear) / (this.fogFar - this.fogNear), 0, 1);
    const it = this.item(this.count);
    it.depth = cam.z;
    it.n = 0;
    it.xs[0] = screen.x;
    it.ys[0] = screen.y;
    it.xs[1] = scale;
    it.color = `rgba(${inner.r},${inner.g},${inner.b},${clamp(alpha * (1 - fog * 0.9), 0, 1)})`;
    it.glow = `rgba(${outer.r},${outer.g},${outer.b},0)`;
    it.kind = 1;
    this.count += 1;
  }

  // ---- the frame ------------------------------------------------------------------------

  render(scene) {
    // Three passes in a fixed order: the ground, then the paved airfield laid on top of it, then
    // everything standing on the ground. Within a pass, distance decides.
    this.drawSky(scene);
    this.count = 0;
    this.collectTerrain(scene);
    this.flush();
    this.count = 0;
    this.collectRunway(scene);
    this.flush();
    this.count = 0;
    this.collectProps(scene);
    this.collectAircraft(scene);
    this.collectClouds(scene);
    this.flush();
  }

  flush() {
    const ctx = this.ctx;
    const active = this.items.slice(0, this.count);
    active.sort((a, b) => b.depth - a.depth);

    for (let i = 0; i < active.length; i += 1) {
      const it = active[i];
      if (it.kind === 1) {
        const r = it.xs[1];
        const grad = ctx.createRadialGradient(it.xs[0], it.ys[0], 0, it.xs[0], it.ys[0], r);
        grad.addColorStop(0, it.color);
        grad.addColorStop(1, it.glow);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(it.xs[0], it.ys[0], r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(it.xs[0], it.ys[0]);
      for (let k = 1; k < it.n; k += 1) ctx.lineTo(it.xs[k], it.ys[k]);
      ctx.closePath();
      ctx.fillStyle = it.color;
      ctx.fill();
      // A hairline of the same colour hides the seams between neighbouring polygons.
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Sky, sun and sea, all drawn in the camera's rolled frame so the horizon tilts with the wing.
  drawSky(scene) {
    const ctx = this.ctx;
    const camera = scene.camera;
    const basis = camera.basis;
    const { width, height } = this;

    // A far point on the horizon straight ahead, and the screen direction of world "right".
    let hf = { x: basis.fwd.x, y: 0, z: basis.fwd.z };
    const hfLen = Math.hypot(hf.x, hf.z);
    if (hfLen < 1e-4) hf = { x: basis.up.x, y: 0, z: basis.up.z };
    const hl = Math.hypot(hf.x, hf.z) || 1;
    hf = { x: hf.x / hl, y: 0, z: hf.z / hl };
    const farPoint = { x: camera.position.x + hf.x * 400000, y: camera.position.y, z: camera.position.z + hf.z * 400000 };

    const cam = { x: 0, y: 0, z: 0 };
    const scr = { x: 0, y: 0, z: 0 };
    camera.toCamera(farPoint, cam);
    let hx = 0;
    let hy = 0;
    if (camera.toScreen(cam, scr)) {
      hx = scr.x;
      hy = scr.y;
    } else {
      hy = cam.y > 0 ? height + 2000 : -2000;
      hx = width / 2;
    }

    // Screen-space horizon direction and its "up" normal.
    const rightInView = camera.directionToCamera(basis.right, cam);
    let dx = rightInView.x;
    let dy = -rightInView.y;
    const dLen = Math.hypot(dx, dy) || 1;
    dx /= dLen;
    dy /= dLen;
    let nx = -dy;
    let ny = dx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }

    const skyTop = { x: hx + nx * 2200, y: hy + ny * 2200 };
    const skyGrad = ctx.createLinearGradient(hx, hy, skyTop.x, skyTop.y);
    skyGrad.addColorStop(0, `rgb(${SKY_HORIZON.r},${SKY_HORIZON.g},${SKY_HORIZON.b})`);
    skyGrad.addColorStop(0.22, `rgb(${SKY_MID.r},${SKY_MID.g},${SKY_MID.b})`);
    skyGrad.addColorStop(1, `rgb(${SKY_ZENITH.r},${SKY_ZENITH.g},${SKY_ZENITH.b})`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Sun: a warm glow and a disc, only when it is in front of the camera.
    const sunCam = camera.directionToCamera(scene.sun.direction, cam);
    if (sunCam.z > 0.05) {
      const sx = width / 2 + (sunCam.x / sunCam.z) * camera.focal;
      const sy = height / 2 - (sunCam.y / sunCam.z) * camera.focal;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 210);
      glow.addColorStop(0, 'rgba(255,248,222,0.9)');
      glow.addColorStop(0.14, 'rgba(255,228,170,0.42)');
      glow.addColorStop(0.5, 'rgba(255,212,158,0.1)');
      glow.addColorStop(1, 'rgba(255,200,146,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 220, sy - 220, 440, 440);
      ctx.beginPath();
      ctx.arc(sx, sy, 34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,250,232,0.95)';
      ctx.fill();
    }

    // Sea: everything below the horizon, darker toward the camera.
    const seaTop = { x: hx - nx * 2400, y: hy - ny * 2400 };
    const seaGrad = ctx.createLinearGradient(hx, hy, seaTop.x, seaTop.y);
    seaGrad.addColorStop(0, `rgb(${SEA_FAR.r},${SEA_FAR.g},${SEA_FAR.b})`);
    seaGrad.addColorStop(0.35, `rgb(74,118,150)`);
    seaGrad.addColorStop(1, `rgb(${SEA_NEAR.r},${SEA_NEAR.g},${SEA_NEAR.b})`);
    ctx.fillStyle = seaGrad;
    ctx.beginPath();
    ctx.moveTo(hx + dx * 6000, hy + dy * 6000);
    ctx.lineTo(hx - dx * 6000, hy - dy * 6000);
    ctx.lineTo(hx - dx * 6000 - nx * 6000, hy - dy * 6000 - ny * 6000);
    ctx.lineTo(hx + dx * 6000 - nx * 6000, hy + dy * 6000 - ny * 6000);
    ctx.closePath();
    ctx.fill();
  }

  collectTerrain(scene) {
    const camera = scene.camera;
    const terrain = scene.terrain;

    for (let i = 0; i < terrain.quads.length; i += 1) {
      const quad = terrain.quads[i];
      const dx = quad.centerX - camera.position.x;
      const dz = quad.centerZ - camera.position.z;
      const dy = quad.centerY - camera.position.y;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > this.fogFar * this.fogFar) continue;
      this.addPolygon(quad.verts, quad.color, camera, scene, { normal: quad.normal });
    }

  }

  collectRunway(scene) {
    const camera = scene.camera;
    for (let i = 0; i < scene.runwayParts.length; i += 1) {
      const part = scene.runwayParts[i];
      this.addPolygon(part.verts, part.color, camera, scene, { normal: { x: 0, y: 1, z: 0 }, emissive: part.emissive });
    }
  }

  collectProps(scene) {
    const camera = scene.camera;

    for (let i = 0; i < scene.rings.length; i += 1) {
      const ring = scene.rings[i];
      const active = ring === scene.targetRing;
      const dist = Math.hypot(ring.center.x - camera.position.x, ring.center.y - camera.position.y, ring.center.z - camera.position.z);
      if (dist > 9000) continue;
      for (let k = 0; k < ring.quads.length; k += 1) {
        const part = ring.quads[k];
        const color = active ? part.color : { r: 128, g: 148, b: 158 };
        this.addPolygon(part.verts, color, camera, scene, { normal: { x: 0, y: 1, z: 0 }, emissive: active ? 0.85 : 0.15 });
      }
    }

    // Conifers: a trunk line and two stacked triangles, culled by distance.
    for (let i = 0; i < scene.forest.length; i += 1) {
      const tree = scene.forest[i];
      const dx = tree.x - camera.position.x;
      const dz = tree.z - camera.position.z;
      const dy = tree.y - camera.position.y;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > 4200 * 4200) continue;
      if (camera.depthOf(tree) < 0) continue;
      const s = tree.scale;
      const top = { x: tree.x, y: tree.y + 26 * s, z: tree.z };
      const base = { x: tree.x, y: tree.y + 6 * s, z: tree.z };
      const w = 6.4 * s;
      const canopy = [
        { x: tree.x - w, y: base.y, z: tree.z + w * 0.4 },
        { x: tree.x + w, y: base.y, z: tree.z + w * 0.4 },
        top,
        { x: tree.x, y: base.y, z: tree.z - w * 0.7 },
      ];
      const green = tree.tone > 0.55 ? { r: 58, g: 92, b: 62 } : { r: 46, g: 78, b: 54 };
      this.addPolygon([canopy[0], canopy[1], canopy[3]], green, camera, scene, { normal: { x: 0, y: 1, z: 0 } });
      this.addPolygon([canopy[2], canopy[1], canopy[3]], green, camera, scene, { normal: { x: 0.4, y: 0.8, z: 0 } });
      this.addPolygon([canopy[0], canopy[3], canopy[2]], green, camera, scene, { normal: { x: -0.4, y: 0.8, z: 0 } });
    }

    for (let i = 0; i < scene.windsock.length; i += 1) {
      const part = scene.windsock[i];
      this.addPolygon(part.verts, part.color, camera, scene, { normal: { x: 0, y: 1, z: 0 } });
    }

    // The active ring throws a flare so a pilot can spot the next gate from far out.
    if (scene.targetRing) {
      const ring = scene.targetRing;
      this.addGlow(ring.center, ring.radius * 0.9, { r: 150, g: 240, b: 255 }, { r: 120, g: 220, b: 255 }, camera, scene, 0.22);
    }
  }

  collectAircraft(scene) {
    const aircraft = scene.aircraft;
    if (!aircraft || !aircraft.visible) return;
    const camera = scene.camera;
    const basis = aircraft.basis;
    const faces = aircraft.faces;
    const buf = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < faces.length; i += 1) {
      const face = faces[i];
      faceToWorld(face.points, aircraft.position, basis, buf);
      const world = [];
      for (let k = 0; k < face.points.length; k += 1) world.push({ x: buf[k][0], y: buf[k][1], z: buf[k][2] });
      // A face's normal turns with the airframe.
      const n = face.normal;
      const worldNormal = {
        x: basis.right.x * n.x + basis.up.x * n.y + basis.fwd.x * n.z,
        y: basis.right.y * n.x + basis.up.y * n.y + basis.fwd.y * n.z,
        z: basis.right.z * n.x + basis.up.z * n.y + basis.fwd.z * n.z,
      };
      const towardCamera = {
        x: camera.position.x - aircraft.position.x,
        y: camera.position.y - aircraft.position.y,
        z: camera.position.z - aircraft.position.z,
      };
      if (dot(worldNormal, towardCamera) <= 0) continue;
      this.addPolygon(world, face.color, camera, scene, { normal: worldNormal, emissive: face === faces[faces.length - 1] ? 0.9 : 0 });
    }
    // Engine plume behind the nozzle.
    const plume = {
      x: aircraft.position.x - basis.fwd.x * 7.4,
      y: aircraft.position.y - basis.fwd.y * 7.4,
      z: aircraft.position.z - basis.fwd.z * 7.4,
    };
    if (scene.throttle > 0.05) {
      this.addGlow(plume, 2.6 + scene.throttle * 3.4, { r: 255, g: 196, b: 120 }, { r: 255, g: 120, b: 60 }, camera, scene, 0.45 * scene.throttle);
    }
  }

  collectClouds(scene) {
    const camera = scene.camera;
    for (let i = 0; i < scene.clouds.length; i += 1) {
      const cloud = scene.clouds[i];
      const dist = Math.hypot(cloud.x - camera.position.x, cloud.y - camera.position.y, cloud.z - camera.position.z);
      if (dist > 11000) continue;
      this.addGlow({ x: cloud.x, y: cloud.y, z: cloud.z }, cloud.scale, { r: 250, g: 250, b: 252 }, { r: 236, g: 242, b: 250 }, camera, scene, 0.5);
      this.addGlow({ x: cloud.x + cloud.scale * 0.5, y: cloud.y + cloud.scale * 0.12, z: cloud.z + cloud.scale * 0.3 }, cloud.scale * 0.7, { r: 246, g: 248, b: 250 }, { r: 232, g: 240, b: 250 }, camera, scene, 0.36);
    }
  }
}
