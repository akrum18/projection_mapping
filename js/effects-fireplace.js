// Fireplace: a detailed hearth for Halloween and Christmas.
// Flames come from a small heat simulation (cooled as it rises, drifted sideways)
// coloured through a palette and scaled up smoothly, so they lick and flicker like
// real fire. Static parts (wall, firebox, mantel, logs, decorations) are drawn
// once per size into an offscreen canvas; light, embers and sparks animate on top.
import { TAU, rnd, seeded, glowSprite } from "./fx-util.js";

const FLAME_STOPS = {
  warm: [[0, 0, 0], [70, 8, 0], [160, 26, 0], [225, 75, 5], [255, 140, 25], [255, 196, 80], [255, 236, 170], [255, 252, 230]],
  "ghostly green": [[0, 0, 0], [0, 42, 12], [8, 110, 32], [36, 186, 64], [110, 238, 110], [186, 255, 168], [232, 255, 220], [255, 255, 250]],
  "witch purple": [[0, 0, 0], [32, 0, 52], [84, 10, 136], [150, 40, 212], [198, 104, 255], [228, 172, 255], [245, 222, 255], [255, 250, 255]],
  blue: [[0, 0, 0], [0, 12, 64], [0, 44, 150], [18, 104, 232], [80, 170, 255], [160, 214, 255], [220, 240, 255], [255, 255, 255]],
};
const palettes = new Map();
function palette(name) {
  if (palettes.has(name)) return palettes.get(name);
  const stops = FLAME_STOPS[name] || FLAME_STOPS.warm, p = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (stops.length - 1), k = Math.min(stops.length - 2, f | 0), u = f - k;
    for (let c = 0; c < 3; c++) p[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * u;
  }
  palettes.set(name, p);
  return p;
}
const flameColor = (name, i) => { const p = palette(name); return `rgb(${p[i * 3]},${p[i * 3 + 1]},${p[i * 3 + 2]})`; };

const SURROUNDS = {
  "red brick": { base: [128, 58, 42], mortar: "#2a1a15", kind: "brick" },
  "grey stone": { base: [118, 114, 108], mortar: "#26231f", kind: "stone" },
  "dark stone": { base: [62, 60, 66], mortar: "#121114", kind: "stone" },
};

function layout(w, h) {
  const ow = w * 0.56, oh = h * 0.46, ox = (w - ow) / 2, oy = h * 0.42;
  const inset = ow * 0.13;
  return {
    ox, oy, ow, oh, cx: w / 2,
    back: { x: ox + inset, y: oy + oh * 0.12, w: ow - inset * 2, h: oh * 0.74 },
    mantel: { x: ox - w * 0.09, y: oy - h * 0.12, w: ow + w * 0.18, h: h * 0.05 },
    hearthY: oy + oh,
  };
}

// ---------- static layer ----------
function drawWall(g, w, h, sur, r) {
  const [br, bg, bb] = sur.base;
  g.fillStyle = sur.mortar; g.fillRect(0, 0, w, h);
  if (sur.kind === "brick") {
    const bh = h / 17, bw = bh * 2.7, gap = Math.max(1, bh * 0.12);
    for (let row = 0, y = 0; y < h; row++, y += bh) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
        const k = 0.78 + r() * 0.36;
        g.fillStyle = `rgb(${br * k | 0},${bg * k | 0},${bb * k | 0})`;
        g.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
        g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(x + gap / 2, y + gap / 2, bw - gap, (bh - gap) * 0.18);
        g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x + gap / 2, y + bh - gap / 2 - (bh - gap) * 0.16, bw - gap, (bh - gap) * 0.16);
        for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; g.fillRect(x + r() * bw, y + r() * bh, 1 + r() * 2, 1 + r() * 2); }
      }
    }
  } else {
    let y = 0;
    while (y < h) {
      const rh = h / 12 * (0.8 + r() * 0.5);
      let x = -r() * 40;
      while (x < w) {
        const sw = rh * (1.2 + r() * 1.6), k = 0.75 + r() * 0.4, gap = Math.max(1.5, rh * 0.08);
        g.fillStyle = `rgb(${br * k | 0},${bg * k | 0},${bb * k | 0})`;
        g.beginPath(); g.roundRect ? g.roundRect(x + gap, y + gap, sw - gap * 2, rh - gap * 2, rh * 0.18) : g.rect(x + gap, y + gap, sw - gap * 2, rh - gap * 2); g.fill();
        const gr = g.createLinearGradient(0, y, 0, y + rh);
        gr.addColorStop(0, "rgba(255,255,255,0.08)"); gr.addColorStop(1, "rgba(0,0,0,0.25)");
        g.fillStyle = gr; g.fill();
        x += sw;
      }
      y += rh;
    }
  }
}

