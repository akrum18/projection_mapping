// Direct manipulation of surfaces: move, resize, rotate, warp corners/edges,
// with smart-guide snapping. Independent of the DOM so the same code drives
// the editor stage and "edit on wall" in the projector window.
//
// A `space` describes the screen the pointer is on:
//   toScreen([nx, ny]) -> [x, y] in CSS px;  toNorm([x, y]) -> [nx, ny]
//   pxPerOut: CSS px per output pixel (for snapping thresholds)
import { app, sel, sync, commit, select, setMode, emit, toast } from "./store.js";
import { pointInQuad } from "../state.js";
import { handlePositions } from "../overlay.js";
import { bbox, toPx, toNorm, translate, scaleFromHandle, rotate, snapBox, snapPoint, distToSegment } from "../geometry.js";

let drag = null;
export const isDragging = () => !!drag;
export const currentDrag = () => drag;

function hitHandle(pt, space) {
  const s = sel();
  if (!s || s.locked) return null;
  const cs = s.corners.map(space.toScreen);
  let best = null;
  for (const h of handlePositions(cs, app.ui.mode, 1)) {
    const d = Math.hypot(h.x - pt[0], h.y - pt[1]);
    const r = h.r + 4;
    // corners and resize handles win over edge midpoints when they overlap
    const score = d + (h.kind === "edge" ? 3 : 0);
    if (d <= r && (!best || score < best.score)) best = { ...h, score };
  }
  return best;
}

export function hitSurface(pt, space) {
  const n = space.toNorm(pt);
  const list = app.state.surfaces;
  // the selected surface gets priority so you can grab it even under others
  const s = sel();
  if (s && pointInQuad(n, s.corners)) return s;
  for (let i = list.length - 1; i >= 0; i--) if (pointInQuad(n, list[i].corners)) return list[i];
  for (let i = list.length - 1; i >= 0; i--) {
    const cs = list[i].corners.map(space.toScreen);
    for (let k = 0; k < 4; k++) if (distToSegment(pt, cs[k], cs[(k + 1) % 4]) < 6) return list[i];
  }
  return null;
}

export function hoverAt(pt, space) {
  if (drag) return drag.cursor;
  const h = hitHandle(pt, space);
  app.ui.hot = h ? { kind: h.kind, arg: h.arg } : null;
  if (h) { app.ui.hover = null; return h.cursor; }
  const s = hitSurface(pt, space);
  app.ui.hover = s ? s.id : null;
  return s ? (s.locked ? "pointer" : "move") : "default";
}

function snapTargets(excludeId, withCorners) {
  const out = app.state.output;
  const xs = [0, out.w / 2, out.w], ys = [0, out.h / 2, out.h];
  for (const s of app.state.surfaces) {
    if (s.id === excludeId || !s.visible) continue;
    const c = toPx(s.corners, out), b = bbox(c);
    xs.push(b.x0, b.cx, b.x1); ys.push(b.y0, b.cy, b.y1);
    if (withCorners) for (const [x, y] of c) { xs.push(x); ys.push(y); }
  }
  return { xs, ys };
}

const outPt = (pt, space) => { const n = space.toNorm(pt), o = app.state.output; return [n[0] * o.w, n[1] * o.h]; };

// Returns "pan" when the press landed on empty space (the stage pans),
// true when a drag started, false otherwise.
export function pointerDown(pt, space, mods = {}) {
  const h = hitHandle(pt, space);
  const s0 = sel();
  if (h && s0) {
    if (h.kind === "corner") app.ui.selCorner = h.arg;
    startDrag(h.kind, h.arg, s0, pt, space, h.cursor === "grab" ? "grabbing" : h.cursor);
    return true;
  }
  const s = hitSurface(pt, space);
  if (!s) {
    if (app.ui.selected) select(null);
    return "pan";
  }
  if (s.id !== app.ui.selected) select(s.id);
  else if (app.ui.selCorner >= 0) { app.ui.selCorner = -1; emit("select"); }
  startDrag(s.locked ? "locked" : "move", null, s, pt, space, s.locked ? "not-allowed" : "move");
  return true;
}

function startDrag(kind, arg, s, pt, space, cursor) {
  drag = {
    kind, arg, id: s.id, cursor, startScreen: pt, start: outPt(pt, space),
    orig: toPx(s.corners, app.state.output), moved: false,
  };
}

export function pointerMove(pt, space, mods = {}) {
  if (!drag) return;
  const s = app.state.surfaces.find((x) => x.id === drag.id);
  if (!s) { drag = null; return; }
  if (!drag.moved && Math.hypot(pt[0] - drag.startScreen[0], pt[1] - drag.startScreen[1]) < 3) return;
  if (!drag.moved) {
    drag.moved = true;
    if (drag.kind === "locked") toast(`"${s.name}" is locked. Press L or click Unlock to move it.`);
    app.ui.dragging = drag.kind !== "locked";
    emit("ui");
  }
  if (drag.kind === "locked") return;
  const out = app.state.output;
  const p = outPt(pt, space);
  let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
  const o = drag.orig;
  const snapping = app.ui.snap && !(mods.ctrl || mods.meta);
  const thr = 8 / (space.pxPerOut || 1);
  let c, guides = [];
  switch (drag.kind) {
    case "move": {
      if (snapping) { const r = snapBox(o, dx, dy, snapTargets(s.id, false), thr); dx = r.dx; dy = r.dy; guides = r.guides; }
      c = translate(o, dx, dy);
      break;
    }
    case "scale":
      c = scaleFromHandle(o, drag.arg, dx, dy, { keep: mods.shift, center: mods.alt });
      break;
    case "rotate": {
      const b = bbox(o);
      let a = Math.atan2(p[1] - b.cy, p[0] - b.cx) - Math.atan2(drag.start[1] - b.cy, drag.start[0] - b.cx);
      if (mods.shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      c = rotate(o, a, b.cx, b.cy);
      drag.angle = (a * 180) / Math.PI;
      break;
    }
    case "corner": {
      c = o.map((q) => q.slice());
      let q = [o[drag.arg][0] + dx, o[drag.arg][1] + dy];
      if (snapping) { const r = snapPoint(q, snapTargets(s.id, true), thr); q = r.p; guides = r.guides; }
      c[drag.arg] = q;
      break;
    }
    case "edge": {
      c = o.map((q) => q.slice());
      for (const i of [drag.arg, (drag.arg + 1) % 4]) c[i] = [o[i][0] + dx, o[i][1] + dy];
      break;
    }
    default: return;
  }
  s.corners = toNorm(c, out);
  app.ui.guides = guides.map((g) => (g.x !== undefined ? { x: g.x / out.w } : { y: g.y / out.h }));
  drag.pointer = space.isStage ? pt : null; // the loupe only makes sense on the editor stage
  sync();
}

export function pointerUp() {
  if (!drag) return;
  const d = drag; drag = null;
  app.ui.guides = []; app.ui.dragging = false;
  if (d.moved && d.kind !== "locked") commit();
  emit("ui");
}

export function doubleClick(pt, space) {
  const s = hitSurface(pt, space);
  if (!s) return;
  select(s.id);
  if (s.locked) return toast(`"${s.name}" is locked. Press L to unlock.`);
  setMode(app.ui.mode === "warp" ? "transform" : "warp");
  toast(app.ui.mode === "warp" ? "Warp: drag the corner pins onto the object" : "Resize: drag handles to resize, round handle to rotate");
}
