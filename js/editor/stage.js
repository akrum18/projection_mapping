// The stage: projector frame with zoom/pan, live WebGL preview, overlay
// (outlines, handles, guides, loupe, tracing photo), contextual toolbar,
// selection readout and the first-run checklist.
import { Scene } from "../scene.js";
import { drawOutlines, drawHandles, drawGuides, drawTestPattern, project } from "../overlay.js";
import { bbox, toPx, angleOf } from "../geometry.js";
import { specThumb, specLabel } from "../thumbs.js";
import { app, bc, sel, on, emit, outputAlive, addSurface, duplicateSurface, deleteSurface, toggleLock, setMode, select, commit } from "./store.js";
import * as I from "./interact.js";

const $ = (id) => document.getElementById(id);
const stageEl = $("stage"), glc = $("gl"), ov = $("ov"), octx = ov.getContext("2d");
export const scene = new Scene(glc, { audio: false });

const view = { zoom: 1, panX: 0, panY: 0 };
let size = { w: 2, h: 2 };
let frame = { x: 0, y: 0, w: 2, h: 2 };
let pan = null;

function layout() {
  size = { w: stageEl.clientWidth, h: stageEl.clientHeight };
  const m = app.ui.focus ? 0 : 32;
  const ar = app.state.output.w / app.state.output.h;
  let bw = Math.max(2, size.w - m * 2), bh = bw / ar;
  if (bh > size.h - m * 2) { bh = Math.max(2, size.h - m * 2); bw = bh * ar; }
  const w = bw * view.zoom, h = bh * view.zoom;
  frame = { x: (size.w - w) / 2 + view.panX, y: (size.h - h) / 2 + view.panY, w, h };
}
new ResizeObserver(layout).observe(stageEl);

export const space = {
  isStage: true,
  toScreen: ([x, y]) => [frame.x + x * frame.w, frame.y + y * frame.h],
  toNorm: ([x, y]) => [(x - frame.x) / frame.w, (y - frame.y) / frame.h],
  get pxPerOut() { return frame.w / app.state.output.w; },
};

function setZoom(z, cx = size.w / 2, cy = size.h / 2) {
  layout();
  const n = space.toNorm([cx, cy]);
  view.zoom = Math.max(0.25, Math.min(16, z));
  view.panX = 0; view.panY = 0; layout();
  view.panX = cx - n[0] * frame.w - frame.x; view.panY = cy - n[1] * frame.h - frame.y;
  layout(); updateZoomLabel();
}
export const zoomBy = (f) => setZoom(view.zoom * f);
export function fit() { view.zoom = 1; view.panX = 0; view.panY = 0; layout(); updateZoomLabel(); }
function updateZoomLabel() { $("zoomLabel").textContent = Math.abs(view.zoom - 1) < 0.001 && !view.panX && !view.panY ? "Fit" : Math.round(view.zoom * 100) + "%"; }
$("zoomIn").addEventListener("click", () => zoomBy(1.25));
$("zoomOut").addEventListener("click", () => zoomBy(0.8));
$("zoomLabel").addEventListener("click", fit);

// ---------------- pointer input ----------------
const local = (e) => { const r = stageEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const mods = (e) => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey });

