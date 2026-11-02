// Space pack, part 1: the Solar System. Same contract as effects.js:
// draw(ctx, w, h, t, dt, p, s, info): t = seconds, dt = frame delta, p = params,
// s = scratch state, info = the surface's real size (absent in tile previews).
//
// Planets, moons and the Sun are rendered per pixel from procedural textures (see
// space-gfx.js): real coastlines and city lights on Earth, maria and ray craters on
// the Moon, Olympus Mons and Valles Marineris on Mars, the Great Red Spot, Saturn's
// rings with the Cassini division and their shadows, and so on.
import { TAU, rnd, clamp, seeded, rgba, hexToRgb } from "./fx-util.js";
import { BODIES, bodyTex, planetView, axesFor, starfield, glow, drawSpikes, smooth, noise3 } from "./space-gfx.js";

export const SPACE = {};
const RAD = Math.PI / 180;
export const SKY = { type: "select", options: ["stars", "black", "transparent"], default: "stars", label: "Background" };
export function spaceBg(ctx, w, h, t, s, mode, opts) {
  if (mode === "transparent") { ctx.clearRect(0, 0, w, h); return; }
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  if (mode === "stars") starfield(ctx, w, h, t, s, opts);
}
const big = (w, h) => w * h > 40000; // full-size textures except in tile previews
const ease = (x) => x * x * (3 - 2 * x);

// A small lit sphere (moons, distant planets): dark disc, then the sunlit side.
// lx, ly: direction to the light in screen space (y down); lz: toward the viewer.
export function miniBody(ctx, x, y, r, color, lx, ly, lz = 0.3, opts = {}) {
  if (r < 0.3) return;
  const [cr, cg, cb] = hexToRgb(color);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.fillStyle = `rgb(${cr * 0.04 | 0},${cg * 0.04 | 0},${cb * 0.05 | 0})`; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const l = Math.hypot(lx, ly) || 1, k = 1 - clamp(lz, -1, 1); // how far the lit side has turned away
  const gx = x + (lx / l) * r * (0.15 + k * 0.85), gy = y + (ly / l) * r * (0.15 + k * 0.85);
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * (2.1 - k * 0.75));
  g.addColorStop(0, `rgb(${Math.min(255, cr * 1.15) | 0},${Math.min(255, cg * 1.15) | 0},${Math.min(255, cb * 1.15) | 0})`);
  g.addColorStop(0.55, `rgba(${cr},${cg},${cb},0.95)`); g.addColorStop(0.8, `rgba(${cr * 0.5 | 0},${cg * 0.5 | 0},${cb * 0.5 | 0},0.5)`); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (opts.bands) {
    ctx.globalCompositeOperation = "multiply";
    for (let i = 0; i < opts.bands.length; i++) { ctx.fillStyle = opts.bands[i]; ctx.fillRect(x - r, y - r + (i * 2 * r) / opts.bands.length, r * 2, (2 * r) / opts.bands.length + 0.5); }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}

// ================================================================== planet
const MOONS = {
  earth: [{ a: 3.4, r: 0.27, period: 46, col: "#c9c5bd", ph: 2 }],
  mars: [{ a: 1.8, r: 0.05, period: 7, col: "#8a7c6c", ph: 0 }, { a: 2.9, r: 0.035, period: 17, col: "#a39280", ph: 3 }],
  jupiter: [{ a: 1.6, r: 0.065, period: 9, col: "#f2d36a", ph: 1 }, { a: 2.05, r: 0.058, period: 18, col: "#ebe0cc", ph: 4 }, { a: 2.7, r: 0.09, period: 36, col: "#ab9d8a", ph: 2.5 }, { a: 3.5, r: 0.082, period: 84, col: "#72685c", ph: 5.5 }],
  saturn: [{ a: 3.1, r: 0.09, period: 44, col: "#e3a552", ph: 1 }, { a: 2.55, r: 0.032, period: 20, col: "#dddddd", ph: 4 }],
  uranus: [{ a: 2.6, r: 0.06, period: 22, col: "#b8b2aa", ph: 0 }, { a: 3.2, r: 0.06, period: 34, col: "#a6a09a", ph: 3 }],
  neptune: [{ a: 2.5, r: 0.1, period: -28, col: "#e8cfc6", ph: 2 }],
  pluto: [{ a: 2.7, r: 0.5, period: 34, col: "#a7a19b", ph: 1.2 }],
};
const PLANETS = ["earth", "moon", "mars", "jupiter", "saturn", "venus", "mercury", "uranus", "neptune", "pluto", "lava world"];

SPACE.planet = {
  label: "Planet",
  params: {
    body: { type: "select", options: PLANETS, default: "earth", label: "World" },
    size: { type: "range", min: 0.3, max: 1.2, step: 0.01, default: 0.84, label: "Size" },
    spin: { type: "range", min: 0, max: 5, step: 0.1, default: 1, label: "Spin speed" },
    sun: { type: "range", min: -180, max: 180, step: 1, default: 62, label: "Sun angle" },
    phases: { type: "select", options: ["fixed", "cycle"], default: "fixed", label: "Sunlight" },
    tilt: { type: "range", min: -45, max: 45, step: 1, default: 0, label: "Extra tilt" },
    moons: { type: "select", options: ["moons", "no moons"], default: "moons", label: "Moons" },
    glow: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "Atmosphere" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    const name = BODIES[p.body] ? p.body : "earth", B = BODIES[name];
    spaceBg(ctx, w, h, t, s, p.sky, { density: 0.8, seed: 21 });
    const tex = bodyTex(name, big(w, h));
    const tilt = B.tilt + p.tilt, ax = axesFor(tilt, B.pitch);
    // fit the planet, or its rings, inside the surface
    let ex = 1.09, ey = 1.09;
    if (B.ring) {
      const r = B.ring[1];
      ex = Math.max(ex, r * Math.hypot(ax.e1[0], ax.e3[0]) + 0.02); ey = Math.max(ey, r * Math.hypot(ax.e1[1], ax.e3[1]) + 0.02);
    }
    const R = Math.max(4, Math.min(w / 2 / ex, h / 2 / ey) * p.size), cx = w / 2, cy = h / 2;
    const ang = (p.sun + (p.phases === "cycle" ? t * 15 : 0)) * RAD, el = 0.12;
    const L = [Math.sin(ang) * Math.cos(el), Math.sin(el), Math.cos(ang) * Math.cos(el)];
    const halo = B.atmo ? (0.035 + 0.05 * B.atmoK) * Math.max(0.3, p.glow) : 0;
    const pv = planetView(s, "pv", w, h, cx, cy, R, { tilt, pitch: B.pitch, ring: B.ring, ringName: name, halo }, 200);
    // the Moon only librates; everything else turns
    const rot = name === "moon" ? 0.1 * Math.sin(t * 0.21) : t * B.spin * p.spin;
    const cloudRot = rot * (B.cloudSpin || 1) + t * 0.004 * p.spin;
    // moons: positions in planet radii, in the equatorial plane
    const moons = p.moons === "moons" ? (MOONS[name] || []).map((m) => {
      const a = (t * TAU) / m.period + m.ph, c = Math.cos(a), sn = Math.sin(a);
      const P = [m.a * (c * ax.e1[0] + sn * ax.e3[0]), m.a * (c * ax.e1[1] + sn * ax.e3[1]), m.a * (c * ax.e1[2] + sn * ax.e3[2])];
      return { ...m, P };
    }) : [];
    const drawMoon = (m) => miniBody(ctx, cx + m.P[0] * R, cy - m.P[1] * R, m.r * R, m.col, L[0], -L[1], L[2]);
    for (const m of moons) if (m.P[2] < 0) drawMoon(m);
    const cv = pv.view.draw(tex, B, { rot, cloudRot, L, atmoK: p.glow });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cv, 0, 0, w, h);
    // moon shadows crossing the disc (a transit), clipped to the planet
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    for (const m of moons) {
      const ml = m.P[0] * L[0] + m.P[1] * L[1] + m.P[2] * L[2], mm = m.P[0] ** 2 + m.P[1] ** 2 + m.P[2] ** 2, disc = ml * ml - mm + 1;
      if (disc < 0 || ml < 0) continue;
      const sd = ml - Math.sqrt(disc), S = [m.P[0] - sd * L[0], m.P[1] - sd * L[1], m.P[2] - sd * L[2]];
      if (S[2] <= 0) continue;
      const sx = cx + S[0] * R, sy = cy - S[1] * R, sr = m.r * R * 1.05;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, "rgba(0,0,0,0.92)"); g.addColorStop(0.75, "rgba(0,0,0,0.85)"); g.addColorStop(1, "rgba(0,0,0,0)");
      // foreshortened along the radius as the shadow nears the limb
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, sr * Math.max(0.3, S[2]), sr, Math.atan2(-S[1], S[0]), 0, TAU); ctx.fill();
    }
    ctx.restore();
    for (const m of moons) if (m.P[2] >= 0) drawMoon(m);
  },
};

