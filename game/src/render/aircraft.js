// render/aircraft.js
// The Kestrel K-7: a low-poly delta-wing airframe built from flat shaded polygons in aircraft
// local space (x right, y up, z forward). Each face carries its own base colour and a shading
// normal so the sun lights the airframe consistently with the terrain.

const HULL = { r: 170, g: 182, b: 196 };
const HULL_DARK = { r: 62, g: 74, b: 88 };
const ACCENT = { r: 214, g: 84, b: 52 };
const GLASS = { r: 32, g: 62, b: 84 };
const ENGINE = { r: 250, g: 176, b: 96 };

// One face: four corners (a quad, or a triangle when d is repeated) and its outward normal.
function quad(a, b, c, d, color, normal) {
  return { points: [a, b, c, d], color, normal };
}

export function buildKestrel() {
  const faces = [];
  const nose = [0, 0.1, 6.4];
  const tailTop = [0, 1.05, -5.4];
  const tailBot = [0, -0.65, -5.4];

  // Fuselage: four long faces from nose to tail, a slim diamond section.
  const leftMid = [-1.05, 0.05, -1.2];
  const rightMid = [1.05, 0.05, -1.2];
  const topMid = [0, 0.85, -0.6];
  const botMid = [0, -0.55, -0.4];
  faces.push(quad(nose, topMid, tailTop, leftMid, HULL, { x: -0.5, y: 0.8, z: 0.2 }));
  faces.push(quad(nose, rightMid, tailTop, topMid, HULL, { x: 0.5, y: 0.8, z: 0.2 }));
  faces.push(quad(nose, leftMid, tailBot, botMid, HULL_DARK, { x: -0.5, y: -0.7, z: 0.2 }));
  faces.push(quad(nose, botMid, tailBot, rightMid, HULL_DARK, { x: 0.5, y: -0.7, z: 0.2 }));

  // Cockpit canopy sitting on the spine, glassy and slightly raised.
  faces.push(quad([0, 0.92, 2.6], [0.62, 0.86, 1.5], [0.5, 1.32, 0.1], [0, 1.42, 0.15], GLASS, { x: 0.4, y: 0.9, z: 0 }));
  faces.push(quad([0, 0.92, 2.6], [0, 1.42, 0.15], [-0.5, 1.32, 0.1], [-0.62, 0.86, 1.5], GLASS, { x: -0.4, y: 0.9, z: 0 }));

  // Delta wings, swept back, with orange wingtip rails.
  faces.push(quad([0.9, 0.05, 1.4], [5.4, 0.02, -3.1], [4.5, -0.02, -4.3], [0.85, -0.1, -2.2], HULL, { x: 0.2, y: 1, z: 0 }));
  faces.push(quad([-0.9, 0.05, 1.4], [-0.85, -0.1, -2.2], [-4.5, -0.02, -4.3], [-5.4, 0.02, -3.1], HULL, { x: -0.2, y: 1, z: 0 }));
  faces.push(quad([5.4, 0.02, -3.1], [5.9, 0.02, -3.35], [5.0, 0.02, -4.4], [4.5, -0.02, -4.3], ACCENT, { x: 0.4, y: 1, z: 0 }));
  faces.push(quad([-5.4, 0.02, -3.1], [-4.5, -0.02, -4.3], [-5.0, 0.02, -4.4], [-5.9, 0.02, -3.35], ACCENT, { x: -0.4, y: 1, z: 0 }));

  // Tail fins: two outward canted surfaces and a ventral fin.
  faces.push(quad([0.55, 0.2, -4.2], [1.55, 2.15, -5.3], [1.3, 2.1, -5.9], [0.5, 0.3, -5.5], ACCENT, { x: 0.8, y: 0.5, z: 0 }));
  faces.push(quad([-0.55, 0.2, -4.2], [-0.5, 0.3, -5.5], [-1.3, 2.1, -5.9], [-1.55, 2.15, -5.3], ACCENT, { x: -0.8, y: 0.5, z: 0 }));
  faces.push(quad([0, -0.5, -4.4], [0, -1.15, -5.5], [0.02, -0.4, -5.7], [0.02, -0.45, -4.6], HULL_DARK, { x: 0, y: -1, z: 0.2 }));

  // Engine nozzle and its glow, drawn last so the flame reads on top.
  faces.push(quad([0.62, 0.42, -5.4], [-0.62, 0.42, -5.4], [-0.62, -0.35, -5.4], [0.62, -0.35, -5.4], HULL_DARK, { x: 0, y: 0, z: -1 }));
  faces.push(quad([0.42, 0.28, -5.45], [-0.42, 0.28, -5.45], [-0.42, -0.24, -5.45], [0.42, -0.24, -5.45], ENGINE, { x: 0, y: 0, z: -1 }));

  // Landing gear struts and wheels, dropped only while the gear is down.
  const gear = [
    quad([0.18, -0.5, 2.2], [0.34, -1.5, 2.05], [0.28, -1.62, 2.2], [0.14, -1.55, 2.32], HULL_DARK, { x: 0, y: 0, z: 1 }),
    quad([-0.18, -0.5, 2.2], [-0.14, -1.55, 2.32], [-0.28, -1.62, 2.2], [-0.34, -1.5, 2.05], HULL_DARK, { x: 0, y: 0, z: 1 }),
  ];
  return { faces, gear };
}

// Points of one face in world space, given the aircraft's position and basis.
export function faceToWorld(points, position, basis, out) {
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    out[i][0] = position.x + basis.right.x * p[0] + basis.up.x * p[1] + basis.fwd.x * p[2];
    out[i][1] = position.y + basis.right.y * p[0] + basis.up.y * p[1] + basis.fwd.y * p[2];
    out[i][2] = position.z + basis.right.z * p[0] + basis.up.z * p[1] + basis.fwd.z * p[2];
  }
  return out;
}
