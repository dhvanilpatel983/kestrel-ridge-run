// core/math3d.js
// Small vector, camera and noise maths shared by the flight model and the software 3D renderer.
// World axes: +x east, +y up, +z north. A heading of 0 faces north and 90 faces east.

export const DEG = Math.PI / 180;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAngle(a) {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

export function mixColor(a, b, t) {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

export function rgb(color, alpha) {
  return alpha === undefined || alpha >= 1
    ? `rgb(${color.r},${color.g},${color.b})`
    : `rgba(${color.r},${color.g},${color.b},${alpha})`;
}

export function shade(color, factor) {
  return {
    r: clamp(Math.round(color.r * factor), 0, 255),
    g: clamp(Math.round(color.g * factor), 0, 255),
    b: clamp(Math.round(color.b * factor), 0, 255),
  };
}

// Orthonormal aircraft basis from yaw (heading), pitch and roll, all in radians.
export function headingBasis(yaw, pitch, roll) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const fwd = { x: sy * cp, y: sp, z: cy * cp };
  const right0 = { x: cy, y: 0, z: -sy };
  const up0 = { x: -sy * sp, y: cp, z: -cy * sp };
  return {
    fwd,
    right: {
      x: right0.x * cr + up0.x * sr,
      y: right0.y * cr + up0.y * sr,
      z: right0.z * cr + up0.z * sr,
    },
    up: {
      x: up0.x * cr - right0.x * sr,
      y: up0.y * cr - right0.y * sr,
      z: up0.z * cr - right0.z * sr,
    },
  };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// A pinhole camera: position plus an orthonormal basis, projecting to canvas pixels.
export class Camera {
  constructor() {
    this.position = { x: 0, y: 60, z: 0 };
    this.basis = headingBasis(0, 0, 0);
    this.fov = 64 * DEG;
    this.width = 1280;
    this.height = 720;
    this.near = 1.5;
    this.setSize(1280, 720);
    this._scratch = { x: 0, y: 0, z: 0, visible: false };
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.focal = height / 2 / Math.tan(this.fov / 2);
    this.cx = width / 2;
    this.cy = height / 2;
  }

  place(position, basis) {
    this.position = position;
    this.basis = basis;
  }

  // World point into camera space: x right, y up, z forward.
  toCamera(point, out) {
    const b = this.basis;
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    const dz = point.z - this.position.z;
    out.x = dx * b.right.x + dy * b.right.y + dz * b.right.z;
    out.y = dx * b.up.x + dy * b.up.y + dz * b.up.z;
    out.z = dx * b.fwd.x + dy * b.fwd.y + dz * b.fwd.z;
    return out;
  }

  // A direction (no translation) into camera space, for the sun and stars.
  directionToCamera(dir, out) {
    const b = this.basis;
    out.x = dir.x * b.right.x + dir.y * b.right.y + dir.z * b.right.z;
    out.y = dir.x * b.up.x + dir.y * b.up.y + dir.z * b.up.z;
    out.z = dir.x * b.fwd.x + dir.y * b.fwd.y + dir.z * b.fwd.z;
    return out;
  }

  // Camera space to pixels. Returns false when the point is behind the near plane.
  toScreen(cam, out) {
    if (cam.z <= this.near) return false;
    out.x = this.cx + (cam.x / cam.z) * this.focal;
    out.y = this.cy - (cam.y / cam.z) * this.focal;
    out.z = cam.z;
    return true;
  }

  projectPoint(point, out) {
    const cam = this.toCamera(point, this._scratch);
    return this.toScreen(cam, out);
  }

  // How far forward a world point lies along the view axis (cheap frustum culling).
  depthOf(point) {
    const b = this.basis;
    return (
      (point.x - this.position.x) * b.fwd.x +
      (point.y - this.position.y) * b.fwd.y +
      (point.z - this.position.z) * b.fwd.z
    );
  }
}

// Deterministic value noise, so the island is the same on every load and in every screenshot.
function hash2(ix, iy, seed) {
  let h = ix * 374761393 + iy * 668265263 + seed * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}

export function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm(x, y, seed, octaves = 5) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 31) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / total;
}
