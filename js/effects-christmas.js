// Christmas effects pack. Same contract as effects.js:
// draw(ctx, w, h, t, dt, p, s): t = seconds, dt = frame delta, p = params, s = scratch state.
import { TAU, rnd, clamp, hexToRgb, rgba, seeded, glowSprite, background, BG, PALETTES, PALETTE_PARAM, nightSky } from "./fx-util.js";

export const CHRISTMAS = {};
const SKY = { type: "select", options: ["night sky", "black", "transparent"], default: "night sky", label: "Sky" };
function sky(ctx, w, h, t, s, mode, stars = 1) {
  if (mode === "night sky") nightSky(ctx, w, h, t, s, "#01020a", "#0b1733", stars);
  else background(ctx, w, h, mode === "transparent" ? "transparent" : "black");
}
const shade = (hex, k) => { const [r, g, b] = hexToRgb(hex); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; };

// ---------------------------------------------------------------- snowfall
CHRISTMAS.snow = {
  label: "Snowfall",
  params: {
    density: { type: "range", min: 0.2, max: 3, step: 0.1, default: 1, label: "Density" },
    wind: { type: "range", min: -2, max: 2, step: 0.1, default: 0.3, label: "Wind" },
    size: { type: "range", min: 0.3, max: 2.5, step: 0.1, default: 1, label: "Flake size" },
    color: { type: "color", default: "#ffffff", label: "Colour" },
    bg: { ...BG, default: "black" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    background(ctx, w, h, p.bg);
    const want = Math.min(1600, Math.round(((w * h) / 1000) * p.density));
    s.f = s.f || [];
    while (s.f.length < want) s.f.push({ x: rnd(w), y: s.f.length < want && s.started ? -10 : rnd(h), z: Math.random(), ph: rnd(TAU) });
    if (s.f.length > want) s.f.length = want;
    s.started = true;
    const spr = glowSprite(p.color, 32), k = Math.max(0.7, Math.min(w, h) / 400);
    for (const f of s.f) {
      f.y += (16 + f.z * 70) * (h / 300) * dt;
      f.x += (p.wind * 30 * (0.4 + f.z) + Math.sin(t * 0.8 + f.ph) * 12 * (0.5 + f.z)) * dt * (w / 400);
      if (f.y > h + 8) { f.y = -8; f.x = rnd(w); }
      if (f.x > w + 8) f.x -= w + 16; else if (f.x < -8) f.x += w + 16;
      const r = (0.8 + f.z * 2.6) * p.size * k;
      ctx.globalAlpha = 0.35 + f.z * 0.65;
      ctx.drawImage(spr, f.x - r * 2, f.y - r * 2, r * 4, r * 4);
    }
    ctx.globalAlpha = 1;
  },
};

// ---------------------------------------------------------------- string lights
CHRISTMAS.lights = {
  label: "String lights",
  params: {
    rows: { type: "range", min: 1, max: 6, step: 1, default: 2, label: "Strings" },
    bulbs: { type: "range", min: 4, max: 40, step: 1, default: 14, label: "Bulbs per string" },
    palette: PALETTE_PARAM,
    mode: { type: "select", options: ["twinkle", "chase", "fade", "steady"], default: "twinkle", label: "Pattern" },
    speed: { type: "range", min: 0.2, max: 3, step: 0.1, default: 1, label: "Speed" },
    sag: { type: "range", min: 0, max: 0.5, step: 0.01, default: 0.18, label: "Droop" },
    bg: BG,
  },
  draw(ctx, w, h, t, dt, p, s) {
    background(ctx, w, h, p.bg);
    const pal = PALETTES[p.palette] || PALETTES.classic;
    const rows = Math.max(1, p.rows | 0), n = Math.max(2, p.bulbs | 0), rowH = h / rows;
    const R = Math.max(2, Math.min(rowH * 0.11, (w / n) * 0.26));
    const rng = seeded(11);
    for (let r = 0; r < rows; r++) {
      const y0 = rowH * r + rowH * 0.22;
      const yAt = (u) => y0 + p.sag * rowH * (1 - (2 * u - 1) ** 2);
      ctx.strokeStyle = "#1d2b1f"; ctx.lineWidth = Math.max(1, R * 0.18);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40; i ? ctx.lineTo(u * w, yAt(u)) : ctx.moveTo(0, yAt(0)); }
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, x = u * w, y = yAt(u) + R * 1.4, ph = rng() * TAU;
        const col = pal[(i + r) % pal.length];
        let b = 1;
        if (p.mode === "twinkle") b = 0.35 + 0.65 * Math.max(0, Math.sin(t * p.speed * 2.2 + ph)) ** 0.6;
        else if (p.mode === "chase") b = ((i + r * 2 - t * p.speed * 6) % 3 + 3) % 3 < 1 ? 1 : 0.15;
        else if (p.mode === "fade") b = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * p.speed * 1.5 + (i % 2) * Math.PI));
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = b * 0.9;
        ctx.drawImage(glowSprite(col), x - R * 3.2, y - R * 3.2, R * 6.4, R * 6.4);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#222"; ctx.fillRect(x - R * 0.32, y - R * 1.45, R * 0.64, R * 0.55);
        ctx.fillStyle = b > 0.5 ? col : shade(col, 0.25 + b * 0.5);
        ctx.beginPath(); ctx.ellipse(x, y, R * 0.55, R * 0.9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.5 * b})`;
        ctx.beginPath(); ctx.ellipse(x - R * 0.18, y - R * 0.3, R * 0.14, R * 0.28, 0, 0, TAU); ctx.fill();
      }
    }
  },
};

// ---------------------------------------------------------------- candy cane stripes
CHRISTMAS.candycane = {
  label: "Candy cane stripes",
  params: {
    width: { type: "range", min: 0.04, max: 0.4, step: 0.01, default: 0.14, label: "Stripe width" },
    angle: { type: "range", min: -60, max: 60, step: 1, default: 35, label: "Angle" },
    speed: { type: "range", min: -3, max: 3, step: 0.1, default: 0.6, label: "Scroll speed" },
    color1: { type: "color", default: "#d71f2b", label: "Stripe" },
    color2: { type: "color", default: "#fff6ee", label: "Base" },
    style: { type: "select", options: ["classic", "mint"], default: "classic", label: "Style" },
    shading: { type: "select", options: ["pillar", "flat"], default: "pillar", label: "Shading" },
  },
  draw(ctx, w, h, t, dt, p) {
    ctx.fillStyle = p.color2; ctx.fillRect(0, 0, w, h);
    const sw = p.width * Math.max(w, h), period = sw * 2, L = Math.hypot(w, h);
    const off = (((t * p.speed * period * 0.5) % period) + period) % period;
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.rotate((p.angle * Math.PI) / 180);
    for (let x = -L - period + off; x < L + period; x += period) {
      ctx.fillStyle = p.color1; ctx.fillRect(x, -L, sw, L * 2);
      if (p.style === "mint") { ctx.fillStyle = "#1f9a4b"; ctx.fillRect(x + sw * 1.4, -L, sw * 0.2, L * 2); }
    }
    ctx.restore();
    if (p.shading === "pillar") {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(0.2, "rgba(0,0,0,0)");
      g.addColorStop(0.33, "rgba(255,255,255,0.32)"); g.addColorStop(0.45, "rgba(255,255,255,0)");
      g.addColorStop(0.8, "rgba(0,0,0,0.1)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  },
};

// ---------------------------------------------------------------- wrapped present
function star5(ctx, x, y, r, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
CHRISTMAS.gift = {
  label: "Wrapped present",
  params: {
    paper: { type: "color", default: "#b3122e", label: "Paper" },
    ribbon: { type: "color", default: "#f2c14e", label: "Ribbon" },
    pattern: { type: "select", options: ["dots", "stripes", "stars", "plain"], default: "dots", label: "Pattern" },
    bow: { type: "select", options: ["bow", "no bow"], default: "bow", label: "Bow" },
    shimmer: { type: "range", min: 0, max: 1, step: 0.05, default: 0.6, label: "Shimmer" },
  },
  draw(ctx, w, h, t, dt, p) {
    ctx.fillStyle = p.paper; ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h), sp = m / 6;
    ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.strokeStyle = "rgba(255,255,255,0.14)";
    if (p.pattern === "dots") {
      for (let y = sp / 2, row = 0; y < h + sp; y += sp, row++) for (let x = (row % 2 ? sp / 2 : 0); x < w + sp; x += sp) { ctx.beginPath(); ctx.arc(x, y, sp * 0.13, 0, TAU); ctx.fill(); }
    } else if (p.pattern === "stripes") {
      ctx.lineWidth = sp * 0.18;
      for (let x = -h; x < w + h; x += sp * 0.7) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke(); }
    } else if (p.pattern === "stars") {
      for (let y = sp / 2, row = 0; y < h + sp; y += sp, row++) for (let x = (row % 2 ? sp / 2 : 0); x < w + sp; x += sp) { star5(ctx, x, y, sp * 0.2); ctx.fill(); }
    }
    const rw = m * 0.13, cx = w / 2, cy = h / 2;
    const band = (horizontal) => {
      const g = horizontal ? ctx.createLinearGradient(0, cy - rw / 2, 0, cy + rw / 2) : ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
      g.addColorStop(0, shade(p.ribbon, 0.6)); g.addColorStop(0.5, p.ribbon); g.addColorStop(1, shade(p.ribbon, 0.55));
      ctx.fillStyle = g;
      horizontal ? ctx.fillRect(0, cy - rw / 2, w, rw) : ctx.fillRect(cx - rw / 2, 0, rw, h);
    };
    band(true); band(false);
    if (p.shimmer > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, cy - rw / 2, w, rw); ctx.rect(cx - rw / 2, 0, rw, h); ctx.clip();
      const sx = (((t * 0.22) % 1.6) - 0.3) * (w + h);
      const g = ctx.createLinearGradient(sx - m * 0.25, 0, sx + m * 0.25, m * 0.5);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, `rgba(255,255,255,${0.55 * p.shimmer})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (p.bow === "bow") {
      const b = m * 0.16;
      ctx.fillStyle = p.ribbon; ctx.strokeStyle = shade(p.ribbon, 0.5); ctx.lineWidth = Math.max(1, b * 0.06);
      for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + k * b * 0.5, cy + b * 1.1); ctx.lineTo(cx + k * b * 0.25, cy + b * 1.25); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx + k * b * 0.62, cy - b * 0.25, b * 0.7, b * 0.38, k * -0.5, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(p.ribbon, 0.6);
        ctx.beginPath(); ctx.ellipse(cx + k * b * 0.55, cy - b * 0.22, b * 0.3, b * 0.12, k * -0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = p.ribbon;
      }
      ctx.beginPath(); ctx.arc(cx, cy - b * 0.08, b * 0.26, 0, TAU); ctx.fill(); ctx.stroke();
    }
  },
};

