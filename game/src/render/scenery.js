// render/scenery.js
// Everything that stands on the island besides the terrain: the paved runway with its markings,
// the glowing mission rings, the low-poly conifer forest, cloud banks and the windsock.

import { fbm, valueNoise } from '../core/math3d.js';
import { PLATEAU_Y, AIRFIELD } from '../world/terrain.js';

export const RUNWAY = {
  x: AIRFIELD.x,
  z: AIRFIELD.z,
  y: PLATEAU_Y + 0.35,
  width: 46,
  length: 1600,
  heading: 0, // runs north-south, aligned with +z
};

// Rectangles that make up the airstrip: asphalt, shoulders, centreline dashes and threshold bars.
export function buildRunway() {
  const parts = [];
  const y = RUNWAY.y;
  const { x, z, width, length } = RUNWAY;
  const halfW = width / 2;
  const halfL = length / 2;

  // The strip is tiled along its length so the painter's sort keeps it lying on the ground
  // instead of hiding under the terrain tiles that sit nearer the camera.
  const tile = 40;
  for (let d = -halfL - 30; d < halfL + 30; d += tile) {
    const z0 = z + d;
    const z1 = z + Math.min(d + tile, halfL + 30);
    parts.push({
      label: 'apron',
      color: { r: 78, g: 82, b: 74 },
      verts: [
        [x - halfW - 18, y - 0.3, z0],
        [x + halfW + 18, y - 0.3, z0],
        [x + halfW + 18, y - 0.3, z1],
        [x - halfW - 18, y - 0.3, z1],
      ],
    });
    if (d < halfL) {
      parts.push({
        label: 'runway',
        color: { r: 58, g: 61, b: 66 },
        verts: [
          [x - halfW, y, z0],
          [x + halfW, y, z0],
          [x + halfW, y, z1],
          [x - halfW, y, z1],
        ],
      });
    }
  }

  const white = { r: 232, g: 234, b: 232 };
  const amber = { r: 228, g: 178, b: 74 };
  // Centreline dashes.
  for (let d = -halfL + 90; d < halfL - 90; d += 90) {
    parts.push({
      label: 'centreline',
      color: white,
      verts: [
        [x - 1.1, y + 0.02, z + d],
        [x + 1.1, y + 0.02, z + d],
        [x + 1.1, y + 0.02, z + d + 46],
        [x - 1.1, y + 0.02, z + d + 46],
      ],
    });
  }
  // Threshold piano keys at both ends.
  const key = (zBase, dir) => {
    for (let i = -3; i <= 3; i += 1) {
      const cx = x + i * 5.4;
      parts.push({
        label: 'threshold',
        color: white,
        verts: [
          [cx - 1.7, y + 0.03, zBase],
          [cx + 1.7, y + 0.03, zBase],
          [cx + 1.7, y + 0.03, zBase + dir * 34],
          [cx - 1.7, y + 0.03, zBase + dir * 34],
        ],
      });
    }
  };
  key(z - halfL + 12, 1);
  key(z + halfL - 12, -1);

  // Runway edge lights.
  for (let d = -halfL; d <= halfL; d += 80) {
    for (const side of [-1, 1]) {
      parts.push({
        label: 'edge light',
        color: amber,
        emissive: 0.55,
        verts: [
          [x + side * (halfW + 2.2) - 1.1, y + 0.3, z + d - 1.1],
          [x + side * (halfW + 2.2) + 1.1, y + 0.3, z + d - 1.1],
          [x + side * (halfW + 2.2) + 1.1, y + 0.3, z + d + 1.1],
          [x + side * (halfW + 2.2) - 1.1, y + 0.3, z + d + 1.1],
        ],
      });
    }
  }
  return parts;
}

