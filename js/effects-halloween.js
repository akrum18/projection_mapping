// The Watcher: a Halloween haunting made for real windows and walls.
//
// Lightning lights the whole house in a few return strokes; in the same instant the
// bulb in one room stutters on (the storm surging the power) and, through the closed
// blinds, someone is standing in the dark. Each surge they are closer. Finally they are
// at the glass, and in the dim flicker two hands slam against it and slowly slide down.
//
// - Map "room light" + "watcher" onto the glass of one window (blinds or curtains
//   closed, so the light lands on them). Use "room light" with no figure on the other
//   windows, and "lightning" on siding, door, columns and trees: the flash is real
//   light on the real house.
// - The schedule is a pure function of time, so every surface flashes together.
// - "show" plays the whole sequence once (use it as the scare); "haunt" escalates over
//   repeated storms: an empty flash, far, closer, then at the glass.
import { TAU, seeded } from "./fx-util.js";

export const HALLOWEEN = {};

// Lightning: several return strokes in under half a second, each decaying fast.
const STROKES = [[0, 1], [0.08, 0.45], [0.19, 0.95], [0.36, 0.3], [0.6, 0.18]];
const lightning = (d) => { let v = 0; for (const [o, a] of STROKES) if (d >= o) v = Math.max(v, a * Math.exp(-(d - o) * 10)); return v; };
// A bulb stuttering on a failing circuit: hard on/off, in step with the strokes.
const SURGE = [[0, 0.07, 0.9], [0.14, 0.3, 0.75], [0.36, 0.95, 1], [1.02, 1.22, 0.45]];
const bulb = (d) => { for (const [a, b, l] of SURGE) if (d >= a && d < b) return l * (0.92 + 0.08 * Math.sin(d * 120)); return 0; };

function haunt(t, interval) {
  const k = Math.floor(t / interval), r = seeded(7919 + k);
  const start = k * interval + 1.5 + r() * Math.max(0, interval - 6);
  return { stage: k % 4, since: t - start };
}