function drawFirebox(g, L, h) {
  const { ox, oy, ow, oh, back: b } = L;
  // interior: back wall, side walls in perspective, floor
  g.fillStyle = "#140a07"; g.fillRect(ox, oy, ow, oh);
  const sb = h / 34;
  for (let y = b.y, row = 0; y < b.y + b.h; y += sb, row++) for (let x = b.x + (row % 2 ? -sb : 0); x < b.x + b.w; x += sb * 2.4) {
    g.fillStyle = `rgba(70,32,22,${0.25 + ((x * 7 + y * 13) % 10) / 40})`;
    g.fillRect(Math.max(b.x, x + 1), y + 1, Math.min(sb * 2.4 - 2, b.x + b.w - x - 1), sb - 2);
  }
  const quad = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  quad([[ox, oy], [b.x, b.y], [b.x, b.y + b.h], [ox, oy + oh]], "rgba(48,22,14,0.85)");
  quad([[ox + ow, oy], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [ox + ow, oy + oh]], "rgba(48,22,14,0.85)");
  quad([[ox, oy], [ox + ow, oy], [b.x + b.w, b.y], [b.x, b.y]], "rgba(8,4,3,0.95)");
  quad([[ox, oy + oh], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [ox + ow, oy + oh]], "#2a221f");
  // soot rising up the back wall
  const soot = g.createLinearGradient(0, oy, 0, oy + oh);
  soot.addColorStop(0, "rgba(0,0,0,0.9)"); soot.addColorStop(0.55, "rgba(0,0,0,0.35)"); soot.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = soot; g.fillRect(ox, oy, ow, oh);
}

// Dressed-stone surround: two pilasters and a lintel with a keystone.
function drawSurround(g, L, h, sur) {
  const t = h * 0.065, { ox, oy, ow } = L, bottom = L.hearthY;
  const [r0, g0, b0] = sur.kind === "brick" ? [168, 146, 118] : sur.base.map((v) => Math.min(255, v * 1.25));
  const block = (x, y, w, hh, k = 1) => {
    const gr = g.createLinearGradient(x, y, x + w, y + hh);
    gr.addColorStop(0, `rgb(${r0 * 1.08 * k | 0},${g0 * 1.08 * k | 0},${b0 * 1.08 * k | 0})`);
    gr.addColorStop(1, `rgb(${r0 * 0.78 * k | 0},${g0 * 0.78 * k | 0},${b0 * 0.78 * k | 0})`);
    g.fillStyle = gr; g.fillRect(x, y, w, hh);
    g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(x, y, w, Math.max(1, hh * 0.05)); g.fillRect(x, y, Math.max(1, w * 0.04), hh);
    g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(x, y + hh - Math.max(1, hh * 0.05), w, Math.max(1, hh * 0.05)); g.fillRect(x + w - Math.max(1, w * 0.04), y, Math.max(1, w * 0.04), hh);
  };
  const rows = 5, ph = (bottom - oy) / rows;
  for (let i = 0; i < rows; i++) {
    const k = 0.92 + ((i * 37) % 10) / 60;
    block(ox - t, oy + i * ph, t, ph, k);
    block(ox + ow, oy + i * ph, t, ph, k * 0.97);
  }
  const n = 6, lw = (ow + t * 2) / n;
  for (let i = 0; i < n; i++) block(ox - t + i * lw, oy - t, lw, t, 0.95 + (i % 2) * 0.05);
  const kw = lw * 0.7, kx = L.cx - kw / 2;
  g.fillStyle = `rgb(${r0 | 0},${g0 | 0},${b0 | 0})`;
  g.beginPath(); g.moveTo(kx - kw * 0.12, oy - t * 1.18); g.lineTo(kx + kw * 1.12, oy - t * 1.18); g.lineTo(kx + kw * 0.92, oy + t * 0.18); g.lineTo(kx + kw * 0.08, oy + t * 0.18); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(kx - kw * 0.1, oy - t * 1.18, kw * 1.2, Math.max(1, t * 0.06));
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = Math.max(1, h * 0.002); g.stroke();
  // inner shadow where the firebox recedes
  g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(ox, oy, Math.max(2, h * 0.008), bottom - oy); g.fillRect(ox, oy, ow, Math.max(2, h * 0.01));
}

