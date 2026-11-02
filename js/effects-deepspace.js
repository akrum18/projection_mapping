// Space pack, part 2: the night sky and deep space. Same contract as effects.js:
// draw(ctx, w, h, t, dt, p, s, info).
import { TAU, rnd, clamp, seeded, rgba, hexToRgb } from "./fx-util.js";
import { starfield, starColor, glow, drawSpikes, smooth, noise3, fbm3, ridged3 } from "./space-gfx.js";
import { SKY, spaceBg } from "./effects-space.js";

export const DEEPSPACE = {};
const RAD = Math.PI / 180;
const big = (w, h) => w * h > 40000;

// Small ImageData canvas helper for per-pixel generated layers.
function pixelCanvas(gw, gh, fn) {
  const c = document.createElement("canvas"); c.width = gw; c.height = gh;
  const g = c.getContext("2d"), img = g.createImageData(gw, gh), d = img.data;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = (j * gw + i) * 4, out = fn(i, j);
    d[k] = out[0]; d[k + 1] = out[1]; d[k + 2] = out[2]; d[k + 3] = out[3] ?? 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ================================================================== Milky Way night sky
// The sky turns slowly about the celestial pole (off the top of the surface), carrying
// the Milky Way with its star clouds, the dark Great Rift and the glowing core. Shooting
// stars, satellites (one flaring), an aircraft, airglow and a black horizon.
// geo: the band's normal (nx, ny), its offset from the pole and where the core sits
// along it, all in texture units (the texture spans 1 × 1, centred on the pole).
function milkyWayCanvas(D, seed, geo) {
  const gs = Math.max(64, Math.round(D / 4)), rng = seeded(seed);
  const { nx, ny, off, core: sCore } = geo;
  const band = pixelCanvas(gs, gs, (i, j) => {
    const x = i / gs - 0.5, y = j / gs - 0.5;
    const v = (x * nx + y * ny - off) / 0.1, sAlong = x * ny - y * nx;
    if (Math.abs(v) > 3) return [0, 0, 0, 0];
    const warp = fbm3(sAlong * 6, v * 0.6, 0.5, 3, seed + 1) - 0.5;
    const core = Math.exp(-(((sAlong - sCore) / 0.1) ** 2));
    const width = 1 + core * 0.9;
    let I = Math.exp(-(((v + warp * 0.8) / width) ** 2) * 1.6) * (0.3 + 0.75 * fbm3(sAlong * 9, v * 1.5, 0.3, 5, seed + 2));
    // star clouds: knotty brightening
    I *= 0.65 + 0.7 * smooth(0.5, 0.75, fbm3(sAlong * 22, v * 3, 0.7, 4, seed + 3));
    // the Great Rift down the middle, and patchy dark nebulae
    const rift = smooth(0.35, 0.75, fbm3(sAlong * 5, v * 0.8, 0.1, 4, seed + 4)) * Math.exp(-((v * 1.1 + 0.25 - warp * 1.5) ** 2) * 3);
    const dark = smooth(0.58, 0.72, fbm3(sAlong * 12, v * 2.5, 0.9, 4, seed + 5)) * 0.6;
    I *= (1 - rift * 0.9) * (1 - dark * Math.exp(-v * v * 0.5));
    I += core * Math.exp(-v * v * 2) * 0.45 * (1 - rift * 0.8);
    I *= 0.85;
    const warm = clamp(core * 1.4 + 0.15, 0, 1);
    const pink = smooth(0.78, 0.86, fbm3(sAlong * 40, v * 6, 0.2, 2, seed + 6)) * Math.exp(-v * v * 3) * 0.6;
    const r = (200 + 55 * warm) * I + 255 * pink * I, g = (205 + 25 * warm) * I + 90 * pink * I, b = (255 - 70 * warm) * I + 140 * pink * I;
    return [Math.min(255, r), Math.min(255, g), Math.min(255, b), 255 * clamp(I, 0, 1)];
  });
  const c = document.createElement("canvas"); c.width = c.height = D;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.globalAlpha = 0.85; g.drawImage(band, 0, 0, D, D); g.globalAlpha = 1;
  // stars: denser along the band
  const bd = band.getContext("2d").getImageData(0, 0, gs, gs).data;
  const n = Math.round((D * D) / 500), m = Math.max(0.6, D / 1100), brightest = [];
  for (let i = 0; i < n * 2.5; i++) {
    const x = rng() * D, y = rng() * D, k = ((Math.floor((y / D) * gs) * gs + Math.floor((x / D) * gs)) * 4) + 3;
    const dens = bd[k] / 255;
    if (rng() > 0.35 + dens * 1.6) continue;
    const mag = Math.pow(rng(), 8), col = starColor(rng());
    if (mag > 0.35 && brightest.length < 90) { brightest.push({ x, y, mag, col, ph: rng() * TAU }); continue; }
    g.fillStyle = col; g.globalAlpha = 0.3 + 0.7 * Math.min(1, mag * 3 + rng() * 0.25);
    const r = (0.4 + mag * 2.3) * m;
    if (r > 1.6) { g.beginPath(); g.arc(x, y, r / 2, 0, TAU); g.fill(); } else g.fillRect(x - r / 2, y - r / 2, r, r);
  }
  g.globalAlpha = 1;
  return { c, brightest, m };
}
function horizon(ctx, w, h, kind, seed) {
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.moveTo(0, h);
  const step = Math.max(1.5, w / 260);
  for (let x = 0; x <= w + step; x += step) {
    const u = x / w, base = h * (0.9 - 0.045 * noise3(u * 3, 0.5, 0.5, seed) - 0.015 * noise3(u * 12, 0.5, 0.5, seed + 1));
    let y = base;
    if (kind === "trees") {
      // ragged spruce tops: a sharp spike every few pixels of varying height
      const k = Math.floor(x / (w / 70)), r = noise3(k * 1.7, 0.5, 0.5, seed + 2), local = (x % (w / 70)) / (w / 70);
      y = base - h * (0.03 + 0.11 * r * r) * (1 - Math.abs(local - 0.5) * 2) ** 1.4 * (r > 0.25 ? 1 : 0.2);
    }
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h); ctx.fill();
}
DEEPSPACE.milkyway = {
  label: "Milky Way sky",
  params: {
    motion: { type: "select", options: ["drift", "turning", "still"], default: "drift", label: "Sky motion" },
    speed: { type: "range", min: 0, max: 20, step: 0.1, default: 2, label: "Turning speed" },
    band: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "Milky Way" },
    meteors: { type: "range", min: 0, max: 30, step: 1, default: 6, label: "Shooting stars / min" },
    traffic: { type: "select", options: ["satellites & planes", "satellites", "none"], default: "satellites & planes", label: "Traffic" },
    horizon: { type: "select", options: ["trees", "hills", "none"], default: "trees", label: "Horizon" },
    glow: { type: "range", min: 0, max: 1, step: 0.05, default: 0.35, label: "Horizon glow" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    dt = Math.min(dt, 0.05);
    // the pole sits above the surface; the dome texture covers every corner as it turns
    const px = w * 0.5, py = -h * 0.7, Rt = Math.hypot(w / 2, h - py) + 4;
    const D = Math.min(2400, Math.ceil(Rt * 2));
    if (!s.mw || s.mwD !== D) {
      // lay the band diagonally through the middle of the surface, the core left of centre
      const al = 26 * RAD, nx = -Math.sin(al), ny = Math.cos(al), vx = w / 2 - px, vy = h / 2 - py;
      s.mwD = D; s.mw = milkyWayCanvas(D, 17, { nx, ny, off: (vx * nx + vy * ny) / (2 * Rt), core: (vx * ny - vy * nx) / (2 * Rt) - 0.09 });
    }
    if (s.t0 === undefined) s.t0 = t;
    // sky: deep blue at the zenith, airglow and light dome near the horizon
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#00010a"); g.addColorStop(0.65, "#020617"); g.addColorStop(0.88, `rgb(${12 + 40 * p.glow | 0},${16 + 30 * p.glow | 0},${30 + 20 * p.glow | 0})`); g.addColorStop(1, `rgb(${20 + 70 * p.glow | 0},${22 + 45 * p.glow | 0},${30 + 20 * p.glow | 0})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // turning: about the pole like a time-lapse; drift: a slow sway that keeps the composition
    const ang = p.motion === "turning" ? (t - s.t0) * p.speed * 0.0042 : p.motion === "drift" ? 0.035 * Math.sin((t - s.t0) * 0.012) : 0;
    const sc = Rt * 2 / D;
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.globalAlpha = Math.min(1, 0.3 + p.band * 0.55);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(s.mw.c, -Rt, -Rt, Rt * 2, Rt * 2);
    if (p.band > 1) { ctx.globalAlpha = p.band - 1; ctx.drawImage(s.mw.c, -Rt, -Rt, Rt * 2, Rt * 2); }
    ctx.restore();
    // bright stars twinkle, more strongly near the horizon (thicker air)
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const st of s.mw.brightest) {
      const lx = (st.x - D / 2) * sc, ly = (st.y - D / 2) * sc, x = px + lx * ca - ly * sa, y = py + lx * sa + ly * ca;
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
      const low = clamp(y / h, 0, 1), tw = 1 - (0.15 + 0.55 * low * low) * (0.5 + 0.5 * Math.sin(t * (5 + low * 9) + st.ph)) * (0.5 + 0.5 * Math.sin(t * 13 + st.ph * 3));
      const r = (1 + st.mag * 3) * s.mw.m * sc * 1.4;
      ctx.globalAlpha = tw; ctx.drawImage(glow(st.col), x - r * 2.5, y - r * 2.5, r * 5, r * 5);
      ctx.fillStyle = "#fff"; ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6);
    }
    ctx.restore();
    // shooting stars
    s.met ||= [];
    if (Math.random() < (p.meteors / 60) * dt) {
      const a = rnd(Math.PI * 0.85, Math.PI * 0.15), len = rnd(0.35, 0.12) * Math.max(w, h);
      s.met.push({ x: rnd(w), y: rnd(h * 0.55), dx: Math.cos(a), dy: Math.sin(a) * 0.6 + 0.4, len, age: 0, life: rnd(1, 0.4), col: Math.random() < 0.5 ? "#b8ffd8" : "#fff2c8" });
    }
    drawMeteors(ctx, s.met, dt, w, h);
    // satellites: slow steady points that fade as they enter Earth's shadow; one flares
    if (p.traffic !== "none") {
      s.sat ||= [];
      if (s.sat.length < 3 && Math.random() < dt * 0.06) { const fromLeft = Math.random() < 0.5; s.sat.push({ x: fromLeft ? -5 : w + 5, y: rnd(h * 0.6, h * 0.05), vx: (fromLeft ? 1 : -1) * rnd(0.035, 0.015) * w, vy: rnd(0.01, -0.01) * h, age: 0, flare: Math.random() < 0.25 ? rnd(8, 3) : -1, fade: rnd(25, 10) }); }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = s.sat.length - 1; i >= 0; i--) {
        const q = s.sat[i]; q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.x < -10 || q.x > w + 10) { s.sat.splice(i, 1); continue; }
        let b = 0.55 * smooth(q.fade, q.fade - 3, q.age);
        if (q.flare > 0) b += 2.5 * Math.exp(-(((q.age - q.flare) / 0.8) ** 2));
        const r = Math.max(1, Math.min(w, h) / 300) * (1 + b);
        ctx.globalAlpha = Math.min(1, b); ctx.drawImage(glow("#f4f6ff"), q.x - r * 2, q.y - r * 2, r * 4, r * 4);
      }
      // an aircraft: red and green navigation lights and a double white strobe
      if (p.traffic === "satellites & planes") {
        if (!s.plane && Math.random() < dt * 0.02) { const l = Math.random() < 0.5; s.plane = { x: l ? -10 : w + 10, y: rnd(h * 0.75, h * 0.35), vx: (l ? 1 : -1) * w * 0.02, age: 0 }; }
        const q = s.plane;
        if (q) {
          q.age += dt; q.x += q.vx * dt;
          if (q.x < -20 || q.x > w + 20) s.plane = null;
          else {
            const u = Math.max(1, Math.min(w, h) / 260), ph = q.age % 1.2;
            ctx.globalAlpha = 0.9; ctx.drawImage(glow("#ff3020"), q.x - u * 3 - u * 2, q.y - u * 2, u * 4, u * 4); ctx.drawImage(glow("#30ff60"), q.x + u * 3 - u * 2, q.y - u * 2, u * 4, u * 4);
            if (ph < 0.06 || (ph > 0.14 && ph < 0.2)) { ctx.globalAlpha = 1; ctx.drawImage(glow("#ffffff"), q.x - u * 4, q.y - u * 4, u * 8, u * 8); }
            if (Math.sin(q.age * 6) > 0.6) { ctx.globalAlpha = 0.9; ctx.drawImage(glow("#ff2020"), q.x - u * 2, q.y + u - u * 2, u * 4, u * 4); }
          }
        }
      }
      ctx.restore();
    }
    if (p.horizon !== "none") horizon(ctx, w, h, p.horizon, 5);
    ctx.globalAlpha = 1;
  },
};
// Meteors: a bright head, a tapering trail, and sometimes a glowing train that lingers
// and twists in the upper-atmosphere winds.
function drawMeteors(ctx, list, dt, w, h, opts = {}) {
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
  const u = Math.max(0.8, Math.min(w, h) / 400);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]; m.age += dt;
    if (m.train) {
      const k = 1 - m.age / m.life; if (k <= 0) { list.splice(i, 1); continue; }
      ctx.strokeStyle = m.col; ctx.globalAlpha = k * 0.22; ctx.lineWidth = u * (1.5 + m.age * 1.4);
      ctx.beginPath();
      for (let j = 0; j <= 12; j++) { const f = j / 12, wob = Math.sin(f * 7 + m.age * 0.9 + m.ph) * u * m.age * 2.5; const x = m.x0 + (m.x1 - m.x0) * f - m.dy * wob, y = m.y0 + (m.y1 - m.y0) * f + m.dx * wob; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); continue;
    }
    const e = m.age / m.life;
    if (e > 1) {
      if (Math.random() < (m.fire ? 1 : 0.25)) list.push({ train: true, x0: m.x + m.dx * m.len * 0.25, y0: m.y + m.dy * m.len * 0.25, x1: m.x + m.dx * m.len, y1: m.y + m.dy * m.len, dx: m.dx, dy: m.dy, age: 0, life: m.fire ? rnd(7, 4) : rnd(2.5, 1), col: m.fire ? "#9fffc8" : "#c8d8ff", ph: rnd(TAU) });
      list.splice(i, 1); continue;
    }
    const head = Math.min(1, e * 1.15), tail = Math.max(0, e - 0.35);
    const hx = m.x + m.dx * m.len * head, hy = m.y + m.dy * m.len * head, tx = m.x + m.dx * m.len * tail, ty = m.y + m.dy * m.len * tail;
    const bright = Math.sin(e * Math.PI) ** 0.6 * (m.fire ? 1 : 0.85);
    const gr = ctx.createLinearGradient(tx, ty, hx, hy);
    gr.addColorStop(0, "rgba(255,200,120,0)"); gr.addColorStop(0.7, rgba("#ffcf90", 0.4 * bright)); gr.addColorStop(1, rgba(m.col, bright));
    ctx.strokeStyle = gr; ctx.lineWidth = u * (m.fire ? 4.5 : 2.2); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    const r = u * (m.fire ? 10 : 4.5) * (0.7 + 0.3 * Math.random());
    ctx.globalAlpha = bright; ctx.drawImage(glow(m.col), hx - r, hy - r, r * 2, r * 2);
    if (m.fire) {
      // fragments break off and the whole sky flashes
      if (e > 0.6) for (let f = 0; f < m.frags; f++) { const fd = (e - 0.6) * m.len * 0.25 * (f + 1) / m.frags, fx = hx - m.dy * fd * 0.4 * (f % 2 ? 1 : -1) - m.dx * fd, fy = hy + m.dx * fd * 0.4 * (f % 2 ? 1 : -1) - m.dy * fd; ctx.globalAlpha = bright * 0.7; ctx.drawImage(glow("#ffe0a0"), fx - r * 0.4, fy - r * 0.4, r * 0.8, r * 0.8); }
      if (!opts.noFlash) { ctx.globalAlpha = bright * 0.12; ctx.fillStyle = "#cfe0ff"; ctx.fillRect(0, 0, w, h); }
    }
  }
  ctx.restore();
}