ov.addEventListener("pointerdown", (e) => {
  ov.focus({ preventScroll: true });
  const p = local(e);
  try { ov.setPointerCapture(e.pointerId); } catch (err) {}
  if (e.button === 1 || e.button === 2) { pan = { start: p, x: view.panX, y: view.panY }; e.preventDefault(); return; }
  if (e.button !== 0) return;
  const r = I.pointerDown(p, space, mods(e));
  if (r === "pan") pan = { start: p, x: view.panX, y: view.panY };
});
ov.addEventListener("pointermove", (e) => {
  const p = local(e);
  if (pan) {
    view.panX = pan.x + p[0] - pan.start[0]; view.panY = pan.y + p[1] - pan.start[1];
    if (Math.hypot(p[0] - pan.start[0], p[1] - pan.start[1]) > 3) pan.moved = true;
    layout(); updateZoomLabel(); ov.style.cursor = "grabbing"; return;
  }
  if (I.isDragging()) { I.pointerMove(p, space, mods(e)); return; }
  ov.style.cursor = I.hoverAt(p, space);
});
const up = () => { pan = null; I.pointerUp(); };
ov.addEventListener("pointerup", up);
ov.addEventListener("pointercancel", up);
ov.addEventListener("pointerleave", () => { if (!I.isDragging()) { app.ui.hover = null; app.ui.hot = null; } });
ov.addEventListener("dblclick", (e) => I.doubleClick(local(e), space));
ov.addEventListener("contextmenu", (e) => e.preventDefault());
ov.addEventListener("wheel", (e) => {
  e.preventDefault();
  const p = local(e);
  const k = e.ctrlKey ? 0.01 : 0.0015; // pinch-zoom on trackpads arrives as ctrl+wheel
  setZoom(view.zoom * Math.exp(-e.deltaY * k), p[0], p[1]);
}, { passive: false });

// Drop a content tile (effect or media) onto a surface, or onto empty stage to create one.
stageEl.addEventListener("dragover", (e) => {
  if (!e.dataTransfer.types.includes("application/x-pm-content")) return;
  e.preventDefault(); e.stopPropagation();
  e.dataTransfer.dropEffect = "copy";
  app.ui.hover = I.hitSurface(local(e), space)?.id || null;
});
stageEl.addEventListener("drop", (e) => {
  const raw = e.dataTransfer.getData("application/x-pm-content");
  if (!raw) return;
  e.preventDefault(); e.stopPropagation();
  const spec = JSON.parse(raw), p = local(e);
  const s = I.hitSurface(p, space);
  if (s) { s.content = spec; select(s.id); commit(); }
  else {
    const [nx, ny] = space.toNorm(p), hw = 0.12, hh = 0.12 * (app.state.output.w / app.state.output.h) * 0.75;
    addSurface(spec, [[nx - hw, ny - hh], [nx + hw, ny - hh], [nx + hw, ny + hh], [nx - hw, ny + hh]]);
  }
  app.ui.hover = null;
});

// ---------------- edit on wall (pointer events from the output window) ----------------
export function wallEvent(m) {
  if (!app.ui.wall) return;
  const ws = {
    toScreen: ([x, y]) => [x * m.w, y * m.h],
    toNorm: ([x, y]) => [x / m.w, y / m.h],
    pxPerOut: m.w / app.state.output.w,
  };
  const p = [m.x * m.w, m.y * m.h];
  if (m.ev === "down") I.pointerDown(p, ws, m.mods || {});
  else if (m.ev === "move") { if (I.isDragging()) I.pointerMove(p, ws, m.mods || {}); else I.hoverAt(p, ws); }
  else if (m.ev === "up") I.pointerUp();
  else if (m.ev === "dbl") I.doubleClick(p, ws);
}

// ---------------- contextual toolbar ----------------
const ctxbar = $("ctxbar"), lockbar = $("lockbar");
ctxbar.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("ctxContent").addEventListener("click", () => emit("openTab", "content"));
$("ctxDup").addEventListener("click", () => duplicateSurface());
$("ctxLock").addEventListener("click", () => toggleLock());
$("ctxDel").addEventListener("click", () => deleteSurface());
$("lockUnlock").addEventListener("click", () => toggleLock());

function refreshCtx() {
  const s = sel();
  ctxbar.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === app.ui.mode));
  if (!s) return;
  const url = specThumb(s.content, refreshCtx);
  $("ctxThumb").style.backgroundImage = url ? `url("${url}")` : "none";
  $("ctxLabel").textContent = specLabel(s.content, app.media);
}
on("select", refreshCtx); on("change", refreshCtx); on("ui", refreshCtx); on("media", refreshCtx);