function drawWreath(g, x, y, R, r) {
  for (let i = 0; i < 520; i++) {
    const a = r() * TAU, rr = R * (0.72 + r() * 0.5), px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr, d = a + Math.PI / 2 + (r() - 0.5);
    g.strokeStyle = ["#123d1d", "#1d5a2a", "#2b7a39", "#3d8f47"][(r() * 4) | 0]; g.lineWidth = Math.max(1, R * 0.035);
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(d) * R * 0.16, py + Math.sin(d) * R * 0.16); g.stroke();
  }
  for (let i = 0; i < 14; i++) { const a = r() * TAU, rr = R * (0.75 + r() * 0.3); g.fillStyle = "#c4161c"; g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, R * 0.06, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.5)"; g.beginPath(); g.arc(x + Math.cos(a) * rr - R * 0.02, y + Math.sin(a) * rr - R * 0.02, R * 0.018, 0, TAU); g.fill(); }
  g.fillStyle = "#b3122e";
  for (const k of [-1, 1]) {
    g.beginPath(); g.ellipse(x + k * R * 0.28, y + R * 0.92, R * 0.3, R * 0.16, k * -0.4, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x, y + R * 0.95); g.lineTo(x + k * R * 0.3, y + R * 1.45); g.lineTo(x + k * R * 0.14, y + R * 1.5); g.closePath(); g.fill();
  }
  g.fillStyle = "#8e0e24"; g.beginPath(); g.arc(x, y + R * 0.93, R * 0.12, 0, TAU); g.fill();
}

function drawPresent(g, x, y, w, hh, paper, ribbon) {
  g.fillStyle = paper; g.fillRect(x, y - hh, w, hh);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + w * 0.6, y - hh, w * 0.4, hh);
  g.fillStyle = ribbon; g.fillRect(x + w * 0.42, y - hh, w * 0.16, hh); g.fillRect(x, y - hh * 0.62, w, hh * 0.14);
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + w * 0.5 + k * w * 0.14, y - hh - w * 0.06, w * 0.16, w * 0.08, k * -0.5, 0, TAU); g.fill(); }
}

function drawSkull(g, x, y, s) {
  g.fillStyle = "#e9e2cf";
  g.beginPath(); g.arc(x, y - s * 0.55, s * 0.5, Math.PI, 0); g.lineTo(x + s * 0.5, y - s * 0.45); g.quadraticCurveTo(x + s * 0.48, y - s * 0.12, x + s * 0.3, y - s * 0.08);
  g.lineTo(x + s * 0.28, y); g.lineTo(x - s * 0.28, y); g.lineTo(x - s * 0.3, y - s * 0.08); g.quadraticCurveTo(x - s * 0.48, y - s * 0.12, x - s * 0.5, y - s * 0.45); g.closePath(); g.fill();
  g.fillStyle = "rgba(0,0,0,0.2)"; g.beginPath(); g.arc(x + s * 0.12, y - s * 0.6, s * 0.36, -0.6, 1.2); g.fill();
  g.fillStyle = "#1a1310";
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * s * 0.2, y - s * 0.45, s * 0.13, s * 0.15, 0, 0, TAU); g.fill(); }
  g.beginPath(); g.moveTo(x, y - s * 0.32); g.lineTo(x - s * 0.06, y - s * 0.2); g.lineTo(x + s * 0.06, y - s * 0.2); g.closePath(); g.fill();
  g.strokeStyle = "#1a1310"; g.lineWidth = Math.max(1, s * 0.03);
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * s * 0.09, y - s * 0.1); g.lineTo(x + i * s * 0.09, y); g.stroke(); }
}

function drawMantel(g, L) {
  const m = L.mantel;
  const sh = g.createLinearGradient(0, m.y + m.h, 0, m.y + m.h * 2.6);
  sh.addColorStop(0, "rgba(0,0,0,0.55)"); sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh; g.fillRect(m.x, m.y + m.h, m.w, m.h * 1.6);
  const wood = g.createLinearGradient(0, m.y, 0, m.y + m.h);
  wood.addColorStop(0, "#6b4226"); wood.addColorStop(0.35, "#57341d"); wood.addColorStop(1, "#2e1b0f");
  g.fillStyle = wood; g.fillRect(m.x, m.y, m.w, m.h);
  g.strokeStyle = "rgba(20,10,4,0.35)"; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const y = m.y + m.h * (0.2 + i * 0.13); g.beginPath(); g.moveTo(m.x, y); for (let x = m.x; x <= m.x + m.w; x += m.w / 12) g.lineTo(x, y + Math.sin(x * 0.05 + i) * m.h * 0.04); g.stroke(); }
  g.fillStyle = "rgba(255,220,180,0.12)"; g.fillRect(m.x, m.y, m.w, Math.max(1, m.h * 0.12));
}

function drawHearth(g, L, w, h) {
  const y = L.hearthY, x0 = L.ox - w * 0.06, x1 = L.ox + L.ow + w * 0.06;
  const gr = g.createLinearGradient(0, y, 0, h);
  gr.addColorStop(0, "#5a524c"); gr.addColorStop(0.15, "#3d3733"); gr.addColorStop(1, "#1d1a18");
  g.fillStyle = gr; g.fillRect(x0, y, x1 - x0, h - y);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(x0, y, x1 - x0, Math.max(1, h * 0.006));
  for (let x = x0 + (x1 - x0) / 4; x < x1; x += (x1 - x0) / 4) { g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(x, y, 1.5, h - y); }
}

