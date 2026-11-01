// 2D overlay drawing shared by the editor stage and the projector output.
// A "view" maps normalised output coords to canvas pixels: px = ox + x * sx.
import { bbox } from "./geometry.js";

export const COLORS = { accent: "#ff8a1f", guide: "#ff5ad1", line: "rgba(255,255,255,0.55)", hidden: "rgba(160,160,170,0.6)" };

export const fullView = (w, h) => ({ sx: w, sy: h, ox: 0, oy: 0 });
export const project = (corners, v) => corners.map(([x, y]) => [v.ox + x * v.sx, v.oy + y * v.sy]);

export function drawTestPattern(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  const step = Math.max(40, Math.round(w / 24));
  for (let x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += step) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
  ctx.lineWidth = 4; ctx.strokeStyle = COLORS.accent;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(h / 18)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${w} × ${h}`, w / 2, h / 2);
  ctx.restore();
}

function pathQuad(ctx, c) {
  ctx.beginPath();
  c.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

function pill(ctx, text, x, y, u, on) {
  ctx.font = `600 ${11 * u}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const w = ctx.measureText(text).width + 14 * u, h = 18 * u;
  ctx.fillStyle = on ? COLORS.accent : "rgba(0,0,0,0.7)";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 4 * u) : ctx.rect(x, y, w, h); ctx.fill();
  ctx.fillStyle = on ? "#1a0d00" : "#ececf1";
  ctx.fillText(text, x + 7 * u, y + h / 2 + 0.5);
}