// ================================================================== the Sun
const STAR_TYPES = {
  sun: { disc: [255, 196, 96], corona: "#fff1dc", prom: "#ff3c2a", chrom: "#ff4a3a" },
  "red dwarf": { disc: [255, 150, 80], corona: "#ffb07a", prom: "#ff3a1c", chrom: "#ff4a2a" },
  "blue giant": { disc: [190, 212, 255], corona: "#d6e4ff", prom: "#9fb6ff", chrom: "#b7c8ff" },
};
// A coronal streamer: a long, tapering, soft ray, drawn rotated around the star.
const streamers = new Map();
function streamerSprite(color) {
  if (streamers.has(color)) return streamers.get(color);
  const c = document.createElement("canvas"); c.width = 64; c.height = 256;
  const g = c.getContext("2d"), [r, gg, b] = hexToRgb(color);
  for (let y = 0; y < 256; y++) {
    const u = y / 255, wd = 30 * (1 - u) ** 0.7 + 2, a = (1 - u) ** 1.6;
    const gr = g.createLinearGradient(32 - wd, 0, 32 + wd, 0);
    gr.addColorStop(0, `rgba(${r},${gg},${b},0)`); gr.addColorStop(0.5, `rgba(${r},${gg},${b},${a})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = gr; g.fillRect(0, 255 - y, 64, 1);
  }
  streamers.set(color, c);
  return c;
}
// Prominences: arching loops of plasma anchored on the limb, with material draining
// along the field lines. Shared by the Sun and the eclipse.
// Prominences: arches of glowing hydrogen held up by magnetic fields. Each is a bundle
// of fine threads that wander apart and together, with knots of plasma draining down
// the legs. Seen against space they glow red; they are far fainter than the disc.
export function prominences(ctx, cx, cy, R, t, list, color, alpha = 1) {
  const spr = glow(color, 32, 0.3);
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
  for (const P of list) {
    const life = P.erupt ? clamp((t - P.t0) / P.dur, 0, 1) : 0;
    if (P.erupt && (life <= 0 || life >= 1)) continue;
    const grow = P.erupt ? 1 + life * 5 : 1 + 0.08 * Math.sin(t * 0.4 + P.ph);
    const fadeA = P.erupt ? Math.sin(life * Math.PI) : 1;
    for (let l = 0; l < P.loops; l++) {
      const off = (l - (P.loops - 1) / 2) * P.span * 0.35, hgt = P.h * grow * (1 - Math.abs(off) / (P.span * 1.2));
      const a0 = P.a - P.span + off * 0.6, a1 = P.a + P.span + off * 0.6;
      const pt = (u, strand) => {
        const wob = (noise3(u * 6 + strand * 1.7, t * 0.15 + P.ph, l, 31) - 0.5) * 0.35 + (strand - 3) * 0.05;
        const a = a0 + (a1 - a0) * u, rr = R * (0.995 + hgt * Math.sin(Math.PI * u) * (1 + wob));
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
      };
      // a faint diffuse glow, then the threads
      ctx.strokeStyle = color; ctx.globalAlpha = 0.05 * alpha * fadeA; ctx.lineWidth = Math.max(1, R * 0.06 * P.thick);
      ctx.beginPath(); for (let i = 0; i <= 24; i++) { const [x, y] = pt(i / 24, 3); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      ctx.lineWidth = Math.max(0.5, R * 0.006 * P.thick);
      for (let k = 0; k < 7; k++) {
        ctx.globalAlpha = (0.12 + 0.1 * Math.sin(k * 2.3 + t * 0.5)) * alpha * fadeA;
        ctx.beginPath(); for (let i = 0; i <= 32; i++) { const [x, y] = pt(i / 32, k); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        let u = (i / 12 + t * 0.04 * (l % 2 ? 1 : -1) + P.ph) % 1; if (u < 0) u += 1;
        const [x, y] = pt(u, i % 7), r = R * 0.02 * P.thick * (0.6 + 0.4 * Math.sin(i * 7.1 + t));
        ctx.globalAlpha = 0.3 * alpha * fadeA; ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
      }
    }
  }
  ctx.restore();
}
function makeProminences(rng, n, t0 = 0) {
  return Array.from({ length: n }, () => ({ a: rng() * TAU, span: 0.05 + rng() * 0.1, h: 0.05 + rng() * 0.12, loops: 2 + (rng() * 3 | 0), ph: rng() * 10, thick: 0.7 + rng() * 0.8, t0 }));
}

SPACE.sun = {
  label: "The Sun",
  params: {
    star: { type: "select", options: Object.keys(STAR_TYPES), default: "sun", label: "Star" },
    size: { type: "range", min: 0.2, max: 1.2, step: 0.01, default: 0.6, label: "Size" },
    activity: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "Activity" },
    corona: { type: "range", min: 0, max: 2, step: 0.05, default: 0.6, label: "Corona" },
    spin: { type: "range", min: 0, max: 5, step: 0.1, default: 1, label: "Spin speed" },
    flares: { type: "select", options: ["flares", "calm"], default: "flares", label: "Flares" },
    sky: { ...SKY, default: "black" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    const T = STAR_TYPES[p.star] || STAR_TYPES.sun, cx = w / 2, cy = h / 2;
    spaceBg(ctx, w, h, t, s, p.sky, { density: 0.5, seed: 33 });
    const R = Math.max(4, (Math.min(w, h) / 2) * 0.82 * p.size);
    if (!s.rays || s.raysFor !== p.star) {
      const rng = seeded(5);
      s.raysFor = p.star;
      s.rays = Array.from({ length: 70 }, () => ({ a: rng() * TAU, len: 0.6 + rng() * 2.4, wd: 0.25 + rng() * 0.7, al: 0.05 + rng() * 0.12, ph: rng() * TAU }));
      s.proms = makeProminences(rng, 7);
      s.flare = null; s.nextFlare = t + 3 + rng() * 4;
    }
    // corona: a soft glow plus slowly breathing streamers
    const cg = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * (2.2 + p.corona));
    cg.addColorStop(0, rgba(T.corona, 0.55 * Math.min(1, p.corona))); cg.addColorStop(0.15, rgba(T.corona, 0.18 * p.corona)); cg.addColorStop(1, rgba(T.corona, 0));
    ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h);
    if (p.corona > 0) {
      const spr = streamerSprite(T.corona);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const r of s.rays) {
        const len = R * r.len * (0.85 + 0.15 * Math.sin(t * 0.3 + r.ph)) * p.corona, wd = R * r.wd;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(r.a + Math.sin(t * 0.05 + r.ph) * 0.03);
        ctx.globalAlpha = r.al * Math.min(1.5, p.corona); ctx.drawImage(spr, -wd / 2, -R * 0.95 - len, wd, len);
        ctx.restore();
      }
      ctx.restore();
    }
    // prominences on the limb (more with activity), and an eruption during a flare
    const nP = Math.round(s.proms.length * Math.min(1, p.activity));
    prominences(ctx, cx, cy, R, t, s.proms.slice(0, nP), T.prom, Math.min(1.4, 0.4 + p.activity * 0.6));
    if (p.flares === "flares" && p.activity > 0 && t > s.nextFlare && !s.flare) {
      const a = rnd(TAU);
      s.flare = { t0: t, a, r: rnd(0.75, 0.45), dur: 6 };
      s.erupt = [{ a, span: 0.12, h: 0.2, loops: 2, ph: rnd(10), thick: 1.3, erupt: true, t0: t + 0.6, dur: 7 }];
      s.nextFlare = t + rnd(18, 8) / p.activity;
    }
    if (s.erupt) prominences(ctx, cx, cy, R, t, s.erupt, T.prom, 1.2);
    // the photosphere: two granulation layers turning at slightly different speeds (boiling)
    const b = big(w, h);
    const pv = planetView(s, "sv", w, h, cx, cy, R, { tilt: 7, pitch: 0.1, halo: 0.03 }, 200);
    const rot = t * 0.025 * p.spin;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(pv.view.draw(bodyTex("sun", b), BODIES.sun, { rot, L: [0, 0, 1], tint: T.disc, exposure: 1.12 }), 0, 0, w, h);
    ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t * 0.7);
    ctx.drawImage(pv.view.draw(bodyTex("sun2", b), BODIES.sun2, { rot: rot * 1.4 + Math.sin(t * 0.13) * 0.02, L: [0, 0, 1], tint: T.disc, exposure: 1.12 }), 0, 0, w, h);
    ctx.globalAlpha = 1;
    // chromosphere: a thin ragged rim of spicules
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = T.chrom;
    ctx.globalAlpha = 0.22; ctx.lineWidth = Math.max(1, R * 0.012); ctx.beginPath(); ctx.arc(cx, cy, R * 1.003, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(0.5, R * 0.004); ctx.globalAlpha = 0.1; ctx.beginPath();
    const nsp = Math.round(Math.min(360, R * 2));
    for (let i = 0; i < nsp; i++) {
      const a = (i / nsp) * TAU, l = R * (0.006 + 0.012 * noise3(i * 0.31, t * 0.8, 0.5, 4));
      ctx.moveTo(cx + Math.cos(a) * R * 0.995, cy + Math.sin(a) * R * 0.995); ctx.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l));
    }
    ctx.stroke(); ctx.restore();
    // a flare: a brightening on the disc, a white-light flash and an expanding shock
    if (s.flare) {
      const e = (t - s.flare.t0) / s.flare.dur;
      if (e > 1) { s.flare = null; s.erupt = null; }
      else {
        const fx = cx + Math.cos(s.flare.a) * R * s.flare.r, fy = cy + Math.sin(s.flare.a) * R * s.flare.r;
        const I = e < 0.08 ? e / 0.08 : Math.exp(-(e - 0.08) * 5);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = I; ctx.drawImage(glow("#ffffff"), fx - R * 0.25, fy - R * 0.25, R * 0.5, R * 0.5);
        ctx.globalAlpha = I * 0.5; ctx.drawImage(glow("#fff6d8"), fx - R * 0.8, fy - R * 0.8, R * 1.6, R * 1.6);
        ctx.globalAlpha = I * 0.12; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        // coronal mass ejection: a bright expanding front leaving the limb
        const ce = clamp((e - 0.1) / 0.9, 0, 1);
        if (ce > 0) {
          const rr = R * (1.05 + ce * 2.4), a = s.flare.a;
          ctx.globalAlpha = (1 - ce) * 0.6; ctx.strokeStyle = T.corona; ctx.lineWidth = R * 0.05 * (1 - ce * 0.5);
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * ce * 1.2, cy + Math.sin(a) * R * ce * 1.2, rr * 0.55, a - 1, a + 1); ctx.stroke();
          ctx.lineWidth = R * 0.15; ctx.globalAlpha = (1 - ce) * 0.15; ctx.stroke();
        }
        ctx.restore();
      }
    }
  },
};

// ================================================================== total solar eclipse
// One cycle: first contact, the crescent sun, Baily's beads, the diamond ring, totality
// with the corona and pink prominences, the second diamond ring, then the egress.
function coronaCanvas(R, color) {
  const size = Math.ceil(R * 7), c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), cx = size / 2, rng = seeded(12), [r, gg, b] = hexToRgb(color);
  g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(cx, cx, R, cx, cx, R * 3.3);
  gr.addColorStop(0, `rgba(${r},${gg},${b},0.85)`); gr.addColorStop(0.04, `rgba(${r},${gg},${b},0.4)`); gr.addColorStop(0.18, `rgba(${r},${gg},${b},0.1)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const spr = streamerSprite(color);
  // equatorial helmet streamers: long and broad; polar plumes: short, fine and many
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 0 : Math.PI, a = side + (rng() - 0.5) * 1.1 + 0.15, len = R * (1.2 + rng() * 2.1), wd = R * (0.5 + rng() * 0.9);
    g.save(); g.translate(cx, cx); g.rotate(a + Math.PI / 2); g.globalAlpha = 0.18 + rng() * 0.2; g.drawImage(spr, -wd / 2, -R * 0.95 - len, wd, len); g.restore();
  }
  for (let i = 0; i < 70; i++) {
    const pole = i % 2 ? -Math.PI / 2 : Math.PI / 2, a = pole + (rng() - 0.5) * 1.3, len = R * (0.35 + rng() * 0.7), wd = R * (0.05 + rng() * 0.08);
    g.save(); g.translate(cx, cx); g.rotate(a + Math.PI / 2); g.globalAlpha = 0.2 + rng() * 0.25; g.drawImage(spr, -wd / 2, -R * 0.98 - len, wd, len); g.restore();
  }
  for (let i = 0; i < 140; i++) {
    const a = rng() * TAU, len = R * (0.15 + rng() * 0.5), wd = R * (0.04 + rng() * 0.12);
    g.save(); g.translate(cx, cx); g.rotate(a); g.globalAlpha = 0.12 + rng() * 0.2; g.drawImage(spr, -wd / 2, -R * 0.98 - len, wd, len); g.restore();
  }
  return c;
}
// the Moon's limb is not smooth: mountains and valleys let the last sunlight through as beads
const limb = (a) => 1 - 0.006 * (noise3(Math.cos(a) * 9, Math.sin(a) * 9, 0.5, 71) * 0.7 + noise3(Math.cos(a) * 31, Math.sin(a) * 31, 0.5, 72) * 0.3);

SPACE.eclipse = {
  label: "Total eclipse",
  params: {
    length: { type: "range", min: 15, max: 180, step: 1, default: 40, label: "Seconds per eclipse" },
    totality: { type: "range", min: 0.1, max: 0.6, step: 0.01, default: 0.3, label: "Totality share" },
    size: { type: "range", min: 0.2, max: 1, step: 0.01, default: 0.42, label: "Size" },
    sky: { type: "select", options: ["day sky", "black"], default: "day sky", label: "Sky" },
    horizon: { type: "select", options: ["hills", "none"], default: "hills", label: "Horizon" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    if (s.t0 === undefined) s.t0 = t;
    const T = Math.max(5, info ? p.length : 14), u = (((t - s.t0) / T) % 1 + 1) % 1;
    const R = Math.max(4, (Math.min(w, h) / 2) * p.size), Rm = R * 1.035, cx = w * 0.5, cy = h * 0.42;
    // Moon position: slows through mid-eclipse so totality lasts its share of the cycle
    const half = p.totality / 2, d = Math.abs(u - 0.5), sgn = u < 0.5 ? 1 : -1;
    const off = d < half ? (d / half) * (Rm - R) * 0.9 : (Rm - R) * 0.9 + Math.pow((d - half) / (0.5 - half), 1.15) * (R + Rm) * 1.12;
    const mx = cx + sgn * off * 0.94, my = cy + sgn * off * 0.34;
    const sep = Math.hypot(mx - cx, my - cy);
    // uncovered fraction of the disc (area of circle overlap), drives the sky
    let cover = 0;
    if (sep < R + Rm) {
      if (sep <= Rm - R) cover = 1;
      else {
        const a1 = Math.acos(clamp((sep * sep + R * R - Rm * Rm) / (2 * sep * R), -1, 1)), a2 = Math.acos(clamp((sep * sep + Rm * Rm - R * R) / (2 * sep * Rm), -1, 1));
        cover = (R * R * (a1 - Math.sin(2 * a1) / 2) + Rm * Rm * (a2 - Math.sin(2 * a2) / 2)) / (Math.PI * R * R);
      }
    }
    const lit = 1 - cover, dayK = p.sky === "day sky" ? Math.pow(lit, 0.45) : 0, total = sep <= (Rm - R) * 0.999 ? 1 : 0;
    // sky: daylight blue darkening to a deep twilight with a sunset glow all round the horizon
    const top = [10 + 30 * dayK, 22 + 80 * dayK, 48 + 140 * dayK], bot = [30 + 80 * dayK, 40 + 120 * dayK, 70 + 140 * dayK];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgb(${top.map((v) => v * 0.9 | 0)})`); g.addColorStop(0.75, `rgb(${bot.map((v) => v * 0.9 | 0)})`);
    const glowK = (1 - dayK) * (p.sky === "day sky" ? 1 : 0.5);
    g.addColorStop(0.9, `rgb(${Math.min(255, bot[0] + 150 * glowK) | 0},${Math.min(255, bot[1] + 70 * glowK) | 0},${Math.min(255, bot[2] + 10 * glowK) | 0})`);
    g.addColorStop(1, `rgb(${Math.min(255, bot[0] + 190 * glowK) | 0},${Math.min(255, bot[1] + 110 * glowK) | 0},${bot[2] | 0})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // stars and planets come out in the darkness
    const starK = smooth(0.25, 0.02, dayK) * (p.sky === "day sky" ? 1 : 1);
    if (starK > 0.01) {
      starfield(ctx, w, h * 0.85, t, s, { density: 0.25, seed: 51, bright: starK * 0.9 });
      ctx.globalCompositeOperation = "lighter";
      for (const [x, y, r, col] of [[0.2, 0.62, 2.4, "#fff8e8"], [0.82, 0.18, 1.6, "#ffe9c8"], [0.66, 0.7, 1.1, "#ffd0a8"]]) { const rr = r * Math.max(1, Math.min(w, h) / 300); ctx.globalAlpha = starK; ctx.drawImage(glow(col), w * x - rr * 4, h * y - rr * 4, rr * 8, rr * 8); }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    // the corona and prominences, visible in totality and fading in just around it
    const coronaK = smooth(0.05, 0.004, lit);
    if (coronaK > 0) {
      if (!s.cor || s.corR !== Math.round(R)) { s.corR = Math.round(R); s.cor = coronaCanvas(R, "#f4f1ff"); s.proms = makeProminences(seeded(3), 6); }
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = coronaK * 0.75;
      ctx.translate(cx, cy); ctx.rotate(0.35); ctx.drawImage(s.cor, -s.cor.width / 2, -s.cor.height / 2); ctx.restore();
      prominences(ctx, cx, cy, R, t, s.proms, "#ff3f6a", coronaK * 0.9);
    }
    // the photosphere (whatever the Moon doesn't hide)
    if (lit > 0) {
      ctx.save();
      const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      sg.addColorStop(0, "#fffdf6"); sg.addColorStop(0.7, "#fff6e0"); sg.addColorStop(0.93, "#ffe2b0"); sg.addColorStop(1, "#ffc888");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, lit * 3) * (0.5 + 0.5 * dayK);
      ctx.drawImage(glow("#fff4dc"), cx - R * 3, cy - R * 3, R * 6, R * 6);
      ctx.restore();
    }
    // the Moon, with a mountainous limb. Its night side is lit only by a faint sky, so
    // against the daylight sky it is all but invisible: you see it only where it bites
    // into the Sun, plus a slight darkening of the sky around that.
    const moonPath = () => { ctx.beginPath(); for (let i = 0; i <= 360; i++) { const a = (i / 360) * TAU, r = Rm * limb(a); i ? ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r) : ctx.moveTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); } };
    ctx.save();
    if (!total) { ctx.beginPath(); ctx.arc(cx, cy, R * 1.004, 0, TAU); ctx.clip(); }
    ctx.fillStyle = "#020306"; moonPath(); ctx.fill();
    ctx.restore();
    if (!total) { ctx.globalAlpha = 0.02 + 0.08 * (1 - dayK); ctx.fillStyle = "#000"; moonPath(); ctx.fill(); ctx.globalAlpha = 1; }
    if (total) { ctx.globalAlpha = 0.06; ctx.drawImage(glow("#7d8fb0"), mx - Rm, my - Rm, Rm * 2, Rm * 2); ctx.globalAlpha = 1; } // earthshine
    // Baily's beads and the diamond ring: sunlight through lunar valleys
    if (lit > 0 && lit < 0.02) {
      const beads = [];
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * TAU, r = Rm * limb(a), x = mx + Math.cos(a) * r, y = my + Math.sin(a) * r, inside = R - Math.hypot(x - cx, y - cy);
        if (inside > 0) beads.push([x, y, inside]);
      }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      let best = null;
      for (const [x, y, k] of beads) { const r = R * (0.03 + Math.min(0.06, (k / R) * 6)); ctx.globalAlpha = 0.6; ctx.drawImage(glow("#fffaf0"), x - r * 2, y - r * 2, r * 4, r * 4); if (!best || k > best[2]) best = [x, y, k]; }
      if (best) {
        const ring = smooth(0.02, 0.0005, lit) * smooth(0, 0.0012, lit);
        const r = R * (0.25 + 0.5 * ring);
        ctx.globalAlpha = 0.9; ctx.drawImage(glow("#ffffff"), best[0] - r, best[1] - r, r * 2, r * 2);
        drawSpikes(ctx, best[0], best[1], R * (0.5 + ring * 1.2), "#ffffff", 0.6 + ring * 0.4, "jwst");
        ctx.globalAlpha = 0.35 * ring; ctx.lineWidth = R * 0.02; ctx.strokeStyle = "#fff3e8";
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.01, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    // a black horizon so the sky glow has something to sit on
    if (p.horizon === "hills") {
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(2, w / 120)) ctx.lineTo(x, h * (0.9 - 0.05 * noise3(x / w * 4, 0.5, 0.5, 81) - 0.02 * noise3(x / w * 16, 0.5, 0.5, 82)));
      ctx.lineTo(w, h); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

// ================================================================== Earth from orbit
// The view from a space station window: the curved limb, the thin blue atmosphere,
// clouds and coastlines sliding past, then an orbital sunset, city lights, lightning
// in the storms, airglow and aurora, and the sunrise over the limb.
SPACE.orbit = {
  label: "Earth from orbit",
  params: {
    speed: { type: "range", min: 0, max: 4, step: 0.1, default: 1, label: "Orbit speed" },
    day: { type: "range", min: 20, max: 240, step: 5, default: 70, label: "Seconds per orbit" },
    cities: { type: "range", min: 0, max: 2, step: 0.05, default: 1, label: "City lights" },
    aurora: { type: "select", options: ["aurora", "no aurora"], default: "aurora", label: "Aurora" },
    storms: { type: "select", options: ["lightning", "calm"], default: "lightning", label: "Storms" },
    window: { type: "select", options: ["none", "porthole"], default: "none", label: "Window" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    // seen from a high orbit: a wide arc of the planet, so the texture holds its detail
    const R = Math.max(w, h) * 1.05, cx = w * 0.5, limbY = h * 0.42, cy = limbY + R;
    // the Sun goes round once per orbit: night, sunrise over the limb, day, sunset behind
    const ph = (((t / p.day) % 1) + 1) % 1, a = (1.5 - ph) * TAU;
    const L = [0.18, Math.sin(a), Math.cos(a)], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const dayK = smooth(-0.1, 0.35, L[1] + L[2] * 0.3);
    // stars above the limb, washed out by day
    starfield(ctx, w, limbY, t, s, { density: 0.7, seed: 61, bright: 1 - dayK * 0.9 });
    const B = BODIES.earth, pv = planetView(s, "ov", w, h, cx, cy, R, { tilt: 58, pitch: 0.5, halo: 0.022 }, Math.max(60, R * 0.8));
    const rot = t * 0.02 * p.speed;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pv.view.draw(bodyTex("earth", big(w, h) ? 2 : 0), B, { rot, cloudRot: rot * 1.05, L, atmoK: 0.8, nightK: p.cities * 1.3 }), 0, 0, w, h);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    // thin layered atmosphere along the limb (the arc is nearly flat, so a strip will do)
    const arcY = (x) => cy - Math.sqrt(R * R - (x - cx) ** 2);
    const band = (dy, wd, col, al) => {
      if (al <= 0.003) return;
      ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = wd; ctx.beginPath();
      for (let x = -10; x <= w + 10; x += w / 40) { const y = arcY(x) - dy; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    };
    const u = Math.min(w, h) / 100;
    band(u * 0.4, u * 1.4, "#4f8cff", dayK * 0.5); band(u * 0.1, u * 0.5, "#bcd6ff", dayK * 0.6);
    band(u * 1.3, u * 0.5, "#4dff8a", (1 - dayK) * 0.35); // green airglow layer at night
    // sunrise and sunset: a rainbow of layers at the limb, centred under the Sun
    const behind = smooth(0.1, -0.5, L[2]), sunUp = Math.exp(-(((L[1] - 0.02) / 0.22) ** 2)) * behind;
    const sx = cx + L[0] * w * 2.2;
    if (sunUp > 0.01) {
      for (const [dy, wd, col, k] of [[0, 3.2, "#ff3c10", 0.8], [u * 0.9, 2.2, "#ff9a30", 0.7], [u * 1.7, 1.6, "#fff0a0", 0.45], [u * 2.6, 2.6, "#4f8cff", 0.6]]) {
        const gr = ctx.createRadialGradient(sx, limbY, 0, sx, limbY, w * 0.7);
        gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = gr; ctx.globalAlpha = sunUp * k; ctx.lineWidth = u * wd; ctx.beginPath();
        for (let x = -10; x <= w + 10; x += w / 40) { const y = arcY(x) - dy; x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // the Sun itself, flattened and reddened as it sits on the limb
      const sy = limbY - (L[1] - 0.02) * h * 1.6, flat = clamp(0.4 + (limbY - sy) / (u * 8), 0.4, 1);
      if (sy < limbY + u * 2) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, arcY(sx) + 1); ctx.clip();
        const r = u * 2.6;
        ctx.globalAlpha = sunUp; ctx.drawImage(glow("#fff6e0"), sx - r * 6, sy - r * 6 * flat, r * 12, r * 12 * flat);
        ctx.fillStyle = flat < 0.8 ? "#ffd9a0" : "#ffffff"; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * flat, 0, 0, TAU); ctx.fill();
        drawSpikes(ctx, sx, sy, r * 10 * sunUp, "#fff7e8", 0.8 * sunUp, "jwst");
        ctx.restore();
      }
    }
    // aurora: curtains standing on the night side near the limb
    const night = 1 - dayK;
    if (p.aurora === "aurora" && night > 0.05) {
      // a soft curtain sprite, drawn in many overlapping slices whose height and brightness ripple
      if (!s.aurSpr) {
        const c = document.createElement("canvas"); c.width = 16; c.height = 128; const g = c.getContext("2d");
        const gr = g.createLinearGradient(0, 128, 0, 0);
        gr.addColorStop(0, "rgba(80,255,140,0)"); gr.addColorStop(0.08, "rgba(90,255,150,1)"); gr.addColorStop(0.45, "rgba(60,220,140,0.35)"); gr.addColorStop(0.8, "rgba(190,70,170,0.12)"); gr.addColorStop(1, "rgba(190,70,170,0)");
        g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
        const hg = g.createLinearGradient(0, 0, 16, 0); hg.addColorStop(0, "rgba(0,0,0,1)"); hg.addColorStop(0.5, "rgba(0,0,0,0)"); hg.addColorStop(1, "rgba(0,0,0,1)");
        g.globalCompositeOperation = "destination-out"; g.fillStyle = hg; g.fillRect(0, 0, 16, 128);
        s.aurSpr = c;
      }
      const n = 180, sw = (w / n) * 3;
      for (let i = 0; i < n; i++) {
        const fx = i / n, x = fx * w, base = arcY(x) + u * 2 + u * 1.2 * Math.sin(fx * 7 + t * 0.35);
        const ripple = 0.5 + 0.5 * Math.sin(fx * 31 + t * 1.1) * Math.sin(fx * 11 - t * 0.6);
        const ht = u * 10 * (0.55 + 0.45 * Math.sin(fx * 5 + t * 0.25 + 1)) * (0.8 + 0.4 * ripple);
        // the auroral oval only reaches the limb over the polar regions: one drifting patch
        const ac = 0.62 + 0.18 * Math.sin(t * 0.013), env = Math.exp(-(((fx - ac) / 0.16) ** 2)) * (0.5 + 0.5 * Math.sin(fx * 9 - t * 0.2));
        ctx.globalAlpha = night * env * (0.12 + 0.18 * ripple); ctx.drawImage(s.aurSpr, x - sw / 2, base - ht, sw, ht);
      }
    }
    // lightning flickering inside storm clouds on the night side
    if (p.storms === "lightning" && night > 0.3) {
      if (!s.bolt || t > s.bolt.end + s.bolt.gap) s.bolt = { x: rnd(0.95, 0.05) * w, y: limbY + rnd(0.45, 0.06) * h, t0: t, end: t + rnd(0.7, 0.25), gap: rnd(2.5, 0.3), seed: rnd(1000) };
      const b = s.bolt;
      if (t < b.end) {
        // a storm cell lighting up from inside: several cloud tops flicker in turn, flattened by perspective
        const persp = 0.35 + 0.65 * clamp((b.y - limbY) / (h - limbY), 0, 1), r0 = u * (1.5 + 4 * persp);
        for (let k = 0; k < 5; k++) {
          const on = Math.sin((t - b.t0) * (50 + k * 13) + b.seed + k * 2.1) > 0.35 ? 1 : 0.15;
          const ox = Math.sin(b.seed + k * 2.7) * r0 * 1.6, oy = Math.cos(b.seed * 1.3 + k * 1.9) * r0 * 0.6 * persp, r = r0 * (0.5 + 0.5 * Math.abs(Math.sin(b.seed + k)));
          ctx.globalAlpha = night * on * 0.6; ctx.drawImage(glow("#dce8ff"), b.x + ox - r, b.y + oy - r * persp, r * 2, r * 2 * persp);
        }
      }
    }
    ctx.restore();
    // a porthole: everything outside the glass goes black, with a faint bolted frame
    if (p.window === "porthole") {
      const pr = Math.min(w, h) * 0.47;
      ctx.save(); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(w / 2, h / 2, pr, 0, TAU, true); ctx.fill("evenodd");
      ctx.strokeStyle = "#2a2d33"; ctx.lineWidth = pr * 0.06; ctx.beginPath(); ctx.arc(w / 2, h / 2, pr * 1.03, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#3a3e46";
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * pr * 1.03, h / 2 + Math.sin(a) * pr * 1.03, pr * 0.012, 0, TAU); ctx.fill(); }
      const gl = ctx.createLinearGradient(w / 2 - pr, h / 2 - pr, w / 2 + pr, h / 2 + pr);
      gl.addColorStop(0.2, "rgba(255,255,255,0.05)"); gl.addColorStop(0.35, "rgba(255,255,255,0)");
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(w / 2, h / 2, pr, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

// ================================================================== the Solar System (orrery)
const ORBITS = [
  // name, a (AU), period (years), size, colour, extra
  ["Mercury", 0.387, 0.241, 0.75, "#a8a39c"], ["Venus", 0.723, 0.615, 1.25, "#e8d3a0"], ["Earth", 1, 1, 1.3, "#5d8fd6", "earth"], ["Mars", 1.524, 1.881, 1, "#c8643c", "mars"],
  ["Jupiter", 5.203, 11.86, 3.4, "#d8b48a", "jupiter"], ["Saturn", 9.537, 29.45, 2.9, "#e3cf98", "saturn"], ["Uranus", 19.19, 84.02, 2, "#a6dde4", "uranus"], ["Neptune", 30.07, 164.8, 1.95, "#4a78e0"],
];
const orbitR = (a) => 0.11 + 0.89 * (Math.sqrt(a) - Math.sqrt(0.387)) / (Math.sqrt(30.07) - Math.sqrt(0.387));

SPACE.solarsystem = {
  label: "Solar System",
  params: {
    speed: { type: "range", min: 0, max: 5, step: 0.05, default: 1, label: "Speed" },
    tilt: { type: "range", min: 0, max: 85, step: 1, default: 64, label: "View tilt" },
    sizes: { type: "range", min: 0.4, max: 3, step: 0.05, default: 1, label: "Planet size" },
    labels: { type: "select", options: ["labels", "no labels"], default: "labels", label: "Names" },
    orbits: { type: "select", options: ["orbits", "trails", "none"], default: "orbits", label: "Orbits" },
    extras: { type: "select", options: ["belt & comet", "belt", "none"], default: "belt & comet", label: "Extras" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    spaceBg(ctx, w, h, t, s, p.sky, { density: 0.6, seed: 71 });
    const ci = Math.cos(p.tilt * RAD), cx = w / 2, cy = h / 2;
    const S = Math.min(w * 0.47, (h * 0.45) / Math.max(0.12, ci)), u = Math.max(0.6, Math.min(w, h) / 110) * p.sizes;
    const yrs = t * p.speed / 12; // one Earth year every 12 seconds at speed 1
    const pos = (r, ang) => [cx + Math.cos(ang) * r * S, cy + Math.sin(ang) * r * S * ci, Math.sin(ang)];
    // orbits and trails
    if (p.orbits !== "none") {
      ctx.lineWidth = Math.max(0.5, u * 0.12);
      for (const [, a, per, , col] of ORBITS) {
        const r = orbitR(a);
        if (p.orbits === "orbits") { ctx.strokeStyle = "rgba(140,170,220,0.22)"; ctx.beginPath(); ctx.ellipse(cx, cy, r * S, r * S * ci, 0, 0, TAU); ctx.stroke(); }
        const ang = (yrs / per) * TAU + a * 7;
        ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = Math.max(0.8, u * 0.3);
        ctx.beginPath(); ctx.ellipse(cx, cy, r * S, r * S * ci, 0, ang - 0.7, ang); ctx.stroke();
        ctx.lineWidth = Math.max(0.5, u * 0.12);
      }
    }
    const items = [];
    for (const [name, a, per, sz, col, kind] of ORBITS) {
      const ang = (yrs / per) * TAU + a * 7, [x, y, z] = pos(orbitR(a), ang);
      items.push({ z, draw: () => planetDot(ctx, x, y, sz * u, col, kind, cx, cy, t, ci, name, p.labels === "labels" && Math.min(w, h) > 150 ? u : 0) });
    }
    if (p.extras !== "none") {
      if (!s.belt) { const r = seeded(8); s.belt = Array.from({ length: 900 }, () => { const a = 2.15 + r() * 1.2; return { a, ph: r() * TAU, rr: orbitR(a) + (r() - 0.5) * 0.012, b: 0.3 + r() * 0.7 }; }); }
      ctx.fillStyle = "#b7a68e";
      for (const b of s.belt) {
        const ang = b.ph + (yrs / Math.pow(b.a, 1.5)) * TAU, x = cx + Math.cos(ang) * b.rr * S, y = cy + Math.sin(ang) * b.rr * S * ci;
        ctx.globalAlpha = 0.25 + 0.5 * b.b; ctx.fillRect(x, y, Math.max(0.7, u * 0.18), Math.max(0.7, u * 0.18));
      }
      ctx.globalAlpha = 1;
      if (p.extras === "belt & comet") {
        // a Halley-type comet: Kepler's equation makes it whip round the Sun
        const e = 0.92, aC = 14, M = ((yrs / 52.4) % 1) * TAU; let E = M;
        for (let i = 0; i < 12; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        const xr = aC * (Math.cos(E) - e), yr = aC * Math.sqrt(1 - e * e) * Math.sin(E), dist = Math.hypot(xr, yr), th = Math.atan2(yr, xr) + 2.2;
        const rr = orbitR(Math.max(0.39, dist)) * (dist < 0.39 ? dist / 0.39 : 1), [x, y, z] = pos(rr, th);
        items.push({ z, draw: () => {
          const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1, len = u * 34 / Math.max(0.6, dist) ** 0.9;
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const gr = ctx.createLinearGradient(x, y, x + (dx / l) * len, y + (dy / l) * len);
          gr.addColorStop(0, "rgba(200,230,255,0.7)"); gr.addColorStop(1, "rgba(120,170,255,0)");
          ctx.strokeStyle = gr; ctx.lineWidth = u * 0.6; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dx / l) * len, y + (dy / l) * len); ctx.stroke();
          ctx.globalAlpha = 0.9; ctx.drawImage(glow("#cfffe0"), x - u * 1.5, y - u * 1.5, u * 3, u * 3);
          ctx.restore();
        } });
      }
    }
    // the Sun sits between the far and near halves of each orbit
    items.push({ z: 0, draw: () => {
      const r = u * 4.2;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(glow("#ffcf6a"), cx - r * 4, cy - r * 4, r * 8, r * 8);
      ctx.globalAlpha = 0.25 + 0.05 * Math.sin(t * 2);
      ctx.drawImage(glow("#ff9a2e"), cx - r * 8, cy - r * 8, r * 16, r * 16);
      ctx.restore();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "#fffbe8"); g.addColorStop(0.75, "#ffe39a"); g.addColorStop(1, "#ffb347");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    } });
    items.sort((a, b) => a.z - b.z).forEach((it) => it.draw());
  },
};
const BANDS = {
  jupiter: ["#fff", "#c79a74", "#fff", "#b07a54", "#fff", "#e0c8a8", "#fff"],
  saturn: ["#fff", "#e9dbb8", "#fff", "#d8c18c", "#fff"],
};
function planetDot(ctx, x, y, r, col, kind, sx, sy, t, ci, name, labelU) {
  const lx = sx - x, ly = sy - y;
  const ring = kind === "saturn" || kind === "uranus";
  const rx = r * (kind === "uranus" ? 0.5 : 2.3), ry = kind === "uranus" ? r * 2 : r * 2.3 * Math.max(0.12, ci * 0.6 + 0.1);
  const ringArc = (a0, a1) => { ctx.strokeStyle = kind === "uranus" ? "rgba(170,200,210,0.35)" : "rgba(226,206,160,0.85)"; ctx.lineWidth = Math.max(0.6, r * (kind === "uranus" ? 0.1 : 0.45)); ctx.beginPath(); ctx.ellipse(x, y, rx * 0.82, ry * 0.82, 0, a0, a1); ctx.stroke(); };
  if (ring) ringArc(Math.PI, TAU);
  miniBody(ctx, x, y, r, col, lx, ly, 0.2, { bands: BANDS[kind] });
  if (kind === "mars") { ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.ellipse(x, y - r * 0.82, r * 0.35, r * 0.15, 0, 0, TAU); ctx.fill(); }
  if (kind === "earth") {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip(); ctx.globalAlpha = 0.6; ctx.fillStyle = "#4f8a3a";
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.1, r * 0.35, r * 0.55, 0.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + r * 0.4, y + r * 0.2, r * 0.3, r * 0.4, -0.3, 0, TAU); ctx.fill(); ctx.restore();
    const ma = t * 1.3, mxp = x + Math.cos(ma) * r * 2.6, myp = y + Math.sin(ma) * r * 2.6 * Math.max(0.2, ci);
    miniBody(ctx, mxp, myp, Math.max(0.6, r * 0.3), "#cfcac0", sx - mxp, sy - myp, 0.2);
  }
  if (kind === "jupiter") for (let i = 0; i < 4; i++) { const a = t * (2.2 / (i + 1)) + i * 1.7, d = r * (1.6 + i * 0.55); ctx.fillStyle = ["#f0d36a", "#e8dcc6", "#b0a28c", "#7a6f62"][i]; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * Math.max(0.15, ci), Math.max(0.5, r * 0.12), 0, TAU); ctx.fill(); }
  if (ring) ringArc(0, Math.PI);
  if (labelU) {
    ctx.font = `${Math.max(8, labelU * 1.7) | 0}px system-ui, sans-serif`; ctx.fillStyle = "rgba(200,215,240,0.75)"; ctx.textAlign = "center";
    ctx.fillText(name, x, y + r + (ring ? ry * 0.6 : 0) + labelU * 2.2);
  }
}

// ================================================================== comet
// Emit and age the comet's particles (positions are in tail units along and across).
function cometStep(s, dt, p) {
  // dust leaves slowly and is pushed into a broad curved fan; ions stream straight out
  const nd = Math.round(110 * dt + Math.random()), ni = Math.round(120 * dt + Math.random());
  for (let i = 0; i < nd; i++) s.dust.push({ u: 0, v: rnd(0.035, -0.035), vu: rnd(0.08, 0.02), beta: rnd(1, 0.15), age: 0, life: rnd(10, 6), b: rnd(1, 0.4) });
  if (p.ion === "dust & ion") for (let i = 0; i < ni; i++) s.ions.push({ u: 0, v: rnd(0.008, -0.008) + (Math.random() < 0.4 ? rnd(0.05, -0.05) : 0), ph: rnd(TAU), age: 0, life: rnd(3.5, 2), b: rnd(1, 0.3) });
  for (const q of s.dust) { q.age += dt; q.vu += q.beta * 0.04 * dt; q.u += q.vu * dt; }
  for (const q of s.ions) { q.age += dt; q.u = q.age * 0.42; }
  s.dust = s.dust.filter((q) => q.age < q.life).slice(-2200);
  s.ions = s.ions.filter((q) => q.age < q.life).slice(-900);
}
SPACE.comet = {
  label: "Comet",
  params: {
    x: { type: "range", min: 0, max: 1, step: 0.01, default: 0.7, label: "Head across" },
    y: { type: "range", min: 0, max: 1, step: 0.01, default: 0.35, label: "Head down" },
    angle: { type: "range", min: -180, max: 180, step: 1, default: -160, label: "Tail direction" },
    length: { type: "range", min: 0.2, max: 2, step: 0.05, default: 1, label: "Tail length" },
    ion: { type: "select", options: ["dust & ion", "dust only"], default: "dust & ion", label: "Tails" },
    coma: { type: "color", default: "#7dffb0", label: "Coma" },
    drift: { type: "range", min: 0, max: 2, step: 0.05, default: 0.4, label: "Star drift" },
    sky: SKY,
  },
  draw(ctx, w, h, t, dt, p, s) {
    dt = Math.min(dt, 0.05);
    // stars drift past slowly, as if tracking the comet across the sky
    if (p.sky === "stars") {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      s.sx = ((s.sx || 0) + dt * p.drift * w * 0.004) % w;
      ctx.save(); ctx.translate(-s.sx, 0); starfield(ctx, w, h, t, s, { density: 0.9, seed: 91 }); ctx.translate(w, 0); starfield(ctx, w, h, t, s, { density: 0.9, seed: 91 }); ctx.restore();
    } else spaceBg(ctx, w, h, t, s, p.sky);
    const m = Math.min(w, h), hx = p.x * w, hy = p.y * h, a = p.angle * RAD, dx = Math.cos(a), dy = Math.sin(a);
    const nx = -dy, ny = dx, L = m * 0.9 * p.length;
    // start with a fully grown tail rather than watching it build for ten seconds
    if (!s.dust) { s.dust = []; s.ions = []; for (let i = 0; i < 300; i++) cometStep(s, 1 / 30, p); }
    cometStep(s, dt, p);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const ds = glow("#fff1d0", 32, 0.3), is = glow("#7fb6ff", 32, 0.3);
    for (const q of s.dust) {
      const lag = q.u * q.u * (1 - q.beta) * 0.5; // heavy grains (low beta) lag behind and curve the tail
      const x = hx + (dx * q.u + nx * (q.v * (0.4 + q.u * 1.4) + lag)) * L, y = hy + (dy * q.u + ny * (q.v * (0.4 + q.u * 1.4) + lag)) * L;
      const r = m * (0.01 + q.u * 0.08), al = (1 - (q.age / q.life) ** 2) * 0.085 * q.b * Math.min(1, q.age * 3);
      ctx.globalAlpha = al; ctx.drawImage(ds, x - r, y - r, r * 2, r * 2);
    }
    for (const q of s.ions) {
      const wob = Math.sin(q.u * 9 - t * 2 + q.ph) * 0.012 * q.u; // rippling in the solar wind
      const x = hx + (dx * q.u + nx * (q.v * (0.3 + q.u) + wob)) * L * 1.1, y = hy + (dy * q.u + ny * (q.v * (0.3 + q.u) + wob)) * L * 1.1;
      const r = m * (0.004 + q.u * 0.014), al = (1 - q.age / q.life) * 0.3 * q.b;
      ctx.globalAlpha = al; ctx.drawImage(is, x - r * 2.5, y - r, r * 5, r * 2);
    }
    // coma and nucleus, with sunward jets rotating as the nucleus spins
    const cr = m * 0.07;
    ctx.globalAlpha = 0.55; ctx.drawImage(glow(p.coma, 64, 0.15), hx - cr * 2, hy - cr * 2, cr * 4, cr * 4);
    ctx.globalAlpha = 0.9; ctx.drawImage(glow("#ffffff", 64, 0.1), hx - cr * 0.5, hy - cr * 0.5, cr, cr);
    // jets of gas toward the Sun, swinging as the nucleus turns
    for (let j = 0; j < 3; j++) {
      const ja = a + Math.PI + Math.sin(t * 0.5 + j * 2.1) * 0.6;
      ctx.save(); ctx.translate(hx + Math.cos(ja) * cr * 0.35, hy + Math.sin(ja) * cr * 0.35); ctx.rotate(ja);
      ctx.globalAlpha = 0.3; ctx.drawImage(glow("#f4fff8", 32, 0.2), -cr * 0.4, -cr * 0.1, cr * 0.8, cr * 0.2); ctx.restore();
    }
    ctx.restore();
  },
};

// ================================================================== rocket launch
// Countdown under floodlights with venting vapour, ignition and the exhaust cloud
// rolling out of the flame trench, liftoff past the swinging arms, the climb with
// shock diamonds in the plume, staging, and the upper stage's glowing plume in
// thin air. "show" plays it once (use it as the show moment); "loop" repeats.
function rocketShape(ctx, x, y, s, light, stage) {
  // y is the bottom of the first stage's engines; s = rocket height in px
  const W = s * 0.085, top = y - s;
  const body = (x0, y0, wd, ht, base = "#e9ecef") => {
    const g = ctx.createLinearGradient(x0 - wd / 2, 0, x0 + wd / 2, 0);
    g.addColorStop(0, "#2a2d31"); g.addColorStop(0.35, base); g.addColorStop(0.62, "#ffffff"); g.addColorStop(1, "#4b4f55");
    ctx.fillStyle = g; ctx.fillRect(x0 - wd / 2, y0 - ht, wd, ht);
  };
  ctx.save();
  if (stage < 2) {
    // first stage: roll-pattern blocks, fins, five engines
    body(x, y - s * 0.02, W, s * 0.45);
    ctx.fillStyle = "#111";
    for (const [fy, fh] of [[0.36, 0.05], [0.14, 0.04]]) { ctx.fillRect(x - W / 2, y - s * fy - s * fh, W * 0.5, s * fh); ctx.fillRect(x, y - s * fy, W * 0.5, s * fh); }
    ctx.fillStyle = "#1a1c1f";
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + k * W * 0.5, y - s * 0.1); ctx.lineTo(x + k * W * 0.85, y - s * 0.005); ctx.lineTo(x + k * W * 0.5, y - s * 0.02); ctx.fill(); }
    ctx.fillStyle = "#2b2e33"; for (const k of [-0.32, 0, 0.32]) { ctx.beginPath(); ctx.moveTo(x + k * W - W * 0.1, y - s * 0.02); ctx.lineTo(x + k * W + W * 0.1, y - s * 0.02); ctx.lineTo(x + k * W + W * 0.16, y + s * 0.012); ctx.lineTo(x + k * W - W * 0.16, y + s * 0.012); ctx.fill(); }
    ctx.fillStyle = "#151618"; ctx.fillRect(x - W / 2, y - s * 0.49, W, s * 0.025); // interstage
  }
  const y2 = stage < 2 ? y - s * 0.49 : y;
  body(x, y2, W, s * 0.27);
  ctx.fillStyle = "#111"; ctx.fillRect(x - W / 2, y2 - s * 0.06, W * 0.5, s * 0.03);
  // third stage, capsule and escape tower
  body(x, y2 - s * 0.27, W * 0.8, s * 0.11);
  const cy0 = y2 - s * 0.38;
  const cg = ctx.createLinearGradient(x - W * 0.4, 0, x + W * 0.4, 0); cg.addColorStop(0, "#3b3f45"); cg.addColorStop(0.6, "#f4f5f6"); cg.addColorStop(1, "#5a5e65");
  ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(x - W * 0.4, cy0); ctx.lineTo(x + W * 0.4, cy0); ctx.lineTo(x + W * 0.12, cy0 - s * 0.07); ctx.lineTo(x - W * 0.12, cy0 - s * 0.07); ctx.fill();
  ctx.strokeStyle = "#b44"; ctx.lineWidth = Math.max(0.6, W * 0.05); ctx.beginPath(); ctx.moveTo(x, cy0 - s * 0.07); ctx.lineTo(x, cy0 - s * 0.12); ctx.stroke();
  // warm light from the engines below, painted onto the lower body
  if (light > 0) {
    ctx.globalCompositeOperation = "lighter";
    const lg = ctx.createLinearGradient(0, y, 0, y - s * 0.4);
    lg.addColorStop(0, `rgba(255,150,60,${0.6 * light})`); lg.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = lg; ctx.fillRect(x - W * 0.6, y - s * 0.4, W * 1.2, s * 0.4);
  }
  ctx.restore();
  return { W, top };
}
function plume(ctx, x, y, W, len, t, thin, color = "core") {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const fl = 0.9 + 0.1 * Math.sin(t * 50) + 0.06 * Math.sin(t * 23);
  const wide = W * (1 + thin * 4), L = len * fl * (1 + thin * 0.6);
  const blue = color === "blue";
  // outer flame
  const g = ctx.createLinearGradient(0, y, 0, y + L);
  g.addColorStop(0, blue ? "rgba(200,220,255,0.9)" : "rgba(255,240,200,0.95)"); g.addColorStop(0.25, blue ? "rgba(120,160,255,0.6)" : "rgba(255,170,60,0.8)"); g.addColorStop(1, "rgba(255,90,20,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - W * 0.45, y);
  ctx.bezierCurveTo(x - wide * 0.9, y + L * 0.3, x - wide * 0.5, y + L * 0.8, x, y + L); ctx.bezierCurveTo(x + wide * 0.5, y + L * 0.8, x + wide * 0.9, y + L * 0.3, x + W * 0.45, y); ctx.fill();
  // white-hot core and shock diamonds
  ctx.fillStyle = blue ? "rgba(235,242,255,0.9)" : "rgba(255,252,235,0.95)";
  ctx.beginPath(); ctx.moveTo(x - W * 0.35, y); ctx.quadraticCurveTo(x, y + L * 0.45, x + W * 0.35, y); ctx.fill();
  if (!blue) for (let i = 1; i <= 4; i++) { const dy = y + L * 0.1 * i * (1 + thin), r = W * 0.2 * (1 - i * 0.15); ctx.globalAlpha = 0.7 - i * 0.12; ctx.beginPath(); ctx.ellipse(x, dy, r, r * 1.6, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 0.5; ctx.drawImage(glow(blue ? "#b8c8ff" : "#ffcf80"), x - W * 3, y - W * 1.5, W * 6, W * 6);
  ctx.restore();
}
SPACE.launch = {
  label: "Rocket launch",
  params: {
    mode: { type: "select", options: ["loop", "show"], default: "loop", label: "Timing" },
    countdown: { type: "select", options: ["countdown", "no text"], default: "countdown", label: "Countdown" },
    length: { type: "range", min: 30, max: 90, step: 1, default: 46, label: "Seconds per launch" },
    sky: { type: "select", options: ["night", "dusk"], default: "night", label: "Sky" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    if (s.t0 === undefined) s.t0 = t;
    dt = Math.min(dt, 0.05);
    const T = p.length, raw = t - s.t0, tau = info && p.mode === "show" ? Math.min(raw, T - 0.01) : ((raw % T) + T) % T;
    if (s.lastTau !== undefined && tau < s.lastTau) { s.smoke = []; s.vent = []; s.trail = []; } // new cycle
    s.lastTau = tau;
    const IGN = 8, LIFT = 10, STAGE = 26, gx = w * 0.56;
    const lt = Math.max(0, tau - LIFT), alt = 0.2 * lt * lt + 0.1 * lt; // altitude (world units)
    // a long-lens tracking camera: it follows the climb and slowly pulls back, so the
    // exhaust column stays in frame below the rocket. One world unit starts at h/10.
    const U = h / 10 / (1 + Math.max(0, alt - 2) * 0.06);
    const camY = Math.max(0, alt - (0.45 * h) / U);
    const scale = 1 / (1 + Math.max(0, tau - STAGE) * 0.09); // shrinking with distance after staging
    const dusk = p.sky === "dusk";
    // sky darkens as we climb
    const up = clamp(camY / 40, 0, 1);
    const sk = ctx.createLinearGradient(0, 0, 0, h);
    sk.addColorStop(0, dusk ? `rgb(${30 * (1 - up) | 0},${30 * (1 - up) | 0},${70 * (1 - up) + 5 | 0})` : "#010207");
    sk.addColorStop(1, dusk ? `rgb(${(170 * (1 - up)) | 0},${(80 * (1 - up)) | 0},${(70 * (1 - up)) | 0})` : `rgb(${8 * (1 - up) | 0},${14 * (1 - up) | 0},${34 * (1 - up) + 2 | 0})`);
    ctx.fillStyle = sk; ctx.fillRect(0, 0, w, h);
    starfield(ctx, w, h, t, s, { density: 0.6 + up, seed: 101, bright: dusk ? up : 0.5 + up * 0.5 });
    const Y = (wy) => h * 0.9 - (wy - camY) * U; // world height → screen y
    const ignite = tau > IGN, flameK = ignite ? clamp((tau - IGN) / 0.8, 0, 1) : 0, burn1 = tau < STAGE, burn2 = tau > STAGE + 1.5;
    const rx = gx, ry = Y(alt + 0.25), rs = U * 3.8 * scale;
    // ground, pad, tower and floodlights
    if (Y(0) < h + U * 3) {
      const gy = Y(0);
      ctx.fillStyle = "#050607"; ctx.fillRect(0, gy, w, h - gy + U * 3);
      ctx.fillStyle = "#0d0f12"; ctx.fillRect(gx - U * 1.6, gy - U * 0.25, U * 3.2, U * 0.25);
      // floodlight beams fade once she's away
      const fk = clamp(1 - lt / 6, 0, 1) * (dusk ? 0.5 : 1);
      if (fk > 0) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (const fx of [-3.5, 3.8, -5.5]) {
          const bx = gx + fx * U, g = ctx.createLinearGradient(bx, gy, gx, Y(2));
          g.addColorStop(0, `rgba(210,225,255,${0.22 * fk})`); g.addColorStop(1, "rgba(210,225,255,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(gx - U * 0.2, Y(4.2)); ctx.lineTo(gx + U * 0.3, Y(1.4)); ctx.fill();
          ctx.globalAlpha = fk; ctx.drawImage(glow("#e8f0ff"), bx - U * 0.2, gy - U * 0.2, U * 0.4, U * 0.4); ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      // service tower: lattice with swing arms that pull away at liftoff
      const tx = gx - U * 1.15, tw = U * 0.6, th = U * 4.5;
      ctx.strokeStyle = "#3a3f47"; ctx.lineWidth = Math.max(0.6, U * 0.03);
      ctx.strokeRect(tx - tw / 2, Y(th / U) - 0, tw, th + (gy - Y(0)));
      ctx.beginPath();
      for (let k = 0; k < 14; k++) { const y0 = Y((k * th) / 14 / U), y1 = Y(((k + 1) * th) / 14 / U); ctx.moveTo(tx - tw / 2, y0); ctx.lineTo(tx + tw / 2, y1); ctx.moveTo(tx + tw / 2, y0); ctx.lineTo(tx - tw / 2, y1); ctx.moveTo(tx - tw / 2, y0); ctx.lineTo(tx + tw / 2, y0); }
      ctx.stroke();
      const swing = clamp((tau - IGN - 1) / 1.5, 0, 1) * 1.2;
      ctx.lineWidth = Math.max(0.8, U * 0.06); ctx.strokeStyle = "#4a5059";
      for (const ah of [1.5, 2.8, 3.9]) { const ax0 = tx + tw / 2, ay0 = Y(ah), len = gx - ax0 - U * 0.12; ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax0 + Math.cos(swing) * len, ay0 - Math.sin(swing) * len * 0.3); ctx.stroke(); }
      // red beacon
      if (Math.sin(t * 3) > 0.3) { ctx.globalCompositeOperation = "lighter"; ctx.drawImage(glow("#ff2a1a"), tx - U * 0.25, Y(th / U) - U * 0.35, U * 0.5, U * 0.5); ctx.globalCompositeOperation = "source-over"; }
    }
    // exhaust and steam: billowing clouds that spread along the ground from the trench
    s.smoke ||= []; s.vent ||= [];
    if (ignite && burn1 && alt < 8) for (let i = 0, n = Math.round(150 * dt); i < n; i++) s.smoke.push({ x: rnd(0.3, -0.3), y: 0.05, vx: rnd(1, -1) * rnd(3.4, 0.3), vy: rnd(1.4, 0.1) ** 1.3, r: rnd(0.7, 0.25), age: 0, life: rnd(11, 6), tone: (Math.random() * 3) | 0 });
    if (!ignite) for (let i = 0; i < 2; i++) if (Math.random() < 0.5) s.vent.push({ x: (Math.random() < 0.5 ? -1 : 1) * 0.13, y: rnd(2.3, 1), vx: rnd(0.15, -0.15), vy: rnd(-0.05, -0.25), r: rnd(0.12, 0.05), age: 0, life: rnd(3, 1.5) });
    // three greys so overlapping puffs build up billows instead of a flat white mass
    const puffs = [glow("#8c8f94", 64, 0.35), glow("#b3b5b9", 64, 0.35), glow("#d6d6d6", 64, 0.35)];
    for (const list of [s.vent, s.smoke]) for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.age += dt; if (q.age > q.life) { list.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.98; q.vy += 0.05 * dt; q.r += dt * (list === s.smoke ? 0.55 : 0.1);
      const sx = gx + q.x * U, sy = Y(q.y), r = q.r * U, k = 1 - q.age / q.life;
      // lit orange near the flame, cooler grey further away
      const near = burn1 && ignite ? clamp(1 - Math.hypot(q.x, q.y - alt) / 2.2, 0, 1) : 0;
      ctx.globalAlpha = Math.min(1, k * 1.4) * (list === s.smoke ? 0.12 : 0.22) * (dusk ? 1.2 : 1);
      ctx.drawImage(puffs[q.tone ?? 2], sx - r, sy - r, r * 2, r * 2);
      if (near > 0) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = near * near * k * 0.3; ctx.drawImage(glow("#ff9a40", 64, 0.35), sx - r, sy - r, r * 2, r * 2); ctx.globalCompositeOperation = "source-over"; }
    }
    ctx.globalAlpha = 1;
    if (s.smoke.length > 1100) s.smoke.splice(0, s.smoke.length - 1100);
    // the exhaust column left hanging in the air: dim and grey in the moonlight, glowing
    // orange where the plume is close enough to light it from inside
    s.trail ||= [];
    if (burn1 && lt > 0.2) for (let i = 0, n = Math.round(70 * dt + Math.random()); i < n; i++) {
      const f = Math.random(); // spread the puffs along the path flown since last frame
      s.trail.push({ x: rnd(0.08, -0.08), y: alt + 0.25 - f * (0.4 * lt + 0.1) * dt * 2, r: rnd(0.22, 0.12), age: 0, life: rnd(16, 10), drift: rnd(0.05, -0.05) });
    }
    if (s.trail.length) {
      const puffT = glow("#bfc3c8", 64, 0.35), hot = glow("#ffa050", 64, 0.3), noz = alt + 0.25;
      for (let i = s.trail.length - 1; i >= 0; i--) {
        const q = s.trail[i];
        q.age += dt; if (q.age > q.life) { s.trail.splice(i, 1); continue; }
        q.r += dt * (0.05 + 0.04 / (1 + q.age)); q.x += q.drift * dt;
        const sy = Y(q.y), r = q.r * U * (q.y > 6 ? 1 + (q.y - 6) * 0.03 : 1);
        if (sy < -r || sy > h + r) continue;
        const k = Math.min(1, (q.life - q.age) / 3), lit = burn1 ? Math.exp(-Math.max(0, noz - q.y) / 1.6) : 0;
        ctx.globalAlpha = 0.18 * k * (dusk ? 1.4 : 1); ctx.drawImage(puffT, gx + q.x * U - r, sy - r, r * 2, r * 2);
        if (lit > 0.02) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = lit * 0.35 * k; ctx.drawImage(hot, gx + q.x * U - r * 1.2, sy - r * 1.2, r * 2.4, r * 2.4); ctx.globalCompositeOperation = "source-over"; }
      }
      ctx.globalAlpha = 1;
      if (s.trail.length > 1400) s.trail.splice(0, s.trail.length - 1400);
    }
    // the rocket and its plume(s)
    const thin = clamp(alt / 60, 0, 1);
    // the flame lights the air and everything near it
    if (burn1 && ignite && tau < STAGE + 14) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.28 * flameK * (0.9 + 0.1 * Math.sin(t * 37));
      const gr = rs * (0.9 + thin); ctx.drawImage(glow("#ff9a48", 64, 0.15), rx - gr, ry - gr * 0.6, gr * 2, gr * 2); ctx.restore();
    }
    if (tau < STAGE + 14) {
      if (burn1 && ignite) plume(ctx, rx, ry, rs * 0.085, rs * (0.35 + flameK * 0.4 + thin * 0.8), t, thin);
      const sep = tau > STAGE ? tau - STAGE : 0;
      if (sep > 0) {
        // the spent first stage drops away and tumbles
        ctx.save(); ctx.translate(rx - sep * U * 0.05, ry + sep * sep * U * 0.25 * scale); ctx.rotate(sep * 0.25);
        ctx.globalAlpha = clamp(1 - sep / 8, 0, 1); rocketShape(ctx, 0, 0, rs, 0, 0); ctx.restore();
        if (sep < 0.5) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 1 - sep * 2; ctx.drawImage(glow("#fff0d0"), rx - rs * 0.2, ry - rs * 0.6, rs * 0.4, rs * 0.4); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
        if (burn2) {
          const y2 = ry - rs * 0.49 - sep * U * 0.3;
          // in near-vacuum the plume balloons into a huge translucent cone
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const cone = ctx.createRadialGradient(rx, y2, 0, rx, y2, rs * 1.6);
          cone.addColorStop(0, "rgba(190,210,255,0.5)"); cone.addColorStop(0.5, "rgba(140,170,255,0.12)"); cone.addColorStop(1, "rgba(140,170,255,0)");
          ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(rx, y2); ctx.arc(rx, y2, rs * 1.6, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9); ctx.fill(); ctx.restore();
          plume(ctx, rx, y2, rs * 0.07, rs * 0.25, t, 0, "blue");
          ctx.save(); ctx.translate(0, -sep * U * 0.3); rocketShape(ctx, rx, ry - rs * 0.49, rs, 0, 2); ctx.restore();
        } else { ctx.save(); ctx.translate(0, -sep * U * 0.3); rocketShape(ctx, rx, ry - rs * 0.49, rs, 0, 2); ctx.restore(); }
      } else rocketShape(ctx, rx, ry, rs, flameK * (1 - thin), 0);
    }
    // flash of the ignition across everything
    if (ignite && tau < IGN + 3) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.25 * (1 - (tau - IGN) / 3); ctx.fillStyle = "#ffb060"; ctx.fillRect(0, 0, w, h); ctx.restore(); }
    // countdown
    if (p.countdown === "countdown") {
      const sec = tau < LIFT ? Math.ceil(LIFT - tau) : -Math.floor(tau - LIFT);
      const txt = tau < LIFT ? `T−${String(sec).padStart(2, "0")}` : `T+${String(-sec).padStart(2, "0")}`;
      const fs = Math.max(10, Math.min(w, h) * 0.07);
      ctx.font = `600 ${fs}px ui-monospace, monospace`; ctx.textAlign = "left"; ctx.fillStyle = tau < LIFT ? "#ffd27a" : "#9fd7ff";
      ctx.fillText(txt, fs * 0.5, fs * 1.3);
      if (tau > LIFT && tau < LIFT + 3) { ctx.font = `600 ${fs * 0.55}px system-ui, sans-serif`; ctx.fillText("LIFTOFF", fs * 0.5, fs * 2.1); }
      if (tau > STAGE && tau < STAGE + 3) { ctx.font = `600 ${fs * 0.55}px system-ui, sans-serif`; ctx.fillText("STAGING", fs * 0.5, fs * 2.1); }
    }
    // fade between loops
    const fadeOut = clamp((T - tau) / 1.5, 0, 1), fadeIn = clamp(tau / 1, 0, 1);
    if (fadeOut * fadeIn < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fadeOut * fadeIn})`; ctx.fillRect(0, 0, w, h); }
  },
};
