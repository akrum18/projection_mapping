// Shared helpers for effect packs (effects-*.js).
export const TAU = Math.PI * 2;
export const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function hexToRgb(hex) {
  const n = parseInt((hex || "#ffffff").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Deterministic random numbers so layouts (icicles, stars) stay put between frames.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Soft round glow sprite, cached per colour.
const sprites = new Map();
export function glowSprite(color, size = 64) {
  const key = color + size;
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.25, rgba(color, 0.6));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  sprites.set(key, c);
  return c;
}

export function background(ctx, w, h, mode, color = "#000000") {
  if (mode === "transparent") ctx.clearRect(0, 0, w, h);
  else { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }
}
export const BG = { type: "select", options: ["black", "transparent"], default: "black", label: "Background" };

export const PALETTES = {
  classic: ["#ff3b30", "#ffd60a", "#30d158", "#0a84ff", "#ff9f0a"],
  "warm white": ["#ffd9a0", "#ffe2b3", "#ffcf87"],
  "red & green": ["#ff2d2d", "#19c35a"],
  "blue & white": ["#4da3ff", "#e8f4ff", "#7cc4ff"],
  rainbow: ["#ff3b30", "#ff9f0a", "#ffd60a", "#30d158", "#64d2ff", "#0a84ff", "#bf5af2"],
};
export const PALETTE_PARAM = { type: "select", options: Object.keys(PALETTES), default: "classic", label: "Colours" };

// Night sky backdrop with a fixed star field.
export function nightSky(ctx, w, h, t, s, top = "#02030a", bottom = "#0b1530", stars = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (!stars) return;
  if (!s.stars || s.starsW !== w || s.starsH !== h) {
    const r = seeded(7);
    s.starsW = w; s.starsH = h;
    s.stars = Array.from({ length: Math.round((w * h) / 2600 * stars) }, () => ({ x: r() * w, y: r() * h * 0.85, z: r(), ph: r() * TAU }));
  }
  for (const st of s.stars) {
    const a = 0.35 + 0.65 * st.z * (0.6 + 0.4 * Math.sin(t * (1 + st.z * 3) + st.ph));
    ctx.fillStyle = `rgba(235,240,255,${a})`;
    const r = 0.5 + st.z * 1.3;
    ctx.fillRect(st.x - r / 2, st.y - r / 2, r, r);
  }
}