// opts: { selected, labels: "top" | "center" | false, unit (px per CSS px), all (draw unselected too), hover }
export function drawOutlines(ctx, state, view, opts = {}) {
  const u = opts.unit || 1;
  ctx.save();
  state.surfaces.forEach((sf, i) => {
    const sel = sf.id === opts.selected;
    if (!sel && opts.all === false) return;
    const c = project(sf.corners, view);
    const hov = sf.id === opts.hover && !sel;
    ctx.lineWidth = (sel ? 2 : hov ? 2 : 1.25) * u;
    ctx.strokeStyle = sel ? COLORS.accent : hov ? "rgba(255,190,130,0.9)" : sf.visible ? COLORS.line : COLORS.hidden;
    ctx.setLineDash(sf.visible ? [] : [6 * u, 5 * u]);
    pathQuad(ctx, c); ctx.stroke();
    ctx.setLineDash([]);
    // top edge marker so orientation is visible
    ctx.strokeStyle = sel ? "#ffd2a8" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = (sel ? 2 : 1) * u;
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[1][0], c[1][1]); ctx.stroke();
    if (opts.labels === "top") {
      const b = bbox(c);
      pill(ctx, `${i + 1}  ${sf.name}${sf.locked ? "  · locked" : ""}`, b.x0, b.y0 - 24 * u, u, sel);
    } else if (opts.labels === "center") {
      const cx = c.reduce((a, p) => a + p[0], 0) / 4, cy = c.reduce((a, p) => a + p[1], 0) / 4;
      const fs = Math.max(11, Math.round(view.sy / 45));
      ctx.font = `${fs}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const label = `${i + 1}. ${sf.name}`, tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(cx - tw / 2, cy - fs * 0.9, tw, fs * 1.8);
      ctx.fillStyle = sel ? "#ffb060" : "#fff"; ctx.fillText(label, cx, cy);
    }
  });
  ctx.restore();
}

const CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

// Handle positions for a selected surface. `c` = corners in screen units,
// `u` = screen units per CSS px. Used for both drawing and hit testing.
export function handlePositions(c, mode, u = 1) {
  const out = [];
  if (mode === "warp") {
    c.forEach((p, i) => out.push({ kind: "corner", arg: i, x: p[0], y: p[1], r: 9 * u, cursor: "crosshair" }));
    c.forEach((p, i) => {
      const q = c[(i + 1) % 4];
      out.push({ kind: "edge", arg: i, x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, r: 7 * u, cursor: "move" });
    });
  } else {
    const b = bbox(c);
    const pts = { nw: [b.x0, b.y0], n: [b.cx, b.y0], ne: [b.x1, b.y0], e: [b.x1, b.cy], se: [b.x1, b.y1], s: [b.cx, b.y1], sw: [b.x0, b.y1], w: [b.x0, b.cy] };
    for (const [h, [x, y]] of Object.entries(pts)) out.push({ kind: "scale", arg: h, x, y, r: 8 * u, cursor: CURSORS[h] });
    out.push({ kind: "rotate", arg: null, x: b.cx, y: b.y0 - 30 * u, r: 9 * u, cursor: "grab" });
  }
  return out;
}

// opts: { unit, corner (active warp corner), hot (handle being hovered/dragged) }
export function drawHandles(ctx, c, mode, opts = {}) {
  const u = opts.unit || 1;
  const hs = handlePositions(c, mode, u);
  ctx.save();
  if (mode !== "warp") {
    const b = bbox(c);
    ctx.setLineDash([5 * u, 4 * u]); ctx.lineWidth = 1.25 * u; ctx.strokeStyle = COLORS.accent;
    ctx.strokeRect(b.x0, b.y0, b.w, b.h); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(b.cx, b.y0); ctx.lineTo(b.cx, b.y0 - 24 * u); ctx.stroke();
  }
  for (const h of hs) {
    const hot = opts.hot && opts.hot.kind === h.kind && opts.hot.arg === h.arg;
    ctx.lineWidth = 1.75 * u;
    if (h.kind === "scale") {
      const s = (hot ? 12 : 10) * u;
      ctx.fillStyle = hot ? COLORS.accent : "#fff"; ctx.strokeStyle = COLORS.accent;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(h.x - s / 2, h.y - s / 2, s, s, 2 * u) : ctx.rect(h.x - s / 2, h.y - s / 2, s, s);
      ctx.fill(); ctx.stroke();
    } else if (h.kind === "rotate") {
      ctx.fillStyle = hot ? COLORS.accent : "#16161c"; ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(h.x, h.y, 6.5 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (h.kind === "edge") {
      ctx.fillStyle = hot ? COLORS.accent : "#fff"; ctx.strokeStyle = COLORS.accent;
      ctx.beginPath(); ctx.arc(h.x, h.y, (hot ? 6 : 5) * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      const active = h.arg === opts.corner || hot;
      ctx.strokeStyle = "rgba(255,138,31,0.35)"; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(h.x, h.y, 20 * u, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = active ? "#fff" : COLORS.accent; ctx.strokeStyle = active ? COLORS.accent : "#fff";
      ctx.beginPath(); ctx.arc(h.x, h.y, (active ? 9 : 7.5) * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const ox = h.arg === 1 || h.arg === 2 ? 1 : -1, oy = h.arg >= 2 ? 1 : -1;
      ctx.fillStyle = "#ffd2a8"; ctx.font = `500 ${10 * u}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(["TL", "TR", "BR", "BL"][h.arg], h.x + ox * 26 * u, h.y + oy * 22 * u);
    }
  }
  ctx.restore();
}

// guides: [{x} | {y}] in normalised output coords; rect = frame in canvas px.
export function drawGuides(ctx, guides, view, u = 1) {
  if (!guides || !guides.length) return;
  ctx.save();
  ctx.strokeStyle = COLORS.guide; ctx.lineWidth = 1 * u;
  for (const g of guides) {
    ctx.beginPath();
    if (g.x !== undefined) { const x = view.ox + g.x * view.sx; ctx.moveTo(x, view.oy); ctx.lineTo(x, view.oy + view.sy); }
    else { const y = view.oy + g.y * view.sy; ctx.moveTo(view.ox, y); ctx.lineTo(view.ox + view.sx, y); }
    ctx.stroke();
  }
  ctx.restore();
}