// A ring is a torus in a vertical plane, facing along `heading`; the player flies through it.
export function buildRing(center, heading, radius = 46) {
  const segments = 20;
  const thickness = 5.2;
  const quads = [];
  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const sideX = Math.cos(heading);
  const sideZ = -Math.sin(heading);
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const ringPoint = (angle, radiusOffset) => {
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      return [
        center.x + sideX * ux * (radius + radiusOffset),
        center.y + uy * (radius + radiusOffset),
        center.z + sideZ * ux * (radius + radiusOffset),
      ];
    };
    const verts = [ringPoint(a0, -thickness), ringPoint(a0, thickness), ringPoint(a1, thickness), ringPoint(a1, -thickness)];
    quads.push({ label: 'ring', color: { r: 96, g: 226, b: 232 }, emissive: 0.8, verts });
  }
  // Four short amber bars on the ring's inner face, so the gate reads as a target and not a hoop.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const inner = radius - thickness - 1;
    const outer = radius - thickness - 9;
    const halfWidth = 2.4;
    quads.push({
      label: 'ring bar',
      color: { r: 240, g: 186, b: 96 },
      emissive: 0.5,
      verts: [
        [center.x + sideX * (ux * inner - halfWidth), center.y + uy * inner - halfWidth, center.z + sideZ * (ux * inner - halfWidth)],
        [center.x + sideX * (ux * inner + halfWidth), center.y + uy * inner + halfWidth, center.z + sideZ * (ux * inner + halfWidth)],
        [center.x + sideX * (ux * outer + halfWidth), center.y + uy * outer + halfWidth, center.z + sideZ * (ux * outer + halfWidth)],
        [center.x + sideX * (ux * outer - halfWidth), center.y + uy * outer - halfWidth, center.z + sideZ * (ux * outer - halfWidth)],
      ],
    });
  }
  return {
    center,
    heading,
    radius,
    dir: { x: dirX, y: 0, z: dirZ },
    quads,
    passed: false,
  };
}

// Scattered conifers, placed where the island is green and outside the airfield shelf.
export function buildForest(terrain, count = 420, seed = 5) {
  const trees = [];
  let attempts = 0;
  while (trees.length < count && attempts < count * 30) {
    attempts += 1;
    const angle = valueNoise(trees.length * 0.37, attempts * 0.11, seed) * Math.PI * 2;
    const radius = 260 + Math.pow(valueNoise(attempts * 0.53, trees.length * 0.19, seed + 3), 0.7) * 2600;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x - AIRFIELD.x, z - AIRFIELD.z) < AIRFIELD.radius * 2.6) continue;
    const y = terrain.heightAt(x, z);
    if (y < 60 || y > 340) continue;
    if (terrain.heightAt(x + 22, z + 22) < 30) continue;
    const scale = 0.7 + fbm(x * 0.01, z * 0.01, seed, 2) * 0.9;
    trees.push({ x, y, z, scale, tone: valueNoise(x * 0.05, z * 0.05, seed + 11) });
  }
  return trees;
}

// Cloud banks as billboards; the renderer sorts them with the rest of the scene.
export function buildClouds(count = 26, seed = 21) {
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    const n1 = valueNoise(i * 1.7, 0.5, seed);
    const n2 = valueNoise(i * 0.9, 3.1, seed + 5);
    const angle = n1 * Math.PI * 2;
    const radius = 900 + n2 * 5200;
    clouds.push({
      x: Math.cos(angle) * radius,
      y: 620 + valueNoise(i * 0.31, 7.7, seed) * 900,
      z: Math.sin(angle) * radius,
      scale: 220 + valueNoise(i * 0.71, 1.3, seed) * 320,
    });
  }
  return clouds;
}

export function buildWindsock() {
  const x = AIRFIELD.x + RUNWAY.width / 2 + 26;
  const z = AIRFIELD.z - RUNWAY.length / 2 + 60;
  const y = PLATEAU_Y;
  const pole = [
    { label: 'windsock pole', color: { r: 196, g: 200, b: 204 }, verts: [[x - 1.4, y, z], [x + 1.4, y, z], [x + 1.4, y + 26, z], [x - 1.4, y + 26, z]] },
  ];
  const sock = [];
  for (let i = 0; i < 4; i += 1) {
    const z0 = z + 1.6 + i * 5.4;
    const z1 = z0 + 5.2;
    const r0 = 3.6 - i * 0.5;
    const r1 = 3.6 - (i + 1) * 0.5;
    sock.push({
      label: 'windsock',
      color: i % 2 === 0 ? { r: 232, g: 116, b: 62 } : { r: 238, g: 234, b: 226 },
      verts: [
        [x - r0, y + 24 - r0 * 0.2, z0],
        [x + r0, y + 24 - r0 * 0.2, z0],
        [x + r1, y + 24 - r1 * 0.2, z1],
        [x - r1, y + 24 - r1 * 0.2, z1],
      ],
    });
  }
  return pole.concat(sock).map((part) => ({ ...part, verts: part.verts }));
}