// ---------------------------------------------------------------- icicles
CHRISTMAS.icicles = {
  label: "Icicles",
  params: {
    count: { type: "range", min: 5, max: 60, step: 1, default: 26, label: "Icicles" },
    length: { type: "range", min: 0.2, max: 1, step: 0.05, default: 0.6, label: "Length" },
    color: { type: "color", default: "#d8f3ff", label: "Ice colour" },
    drips: { type: "range", min: 0, max: 1, step: 0.05, default: 0.4, label: "Drips" },
    sparkle: { type: "range", min: 0, max: 1, step: 0.05, default: 0.5, label: "Sparkle" },
    bg: BG,
  },
  draw(ctx, w, h, t, dt, p, s) {
    background(ctx, w, h, p.bg);
    const n = p.count | 0;
    if (!s.ic || s.n !== n) {
      const r = seeded(3 + n); s.n = n;
      s.ic = Array.from({ length: n }, (_, i) => ({ u: (i + 0.5 + (r() - 0.5) * 0.6) / n, len: 0.25 + r() * 0.75, wid: 0.55 + r() * 0.45, drop: null }));
      s.glints = [];
    }
    ctx.fillStyle = p.color; ctx.fillRect(0, 0, w, Math.max(2, h * 0.025));
    for (const ic of s.ic) {
      const x = ic.u * w, L = ic.len * p.length * h * 0.95, wid = ic.wid * (w / n) * 0.8;
      const g = ctx.createLinearGradient(0, 0, 0, L);
      g.addColorStop(0, rgba(p.color, 0.95)); g.addColorStop(0.7, rgba(p.color, 0.6)); g.addColorStop(1, rgba(p.color, 0.2));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - wid / 2, 0);
      ctx.quadraticCurveTo(x - wid * 0.12, L * 0.6, x, L);
      ctx.quadraticCurveTo(x + wid * 0.12, L * 0.6, x + wid / 2, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = Math.max(1, wid * 0.08);
      ctx.beginPath(); ctx.moveTo(x - wid * 0.28, 0); ctx.quadraticCurveTo(x - wid * 0.1, L * 0.45, x - wid * 0.02, L * 0.85); ctx.stroke();
      if (!ic.drop && Math.random() < p.drips * dt * 0.12) ic.drop = { y: L, v: 0 };
      if (ic.drop) {
        const d = ic.drop;
        d.v += 900 * (h / 300) * dt; d.y += d.v * dt;
        ctx.fillStyle = rgba(p.color, 0.9);
        ctx.beginPath(); ctx.ellipse(x, d.y, Math.max(1, wid * 0.08), Math.max(1.5, wid * 0.14), 0, 0, TAU); ctx.fill();
        if (d.y > h + 10) ic.drop = null;
      }
    }
    if (Math.random() < p.sparkle * dt * 3 && s.ic.length) {
      const ic = s.ic[(Math.random() * s.ic.length) | 0];
      s.glints.push({ x: ic.u * w, y: rnd(ic.len * p.length * h * 0.7, 2), life: 1 });
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = s.glints.length - 1; i >= 0; i--) {
      const gl = s.glints[i];
      gl.life -= dt * 1.6;
      if (gl.life <= 0) { s.glints.splice(i, 1); continue; }
      const r = (w / n) * 0.35 * Math.sin(gl.life * Math.PI);
      ctx.strokeStyle = `rgba(255,255,255,${gl.life})`; ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.moveTo(gl.x - r, gl.y); ctx.lineTo(gl.x + r, gl.y); ctx.moveTo(gl.x, gl.y - r); ctx.lineTo(gl.x, gl.y + r); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  },
};

// ---------------------------------------------------------------- northern lights
function curtain(s, key, color) {
  s.cur = s.cur || {};
  if (s.cur[key]?.color === color) return s.cur[key].c;
  const c = document.createElement("canvas"); c.width = 4; c.height = 128;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.65, rgba(color, 0.45)); gr.addColorStop(0.9, rgba(color, 1)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  s.cur[key] = { color, c };
  return c;
}
CHRISTMAS.aurora = {
  label: "Northern lights",
  params: {
    color1: { type: "color", default: "#3dffa0", label: "Colour A" },
    color2: { type: "color", default: "#8a5cff", label: "Colour B" },
    speed: { type: "range", min: 0.1, max: 3, step: 0.1, default: 0.6, label: "Speed" },
    height: { type: "range", min: 0.2, max: 1, step: 0.05, default: 0.6, label: "Height" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    sky(ctx, w, h, t, s, p.sky);
    ctx.globalCompositeOperation = "lighter";
    const step = Math.max(2, w / 120);
    [p.color1, p.color2].forEach((col, k) => {
      const spr = curtain(s, k, col), base = h * (0.62 + k * 0.1), amp = h * 0.12, ts = t * p.speed;
      for (let x = -step; x < w + step; x += step) {
        const u = x / w;
        const y = base + Math.sin(u * 5 + ts * 0.7 + k * 2) * amp * 0.6 + Math.sin(u * 13 - ts * 1.3 + k) * amp * 0.25;
        const hh = h * p.height * (0.55 + 0.45 * Math.sin(u * 7 + ts + k * 3));
        ctx.globalAlpha = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(u * 23 + ts * 2.1 + k))) * 0.5;
        ctx.drawImage(spr, x, y - hh, step * 1.6, hh);
      }
    });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
};

// ---------------------------------------------------------------- santa's sleigh
export function drawSleigh(ctx, t) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // reindeer
  for (let i = 0; i < 4; i++) {
    const x = 44 + i * 27, y = -8 - i * 3, gal = Math.sin(t * 14 + i * 1.3);
    ctx.lineWidth = 2.2;
    for (const [lx, k] of [[6, 1], [3, -1], [-6, 1], [-9, -1]]) {
      const a = gal * 0.7 * k;
      ctx.beginPath(); ctx.moveTo(x + lx, y + 2); ctx.lineTo(x + lx + Math.sin(a) * 9, y + 2 + Math.cos(a) * 9); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(x - 1, y, 10, 4.6, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(x + 7, y - 1); ctx.lineTo(x + 12, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 14, y - 9, 3.8, 2.3, 0.3, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x + 12, y - 11); ctx.lineTo(x + 9, y - 18); ctx.moveTo(x + 10, y - 15); ctx.lineTo(x + 6, y - 17);
    ctx.moveTo(x + 13, y - 11); ctx.lineTo(x + 14, y - 19); ctx.moveTo(x + 13.6, y - 16); ctx.lineTo(x + 17, y - 18); ctx.stroke();
  }
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, -3);
  for (let i = 0; i < 4; i++) ctx.lineTo(44 + i * 27 + 8, -10 - i * 3);
  ctx.stroke();
  // sleigh body and runner
  ctx.beginPath(); ctx.moveTo(-20, -2); ctx.lineTo(10, -2); ctx.lineTo(15, 7); ctx.lineTo(-18, 7); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(-20, -6, 5, Math.PI * 0.5, Math.PI * 1.6); ctx.lineWidth = 3; ctx.stroke();
  ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-24, 12); ctx.lineTo(16, 12); ctx.quadraticCurveTo(24, 12, 23, 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14, 7); ctx.lineTo(-14, 12); ctx.moveTo(8, 7); ctx.lineTo(8, 12); ctx.stroke();
  // santa and his sack
  ctx.beginPath(); ctx.arc(-15, -8, 6.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-3, -8, 6, 7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-1, -17, 3.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-5, -19); ctx.lineTo(3, -20); ctx.lineTo(-3, -27); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(1, -10); ctx.lineTo(14, -4); ctx.stroke();
}
CHRISTMAS.sleigh = {
  label: "Santa's sleigh",
  params: {
    interval: { type: "range", min: 3, max: 40, step: 1, default: 10, label: "Seconds between flights" },
    size: { type: "range", min: 0.3, max: 1.6, step: 0.05, default: 0.8, label: "Size" },
    moon: { type: "color", default: "#fff1c2", label: "Moon" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    sky(ctx, w, h, t, s, p.sky);
    const mx = w * 0.7, my = h * 0.34, mr = Math.min(w, h) * 0.17;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
    halo.addColorStop(0, rgba(p.moon, 0.28)); halo.addColorStop(1, rgba(p.moon, 0));
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.moon; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.35, 0.12]]) { ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU); ctx.fill(); }
    if (s.next === undefined) s.next = t + 1.5;
    if (!s.pass && t >= s.next) {
      s.pass = { start: t, dur: rnd(9, 6), dir: Math.random() < 0.5 ? 1 : -1, y0: rnd(0.55, 0.32) };
      s.next = t + p.interval + rnd(p.interval * 0.5);
    }
    s.trail = s.trail || [];
    if (s.pass) {
      const q = s.pass, u = (t - q.start) / q.dur;
      if (u > 1) s.pass = null;
      else {
        const x = q.dir > 0 ? -0.35 * w + u * 1.7 * w : 1.35 * w - u * 1.7 * w;
        const y = q.y0 * h - Math.sin(u * Math.PI) * h * 0.16;
        const S = (Math.min(w, h) / 260) * p.size;
        s.trail.push({ x: x - q.dir * 22 * S, y: y + 8 * S, life: 1, r: rnd(2.2, 1) * S });
        ctx.save(); ctx.translate(x, y); ctx.scale(q.dir * S, S);
        ctx.fillStyle = "#05060b"; ctx.strokeStyle = "#05060b";
        drawSleigh(ctx, t);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = s.trail.length - 1; i >= 0; i--) {
      const g = s.trail[i];
      g.life -= dt * 0.7; g.y += dt * 12;
      if (g.life <= 0) { s.trail.splice(i, 1); continue; }
      ctx.globalAlpha = g.life * (0.6 + 0.4 * Math.sin(t * 20 + i));
      ctx.drawImage(glowSprite("#ffd76a", 32), g.x - g.r * 3, g.y - g.r * 3, g.r * 6, g.r * 6);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
};

// ---------------------------------------------------------------- hanging ornaments
CHRISTMAS.ornaments = {
  label: "Hanging ornaments",
  params: {
    count: { type: "range", min: 2, max: 14, step: 1, default: 6, label: "Ornaments" },
    palette: PALETTE_PARAM,
    swing: { type: "range", min: 0, max: 1, step: 0.05, default: 0.5, label: "Swing" },
    size: { type: "range", min: 0.4, max: 1.6, step: 0.05, default: 1, label: "Size" },
    bg: BG,
  },
  draw(ctx, w, h, t, dt, p, s) {
    background(ctx, w, h, p.bg);
    const n = p.count | 0, pal = PALETTES[p.palette] || PALETTES.classic;
    if (!s.o || s.n !== n) {
      const r = seeded(21 + n); s.n = n;
      s.o = Array.from({ length: n }, (_, i) => ({ u: (i + 0.5 + (r() - 0.5) * 0.4) / n, len: 0.18 + r() * 0.42, ph: r() * TAU, sf: 0.8 + r() * 0.45 }));
    }
    s.o.forEach((o, i) => {
      const col = pal[i % pal.length];
      const R = Math.min((w / n) * 0.34, h * 0.17) * p.size * o.sf;
      const L = o.len * h, a = Math.sin(t * (1.1 + o.sf * 0.3) + o.ph) * 0.2 * p.swing;
      const px = o.u * w, ex = px + Math.sin(a) * L, ey = Math.cos(a) * L;
      ctx.strokeStyle = "rgba(225,205,150,0.7)"; ctx.lineWidth = Math.max(1, R * 0.04);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(ex, ey); ctx.stroke();
      const bx = ex + Math.sin(a) * R * 1.05, by = ey + Math.cos(a) * R * 1.05;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(-a);
      ctx.fillStyle = "#c9a227"; ctx.fillRect(-R * 0.22, -R * 0.02, R * 0.44, R * 0.24);
      ctx.restore();
      const g = ctx.createRadialGradient(bx - R * 0.35, by - R * 0.4, R * 0.05, bx, by, R);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.18, col); g.addColorStop(1, shade(col, 0.28));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.beginPath(); ctx.ellipse(bx, by, R * 0.98, R * 0.3, 0, 0, Math.PI); ctx.stroke();
      const tw = Math.max(0, Math.sin(t * 1.7 + o.ph * 3)) ** 8;
      if (tw > 0.05) {
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = tw;
        ctx.drawImage(glowSprite("#ffffff", 32), bx - R * 0.75, by - R * 0.8, R * 0.7, R * 0.7);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }
    });
  },
};