// Figure in body units: top of head y=0, feet y=1. Long arms, sloped shoulders, a
// tilted head and long stringy hair that breaks up the outline.
const POSES = {
  1: { tilt: 0.18, arms: [[[-0.16, 0.37], [-0.15, 0.6]], [[0.155, 0.38], [0.145, 0.61]]] },
  2: { tilt: 0.42, arms: [[[-0.165, 0.37], [-0.155, 0.62]], [[0.17, 0.36], [0.15, 0.6]]] },
  3: { tilt: -0.22, arms: null }, // at the glass: head and shoulders fill the window
};
// a limb segment that tapers from w0 to w1, with rounded joints
function limb(g, x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  g.beginPath();
  g.moveTo(x0 + c * w0 / 2, y0 + s * w0 / 2); g.lineTo(x1 + c * w1 / 2, y1 + s * w1 / 2);
  g.lineTo(x1 - c * w1 / 2, y1 - s * w1 / 2); g.lineTo(x0 - c * w0 / 2, y0 - s * w0 / 2); g.closePath(); g.fill();
  g.beginPath(); g.arc(x0, y0, w0 / 2, 0, TAU); g.arc(x1, y1, w1 / 2, 0, TAU); g.fill();
}
function figure(g, pose) {
  // legs
  limb(g, -0.06, 0.52, -0.052, 0.76, 0.07, 0.05); limb(g, -0.052, 0.76, -0.05, 0.99, 0.05, 0.035);
  limb(g, 0.06, 0.52, 0.056, 0.76, 0.07, 0.05); limb(g, 0.056, 0.76, 0.054, 0.99, 0.05, 0.035);
  // torso: sloped shoulders, narrow waist, hips
  g.beginPath();
  g.moveTo(-0.03, 0.165); g.bezierCurveTo(-0.08, 0.17, -0.13, 0.19, -0.138, 0.235);
  g.quadraticCurveTo(-0.122, 0.3, -0.105, 0.33); g.quadraticCurveTo(-0.082, 0.42, -0.086, 0.47);
  g.quadraticCurveTo(-0.105, 0.51, -0.1, 0.56); g.lineTo(0.1, 0.56); g.quadraticCurveTo(0.105, 0.51, 0.086, 0.47);
  g.quadraticCurveTo(0.082, 0.42, 0.105, 0.33); g.quadraticCurveTo(0.122, 0.3, 0.138, 0.235);
  g.bezierCurveTo(0.13, 0.19, 0.08, 0.17, 0.03, 0.165); g.closePath(); g.fill();
  limb(g, 0, 0.17, 0, 0.11, 0.06, 0.045); // neck
  g.save(); g.translate(0, 0.135); g.rotate(pose.tilt);
  g.beginPath(); g.ellipse(0, -0.075, 0.05, 0.068, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(0.003, -0.032, 0.037, 0.042, 0, 0, TAU); g.fill();
  // long hair: a mass over the skull, then strands hanging below the shoulders
  g.beginPath(); g.ellipse(0, -0.08, 0.06, 0.072, 0, 0, TAU); g.fill();
  const r = seeded(13);
  for (let i = 0; i < 18; i++) {
    const u = i / 17 - 0.5, x0 = u * 0.11, len = 0.2 + r() * 0.13, x1 = u * 0.17 + (r() - 0.5) * 0.03;
    g.lineWidth = 0.008 + r() * 0.012; g.lineCap = "round";
    g.beginPath(); g.moveTo(x0, -0.1); g.quadraticCurveTo(x0 * 1.35, 0.02, x1, -0.1 + len + 0.12); g.stroke();
  }
  g.restore();
  if (pose.arms) pose.arms.forEach(([elbow, wrist], i) => {
    const side = i ? 1 : -1, sx = side * 0.128, sy = 0.235;
    limb(g, sx, sy, elbow[0], elbow[1], 0.05, 0.036);
    limb(g, elbow[0], elbow[1], wrist[0], wrist[1], 0.036, 0.026);
    const a = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]);
    for (let f = -1.5; f <= 1.5; f++) limb(g, wrist[0], wrist[1], wrist[0] + Math.cos(a + f * 0.12) * 0.085, wrist[1] + Math.sin(a + f * 0.12) * 0.085, 0.012, 0.006);
  });
}
// Where the figure stands in the window at each stage, and how blurred it is
// (further from the blinds = softer shadow).
function framing(stage, w, h) {
  if (stage === 1) return { S: h * 0.62, top: h * 0.3, cx: w * 0.4, blur: 0.03 };
  if (stage === 2) return { S: h * 1.35, top: h * 0.08, cx: w * 0.58, blur: 0.011 };
  return { S: h * 2.6, top: -h * 0.02, cx: w * 0.5, blur: 0.004 };
}
function silhouette(s, stage, w, h) {
  const key = `${stage}:${w}x${h}`;
  s.figs = s.figs || {};
  if (s.figs[key]) return s.figs[key];
  const F = framing(stage, w, h), ds = Math.max(1, F.S * F.blur);
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w / ds)); c.height = Math.max(2, Math.round(h / ds));
  const g = c.getContext("2d");
  g.setTransform(F.S / ds, 0, 0, F.S / ds, F.cx / ds, F.top / ds);
  g.fillStyle = "#000"; g.strokeStyle = "#000";
  figure(g, POSES[stage]);
  return (s.figs[key] = c); // drawn back up to full size: the downscale is the blur
}
// A hand pressed flat to the glass, palm towards us, forearm reaching up from below.
// mirror: -1 puts the thumb on the right (thumbs inward).
function hand(g, x, y, sz, ang, mirror) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(mirror * sz, sz);
  g.beginPath(); g.moveTo(-0.24, 0.22); g.lineTo(0.22, 0.22); g.lineTo(0.3, 1.8); g.lineTo(-0.34, 1.8); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-0.27, 0.25); g.quadraticCurveTo(-0.31, -0.05, -0.27, -0.28); g.lineTo(0.26, -0.3);
  g.quadraticCurveTo(0.31, -0.05, 0.25, 0.25); g.closePath(); g.fill();
  // four long fingers with a slight bend at the middle joint, then the thumb
  for (const [bx, len, a] of [[-0.2, 0.6, -0.16], [-0.067, 0.72, -0.05], [0.067, 0.69, 0.05], [0.2, 0.55, 0.15]]) {
    const mx = bx + Math.sin(a) * len * 0.55, my = -0.28 - Math.cos(a) * len * 0.55;
    const tx = mx + Math.sin(a * 1.4) * len * 0.45, ty = my - Math.cos(a * 1.4) * len * 0.45;
    limb(g, bx, -0.26, mx, my, 0.15, 0.12); limb(g, mx, my, tx, ty, 0.12, 0.085);
  }
  limb(g, -0.24, 0.08, -0.46, -0.12, 0.15, 0.115); limb(g, -0.46, -0.12, -0.6, -0.3, 0.115, 0.085);
  g.restore();
}

