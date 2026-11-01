// Project state model shared by editor and output windows.
export const STATE_VERSION = 1;
export const CHANNEL = "projector-mapper";

export function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    name: "halloween",
    output: { w: 1920, h: 1080 },
    blackout: false,
    showOutlines: false,
    testPattern: false,
    brightness: 1,
    // Editor-only tracing photo of the real object (never shown on the projector).
    reference: { url: "", opacity: 0.4, show: false },
    surfaces: [],
  };
}

export function newSurface(index = 0) {
  const o = 0.06 * (index % 6);
  return {
    id: uid(),
    name: "Surface " + (index + 1),
    visible: true,
    locked: false,
    corners: [[0.3 + o, 0.3 + o], [0.7 + o, 0.3 + o], [0.7 + o, 0.7 + o], [0.3 + o, 0.7 + o]],
    opacity: 1,
    blend: "normal",
    feather: 0,
    flipH: false,
    flipV: false,
    crop: [0, 0, 1, 1],
    brightness: 1,
    tint: "#ffffff",
    content: { type: "effect", effect: "fire", params: {} },
    scare: { type: "none", duration: 4 },
    muted: true,
    volume: 1,
    speed: 1,
  };
}

// Fill in any missing fields (older saves, hand-edited JSON).
export function migrate(state) {
  const d = defaultState();
  const s = { ...d, ...(state || {}) };
  s.output = { ...d.output, ...(s.output || {}) };
  s.reference = { ...d.reference, ...(s.reference || {}) };
  s.surfaces = (s.surfaces || []).map((sf, i) => {
    const n = newSurface(i);
    const out = { ...n, ...sf };
    out.content = { ...n.content, ...(sf.content || {}) };
    out.scare = { ...n.scare, ...(sf.scare || {}) };
    if (!Array.isArray(out.corners) || out.corners.length !== 4) out.corners = n.corners;
    if (!Array.isArray(out.crop) || out.crop.length !== 4) out.crop = [0, 0, 1, 1];
    return out;
  });
  return s;
}

export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

// Approximate on-screen size of a surface in output pixels.
export function surfaceSizePx(surface, out) {
  const c = surface.corners;
  const d = (a, b) => Math.hypot((a[0] - b[0]) * out.w, (a[1] - b[1]) * out.h);
  const w = (d(c[0], c[1]) + d(c[3], c[2])) / 2;
  const h = (d(c[0], c[3]) + d(c[1], c[2])) / 2;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

export function hexToRgb01(hex) {
  const n = parseInt((hex || "#ffffff").slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function pointInQuad(p, c) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
