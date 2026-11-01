// Christmas effects made for a real house, not pictures of one.
// Rules they follow:
//  - Light only where something should be. Everything else stays black, so the
//    real siding, trim and door are the frame and nothing glows as a rectangle.
//  - Sized in projector pixels (info.wpx / info.hpx), so bulbs and lettering stay
//    bold and readable from the street whatever the surface's shape.
//  - Map them onto the real thing: trim, rooflines, columns, the door, the tree.
//  - Each has a "show" variant (used as the surface's scare) for the choreographed
//    moment, and starts fresh every time it is triggered.
import { TAU, seeded, glowSprite, PALETTES, PALETTE_PARAM } from "./fx-util.js";
import { drawSleigh } from "./effects-christmas.js";

export const HOUSE = {};

// canvas pixels per projector pixel (thumbnails have no info: assume a mid-size surface)
const scaleOf = (w, info) => (info ? w / Math.max(1, info.wpx) : 1 / 2.5);

function bulb(ctx, x, y, R, col, b) {
  if (b <= 0.01) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, 0.8 * b);
  ctx.drawImage(glowSprite(col, 64), x - R * 3.4, y - R * 3.4, R * 6.8, R * 6.8);
  ctx.globalAlpha = Math.min(1, 0.3 + 0.7 * b);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, R * 0.6, R * 0.85, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = Math.min(1, b);
  ctx.fillStyle = "#fffaf0"; ctx.beginPath(); ctx.ellipse(x, y + R * 0.1, R * 0.24, R * 0.4, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

// ---------------------------------------------------------------- outline lights
// C9-style bulbs that sit on real trim: map the surface to the outside of a window
// frame, a door frame, a gutter or a railing.
function edgePoints(w, h, inset, spacing, edges) {
  const pts = [];
  const seg = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / spacing));
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  };
  const a = inset, b = w - inset, c = inset, d = h - inset;
  if (edges === "line") {
    const n = Math.max(1, Math.round((b - a) / spacing));
    for (let i = 0; i <= n; i++) pts.push([a + ((b - a) * i) / n, h / 2]);
  } else if (edges === "top") { seg(a, c, b, c); pts.push([b, c]); }
  else if (edges === "top & sides") { seg(a, d, a, c); seg(a, c, b, c); seg(b, c, b, d); pts.push([b, d]); }
  else { seg(a, c, b, c); seg(b, c, b, d); seg(b, d, a, d); seg(a, d, a, c); }
  return pts;
}
HOUSE.outlinelights = {
  label: "Outline lights",
  params: {
    edges: { type: "select", options: ["outline", "top", "top & sides", "line"], default: "outline", label: "Where" },
    palette: { ...PALETTE_PARAM, default: "warm white" },
    mode: { type: "select", options: ["twinkle", "steady", "chase", "sparkle"], default: "twinkle", label: "Pattern" },
    size: { type: "range", min: 0.5, max: 2.5, step: 0.05, default: 1, label: "Bulb size" },
    spacing: { type: "range", min: 2, max: 6, step: 0.1, default: 3.2, label: "Spacing" },
    speed: { type: "range", min: 0.2, max: 3, step: 0.1, default: 1, label: "Speed" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    ctx.clearRect(0, 0, w, h);
    const k = scaleOf(w, info), R = Math.max(1.5, 9 * p.size * k);
    const inset = p.edges === "line" ? R : R * 1.15;
    const key = `${w}x${h}:${p.edges}:${R.toFixed(2)}:${p.spacing}`;
    if (s.key !== key) { s.key = key; s.pts = edgePoints(w, h, inset, R * p.spacing, p.edges); const r = seeded(5); s.ph = s.pts.map(() => r() * TAU); }
    const pal = PALETTES[p.palette] || PALETTES["warm white"];
    s.pts.forEach(([x, y], i) => {
      let col = pal[i % pal.length], b = 1;
      if (p.mode === "twinkle") b = 0.6 + 0.4 * Math.sin(t * p.speed * 1.6 + s.ph[i]);
      else if (p.mode === "chase") b = ((((i - t * p.speed * 9) % 4) + 4) % 4) < 1.3 ? 1.15 : 0.15;
      else if (p.mode === "sparkle") { b = 0.65; if (Math.sin(t * p.speed * 2.3 + s.ph[i] * 9) > 0.985) { col = "#ffffff"; b = 1.4; } }
      bulb(ctx, x, y, R, col, b);
    });
  },
};

// ---------------------------------------------------------------- window candles
// The colonial single candle in each window, plus a warm room glow. Close the
// blinds or curtains so the light has something to land on behind the glass.
HOUSE.windowglow = {
  label: "Window candle",
  params: {
    scene: { type: "select", options: ["candle", "glow", "tree"], default: "candle", label: "In the window" },
    color: { type: "color", default: "#ffb35c", label: "Glow" },
    level: { type: "range", min: 0, max: 1, step: 0.05, default: 0.45, label: "Room glow" },
    flicker: { type: "range", min: 0, max: 1, step: 0.05, default: 0.4, label: "Flicker" },
    mode: { type: "select", options: ["glow", "burst"], default: "glow", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) s.t0 = t;
    const age = t - s.t0;
    let level = p.level, flash = 0;
    if (p.mode === "burst") { flash = Math.max(0, 1 - age / 0.6); level = Math.min(1, p.level + 0.45); }
    const fl = 1 + p.flicker * (0.08 * Math.sin(t * 7.1) + 0.05 * Math.sin(t * 13.7) + 0.03 * Math.sin(t * 31));
    const g = ctx.createRadialGradient(w / 2, h * 0.85, 0, w / 2, h * 0.85, Math.max(w, h) * 0.95);
    const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(p.color.slice(i, i + 2), 16));
    g.addColorStop(0, `rgba(${r0},${g0},${b0},${Math.min(1, level * fl)})`);
    g.addColorStop(1, `rgba(${r0},${g0},${b0},${level * 0.25})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (flash > 0) { ctx.fillStyle = `rgba(255,248,230,${flash})`; ctx.fillRect(0, 0, w, h); }
    if (p.scene === "candle") {
      const ch = h * 0.42, cw = Math.max(3, Math.min(w * 0.07, ch * 0.16)), x = w / 2, base = h * 0.97;
      ctx.fillStyle = "#fff6e6"; ctx.fillRect(x - cw / 2, base - ch, cw, ch);
      ctx.fillStyle = "#e9dcc6"; ctx.fillRect(x - cw * 1.1, base - ch * 0.08, cw * 2.2, ch * 0.08);
      const fy = base - ch - cw * 0.9, f = 0.92 + 0.08 * Math.sin(t * 9.3) + p.flicker * 0.06 * Math.sin(t * 23);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.85; ctx.drawImage(glowSprite("#ffb347", 64), x - cw * 5, fy - cw * 5, cw * 10, cw * 10);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffd27a"; ctx.beginPath(); ctx.ellipse(x, fy, cw * 0.42 * f, cw * 0.95 * f, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fffbe8"; ctx.beginPath(); ctx.ellipse(x, fy + cw * 0.2, cw * 0.18, cw * 0.45, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (p.scene === "tree") {
      // a dark tree standing in the lit room, with tiny lights
      const tx = w * 0.62, tb = h * 0.98, th = h * 0.75;
      ctx.fillStyle = "#000";
      for (let i = 0; i < 4; i++) { const yy = tb - th * (i / 4) * 0.9, ww = th * 0.3 * (1 - i / 5); ctx.beginPath(); ctx.moveTo(tx, yy - th * 0.36); ctx.lineTo(tx - ww, yy); ctx.lineTo(tx + ww, yy); ctx.closePath(); ctx.fill(); }
      if (!s.tl) { const r = seeded(77); s.tl = Array.from({ length: 18 }, () => { const v = r(); return { x: tx + (r() - 0.5) * th * 0.5 * (1 - v), y: tb - th * v * 0.85, ph: r() * TAU, c: (r() * 4) | 0 }; }); }
      const cols = ["#ff3b30", "#ffd60a", "#30d158", "#4da3ff"];
      for (const l of s.tl) bulb(ctx, l.x, l.y, Math.max(1, h * 0.012), cols[l.c], 0.5 + 0.5 * Math.sin(t * 2.2 + l.ph));
    }
  },
};

// ---------------------------------------------------------------- wrapped door
// Turns the front door into a present. The door's own colour is the paper, so only
// the ribbon and bow are projected; the bow can frame a real wreath instead of
// covering it. On a red door every colour comes out red: white gives the most
// contrast.
HOUSE.wrapdoor = {
  label: "Wrapped door",
  params: {
    ribbon: { type: "color", default: "#ffffff", label: "Ribbon light" },
    width: { type: "range", min: 0.06, max: 0.3, step: 0.01, default: 0.16, label: "Ribbon width" },
    bowY: { type: "range", min: 0.1, max: 0.6, step: 0.01, default: 0.24, label: "Bow height" },
    bow: { type: "select", options: ["around wreath", "bow", "none"], default: "around wreath", label: "Bow" },
    wreath: { type: "range", min: 0.15, max: 0.45, step: 0.01, default: 0.31, label: "Wreath size" },
    mode: { type: "select", options: ["shimmer", "shine"], default: "shimmer", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) s.t0 = t;
    const cx = w / 2, by = h * p.bowY, rw = w * p.width, hole = p.bow === "around wreath" ? w * p.wreath : 0;
    const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(p.ribbon.slice(i, i + 2), 16));
    const col = (a) => `rgba(${r0},${g0},${b0},${a})`;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h);
    if (hole) ctx.arc(cx, by, hole, 0, TAU, true);
    ctx.clip("evenodd");
    for (const vertical of [true, false]) {
      const gr = vertical ? ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0) : ctx.createLinearGradient(0, by - rw / 2, 0, by + rw / 2);
      gr.addColorStop(0, col(0.55)); gr.addColorStop(0.5, col(0.95)); gr.addColorStop(1, col(0.5));
      ctx.fillStyle = gr;
      vertical ? ctx.fillRect(cx - rw / 2, 0, rw, h) : ctx.fillRect(0, by - rw / 2, w, rw);
    }
    // a band of light sliding along the ribbon (satin sheen); faster with sparkles in the show
    const shine = p.mode === "shine", period = shine ? 1.4 : 4.5;
    const u = (((t - s.t0) / period) % 1) * 1.4 - 0.2;
    const sy = u * (h + w), sh = ctx.createLinearGradient(0, sy, w * 0.3, sy + w * 0.3);
    sh.addColorStop(0.38, "rgba(255,255,255,0)"); sh.addColorStop(0.5, `rgba(255,255,255,${shine ? 0.7 : 0.35})`); sh.addColorStop(0.62, "rgba(255,255,255,0)");
    ctx.save(); ctx.beginPath(); ctx.rect(cx - rw / 2, 0, rw, h); ctx.rect(0, by - rw / 2, w, rw); ctx.clip();
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.restore();
    const loop = (x, y, lw, lh, ang) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      const gr = ctx.createRadialGradient(0, 0, lh * 0.1, 0, 0, lw);
      gr.addColorStop(0, col(0.95)); gr.addColorStop(1, col(0.55));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, lw, lh, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.beginPath(); ctx.ellipse(-lw * 0.12, 0, lw * 0.5, lh * 0.32, 0, 0, TAU); ctx.fill();
      ctx.restore();
    };
    const tail = (x0, y0, dir, len) => {
      const tw = rw * 0.8, dx = dir * len * 0.5;
      ctx.fillStyle = col(0.85);
      ctx.beginPath(); ctx.moveTo(x0 - tw / 2, y0); ctx.lineTo(x0 + tw / 2, y0);
      ctx.lineTo(x0 + dx + tw / 2, y0 + len); ctx.lineTo(x0 + dx, y0 + len * 0.88); ctx.lineTo(x0 + dx - tw / 2, y0 + len); ctx.closePath(); ctx.fill();
    };
    if (p.bow === "around wreath") {
      // the real wreath is the knot: two ribbon tails hang from beneath it
      for (const d of [-1, 1]) tail(cx + d * rw * 0.35, by + hole * 0.92, d, Math.min(h * 0.22, w * 0.7));
    } else if (p.bow === "bow") {
      const lw = w * 0.22, lh = w * 0.13;
      for (const d of [-1, 1]) { loop(cx + d * lw * 0.85, by - lh * 0.15, lw, lh, d * -0.3); tail(cx, by + lh * 0.3, d, h * 0.2); }
      ctx.fillStyle = col(1); ctx.beginPath(); ctx.ellipse(cx, by, w * 0.08, w * 0.09, 0, 0, TAU); ctx.fill();
    }
    if (shine) {
      s.sp = s.sp || [];
      if (Math.random() < dt * 30) { const onV = Math.random() < 0.5; s.sp.push({ x: onV ? cx + (Math.random() - 0.5) * rw : Math.random() * w, y: onV ? Math.random() * h : by + (Math.random() - 0.5) * rw, life: 1 }); }
      for (let i = s.sp.length - 1; i >= 0; i--) {
        const q = s.sp[i]; q.life -= dt * 2.2; if (q.life <= 0) { s.sp.splice(i, 1); continue; }
        const L = rw * 0.6 * Math.sin(q.life * Math.PI);
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(255,255,255,${q.life})`; ctx.lineWidth = Math.max(1, rw * 0.06);
        ctx.beginPath(); ctx.moveTo(q.x - L, q.y); ctx.lineTo(q.x + L, q.y); ctx.moveTo(q.x, q.y - L); ctx.lineTo(q.x, q.y + L); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
  },
};

// ---------------------------------------------------------------- tree lights
// Strands of bulbs wrapped around a real evergreen: map the surface over the tree
// (a tall quad, narrow at the top). Needles catch the light as points.
HOUSE.treelights = {
  label: "Tree lights",
  params: {
    palette: PALETTE_PARAM,
    strands: { type: "range", min: 4, max: 20, step: 1, default: 11, label: "Rows of lights" },
    size: { type: "range", min: 0.4, max: 2, step: 0.05, default: 0.9, label: "Bulb size" },
    star: { type: "select", options: ["star", "no star"], default: "star", label: "Top" },
    mode: { type: "select", options: ["twinkle", "steady", "burst"], default: "twinkle", label: "Show" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    ctx.clearRect(0, 0, w, h);
    const k = scaleOf(w, info), R = Math.max(1.2, 7 * p.size * k);
    const key = `${w}x${h}:${p.strands}:${R.toFixed(2)}`;
    if (s.key !== key) {
      s.key = key; s.b = [];
      const r = seeded(91), top = h * 0.06, rows = p.strands | 0;
      for (let i = 0; i < rows; i++) {
        const v = (i + 0.7) / rows, y0 = top + v * (h - top) * 0.96, half = (w / 2) * v * 0.95;
        const n = Math.max(2, Math.round((half * 2) / (R * 3.4)));
        for (let j = 0; j < n; j++) {
          const u = (j + 0.5) / n, x = w / 2 - half + u * half * 2;
          s.b.push({ x: x + (r() - 0.5) * R, y: y0 + Math.sin(u * Math.PI) * R * 2.2 - (i % 2) * R + (r() - 0.5) * R, ph: r() * TAU });
        }
      }
    }
    const pal = PALETTES[p.palette] || PALETTES.classic, burst = p.mode === "burst";
    s.b.forEach((q, i) => {
      let col = pal[i % pal.length], b = 1;
      if (p.mode === "twinkle") b = 0.55 + 0.45 * Math.sin(t * 1.8 + q.ph);
      if (burst) { b = 0.6 + 0.4 * Math.sin(t * 6 + q.ph); if (Math.sin(t * 9 + q.ph * 13) > 0.9) { col = "#ffffff"; b = 1.5; } }
      bulb(ctx, q.x, q.y, R, col, b);
    });
    if (p.star === "star") {
      const sr = Math.max(R * 2.6, h * 0.035), pulse = burst ? 1.3 + 0.3 * Math.sin(t * 8) : 1 + 0.12 * Math.sin(t * 2);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, 0.8 * pulse);
      ctx.drawImage(glowSprite("#ffd76a", 64), w / 2 - sr * 3, h * 0.04 - sr * 3, sr * 6, sr * 6);
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff2b3";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? sr * 0.42 : sr; ctx.lineTo(w / 2 + Math.cos(a) * rr, h * 0.04 + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  },
};

// ---------------------------------------------------------------- sleigh across the house
// A big silhouette crossing a wall inside a travelling pool of moonlight (the
// silhouette is an absence of light, so it needs light around it to be seen),
// leaving a trail of gold sparkles. Map it over the upper wall or the whole house.
HOUSE.sleighpass = {
  label: "Sleigh across the house",
  params: {
    mode: { type: "select", options: ["repeat", "once"], default: "repeat", label: "Fly" },
    interval: { type: "range", min: 5, max: 120, step: 1, default: 30, label: "Seconds between flights" },
    cross: { type: "range", min: 3, max: 20, step: 0.5, default: 9, label: "Seconds to cross" },
    direction: { type: "select", options: ["left to right", "right to left"], default: "left to right", label: "Direction" },
    size: { type: "range", min: 0.4, max: 1.6, step: 0.05, default: 1, label: "Size" },
    moon: { type: "color", default: "#dfe8ff", label: "Moonlight" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) { s.t0 = t; s.trail = []; }
    const age = t - s.t0, cycle = p.mode === "once" ? Infinity : Math.max(p.cross + 1, p.interval);
    const u = (age % cycle) / p.cross, dir = p.direction === "left to right" ? 1 : -1;
    const S = ((h * 0.3) / 46) * p.size;
    if (u <= 1) {
      const x = dir > 0 ? -0.15 * w + u * 1.3 * w : 1.15 * w - u * 1.3 * w;
      const y = h * (0.62 - 0.22 * Math.sin(u * Math.PI));
      const R = h * 0.55 * p.size, [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(p.moon.slice(i, i + 2), 16));
      const g = ctx.createRadialGradient(x + dir * 50 * S, y, 0, x + dir * 50 * S, y, R);
      g.addColorStop(0, `rgba(${r0},${g0},${b0},0.75)`); g.addColorStop(0.6, `rgba(${r0},${g0},${b0},0.3)`); g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(x, y); ctx.scale(dir * S, S);
      ctx.fillStyle = "#000"; ctx.strokeStyle = "#000"; drawSleigh(ctx, t);
      ctx.restore();
      s.trail.push({ x: x - dir * 24 * S, y: y + 10 * S, life: 1, r: S * (1.5 + Math.random() * 2.5) });
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = s.trail.length - 1; i >= 0; i--) {
      const q = s.trail[i]; q.life -= dt * 0.45; q.y += dt * h * 0.03;
      if (q.life <= 0) { s.trail.splice(i, 1); continue; }
      ctx.globalAlpha = q.life * (0.6 + 0.4 * Math.sin(t * 25 + i));
      ctx.drawImage(glowSprite("#ffd76a", 32), q.x - q.r * 3, q.y - q.r * 3, q.r * 6, q.r * 6);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  },
};

// ---------------------------------------------------------------- lettering
// Bold lettering sized to the surface, written on with a glowing pen and a spray
// of sparkles, then held with a gentle twinkle. For a clear band of siding.
const FONTS = {
  script: '"Brush Script MT", "Segoe Script", "Snell Roundhand", "URW Chancery L", cursive',
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Helvetica Neue", Arial, sans-serif',
};
HOUSE.banner = {
  label: "Merry Christmas lettering",
  params: {
    text: { type: "text", default: "Merry Christmas", label: "Text" },
    color: { type: "color", default: "#ffd36b", label: "Colour" },
    font: { type: "select", options: ["script", "serif", "sans"], default: "script", label: "Lettering" },
    mode: { type: "select", options: ["write-on", "steady"], default: "write-on", label: "Show" },
    repeat: { type: "range", min: 0, max: 120, step: 5, default: 0, label: "Rewrite every (s, 0 = once)" },
  },
  draw(ctx, w, h, t, dt, p, s) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) { s.t0 = t; s.sp = []; }
    const fam = FONTS[p.font] || FONTS.script, italic = p.font === "script" ? "italic " : "";
    ctx.font = `${italic}700 100px ${fam}`;
    const m = ctx.measureText(p.text || " "), size = Math.min(100 * (w * 0.9) / Math.max(1, m.width), h * 0.72);
    ctx.font = `${italic}700 ${size}px ${fam}`;
    const tw = ctx.measureText(p.text || " ").width, x0 = (w - tw) / 2, base = h / 2 + size * 0.32;
    let age = t - s.t0;
    if (p.repeat > 0) age %= p.repeat;
    const dur = Math.max(1.5, (p.text || "").length * 0.16), u = p.mode === "steady" ? 1 : Math.min(1, age / dur);
    const reveal = x0 + tw * u;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, reveal, h); ctx.clip();
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = p.color; ctx.shadowBlur = size * 0.25;
    ctx.fillStyle = p.color; ctx.fillText(p.text, x0, base);
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillText(p.text, x0 + size * 0.01, base - size * 0.015);
    ctx.restore();
    // pen tip and sparkles while writing, a slow twinkle after
    if (u < 1) {
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(glowSprite("#ffffff", 64), reveal - size * 0.35, base - size * 0.75, size * 0.7, size * 0.7);
      for (let i = 0; i < 3; i++) s.sp.push({ x: reveal, y: base - size * (0.1 + Math.random() * 0.6), vx: (Math.random() - 0.5) * size, vy: Math.random() * size * 0.8, life: 1 });
    } else if (Math.random() < dt * 4) s.sp.push({ x: x0 + Math.random() * tw, y: base - Math.random() * size * 0.7, vx: 0, vy: 0, life: 1, star: true });
    ctx.globalCompositeOperation = "lighter";
    for (let i = s.sp.length - 1; i >= 0; i--) {
      const q = s.sp[i]; q.life -= dt * (q.star ? 1.2 : 1.6); q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) { s.sp.splice(i, 1); continue; }
      const L = size * (q.star ? 0.12 : 0.05) * Math.sin(q.life * Math.PI);
      ctx.strokeStyle = `rgba(255,250,220,${q.life})`; ctx.lineWidth = Math.max(1, size * 0.012);
      ctx.beginPath(); ctx.moveTo(q.x - L, q.y); ctx.lineTo(q.x + L, q.y); ctx.moveTo(q.x, q.y - L); ctx.lineTo(q.x, q.y + L); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  },
};