// ================================================================== meteor shower
DEEPSPACE.meteors = {
  label: "Meteor shower",
  params: {
    rate: { type: "range", min: 5, max: 600, step: 5, default: 60, label: "Meteors / min" },
    mode: { type: "select", options: ["shower", "storm"], default: "shower", label: "Intensity" },
    x: { type: "range", min: 0, max: 1, step: 0.01, default: 0.7, label: "Radiant across" },
    y: { type: "range", min: -0.5, max: 1, step: 0.01, default: 0.1, label: "Radiant down" },
    fireballs: { type: "select", options: ["fireballs", "no fireballs"], default: "fireballs", label: "Fireballs" },
    color: { type: "select", options: ["mixed", "green", "gold", "white"], default: "mixed", label: "Colours" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    dt = Math.min(dt, 0.05);
    spaceBg(ctx, w, h, t, s, p.sky, { density: 0.8, seed: 131 });
    s.met ||= [];
    const rate = ((p.mode === "storm" ? Math.max(p.rate, 600) * 2 : p.rate) / 60) * (info ? 1 : 8); // busier in tile previews
    const rx = p.x * w, ry = p.y * h, cols = { mixed: ["#b8ffd8", "#fff2c8", "#d8e4ff", "#ffd2a0"], green: ["#a8ffcc"], gold: ["#ffd890"], white: ["#f4f6ff"] }[p.color] || ["#ffffff"];
    let n = rate * dt; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (let i = 0; i < n && s.met.length < 260; i++) {
      // meteors fly away from the radiant; near it they look short (coming at you)
      const x = rnd(w * 1.1, -w * 0.05), y = rnd(h * 0.95, -h * 0.05), dx = x - rx, dy = y - ry, l = Math.hypot(dx, dy) || 1;
      const fire = p.fireballs === "fireballs" && Math.random() < (p.mode === "storm" ? 0.01 : 0.04);
      const len = Math.min(l * 0.8, Math.max(w, h) * rnd(0.3, 0.08)) * (fire ? 2 : 1);
      s.met.push({ x, y, dx: dx / l, dy: dy / l, len, age: 0, life: fire ? rnd(2.6, 1.6) : rnd(0.9, 0.3), col: cols[(Math.random() * cols.length) | 0], fire, frags: 3 + (Math.random() * 4 | 0) });
    }
    drawMeteors(ctx, s.met, dt, w, h, { noFlash: p.mode === "storm" });
  },
};

// ================================================================== constellations
// Real star positions (right ascension in hours, declination in degrees, magnitude,
// colour class), projected stereographically about the middle of each sky.
const CON = {
  Orion: { s: { Betelgeuse: [5.92, 7.41, 0.5, "r"], Rigel: [5.24, -8.2, 0.13, "b"], Bellatrix: [5.42, 6.35, 1.64, "b"], Mintaka: [5.53, -0.3, 2.23, "b"], Alnilam: [5.6, -1.2, 1.69, "b"], Alnitak: [5.68, -1.94, 1.77, "b"], Saiph: [5.8, -9.67, 2.09, "b"], Meissa: [5.59, 9.93, 3.39, "b"], pi3: [4.83, 6.96, 3.19, "w"], pi4: [4.85, 5.6, 3.69, "b"], pi2: [4.84, 8.9, 4.35, "w"], pi5: [4.9, 2.44, 3.72, "b"], mu: [6.08, 9.65, 4.12, "w"], xi: [6.2, 14.21, 4.48, "b"], nu: [6.13, 14.77, 4.42, "b"], chi1: [5.91, 20.28, 4.41, "y"] },
    l: [["Meissa", "Betelgeuse"], ["Meissa", "Bellatrix"], ["Betelgeuse", "Alnitak"], ["Bellatrix", "Mintaka"], ["Mintaka", "Alnilam"], ["Alnilam", "Alnitak"], ["Alnitak", "Saiph"], ["Mintaka", "Rigel"], ["Bellatrix", "pi3"], ["pi2", "pi3"], ["pi3", "pi4"], ["pi4", "pi5"], ["Betelgeuse", "mu"], ["mu", "xi"], ["xi", "nu"], ["xi", "chi1"]] },
  Taurus: { s: { Aldebaran: [4.6, 16.51, 0.85, "o"], Elnath: [5.44, 28.61, 1.65, "b"], "ζ Tau": [5.63, 21.14, 3.0, "b"], "γ Tau": [4.33, 15.63, 3.65, "y"], "δ Tau": [4.38, 17.54, 3.76, "y"], "ε Tau": [4.48, 19.18, 3.53, "y"], "λ Tau": [4.01, 12.49, 3.4, "b"], Alcyone: [3.79, 24.1, 2.87, "b"], Atlas: [3.82, 24.05, 3.62, "b"], Electra: [3.75, 24.11, 3.7, "b"], Maia: [3.76, 24.37, 3.87, "b"], Merope: [3.77, 23.95, 4.18, "b"], Taygeta: [3.75, 24.47, 4.3, "b"] },
    // the V of the Hyades opens from γ toward Aldebaran and ε; the horns end at Elnath and ζ
    l: [["ζ Tau", "Aldebaran"], ["Aldebaran", "γ Tau"], ["γ Tau", "δ Tau"], ["δ Tau", "ε Tau"], ["ε Tau", "Elnath"], ["γ Tau", "λ Tau"]], cluster: "Pleiades" },
  Gemini: { s: { Castor: [7.58, 31.89, 1.58, "w"], Pollux: [7.76, 28.03, 1.14, "o"], Alhena: [6.63, 16.4, 1.9, "w"], Mebsuta: [6.73, 25.13, 3.0, "y"], Tejat: [6.38, 22.51, 2.87, "r"], Propus: [6.25, 22.51, 3.3, "r"], Wasat: [7.34, 21.98, 3.53, "w"], Mekbuda: [7.07, 20.57, 3.9, "y"], "ξ Gem": [6.75, 12.9, 3.35, "w"] },
    l: [["Castor", "Pollux"], ["Castor", "Mebsuta"], ["Mebsuta", "Tejat"], ["Tejat", "Propus"], ["Pollux", "Wasat"], ["Wasat", "Mekbuda"], ["Mekbuda", "Alhena"], ["Wasat", "ξ Gem"]] },
  "Canis Major": { s: { Sirius: [6.75, -16.72, -1.46, "w"], Mirzam: [6.38, -17.96, 1.98, "b"], Adhara: [6.98, -28.97, 1.5, "b"], Wezen: [7.14, -26.39, 1.83, "y"], Aludra: [7.4, -29.3, 2.45, "b"], Furud: [6.34, -30.06, 3.0, "b"], Muliphein: [7.06, -15.63, 4.1, "b"] },
    l: [["Mirzam", "Sirius"], ["Sirius", "Muliphein"], ["Sirius", "Wezen"], ["Wezen", "Aludra"], ["Wezen", "Adhara"], ["Adhara", "Furud"]] },
  "Canis Minor": { s: { Procyon: [7.66, 5.22, 0.34, "w"], Gomeisa: [7.45, 8.29, 2.9, "b"] }, l: [["Procyon", "Gomeisa"]] },
  Auriga: { s: { Capella: [5.28, 46.0, 0.08, "y"], Menkalinan: [6.0, 44.95, 1.9, "w"], "θ Aur": [6.0, 37.21, 2.62, "w"], "ι Aur": [4.95, 33.17, 2.69, "o"], "ε Aur": [5.03, 43.82, 2.99, "w"], Elnath: [5.44, 28.61, 1.65, "b"] }, l: [["Capella", "Menkalinan"], ["Menkalinan", "θ Aur"], ["θ Aur", "Elnath"], ["Elnath", "ι Aur"], ["ι Aur", "ε Aur"], ["ε Aur", "Capella"]] },
  "Ursa Major": { s: { Dubhe: [11.06, 61.75, 1.79, "o"], Merak: [11.03, 56.38, 2.37, "w"], Phecda: [11.9, 53.69, 2.44, "w"], Megrez: [12.26, 57.03, 3.31, "w"], Alioth: [12.9, 55.96, 1.77, "w"], Mizar: [13.4, 54.93, 2.04, "w"], Alkaid: [13.79, 49.31, 1.86, "b"], Alcor: [13.42, 54.99, 4.0, "w"] },
    l: [["Dubhe", "Merak"], ["Merak", "Phecda"], ["Phecda", "Megrez"], ["Megrez", "Dubhe"], ["Megrez", "Alioth"], ["Alioth", "Mizar"], ["Mizar", "Alkaid"]] },
  "Ursa Minor": { s: { Polaris: [2.53, 89.26, 1.98, "y"], Kochab: [14.85, 74.16, 2.08, "o"], Pherkad: [15.35, 71.83, 3.0, "w"], Yildun: [17.54, 86.59, 4.35, "w"], "ε UMi": [16.77, 82.04, 4.2, "y"], "ζ UMi": [15.73, 77.79, 4.3, "w"], "η UMi": [16.29, 75.76, 4.95, "w"] },
    l: [["Polaris", "Yildun"], ["Yildun", "ε UMi"], ["ε UMi", "ζ UMi"], ["ζ UMi", "Kochab"], ["Kochab", "Pherkad"], ["Pherkad", "η UMi"], ["η UMi", "ζ UMi"]] },
  Cassiopeia: { s: { Caph: [0.15, 59.15, 2.27, "w"], Schedar: [0.68, 56.54, 2.24, "o"], Navi: [0.95, 60.72, 2.15, "b"], Ruchbah: [1.43, 60.24, 2.68, "w"], Segin: [1.91, 63.67, 3.37, "b"] }, l: [["Caph", "Schedar"], ["Schedar", "Navi"], ["Navi", "Ruchbah"], ["Ruchbah", "Segin"]] },
  Cepheus: { s: { Alderamin: [21.31, 62.59, 2.45, "w"], Alfirk: [21.48, 70.56, 3.23, "b"], Errai: [23.66, 77.63, 3.21, "o"], "ι Cep": [22.83, 66.2, 3.5, "o"], "ζ Cep": [22.18, 58.2, 3.35, "o"] }, l: [["Alderamin", "Alfirk"], ["Alfirk", "Errai"], ["Errai", "ι Cep"], ["ι Cep", "Alderamin"], ["Alderamin", "ζ Cep"], ["ζ Cep", "ι Cep"]] },
  Lyra: { s: { Vega: [18.62, 38.78, 0.03, "w"], "ε Lyr": [18.74, 39.67, 4.67, "w"], "ζ Lyr": [18.75, 37.6, 4.36, "w"], "δ Lyr": [18.91, 36.9, 4.3, "r"], Sulafat: [18.98, 32.69, 3.25, "b"], Sheliak: [18.83, 33.36, 3.52, "b"] }, l: [["Vega", "ε Lyr"], ["Vega", "ζ Lyr"], ["ζ Lyr", "δ Lyr"], ["δ Lyr", "Sulafat"], ["Sulafat", "Sheliak"], ["Sheliak", "ζ Lyr"]] },
  Cygnus: { s: { Deneb: [20.69, 45.28, 1.25, "w"], Sadr: [20.37, 40.26, 2.23, "y"], Gienah: [20.77, 33.97, 2.48, "o"], "δ Cyg": [19.75, 45.13, 2.87, "b"], Albireo: [19.51, 27.96, 3.05, "o"], "ζ Cyg": [21.22, 30.23, 3.2, "y"], "ι Cyg": [19.5, 51.73, 3.8, "w"], "κ Cyg": [19.28, 53.37, 3.8, "y"] },
    l: [["Deneb", "Sadr"], ["Sadr", "Albireo"], ["δ Cyg", "Sadr"], ["Sadr", "Gienah"], ["Gienah", "ζ Cyg"], ["δ Cyg", "ι Cyg"], ["ι Cyg", "κ Cyg"]] },
  Aquila: { s: { Altair: [19.85, 8.87, 0.77, "w"], Tarazed: [19.77, 10.61, 2.72, "o"], Alshain: [19.92, 6.41, 3.71, "y"], "δ Aql": [19.42, 3.11, 3.36, "w"], "ζ Aql": [19.09, 13.86, 2.99, "w"], "λ Aql": [19.1, -4.88, 3.43, "b"], "θ Aql": [20.19, -0.82, 3.24, "b"] }, l: [["Tarazed", "Altair"], ["Altair", "Alshain"], ["Altair", "δ Aql"], ["δ Aql", "λ Aql"], ["Tarazed", "ζ Aql"], ["Alshain", "θ Aql"]] },
  Scorpius: { s: { Antares: [16.49, -26.43, 1.06, "r"], Graffias: [16.09, -19.8, 2.62, "b"], Dschubba: [16.0, -22.62, 2.32, "b"], "π Sco": [15.98, -26.11, 2.89, "b"], "σ Sco": [16.35, -25.59, 2.89, "b"], "τ Sco": [16.6, -28.22, 2.82, "b"], "ε Sco": [16.84, -34.29, 2.29, "o"], "μ Sco": [16.86, -38.05, 3.0, "b"], "ζ Sco": [16.9, -42.36, 3.62, "o"], "η Sco": [17.2, -43.24, 3.32, "w"], Sargas: [17.62, -43.0, 1.86, "y"], "ι Sco": [17.79, -40.13, 2.99, "y"], "κ Sco": [17.71, -39.03, 2.39, "b"], Shaula: [17.56, -37.1, 1.62, "b"], Lesath: [17.51, -37.3, 2.7, "b"] },
    l: [["Graffias", "Dschubba"], ["Dschubba", "π Sco"], ["Dschubba", "σ Sco"], ["σ Sco", "Antares"], ["Antares", "τ Sco"], ["τ Sco", "ε Sco"], ["ε Sco", "μ Sco"], ["μ Sco", "ζ Sco"], ["ζ Sco", "η Sco"], ["η Sco", "Sargas"], ["Sargas", "ι Sco"], ["ι Sco", "κ Sco"], ["κ Sco", "Shaula"], ["Shaula", "Lesath"]] },
  Sagittarius: { s: { "Kaus Australis": [18.4, -34.38, 1.85, "b"], Nunki: [18.92, -26.3, 2.05, "b"], Ascella: [19.04, -29.88, 2.6, "w"], "Kaus Media": [18.35, -29.83, 2.7, "o"], "Kaus Borealis": [18.47, -25.42, 2.81, "o"], "φ Sgr": [18.76, -26.99, 3.17, "b"], Alnasl: [18.1, -30.42, 2.98, "o"], "τ Sgr": [19.12, -27.67, 3.32, "o"], "η Sgr": [18.29, -36.76, 3.11, "r"] },
    l: [["Alnasl", "Kaus Media"], ["Kaus Media", "Kaus Australis"], ["Kaus Australis", "Alnasl"], ["Kaus Media", "Kaus Borealis"], ["Kaus Borealis", "φ Sgr"], ["Kaus Media", "φ Sgr"], ["φ Sgr", "Ascella"], ["Ascella", "Kaus Australis"], ["φ Sgr", "Nunki"], ["Nunki", "τ Sgr"], ["τ Sgr", "Ascella"], ["Kaus Australis", "η Sgr"]] },
  Leo: { s: { Regulus: [10.14, 11.97, 1.35, "b"], "η Leo": [10.12, 16.76, 3.48, "w"], Algieba: [10.33, 19.84, 2.08, "o"], Adhafera: [10.28, 23.42, 3.43, "w"], Rasalas: [9.88, 26.0, 3.88, "o"], "ε Leo": [9.76, 23.77, 2.98, "y"], Zosma: [11.24, 20.52, 2.56, "w"], Chertan: [11.24, 15.43, 3.33, "w"], Denebola: [11.82, 14.57, 2.14, "w"] },
    l: [["Regulus", "η Leo"], ["η Leo", "Algieba"], ["Algieba", "Adhafera"], ["Adhafera", "Rasalas"], ["Rasalas", "ε Leo"], ["Algieba", "Zosma"], ["Zosma", "Denebola"], ["Denebola", "Chertan"], ["Chertan", "Regulus"], ["Zosma", "Chertan"]] },
  "Boötes": { s: { Arcturus: [14.26, 19.18, -0.05, "o"], Izar: [14.75, 27.07, 2.35, "o"], Muphrid: [13.91, 18.4, 2.68, "y"], Seginus: [14.53, 38.31, 3.03, "w"], "δ Boo": [15.26, 33.31, 3.47, "y"], Nekkar: [15.03, 40.39, 3.5, "y"], "ρ Boo": [14.53, 30.37, 3.58, "o"] },
    l: [["Arcturus", "Izar"], ["Izar", "δ Boo"], ["δ Boo", "Nekkar"], ["Nekkar", "Seginus"], ["Seginus", "ρ Boo"], ["ρ Boo", "Arcturus"], ["Arcturus", "Muphrid"]] },
  Virgo: { s: { Spica: [13.42, -11.16, 0.97, "b"], Porrima: [12.69, -1.45, 2.74, "w"], Vindemiatrix: [13.04, 10.96, 2.85, "y"], "δ Vir": [12.93, 3.4, 3.38, "r"], Zavijava: [11.84, 1.76, 3.6, "w"], "η Vir": [12.33, -0.67, 3.89, "w"], "ζ Vir": [13.58, -0.6, 3.37, "w"], "θ Vir": [13.16, -5.54, 4.38, "w"] },
    l: [["Zavijava", "η Vir"], ["η Vir", "Porrima"], ["Porrima", "δ Vir"], ["δ Vir", "Vindemiatrix"], ["Porrima", "θ Vir"], ["θ Vir", "Spica"], ["δ Vir", "ζ Vir"], ["ζ Vir", "Spica"]] },
};
const SKIES = {
  winter: { c: [6.0, 12], list: ["Orion", "Taurus", "Canis Major", "Gemini", "Canis Minor", "Auriga"], asterism: { name: "Winter Hexagon", stars: [["Orion", "Rigel"], ["Taurus", "Aldebaran"], ["Auriga", "Capella"], ["Gemini", "Pollux"], ["Canis Minor", "Procyon"], ["Canis Major", "Sirius"]] } },
  spring: { c: [12.6, 32], list: ["Ursa Major", "Leo", "Boötes", "Virgo"], asterism: { name: "Arc to Arcturus, spike to Spica", stars: [["Ursa Major", "Alioth"], ["Ursa Major", "Mizar"], ["Ursa Major", "Alkaid"], ["Boötes", "Arcturus"], ["Virgo", "Spica"]], open: true } },
  summer: { c: [19.6, 30], list: ["Lyra", "Cygnus", "Aquila"], asterism: { name: "Summer Triangle", stars: [["Lyra", "Vega"], ["Cygnus", "Deneb"], ["Aquila", "Altair"]] } },
  north: { c: [0, 90], list: ["Ursa Minor", "Ursa Major", "Cassiopeia", "Cepheus"], asterism: { name: "The pointers find Polaris", stars: [["Ursa Major", "Merak"], ["Ursa Major", "Dubhe"], ["Ursa Minor", "Polaris"]], open: true } },
  scorpius: { c: [17.6, -31], list: ["Scorpius", "Sagittarius"], asterism: { name: "The Teapot and the heart of the Scorpion", stars: [] } },
};
const CCOL = { b: "#a9c1ff", w: "#f2f4ff", y: "#fff1d6", o: "#ffd29a", r: "#ff9f6e" };
function projectSky(key) {
  const sky = SKIES[key], ra0 = sky.c[0] * 15 * RAD, de0 = sky.c[1] * RAD;
  const P = (ra, de) => {
    const a = ra * 15 * RAD, d = de * RAD, ca = Math.cos(a - ra0);
    const k = 2 / (1 + Math.sin(de0) * Math.sin(d) + Math.cos(de0) * Math.cos(d) * ca);
    return [-k * Math.cos(d) * Math.sin(a - ra0), -k * (Math.cos(de0) * Math.sin(d) - Math.sin(de0) * Math.cos(d) * ca)];
  };
  const cons = sky.list.map((name) => {
    const C = CON[name], pts = {};
    for (const [k, [ra, de, mag, cc]] of Object.entries(C.s)) pts[k] = { xy: P(ra, de), mag, col: CCOL[cc], name: k };
    return { name, pts, lines: C.l.filter(([a, b]) => pts[a] && pts[b]), cluster: C.cluster };
  });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cons) for (const s of Object.values(c.pts)) { x0 = Math.min(x0, s.xy[0]); x1 = Math.max(x1, s.xy[0]); y0 = Math.min(y0, s.xy[1]); y1 = Math.max(y1, s.xy[1]); }
  return { cons, box: [x0, y0, x1, y1], sky };
}
DEEPSPACE.constellations = {
  label: "Constellations",
  params: {
    sky: { type: "select", options: Object.keys(SKIES), default: "winter", label: "Sky" },
    labels: { type: "select", options: ["names", "lines only", "stars only"], default: "names", label: "Labels" },
    pace: { type: "range", min: 2, max: 20, step: 0.5, default: 6, label: "Seconds per constellation" },
    color: { type: "color", default: "#7fb2ff", label: "Line colour" },
    drift: { type: "range", min: 0, max: 2, step: 0.05, default: 0.3, label: "Sky drift" },
    bg: { type: "select", options: ["stars", "black", "transparent"], default: "stars", label: "Background" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    spaceBg(ctx, w, h, t, s, p.bg, { density: 0.35, seed: 141, bright: 0.6 });
    // tile previews run quickly and start with the figures already drawn
    const pace = info ? p.pace : 1.2;
    if (!s.proj || s.projKey !== p.sky) { s.proj = projectSky(p.sky); s.projKey = p.sky; s.t0 = t - (info ? 0 : s.proj.cons.length * pace); }
    const { cons, box, sky } = s.proj, m = Math.min(w, h);
    const sc = Math.min((w * 0.84) / Math.max(0.01, box[2] - box[0]), (h * 0.8) / Math.max(0.01, box[3] - box[1]));
    const ox = w / 2 - ((box[0] + box[2]) / 2) * sc, oy = h / 2 - ((box[1] + box[3]) / 2) * sc;
    const rot = Math.sin(t * 0.02 * p.drift) * 0.06 * p.drift;
    const X = (xy) => { const x = xy[0] * sc + ox - w / 2, y = xy[1] * sc + oy - h / 2; return [w / 2 + x * Math.cos(rot) - y * Math.sin(rot), h / 2 + x * Math.sin(rot) + y * Math.cos(rot)]; };
    // timeline: each constellation draws in; everything holds; fade; repeat
    const slots = cons.length + 1 + (sky.asterism.stars.length ? 1 : 0), cycle = (slots + 1.5) * pace, tt = ((t - s.t0) % cycle + cycle) % cycle;
    const fadeAll = smooth(cycle, cycle - pace * 0.6, tt) * smooth(0, 0.6, tt);
    const u = Math.max(0.7, m / 360);
    ctx.save(); ctx.lineCap = "round";
    cons.forEach((c, ci) => {
      const local = (tt - ci * pace) / pace, prog = clamp(local / 0.6, 0, 1), on = local > 0, cur = local > 0 && local < 1;
      // lines trace from star to star in order
      if (p.labels !== "stars only" && on) {
        ctx.strokeStyle = p.color; ctx.lineWidth = u * (cur ? 1.6 : 1.1); ctx.globalAlpha = (cur ? 0.85 : 0.45) * fadeAll;
        const n = c.lines.length, f = prog * n;
        c.lines.forEach(([a, b], i) => {
          if (i > f) return;
          const A = X(c.pts[a].xy), B = X(c.pts[b].xy), k = Math.min(1, f - i);
          const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, gap = u * 5;
          ctx.beginPath(); ctx.moveTo(A[0] + (dx / l) * gap, A[1] + (dy / l) * gap); ctx.lineTo(A[0] + dx * k - (dx / l) * gap * (k >= 1 ? 1 : 0), A[1] + dy * k - (dy / l) * gap * (k >= 1 ? 1 : 0)); ctx.stroke();
        });
      }
      // stars: size by magnitude, true colours, a soft twinkle
      ctx.globalCompositeOperation = "lighter";
      for (const st of Object.values(c.pts)) {
        const [x, y] = X(st.xy), r = u * Math.max(0.8, 4.6 - st.mag * 1.05), tw = 0.85 + 0.15 * Math.sin(t * 3 + x);
        ctx.globalAlpha = tw * (0.75 + (cur ? 0.25 : 0)); ctx.drawImage(glow(st.col), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        ctx.fillStyle = "#fff"; ctx.globalAlpha = tw; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (c.cluster) { const pl = Object.values(c.pts).filter((x) => x.mag > 2.8 && x.xy && x.name.length > 3 && ["Alcyone", "Atlas", "Electra", "Maia", "Merope", "Taygeta"].includes(x.name)); if (pl.length) { const [x, y] = X(pl[0].xy); ctx.globalAlpha = 0.18; ctx.drawImage(glow("#9fbfff"), x - u * 16, y - u * 16, u * 32, u * 32); ctx.globalAlpha = 1; } }
      // names: the constellation, then its brightest stars
      if (p.labels === "names" && on) {
        const la = smooth(0.45, 0.75, local) * fadeAll * (cur ? 1 : 0.55);
        if (la > 0.01) {
          let cx = 0, cy = 0, n = 0; for (const st of Object.values(c.pts)) { const [x, y] = X(st.xy); cx += x; cy += y; n++; }
          ctx.globalAlpha = la; ctx.fillStyle = p.color; ctx.textAlign = "center";
          ctx.font = `600 ${Math.max(9, u * 13) | 0}px system-ui, sans-serif`;
          const ys = Object.values(c.pts).map((st) => X(st.xy)[1]);
          ctx.fillText(c.name.toUpperCase(), cx / n, Math.max(...ys) + u * 22 > h - u * 6 ? Math.min(...ys) - u * 14 : Math.max(...ys) + u * 22);
          ctx.font = `${Math.max(8, u * 9.5) | 0}px system-ui, sans-serif`; ctx.fillStyle = "#dfe7ff"; ctx.textAlign = "left";
          for (const st of Object.values(c.pts)) if (st.mag < 1.7 || (c.cluster && st.name === "Alcyone")) { const [x, y] = X(st.xy); ctx.fillText(c.cluster && st.name === "Alcyone" ? "Pleiades" : st.name, x + u * 7, y - u * 5); }
        }
      }
    });
    // the asterism linking the brightest stars, last
    const as = sky.asterism, aLocal = (tt - cons.length * pace) / pace;
    if (as.stars.length && aLocal > 0 && p.labels !== "stars only") {
      const pts = as.stars.map(([cn, st]) => X(cons.find((c) => c.name === cn).pts[st].xy));
      const prog = clamp(aLocal / 0.7, 0, 1) * (pts.length - (as.open ? 1 : 0));
      ctx.setLineDash([u * 5, u * 5]); ctx.strokeStyle = "#ffd98a"; ctx.lineWidth = u * 1.3; ctx.globalAlpha = 0.7 * fadeAll;
      ctx.beginPath(); ctx.moveTo(...pts[0]);
      for (let i = 1; i <= Math.ceil(prog); i++) { const A = pts[i - 1], B = pts[i % pts.length], k = Math.min(1, prog - (i - 1)); ctx.lineTo(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k); }
      ctx.stroke(); ctx.setLineDash([]);
      if (p.labels === "names") { ctx.globalAlpha = smooth(0.5, 0.9, aLocal) * fadeAll; ctx.fillStyle = "#ffd98a"; ctx.textAlign = "center"; ctx.font = `italic ${Math.max(9, u * 11) | 0}px system-ui, sans-serif`; ctx.fillText(as.name, w / 2, h - u * 10); }
    } else if (!as.stars.length && p.labels === "names" && aLocal > 0) { ctx.globalAlpha = smooth(0, 0.5, aLocal) * fadeAll; ctx.fillStyle = "#ffd98a"; ctx.textAlign = "center"; ctx.font = `italic ${Math.max(9, u * 11) | 0}px system-ui, sans-serif`; ctx.fillText(as.name, w / 2, h - u * 10); }
    ctx.restore();
  },
};

// ================================================================== nebula
// Four kinds of nebula built from warped noise: a star-forming region with dust pillars
// (in the gold-and-teal "Hubble palette"), a pink emission nebula with dark lanes, a
// planetary nebula (a dying star's glowing shell with cometary knots) and a supernova
// remnant (red filaments over blue synchrotron glow, with a pulsar at its heart).
function nebulaCanvas(style, gw, gh, seed) {
  const asp = gw / gh;
  // dust pillars rising from the bottom edge: [x, top y, base half-width, lean]
  const pillars = [[-0.32, -0.12, 0.17, 0.08], [0.02, -0.34, 0.13, -0.05], [0.3, 0.06, 0.1, 0.1]];
  return pixelCanvas(gw, gh, (i, j) => {
    const X = (i / gw - 0.5) * asp, Y = j / gh - 0.5;
    const wx = fbm3(X * 2.2, Y * 2.2, 0.3, 4, seed) - 0.5, wy = fbm3(X * 2.2, Y * 2.2, 5.3, 4, seed + 1) - 0.5;
    const qx = X + wx * 0.5, qy = Y + wy * 0.5;
    const f1 = fbm3(qx * 3, qy * 3, 1.1, 6, seed + 2), f2 = fbm3(qx * 5, qy * 5, 2.7, 5, seed + 3), fil = ridged3(qx * 4, qy * 4, 3.3, 5, seed + 4);
    let r = 0, g = 0, b = 0;
    if (style === "pillars") {
      // teal oxygen glow above, gold sulphur and hydrogen toward the dusty base
      const oiii = smooth(0.35, 0.75, f1) * (0.6 + 0.5 * smooth(0.3, -0.5, Y)), sii = smooth(0.4, 0.8, f2) * (0.5 + 0.6 * smooth(-0.2, 0.5, Y)) + fil * 0.25;
      r = 255 * (sii * 0.95 + oiii * 0.15); g = 255 * (sii * 0.7 + oiii * 0.65); b = 255 * (oiii * 0.85 + sii * 0.15);
      for (const [px, top, bw, lean] of pillars) {
        const yy = (Y - top) / (0.5 - top); // 0 at the tip, 1 at the base
        if (yy < -0.15) continue;
        const half = bw * (0.3 + 0.7 * clamp(yy, 0, 1) ** 0.8), cx = px + lean * (1 - yy) + 0.03 * Math.sin(Y * 11 + px * 9);
        const tip = yy < 0.1 ? Math.hypot((X - cx) / half, (yy - 0.1) / 0.14) : Math.abs(X - cx) / half;
        // ragged, eroding edges at several scales
        const rough = (fbm3(X * 7, Y * 7, px * 3, 4, seed + 7) - 0.5) * 0.7 + (fbm3(X * 24, Y * 24, px * 3, 3, seed + 9) - 0.5) * 0.35;
        const edge = 1 - tip + rough;
        if (edge > -0.3) {
          const inside = smooth(-0.08, 0.35, edge) * 0.94;
          // photo-evaporating skin: lit from above, brightest near the tips, wispy where it boils off
          const lit = 0.45 + 0.55 * smooth(0.7, 0, yy);
          const rim = Math.exp(-(((edge - 0.03) / 0.11) ** 2)) * lit * (0.6 + 0.6 * fbm3(X * 30, Y * 30, 2.2, 3, seed + 10));
          const body = (0.1 + 0.3 * fbm3(X * 10, Y * 10, 7.7, 5, seed + 8)) * (0.6 + 0.6 * smooth(0.9, 0.1, yy));
          r = r * (1 - inside) + 150 * body * inside + 255 * rim * 0.95; g = g * (1 - inside) + 92 * body * inside + 196 * rim * 0.85; b = b * (1 - inside) + 52 * body * inside + 120 * rim * 0.6;
        }
      }
    } else if (style === "emission") {
      const d = Math.hypot(X * 0.9, Y), core = Math.exp(-d * d * 7);
      const ha = smooth(0.3, 0.8, f1) * (0.4 + 0.8 * core) + fil * 0.35 * smooth(0.3, 0.7, f2);
      r = 255 * (ha * 1.0 + core * 0.4); g = 255 * (ha * 0.32 + core * 0.45); b = 255 * (ha * 0.45 + core * 0.75 * smooth(0.4, 0.7, f2));
      const dust = smooth(0.6, 0.85, ridged3(qx * 2.5, qy * 2.5, 9.1, 4, seed + 5)) * (1 - core * 0.6);
      r *= 1 - dust * 0.9; g *= 1 - dust * 0.9; b *= 1 - dust * 0.85;
    } else if (style === "planetary") {
      const ex = X / 1.15, d = Math.hypot(ex, Y) * 2.6, ang = Math.atan2(Y, ex);
      const shellN = fbm3(Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, d * 1.4, 5, seed + 2);
      const shell = Math.exp(-(((d - 0.62 - (shellN - 0.5) * 0.25) / 0.17) ** 2));
      const inner = smooth(0.7, 0.1, d) * (0.5 + 0.5 * f2);
      const outer = Math.exp(-(((d - 0.92) / 0.18) ** 2)) * (0.5 + 0.7 * fil);
      // cometary knots: short radial dark-headed streaks at the inner edge of the ring
      const kn = smooth(0.72, 0.9, noise3(Math.cos(ang) * 40, Math.sin(ang) * 40, d * 3, seed + 6)) * Math.exp(-(((d - 0.5) / 0.1) ** 2));
      r = 255 * (outer * 1.0 + shell * 0.95 + kn * 0.45 + inner * 0.15); g = 255 * (outer * 0.25 + shell * 0.55 + inner * 0.75 + kn * 0.3); b = 255 * (outer * 0.3 + shell * 0.45 + inner * 0.95 + kn * 0.2);
      const halo = Math.exp(-d * 0.9) * 0.12 * f1; r += 255 * halo; g += 120 * halo; b += 150 * halo;
    } else {
      const ex = X / 1.25, d = Math.hypot(ex, Y) * 2.2;
      const env = smooth(1.05, 0.55, d + (f1 - 0.5) * 0.4);
      const sync = env * (0.35 + 0.4 * f2) * smooth(1, 0.2, d);
      const fA = smooth(0.62, 0.92, ridged3(qx * 5, qy * 5, 4.4, 5, seed + 9)), fB = smooth(0.7, 0.95, ridged3(qx * 12, qy * 12, 8.1, 4, seed + 11));
      const filaments = (fA * 0.8 + fB * 0.5) * env * (0.6 + 0.6 * smooth(0.3, 0.9, d));
      r = 255 * (sync * 0.45 + filaments * 1.0); g = 255 * (sync * 0.55 + filaments * 0.42 + fB * env * 0.15); b = 255 * (sync * 0.95 + filaments * 0.18);
    }
    return [Math.min(255, r), Math.min(255, g), Math.min(255, b), 255];
  });
}
DEEPSPACE.nebula = {
  label: "Nebula",
  params: {
    style: { type: "select", options: ["pillars", "emission", "planetary", "supernova remnant"], default: "pillars", label: "Nebula" },
    brightness: { type: "range", min: 0.2, max: 2, step: 0.05, default: 1, label: "Brightness" },
    drift: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "Drift" },
    spikes: { type: "select", options: ["six-point", "four-point", "none"], default: "six-point", label: "Star spikes" },
    stars: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "Stars" },
    seed: { type: "range", min: 1, max: 20, step: 1, default: 3, label: "Variation" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    const gw = Math.max(48, Math.round(Math.min(big(w, h) ? 400 : 160, w))), gh = Math.max(32, Math.round((gw * h) / w));
    const key = [p.style, gw, gh, p.seed].join(":");
    if (s.key !== key) { s.key = key; s.neb = nebulaCanvas(p.style, gw, gh, p.seed * 101); }
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    // slow pan and zoom, and a breathing glow layer on top
    const z = 1.06 + 0.04 * Math.sin(t * 0.021 * p.drift), ox = Math.sin(t * 0.017 * p.drift) * w * 0.02, oy = Math.cos(t * 0.013 * p.drift) * h * 0.02;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.translate(w / 2 + ox, h / 2 + oy); ctx.scale(z, z);
    ctx.globalAlpha = Math.min(1, p.brightness); ctx.drawImage(s.neb, -w / 2, -h / 2, w, h);
    ctx.globalCompositeOperation = "lighter";
    if (p.brightness > 1) { ctx.globalAlpha = p.brightness - 1; ctx.drawImage(s.neb, -w / 2, -h / 2, w, h); }
    ctx.globalAlpha = 0.12 * p.brightness * (0.5 + 0.5 * Math.sin(t * 0.35));
    ctx.scale(1.015, 1.015); ctx.drawImage(s.neb, -w / 2, -h / 2, w, h);
    ctx.restore();
    // stars in front: field stars drift a little faster than the gas (parallax)
    if (p.stars > 0) {
      ctx.save(); ctx.translate(ox * 1.6, oy * 1.6);
      starfield(ctx, w, h, t, s, { density: 0.6 * p.stars, seed: 151 + p.seed, spikes: p.spikes === "none" ? 0 : p.spikes === "six-point" ? 2 : 1, bright: Math.min(1, p.stars) });
      ctx.restore();
    }
    const m = Math.min(w, h);
    if (p.style === "planetary") {
      // the hot white dwarf at the centre
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.95; ctx.drawImage(glow("#cfe0ff"), w / 2 + ox - m * 0.03, h / 2 + oy - m * 0.03, m * 0.06, m * 0.06); ctx.restore();
    }
    if (p.style === "supernova remnant") {
      // the pulsar: a rapid flash, with wisps rippling outward
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const cx = w / 2 + ox, cy = h / 2 + oy, beat = Math.pow(Math.max(0, Math.sin(t * 9)), 12);
      ctx.globalAlpha = 0.5 + 0.5 * beat; ctx.drawImage(glow("#e8f0ff"), cx - m * 0.03, cy - m * 0.03, m * 0.06, m * 0.06);
      ctx.strokeStyle = "#a8c4ff"; ctx.lineWidth = m * 0.004;
      for (let k = 0; k < 4; k++) { const e = ((t * 0.12 + k / 4) % 1); ctx.lineWidth = m * (0.004 + e * 0.012); ctx.globalAlpha = (1 - e) * e * 0.5; ctx.beginPath(); ctx.ellipse(cx, cy, m * (0.03 + e * 0.16), m * (0.015 + e * 0.07), -0.5, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  },
};

// ================================================================== galaxy
function galaxyCanvas(S, p, seed) {
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), rng = seeded(seed), C = S / 2, R = S * 0.48;
  const arms = Math.max(1, p.arms | 0), pitch = (p.style === "grand design" ? 13 : 17) * RAD, barred = p.style === "barred spiral", bar = barred ? 0.28 : 0.1;
  const armAt = (r, k) => (k / arms) * TAU + Math.log(Math.max(r, bar) / bar) / Math.tan(pitch);
  // disc glow
  g.globalCompositeOperation = "lighter";
  const dg = g.createRadialGradient(C, C, 0, C, C, R);
  dg.addColorStop(0, "rgba(255,226,180,0.55)"); dg.addColorStop(0.2, "rgba(220,210,220,0.22)"); dg.addColorStop(0.6, "rgba(150,170,230,0.07)"); dg.addColorStop(1, "rgba(120,150,230,0)");
  g.fillStyle = dg; g.fillRect(0, 0, S, S);
  // arm glow: soft blue clouds along each arm
  const cloud = glow("#8fb0ff", 64, 0.3), pink = glow("#ff6fa8", 32, 0.3), warm = glow("#ffd9a0", 64, 0.3);
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
  for (let k = 0; k < arms; k++) for (let i = 0; i < 600; i++) {
    const r = bar + Math.pow(rng(), 0.9) * (1 - bar), th = armAt(r, k) + gauss() * 0.5 * (1.25 - r * 0.6);
    const x = C + Math.cos(th) * r * R, y = C + Math.sin(th) * r * R, sz = R * (0.06 + 0.12 * rng()) * (1.1 - r * 0.5);
    g.globalAlpha = 0.06 + 0.08 * rng(); g.drawImage(r < 0.3 ? warm : cloud, x - sz, y - sz, sz * 2, sz * 2);
  }
  // stars: arm stars are young and blue, the disc between is older and yellower
  const n = Math.round(S * S / 14);
  for (let i = 0; i < n; i++) {
    const inArm = rng() < 0.55, r = inArm ? Math.min(1, bar * 0.6 + Math.pow(rng(), 1.1) * (1 - bar * 0.6) + gauss() * 0.03) : Math.min(1, -Math.log(1 - rng() * 0.98) * 0.3);
    const th = inArm ? armAt(r, (rng() * arms) | 0) + gauss() * (0.35 + 0.3 * rng()) * (1.3 - r * 0.6) : rng() * TAU;
    const x = C + Math.cos(th) * r * R, y = C + Math.sin(th) * r * R;
    g.globalAlpha = 0.25 + 0.6 * rng() * (inArm ? 1 : 0.6);
    g.fillStyle = r < 0.22 ? "#ffe2b8" : inArm ? (rng() < 0.7 ? "#cfdcff" : "#ffffff") : "#ffeccc";
    const sz = Math.max(0.6, S / 900) * (rng() < 0.03 ? 2.2 : 1);
    g.fillRect(x, y, sz, sz);
  }
  // star-forming regions: pink knots on the arms
  for (let k = 0; k < arms; k++) for (let i = 0; i < 46; i++) {
    const r = 0.25 + rng() * 0.7, th = armAt(r, k) + gauss() * 0.25, x = C + Math.cos(th) * r * R, y = C + Math.sin(th) * r * R, sz = R * (0.006 + rng() * 0.014);
    g.globalAlpha = 0.5 + rng() * 0.5; g.drawImage(pink, x - sz * 2, y - sz * 2, sz * 4, sz * 4);
  }
  // the bar
  if (barred) {
    g.save(); g.translate(C, C); g.scale(1, 0.32); g.globalAlpha = 0.45; g.drawImage(warm, -R * bar * 1.3, -R * bar * 1.3, R * bar * 2.6, R * bar * 2.6); g.restore();
  }
  // dust lanes along the inner (trailing) edge of each arm
  g.globalCompositeOperation = "source-over";
  const dust = glow("#000000", 32, 0.4);
  for (let k = 0; k < arms; k++) for (let i = 0; i < 700; i++) {
    const r = bar * 0.8 + Math.pow(rng(), 0.8) * (0.95 - bar * 0.8), th = armAt(r, k) - 0.32 * (1.25 - r * 0.6) + gauss() * 0.1;
    const x = C + Math.cos(th) * r * R, y = C + Math.sin(th) * r * R, sz = R * (0.008 + 0.022 * rng()) * (1.2 - r * 0.6);
    g.globalAlpha = 0.18 + 0.2 * rng(); g.drawImage(dust, x - sz, y - sz, sz * 2, sz * 2);
  }
  return c;
}
DEEPSPACE.galaxy = {
  label: "Spiral galaxy",
  params: {
    style: { type: "select", options: ["spiral", "barred spiral", "grand design"], default: "spiral", label: "Type" },
    arms: { type: "range", min: 2, max: 4, step: 1, default: 2, label: "Arms" },
    tilt: { type: "range", min: 0, max: 88, step: 1, default: 58, label: "Tilt" },
    angle: { type: "range", min: -90, max: 90, step: 1, default: -22, label: "Angle" },
    size: { type: "range", min: 0.3, max: 1.4, step: 0.01, default: 0.95, label: "Size" },
    speed: { type: "range", min: 0, max: 4, step: 0.05, default: 1, label: "Spin speed" },
    supernovae: { type: "select", options: ["supernovae", "none"], default: "supernovae", label: "Events" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    spaceBg(ctx, w, h, t, s, p.sky, { density: 0.35, seed: 161 });
    const S = Math.round(clamp(Math.max(w, h) * 0.9 * p.size, 96, big(w, h) ? 1100 : 220) / 8) * 8;
    const key = [S, p.style, p.arms].join(":");
    if (s.key !== key) { s.key = key; s.gal = galaxyCanvas(S, p, 7); s.bg = null; }
    // faint background galaxies
    if (p.sky === "stars") {
      if (!s.bg) { const r = seeded(19); s.bg = Array.from({ length: 14 }, () => ({ x: r(), y: r(), a: r() * Math.PI, e: 0.2 + r() * 0.8, s: 0.004 + r() * 0.01 })); }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const g of s.bg) { const m = Math.min(w, h) * g.s; ctx.save(); ctx.translate(g.x * w, g.y * h); ctx.rotate(g.a); ctx.scale(1, g.e); ctx.globalAlpha = 0.35; ctx.drawImage(glow("#ffe6c8"), -m, -m, m * 2, m * 2); ctx.restore(); }
      ctx.restore();
    }
    const D = Math.min(w, h) * 0.95 * p.size * (w > h ? Math.min(1.6, w / h) * 0.75 : 1), ci = Math.cos(p.tilt * RAD), spin = -t * 0.01 * p.speed;
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(p.angle * RAD); ctx.scale(1, Math.max(0.03, ci));
    ctx.globalCompositeOperation = "lighter"; ctx.rotate(spin);
    ctx.drawImage(s.gal, -D / 2, -D / 2, D, D);
    ctx.restore();
    // bulge: round, not flattened with the disc
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.translate(w / 2, h / 2); ctx.rotate(p.angle * RAD); ctx.scale(1, Math.max(0.55, ci));
    ctx.globalAlpha = 0.9; ctx.drawImage(glow("#ffe3b0", 64, 0.12), -D * 0.16, -D * 0.16, D * 0.32, D * 0.32);
    ctx.globalAlpha = 0.9; ctx.drawImage(glow("#fff6e6", 64, 0.1), -D * 0.035, -D * 0.035, D * 0.07, D * 0.07);
    ctx.restore();
    // seen nearly edge-on, the dust in the disc makes a dark lane across the bulge
    if (p.tilt > 55) {
      const k = smooth(55, 85, p.tilt);
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(p.angle * RAD);
      const g = ctx.createLinearGradient(0, -D * 0.04, 0, D * 0.04);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, `rgba(0,0,0,${0.85 * k})`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, D * 0.006 * ci, D * 0.47, D * 0.035 * (0.4 + ci), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // a supernova: one star in an arm outshines the galaxy's core, then fades over seconds
    if (p.supernovae === "supernovae") {
      if (!s.sn || t > s.sn.t0 + 16) s.sn = { t0: t + rnd(10, 3), r: rnd(0.8, 0.3), a: rnd(TAU) };
      const e = t - s.sn.t0;
      if (e > 0) {
        const I = e < 1.2 ? e / 1.2 : Math.exp(-(e - 1.2) / 3.5), a = s.sn.a + spin;
        let x = Math.cos(a) * s.sn.r * D / 2, y = Math.sin(a) * s.sn.r * D / 2 * Math.max(0.03, ci);
        const ra = p.angle * RAD, X = w / 2 + x * Math.cos(ra) - y * Math.sin(ra), Y = h / 2 + x * Math.sin(ra) + y * Math.cos(ra), r = D * 0.02 * (0.5 + I);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = I; ctx.drawImage(glow("#eef4ff"), X - r * 2, Y - r * 2, r * 4, r * 4);
        drawSpikes(ctx, X, Y, r * 4 * I, "#dfe9ff", I * 0.8, "jwst"); ctx.restore();
      }
    }
  },
};

// ================================================================== black hole
// A spinning black hole with its accretion disc, lensed the way light really bends:
// the far side of the disc arches over the shadow and the underside shows below it,
// a thin photon ring circles the shadow, the approaching side is brighter and bluer
// (Doppler beaming), inner orbits run faster than outer ones, and the stars behind
// smear into arcs and Einstein rings as they pass.
// temperature (0..1) → colour stops: [position, r, g, b]
const DISC_PAL = {
  fiery: [[0, 0, 0, 0], [0.18, 60, 8, 0], [0.4, 200, 60, 10], [0.65, 255, 150, 50], [0.85, 255, 220, 150], [1, 255, 248, 230]],
  "white-hot": [[0, 0, 0, 0], [0.2, 80, 40, 30], [0.45, 220, 180, 150], [0.7, 255, 240, 220], [1, 255, 255, 255]],
  quasar: [[0, 0, 0, 0], [0.2, 40, 20, 90], [0.45, 120, 80, 220], [0.7, 190, 170, 255], [1, 240, 240, 255]],
};
function palette(name, x) {
  const P = DISC_PAL[name] || DISC_PAL.fiery;
  if (x <= 0) return [0, 0, 0];
  for (let i = 1; i < P.length; i++) if (x <= P[i][0]) {
    const A = P[i - 1], B = P[i], k = (x - A[0]) / (B[0] - A[0]);
    return [A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k, A[3] + (B[3] - A[3]) * k];
  }
  return P[P.length - 1].slice(1);
}
function blackHoleTables(bw, bh, Rs, elev) {
  const n = bw * bh, cx = bw / 2, cy = bh / 2, rin = 1.6, rout = 5.2, se = Math.sin(elev);
  const T = { n, pr: new Float32Array(n).fill(-1), pphi: new Float32Array(n), lr: new Float32Array(n).fill(-1), lphi: new Float32Array(n), lw: new Float32Array(n), ring: new Float32Array(n), bgx: new Float32Array(n), bgy: new Float32Array(n), shadow: new Uint8Array(n), front: new Uint8Array(n), rin, rout };
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const k = j * bw + i, x = (i + 0.5 - cx) / Rs, y = (j + 0.5 - cy) / Rs, rho = Math.hypot(x, y);
    // primary image: the disc plane seen from just above
    const Z = y / se, r = Math.hypot(x, Z);
    if (r >= rin * 0.9 && r <= rout * 1.05 && (Z > 0 || rho > 1.02)) { T.pr[k] = r; T.pphi[k] = Math.atan2(Z, x); T.front[k] = Z > 0 ? 1 : 0; }
    if (rho < 1) { T.shadow[k] = 1; continue; }
    // lensed image: the far side lifted over the top, the underside squeezed below
    const sn = y / rho, kk = 1 + 1.6 * Math.max(0, sn), rl = Math.sqrt(rho * rho - 1) * 2.2 * kk;
    if (rl >= rin * 0.9 && rl <= rout * 1.05) { T.lr[k] = rl; T.lphi[k] = Math.atan2(y, x); T.lw[k] = sn < 0 ? 1 : 0.65; }
    T.ring[k] = Math.exp(-(((rho - 1.03) / 0.03) ** 2)) + 0.3 * Math.exp(-(((rho - 1.03) / 0.12) ** 2));
    // background: a point lens bends each ray by θE²/ρ
    const beta = rho - 1.7 / rho, f = beta / rho;
    T.bgx[k] = x * f; T.bgy[k] = y * f;
  }
  return T;
}
function discTexture(seed) {
  const NP = 512, NR = 64, d = new Float32Array(NP * NR);
  for (let j = 0; j < NR; j++) for (let i = 0; i < NP; i++) {
    const a = (i / NP) * TAU, r = j / NR;
    // streaky turbulence: slow around the disc, fast across it
    const v = fbm3(Math.cos(a) * 3, Math.sin(a) * 3, r * 14, 5, seed) * 0.6 + fbm3(Math.cos(a) * 9, Math.sin(a) * 9, r * 30, 3, seed + 1) * 0.4;
    d[j * NP + i] = clamp((v - 0.3) * 2.1, 0, 1.3) ** 1.4;
  }
  return { d, NP, NR };
}
let discTex = null;
DEEPSPACE.blackhole = {
  label: "Black hole",
  params: {
    spin: { type: "range", min: 0, max: 4, step: 0.05, default: 1, label: "Disc speed" },
    tilt: { type: "range", min: 3, max: 30, step: 0.5, default: 8, label: "View angle" },
    size: { type: "range", min: 0.3, max: 1.4, step: 0.01, default: 0.9, label: "Size" },
    color: { type: "select", options: Object.keys(DISC_PAL), default: "fiery", label: "Disc" },
    beaming: { type: "range", min: 0, max: 1.5, step: 0.05, default: 0.8, label: "Doppler beaming" },
    jets: { type: "select", options: ["no jets", "jets"], default: "no jets", label: "Jets" },
    stars: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "Lensed stars" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    const f = Math.min(1, (big(w, h) ? 400 : 160) / Math.max(w, h)), bw = Math.max(16, Math.round(w * f)), bh = Math.max(16, Math.round(h * f));
    const Rs = Math.max(2, Math.min(bw / (2 * 5.3), bh / 2.2 / 2.4) * p.size);
    const key = [bw, bh, Rs.toFixed(2), p.tilt].join(":");
    if (s.key !== key) {
      s.key = key; s.T = blackHoleTables(bw, bh, Rs, p.tilt * RAD);
      s.cv = document.createElement("canvas"); s.cv.width = bw; s.cv.height = bh; s.g = s.cv.getContext("2d"); s.img = s.g.createImageData(bw, bh);
      // the star field behind, as a wrap-around texture in hole units
      const rng = seeded(23), SW = 512, SH = 256, st = new Float32Array(SW * SH * 3);
      for (let i = 0; i < 1400; i++) { const x = (rng() * SW) | 0, y = (rng() * SH) | 0, b = Math.pow(rng(), 3) * 2.2, c = starColor(rng()), [r, g, bb] = hexToRgb(c), k = (y * SW + x) * 3; st[k] = r * b; st[k + 1] = g * b; st[k + 2] = bb * b; }
      s.stars = { st, SW, SH };
    }
    discTex ||= discTexture(77);
    const T = s.T, D = discTex, d = s.img.data, pal = p.color, beam = p.beaming, sp = p.spin * 0.6;
    const { st, SW, SH } = s.stars, sScale = 26, scroll = t * 0.6, starK = p.stars;
    const omega = new Float32Array(D.NR);
    for (let j = 0; j < D.NR; j++) { const r = T.rin + ((T.rout - T.rin) * j) / D.NR; omega[j] = sp * Math.pow(r, -1.5) * 2.2; }
    const sample = (r, phi) => {
      const jr = clamp(((r - T.rin) / (T.rout - T.rin)) * D.NR, 0, D.NR - 1) | 0;
      let a = (phi - omega[jr] * t) / TAU; a -= Math.floor(a);
      const v = D.d[jr * D.NP + ((a * D.NP) | 0)];
      // brightness falls off outward; the inner edge is sharp
      const prof = smooth(T.rin * 0.95, T.rin * 1.12, r) * smooth(T.rout * 1.02, T.rout * 0.7, r) * Math.pow(T.rin / r, 1.2);
      // Doppler: the left side comes toward you
      const beta = 0.55 * Math.sqrt(T.rin / r), vt = -beta * Math.cos(phi), Dop = Math.pow(1 / Math.max(0.25, 1 - vt * beam), 3);
      const temp = clamp((0.35 + 0.65 * Math.pow(T.rin / r, 0.9)) * (0.85 + 0.25 * v) * Math.pow(Dop, 0.25), 0, 1.2);
      const I = prof * (0.35 + 0.9 * v) * Dop;
      const c = palette(pal, temp);
      return [c[0] * I, c[1] * I, c[2] * I, clamp(prof * (0.6 + 0.6 * v) * 1.3, 0, 1)];
    };
    for (let k = 0, n = T.n; k < n; k++) {
      let r = 0, g = 0, b = 0;
      if (!T.shadow[k] && starK > 0) {
        let sx = T.bgx[k] * sScale + scroll, sy = T.bgy[k] * sScale + SH / 2;
        sx = ((sx % SW) + SW) % SW; sy = ((sy % SH) + SH) % SH;
        const si = ((sy | 0) * SW + (sx | 0)) * 3;
        r = st[si] * starK; g = st[si + 1] * starK; b = st[si + 2] * starK;
      }
      if (T.lr[k] > 0) { const c = sample(T.lr[k], T.lphi[k]), a = c[3] * T.lw[k]; r = r * (1 - a) + c[0] * T.lw[k] * 1.1; g = g * (1 - a) + c[1] * T.lw[k] * 1.1; b = b * (1 - a) + c[2] * T.lw[k] * 1.1; }
      const ring = T.ring[k]; if (ring > 0.001) { r += 255 * ring * 0.9; g += 200 * ring * 0.9; b += 150 * ring * 0.9; }
      if (T.pr[k] > 0) { const c = sample(T.pr[k], T.pphi[k]), a = c[3]; r = r * (1 - a) + c[0]; g = g * (1 - a) + c[1]; b = b * (1 - a) + c[2]; }
      const q = k * 4;
      // filmic roll-off so the hottest parts saturate to white instead of clipping
      d[q] = 255 * (1 - Math.exp(-r / 190)); d[q + 1] = 255 * (1 - Math.exp(-g / 190)); d[q + 2] = 255 * (1 - Math.exp(-b / 190)); d[q + 3] = 255;
    }
    s.g.putImageData(s.img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(s.cv, 0, 0, w, h);
    // bloom around the hot inner disc
    const R = Rs / f, cx = w / 2, cy = h / 2;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.18; ctx.drawImage(glow(pal === "quasar" ? "#9f8cff" : "#ffb070", 64, 0.2), cx - R * 5, cy - R * 2.2, R * 10, R * 4.4);
    if (p.jets === "jets") {
      for (const k of [-1, 1]) {
        const g = ctx.createLinearGradient(cx, cy, cx, cy + k * h * 0.55);
        g.addColorStop(0, "rgba(200,210,255,0.8)"); g.addColorStop(0.4, "rgba(140,160,255,0.25)"); g.addColorStop(1, "rgba(120,140,255,0)");
        ctx.fillStyle = g; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(cx - R * 0.08, cy); ctx.lineTo(cx - R * 0.35, cy + k * h * 0.55); ctx.lineTo(cx + R * 0.35, cy + k * h * 0.55); ctx.lineTo(cx + R * 0.08, cy); ctx.fill();
        for (let i = 0; i < 6; i++) { const e = ((t * 0.35 + i / 6) % 1), y = cy + k * (R * 0.9 + e * h * 0.5), r = R * (0.08 + e * 0.25); ctx.globalAlpha = (1 - e) * 0.6; ctx.drawImage(glow("#cfd8ff"), cx - r, y - r, r * 2, r * 2); }
      }
    }
    ctx.restore();
  },
};

// ================================================================== warp / hyperspace
DEEPSPACE.warp = {
  label: "Warp jump",
  params: {
    mode: { type: "select", options: ["jump", "cruise", "tunnel"], default: "jump", label: "Mode" },
    speed: { type: "range", min: 0.1, max: 4, step: 0.05, default: 1, label: "Speed" },
    color: { type: "color", default: "#9cc8ff", label: "Colour" },
    x: { type: "range", min: 0, max: 1, step: 0.01, default: 0.5, label: "Centre across" },
    y: { type: "range", min: 0, max: 1, step: 0.01, default: 0.5, label: "Centre down" },
    length: { type: "range", min: 5, max: 30, step: 0.5, default: 10, label: "Seconds per jump" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    dt = Math.min(dt, 0.05);
    if (s.t0 === undefined) s.t0 = t;
    const cx = p.x * w, cy = p.y * h, F = Math.max(w, h) * 0.6;
    // jump timeline: cruise, spool up, flash into the tunnel, flash out, slow down
    let v = 0.25, streak = 1, tunnel = 0, flash = 0;
    if (p.mode === "jump") {
      const L = p.length, e = ((t - s.t0) % L) / L;
      const spool = smooth(0.15, 0.4, e), out = smooth(0.72, 0.9, e);
      v = 0.25 + spool * 6 * (1 - out); streak = 1 + spool * 14 * (1 - out);
      tunnel = smooth(0.38, 0.42, e) * (1 - smooth(0.68, 0.72, e));
      flash = Math.exp(-(((e - 0.4) / 0.015) ** 2)) + 0.8 * Math.exp(-(((e - 0.7) / 0.015) ** 2));
    } else if (p.mode === "tunnel") { tunnel = 1; v = 5; streak = 10; }
    v *= p.speed;
    ctx.fillStyle = `rgba(0,0,0,${tunnel > 0.5 ? 0.6 : 1})`; ctx.fillRect(0, 0, w, h);
    const [cr, cg, cb] = hexToRgb(p.color);
    if (!s.st) s.st = Array.from({ length: 700 }, () => ({ x: rnd(1, -1), y: rnd(1, -1), z: rnd(1, 0.02), c: starColor(Math.random()) }));
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    if (tunnel < 0.99) for (const q of s.st) {
      const z0 = q.z;
      q.z -= v * dt * 0.35;
      if (q.z <= 0.01) { q.z = 1; q.x = rnd(1, -1); q.y = rnd(1, -1); continue; }
      const x = cx + (q.x / q.z) * F, y = cy + (q.y / q.z) * F;
      if (x < -50 || x > w + 50 || y < -50 || y > h + 50) { q.z = 1; q.x = rnd(1, -1); q.y = rnd(1, -1); continue; }
      const zt = Math.min(1, q.z + v * 0.012 * streak), x2 = cx + (q.x / zt) * F, y2 = cy + (q.y / zt) * F;
      const near = 1 - q.z, a = clamp(near * 1.3, 0, 1) * (1 - tunnel);
      ctx.strokeStyle = streak > 3 ? `rgba(${cr},${cg},${cb},${a})` : q.c; ctx.globalAlpha = streak > 3 ? 1 : a;
      ctx.lineWidth = Math.max(0.6, near * 2.6 * (Math.min(w, h) / 500));
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
    }
    // the tunnel: streaming radial filaments, rings rushing past, a bright vanishing point
    if (tunnel > 0) {
      const R = Math.hypot(w, h);
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * TAU + Math.sin(i * 12.9) * 0.05 + t * 0.4, ph = (t * 1.4 * p.speed + i * 0.37) % 1;
        const r0 = R * Math.pow(ph, 2.2) * 0.9, r1 = R * Math.pow(Math.min(1, ph + 0.18), 2.2) * 0.9;
        ctx.strokeStyle = i % 5 ? `rgb(${cr},${cg},${cb})` : "#ffffff"; ctx.globalAlpha = tunnel * ph * 0.6; ctx.lineWidth = Math.max(0.8, ph * Math.min(w, h) * 0.012);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a + 0.05) * r1, cy + Math.sin(a + 0.05) * r1); ctx.stroke();
      }
      for (let k = 0; k < 6; k++) { const e = (t * 0.8 * p.speed + k / 6) % 1, rr = R * e * e * 0.7; ctx.strokeStyle = `rgb(${cr},${cg},${cb})`; ctx.globalAlpha = tunnel * e * 0.25; ctx.lineWidth = Math.max(1, e * Math.min(w, h) * 0.02); ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.92, t * 0.3, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = tunnel; const vr = Math.min(w, h) * 0.12; ctx.drawImage(glow("#ffffff"), cx - vr, cy - vr, vr * 2, vr * 2);
    }
    ctx.restore();
    if (flash > 0.01) { ctx.fillStyle = `rgba(${Math.min(255, cr + 120)},${Math.min(255, cg + 120)},255,${Math.min(1, flash)})`; ctx.fillRect(0, 0, w, h); }
  },
};