// ---------------------------------------------------------------- twinkling stars
CHRISTMAS.stars = {
  label: "Twinkling stars",
  params: {
    density: { type: "range", min: 0.3, max: 3, step: 0.1, default: 1, label: "Density" },
    shooting: { type: "range", min: 0, max: 1, step: 0.05, default: 0.4, label: "Shooting stars" },
    color: { type: "color", default: "#eef3ff", label: "Colour" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    if (p.sky === "night sky") nightSky(ctx, w, h, t, s, "#01020a", "#0a1430", 0);
    else background(ctx, w, h, p.sky === "transparent" ? "transparent" : "black");
    const n = Math.round(((w * h) / 2200) * p.density);
    if (!s.st || s.st.length !== n) {
      const r = seeded(5);
      s.st = Array.from({ length: n }, () => ({ x: r() * w, y: r() * h, z: r() ** 2, ph: r() * TAU, sp: 0.6 + r() * 2.4 }));
    }
    const [cr, cg, cb] = hexToRgb(p.color);
    ctx.globalCompositeOperation = "lighter";
    for (const st of s.st) {
      const a = (0.25 + 0.75 * st.z) * (0.55 + 0.45 * Math.sin(t * st.sp + st.ph));
      const r = 0.6 + st.z * 1.8;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.fillRect(st.x - r / 2, st.y - r / 2, r, r);
      if (st.z > 0.82) {
        const L = r * (4 + 4 * Math.sin(t * st.sp * 0.7 + st.ph));
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a * 0.6})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(st.x - L, st.y); ctx.lineTo(st.x + L, st.y); ctx.moveTo(st.x, st.y - L); ctx.lineTo(st.x, st.y + L); ctx.stroke();
      }
    }
    s.shoot = s.shoot || [];
    if (Math.random() < p.shooting * dt * 0.35) {
      const dir = Math.random() < 0.5 ? 1 : -1, sp = Math.max(w, h) * rnd(1.4, 0.9);
      s.shoot.push({ x: rnd(w), y: rnd(h * 0.5), vx: dir * sp * 0.85, vy: sp * 0.5, life: 1 });
    }
    for (let i = s.shoot.length - 1; i >= 0; i--) {
      const m = s.shoot[i];
      m.life -= dt * 1.4; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.life <= 0) { s.shoot.splice(i, 1); continue; }
      const tx = m.x - m.vx * 0.12, ty = m.y - m.vy * 0.12;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${m.life})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, Math.min(w, h) / 250);
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  },
};