HALLOWEEN.watcher = {
  label: "The Watcher",
  params: {
    light: { type: "select", options: ["room light", "lightning"], default: "room light", label: "Light" },
    figure: { type: "select", options: ["watcher", "none"], default: "watcher", label: "Figure" },
    mode: { type: "select", options: ["haunt", "show"], default: "haunt", label: "Timing" },
    interval: { type: "range", min: 8, max: 60, step: 1, default: 16, label: "Seconds between storms" },
    glow: { type: "range", min: 0, max: 0.3, step: 0.01, default: 0.05, label: "Moonlight" },
    color: { type: "color", default: "#ffdca8", label: "Room light" },
    bolt: { type: "color", default: "#dfe8ff", label: "Lightning" },
  },
  draw(ctx, w, h, t, dt, p, s, info) {
    ctx.clearRect(0, 0, w, h);
    if (s.t0 === undefined) s.t0 = t;
    const room = p.light === "room light", lightOf = room ? bulb : lightning;
    let L = 0, stage = 0, linger = 0, handsAge = -1;
    // tile previews (no info) loop the show so you can see what it does
    const mode = info ? p.mode : "show";
    if (mode === "show") {
      const a = info ? t - s.t0 : (t - s.t0) % 10;
      for (const [st, sg] of [[0.3, 1], [2.6, 2], [4.9, 3]]) { const d = a - st; if (d >= 0 && d < 1.4) { const v = lightOf(d); if (v > L) { L = v; stage = sg; } } }
      if (a >= 6.2 && a < 9.6) { handsAge = a - 6.2; stage = 3; linger = 1; }
    } else {
      const H = haunt(t, p.interval);
      if (H.since >= 0 && H.since < 1.4) { L = lightOf(H.since); stage = H.stage; }
      if (H.stage === 3 && H.since >= 1.3 && H.since < 4.8) { handsAge = H.since - 1.3; stage = 3; linger = 1; }
    }
    // after the last surge the bulb hangs on, dim and failing, while the hands press the glass
    if (linger && room && p.figure === "watcher") L = Math.max(L, (0.32 + 0.06 * Math.sin(t * 37) + (Math.sin(t * 5.3) > 0.93 ? -0.25 : 0)) * Math.min(1, (3.4 - handsAge) / 0.6));
    const col = room ? p.color : p.bolt;
    const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
    const level = Math.min(1, p.glow + L);
    if (level > 0.003) {
      // room light falls off from a bulb behind the blinds; lightning floods evenly
      const gr = room ? ctx.createRadialGradient(w * 0.5, h * 0.25, 0, w * 0.5, h * 0.25, Math.max(w, h) * 0.9) : null;
      if (gr) { gr.addColorStop(0, `rgba(${r0},${g0},${b0},${level})`); gr.addColorStop(1, `rgba(${r0},${g0},${b0},${level * 0.55})`); }
      ctx.fillStyle = gr || `rgba(${r0},${g0},${b0},${level})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (p.figure !== "watcher" || !room) return;
    if (stage >= 1 && (L > 0.02 || linger)) {
      ctx.imageSmoothingEnabled = true;
      const breathe = stage === 3 ? 1 + 0.008 * Math.sin(t * 1.9) : 1;
      ctx.save(); ctx.translate(w / 2, h * 0.4); ctx.scale(breathe, breathe); ctx.translate(-w / 2, -h * 0.4);
      ctx.globalAlpha = 0.9; ctx.drawImage(silhouette(s, stage, w, h), 0, 0, w, h);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (handsAge >= 0) {
      // slam (a jolt), then a slow drag down the glass, then gone
      const jolt = handsAge < 0.12 ? (0.12 - handsAge) * 0.4 : 0;
      const slide = Math.min(1, Math.max(0, handsAge - 0.5) / 2.6) * h * 0.16;
      const fade = Math.min(1, Math.max(0, 3.4 - handsAge) / 0.6), sz = h * 0.22;
      ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = "#000"; ctx.strokeStyle = "#000";
      // beside the head, where the blinds are lit, so the fingers read against the light
      hand(ctx, w * 0.27, h * 0.31 + slide + jolt * h, sz * (1 + jolt), -0.24, -1);
      hand(ctx, w * 0.73, h * 0.28 + slide * 1.1 + jolt * h, sz * (1 + jolt), 0.22, 1);
      ctx.globalAlpha = 1;
    }
  },
};
