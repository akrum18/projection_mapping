// Editor state: the project (shared with the output window), editor-only UI
// state, undo/redo, persistence and a tiny event bus for the panels.
import { defaultState, newSurface, migrate, cloneState, CHANNEL } from "../state.js";

export const bc = new BroadcastChannel(CHANNEL);
const listeners = {};
export const on = (evt, fn) => (listeners[evt] ||= []).push(fn);
export const emit = (evt, ...a) => (listeners[evt] || []).forEach((fn) => fn(...a));

function loadLocal() {
  try { const s = localStorage.getItem("pm-state"); if (s) return migrate(JSON.parse(s)); } catch (e) {}
  return defaultState(); // empty project -> first-run checklist
}

export const app = {
  state: loadLocal(),
  ui: {
    selected: null, selCorner: -1, mode: "transform", tab: "content", source: "effects",
    snap: true, wall: false, guides: [], dragging: false, hover: null, hot: null, focus: false,
  },
  media: [],
  output: { info: null, seen: -1e9 },
  serverSaved: null, // JSON of the last project saved to / loaded from the server
};
app.ui.selected = app.state.surfaces[app.state.surfaces.length - 1]?.id || null;

let undoStack = [], redoStack = [];
let lastSnapshot = cloneState(app.state);
let saveTimer = null;

export const sel = () => app.state.surfaces.find((s) => s.id === app.ui.selected) || null;
export const outputAlive = () => !!app.output.info && performance.now() - app.output.seen < 5000;
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export const isDirty = () => app.serverSaved !== JSON.stringify(app.state);

// Push the current state to the scene/output/autosave without an undo step
// (used continuously while dragging a slider or a handle).
export function sync() {
  emit("sync");
  bc.postMessage({ type: "state", state: app.state });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem("pm-state", JSON.stringify(app.state)); } catch (e) {} }, 300);
}

// Record an undo step for everything changed since the last commit.
export function commit() {
  const now = JSON.stringify(app.state);
  if (now !== JSON.stringify(lastSnapshot)) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > 150) undoStack.shift();
    redoStack = [];
    lastSnapshot = cloneState(app.state);
  }
  sync();
  emit("change");
}

function fixSelection() {
  if (!sel()) { app.ui.selected = app.state.surfaces[app.state.surfaces.length - 1]?.id || null; app.ui.selCorner = -1; }
}
// Swap in a snapshot; a surface that reappears (e.g. undoing a delete) becomes the selection.
function restore(next) {
  const had = new Set(app.state.surfaces.map((x) => x.id));
  app.state = next; lastSnapshot = cloneState(app.state);
  const back = app.state.surfaces.filter((x) => !had.has(x.id));
  if (back.length) { app.ui.selected = back[back.length - 1].id; app.ui.selCorner = -1; }
  fixSelection(); sync(); emit("change"); emit("select");
}
export function undo() {
  if (!undoStack.length) return toast("Nothing to undo");
  redoStack.push(cloneState(app.state));
  restore(undoStack.pop());
}
export function redo() {
  if (!redoStack.length) return toast("Nothing to redo");
  undoStack.push(cloneState(app.state));
  restore(redoStack.pop());
}
export function replaceState(s, { fromServer = false } = {}) {
  app.state = migrate(s);
  app.ui.selected = null; app.ui.selCorner = -1; fixSelection();
  if (fromServer) app.serverSaved = JSON.stringify(app.state);
  commit(); emit("select");
}
// Change output size without creating an undo step (comes from the output window).
export function setOutputSize(w, h) {
  app.state.output = { w, h };
  lastSnapshot.output = { w, h };
  sync(); emit("change");
}

export function select(id, { corner = -1 } = {}) {
  if (app.ui.selected === id && app.ui.selCorner === corner) return;
  app.ui.selected = id; app.ui.selCorner = corner;
  emit("select");
}
export function setMode(mode) {
  if (app.ui.mode === mode) return;
  app.ui.mode = mode; app.ui.selCorner = mode === "warp" ? app.ui.selCorner : -1;
  emit("ui");
}
export function setUI(patch) { Object.assign(app.ui, patch); emit("ui"); }

export function addSurface(content, corners) {
  const s = newSurface(app.state.surfaces.length);
  if (content) s.content = content;
  if (corners) s.corners = corners;
  app.state.surfaces.push(s);
  app.ui.selected = s.id; app.ui.selCorner = -1; app.ui.mode = "transform";
  commit(); emit("select"); emit("ui");
  return s;
}
export function duplicateSurface(s = sel()) {
  if (!s) return;
  const d = cloneState(s);
  d.id = newSurface().id; d.name = s.name + " copy"; d.locked = false;
  d.corners = d.corners.map(([x, y]) => [x + 0.02, y + 0.02]);
  app.state.surfaces.splice(app.state.surfaces.indexOf(s) + 1, 0, d);
  app.ui.selected = d.id;
  commit(); emit("select");
  toast(`Duplicated "${s.name}"`);
}
export function deleteSurface(s = sel()) {
  if (!s) return;
  const i = app.state.surfaces.indexOf(s);
  app.state.surfaces.splice(i, 1);
  app.ui.selected = app.state.surfaces[Math.min(i, app.state.surfaces.length - 1)]?.id || null; app.ui.selCorner = -1;
  commit(); emit("select");
  toast(`Deleted "${s.name}"`, { label: "Undo", fn: undo });
}
export function toggleLock(s = sel()) {
  if (!s) return;
  s.locked = !s.locked; app.ui.selCorner = -1;
  commit();
  toast(s.locked ? `Locked "${s.name}"` : `Unlocked "${s.name}"`);
}

let toastTimer = null;
export function toast(msg, action = null) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerHTML = "";
  const span = document.createElement("span"); span.textContent = msg; t.appendChild(span);
  if (action) {
    const b = document.createElement("button"); b.textContent = action.label;
    b.addEventListener("click", () => { action.fn(); t.classList.remove("on"); });
    t.appendChild(b);
  }
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), action ? 5000 : 2200);
}
