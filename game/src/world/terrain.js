// world/terrain.js
// The island of Nimbus Reach: a deterministic heightfield with an airfield plateau carved into it,
// turned into a low-poly quad mesh the renderer paints far to near, plus the height query the
// flight model uses for ground contact.

import { fbm, smoothstep, clamp, lerp } from '../core/math3d.js';

export const SEA_LEVEL = 0;
export const PLATEAU_Y = 46;
export const ISLAND_RADIUS = 3400;
export const AIRFIELD = { x: 0, z: 0, radius: 520 };

const SAND = { r: 214, g: 199, b: 160 };
const GRASS = { r: 92, g: 126, b: 78 };
const STEEP = { r: 96, g: 92, b: 84 };
const ROCK = { r: 122, g: 116, b: 110 };
const SNOW = { r: 233, g: 238, b: 244 };

export class Terrain {
  constructor(seed = 17) {
    this.seed = seed;
    this.cells = 96;
    this.extent = 12000;
    this.cell = this.extent / this.cells;
    this.quads = this.buildQuads();
  }

  // Analytic height, used for the mesh and for every ground query in flight.
  heightAt(x, z) {
    const r = Math.hypot(x, z);
    const island = smoothstep(1.04, 0.44, r / ISLAND_RADIUS);
    const base = fbm(x * 0.00092, z * 0.00092, this.seed, 5);
    const ridge = Math.pow(clamp(base, 0, 1), 1.5);
    const inland = fbm(x * 0.0026, z * 0.0026, this.seed + 91, 3);
    let h = island * (78 + ridge * 660 + inland * 90) - (1 - island) * 120;

    // A flat shelf for the runway, and a corridor stretching north and south of it so the
    // approach and the climb-out are clear of hills, both blended into the ridge around them.
    const shelfDistance = Math.hypot((x - AIRFIELD.x) * 1.0, (z - AIRFIELD.z) * 0.34);
    const shelf = smoothstep(AIRFIELD.radius * 2.6, AIRFIELD.radius * 0.92, shelfDistance);
    h = lerp(h, PLATEAU_Y, shelf);
    return h;
  }

  // Ground colour for a face: sand at the shore, grass on the slopes, rock on the steeps, snow high up.
  palette(height, slope, tint) {
    if (height < 4) return SAND;
    if (height < 150) {
      const t = clamp((height - 4) / 146, 0, 1);
      const green = { r: lerp(SAND.r, GRASS.r, t), g: lerp(SAND.g, GRASS.g, t), b: lerp(SAND.b, GRASS.b, t) };
      const varied = 0.86 + tint * 0.28;
      if (slope > 0.52) return { r: lerp(green.r, STEEP.r, 0.65), g: lerp(green.g, STEEP.g, 0.65), b: lerp(green.b, STEEP.b, 0.65) };
      return { r: Math.round(green.r * varied), g: Math.round(green.g * varied), b: Math.round(green.b * varied) };
    }
    if (height < 330) {
      const t = smoothstep(150, 330, height);
      const mix = { r: lerp(GRASS.r, ROCK.r, t), g: lerp(GRASS.g, ROCK.g, t), b: lerp(GRASS.b, ROCK.b, t) };
      const varied = 0.88 + tint * 0.24;
      return { r: Math.round(mix.r * varied), g: Math.round(mix.g * varied), b: Math.round(mix.b * varied) };
    }
    if (height < 470) {
      const t = smoothstep(330, 470, height);
      return { r: lerp(ROCK.r, SNOW.r, t), g: lerp(ROCK.g, SNOW.g, t), b: lerp(ROCK.b, SNOW.b, t) };
    }
    return SNOW;
  }

  buildQuads() {
    const n = this.cells;
    const half = this.extent / 2;
    const quads = [];
    const heights = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j += 1) {
      for (let i = 0; i <= n; i += 1) {
        const x = -half + i * this.cell;
        const z = -half + j * this.cell;
        heights[j * (n + 1) + i] = this.heightAt(x, z);
      }
    }
    const at = (i, j) => heights[j * (n + 1) + i];
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x0 = -half + i * this.cell;
        const z0 = -half + j * this.cell;
        const x1 = x0 + this.cell;
        const z1 = z0 + this.cell;
        const h00 = at(i, j);
        const h10 = at(i + 1, j);
        const h11 = at(i + 1, j + 1);
        const h01 = at(i, j + 1);
        const top = Math.max(h00, h10, h11, h01);
        if (top < 1) continue; // under the sea, the water plane covers it
        const slope = Math.min(1, (Math.abs(h10 - h00) + Math.abs(h01 - h00) + Math.abs(h11 - h10) + Math.abs(h11 - h01)) / (2 * this.cell) * 1.4);
        const tint = fbm(x0 * 0.01, z0 * 0.01, this.seed + 7, 2);
        const color = this.palette((h00 + h10 + h11 + h01) / 4, slope, tint);
        // Normal from the quad's diagonals, used for the sun shading in the renderer.
        const ax = this.cell;
        const az = this.cell;
        const nx = (h00 + h01) / 2 - (h10 + h11) / 2;
        const nz = (h00 + h10) / 2 - (h01 + h11) / 2;
        const len = Math.hypot(nx, ax, nz) || 1;
        quads.push({
          verts: [
            [x0, h00, z0],
            [x1, h10, z0],
            [x1, h11, z1],
            [x0, h01, z1],
          ],
          centerX: x0 + ax / 2,
          centerY: (h00 + h10 + h11 + h01) / 4,
          centerZ: z0 + az / 2,
          normal: { x: nx / len, y: ax / len, z: nz / len },
          color,
        });
      }
    }
    return quads;
  }

  // Height of the surface under a point, including the water plane.
  groundAt(x, z) {
    return Math.max(SEA_LEVEL, this.heightAt(x, z));
  }
}