function logShape(g, x, y, len, rad, ang, r) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const bark = g.createLinearGradient(0, -rad, 0, rad);
  bark.addColorStop(0, "#4a2f1d"); bark.addColorStop(0.5, "#2e1c10"); bark.addColorStop(1, "#140b06");
  g.fillStyle = bark;
  g.beginPath(); g.roundRect ? g.roundRect(-len / 2, -rad, len, rad * 2, rad * 0.6) : g.rect(-len / 2, -rad, len, rad * 2); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = Math.max(1, rad * 0.08);
  for (let i = 0; i < 7; i++) { const yy = -rad + rad * 2 * r(); g.beginPath(); g.moveTo(-len / 2 + len * r() * 0.3, yy); g.lineTo(len / 2 - len * r() * 0.3, yy + (r() - 0.5) * rad * 0.3); g.stroke(); }
  // cut end with growth rings
  g.fillStyle = "#4a3221"; g.beginPath(); g.ellipse(len / 2, 0, rad * 0.45, rad * 0.95, 0, 0, TAU); g.fill();
  g.strokeStyle = "rgba(20,12,6,0.6)";
  for (let k = 0.25; k < 1; k += 0.25) { g.beginPath(); g.ellipse(len / 2, 0, rad * 0.45 * k, rad * 0.95 * k, 0, 0, TAU); g.stroke(); }
  g.restore();
}

function logs(L, h) {
  const b = L.back, baseY = L.oy + L.oh - h * 0.035, span = L.ow * 0.62, rad = h * 0.035;
  return [
    { x: L.cx - span * 0.12, y: baseY - rad * 1.2, len: span * 0.8, rad, ang: -0.12 },
    { x: L.cx + span * 0.14, y: baseY - rad * 1.3, len: span * 0.78, rad: rad * 0.95, ang: 0.14 },
    { x: L.cx, y: baseY - rad * 0.2, len: span * 0.95, rad: rad * 1.1, ang: 0.02 },
  ];
}

function drawGrate(g, L, h) {
  const y0 = L.oy + L.oh - h * 0.085, y1 = L.oy + L.oh - h * 0.005, x0 = L.cx - L.ow * 0.36, x1 = L.cx + L.ow * 0.36;
  g.strokeStyle = "#0c0a09"; g.lineCap = "round";
  g.lineWidth = Math.max(2, h * 0.008);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
  g.lineWidth = Math.max(1.5, h * 0.006);
  for (let i = 0; i <= 9; i++) { const x = x0 + (x1 - x0) * (i / 9); g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + h * 0.004, (y0 + y1) / 2, x - h * 0.006, y1); g.stroke(); }
  for (const x of [x0 + h * 0.01, x1 - h * 0.01]) { g.lineWidth = Math.max(2, h * 0.012); g.beginPath(); g.moveTo(x, y0 - h * 0.03); g.lineTo(x, y1); g.stroke(); g.beginPath(); g.arc(x, y0 - h * 0.04, h * 0.012, 0, TAU); g.fillStyle = "#1a1512"; g.fill(); }
}

function drawCobweb(g, x, y, s, dir) {
  g.strokeStyle = "rgba(220,220,230,0.35)"; g.lineWidth = 1;
  const spokes = 6;
  for (let i = 0; i <= spokes; i++) { const a = (i / spokes) * (Math.PI / 2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + dir * Math.cos(a) * s, y + Math.sin(a) * s); g.stroke(); }
  for (let k = 0.25; k <= 1; k += 0.25) {
    g.beginPath();
    for (let i = 0; i <= spokes; i++) { const a = (i / spokes) * (Math.PI / 2), px = x + dir * Math.cos(a) * s * k, py = y + Math.sin(a) * s * k; i ? g.quadraticCurveTo(x + dir * Math.cos(a - 0.13) * s * k * 0.85, y + Math.sin(a - 0.13) * s * k * 0.85, px, py) : g.moveTo(px, py); }
    g.stroke();
  }
}

