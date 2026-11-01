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
function drawSleigh(ctx, t) {
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
