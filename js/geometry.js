// Pure geometry helpers for editing 4-corner surfaces.
// Everything here works in output-pixel space (x in 0..out.w, y in 0..out.h)
// so rotation and proportional scaling respect the projector's aspect ratio.

export const toPx = (corners, out) => corners.map(([x, y]) => [x * out.w, y * out.h]);
export const toNorm = (corners, out) => corners.map(([x, y]) => [x / out.w, y / out.h]);

export function bbox(c) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

export const translate = (c, dx, dy) => c.map(([x, y]) => [x + dx, y + dy]);

// Map every corner from box `a` into box `b` (keeps any existing warp).
export function remapBox(c, a, b) {
  const sx = a.w ? b.w / a.w : 1, sy = a.h ? b.h / a.h : 1;
  return c.map(([x, y]) => [b.x0 + (x - a.x0) * sx, b.y0 + (y - a.y0) * sy]);
}

// Resize from a handle: "n","s","e","w" or a corner like "nw".
// keep = keep proportions, center = resize symmetrically around the centre.
export function scaleFromHandle(c, handle, dx, dy, { keep = false, center = false, min = 20 } = {}) {
  const a = bbox(c);
  const W = Math.max(a.w, 1e-6), H = Math.max(a.h, 1e-6);
  const hx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const hy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const k = center ? 2 : 1;
  let w = Math.max(min, W + hx * dx * k), h = Math.max(min, H + hy * dy * k);
  if (!hx) w = W;
  if (!hy) h = H;
  if (keep) {
    if (hx && hy) { const s = Math.max(w / W, h / H); w = W * s; h = H * s; }
    else if (hx) h = H * (w / W);
    else if (hy) w = W * (h / H);
  }
  let x0, y0;
  if (center) { x0 = a.cx - w / 2; y0 = a.cy - h / 2; }
  else {
    x0 = hx < 0 ? a.x1 - w : hx > 0 ? a.x0 : a.cx - w / 2;
    y0 = hy < 0 ? a.y1 - h : hy > 0 ? a.y0 : a.cy - h / 2;
    if (keep && !hx) x0 = a.cx - w / 2;
    if (keep && !hy) y0 = a.cy - h / 2;
  }
  return remapBox(c, a, { x0, y0, w, h });
}

export function rotate(c, angle, cx, cy) {
  const co = Math.cos(angle), si = Math.sin(angle);
  return c.map(([x, y]) => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co]);
}

// Angle of the top edge, in degrees.
export function angleOf(c) {
  return (Math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0]) * 180) / Math.PI;
}

// Snap a moving box to target lines. Returns adjusted dx/dy and guide lines.
// targets: { xs: [...], ys: [...] }, thr in the same units.
export function snapBox(c, dx, dy, targets, thr) {
  const b = bbox(c);
  const best = (vals, ts) => {
    let m = null;
    for (const v of vals) for (const t of ts) {
      const d = t - v;
      if (Math.abs(d) <= thr && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, t };
    }
    return m;
  };
  const sx = best([b.x0 + dx, b.cx + dx, b.x1 + dx], targets.xs);
  const sy = best([b.y0 + dy, b.cy + dy, b.y1 + dy], targets.ys);
  const guides = [];
  if (sx) { dx += sx.d; guides.push({ x: sx.t }); }
  if (sy) { dy += sy.d; guides.push({ y: sy.t }); }
  return { dx, dy, guides };
}

// Snap a single point (used for warp corners).
export function snapPoint(p, targets, thr) {
  let [x, y] = p;
  const guides = [];
  let bx = null, by = null;
  for (const t of targets.xs) if (Math.abs(t - x) <= thr && (bx === null || Math.abs(t - x) < Math.abs(bx - x))) bx = t;
  for (const t of targets.ys) if (Math.abs(t - y) <= thr && (by === null || Math.abs(t - y) < Math.abs(by - y))) by = t;
  if (bx !== null) { x = bx; guides.push({ x: bx }); }
  if (by !== null) { y = by; guides.push({ y: by }); }
  return { p: [x, y], guides };
}

export function distToSegment(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}