function buildStatic(s, w, h, p) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), r = seeded(17), L = layout(w, h), sur = SURROUNDS[p.surround] || SURROUNDS["red brick"];
  drawWall(g, w, h, sur, r);
  drawFirebox(g, L, h);
  for (const lg of logs(L, h)) logShape(g, lg.x, lg.y, lg.len, lg.rad, lg.ang, r);
  drawHearth(g, L, w, h);
  drawSurround(g, L, h, sur);
  // corbels under the mantel ends
  const m0 = L.mantel;
  for (const x of [L.ox - h * 0.065, L.ox + L.ow]) {
    g.fillStyle = "#3e2614";
    g.beginPath(); g.moveTo(x, m0.y + m0.h); g.lineTo(x + h * 0.065, m0.y + m0.h); g.lineTo(x + h * 0.065, m0.y + m0.h + h * 0.035);
    g.quadraticCurveTo(x + h * 0.02, m0.y + m0.h + h * 0.03, x, m0.y + m0.h + h * 0.07); g.closePath(); g.fill();
  }
  drawMantel(g, L);
  if (p.style === "christmas") {
    // garland swags along the mantel front
    const m = L.mantel, swags = 4;
    for (let i = 0; i < swags; i++) {
      const xa = m.x + (m.w / swags) * i, xb = xa + m.w / swags;
      for (let k = 0; k < 90; k++) {
        const u = k / 89, x = xa + (xb - xa) * u, y = m.y + m.h * 0.9 + Math.sin(u * Math.PI) * h * 0.045;
        for (let n = 0; n < 3; n++) {
          const a = r() * TAU, len = h * (0.008 + r() * 0.012);
          g.strokeStyle = r() < 0.5 ? "#1f5a2c" : "#2f7a3a"; g.lineWidth = Math.max(1, h * 0.003);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
        }
      }
    }
  }
  if (p.style === "christmas") {
    drawWreath(g, L.cx, L.mantel.y - h * 0.15, h * 0.07, r);
    const hx = L.ox + L.ow + w * 0.01, hy = h * 0.995;
    drawPresent(g, hx, hy, h * 0.09, h * 0.07, "#1f6e3a", "#e9c46a");
    drawPresent(g, hx + h * 0.1, hy, h * 0.07, h * 0.1, "#b3122e", "#f1f1f1");
    drawPresent(g, hx + h * 0.035, hy - h * 0.07, h * 0.06, h * 0.045, "#2c5aa0", "#e9c46a");
  }
  if (p.style === "halloween") {
    drawSkull(g, L.mantel.x + L.mantel.w * 0.42, L.mantel.y, h * 0.06);
    drawCobweb(g, L.ox, L.oy, L.oh * 0.32, 1);
    drawCobweb(g, L.ox + L.ow, L.oy, L.oh * 0.28, -1);
    drawCobweb(g, 0, 0, h * 0.22, 1);
  }
  // vignette so the light pools around the fire
  const v = g.createRadialGradient(L.cx, L.oy + L.oh * 0.6, Math.min(w, h) * 0.2, L.cx, L.oy + L.oh * 0.6, Math.max(w, h) * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.72)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  const fg = document.createElement("canvas"); fg.width = w; fg.height = h;
  drawGrate(fg.getContext("2d"), L, h);
  s.bg = c; s.fg = fg; s.L = L; s.key = `${w}x${h}:${p.surround}:${p.style}`;
  s.embers = logs(L, h).flatMap((lg) => Array.from({ length: 6 }, () => ({ lg, u: (r() - 0.5) * 0.8, v: (r() - 0.3) * 0.9, sz: 0.25 + r() * 0.35, ph: r() * TAU })));
}

// ---------- fire simulation ----------
const FW = 96, FH = 84, NH = 160;
// Smooth tiling value noise (two octaves) used as a scrolling "cooling map":
// where it's high the flame cools fast, so the fire breaks into licking tongues.
let NOISE = null;
function noiseTable() {
  if (NOISE) return NOISE;
  const r = seeded(31), out = new Float32Array(FW * NH);
  const oct = (cw, ch, amp) => {
    const gw = Math.ceil(FW / cw) + 1, gh = NH / ch, grid = Array.from({ length: gw * gh }, () => r());
    const at = (gx, gy) => grid[(gy % gh) * gw + Math.min(gx, gw - 1)];
    for (let y = 0; y < NH; y++) for (let x = 0; x < FW; x++) {
      const fx = x / cw, fy = y / ch, ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy;
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * su, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * su;
      out[y * FW + x] += (a + (b - a) * sv) * amp;
    }
  };
  oct(10, 32, 0.65); oct(4, 16, 0.35); // stretched tall, so the cooling makes upright tongues
  return (NOISE = out);
}
function stepFire(s, t, p) {
  const heat = s.heat, N = noiseTable(), cool = (255 / (FH * (0.5 + p.height * 0.55))) * 1.7;
  s.scroll = (s.scroll + 1.8) % NH;
  const sc = s.scroll | 0;
  // fuel along the logs, hotter in slowly wandering spots
  for (let x = 0; x < FW; x++) {
    const u = x / (FW - 1), edge = Math.min(1, Math.max(0, 1 - Math.abs(u - 0.5) / 0.44) * 1.8);
    const hot = 0.7 + 0.3 * N[((sc * 2) % NH) * FW + x];
    const v = 255 * edge * hot * p.intensity;
    heat[(FH - 1) * FW + x] = v; heat[(FH - 2) * FW + x] = v;
  }
  for (let y = 0; y < FH - 2; y++) {
    const row = y * FW, below = (y + 1) * FW, nrow = ((y + sc) % NH) * FW;
    for (let x = 0; x < FW; x++) {
      const n = N[nrow + x];
      const sx = Math.min(FW - 1, Math.max(0, x + Math.round((n - 0.5) * 1.6 + (Math.random() - 0.5) * 0.9)));
      const v = heat[below + sx] - cool * (0.25 + 1.5 * n * n) - Math.random() * cool * 0.35;
      heat[row + x] = v > 0 ? v : 0;
    }
  }
}
function paintFire(s, pal) {
  const d = s.img.data, heat = s.heat;
  for (let i = 0; i < FW * FH; i++) {
    const v = heat[i] | 0, j = i * 4;
    d[j] = pal[v * 3]; d[j + 1] = pal[v * 3 + 1]; d[j + 2] = pal[v * 3 + 2]; d[j + 3] = 255;
  }
  s.fctx.putImageData(s.img, 0, 0);
}