// ---------------------------------------------------------------- christmas tree
CHRISTMAS.xmastree = {
  label: "Christmas tree",
  params: {
    tree: { type: "color", default: "#0f6b34", label: "Tree" },
    palette: { ...PALETTE_PARAM, label: "Lights" },
    star: { type: "color", default: "#ffd34d", label: "Star" },
    twinkle: { type: "range", min: 0.2, max: 3, step: 0.1, default: 1, label: "Twinkle speed" },
    backdrop: { type: "select", options: ["warm window", "black", "transparent"], default: "warm window", label: "Backdrop" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    if (p.backdrop === "warm window") {
      const g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.75);
      g.addColorStop(0, "#ffcf8a"); g.addColorStop(1, "#5a2f0c");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    } else background(ctx, w, h, p.backdrop === "transparent" ? "transparent" : "black");
    const cx = w / 2, top = h * 0.13, base = h * 0.86, half = Math.min(w * 0.42, h * 0.38);
    ctx.fillStyle = "#3b2412"; ctx.fillRect(cx - half * 0.12, base - h * 0.01, half * 0.24, h * 0.1);
    const tiers = [[0.0, 0.45, 0.55], [0.22, 0.72, 0.78], [0.45, 1.0, 1.0]];
    const tri = [];
    for (const [a, b, wf] of tiers) {
      const ty = top + (base - top) * a, by = top + (base - top) * b, hw = half * wf;
      tri.push([cx, ty, cx - hw, by, cx + hw, by]);
    }
    for (let i = tri.length - 1; i >= 0; i--) {
      const [x0, y0, x1, y1, x2] = tri[i];
      const g = ctx.createLinearGradient(x1, 0, x2, 0);
      g.addColorStop(0, shade(p.tree, 0.45)); g.addColorStop(0.45, p.tree); g.addColorStop(1, shade(p.tree, 0.35));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x2, y1); ctx.quadraticCurveTo(x0, y1 + h * 0.03, x1, y1); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "rgba(240,200,90,0.75)"; ctx.lineWidth = Math.max(1, h * 0.006);
    for (const f of [0.35, 0.6, 0.85]) {
      const y = top + (base - top) * f, hw = half * (0.25 + f * 0.75) * 0.9;
      ctx.beginPath(); ctx.moveTo(cx - hw, y - h * 0.03); ctx.quadraticCurveTo(cx, y + h * 0.05, cx + hw, y - h * 0.06); ctx.stroke();
    }
    if (!s.lp || s.lw !== w || s.lh !== h) {
      const r = seeded(9); s.lw = w; s.lh = h; s.lp = [];
      for (let i = 0; i < 46; i++) {
        const [x0, y0, x1, y1, x2] = tri[(r() * 3) | 0];
        let a = r(), b = r(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
        s.lp.push({ x: x0 + a * (x1 - x0) + b * (x2 - x0), y: y0 + a * (y1 - y0) + b * (y1 - y0) - h * 0.01, ph: r() * TAU, c: i });
      }
    }
    const pal = PALETTES[p.palette] || PALETTES.classic, R = Math.max(2, h * 0.012);
    ctx.globalCompositeOperation = "lighter";
    for (const l of s.lp) {
      const col = pal[l.c % pal.length], b = 0.35 + 0.65 * Math.max(0, Math.sin(t * p.twinkle * 2.4 + l.ph));
      ctx.globalAlpha = b; ctx.drawImage(glowSprite(col, 32), l.x - R * 3, l.y - R * 3, R * 6, R * 6);
      ctx.globalAlpha = 0.6 + 0.4 * b; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(l.x, l.y, R * 0.55, 0, TAU); ctx.fill();
    }
    const sr = h * 0.065, pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
    ctx.globalAlpha = pulse; ctx.drawImage(glowSprite(p.star), cx - sr * 3, top - sr * 3, sr * 6, sr * 6);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = p.star; star5(ctx, cx, top, sr); ctx.fill();
  },
};

// ================================================================ detailed set
// Static artwork is drawn once per size into an offscreen canvas (s.art); only
// lights, snow, smoke and characters animate each frame.

// ---------------------------------------------------------------- door wreath
function hollyLeaf(g, x, y, s, ang, col) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = col; g.beginPath(); g.moveTo(0, 0);
  for (let i = 1; i <= 4; i++) { const u = i / 4; g.lineTo(u * s, -s * 0.26 * Math.sin(u * Math.PI) - (i % 2 ? s * 0.09 : 0)); }
  for (let i = 3; i >= 0; i--) { const u = i / 4; g.lineTo(u * s, s * 0.26 * Math.sin(u * Math.PI) + (i % 2 ? s * 0.09 : 0)); }
  g.closePath(); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.2)"; g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.92, 0); g.stroke();
  g.restore();
}
function pinecone(g, x, y, s, ang) {
  g.save(); g.translate(x, y); g.rotate(ang);
  for (let row = 0; row < 7; row++) for (let k = -1; k <= 1; k++) {
    const yy = -s * 0.55 + row * s * 0.18, xx = (k + (row % 2) * 0.5 - 0.25) * s * 0.17 * (1 - row / 10);
    g.fillStyle = row % 2 ? "#6b4423" : "#80552f"; g.beginPath(); g.ellipse(xx, yy, s * 0.13, s * 0.1, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(xx, yy + s * 0.05, s * 0.11, s * 0.035, 0, 0, TAU); g.fill();
  }
  g.restore();
}
function berries(g, x, y, s, r) {
  for (let i = 0; i < 3; i++) {
    const bx = x + (r() - 0.5) * s * 1.2, by = y + (r() - 0.5) * s * 1.2;
    const gr = g.createRadialGradient(bx - s * 0.2, by - s * 0.2, s * 0.05, bx, by, s * 0.5);
    gr.addColorStop(0, "#ff6a6a"); gr.addColorStop(0.4, "#d0121c"); gr.addColorStop(1, "#6a050a");
    g.fillStyle = gr; g.beginPath(); g.arc(bx, by, s * 0.5, 0, TAU); g.fill();
  }
}
function ribbonBow(g, x, y, s, col) {
  const dark = shade(col, 0.5), mid = shade(col, 0.8);
  for (const k of [-1, 1]) {
    // tails with a V-cut
    g.fillStyle = mid;
    g.beginPath(); g.moveTo(x + k * s * 0.05, y + s * 0.1);
    g.quadraticCurveTo(x + k * s * 0.45, y + s * 0.9, x + k * s * 0.3, y + s * 1.6);
    g.lineTo(x + k * s * 0.42, y + s * 1.48); g.lineTo(x + k * s * 0.55, y + s * 1.62);
    g.quadraticCurveTo(x + k * s * 0.7, y + s * 0.9, x + k * s * 0.22, y + s * 0.05); g.closePath(); g.fill();
    // loops
    const gr = g.createRadialGradient(x + k * s * 0.55, y - s * 0.15, s * 0.05, x + k * s * 0.55, y - s * 0.1, s * 0.75);
    gr.addColorStop(0, col); gr.addColorStop(0.7, mid); gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x + k * s * 0.3, y - s * 0.75, x + k * s * 1.15, y - s * 0.65, x + k * s * 0.95, y - s * 0.05);
    g.bezierCurveTo(x + k * s * 0.85, y + s * 0.35, x + k * s * 0.35, y + s * 0.25, x, y); g.fill();
    g.fillStyle = dark; g.beginPath(); g.ellipse(x + k * s * 0.42, y - s * 0.12, s * 0.22, s * 0.08, k * -0.45, 0, TAU); g.fill();
  }
  const kg = g.createLinearGradient(x, y - s * 0.22, x, y + s * 0.22);
  kg.addColorStop(0, col); kg.addColorStop(1, dark);
  g.fillStyle = kg; g.beginPath(); g.ellipse(x, y, s * 0.2, s * 0.24, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.ellipse(x - s * 0.06, y - s * 0.08, s * 0.06, s * 0.1, 0.3, 0, TAU); g.fill();
}
function buildWreath(w, h, p) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), r = seeded(41), cx = w / 2, cy = h * 0.46, R = Math.min(w, h) * 0.32;
  const layers = [["#081f0f", "#0e3018"], ["#14482a", "#1a5a30"], ["#236e36", "#2f8443"], ["#3c9a52", "#55ad63"]];
  layers.forEach((cols, li) => {
    const n = Math.round((R * 14) * (1.3 - li * 0.22));
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = R * (1 + (r() - 0.5) * (0.62 - li * 0.08));
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      const d = a + (r() < 0.5 ? 1 : -1) * Math.PI / 2 + (r() - 0.5) * 1.1, len = R * (0.12 + r() * 0.08) * (1 - li * 0.12);
      g.strokeStyle = cols[r() < 0.5 ? 0 : 1]; g.lineWidth = Math.max(1, R * 0.011); g.lineCap = "round";
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(d) * len, py + Math.sin(d) * len); g.stroke();
    }
  });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; pinecone(g, cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95, R * 0.22, a + Math.PI / 2 + (r() - 0.5)); }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.1, hx = cx + Math.cos(a) * R * 1.02, hy = cy + Math.sin(a) * R * 1.02;
    for (let k = 0; k < 3; k++) hollyLeaf(g, hx, hy, R * 0.26, a + (k - 1) * 0.9 + (r() - 0.5) * 0.3, k === 1 ? "#1c5e2c" : "#247436");
    berries(g, hx, hy, R * 0.07, r);
  }
  ribbonBow(g, cx, cy + R * 0.95, R * 0.42, p.bow);
  return c;
}
CHRISTMAS.wreath = {
  label: "Door wreath",
  params: {
    lights: { ...PALETTE_PARAM, default: "warm white", label: "Lights" },
    twinkle: { type: "range", min: 0, max: 3, step: 0.1, default: 1, label: "Twinkle" },
    bow: { type: "color", default: "#b3122e", label: "Bow" },
    bg: BG,
  },
  draw(ctx, w, h, t, dt, p, s) {
    const key = `${w}x${h}:${p.bow}`;
    if (s.key !== key) {
      s.key = key; s.art = buildWreath(w, h, p);
      const r = seeded(43), R = Math.min(w, h) * 0.32;
      s.lights = Array.from({ length: 34 }, (_, i) => { const a = (i / 34) * TAU + r() * 0.15, rr = R * (0.85 + r() * 0.32); return { x: w / 2 + Math.cos(a) * rr, y: h * 0.46 + Math.sin(a) * rr, ph: r() * TAU }; });
    }
    background(ctx, w, h, p.bg);
    ctx.drawImage(s.art, 0, 0);
    const pal = PALETTES[p.lights] || PALETTES["warm white"], L = Math.min(w, h) * 0.022;
    ctx.globalCompositeOperation = "lighter";
    s.lights.forEach((l, i) => {
      const b = p.twinkle ? 0.35 + 0.65 * Math.max(0, Math.sin(t * p.twinkle * 2 + l.ph)) ** 0.7 : 1;
      ctx.globalAlpha = b; ctx.drawImage(glowSprite(pal[i % pal.length], 32), l.x - L * 2, l.y - L * 2, L * 4, L * 4);
      ctx.globalAlpha = 0.6 + 0.4 * b; ctx.fillStyle = "#fff8e8"; ctx.beginPath(); ctx.arc(l.x, l.y, L * 0.22, 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
};

// ---------------------------------------------------------------- snowman
function snowball(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.55, "#eef3fa"); gr.addColorStop(1, "#a9bcd6");
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = "rgba(160,190,230,0.35)"; g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath(); g.arc(x, y, r * 0.97, Math.PI * 0.1, Math.PI * 0.6); g.stroke();
}
function snowmanGeom(w, h) {
  const cx = w * 0.5, ground = h * 0.88, r1 = h * 0.17, r2 = h * 0.125, r3 = h * 0.09;
  const y1 = ground - r1 * 0.85, y2 = y1 - r1 * 0.78 - r2 * 0.72, y3 = y2 - r2 * 0.8 - r3 * 0.78;
  return { cx, ground, r1, r2, r3, y1, y2, y3 };
}
function buildSnowman(w, h, p) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), S = snowmanGeom(w, h), { cx, r1, r2, r3, y1, y2, y3 } = S;
  // rolling snowy hills
  const hill = (y0, amp, f, c0, c1) => {
    g.beginPath(); g.moveTo(0, h);
    for (let i = 0; i <= 40; i++) { const x = (i / 40) * w; g.lineTo(x, y0 + Math.sin(x / w * f) * amp + Math.sin(x / w * f * 2.3 + 1) * amp * 0.4); }
    g.lineTo(w, h); g.closePath();
    const gr = g.createLinearGradient(0, y0 - amp, 0, h); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fill();
  };
  hill(h * 0.7, h * 0.04, 5, "#c9d6ea", "#8ea2c2");
  hill(h * 0.82, h * 0.025, 3, "#f4f8ff", "#c3d0e6");
  // little pines on the back hill
  const r = seeded(51);
  for (let i = 0; i < 7; i++) {
    const x = r() * w, base = h * (0.7 + r() * 0.04), th = h * (0.08 + r() * 0.08);
    if (Math.abs(x - cx) < r1 * 1.4) continue;
    g.fillStyle = "#1f3b2c";
    for (let k = 0; k < 3; k++) { const yy = base - th * (k / 3), ww = th * 0.45 * (1 - k / 4); g.beginPath(); g.moveTo(x, yy - th * 0.45); g.lineTo(x - ww, yy); g.lineTo(x + ww, yy); g.closePath(); g.fill(); }
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (let k = 0; k < 3; k++) { const yy = base - th * (k / 3), ww = th * 0.45 * (1 - k / 4); g.beginPath(); g.moveTo(x, yy - th * 0.45); g.lineTo(x - ww * 0.55, yy - th * 0.2); g.lineTo(x + ww * 0.4, yy - th * 0.22); g.closePath(); g.fill(); }
  }
  // shadow on the snow
  g.fillStyle = "rgba(70,90,130,0.28)"; g.beginPath(); g.ellipse(cx + r1 * 0.25, S.ground - r1 * 0.05, r1 * 1.25, r1 * 0.22, 0, 0, TAU); g.fill();
  // left arm (the right one waves, so it's drawn live)
  g.strokeStyle = "#4a2f1a"; g.lineCap = "round"; g.lineWidth = Math.max(2, h * 0.012);
  const ax = cx - r2 * 0.85, ay = y2 - r2 * 0.15;
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - r2 * 1.35, ay - r2 * 0.55); g.stroke();
  g.lineWidth = Math.max(1.5, h * 0.007);
  g.beginPath(); g.moveTo(ax - r2 * 1.05, ay - r2 * 0.42); g.lineTo(ax - r2 * 1.25, ay - r2 * 0.85); g.moveTo(ax - r2 * 1.2, ay - r2 * 0.48); g.lineTo(ax - r2 * 1.55, ay - r2 * 0.4); g.stroke();
  snowball(g, cx, y1, r1); snowball(g, cx, y2, r2); snowball(g, cx, y3, r3);
  // coal buttons and mouth, carrot nose
  const coal = (x, y, rr) => { const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr); gr.addColorStop(0, "#555"); gr.addColorStop(1, "#0b0b0b"); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); };
  for (let i = 0; i < 3; i++) coal(cx, y2 - r2 * 0.35 + i * r2 * 0.38, r2 * 0.075);
  for (let i = 0; i < 5; i++) { const a = Math.PI * (0.25 + i * 0.125); coal(cx + Math.cos(a) * r3 * 0.5, y3 + r3 * 0.05 + Math.sin(a) * r3 * 0.45, r3 * 0.055); }
  const ng = g.createLinearGradient(cx, y3 - r3 * 0.1, cx, y3 + r3 * 0.1); ng.addColorStop(0, "#ff9a3c"); ng.addColorStop(1, "#d8600c");
  g.fillStyle = ng; g.beginPath(); g.moveTo(cx, y3 - r3 * 0.12); g.lineTo(cx + r3 * 0.85, y3 + r3 * 0.06); g.lineTo(cx, y3 + r3 * 0.1); g.closePath(); g.fill();
  g.strokeStyle = "rgba(120,50,0,0.5)"; g.lineWidth = 1;
  for (const u of [0.25, 0.45, 0.65]) { g.beginPath(); g.moveTo(cx + r3 * 0.85 * u, y3 - r3 * 0.1 * (1 - u)); g.lineTo(cx + r3 * 0.85 * u, y3 + r3 * 0.09 * (1 - u)); g.stroke(); }
  // top hat
  const hy = y3 - r3 * 0.72, hw = r3 * 0.95;
  g.fillStyle = p.hat; g.beginPath(); g.ellipse(cx, hy, hw * 1.25, hw * 0.22, -0.08, 0, TAU); g.fill();
  const hg = g.createLinearGradient(cx - hw * 0.75, 0, cx + hw * 0.75, 0); hg.addColorStop(0, shade(p.hat, 1.6)); hg.addColorStop(0.35, p.hat); hg.addColorStop(1, shade(p.hat, 0.6));
  g.fillStyle = hg; g.fillRect(cx - hw * 0.72, hy - hw * 1.15, hw * 1.44, hw * 1.12);
  g.fillStyle = p.scarf; g.fillRect(cx - hw * 0.72, hy - hw * 0.3, hw * 1.44, hw * 0.22);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.ellipse(cx, hy - hw * 1.15, hw * 0.72, hw * 0.12, 0, 0, TAU); g.fill();
  // scarf wrap around the neck
  const sy = y2 - r2 * 0.82;
  g.fillStyle = p.scarf; g.beginPath(); g.ellipse(cx, sy, r3 * 1.02, r3 * 0.24, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,0.75)";
  for (let k = -3; k <= 3; k++) g.fillRect(cx + k * r3 * 0.28 - r3 * 0.05, sy - r3 * 0.2, r3 * 0.1, r3 * 0.4);
  g.fillStyle = "rgba(0,0,0,0.18)"; g.beginPath(); g.ellipse(cx, sy + r3 * 0.12, r3 * 1.0, r3 * 0.1, 0, 0, Math.PI); g.fill();
  return c;
}
CHRISTMAS.snowman = {
  label: "Snowman",
  params: {
    scarf: { type: "color", default: "#c8102e", label: "Scarf" },
    hat: { type: "color", default: "#1b1b22", label: "Hat" },
    wave: { type: "range", min: 0, max: 1, step: 0.05, default: 0.7, label: "Waving" },
    snow: { type: "range", min: 0, max: 2, step: 0.1, default: 1, label: "Snowfall" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    const key = `${w}x${h}:${p.scarf}:${p.hat}`;
    if (s.key !== key) { s.key = key; s.art = buildSnowman(w, h, p); }
    sky(ctx, w, h, t, s, p.sky);
    const S = snowmanGeom(w, h), { cx, r2, r3, y2, y3 } = S;
    // waving arm: bursts of waving every few seconds
    const burst = Math.max(0, Math.sin(t * 0.7)) ** 2 * p.wave;
    const ang = -0.75 - burst * (0.35 + 0.35 * Math.sin(t * 9));
    const ax = cx + r2 * 0.85, ay = y2 - r2 * 0.15, L = r2 * 1.4;
    ctx.strokeStyle = "#4a2f1a"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, h * 0.012);
    const ex = ax + Math.cos(ang) * L, ey = ay + Math.sin(ang) * L;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, h * 0.007);
    for (const [u, da] of [[0.75, -0.7], [0.9, 0.5], [1, -0.2]]) {
      const bx = ax + Math.cos(ang) * L * u, by = ay + Math.sin(ang) * L * u;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ang + da) * L * 0.25, by + Math.sin(ang + da) * L * 0.25); ctx.stroke();
    }
    ctx.drawImage(s.art, 0, 0);
    // eyes, with a blink every few seconds
    const blink = (t % 4.3) < 0.14;
    for (const k of [-1, 1]) {
      const ex2 = cx + k * r3 * 0.33, ey2 = y3 - r3 * 0.25;
      if (blink) { ctx.strokeStyle = "#111"; ctx.lineWidth = Math.max(1.5, r3 * 0.05); ctx.beginPath(); ctx.moveTo(ex2 - r3 * 0.1, ey2); ctx.lineTo(ex2 + r3 * 0.1, ey2); ctx.stroke(); }
      else { ctx.fillStyle = "#0d0d0d"; ctx.beginPath(); ctx.arc(ex2, ey2, r3 * 0.1, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(ex2 - r3 * 0.03, ey2 - r3 * 0.03, r3 * 0.03, 0, TAU); ctx.fill(); }
    }
    // scarf end fluttering in the breeze
    const sx = cx + r3 * 0.55, sy = y2 - r2 * 0.75, len = r2 * 1.1, wdt = r3 * 0.34;
    ctx.fillStyle = p.scarf; ctx.beginPath(); ctx.moveTo(sx, sy);
    const pts = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([sx + u * len * 0.35 + Math.sin(t * 3.2 - u * 4) * wdt * 0.5 * u, sy + u * len]); }
    pts.forEach(([x, y]) => ctx.lineTo(x + wdt * 0.5, y));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] - wdt * 0.5, pts[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const i of [2, 5]) { const [x, y] = pts[i]; ctx.fillRect(x - wdt * 0.5, y - len * 0.03, wdt, len * 0.06); }
    ctx.strokeStyle = p.scarf; ctx.lineWidth = Math.max(1, wdt * 0.08);
    const [fx, fy] = pts[8];
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(fx + k * wdt * 0.2, fy); ctx.lineTo(fx + k * wdt * 0.22 + Math.sin(t * 4 + k) * wdt * 0.1, fy + len * 0.1); ctx.stroke(); }
    // falling snow
    if (p.snow > 0) {
      s.f = s.f || [];
      const want = Math.round(((w * h) / 2400) * p.snow);
      while (s.f.length < want) s.f.push({ x: rnd(w), y: rnd(h), z: Math.random(), ph: rnd(TAU) });
      s.f.length = Math.min(s.f.length, want);
      const spr = glowSprite("#ffffff", 32), k = Math.max(0.7, Math.min(w, h) / 400);
      for (const f of s.f) {
        f.y += (14 + f.z * 50) * (h / 300) * dt; f.x += Math.sin(t * 0.7 + f.ph) * 10 * dt;
        if (f.y > h + 6) { f.y = -6; f.x = rnd(w); }
        const rr = (0.7 + f.z * 2.2) * k; ctx.globalAlpha = 0.4 + f.z * 0.6;
        ctx.drawImage(spr, f.x - rr * 2, f.y - rr * 2, rr * 4, rr * 4);
      }
      ctx.globalAlpha = 1;
    }
  },
};

