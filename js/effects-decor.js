// Quintessential Christmas decor, made to be projected onto a house: bold shapes on
// black (nothing glows where there's no decoration), sized so it reads from the street,
// and each with a "show" variant for the choreographed moment (use it as the scare).
import { TAU, seeded, glowSprite, PALETTES } from "./fx-util.js";

export const DECOR = {};
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const shade = (hex, k) => { const [r, g, b] = rgbOf(hex); return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`; };
function glowDot(ctx, x, y, R, col, b) {
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, 0.8 * b); ctx.drawImage(glowSprite(col, 32), x - R * 3, y - R * 3, R * 6, R * 6);
  ctx.globalAlpha = Math.min(1, 0.4 + 0.6 * b); ctx.fillStyle = "#fff8e6"; ctx.beginPath(); ctx.arc(x, y, R * 0.45, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}
// glossy red bow with tails, centred on (x, y); s = loop width
function bow(ctx, x, y, s, col) {
  const dark = shade(col, 0.5), mid = shade(col, 0.82), hi = shade(col, 1.25);
  for (const k of [-1, 1]) {
    ctx.fillStyle = mid;
    ctx.beginPath(); ctx.moveTo(x + k * s * 0.08, y + s * 0.1);
    ctx.quadraticCurveTo(x + k * s * 0.35, y + s * 0.7, x + k * s * 0.32, y + s * 1.15);
    ctx.lineTo(x + k * s * 0.44, y + s * 1.04); ctx.lineTo(x + k * s * 0.56, y + s * 1.2);
    ctx.quadraticCurveTo(x + k * s * 0.6, y + s * 0.6, x + k * s * 0.22, y + s * 0.02); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(x, y - s * 0.4, x + k * s, y + s * 0.2);
    g.addColorStop(0, hi); g.addColorStop(0.6, col); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + k * s * 0.25, y - s * 0.62, x + k * s * 1.02, y - s * 0.56, x + k * s * 0.9, y - s * 0.02);
    ctx.bezierCurveTo(x + k * s * 0.8, y + s * 0.32, x + k * s * 0.3, y + s * 0.22, x, y); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(x + k * s * 0.4, y - s * 0.1, s * 0.2, s * 0.07, k * -0.45, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, s * 0.17, s * 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(x - s * 0.05, y - s * 0.07, s * 0.05, s * 0.08, 0.3, 0, TAU); ctx.fill();
}
// chunky evergreen along a path of points: dark rope, then clusters of needles
function evergreen(ctx, pts, T, r) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#0d2e17"; ctx.lineWidth = T;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  const cols = ["#164d27", "#1f6a33", "#2d8a43", "#3c9e52"];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    for (let n = 0; n < 4; n++) {
      const a = r() * TAU, len = T * (0.45 + r() * 0.35), ox = (r() - 0.5) * T * 0.6, oy = (r() - 0.5) * T * 0.6;
      ctx.strokeStyle = cols[(r() * 4) | 0]; ctx.lineWidth = Math.max(1.5, T * 0.16);
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- peppermint
// A giant peppermint candy for bare siding, spinning slowly; the show spins it fast.
DECOR.peppermint = {
  label: "Peppermint swirl",
  params: {
    color: { type: "color", default: "#d81e2c", label: "Stripes" },
    style: { type: "select", options: ["swirl", "starlight"], default: "swirl", label: "Style" },
    stripes: { type: "range", min: 4, max: 12, step: 1, default: 8, label: "Stripes" },
    spin: { type: "range", min: -1, max: 1, step: 0.02, default: 0.08, label: "Spin (turns/s)" },
    wrapper: { type: "select", options: ["wrapper", "none"], default: "wrapper", label: "Cellophane twists" },
    mode: { type: "select", options: ["spin", "whirl"], default: "spin", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) { s.t0 = t; s.rot = 0; }
    const whirl = p.mode === "whirl", age = t - s.t0;
    const speed = whirl ? p.spin * 4 + Math.sign(p.spin || 1) * 1.6 * Math.min(1, age) * Math.max(0, 1 - Math.max(0, age - 8) / 4) : p.spin;
    s.rot += speed * TAU * dt;
    const wrap = p.wrapper === "wrapper", R = Math.min(wrap ? w * 0.3 : w * 0.46, h * 0.44), cx = w / 2, cy = h / 2;
    if (wrap) {
      // twisted cellophane ends, catching a little light
      for (const k of [-1, 1]) {
        const x0 = cx + k * R * 0.85, x1 = cx + k * Math.min(w * 0.49, R * 1.75);
        ctx.fillStyle = "rgba(235,240,255,0.32)";
        ctx.beginPath(); ctx.moveTo(x0, cy - R * 0.22); ctx.lineTo(cx + k * R * 1.2, cy - R * 0.08);
        ctx.lineTo(x1, cy - R * 0.55); ctx.lineTo(x1, cy + R * 0.55); ctx.lineTo(cx + k * R * 1.2, cy + R * 0.08); ctx.lineTo(x0, cy + R * 0.22); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = Math.max(1, R * 0.02);
        for (const f of [-0.4, -0.15, 0.15, 0.4]) { ctx.beginPath(); ctx.moveTo(cx + k * R * 1.2, cy + f * R * 0.2); ctx.lineTo(x1, cy + f * R * 1.2); ctx.stroke(); }
      }
    }
    ctx.fillStyle = "#fbf7f2"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.97, 0, TAU); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(s.rot);
    const n = p.stripes | 0, width = (TAU / n) * 0.5, twist = p.style === "swirl" ? 1.1 : 0;
    ctx.fillStyle = p.color;
    for (let k = 0; k < n; k++) {
      const a0 = (k * TAU) / n;
      ctx.beginPath(); ctx.moveTo(0, 0);
      if (twist) {
        for (let i = 0; i <= 12; i++) { const r = (i / 12) * R, a = a0 + twist * (r / R); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        for (let i = 12; i >= 0; i--) { const r = (i / 12) * R, a = a0 + width + twist * (r / R) * 1.15; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      } else {
        ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.lineTo(Math.cos(a0 + width) * R, Math.sin(a0 + width) * R);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // hard candy shine and a soft edge
    const gl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx - R * 0.2, cy - R * 0.25, R * 0.9);
    gl.addColorStop(0, "rgba(255,255,255,0.55)"); gl.addColorStop(0.35, "rgba(255,255,255,0.12)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = Math.max(1, R * 0.04); ctx.beginPath(); ctx.arc(cx, cy, R * 0.98, 0, TAU); ctx.stroke();
    if (whirl) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(age * 8); ctx.drawImage(glowSprite("#ffffff", 32), cx - R * 0.8, cy - R * 0.85, R * 0.6, R * 0.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
  },
};

// ---------------------------------------------------------------- window wreath
// The colonial wreath-in-every-window, bold enough to read from the street. Hangs in
// the top two thirds of the glass so a window candle sits inside the ring.
DECOR.windowwreath = {
  label: "Window wreath",
  params: {
    bow: { type: "color", default: "#c8102e", label: "Bow" },
    bowAt: { type: "select", options: ["top", "bottom"], default: "top", label: "Bow at" },
    lights: { type: "select", options: ["warm", "multicolour", "none"], default: "warm", label: "Lights" },
    size: { type: "range", min: 0.5, max: 1.2, step: 0.02, default: 0.9, label: "Size" },
    mode: { type: "select", options: ["twinkle", "sparkle"], default: "twinkle", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.32 * p.size, cx = w / 2, cy = h * 0.4, T = R * 0.36;
    const key = `${w}x${h}:${R.toFixed(1)}:${p.bow}:${p.bowAt}`;
    if (s.key !== key) {
      s.key = key;
      const c = (s.art = document.createElement("canvas")); c.width = w; c.height = h;
      const g = c.getContext("2d"), r = seeded(51);
      const ring = Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * TAU; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
      ring.push(ring[0]);
      evergreen(g, ring, T, r);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.5, bx = cx + Math.cos(a) * R, by = cy + Math.sin(a) * R;
        for (let k = 0; k < 3; k++) { g.fillStyle = "#c4161c"; g.beginPath(); g.arc(bx + (r() - 0.5) * T * 0.5, by + (r() - 0.5) * T * 0.5, T * 0.12, 0, TAU); g.fill(); }
      }
      const top = p.bowAt === "top";
      bow(g, cx, top ? cy - R - T * 0.1 : cy + R + T * 0.05, R * 0.55, p.bow);
      const lr = seeded(53);
      s.lights = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * TAU + lr() * 0.2, rr = R + (lr() - 0.5) * T * 0.7; return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, ph: lr() * TAU }; });
    }
    ctx.drawImage(s.art, 0, 0);
    if (p.lights === "none") return;
    const pal = p.lights === "warm" ? PALETTES["warm white"] : PALETTES.classic, sparkle = p.mode === "sparkle";
    s.lights.forEach((l, i) => {
      let b = 0.55 + 0.45 * Math.sin(t * 2 + l.ph), col = pal[i % pal.length];
      if (sparkle && Math.sin(t * 7 + l.ph * 11) > 0.8) { b = 1.4; col = "#ffffff"; }
      glowDot(ctx, l.x, l.y, Math.max(1.5, T * 0.16), col, b);
    });
  },
};

// ---------------------------------------------------------------- garland & bows
// Evergreen swags with bows where they hang: map the surface along a porch roof edge
// (a bow lands on each column if the surface runs column to column), or around a
// door frame with "top & sides".
DECOR.garland = {
  label: "Garland & bows",
  params: {
    swags: { type: "range", min: 1, max: 8, step: 1, default: 2, label: "Swags" },
    sag: { type: "range", min: 0.2, max: 0.9, step: 0.02, default: 0.55, label: "Droop" },
    shape: { type: "select", options: ["swags", "top & sides"], default: "swags", label: "Shape" },
    bow: { type: "color", default: "#c8102e", label: "Bows" },
    ends: { type: "select", options: ["both", "left", "right", "none"], default: "both", label: "Bows at the ends" },
    lights: { type: "select", options: ["warm", "multicolour", "none"], default: "warm", label: "Lights" },
    mode: { type: "select", options: ["twinkle", "chase"], default: "twinkle", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    const sides = p.shape === "top & sides";
    const T = sides ? Math.min(w, h) * 0.11 : Math.min(h * 0.24, w * 0.08), bs = T * 1.2;
    const key = `${w}x${h}:${p.swags}:${p.sag}:${p.shape}:${p.bow}:${p.ends}`;
    if (s.key !== key) {
      s.key = key;
      const c = (s.art = document.createElement("canvas")); c.width = w; c.height = h;
      const g = c.getContext("2d"), r = seeded(61), paths = [], hangs = [];
      // a bowed end is inset by the bow's size so the bow sits exactly on the end point
      const bowL = p.ends === "both" || p.ends === "left", bowR = p.ends === "both" || p.ends === "right";
      const top = T * 0.6, x0 = sides ? T * 0.6 : bowL ? bs : 0, x1 = sides ? w - T * 0.6 : bowR ? w - bs : w;
      const n = sides ? 1 : p.swags | 0, depth = sides ? Math.min(h * 0.2, w * 0.3) * p.sag : (h - top - T * 0.6) * p.sag;
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n, pts = [];
        for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push([a + (b - a) * u, top + depth * Math.sin(u * Math.PI)]); }
        paths.push(pts);
      }
      // split a run at a column and give the shared end's bow to one side only
      for (let i = 0; i <= n; i++) if ((i > 0 || bowL || sides) && (i < n || bowR || sides)) hangs.push([x0 + ((x1 - x0) * i) / n, top]);
      if (sides) for (const x of [x0, x1]) { const pts = []; for (let k = 0; k <= 24; k++) pts.push([x + Math.sin(k * 0.9) * T * 0.08, top + ((h - top - T * 0.4) * k) / 24]); paths.push(pts); }
      for (const pts of paths) evergreen(g, pts, T, r);
      for (const [x, y] of hangs) bow(g, Math.min(w - bs, Math.max(bs, x)), y + T * 0.1, bs, p.bow);
      s.lights = [];
      const lr = seeded(63);
      for (const pts of paths) for (let k = 1; k < pts.length - 1; k += 3) s.lights.push({ x: pts[k][0] + (lr() - 0.5) * T * 0.4, y: pts[k][1] + (lr() - 0.5) * T * 0.4, ph: lr() * TAU });
    }
    ctx.drawImage(s.art, 0, 0);
    if (p.lights === "none") return;
    const pal = p.lights === "warm" ? PALETTES["warm white"] : PALETTES.classic;
    s.lights.forEach((l, i) => {
      const b = p.mode === "chase" ? ((((i - t * 8) % 4) + 4) % 4 < 1.4 ? 1.3 : 0.2) : 0.55 + 0.45 * Math.sin(t * 1.8 + l.ph);
      glowDot(ctx, l.x, l.y, Math.max(1.5, T * 0.15), pal[i % pal.length], b);
    });
  },
};

// ---------------------------------------------------------------- nutcracker
// A toy-soldier nutcracker to stand guard beside the door (one each side). Built from
// turned-wood shapes with bold colour so it reads from the street. It clacks its jaw
// now and then; the show has it clack and salute.
function wood(ctx, x, y, w, h, col, r = 0) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.32, shade(col, 1.18)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, 0.45));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill();
}
DECOR.nutcracker = {
  label: "Nutcracker",
  params: {
    coat: { type: "color", default: "#c8102e", label: "Coat" },
    trousers: { type: "color", default: "#1d3f8f", label: "Trousers" },
    hat: { type: "color", default: "#151519", label: "Hat" },
    facing: { type: "select", options: ["front", "mirror"], default: "front", label: "Staff side" },
    mode: { type: "select", options: ["guard", "salute"], default: "guard", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) s.t0 = t;
    const age = t - s.t0, salute = p.mode === "salute";
    const H = Math.min(h * 0.97, w / 0.54), X = w / 2, Y = h - H - h * 0.01;
    const u = (v) => v * H, gold = "#e2b23c", skin = "#f3c9a4", white = "#f7f3ea";
    // jaw: a clack every few seconds; constantly in the show
    const clack = salute ? Math.abs(Math.sin(age * 9)) : (t % 7 < 0.6 ? Math.abs(Math.sin(t * 16)) : 0);
    const arm = salute ? Math.min(1, Math.max(0, (age - 0.4) / 0.4)) * (age < 7 ? 1 : Math.max(0, 1 - (age - 7) / 0.5)) : 0;
    ctx.save(); ctx.translate(X, Y);
    if (p.facing === "mirror") ctx.scale(-1, 1);
    const R = (x, y, ww, hh, col, r) => wood(ctx, u(x), u(y), u(ww), u(hh), col, u(r || 0));
    // stand
    R(-0.21, 0.955, 0.42, 0.04, "#1f5e3a", 0.01); ctx.fillStyle = gold; ctx.fillRect(u(-0.21), u(0.952), u(0.42), u(0.008));
    // boots and trousers
    for (const k of [-1, 1]) {
      R(k > 0 ? 0.012 : -0.108, 0.84, 0.096, 0.118, "#141416", 0.012);
      R(k > 0 ? 0.008 : -0.112, 0.835, 0.104, 0.02, "#26262a", 0.004);
      R(k > 0 ? 0.014 : -0.106, 0.63, 0.092, 0.21, p.trousers, 0.01);
      ctx.fillStyle = gold; ctx.fillRect(u(k > 0 ? 0.088 : -0.1), u(0.64), u(0.01), u(0.19));
    }
    // coat tails, torso, belt
    R(-0.15, 0.56, 0.3, 0.12, p.coat, 0.02); ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(u(-0.15), u(0.6), u(0.3), u(0.08));
    R(-0.145, 0.365, 0.29, 0.27, p.coat, 0.03);
    ctx.fillStyle = gold; ctx.fillRect(u(-0.012), u(0.38), u(0.024), u(0.2));
    for (const yy of [0.41, 0.46, 0.51]) for (const k of [-1, 1]) { ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(u(k * 0.05), u(yy), u(0.012), 0, TAU); ctx.fill(); }
    R(-0.148, 0.575, 0.296, 0.03, "#18181b", 0.004);
    ctx.fillStyle = gold; ctx.fillRect(u(-0.025), u(0.572), u(0.05), u(0.036));
    // epaulettes with fringe
    for (const k of [-1, 1]) {
      ctx.fillStyle = gold; ctx.beginPath(); ctx.ellipse(u(k * 0.15), u(0.375), u(0.055), u(0.025), 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = gold; ctx.lineWidth = Math.max(1, u(0.006));
      for (let f = -2; f <= 2; f++) { ctx.beginPath(); ctx.moveTo(u(k * 0.15 + f * 0.018), u(0.39)); ctx.lineTo(u(k * 0.15 + f * 0.02), u(0.418)); ctx.stroke(); }
    }
    // left arm down; right arm holds the staff, or salutes
    R(-0.215, 0.38, 0.065, 0.2, p.coat, 0.03); ctx.fillStyle = gold; ctx.fillRect(u(-0.215), u(0.56), u(0.065), u(0.02));
    ctx.fillStyle = white; ctx.beginPath(); ctx.arc(u(-0.183), u(0.605), u(0.034), 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(u(0.183), u(0.39)); ctx.rotate(arm * 2.5); // salute: hand to the hat brim
    wood(ctx, u(-0.032), u(-0.01), u(0.065), u(0.2), p.coat, u(0.03)); ctx.fillStyle = gold; ctx.fillRect(u(-0.032), u(0.17), u(0.065), u(0.02));
    ctx.fillStyle = white; ctx.beginPath(); ctx.arc(0, u(0.215), u(0.034), 0, TAU); ctx.fill();
    ctx.restore();
    if (arm < 0.05) { wood(ctx, u(0.226), u(0.33), u(0.02), u(0.6), gold, u(0.01)); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(u(0.236), u(0.32), u(0.028), 0, TAU); ctx.fill(); }
    // collar, head, hair
    R(-0.07, 0.35, 0.14, 0.025, gold, 0.006);
    R(-0.1, 0.205, 0.2, 0.15, skin, 0.04);
    for (const k of [-1, 1]) { ctx.fillStyle = white; ctx.beginPath(); ctx.ellipse(u(k * 0.108), u(0.27), u(0.028), u(0.06), 0, 0, TAU); ctx.fill(); }
    // shako hat with gold bands, badge and plume
    ctx.fillStyle = p.hat;
    ctx.beginPath(); ctx.moveTo(u(-0.105), u(0.215)); ctx.lineTo(u(-0.12), u(0.04)); ctx.lineTo(u(0.12), u(0.04)); ctx.lineTo(u(0.105), u(0.215)); ctx.closePath(); ctx.fill();
    const hg = ctx.createLinearGradient(u(-0.12), 0, u(0.12), 0); hg.addColorStop(0, "rgba(255,255,255,0)"); hg.addColorStop(0.3, "rgba(255,255,255,0.22)"); hg.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = hg; ctx.fill();
    ctx.fillStyle = gold; ctx.fillRect(u(-0.121), u(0.04), u(0.242), u(0.018)); ctx.fillRect(u(-0.108), u(0.19), u(0.216), u(0.025));
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? u(0.018) : u(0.042); ctx.lineTo(Math.cos(a) * rr, u(0.115) + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8e2d6"; ctx.beginPath(); ctx.ellipse(0, u(0.03), u(0.03), u(0.032), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.coat; ctx.beginPath(); ctx.ellipse(0, u(0.015), u(0.02), u(0.022), 0, 0, TAU); ctx.fill();
    // face: brows, eyes, nose, cheeks
    for (const k of [-1, 1]) {
      ctx.fillStyle = white; ctx.beginPath(); ctx.ellipse(u(k * 0.045), u(0.236), u(0.03), u(0.011), k * 0.15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(u(k * 0.045), u(0.258), u(0.02), u(0.014), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1b1410"; ctx.beginPath(); ctx.arc(u(k * 0.043), u(0.259), u(0.009), 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(232,96,104,0.65)"; ctx.beginPath(); ctx.arc(u(k * 0.068), u(0.288), u(0.02), 0, TAU); ctx.fill();
    }
    ctx.fillStyle = shade(skin, 0.88); ctx.beginPath(); ctx.arc(0, u(0.282), u(0.022), 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(u(-0.007), u(0.276), u(0.007), 0, TAU); ctx.fill();
    // mouth: the jaw drops to clack, showing teeth
    const open = u(0.022) * clack;
    ctx.fillStyle = "#3a1212"; ctx.fillRect(u(-0.04), u(0.312), u(0.08), u(0.012) + open);
    ctx.fillStyle = white; ctx.fillRect(u(-0.036), u(0.312), u(0.072), u(0.006));
    // beard (moves with the jaw) and moustache
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.moveTo(u(-0.1), u(0.31) + open);
    for (let i = 0; i <= 8; i++) { const xx = -0.1 + i * 0.025; ctx.quadraticCurveTo(u(xx + 0.0125), u(0.41) + open, u(xx + 0.025), u(0.395) + open); }
    ctx.lineTo(u(0.1), u(0.31) + open); ctx.lineTo(u(0.045), u(0.326) + open); ctx.lineTo(u(-0.045), u(0.326) + open); ctx.closePath(); ctx.fill();
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(u(k * 0.045), u(0.302), u(0.05), u(0.016), k * -0.25, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(u(k * 0.09), u(0.296), u(0.012), 0, TAU); ctx.fill(); }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- snowflakes
// Big, crisp six-fold crystals (no two alike) drifting and turning across bare siding,
// like the giant lit flakes on a storefront. The show is a flurry: a gust whirls them
// sideways and a burst of fine snow blows through, then it settles.
const FLAKES = new Map();
function flakeSprite(seed, col, px) {
  const key = seed + col + px;
  if (FLAKES.has(key)) return FLAKES.get(key);
  if (FLAKES.size > 120) FLAKES.clear();
  const r = seeded(seed * 7919 + 13), c = document.createElement("canvas"), S = px * 3;
  c.width = c.height = Math.ceil(S);
  const x = c.getContext("2d"), R = px, lw = Math.max(1.2, R * 0.075);
  x.translate(S / 2, S / 2); x.lineCap = "round"; x.lineJoin = "round";
  // one arm's design, repeated six times: side branches, a plate or a fern tip
  const branches = [], nb = 2 + ((r() * 3) | 0);
  for (let i = 0; i < nb; i++) branches.push([0.25 + (i / nb) * 0.6 + r() * 0.06, (0.18 + r() * 0.32) * (1 - i / (nb + 1.5)), 0.85 + r() * 0.35]);
  const plate = r() < 0.55, tip = r() < 0.5 ? "diamond" : "fork", hub = 0.12 + r() * 0.12;
  const arms = () => {
    for (let k = 0; k < 6; k++) {
      x.save(); x.rotate((k * TAU) / 6);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(R, 0);
      for (const [at, len, ang] of branches) for (const sgn of [-1, 1]) { x.moveTo(at * R, 0); x.lineTo(at * R + Math.cos(ang) * len * R, sgn * Math.sin(ang) * len * R); }
      if (tip === "fork") for (const sgn of [-1, 1]) { x.moveTo(R * 0.86, 0); x.lineTo(R * 1.0, sgn * R * 0.1); }
      x.stroke();
      if (tip === "diamond") { x.beginPath(); x.moveTo(R * 0.84, 0); x.lineTo(R * 0.92, R * 0.06); x.lineTo(R * 1.02, 0); x.lineTo(R * 0.92, -R * 0.06); x.closePath(); x.stroke(); }
      x.restore();
    }
    x.beginPath();
    for (let k = 0; k <= 6; k++) { const a = (k * TAU) / 6 + TAU / 12; x.lineTo(Math.cos(a) * R * hub, Math.sin(a) * R * hub); }
    if (plate) x.fill(); else x.stroke();
  };
  // soft coloured glow first, then the crisp white crystal on top
  x.shadowColor = col; x.shadowBlur = R * 0.35; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = lw * 2.4; arms();
  x.shadowBlur = 0; x.strokeStyle = "#ffffff"; x.fillStyle = "#ffffff"; x.lineWidth = lw; arms();
  FLAKES.set(key, c);
  return c;
}
function glint(ctx, x, y, R, a) {
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a;
  ctx.drawImage(glowSprite("#ffffff", 32), x - R, y - R, R * 2, R * 2);
  ctx.fillStyle = "#ffffff";
  for (const [dx, dy] of [[1, 0], [0, 1]]) { ctx.beginPath(); ctx.moveTo(x - dx * R, y - dy * R); ctx.lineTo(x + dy * R * 0.06, y + dx * R * 0.06); ctx.lineTo(x + dx * R, y + dy * R); ctx.lineTo(x - dy * R * 0.06, y - dx * R * 0.06); ctx.closePath(); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}
DECOR.snowflakes = {
  label: "Snowflakes",
  params: {
    glow: { type: "color", default: "#7cc4ff", label: "Glow" },
    count: { type: "range", min: 2, max: 40, step: 1, default: 12, label: "Flakes" },
    size: { type: "range", min: 0.4, max: 2, step: 0.05, default: 1, label: "Size" },
    motion: { type: "select", options: ["drift", "hang"], default: "drift", label: "Motion" },
    fall: { type: "range", min: 0, max: 1, step: 0.02, default: 0.25, label: "Drift speed" },
    mode: { type: "select", options: ["twinkle", "flurry"], default: "twinkle", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    const n = p.count | 0, flurry = p.mode === "flurry";
    if (s.t0 === undefined) { s.t0 = t; s.wind = 0; s.spin = 0; s.dust = []; }
    const age = t - s.t0, gust = flurry ? Math.min(1, age / 1.2) * Math.max(0, Math.min(1, (11 - age) / 3)) : 0;
    const drift = p.motion === "drift";
    // hanging flakes sit on a staggered grid so none overlap; drifting ones fill the area
    let cols = 1;
    for (let c = 2; c <= n; c++) if (Math.min(w / c, h / Math.ceil(n / c)) > Math.min(w / cols, h / Math.ceil(n / cols))) cols = c;
    const rows = Math.ceil(n / cols), cw = w / cols, ch = h / rows;
    const R = (drift ? Math.min(0.34 * Math.sqrt((w * h) / n), h * 0.24, w * 0.3) : Math.min(cw, ch) * 0.36) * p.size, px = Math.max(8, Math.round(R / 6) * 6);
    const speed = drift ? p.fall * Math.max(R, h * 0.12) * 0.35 : 0;
    s.wind += gust * Math.max(w, h) * 0.35 * dt; s.spin += (0.12 + gust * 2.2) * dt;
    const r = seeded(n * 31 + 7), padX = w + R * 2.4, padY = h + R * 2.4;
    for (let i = 0; i < n; i++) {
      const gold = (i * 0.618034 + 0.1) % 1, row = Math.floor(i / cols), col = i % cols, inRow = Math.min(cols, n - row * cols);
      const x0 = drift ? ((i + 0.2 + r() * 0.6) / n) * w : (col + 0.5 + (cols - inRow) / 2) * cw + (r() - 0.5) * cw * 0.12;
      const y0 = drift ? gold * padY : (row + 0.5) * ch + (r() - 0.5) * ch * 0.12, ph = r() * 100, sc = drift ? 0.7 + r() * 0.45 : 0.85 + r() * 0.2;
      const spr = flakeSprite(i % 9, p.glow, px);
      let x = x0 + Math.sin(t * 0.35 + ph) * R * (drift ? 0.35 : 0.08) + s.wind * sc, y = y0 + t * speed * sc + gust * Math.sin(t * 1.7 + ph) * R * 0.6 + (drift ? 0 : Math.sin(t * 0.6 + ph) * R * 0.06);
      x = ((((x + R * 1.2) % padX) + padX) % padX) - R * 1.2;
      if (drift) y = ((((y + R * 1.2) % padY) + padY) % padY) - R * 1.2;
      const a = (ph + s.spin * (i % 2 ? 1 : -1) * (0.5 + sc * 0.5)), size = R * sc;
      const tw = 0.9 + 0.1 * Math.sin(t * 1.3 + ph * 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = tw;
      ctx.drawImage(spr, (-spr.width / 2) * (size / px), (-spr.height / 2) * (size / px), spr.width * (size / px), spr.height * (size / px));
      ctx.restore();
      // now and then a crystal catches the light
      const g = (t * 0.11 + ph) % 1;
      if (g < 0.06) glint(ctx, x, y, size * 0.6, Math.sin((g / 0.06) * Math.PI));
    }
    // the flurry: fine snow blowing through on the gust
    if (flurry && gust > 0.02) {
      const want = Math.round(gust * Math.min(260, (w * h) / 900));
      while (s.dust.length < want) s.dust.push({ x: Math.random() * w - w * 0.3, y: Math.random() * h, v: 0.6 + Math.random(), z: 0.5 + Math.random() * 1.5 });
      ctx.fillStyle = "#ffffff";
      for (const d of s.dust) {
        d.x += Math.max(w, h) * 0.5 * d.v * dt; d.y += Math.sin(t * 3 + d.v * 9) * R * 0.02 + h * 0.05 * dt;
        if (d.x > w + 4) { d.x = -4; d.y = Math.random() * h; }
        ctx.globalAlpha = gust * 0.8; ctx.beginPath(); ctx.arc(d.x, d.y % h, Math.max(1, R * 0.03 * d.z), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },
};

// ---------------------------------------------------------------- gingerbread icing
// Turns the house into a gingerbread house: thick piped royal icing along an edge with
// drips hanging down, studded with gumdrops and peppermints. The show runs a sparkle of
// sugar along the icing and lights the candies one after another.
const GUMDROPS = ["#e8202c", "#1fa64a", "#ffcf1f", "#ff7a1a", "#9b3fd6", "#2a8cff"];
DECOR.icing = {
  label: "Gingerbread icing",
  params: {
    icing: { type: "color", default: "#fffaf2", label: "Icing" },
    candy: { type: "select", options: ["gumdrops", "peppermints", "both", "none"], default: "both", label: "Candy" },
    drips: { type: "range", min: 0.3, max: 2, step: 0.05, default: 1, label: "Drips" },
    length: { type: "range", min: 0.2, max: 1, step: 0.02, default: 0.6, label: "Drip length" },
    mode: { type: "select", options: ["glisten", "sparkle"], default: "glisten", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) s.t0 = t;
    const age = t - s.t0, sparkle = p.mode === "sparkle";
    // the piped band runs along the top; drips hang into the rest of the surface
    const B = Math.min(h * 0.34, w * 0.08), cy = B * 0.55, scal = B * 1.6;
    const key = [w, h, p.icing, p.drips, p.length, p.candy].join();
    if (s.key !== key) {
      s.key = key;
      const c = s.art || document.createElement("canvas"); c.width = Math.ceil(w); c.height = Math.ceil(h); s.art = c;
      const x = c.getContext("2d"), r = seeded(17), ic = p.icing;
      // drips: rounded runs of icing of varied length, thicker ones at the scallop points
      const nd = Math.max(3, Math.round((w / scal) * 2.2 * p.drips));
      s.drops = [];
      x.fillStyle = ic;
      for (let i = 0; i < nd; i++) {
        const dx = ((i + 0.15 + r() * 0.7) / nd) * w, dw = B * (0.24 + r() * 0.26);
        const len = Math.min(h - cy - dw * 1.3, B * (0.5 + r() * r() * 3.5) * (p.length / 0.6));
        x.beginPath(); x.moveTo(dx - dw, cy); x.lineTo(dx - dw * 0.8, cy + len - dw); x.arc(dx, cy + len - dw * 0.4, dw * 0.85, Math.PI, 0, true); x.lineTo(dx + dw, cy); x.closePath(); x.fill();
        s.drops.push([dx, cy + len - dw * 0.4, dw]);
      }
      // the band itself: a fat piped bead with a scalloped lower edge
      x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w, cy);
      const ns = Math.max(2, Math.round(w / scal));
      for (let i = ns; i > 0; i--) { const xa = (i / ns) * w, xb = ((i - 1) / ns) * w; x.quadraticCurveTo((xa + xb) / 2, cy + B * 0.95, xb, cy); }
      x.closePath(); x.fill();
      // piped texture: a row of beads along the top and shading so it reads as thick icing
      const sh = x.createLinearGradient(0, cy * 0.6, 0, cy + B);
      sh.addColorStop(0, "rgba(120,110,100,0)"); sh.addColorStop(1, "rgba(120,110,100,0.22)");
      x.globalCompositeOperation = "source-atop"; x.fillStyle = sh; x.fillRect(0, cy * 0.6, w, B * 1.2);
      for (const [dx, dy, dw] of s.drops) { x.fillStyle = "rgba(120,110,100,0.18)"; x.fillRect(dx + dw * 0.35, cy + B * 0.4, dw * 0.7, dy - cy); x.beginPath(); x.arc(dx + dw * 0.2, dy, dw * 0.75, -0.6, 1.6); x.fill(); }
      const nbd = Math.max(4, Math.round(w / (B * 0.7)));
      for (let i = 0; i < nbd; i++) {
        const bx = ((i + 0.5) / nbd) * w;
        x.fillStyle = "rgba(255,255,255,0.75)"; x.beginPath(); x.ellipse(bx - B * 0.08, cy * 0.45, B * 0.16, B * 0.1, 0, 0, TAU); x.fill();
        x.fillStyle = "rgba(110,100,90,0.25)"; x.beginPath(); x.arc(bx + B * 0.35, cy * 0.7, B * 0.08, 0, TAU); x.fill();
      }
      for (const [dx, dy, dw] of s.drops) { x.fillStyle = "rgba(255,255,255,0.8)"; x.beginPath(); x.ellipse(dx - dw * 0.35, dy - dw * 0.1, dw * 0.18, dw * 0.3, 0, 0, TAU); x.fill(); }
      x.globalCompositeOperation = "source-over";
      // candies sitting on the icing at each scallop point
      s.candies = [];
      if (p.candy !== "none") {
        for (let i = 1; i < ns; i++) {
          const kx = (i / ns) * w, kind = p.candy === "both" ? (i % 2 ? "gum" : "mint") : p.candy === "gumdrops" ? "gum" : "mint";
          s.candies.push([kx, cy + B * 0.05, kind, GUMDROPS[(i * 5) % GUMDROPS.length]]);
        }
      }
      const cr = B * 0.62;
      for (const [kx, ky, kind, col] of s.candies) {
        if (kind === "gum") {
          const g = x.createRadialGradient(kx - cr * 0.3, ky - cr * 0.4, cr * 0.1, kx, ky, cr * 1.1);
          g.addColorStop(0, shade(col, 1.45)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, 0.55));
          x.fillStyle = g; x.beginPath(); x.moveTo(kx - cr, ky + cr * 0.55); x.bezierCurveTo(kx - cr, ky - cr * 0.9, kx + cr, ky - cr * 0.9, kx + cr, ky + cr * 0.55); x.closePath(); x.fill();
          x.fillStyle = "rgba(255,255,255,0.7)";
          for (let k = 0; k < 9; k++) { x.fillRect(kx + (r() - 0.5) * cr * 1.4, ky + (r() - 0.6) * cr * 0.9, Math.max(1, cr * 0.07), Math.max(1, cr * 0.07)); }
        } else {
          x.fillStyle = "#fbf7f2"; x.beginPath(); x.arc(kx, ky, cr * 0.85, 0, TAU); x.fill();
          x.fillStyle = "#d81e2c";
          for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6 + 0.3; x.beginPath(); x.moveTo(kx, ky); x.arc(kx, ky, cr * 0.85, a, a + TAU / 12); x.closePath(); x.fill(); }
          x.strokeStyle = "rgba(0,0,0,0.2)"; x.lineWidth = Math.max(1, cr * 0.06); x.beginPath(); x.arc(kx, ky, cr * 0.83, 0, TAU); x.stroke();
          x.fillStyle = "rgba(255,255,255,0.5)"; x.beginPath(); x.ellipse(kx - cr * 0.3, ky - cr * 0.35, cr * 0.25, cr * 0.13, -0.6, 0, TAU); x.fill();
        }
      }
    }
    ctx.drawImage(s.art, 0, 0, w, h);
    // sugar glints: a few at random; the show sweeps a wave of them along and lights each candy in turn
    const r = seeded(Math.floor(t * 3) + 5), cr = B * 0.62;
    const sweep = ((age * 0.3) % 1.4 - 0.2) * w, glints = sparkle ? 12 : 3;
    for (let i = 0; i < glints; i++) {
      const gx = sparkle ? sweep + (r() - 0.5) * Math.max(B * 6, w * 0.12) : r() * w;
      const gy = r() < 0.6 ? cy * (0.3 + r() * 0.8) : (s.drops[(r() * s.drops.length) | 0] || [0, cy])[1];
      glint(ctx, gx, gy, B * (0.25 + r() * 0.2), 0.5 + 0.5 * Math.sin(((t * 3) % 1) * Math.PI));
    }
    if (sparkle) {
      s.candies.forEach(([kx, ky, kind, col], i) => {
        const on = Math.max(0, Math.sin(age * 3 - i * 0.6));
        if (on > 0.01) glowDot(ctx, kx, ky, cr * 0.9, kind === "gum" ? col : "#ff4b5a", on * 0.9);
      });
    }
  },
};
