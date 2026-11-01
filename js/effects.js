// Built-in generative effects. Each effect draws into a 2D canvas that becomes
// a WebGL texture. `draw(ctx, w, h, t, dt, p, s)`: t = seconds, dt = frame
// delta, p = params, s = per-instance scratch state (reset on resize).
// Extra packs (effects-christmas.js) are merged in below and tagged by theme.
import { CHRISTMAS } from "./effects-christmas.js";

const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function softSprite(size, color) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.4, rgba(color, 0.45));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
function background(ctx, w, h, mode, color = "#000000") {
  if (mode === "transparent") ctx.clearRect(0, 0, w, h);
  else {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }
}
const BG = { type: "select", options: ["black", "transparent"], default: "black", label: "Background" };

export const EFFECTS = {
  fire: {
    label: "Fire",
    params: {
      intensity: { type: "range", min: 0.2, max: 3, step: 0.1, default: 1, label: "Intensity" },
      color: { type: "color", default: "#ff7a00", label: "Flame color" },
      height: { type: "range", min: 0.3, max: 2, step: 0.1, default: 1, label: "Height" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      s.parts = s.parts || [];
      s.sprite = s.sprite || softSprite(64, "#ffffff");
      background(ctx, w, h, p.bg);
      const spawn = Math.round(6 * p.intensity * (w / 400));
      for (let i = 0; i < spawn; i++) {
        s.parts.push({
          x: rnd(w * 0.9, w * 0.1), y: h + 10, vx: rnd(20, -20) * (w / 400), vy: -rnd(220, 120) * p.height * (h / 300),
          life: 1, decay: rnd(1.4, 0.8) / p.height, r: rnd(w * 0.08, w * 0.03),
        });
      }
      ctx.globalCompositeOperation = "lighter";
      const [cr, cg, cb] = hexToRgb(p.color);
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const q = s.parts[i];
        q.life -= q.decay * dt;
        if (q.life <= 0) { s.parts.splice(i, 1); continue; }
        q.x += (q.vx + Math.sin(t * 6 + q.y * 0.02) * 40) * dt;
        q.y += q.vy * dt;
        q.vy *= 0.995;
        const l = q.life;
        const r = q.r * (0.4 + l);
        ctx.globalAlpha = clamp(l * 0.9, 0, 1) * 0.55;
        // hot core → flame color → smoke red
        const mix = l > 0.6 ? 1 : l / 0.6;
        const R = Math.round(255 * (1 - mix) + cr * mix + 0 * (1 - l));
        const G = Math.round(230 * (1 - mix) + cg * mix) * l;
        const B = Math.round(120 * (1 - mix) + cb * mix) * l * l;
        ctx.fillStyle = `rgb(${R},${G | 0},${B | 0})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 13) + 0.08 * Math.sin(t * 31);
      const grad = ctx.createLinearGradient(0, h, 0, h * (1 - 0.5 * p.height));
      grad.addColorStop(0, rgba(p.color, 1));
      grad.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (s.parts.length > 900) s.parts.splice(0, s.parts.length - 900);
    },
  },

  lightning: {
    label: "Lightning storm",
    params: {
      frequency: { type: "range", min: 0.1, max: 3, step: 0.1, default: 1, label: "Frequency" },
      color: { type: "color", default: "#dfe8ff", label: "Flash color" },
      ambient: { type: "range", min: 0, max: 0.5, step: 0.01, default: 0.08, label: "Ambient light" },
    },
    draw(ctx, w, h, t, dt, p, s) {
      if (s.next === undefined) s.next = t + rnd(3, 1);
      ctx.fillStyle = `rgb(${8 + p.ambient * 60 | 0},${10 + p.ambient * 60 | 0},${30 + p.ambient * 80 | 0})`;
      ctx.fillRect(0, 0, w, h);
      if (t >= s.next && !s.flash) {
        s.flash = { start: t, dur: rnd(0.6, 0.25), bolts: [] };
        const nb = 1 + (Math.random() < 0.4 ? 1 : 0);
        for (let b = 0; b < nb; b++) {
          const pts = [[rnd(w * 0.8, w * 0.2), 0]];
          let x = pts[0][0], y = 0;
          while (y < h) { y += rnd(h * 0.08, h * 0.02); x += rnd(w * 0.12, -w * 0.12); pts.push([x, y]); }
          s.flash.bolts.push(pts);
        }
        s.next = t + rnd(9, 1.5) / p.frequency;
      }
      if (s.flash) {
        const e = (t - s.flash.start) / s.flash.dur;
        if (e > 1) { s.flash = null; return; }
        // multi-strobe envelope
        const env = Math.max(0, 1 - e) * (0.55 + 0.45 * Math.abs(Math.sin(e * 23)));
        ctx.fillStyle = rgba(p.color, env * 0.85);
        ctx.fillRect(0, 0, w, h);
        if (e < 0.5) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineCap = "round";
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 24;
          for (const pts of s.flash.bolts) {
            ctx.lineWidth = Math.max(1.5, w / 160) * (1 - e * 1.6);
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
          ctx.shadowBlur = 0;
        }
      }
    },
  },

  eyes: {
    label: "Glowing eyes",
    params: {
      count: { type: "range", min: 1, max: 12, step: 1, default: 4, label: "Pairs" },
      color: { type: "color", default: "#ffcc00", label: "Glow color" },
      size: { type: "range", min: 0.3, max: 2, step: 0.1, default: 1, label: "Size" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      s.eyes = s.eyes || [];
      while (s.eyes.length < p.count) s.eyes.push(newEye());
      s.eyes.length = Math.min(s.eyes.length, p.count);
      function newEye() {
        return { x: rnd(0.9, 0.1), y: rnd(0.85, 0.15), sz: rnd(1.3, 0.6), blink: rnd(5, 2), bt: 0, vx: rnd(0.01, -0.01), vy: rnd(0.005, -0.005), fade: 0, life: rnd(25, 8), gone: 0 };
      }
      background(ctx, w, h, p.bg);
      ctx.globalCompositeOperation = "lighter";
      const base = Math.min(w, h) * 0.05 * p.size;
      for (let i = 0; i < s.eyes.length; i++) {
        let e = s.eyes[i];
        e.x = clamp(e.x + e.vx * dt, 0.05, 0.95); e.y = clamp(e.y + e.vy * dt, 0.1, 0.9);
        e.life -= dt;
        if (e.life < 0) { e.gone += dt; if (e.gone > rnd(4, 1)) { s.eyes[i] = e = newEye(); } else continue; }
        e.fade = Math.min(1, e.fade + dt * 0.6);
        e.blink -= dt;
        if (e.blink < 0) { e.bt = 0.18; e.blink = rnd(6, 1.5); }
        let open = 1;
        if (e.bt > 0) { e.bt -= dt; open = Math.abs(e.bt - 0.09) / 0.09; }
        const r = base * e.sz, gap = r * 1.6;
        const cx = e.x * w, cy = e.y * h;
        const alpha = e.fade * Math.min(1, e.life);
        for (const dx of [-gap, gap]) {
          const grad = ctx.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, r * 2.6);
          grad.addColorStop(0, rgba(p.color, 0.55 * alpha));
          grad.addColorStop(1, rgba(p.color, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(cx + dx - r * 3, cy - r * 3, r * 6, r * 6);
          ctx.fillStyle = rgba(p.color, alpha);
          ctx.beginPath();
          ctx.ellipse(cx + dx, cy, r, Math.max(0.01, r * 0.75 * open), 0, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = `rgba(0,0,0,${alpha})`;
          ctx.beginPath();
          ctx.ellipse(cx + dx, cy, r * 0.22, Math.max(0.01, r * 0.7 * open), 0, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = "lighter";
        }
      }
      ctx.globalCompositeOperation = "source-over";
    },
  },

  blood: {
    label: "Blood drips",
    params: {
      rate: { type: "range", min: 0.1, max: 4, step: 0.1, default: 1, label: "Drip rate" },
      color: { type: "color", default: "#8a0008", label: "Color" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      if (!s.acc) {
        s.acc = document.createElement("canvas"); s.acc.width = w; s.acc.height = h;
        s.actx = s.acc.getContext("2d"); s.drips = []; s.reset = t + 45;
      }
      if (t > s.reset) {
        s.actx.globalCompositeOperation = "destination-out";
        s.actx.fillStyle = "rgba(0,0,0,0.02)"; s.actx.fillRect(0, 0, w, h);
        s.actx.globalCompositeOperation = "source-over";
        if (t > s.reset + 12) { s.actx.clearRect(0, 0, w, h); s.drips = []; s.reset = t + 45; }
      }
      if (Math.random() < dt * 1.2 * p.rate) {
        s.drips.push({ x: rnd(w * 0.97, w * 0.03), y: rnd(h * 0.08, -4), r: rnd(w * 0.022, w * 0.008), v: rnd(60, 15) * (h / 400), len: 0 });
      }
      const a = s.actx;
      for (let i = s.drips.length - 1; i >= 0; i--) {
        const d = s.drips[i];
        const v = d.v * (0.6 + 0.4 * Math.sin(t * 3 + d.x));
        const ny = d.y + v * dt;
        a.strokeStyle = p.color; a.lineCap = "round"; a.lineWidth = d.r * 2 * (0.5 + 0.5 * Math.random());
        a.beginPath(); a.moveTo(d.x, d.y); a.lineTo(d.x, ny); a.stroke();
        d.y = ny; d.v *= 0.999;
        if (d.y > h + d.r * 2 || Math.random() < dt * 0.05) s.drips.splice(i, 1);
      }
      background(ctx, w, h, p.bg);
      ctx.drawImage(s.acc, 0, 0);
      // drip heads with highlight
      for (const d of s.drips) {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.2, d.r * 1.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,120,120,0.35)";
        ctx.beginPath(); ctx.ellipse(d.x - d.r * 0.4, d.y - d.r * 0.3, d.r * 0.35, d.r * 0.5, 0, 0, TAU); ctx.fill();
      }
    },
  },

  fog: {
    label: "Fog / smoke",
    params: {
      density: { type: "range", min: 0.1, max: 2, step: 0.1, default: 1, label: "Density" },
      speed: { type: "range", min: 0, max: 3, step: 0.1, default: 1, label: "Speed" },
      color: { type: "color", default: "#9aa3ad", label: "Color" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      if (!s.sprite || s.color !== p.color) { s.sprite = softSprite(256, p.color); s.color = p.color; }
      s.puffs = s.puffs || [];
      const n = Math.round(40 * p.density);
      while (s.puffs.length < n) s.puffs.push({ x: rnd(1.2, -0.2), y: rnd(1.1, -0.1), r: rnd(0.6, 0.25), vx: rnd(0.08, 0.02), vy: rnd(0.01, -0.01), a: rnd(0.3, 0.08), ph: rnd(TAU) });
      s.puffs.length = Math.min(s.puffs.length, n);
      background(ctx, w, h, p.bg);
      const sz = Math.max(w, h);
      for (const q of s.puffs) {
        q.x += q.vx * p.speed * dt; q.y += (q.vy + Math.sin(t * 0.5 + q.ph) * 0.01) * p.speed * dt;
        if (q.x > 1.3) { q.x = -0.3; q.y = rnd(1.1, -0.1); }
        ctx.globalAlpha = q.a * (0.7 + 0.3 * Math.sin(t * 0.7 + q.ph));
        const r = q.r * sz;
        ctx.drawImage(s.sprite, q.x * w - r, q.y * h - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    },
  },

  static: {
    label: "TV static / glitch",
    params: {
      glitch: { type: "range", min: 0, max: 1, step: 0.05, default: 0.4, label: "Glitch" },
      color: { type: "color", default: "#ffffff", label: "Tint" },
      brightness: { type: "range", min: 0.2, max: 1.5, step: 0.05, default: 0.8, label: "Brightness" },
    },
    draw(ctx, w, h, t, dt, p, s) {
      const sw = 160, sh = Math.max(16, Math.round((160 * h) / w));
      if (!s.small) { s.small = document.createElement("canvas"); s.small.width = sw; s.small.height = sh; s.sctx = s.small.getContext("2d"); s.img = s.sctx.createImageData(sw, sh); }
      const d = s.img.data; const [cr, cg, cb] = hexToRgb(p.color);
      const roll = (t * 0.35) % 1;
      for (let y = 0; y < sh; y++) {
        const bar = Math.exp(-Math.pow(((y / sh) - roll) * 6, 2)) * 0.5;
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          const v = Math.random() * 255 * p.brightness * (1 - bar);
          d[i] = (v * cr) / 255; d[i + 1] = (v * cg) / 255; d[i + 2] = (v * cb) / 255; d[i + 3] = 255;
        }
      }
      s.sctx.putImageData(s.img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.small, 0, 0, w, h);
      if (Math.random() < p.glitch * 0.6) {
        const n = 1 + Math.random() * 4 | 0;
        for (let i = 0; i < n; i++) {
          const y = rnd(h), hh = rnd(h * 0.12, 2), dx = rnd(w * 0.2, -w * 0.2);
          ctx.drawImage(ctx.canvas, 0, y, w, hh, dx, y, w, hh);
        }
      }
      ctx.imageSmoothingEnabled = true;
    },
  },

  pulse: {
    label: "Heartbeat pulse",
    params: {
      bpm: { type: "range", min: 30, max: 180, step: 1, default: 70, label: "BPM" },
      color: { type: "color", default: "#c00010", label: "Color" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      background(ctx, w, h, p.bg);
      const beat = (t * p.bpm) / 60 % 1;
      const lub = Math.exp(-Math.pow(beat * 9, 2)), dub = Math.exp(-Math.pow((beat - 0.28) * 9, 2)) * 0.7;
      const a = 0.12 + (lub + dub) * 0.9;
      const r = Math.max(w, h) * (0.5 + (lub + dub) * 0.15);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
      g.addColorStop(0, rgba(p.color, Math.min(1, a)));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  },

  ghost: {
    label: "Floating ghost",
    params: {
      size: { type: "range", min: 0.3, max: 2, step: 0.1, default: 1, label: "Size" },
      speed: { type: "range", min: 0.1, max: 3, step: 0.1, default: 1, label: "Speed" },
      color: { type: "color", default: "#dfe9ff", label: "Color" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      if (!s.sprite || s.color !== p.color) {
        const c = document.createElement("canvas"); c.width = 200; c.height = 260; const g = c.getContext("2d");
        g.fillStyle = p.color;
        g.beginPath(); g.arc(100, 90, 70, Math.PI, 0); g.lineTo(170, 200);
        for (let i = 0; i < 5; i++) g.quadraticCurveTo(170 - i * 28 - 14, 200 + (i % 2 ? -20 : 25), 170 - (i + 1) * 28, 200);
        g.closePath(); g.fill();
        g.fillStyle = "#1a1a2a";
        g.beginPath(); g.ellipse(75, 95, 11, 17, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(125, 95, 11, 17, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(100, 140, 13, 20, 0, 0, TAU); g.fill();
        s.sprite = c; s.color = p.color; s.ph = s.ph ?? rnd(TAU);
      }
      background(ctx, w, h, p.bg);
      const T = t * p.speed;
      const x = w * (0.5 + 0.35 * Math.sin(T * 0.3 + s.ph)), y = h * (0.5 + 0.25 * Math.sin(T * 0.47 + s.ph * 2));
      const sc = Math.min(w, h) * 0.0035 * p.size * (0.9 + 0.1 * Math.sin(T));
      const alpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.21 + s.ph));
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.sin(T * 0.5) * 0.15); ctx.scale(sc, sc);
      ctx.globalAlpha = alpha * 0.25; ctx.filter = "blur(6px)";
      ctx.drawImage(s.sprite, -100, -130);
      ctx.filter = "none"; ctx.globalAlpha = alpha;
      ctx.drawImage(s.sprite, -100, -130);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },

  spiders: {
    label: "Crawling spiders",
    params: {
      count: { type: "range", min: 1, max: 20, step: 1, default: 6, label: "Count" },
      size: { type: "range", min: 0.3, max: 2, step: 0.1, default: 1, label: "Size" },
      color: { type: "color", default: "#111111", label: "Color" },
      bgcolor: { type: "color", default: "#2a2a30", label: "Wall color" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      s.sp = s.sp || [];
      while (s.sp.length < p.count) s.sp.push({ x: rnd(w), y: rnd(h), a: rnd(TAU), sp: rnd(80, 25), sz: rnd(1.3, 0.7), ph: rnd(TAU), pause: 0 });
      s.sp.length = Math.min(s.sp.length, p.count);
      background(ctx, w, h, p.bg, p.bgcolor);
      const base = Math.min(w, h) * 0.035 * p.size;
      for (const q of s.sp) {
        if (q.pause > 0) q.pause -= dt;
        else {
          if (Math.random() < dt * 0.3) q.pause = rnd(2, 0.3);
          q.a += rnd(2.5, -2.5) * dt;
          q.x += Math.cos(q.a) * q.sp * dt; q.y += Math.sin(q.a) * q.sp * dt;
          if (q.x < -40 || q.x > w + 40 || q.y < -40 || q.y > h + 40) q.a += Math.PI;
        }
        const r = base * q.sz;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
        ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.lineWidth = Math.max(1, r * 0.18); ctx.lineCap = "round";
        const walk = q.pause > 0 ? 0 : t * 14;
        for (let i = 0; i < 4; i++) {
          for (const side of [-1, 1]) {
            const ang = side * (0.35 + i * 0.5) + Math.sin(walk + i * 1.7 + side) * 0.25;
            const lx = Math.cos(ang) * r * 2.4, ly = Math.sin(ang) * r * 2.4;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(lx * 0.6, ly * 0.6 - r * 0.8 * side * Math.sign(ly || 1), lx, ly); ctx.stroke();
          }
        }
        ctx.beginPath(); ctx.ellipse(-r * 0.7, 0, r * 1.1, r * 0.8, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r * 0.6, 0, r * 0.55, r * 0.45, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },
  },

  candle: {
    label: "Candle flicker",
    params: {
      color: { type: "color", default: "#ffb347", label: "Color" },
      intensity: { type: "range", min: 0.2, max: 2, step: 0.1, default: 1, label: "Intensity" },
      flicker: { type: "range", min: 0, max: 1, step: 0.05, default: 0.5, label: "Flicker" },
    },
    draw(ctx, w, h, t, dt, p, s) {
      s.n = (s.n ?? 1) + (Math.random() - 0.5) * p.flicker * 0.5; s.n = clamp(s.n, 0.5, 1.3); s.n += (1 - s.n) * 0.1;
      const f = s.n * (1 + 0.08 * Math.sin(t * 9.3) + 0.05 * Math.sin(t * 23.1)) * p.intensity;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h * 0.6, Math.max(w, h) * 0.75);
      g.addColorStop(0, rgba(p.color, clamp(f, 0, 1)));
      g.addColorStop(0.5, rgba(p.color, clamp(f * 0.35, 0, 1)));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  },

  text: {
    label: "Text message",
    params: {
      text: { type: "text", default: "ENTER IF YOU DARE", label: "Text" },
      color: { type: "color", default: "#ff2020", label: "Color" },
      size: { type: "range", min: 0.1, max: 1, step: 0.02, default: 0.3, label: "Size" },
      mode: { type: "select", options: ["flicker", "scroll", "pulse", "steady"], default: "flicker", label: "Mode" },
      font: { type: "select", options: ["serif", "sans-serif", "monospace", "cursive", "fantasy", "Impact"], default: "serif", label: "Font" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      background(ctx, w, h, p.bg);
      const fs = h * p.size;
      ctx.font = `bold ${fs}px ${p.font}`;
      ctx.textBaseline = "middle"; ctx.textAlign = "center";
      let alpha = 1, x = w / 2;
      if (p.mode === "flicker") { s.a = s.a ?? 1; if (Math.random() < 0.08) s.a = rnd(1, 0.1); alpha = s.a * (0.85 + 0.15 * Math.sin(t * 40)); }
      if (p.mode === "pulse") alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2));
      if (p.mode === "scroll") { const tw = ctx.measureText(p.text).width + w; x = w + tw / 2 - ((t * w * 0.25) % tw); ctx.textAlign = "center"; }
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color; ctx.shadowBlur = fs * 0.4;
      ctx.fillStyle = p.color;
      const jit = p.mode === "flicker" ? rnd(2, -2) : 0;
      ctx.fillText(p.text, x + jit, h / 2 + jit);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    },
  },

  portal: {
    label: "Swirling portal",
    params: {
      color1: { type: "color", default: "#7a00ff", label: "Color A" },
      color2: { type: "color", default: "#00ff88", label: "Color B" },
      speed: { type: "range", min: 0.1, max: 3, step: 0.1, default: 1, label: "Speed" },
    },
    draw(ctx, w, h, t, dt, p, s) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
      const T = t * p.speed;
      const [r1, g1, b1] = hexToRgb(p.color1), [r2, g2, b2] = hexToRgb(p.color2);
      const rings = 28;
      for (let i = rings; i >= 1; i--) {
        const f = i / rings;
        const rr = R * Math.pow(f, 1.6);
        const k = 0.5 + 0.5 * Math.sin(f * 12 - T * 3);
        const ox = Math.sin(T + f * 9) * R * 0.05 * (1 - f), oy = Math.cos(T * 1.3 + f * 7) * R * 0.05 * (1 - f);
        ctx.fillStyle = `rgb(${(r1 + (r2 - r1) * k) * f | 0},${(g1 + (g2 - g1) * k) * f | 0},${(b1 + (b2 - b1) * k) * f | 0})`;
        ctx.beginPath(); ctx.arc(cx + ox, cy + oy, rr, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(1, R * 0.01);
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let a = 0; a < 7; a += 0.05) {
          const rr = R * 0.05 + a * R * 0.11;
          const ang = a * 1.5 + T * 1.2 + (arm * TAU) / 3;
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
  },

  rain: {
    label: "Rain",
    params: {
      density: { type: "range", min: 0.2, max: 3, step: 0.1, default: 1, label: "Density" },
      color: { type: "color", default: "#8fb4ff", label: "Color" },
      bg: BG,
    },
    draw(ctx, w, h, t, dt, p, s) {
      s.d = s.d || [];
      const n = Math.round(200 * p.density * (w * h) / (640 * 360));
      while (s.d.length < n) s.d.push({ x: rnd(w), y: rnd(h), v: rnd(900, 500) * (h / 360), l: rnd(h * 0.08, h * 0.03), a: rnd(0.5, 0.15) });
      s.d.length = Math.min(s.d.length, n);
      background(ctx, w, h, p.bg);
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, w / 640); ctx.lineCap = "round";
      ctx.beginPath();
      for (const q of s.d) {
        q.y += q.v * dt; q.x -= q.v * 0.12 * dt;
        if (q.y > h + q.l) { q.y = -q.l; q.x = rnd(w * 1.2); }
        ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + q.l * 0.12, q.y - q.l);
      }
      ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
    },
  },

  silhouette: {
    label: "Shadow figure in window",
    params: {
      glow: { type: "color", default: "#ffd28a", label: "Window glow" },
      interval: { type: "range", min: 2, max: 30, step: 1, default: 8, label: "Seconds between passes" },
      size: { type: "range", min: 0.4, max: 1.5, step: 0.05, default: 1, label: "Figure size" },
    },
    draw(ctx, w, h, t, dt, p, s) {
      if (s.next === undefined) s.next = t + 2;
      const flick = 0.9 + 0.08 * Math.sin(t * 7) + 0.03 * Math.sin(t * 29);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
      g.addColorStop(0, p.glow); g.addColorStop(1, rgba(p.glow, 0.25));
      ctx.globalAlpha = flick; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      if (!s.fig && t > s.next) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        s.fig = { x: dir > 0 ? -0.3 : 1.3, dir, speed: rnd(0.25, 0.12), stop: Math.random() < 0.5 ? rnd(0.7, 0.3) : -1, stopped: 0, turned: false };
        s.next = t + p.interval + rnd(p.interval);
      }
      if (s.fig) {
        const f = s.fig;
        const moving = !(f.stop > 0 && Math.abs(f.x - f.stop) < 0.01 && f.stopped < 2.5);
        if (moving) { f.x += f.dir * f.speed * dt; } else { f.stopped += dt; f.turned = f.stopped > 0.6; }
        if (f.x < -0.35 || f.x > 1.35) s.fig = null;
        else {
          const H = h * 0.9 * p.size, cx = f.x * w, base = h * 0.98;
          const walk = moving ? t * 9 : 0;
          ctx.fillStyle = "#050308"; ctx.strokeStyle = "#050308"; ctx.lineCap = "round";
          ctx.save(); ctx.translate(cx, base);
          ctx.lineWidth = H * 0.09;
          // legs
          for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -H * 0.45); ctx.lineTo(Math.sin(walk + k * Math.PI) * H * 0.12 * (moving ? 1 : 0.3) + k * H * 0.03, 0); ctx.stroke(); }
          // torso
          ctx.beginPath(); ctx.ellipse(0, -H * 0.58, H * 0.14, H * 0.22, 0, 0, TAU); ctx.fill();
          // arms
          ctx.lineWidth = H * 0.06;
          for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -H * 0.72); ctx.lineTo(k * H * 0.06 + Math.sin(walk + k * Math.PI + Math.PI) * H * 0.1 * (moving ? 1 : 0), -H * 0.4 + (f.turned ? -H * 0.1 : 0)); ctx.stroke(); }
          // head
          const hx = f.turned ? 0 : 0;
          ctx.beginPath(); ctx.ellipse(hx, -H * 0.88, H * 0.085, H * 0.1, 0, 0, TAU); ctx.fill();
          if (f.turned) { // glowing eyes when it turns to face you
            ctx.fillStyle = "#ff3030";
            ctx.beginPath(); ctx.arc(-H * 0.03, -H * 0.89, H * 0.012, 0, TAU); ctx.arc(H * 0.03, -H * 0.89, H * 0.012, 0, TAU); ctx.fill();
          }
          ctx.restore();
        }
      }
    },
  },

  grid: {
    label: "Calibration grid",
    params: {
      divisions: { type: "range", min: 2, max: 16, step: 1, default: 8, label: "Divisions" },
      color: { type: "color", default: "#ffffff", label: "Color" },
    },
    draw(ctx, w, h, t, dt, p) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, w / 400);
      for (let i = 0; i <= p.divisions; i++) {
        const x = (i / p.divisions) * w, y = (i / p.divisions) * h;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.lineWidth = Math.max(2, w / 150);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
      ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.25, 0, TAU); ctx.stroke();
      ctx.fillStyle = p.color; ctx.font = `bold ${h * 0.12}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("TL", w * 0.12, h * 0.12); ctx.fillText("TR", w * 0.88, h * 0.12);
      ctx.fillText("BL", w * 0.12, h * 0.88); ctx.fillText("BR", w * 0.88, h * 0.88);
    },
  },

  solid: {
    label: "Solid color / strobe",
    params: {
      color: { type: "color", default: "#ff6a00", label: "Color" },
      strobe: { type: "range", min: 0, max: 20, step: 0.5, default: 0, label: "Strobe Hz (0 = off)" },
    },
    draw(ctx, w, h, t, dt, p) {
      const on = p.strobe > 0 ? (t * p.strobe) % 1 < 0.5 : true;
      ctx.clearRect(0, 0, w, h);
      if (on) { ctx.fillStyle = p.color; ctx.fillRect(0, 0, w, h); }
    },
  },
};

Object.assign(EFFECTS, CHRISTMAS);

// Themes shown as filter chips in the editor. An effect can belong to several.
export const THEMES = [["all", "All"], ["halloween", "Halloween"], ["christmas", "Christmas"], ["basics", "Basics"]];
const TAGS = {
  fire: ["halloween", "christmas"], candle: ["halloween", "christmas"], text: ["halloween", "christmas", "basics"],
  lightning: ["halloween"], eyes: ["halloween"], blood: ["halloween"], fog: ["halloween"], static: ["halloween"],
  pulse: ["halloween"], ghost: ["halloween"], spiders: ["halloween"], portal: ["halloween"], silhouette: ["halloween"],
  rain: ["halloween", "basics"], grid: ["basics"], solid: ["basics"],
};
for (const k of Object.keys(CHRISTMAS)) TAGS[k] = ["christmas"];
for (const [k, v] of Object.entries(EFFECTS)) v.tags = TAGS[k] || ["basics"];
export const effectsFor = (theme) => Object.entries(EFFECTS).filter(([, v]) => !theme || theme === "all" || v.tags.includes(theme));

export function defaultParams(effectName) {
  const def = EFFECTS[effectName];
  const out = {};
  if (!def) return out;
  for (const [k, v] of Object.entries(def.params)) out[k] = v.default;
  return out;
}

export function effectParams(effectName, params) {
  return { ...defaultParams(effectName), ...(params || {}) };
}