// ---------------------------------------------------------------- winter village
function pine(g, x, base, th, col, snow) {
  for (let k = 0; k < 4; k++) {
    const yy = base - th * (k / 4) * 0.85, ww = th * 0.36 * (1 - k / 5);
    g.fillStyle = col; g.beginPath(); g.moveTo(x, yy - th * 0.38); g.lineTo(x - ww, yy); g.lineTo(x + ww, yy); g.closePath(); g.fill();
    if (snow) { g.fillStyle = snow; g.beginPath(); g.moveTo(x, yy - th * 0.38); g.lineTo(x - ww * 0.6, yy - th * 0.16); g.quadraticCurveTo(x, yy - th * 0.22, x + ww * 0.5, yy - th * 0.17); g.closePath(); g.fill(); }
  }
}
// A cottage seen from the front-left: gable end + side wall, snowy roof, chimney.
function cottage(g, x, base, s, wall, roof, out, r) {
  const fw = s, sw = s * 0.9, wh = s * 0.62, rh = s * 0.5;
  g.fillStyle = shade(wall, 0.7); g.fillRect(x + fw, base - wh, sw, wh);                 // side wall (shaded)
  g.fillStyle = wall; g.fillRect(x, base - wh, fw, wh);                                   // gable wall
  g.fillStyle = wall; g.beginPath(); g.moveTo(x, base - wh); g.lineTo(x + fw / 2, base - wh - rh); g.lineTo(x + fw, base - wh); g.closePath(); g.fill();
  g.fillStyle = roof; g.beginPath(); g.moveTo(x + fw / 2, base - wh - rh); g.lineTo(x + fw / 2 + sw, base - wh - rh); g.lineTo(x + fw + sw + s * 0.06, base - wh + s * 0.04); g.lineTo(x + fw - s * 0.02, base - wh + s * 0.04); g.closePath(); g.fill();
  // thick snow on the roof, with a wavy overhang
  g.fillStyle = "#eef4ff"; g.beginPath(); g.moveTo(x + fw / 2, base - wh - rh - s * 0.05); g.lineTo(x + fw / 2 + sw, base - wh - rh - s * 0.05);
  g.lineTo(x + fw + sw + s * 0.07, base - wh + s * 0.0);
  for (let k = 0; k <= 6; k++) g.lineTo(x + fw + sw + s * 0.07 - (sw + s * 0.09) * (k / 6), base - wh + s * (0.05 + (k % 2) * 0.04));
  g.closePath(); g.fill();
  g.strokeStyle = "#eef4ff"; g.lineWidth = Math.max(1.5, s * 0.06); g.lineCap = "round";
  g.beginPath(); g.moveTo(x - s * 0.02, base - wh + s * 0.02); g.lineTo(x + fw / 2, base - wh - rh - s * 0.02); g.lineTo(x + fw + s * 0.02, base - wh + s * 0.02); g.stroke();
  const chx = x + fw / 2 + sw * (0.55 + r() * 0.3), chy = base - wh - rh * 0.55;
  g.fillStyle = shade(wall, 0.55); g.fillRect(chx, chy - s * 0.28, s * 0.14, s * 0.3);
  g.fillStyle = "#eef4ff"; g.fillRect(chx - s * 0.02, chy - s * 0.31, s * 0.18, s * 0.05);
  // windows (lit live) and a door
  const win = [];
  win.push({ x: x + fw * 0.34, y: base - wh - rh * 0.45, w: fw * 0.32, h: rh * 0.3 });
  win.push({ x: x + fw * 0.14, y: base - wh * 0.72, w: fw * 0.24, h: wh * 0.3 }, { x: x + fw * 0.62, y: base - wh * 0.72, w: fw * 0.24, h: wh * 0.3 });
  for (let k = 0; k < 2; k++) win.push({ x: x + fw + sw * (0.18 + k * 0.42), y: base - wh * 0.68, w: sw * 0.24, h: wh * 0.3, side: true });
  g.fillStyle = "#3a2214"; g.fillRect(x + fw * 0.42, base - wh * 0.42, fw * 0.16, wh * 0.42);
  for (const wd of win) { g.fillStyle = "#1a1420"; g.fillRect(wd.x, wd.y, wd.w, wd.h); }
  out.windows.push(...win);
  out.chimneys.push({ x: chx + s * 0.07, y: chy - s * 0.3, s });
}
function buildVillage(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), r = seeded(61), out = { windows: [], chimneys: [] };
  const ridge = (y0, amp, f, ph, col0, col1) => {
    g.beginPath(); g.moveTo(0, h);
    for (let i = 0; i <= 60; i++) { const x = (i / 60) * w; g.lineTo(x, y0 + Math.sin(x / w * f + ph) * amp + Math.sin(x / w * f * 2.7 + ph * 2) * amp * 0.35); }
    g.lineTo(w, h); g.closePath();
    const gr = g.createLinearGradient(0, y0 - amp, 0, h); gr.addColorStop(0, col0); gr.addColorStop(1, col1); g.fillStyle = gr; g.fill();
  };
  ridge(h * 0.5, h * 0.05, 4, 0.5, "#4b5d82", "#2a3756");
  for (let i = 0; i < 40; i++) pine(g, r() * w, h * (0.5 + r() * 0.08), h * (0.04 + r() * 0.04), "#1c2944", "rgba(210,225,255,0.7)");
  ridge(h * 0.62, h * 0.035, 3, 2, "#a9b9d6", "#6d81a8");
  // church on the middle hill
  const chx = w * 0.68, cb = h * 0.64, cs = h * 0.09;
  g.fillStyle = "#7b6a5c"; g.fillRect(chx, cb - cs * 0.9, cs * 1.4, cs * 0.9);
  g.fillStyle = "#6a5a4e"; g.fillRect(chx - cs * 0.35, cb - cs * 2.2, cs * 0.5, cs * 2.2);
  g.fillStyle = "#3b4256"; g.beginPath(); g.moveTo(chx - cs * 0.42, cb - cs * 2.2); g.lineTo(chx - cs * 0.1, cb - cs * 3.2); g.lineTo(chx + cs * 0.22, cb - cs * 2.2); g.closePath(); g.fill();
  g.fillStyle = "#eef4ff"; g.beginPath(); g.moveTo(chx - cs * 0.1, cb - cs * 3.2); g.lineTo(chx - cs * 0.3, cb - cs * 2.55); g.lineTo(chx + cs * 0.02, cb - cs * 2.62); g.closePath(); g.fill();
  g.strokeStyle = "#d8c27a"; g.lineWidth = Math.max(1, cs * 0.05);
  g.beginPath(); g.moveTo(chx - cs * 0.1, cb - cs * 3.2); g.lineTo(chx - cs * 0.1, cb - cs * 3.55); g.moveTo(chx - cs * 0.22, cb - cs * 3.42); g.lineTo(chx + cs * 0.02, cb - cs * 3.42); g.stroke();
  g.fillStyle = "#eef4ff"; g.beginPath(); g.moveTo(chx - cs * 0.05, cb - cs * 0.9); g.lineTo(chx + cs * 0.7, cb - cs * 1.5); g.lineTo(chx + cs * 1.45, cb - cs * 0.9); g.closePath(); g.fill();
  out.windows.push({ x: chx - cs * 0.22, y: cb - cs * 1.75, w: cs * 0.24, h: cs * 0.45, arch: true }, { x: chx + cs * 0.25, y: cb - cs * 0.65, w: cs * 0.22, h: cs * 0.38, arch: true }, { x: chx + cs * 0.85, y: cb - cs * 0.65, w: cs * 0.22, h: cs * 0.38, arch: true });
  for (const wd of out.windows.slice(-3)) { g.fillStyle = "#1a1420"; g.fillRect(wd.x, wd.y, wd.w, wd.h); }
  // far cottages
  for (const [ux, s] of [[0.12, 0.06], [0.3, 0.05], [0.47, 0.055], [0.86, 0.05]]) cottage(g, w * ux, h * 0.63 + Math.sin(ux * 9) * h * 0.01, h * s, ["#8a5a3c", "#a26b45", "#6f7f94", "#9c4a3a"][(r() * 4) | 0], "#4a3b3b", out, r);
  for (let i = 0; i < 14; i++) pine(g, r() * w, h * (0.64 + r() * 0.04), h * (0.06 + r() * 0.04), "#1d3527", "rgba(235,243,255,0.85)");
  // near ground and big cottages
  ridge(h * 0.8, h * 0.025, 2.2, 4, "#f5f9ff", "#c6d3ea");
  for (const [ux, s, col] of [[0.06, 0.13, "#9a4b35"], [0.36, 0.11, "#7a5a3f"], [0.7, 0.14, "#5f6f8f"]]) cottage(g, w * ux, h * 0.82, h * s, col, "#3a2e2e", out, r);
  for (const ux of [0.28, 0.6, 0.94]) pine(g, w * ux, h * 0.86, h * 0.2, "#173022", "rgba(240,246,255,0.92)");
  // snow bank in front
  ridge(h * 0.93, h * 0.015, 5, 1, "#ffffff", "#dbe5f5");
  out.windows.forEach((wd) => { wd.ph = r() * TAU; wd.period = 8 + r() * 20; wd.offset = r(); wd.col = ["#ffcf7a", "#ffd88f", "#ffb86b", "#fff0c2"][(r() * 4) | 0]; });
  return { c, ...out };
}
CHRISTMAS.village = {
  label: "Winter village",
  params: {
    snow: { type: "range", min: 0, max: 2, step: 0.1, default: 1, label: "Snowfall" },
    smoke: { type: "range", min: 0, max: 1, step: 0.05, default: 0.6, label: "Chimney smoke" },
    lights: { type: "range", min: 0.2, max: 1, step: 0.05, default: 0.8, label: "Windows lit" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    if (s.key !== `${w}x${h}`) { s.key = `${w}x${h}`; s.v = buildVillage(w, h); s.smoke = []; }
    sky(ctx, w, h, t, s, p.sky);
    const mx = w * 0.18, my = h * 0.18, mr = Math.min(w, h) * 0.06;
    const halo = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 5); halo.addColorStop(0, "rgba(255,244,214,0.25)"); halo.addColorStop(1, "rgba(255,244,214,0)");
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h * 0.6);
    ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.drawImage(s.v.c, 0, 0);
    // windows: warm, flickering, and switching on and off over the evening
    for (const wd of s.v.windows) {
      const on = ((t / wd.period + wd.offset) % 1) < p.lights;
      if (!on) continue;
      const f = 0.85 + 0.1 * Math.sin(t * 7 + wd.ph) + 0.05 * Math.sin(t * 19 + wd.ph);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55 * f;
      ctx.drawImage(glowSprite(wd.col, 32), wd.x - wd.w, wd.y - wd.h * 0.8, wd.w * 3, wd.h * 2.6);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = f;
      ctx.fillStyle = wd.col; ctx.fillRect(wd.x, wd.y, wd.w, wd.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#2a1a12"; ctx.lineWidth = Math.max(1, wd.w * 0.1);
      ctx.beginPath(); ctx.moveTo(wd.x + wd.w / 2, wd.y); ctx.lineTo(wd.x + wd.w / 2, wd.y + wd.h); ctx.moveTo(wd.x, wd.y + wd.h / 2); ctx.lineTo(wd.x + wd.w, wd.y + wd.h / 2); ctx.stroke();
    }
    // chimney smoke
    for (const ch of s.v.chimneys) if (Math.random() < p.smoke * dt * 6) s.smoke.push({ x: ch.x, y: ch.y, r: ch.s * 0.08, life: 1, vx: ch.s * (0.25 + Math.random() * 0.2), vy: -ch.s * (0.5 + Math.random() * 0.3) });
    for (let i = s.smoke.length - 1; i >= 0; i--) {
      const q = s.smoke[i];
      q.life -= dt * 0.22; q.x += q.vx * dt; q.y += q.vy * dt; q.r += dt * q.vx * 0.5;
      if (q.life <= 0) { s.smoke.splice(i, 1); continue; }
      ctx.globalAlpha = q.life * 0.22; ctx.drawImage(glowSprite("#c9d2e3", 32), q.x - q.r * 2, q.y - q.r * 2, q.r * 4, q.r * 4);
    }
    ctx.globalAlpha = 1;
    if (p.snow > 0) {
      s.f = s.f || [];
      const want = Math.round(((w * h) / 2000) * p.snow);
      while (s.f.length < want) s.f.push({ x: rnd(w), y: rnd(h), z: Math.random(), ph: rnd(TAU) });
      s.f.length = Math.min(s.f.length, want);
      const spr = glowSprite("#ffffff", 32), k = Math.max(0.7, Math.min(w, h) / 450);
      for (const f of s.f) {
        f.y += (12 + f.z * 45) * (h / 300) * dt; f.x += (8 + Math.sin(t * 0.6 + f.ph) * 10) * dt * (0.3 + f.z);
        if (f.y > h + 6) { f.y = -6; f.x = rnd(w); }
        if (f.x > w + 6) f.x = -6;
        const rr = (0.6 + f.z * 2) * k; ctx.globalAlpha = 0.35 + f.z * 0.6;
        ctx.drawImage(spr, f.x - rr * 2, f.y - rr * 2, rr * 4, rr * 4);
      }
      ctx.globalAlpha = 1;
    }
  },
};