// ---------- dynamic decorations ----------
function candle(ctx, x, y, w, hh, t, ph, flameName) {
  ctx.fillStyle = "#efe4cf"; ctx.fillRect(x - w / 2, y - hh, w, hh);
  ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x + w * 0.15, y - hh, w * 0.35, hh);
  ctx.fillStyle = "#efe4cf"; ctx.beginPath(); ctx.ellipse(x - w * 0.3, y - hh + w * 0.3, w * 0.12, w * 0.4, 0, 0, TAU); ctx.fill();
  const fl = 1 + 0.12 * Math.sin(t * 13 + ph) + 0.06 * Math.sin(t * 31 + ph);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.7;
  ctx.drawImage(glowSprite(flameColor(flameName, 170), 64), x - w * 3, y - hh - w * 3.6, w * 6, w * 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = flameColor(flameName, 230);
  ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 5 + ph) * w * 0.05, y - hh - w * 0.7 * fl, w * 0.22, w * 0.6 * fl, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}
function stocking(ctx, x, y, s, t, i, colors) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.9 + i * 1.7) * 0.035);
  ctx.strokeStyle = "#2a1a0e"; ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(0, s * 0.05); ctx.stroke();
  ctx.fillStyle = colors[i % colors.length];
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, s * 0.1); ctx.lineTo(s * 0.32, s * 0.1); ctx.lineTo(s * 0.3, s * 1.05);
  ctx.quadraticCurveTo(s * 0.32, s * 1.42, s * 0.02, s * 1.4); ctx.lineTo(-s * 0.55, s * 1.38);
  ctx.quadraticCurveTo(-s * 0.85, s * 1.3, -s * 0.66, s * 1.08); ctx.quadraticCurveTo(-s * 0.36, s * 1.0, -s * 0.32, s * 0.86);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(s * 0.05, s * 0.3, s * 0.25, s * 0.8);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(-s * 0.3 + k * s * 0.1, s * 0.16 + (k % 2) * s * 0.04, s * 0.1, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function pumpkin(ctx, x, y, s, t, flameName) {
  ctx.fillStyle = "#c65a0f";
  for (const [dx, rx] of [[-0.42, 0.42], [0.42, 0.42], [-0.18, 0.46], [0.18, 0.46], [0, 0.48]]) { ctx.beginPath(); ctx.ellipse(x + dx * s, y, rx * s, s * 0.62, 0, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = "rgba(90,35,5,0.6)"; ctx.lineWidth = Math.max(1, s * 0.04);
  for (const dx of [-0.5, -0.2, 0.2, 0.5]) { ctx.beginPath(); ctx.ellipse(x + dx * s * 0.6, y, s * 0.12, s * 0.6, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  ctx.fillStyle = "#3b5f1c"; ctx.fillRect(x - s * 0.06, y - s * 0.78, s * 0.12, s * 0.22);
  const glow = 0.75 + 0.2 * Math.sin(t * 11) + 0.08 * Math.sin(t * 27);
  ctx.fillStyle = flameColor(flameName, Math.round(150 + 70 * glow));
  const face = () => {
    ctx.beginPath();
    for (const k of [-1, 1]) { ctx.moveTo(x + k * s * 0.38, y - s * 0.08); ctx.lineTo(x + k * s * 0.2, y - s * 0.32); ctx.lineTo(x + k * s * 0.08, y - s * 0.06); ctx.closePath(); }
    ctx.moveTo(x - s * 0.1, y + s * 0.02); ctx.lineTo(x + s * 0.1, y + s * 0.02); ctx.lineTo(x, y - s * 0.12); ctx.closePath();
    ctx.moveTo(x - s * 0.5, y + s * 0.16);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x - s * 0.5 + i * s * (1 / 6), y + s * (i % 2 ? 0.26 : 0.4));
    ctx.lineTo(x + s * 0.5, y + s * 0.16); ctx.quadraticCurveTo(x, y + s * 0.34, x - s * 0.5, y + s * 0.16);
  };
  face(); ctx.fill();
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 * glow;
  ctx.drawImage(glowSprite(flameColor(flameName, 160), 64), x - s * 1.4, y - s * 1.2, s * 2.8, s * 2.4);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

export const FIREPLACE = {
  fireplace: {
    label: "Fireplace",
    params: {
      style: { type: "select", options: ["christmas", "halloween", "plain"], default: "christmas", label: "Decorations" },
      flames: { type: "select", options: Object.keys(FLAME_STOPS), default: "warm", label: "Flame colour" },
      surround: { type: "select", options: Object.keys(SURROUNDS), default: "red brick", label: "Surround" },
      intensity: { type: "range", min: 0.4, max: 1.4, step: 0.05, default: 1, label: "Fire size" },
      height: { type: "range", min: 0.3, max: 1.5, step: 0.05, default: 0.9, label: "Flame height" },
      sparks: { type: "range", min: 0, max: 1, step: 0.05, default: 0.5, label: "Sparks" },
    },
    draw(ctx, w, h, t, dt, p, s) {
      if (s.key !== `${w}x${h}:${p.surround}:${p.style}`) buildStatic(s, w, h, p);
      if (!s.heat) {
        s.heat = new Float32Array(FW * FH);
        s.fc = document.createElement("canvas"); s.fc.width = FW; s.fc.height = FH;
        s.fctx = s.fc.getContext("2d"); s.img = s.fctx.createImageData(FW, FH);
        s.mid = document.createElement("canvas"); s.mid.width = FW * 3; s.mid.height = FH * 3;
        s.mctx = s.mid.getContext("2d"); s.mctx.imageSmoothingEnabled = true; s.mctx.imageSmoothingQuality = "high";
        s.sparks = []; s.acc = 0; s.scroll = 0;
        for (let i = 0; i < FH; i++) stepFire(s, t, p);
      }
      s.acc += dt;
      for (let n = 0; s.acc > 1 / 45 && n < 4; n++) { s.acc -= 1 / 45; stepFire(s, t, p); }
      paintFire(s, palette(p.flames));
      s.mctx.clearRect(0, 0, s.mid.width, s.mid.height);
      s.mctx.drawImage(s.fc, 0, 0, s.mid.width, s.mid.height); // two-step upscale keeps the flames soft
      const L = s.L, flick = 0.82 + 0.1 * Math.sin(t * 9.3) + 0.06 * Math.sin(t * 23.7) + 0.04 * Math.sin(t * 3.1);
      ctx.drawImage(s.bg, 0, 0);
      // firelight on the room
      ctx.globalCompositeOperation = "lighter";
      const fy = L.oy + L.oh * 0.75;
      const room = ctx.createRadialGradient(L.cx, fy, 0, L.cx, fy, Math.max(w, h) * 0.75);
      const lc = palette(p.flames), mid = 140 * 3;
      room.addColorStop(0, `rgba(${lc[mid]},${lc[mid + 1]},${lc[mid + 2]},${0.32 * flick * p.intensity})`);
      room.addColorStop(0.45, `rgba(${lc[mid]},${lc[mid + 1]},${lc[mid + 2]},${0.1 * flick * p.intensity})`);
      room.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = room; ctx.fillRect(0, 0, w, h);
      // inside the firebox
      ctx.save();
      ctx.beginPath(); ctx.rect(L.ox, L.oy, L.ow, L.oh); ctx.clip();
      const inner = ctx.createRadialGradient(L.cx, L.oy + L.oh * 0.85, 0, L.cx, L.oy + L.oh * 0.85, L.ow * 0.6);
      inner.addColorStop(0, `rgba(${lc[mid]},${lc[mid + 1]},${lc[mid + 2]},${0.55 * flick})`); inner.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = inner; ctx.fillRect(L.ox, L.oy, L.ow, L.oh);
      // embers glowing in the charred logs
      for (const e of s.embers) {
        const lg = e.lg, a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.9 + e.ph)) ** 2;
        const ex = lg.x + Math.cos(lg.ang) * e.u * lg.len - Math.sin(lg.ang) * e.v * lg.rad;
        const ey = lg.y + Math.sin(lg.ang) * e.u * lg.len + Math.cos(lg.ang) * e.v * lg.rad, r0 = lg.rad * e.sz;
        ctx.globalAlpha = a; ctx.drawImage(glowSprite(flameColor(p.flames, 175), 32), ex - r0 * 2, ey - r0 * 1.2, r0 * 4, r0 * 2.4);
      }
      ctx.globalAlpha = 1;
      // the flames: a soft glow pass, then the crisp pass
      const fw = L.ow * 0.8, fh = L.oh * 1.05 * (0.6 + p.height * 0.45), fx = L.cx - fw / 2, fyTop = L.oy + L.oh - L.oh * 0.06 - fh;
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.5; ctx.drawImage(s.mid, fx - fw * 0.1, fyTop - fh * 0.08, fw * 1.2, fh * 1.1);
      ctx.globalAlpha = 1; ctx.drawImage(s.mid, fx, fyTop, fw, fh);
      // ember bed
      for (let i = 0; i < 9; i++) {
        const ex = L.cx + (i - 4) * L.ow * 0.075, ey = L.oy + L.oh - L.oh * 0.05, eb = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.1);
        ctx.globalAlpha = 0.5 + 0.4 * eb;
        ctx.drawImage(glowSprite(flameColor(p.flames, 190), 64), ex - L.ow * 0.07, ey - L.oh * 0.05, L.ow * 0.14, L.oh * 0.1);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // sparks drift up out of the fire
      if (Math.random() < p.sparks * dt * 14) s.sparks.push({ x: L.cx + (Math.random() - 0.5) * L.ow * 0.5, y: L.oy + L.oh * 0.75, vx: rnd(18, -18) * (w / 600), vy: -rnd(130, 60) * (h / 400), life: 1, r: rnd(2.2, 1) * Math.max(1, w / 600) });
      for (let i = s.sparks.length - 1; i >= 0; i--) {
        const k = s.sparks[i];
        k.life -= dt * 0.55; k.x += (k.vx + Math.sin(t * 6 + i) * 14) * dt; k.y += k.vy * dt;
        if (k.life <= 0 || k.y < L.oy) { s.sparks.splice(i, 1); continue; }
        ctx.globalAlpha = k.life;
        ctx.drawImage(glowSprite(flameColor(p.flames, 220), 32), k.x - k.r * 3, k.y - k.r * 3, k.r * 6, k.r * 6);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(s.fg, 0, 0);
      // decorations that move or glow
      const m = L.mantel;
      if (p.style === "christmas") {
        const n = 4, colors = ["#b3122e", "#1f6e3a", "#b3122e", "#c9a227"];
        for (let i = 0; i < n; i++) stocking(ctx, m.x + m.w * (0.16 + i * 0.227), m.y + m.h * 1.15, h * 0.09, t, i, colors);
        ctx.globalCompositeOperation = "lighter";
        const bulbs = ["#ff3b30", "#ffd60a", "#30d158", "#0a84ff"];
        for (let i = 0; i < 24; i++) {
          const u = (i + 0.5) / 24, sw = Math.floor(u * 4), uu = u * 4 - sw;
          const x = m.x + m.w * u, y = m.y + m.h * 0.9 + Math.sin(uu * Math.PI) * h * 0.045;
          ctx.globalAlpha = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.4 + i * 1.9));
          ctx.drawImage(glowSprite(bulbs[i % 4], 32), x - h * 0.012, y - h * 0.012, h * 0.024, h * 0.024);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        candle(ctx, m.x + m.w * 0.06, m.y, h * 0.022, h * 0.07, t, 0.3, p.flames);
        candle(ctx, m.x + m.w * 0.94, m.y, h * 0.022, h * 0.055, t, 1.7, p.flames);
      } else if (p.style === "halloween") {
        pumpkin(ctx, m.x + m.w * 0.2, m.y - h * 0.045, h * 0.06, t, p.flames);
        // a spider bobbing on its thread from the web
        const sx0 = L.ox + L.ow * 0.12, sy = L.oy + L.oh * (0.32 + 0.06 * Math.sin(t * 0.9)), sr = h * 0.012;
        ctx.strokeStyle = "rgba(220,220,230,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx0, L.oy); ctx.lineTo(sx0, sy); ctx.stroke();
        ctx.fillStyle = "#0a0a0a"; ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = Math.max(1, sr * 0.25);
        for (let k = 0; k < 4; k++) for (const d of [-1, 1]) { const a = (k - 1.5) * 0.45; ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx0 + d * sr * 1.6 * Math.cos(a), sy + sr * 1.2 * Math.sin(a) - sr * 0.4); ctx.lineTo(sx0 + d * sr * 2.4 * Math.cos(a), sy + sr * 1.6 * Math.sin(a) + sr * 0.6); ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(sx0, sy + sr * 0.3, sr, sr * 1.2, 0, 0, TAU); ctx.fill();
        candle(ctx, m.x + m.w * 0.72, m.y, h * 0.02, h * 0.08, t, 0.9, p.flames);
        candle(ctx, m.x + m.w * 0.8, m.y, h * 0.02, h * 0.055, t, 2.3, p.flames);
        candle(ctx, m.x + m.w * 0.87, m.y, h * 0.02, h * 0.1, t, 4.1, p.flames);
      }
    },
  },
};