function place(el, b) {
  const w = el.offsetWidth, h = el.offsetHeight;
  let top = b.y0 - h - 46;
  if (top < 8) top = b.y1 + 16;
  if (top + h > size.h - 56) top = Math.max(8, Math.min(size.h - h - 56, b.y0 + 8));
  const left = Math.max(8, Math.min(size.w - w - 8, b.cx - w / 2));
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function updateFloating() {
  const s = sel();
  const visible = s && !app.ui.dragging;
  let b = null;
  if (s) { b = bbox(s.corners.map(space.toScreen)); if (b.x1 < 0 || b.x0 > size.w || b.y1 < 0 || b.y0 > size.h) b = null; }
  ctxbar.hidden = !(visible && b && !s.locked);
  lockbar.hidden = !(visible && b && s.locked);
  if (!ctxbar.hidden) place(ctxbar, b);
  if (!lockbar.hidden) place(lockbar, b);
  const ro = $("readout");
  if (s) {
    const pb = bbox(toPx(s.corners, app.state.output));
    const txt = `${Math.round(pb.w)} × ${Math.round(pb.h)}   x ${Math.round(pb.x0)}  y ${Math.round(pb.y0)}   ${Math.round(angleOf(toPx(s.corners, app.state.output)))}°`;
    if (ro.textContent !== txt) ro.textContent = txt;
    ro.hidden = false;
    const ft = `${s.name}  ${Math.round(pb.w)}×${Math.round(pb.h)}`;
    if ($("fsSel").textContent !== ft) $("fsSel").textContent = ft;
  } else { ro.hidden = true; $("fsSel").textContent = "No selection"; }
  // first-run checklist
  const empty = app.state.surfaces.length === 0;
  $("firstRun").hidden = !empty;
  if (empty) {
    const alive = outputAlive();
    $("frStep1").classList.toggle("done", alive);
    $("frOutputText").textContent = alive ? `Connected: ${app.output.info.w} × ${app.output.info.h}${app.output.info.fullscreen ? ", fullscreen" : ""}.` : "Open the output window and drag it onto the projector screen.";
    $("frOpenOutput").hidden = alive;
  }
}
$("frAdd").addEventListener("click", () => addSurface());
$("frOpenOutput").addEventListener("click", () => emit("openOutput"));

// ---------------- render loop ----------------
const refImg = new Image();
let refUrl = "";
function refImage() {
  const r = app.state.reference;
  if (!r || !r.url) return null;
  if (r.url !== refUrl) { refUrl = r.url; refImg.src = r.url; }
  return refImg.complete && refImg.naturalWidth ? refImg : null;
}

let lastUI = "", lastUISent = 0;
function broadcastUI() {
  const d = I.currentDrag();
  const ui = { type: "editUI", wall: app.ui.wall, selected: app.ui.selected, mode: app.ui.mode, corner: app.ui.selCorner, guides: app.ui.guides, hot: app.ui.hot, hover: app.ui.hover, dragging: !!d };
  const sig = JSON.stringify(ui);
  // resend once a second as a heartbeat so the output drops wall mode if the editor goes away
  const now = performance.now();
  if (sig !== lastUI || now - lastUISent > 1000) { lastUI = sig; lastUISent = now; bc.postMessage(ui); }
}

function drawLoupe(ctx, dpr, pt, s) {
  const Z = 4, R = 64 * dpr;
  let lx = pt[0] * dpr - 96 * dpr, ly = pt[1] * dpr - 96 * dpr;
  if (lx < R + 8 * dpr) lx = pt[0] * dpr + 96 * dpr;
  if (ly < R + 8 * dpr) ly = pt[1] * dpr + 96 * dpr;
  const px = pt[0] * dpr, py = pt[1] * dpr;
  ctx.save();
  ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = "#000"; ctx.fill(); ctx.clip();
  ctx.setTransform(Z, 0, 0, Z, lx - Z * px, ly - Z * py);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(glc, parseFloat(glc.style.left) * dpr, parseFloat(glc.style.top) * dpr, glc.width, glc.height);
  const img = refImage();
  if (img && app.state.reference.show) { ctx.globalAlpha = app.state.reference.opacity; ctx.drawImage(img, frame.x * dpr, frame.y * dpr, frame.w * dpr, frame.h * dpr); ctx.globalAlpha = 1; }
  const c = project(s.corners, { sx: frame.w * dpr, sy: frame.h * dpr, ox: frame.x * dpr, oy: frame.y * dpr });
  ctx.strokeStyle = "#ff8a1f"; ctx.lineWidth = 1.5 / Z;
  ctx.beginPath(); c.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(lx - 10 * dpr, ly); ctx.lineTo(lx + 10 * dpr, ly); ctx.moveTo(lx, ly - 10 * dpr); ctx.lineTo(lx, ly + 10 * dpr); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "#ff8a1f"; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function frameLoop() {
  layout();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // GL canvas covers only the visible part of the projector frame
  const vx0 = Math.max(0, frame.x), vy0 = Math.max(0, frame.y);
  const vx1 = Math.min(size.w, frame.x + frame.w), vy1 = Math.min(size.h, frame.y + frame.h);
  const vw = Math.max(1, vx1 - vx0), vh = Math.max(1, vy1 - vy0);
  Object.assign(glc.style, { left: vx0 + "px", top: vy0 + "px", width: vw + "px", height: vh + "px", display: vx1 > vx0 && vy1 > vy0 ? "block" : "none" });
  scene.render(Math.round(vw * dpr), Math.round(vh * dpr), { sx: frame.w * dpr, sy: frame.h * dpr, ox: (frame.x - vx0) * dpr, oy: (frame.y - vy0) * dpr });

  const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
  if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
  const ctx = octx, st = app.state;
  const v = { sx: frame.w * dpr, sy: frame.h * dpr, ox: frame.x * dpr, oy: frame.y * dpr };
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(v.ox, v.oy, v.sx, v.sy); ctx.clip();
  const img = refImage();
  if (img && st.reference.show) { ctx.globalAlpha = st.reference.opacity; ctx.drawImage(img, v.ox, v.oy, v.sx, v.sy); ctx.globalAlpha = 1; }
  if (st.testPattern) { ctx.translate(v.ox, v.oy); drawTestPattern(ctx, Math.round(v.sx), Math.round(v.sy)); ctx.setTransform(1, 0, 0, 1, 0, 0); }
  if (st.blackout) {
    ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.fillRect(v.ox, v.oy, v.sx, v.sy);
    ctx.fillStyle = "#ff8a8d"; ctx.font = `700 ${14 * dpr}px Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("PROJECTOR BLACKED OUT  ·  press B to restore", v.ox + v.sx / 2, v.oy + v.sy / 2);
  }
  ctx.restore();
  // fullscreen is a clean preview: no frame border, and only the selected/hovered surface is outlined
  if (!app.ui.focus) { ctx.strokeStyle = "#34343f"; ctx.lineWidth = 1 * dpr; ctx.strokeRect(v.ox - 0.5, v.oy - 0.5, v.sx + 1, v.sy + 1); }
  if (app.ui.wall) {
    ctx.fillStyle = "#34d399"; ctx.font = `600 ${11 * dpr}px Inter, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("EDITING ON WALL: handles are showing on the projector", v.ox, v.oy - 6 * dpr);
  }
  const s = sel();
  drawOutlines(ctx, st, v, { selected: app.ui.selected, labels: "top", unit: dpr, hover: app.ui.hover, all: !app.ui.focus });
  drawGuides(ctx, app.ui.guides, v, dpr);
  if (s && !s.locked) drawHandles(ctx, project(s.corners, v), app.ui.mode, { unit: dpr, corner: app.ui.selCorner, hot: I.currentDrag() ? { kind: I.currentDrag().kind, arg: I.currentDrag().arg } : app.ui.hot });
  const d = I.currentDrag();
  if (s && d && d.moved && d.pointer && (d.kind === "corner" || d.kind === "edge")) drawLoupe(ctx, dpr, d.pointer, s);
  updateFloating();
  broadcastUI();
  requestAnimationFrame(frameLoop);
}

export function start() {
  layout(); updateZoomLabel(); refreshCtx();
  requestAnimationFrame(frameLoop);
}