// ---------------------------------------------------------------- santa at the window
function frostCorner(g, x, y, s, dx, dy, r, amt) {
  const gr = g.createRadialGradient(x, y, 0, x, y, s);
  gr.addColorStop(0, `rgba(235,245,255,${0.55 * amt})`); gr.addColorStop(1, "rgba(235,245,255,0)");
  g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  g.strokeStyle = `rgba(245,250,255,${0.45 * amt})`; g.lineWidth = 1;
  const branch = (bx, by, ang, len, depth) => {
    if (depth > 3 || len < 2) return;
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    for (const k of [-0.6, 0.6]) branch(bx + (ex - bx) * 0.5, by + (ey - by) * 0.5, ang + k, len * 0.45, depth + 1);
    branch(ex, ey, ang + (r() - 0.5) * 0.5, len * 0.7, depth + 1);
  };
  const base = Math.atan2(dy, dx);
  for (let i = 0; i < 5; i++) branch(x, y, base + (i - 2) * 0.32 + (r() - 0.5) * 0.2, s * (0.25 + r() * 0.25) * amt, 0);
}
function windowGeom(w, h) {
  const fx = w * 0.16, fy = h * 0.08, fw = w * 0.68, fh = h * 0.78, bar = Math.min(w, h) * 0.03;
  return { fx, fy, fw, fh, bar, sill: fy + fh };
}
function buildRoom(w, h, p) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), G = windowGeom(w, h);
  const gr = g.createRadialGradient(w * 0.55, h * 0.55, 0, w * 0.55, h * 0.55, Math.max(w, h) * 0.7);
  gr.addColorStop(0, p.glow); gr.addColorStop(1, shade(p.glow, 0.3));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // picture rail and a framed picture for depth
  g.fillStyle = "rgba(80,40,10,0.25)"; g.fillRect(0, h * 0.3, w, h * 0.012);
  g.fillStyle = "rgba(60,30,10,0.35)"; g.fillRect(w * 0.25, h * 0.36, w * 0.12, h * 0.14);
  // back-lit Christmas tree in the room
  const tx = G.fx + G.fw * 0.78, tb = h * 0.95, th = h * 0.62;
  g.fillStyle = "#1c2416";
  for (let k = 0; k < 4; k++) { const yy = tb - th * (k / 4) * 0.9, ww = th * 0.3 * (1 - k / 5); g.beginPath(); g.moveTo(tx, yy - th * 0.36); g.lineTo(tx - ww, yy); g.lineTo(tx + ww, yy); g.closePath(); g.fill(); }
  return c;
}
function buildFrame(w, h, p) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), G = windowGeom(w, h), r = seeded(71);
  // wall around the window (outside view: dark siding)
  g.fillStyle = "#1a1d26"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += h / 18) { g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(0, y, w, 1.5); }
  g.clearRect(G.fx, G.fy, G.fw, G.fh);
  // frost in the corner of every pane (drawn on the glass only)
  const pw = G.fw / 2, ph = G.fh / 2;
  g.save(); g.beginPath(); g.rect(G.fx, G.fy, G.fw, G.fh); g.clip();
  for (const [x, y, dx, dy] of [[G.fx, G.fy, 1, 1], [G.fx + G.fw, G.fy, -1, 1], [G.fx, G.fy + G.fh, 1, -1], [G.fx + G.fw, G.fy + G.fh, -1, -1]]) frostCorner(g, x, y, pw * 0.6, dx, dy, r, p.frost);
  const band = g.createLinearGradient(0, G.fy + G.fh, 0, G.fy + G.fh * 0.8);
  band.addColorStop(0, `rgba(235,245,255,${0.4 * p.frost})`); band.addColorStop(1, "rgba(235,245,255,0)");
  g.fillStyle = band; g.fillRect(G.fx, G.fy + G.fh * 0.8, G.fw, G.fh * 0.2);
  g.restore();
  // curtains with folds and tie-backs
  for (const side of [0, 1]) {
    const cw = G.fw * 0.2, x0 = side ? G.fx + G.fw - cw : G.fx;
    g.save(); g.beginPath();
    if (!side) { g.moveTo(x0, G.fy); g.lineTo(x0 + cw, G.fy); g.quadraticCurveTo(x0 + cw * 0.35, G.fy + G.fh * 0.5, x0 + cw * 0.55, G.fy + G.fh); g.lineTo(x0, G.fy + G.fh); }
    else { g.moveTo(x0 + cw, G.fy); g.lineTo(x0, G.fy); g.quadraticCurveTo(x0 + cw * 0.65, G.fy + G.fh * 0.5, x0 + cw * 0.45, G.fy + G.fh); g.lineTo(x0 + cw, G.fy + G.fh); }
    g.closePath(); g.clip();
    for (let k = 0; k < 9; k++) {
      const gx = x0 + (cw / 9) * k, fg = g.createLinearGradient(gx, 0, gx + cw / 9, 0);
      fg.addColorStop(0, shade(p.curtains, 0.55)); fg.addColorStop(0.5, p.curtains); fg.addColorStop(1, shade(p.curtains, 0.6));
      g.fillStyle = fg; g.fillRect(gx, G.fy, cw / 9 + 1, G.fh);
    }
    g.restore();
    g.fillStyle = "#c9a227"; g.fillRect(side ? G.fx + G.fw - cw * 0.55 : G.fx, G.fy + G.fh * 0.55, cw * 0.55, G.fh * 0.025);
  }
  // painted frame and muntins
  g.fillStyle = "#e9e2d4";
  g.fillRect(G.fx - G.bar, G.fy - G.bar, G.fw + G.bar * 2, G.bar); g.fillRect(G.fx - G.bar, G.fy + G.fh, G.fw + G.bar * 2, G.bar * 0.8);
  g.fillRect(G.fx - G.bar, G.fy, G.bar, G.fh); g.fillRect(G.fx + G.fw, G.fy, G.bar, G.fh);
  g.fillRect(G.fx + G.fw / 2 - G.bar * 0.3, G.fy, G.bar * 0.6, G.fh); g.fillRect(G.fx, G.fy + G.fh / 2 - G.bar * 0.3, G.fw, G.bar * 0.6);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(G.fx - G.bar, G.fy - G.bar + G.bar * 0.8, G.fw + G.bar * 2, G.bar * 0.2);
  // sill with a snow drift and little icicles
  const sy = G.fy + G.fh + G.bar * 0.8;
  g.fillStyle = "#cfc6b4"; g.fillRect(G.fx - G.bar * 2, sy, G.fw + G.bar * 4, G.bar * 0.9);
  g.fillStyle = "#f4f8ff"; g.beginPath(); g.moveTo(G.fx - G.bar * 2, sy + 1);
  for (let k = 0; k <= 12; k++) { const u = k / 12; g.lineTo(G.fx - G.bar * 2 + (G.fw + G.bar * 4) * u, sy - G.bar * (0.6 + 0.6 * Math.sin(u * Math.PI) + 0.25 * Math.sin(u * 17))); }
  g.lineTo(G.fx + G.fw + G.bar * 2, sy + 1); g.closePath(); g.fill();
  g.fillStyle = "rgba(220,238,255,0.85)";
  for (let k = 0; k < 14; k++) { const ix = G.fx - G.bar * 1.5 + (G.fw + G.bar * 3) * r(), il = G.bar * (0.5 + r() * 1.4); g.beginPath(); g.moveTo(ix - G.bar * 0.12, sy + G.bar * 0.9); g.lineTo(ix + G.bar * 0.12, sy + G.bar * 0.9); g.lineTo(ix, sy + G.bar * 0.9 + il); g.closePath(); g.fill(); }
  return c;
}
function drawSantaSilhouette(ctx, H, t, moving, waving, sack) {
  const walk = moving ? t * 8 : 0;
  ctx.lineCap = "round";
  ctx.lineWidth = H * 0.1;
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * H * 0.06, -H * 0.3); ctx.lineTo(k * H * 0.06 + Math.sin(walk + (k > 0 ? Math.PI : 0)) * H * 0.1 * (moving ? 1 : 0.2), 0); ctx.stroke(); }
  if (sack) { ctx.beginPath(); ctx.arc(-H * 0.22, -H * 0.6, H * 0.17, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-H * 0.12, -H * 0.74); ctx.lineTo(-H * 0.05, -H * 0.82); ctx.lineWidth = H * 0.03; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(0, -H * 0.47, H * 0.22, H * 0.25, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(H * 0.02, -H * 0.78, H * 0.085, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(H * 0.06, -H * 0.71, H * 0.09, H * 0.1, 0.3, 0, TAU); ctx.fill();
  const flop = Math.sin(t * 3) * H * 0.01;
  ctx.beginPath(); ctx.moveTo(-H * 0.07, -H * 0.84); ctx.lineTo(H * 0.1, -H * 0.85); ctx.quadraticCurveTo(-H * 0.02, -H * 1.02, -H * 0.17, -H * 0.93 + flop); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(-H * 0.18, -H * 0.92 + flop, H * 0.035, 0, TAU); ctx.fill();
  ctx.lineWidth = H * 0.07;
  ctx.beginPath(); ctx.moveTo(-H * 0.12, -H * 0.62); ctx.lineTo(-H * 0.16, -H * 0.38); ctx.stroke();
  const a = waving ? -2.2 + Math.sin(t * 9) * 0.45 : -1.25 + (moving ? Math.sin(walk) * 0.2 : 0);
  ctx.beginPath(); ctx.moveTo(H * 0.13, -H * 0.62); ctx.lineTo(H * 0.13 + Math.cos(a + Math.PI / 2) * H * 0.26, -H * 0.62 + Math.sin(a + Math.PI / 2) * H * 0.26); ctx.stroke();
}
CHRISTMAS.santawindow = {
  label: "Santa at the window",
  params: {
    interval: { type: "range", min: 4, max: 40, step: 1, default: 9, label: "Seconds between visits" },
    glow: { type: "color", default: "#ffc982", label: "Room glow" },
    curtains: { type: "color", default: "#8e1b2a", label: "Curtains" },
    frost: { type: "range", min: 0, max: 1, step: 0.05, default: 0.6, label: "Frost" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    const key = `${w}x${h}:${p.glow}:${p.curtains}:${p.frost}`;
    if (s.key !== key) { s.key = key; s.room = buildRoom(w, h, p); s.frame = buildFrame(w, h, p); s.tl = null; }
    const G = windowGeom(w, h);
    ctx.drawImage(s.room, 0, 0);
    const fl = 0.08 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.1);
    ctx.fillStyle = fl > 0 ? `rgba(255,190,110,${fl})` : `rgba(0,0,0,${-fl})`; ctx.fillRect(0, 0, w, h);
    // twinkling lights on the tree in the room
    const tx = G.fx + G.fw * 0.78, tb = h * 0.95, th = h * 0.62;
    if (!s.tl) { const r = seeded(73); s.tl = Array.from({ length: 22 }, () => { const v = r(), y = tb - th * v * 0.85; return { x: tx + (r() - 0.5) * th * 0.5 * (1 - v), y, ph: r() * TAU, c: (r() * 4) | 0 }; }); }
    ctx.globalCompositeOperation = "lighter";
    for (const l of s.tl) { ctx.globalAlpha = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.3 + l.ph)); ctx.drawImage(glowSprite(["#ff3b30", "#ffd60a", "#30d158", "#4da3ff"][l.c], 32), l.x - h * 0.015, l.y - h * 0.015, h * 0.03, h * 0.03); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // Santa's visit: walk in, stop, turn and wave, walk on
    if (s.next === undefined) s.next = t + 1.5;
    if (!s.santa && t > s.next) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      s.santa = { x: dir > 0 ? -0.25 : 1.25, dir, stopAt: 0.35 + Math.random() * 0.3, stopped: 0 };
      s.next = t + p.interval + Math.random() * p.interval * 0.5;
    }
    if (s.santa) {
      const S = s.santa, near = Math.abs(S.x - S.stopAt) < 0.01 && S.stopped < 3;
      if (near) S.stopped += dt; else S.x += S.dir * 0.17 * dt;
      if (S.x < -0.3 || S.x > 1.3) s.santa = null;
      else {
        ctx.save(); ctx.translate(S.x * w, h * 0.99); ctx.scale(S.dir, 1);
        ctx.fillStyle = "#170905"; ctx.strokeStyle = "#170905";
        drawSantaSilhouette(ctx, h * 0.62, t, !near, near && S.stopped > 0.4, true);
        ctx.restore();
      }
    }
    ctx.drawImage(s.frame, 0, 0);
  },
};

// ---------------------------------------------------------------- snow globe
function globeGeom(w, h) { const R = Math.min(w * 0.4, h * 0.36), cx = w / 2, cy = h * 0.42; return { R, cx, cy, ground: cy + R * 0.42 }; }
function miniTree(g, x, base, th, lights) {
  g.fillStyle = "#4a2f1a"; g.fillRect(x - th * 0.04, base - th * 0.08, th * 0.08, th * 0.1);
  for (let k = 0; k < 4; k++) {
    const yy = base - th * 0.06 - th * (k / 4) * 0.82, ww = th * 0.32 * (1 - k / 5);
    const gr = g.createLinearGradient(x - ww, 0, x + ww, 0); gr.addColorStop(0, "#14512a"); gr.addColorStop(0.5, "#1f7a3a"); gr.addColorStop(1, "#0f3d20");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, yy - th * 0.36); g.lineTo(x - ww, yy); g.lineTo(x + ww, yy); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.85)"; g.beginPath(); g.moveTo(x, yy - th * 0.36); g.lineTo(x - ww * 0.45, yy - th * 0.18); g.lineTo(x + ww * 0.35, yy - th * 0.2); g.closePath(); g.fill();
    for (let i = 0; i < 4; i++) lights.push({ x: x + (i / 3 - 0.5) * ww * 1.4, y: yy - th * 0.05 - (i % 2) * th * 0.04, c: (k + i) % 4 });
  }
  lights.push({ x, y: base - th * 0.98, c: 4, star: true });
}
function buildGlobe(w, h, p) {
  const G = globeGeom(w, h), { R, cx, cy } = G, lights = [];
  const inner = document.createElement("canvas"); inner.width = w; inner.height = h;
  const g = inner.getContext("2d");
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  const sky = g.createLinearGradient(0, cy - R, 0, cy + R); sky.addColorStop(0, "#0b1a3d"); sky.addColorStop(1, "#3f5f96");
  g.fillStyle = sky; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  const gr = g.createRadialGradient(cx, G.ground + R * 0.3, R * 0.1, cx, G.ground + R * 0.3, R);
  gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#b9c8e2");
  g.fillStyle = gr; g.beginPath(); g.ellipse(cx, G.ground + R * 0.45, R * 1.05, R * 0.5, 0, 0, TAU); g.fill();
  if (p.scene === "village") {
    for (const [dx, sc, col] of [[-0.42, 0.34, "#a24b35"], [0.12, 0.42, "#6f7f94"]]) {
      const x = cx + dx * R, base = G.ground + R * 0.04, s = R * sc;
      g.fillStyle = col; g.fillRect(x, base - s * 0.6, s, s * 0.6);
      g.fillStyle = "#3a2e2e"; g.beginPath(); g.moveTo(x - s * 0.08, base - s * 0.58); g.lineTo(x + s * 0.5, base - s * 1.05); g.lineTo(x + s * 1.08, base - s * 0.58); g.closePath(); g.fill();
      g.fillStyle = "#f4f8ff"; g.beginPath(); g.moveTo(x - s * 0.1, base - s * 0.6); g.lineTo(x + s * 0.5, base - s * 1.1); g.lineTo(x + s * 1.1, base - s * 0.6); g.lineTo(x + s * 0.9, base - s * 0.66); g.lineTo(x + s * 0.5, base - s * 0.98); g.lineTo(x + s * 0.1, base - s * 0.66); g.closePath(); g.fill();
      for (const wx of [0.18, 0.62]) { g.fillStyle = "#1a1420"; g.fillRect(x + s * wx, base - s * 0.42, s * 0.2, s * 0.18); lights.push({ x: x + s * (wx + 0.1), y: base - s * 0.33, c: 5, win: s * 0.1 }); }
    }
    miniTree(g, cx + R * 0.68, G.ground + R * 0.08, R * 0.5, lights);
  } else if (p.scene === "snowman") {
    const x = cx - R * 0.05, base = G.ground + R * 0.1;
    for (const [dy, rr] of [[0, 0.2], [-0.3, 0.15], [-0.53, 0.11]]) { const sg = g.createRadialGradient(x - R * rr * 0.3, base + dy * R - R * rr * 0.3, 0, x, base + dy * R, R * rr); sg.addColorStop(0, "#fff"); sg.addColorStop(1, "#b8c7df"); g.fillStyle = sg; g.beginPath(); g.arc(x, base + dy * R - R * 0.1, R * rr, 0, TAU); g.fill(); }
    g.fillStyle = "#c8102e"; g.fillRect(x - R * 0.12, base - R * 0.55, R * 0.24, R * 0.04);
    g.fillStyle = "#111"; g.fillRect(x - R * 0.09, base - R * 0.86, R * 0.18, R * 0.14); g.fillRect(x - R * 0.13, base - R * 0.73, R * 0.26, R * 0.025);
    g.fillStyle = "#ff8a1f"; g.beginPath(); g.moveTo(x, base - R * 0.64); g.lineTo(x + R * 0.12, base - R * 0.62); g.lineTo(x, base - R * 0.6); g.fill();
    miniTree(g, cx + R * 0.55, G.ground + R * 0.08, R * 0.55, lights);
    miniTree(g, cx - R * 0.6, G.ground + R * 0.12, R * 0.38, lights);
  } else {
    miniTree(g, cx, G.ground + R * 0.12, R * 0.95, lights);
    for (const [dx, col, rib] of [[-0.42, "#b3122e", "#f1f1f1"], [0.3, "#2c5aa0", "#e9c46a"], [0.45, "#1f6e3a", "#e9c46a"]]) {
      const x = cx + dx * R, s = R * 0.13, base = G.ground + R * 0.12;
      g.fillStyle = col; g.fillRect(x, base - s, s, s); g.fillStyle = rib; g.fillRect(x + s * 0.42, base - s, s * 0.16, s); g.fillRect(x, base - s * 0.58, s, s * 0.16);
    }
  }
  g.restore();
  // glass, rim and base
  const over = document.createElement("canvas"); over.width = w; over.height = h;
  const o = over.getContext("2d");
  const shadeIn = o.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
  shadeIn.addColorStop(0, "rgba(0,0,0,0)"); shadeIn.addColorStop(1, "rgba(0,10,30,0.45)");
  o.fillStyle = shadeIn; o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.fill();
  const hl = o.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 0.7);
  hl.addColorStop(0, "rgba(255,255,255,0.45)"); hl.addColorStop(0.35, "rgba(255,255,255,0.12)"); hl.addColorStop(1, "rgba(255,255,255,0)");
  o.save(); o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.clip(); o.fillStyle = hl; o.fillRect(cx - R, cy - R, R * 2, R * 2); o.restore();
  o.strokeStyle = "rgba(255,255,255,0.55)"; o.lineWidth = Math.max(2, R * 0.03); o.lineCap = "round";
  o.beginPath(); o.arc(cx, cy, R * 0.9, Math.PI * 1.12, Math.PI * 1.42); o.stroke();
  o.lineWidth = Math.max(1, R * 0.012); o.beginPath(); o.arc(cx, cy, R * 0.88, Math.PI * 0.05, Math.PI * 0.25); o.stroke();
  o.strokeStyle = "rgba(200,225,255,0.35)"; o.lineWidth = Math.max(1, R * 0.015); o.beginPath(); o.arc(cx, cy, R, 0, TAU); o.stroke();
  const by = cy + R * 0.8, bh = R * 0.55, tw = R * 1.25, bw = R * 1.6;
  const bg2 = o.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  bg2.addColorStop(0, shade(p.base, 0.45)); bg2.addColorStop(0.35, shade(p.base, 1.25)); bg2.addColorStop(1, shade(p.base, 0.4));
  o.fillStyle = bg2; o.beginPath(); o.moveTo(cx - tw / 2, by); o.lineTo(cx + tw / 2, by); o.lineTo(cx + bw / 2, by + bh); o.lineTo(cx - bw / 2, by + bh); o.closePath(); o.fill();
  o.fillStyle = shade(p.base, 0.35); o.beginPath(); o.ellipse(cx, by + bh, bw / 2, bh * 0.12, 0, 0, Math.PI); o.fill();
  const gold = o.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); gold.addColorStop(0, "#7a5a16"); gold.addColorStop(0.4, "#f2d27a"); gold.addColorStop(1, "#6b4e12");
  o.fillStyle = gold; o.beginPath(); o.ellipse(cx, by, tw / 2, bh * 0.14, 0, 0, TAU); o.fill();
  o.fillRect(cx - R * 0.32, by + bh * 0.35, R * 0.64, bh * 0.34);
  o.fillStyle = "#3a2a08"; o.font = `700 ${Math.round(bh * 0.22)}px Georgia, serif`; o.textAlign = "center"; o.textBaseline = "middle";
  o.fillText("JOY", cx, by + bh * 0.53);
  return { inner, over, lights, G };
}
CHRISTMAS.snowglobe = {
  label: "Snow globe",
  params: {
    scene: { type: "select", options: ["tree", "village", "snowman"], default: "tree", label: "Inside" },
    shake: { type: "range", min: 3, max: 30, step: 1, default: 9, label: "Seconds between shakes" },
    density: { type: "range", min: 0.3, max: 2, step: 0.1, default: 1, label: "Snow" },
    base: { type: "color", default: "#6b2e1f", label: "Base" },
    bg: BG,
  },
  draw(ctx, w, h, t, dt, p, s) {
    const key = `${w}x${h}:${p.scene}:${p.base}`;
    if (s.key !== key) { s.key = key; s.gl = buildGlobe(w, h, p); }
    const { G, inner, over, lights } = s.gl, { R, cx, cy } = G, groundL = (G.ground - cy) / R;
    background(ctx, w, h, p.bg);
    ctx.drawImage(inner, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const cols = ["#ff3b30", "#ffd60a", "#30d158", "#4da3ff", "#ffd34d", "#ffcf7a"];
    for (const l of lights) {
      const b = l.star ? 0.8 + 0.2 * Math.sin(t * 3) : l.win ? 0.85 : 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.4 + l.x * 0.05 + l.y * 0.03));
      const sz = l.star ? R * 0.16 : l.win ? l.win * 2.2 : R * 0.06;
      ctx.globalAlpha = b; ctx.drawImage(glowSprite(cols[l.c], 32), l.x - sz / 2, l.y - sz / 2, sz, sz);
      if (l.win) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = cols[5]; ctx.fillRect(l.x - l.win, l.y - l.win * 0.9, l.win * 2, l.win * 1.8); ctx.globalCompositeOperation = "lighter"; }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // the snow: shaken up, swirling, then settling on the ground
    const want = Math.round(170 * p.density);
    if (!s.fl || s.fl.length !== want) { s.fl = Array.from({ length: want }, () => ({ x: rnd(0.9, -0.9), y: rnd(groundL, -0.9), vx: 0, vy: 0, z: Math.random(), rest: false })); s.nextShake = t; }
    if (t >= s.nextShake) {
      s.nextShake = t + p.shake;
      for (const f of s.fl) { f.rest = false; f.vx = rnd(1.6, -1.6); f.vy = rnd(-0.4, -2.6); }
    }
    const spr = glowSprite("#ffffff", 32);
    for (const f of s.fl) {
      if (!f.rest) {
        f.vx *= 1 - Math.min(1, 1.6 * dt); f.vy *= 1 - Math.min(1, 1.6 * dt);
        f.vy += 0.35 * dt; f.vx += Math.sin(t * 1.3 + f.z * 9) * 0.05 * dt;
        f.x += f.vx * dt; f.y += (f.vy + 0.05 + f.z * 0.05) * dt;
        const d = Math.hypot(f.x, f.y);
        if (d > 0.94) { f.x *= 0.94 / d; f.y *= 0.94 / d; f.vx *= -0.4; f.vy *= -0.4; }
        // settle on the curved snow mound (an ellipse centred 0.45R below the ground line)
        const floor = groundL + 0.45 - 0.5 * Math.sqrt(Math.max(0, 1 - (f.x / 1.05) ** 2)) + 0.01;
        if (f.y > floor && f.vy >= 0) { f.y = floor; f.rest = true; }
      }
      const r0 = R * (0.008 + f.z * 0.012) * (f.rest ? 0.8 : 1);
      ctx.globalAlpha = f.rest ? 0.5 : 0.55 + f.z * 0.45;
      ctx.drawImage(spr, cx + f.x * R - r0 * 2, cy + f.y * R - r0 * 2, r0 * 4, r0 * 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.drawImage(over, 0, 0);
  },
};
