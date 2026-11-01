import { Scene } from "./scene.js";
import { migrate, CHANNEL } from "./state.js";
import { drawOutlines, drawTestPattern, drawHandles, drawGuides, fullView, project } from "./overlay.js";
import { liveSpecs, liveStatus, retryLive } from "./live.js";

const glc = document.getElementById("gl");
const ov = document.getElementById("ov");
const octx = ov.getContext("2d");
const hint = document.getElementById("hint");
const conn = document.getElementById("conn");
const audioBtn = document.getElementById("audio");
const wallBadge = document.getElementById("wall");
const scene = new Scene(glc, { audio: true });
const bc = new BroadcastChannel(CHANNEL);
let state = null;
let edit = { wall: false }; // editor UI state for "edit on wall"
let editSeen = 0;
function setWall(on) {
  document.body.classList.toggle("wall", on);
  wallBadge.hidden = !on;
}
let hintTimer = null;

bc.onmessage = (e) => {
  const m = e.data;
  if (m.type === "state") {
    state = migrate(m.state);
    scene.setState(state);
    conn.textContent = "Connected to editor ✓";
    if (!hintTimer) hintTimer = setTimeout(() => hint.classList.add("hide"), 6000);
  } else if (m.type === "scare") scene.triggerScare(m.ids || null);
  else if (m.type === "ping") sendInfo();
  else if (m.type === "editUI") {
    const was = edit.wall;
    edit = m; editSeen = performance.now();
    setWall(!!m.wall);
    if (m.wall && !was) hint.classList.add("hide");
  }
};

function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { w: Math.max(2, Math.round(innerWidth * dpr)), h: Math.max(2, Math.round(innerHeight * dpr)), dpr };
}
function sendInfo() {
  const { w, h } = size();
  bc.postMessage({ type: "outputInfo", w, h, fullscreen: !!document.fullscreenElement });
}
bc.postMessage({ type: "hello" });
setInterval(sendInfo, 2000);
addEventListener("resize", sendInfo);

// Fall back to the last autosaved project if the editor isn't open.
try {
  const s = localStorage.getItem("pm-state");
  if (s) { state = migrate(JSON.parse(s)); scene.setState(state); }
} catch (e) {}

function frame() {
  const { w, h, dpr } = size();
  scene.render(w, h);
  if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
  octx.clearRect(0, 0, w, h);
  // editor closed or crashed while editing on the wall: don't leave handles on the projector
  if (edit.wall && performance.now() - editSeen > 4000) { edit = { wall: false }; setWall(false); }
  if (state) {
    const v = fullView(w, h);
    if (state.testPattern) drawTestPattern(octx, w, h);
    if (edit.wall) {
      drawOutlines(octx, state, v, { selected: edit.selected, hover: edit.hover, labels: "top", unit: dpr * 1.4 });
      drawGuides(octx, edit.guides, v, dpr * 1.4);
      const s = state.surfaces.find((x) => x.id === edit.selected);
      if (s && !s.locked) drawHandles(octx, project(s.corners, v), edit.mode, { unit: dpr * 1.4, corner: edit.corner, hot: edit.hot });
    } else if (state.showOutlines) drawOutlines(octx, state, v, { labels: "center", unit: dpr });
  }
  audioBtn.style.display = scene.audioBlocked ? "block" : "none";
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

// ---------- edit on wall: forward pointer and keys to the editor ----------
const mods = (e) => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey });
function sendPointer(ev, e) {
  bc.postMessage({ type: "wall", ev, x: e.clientX / innerWidth, y: e.clientY / innerHeight, w: innerWidth, h: innerHeight, mods: mods(e) });
}
ov.addEventListener("pointerdown", (e) => {
  if (!edit.wall || e.button !== 0) return;
  try { ov.setPointerCapture(e.pointerId); } catch (err) {}
  sendPointer("down", e);
});
ov.addEventListener("pointermove", (e) => { if (edit.wall) sendPointer("move", e); });
ov.addEventListener("pointerup", (e) => { if (edit.wall) sendPointer("up", e); });
ov.addEventListener("pointercancel", (e) => { if (edit.wall) sendPointer("up", e); });
const WALL_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Escape", "Delete", "Backspace", "w", "W", "l", "L", "z", "Z", "d", "D", "y", "Y", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

addEventListener("keydown", (e) => {
  if (edit.wall && WALL_KEYS.has(e.key)) {
    e.preventDefault();
    bc.postMessage({ type: "key", key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
    return;
  }
  if (e.key === "f" || e.key === "F") goFullscreen();
  if (e.key === "h" || e.key === "H") hint.classList.toggle("hide");
  if (e.key === "b" || e.key === "B") bc.postMessage({ type: "remote", cmd: "blackout" });
  if (e.key === "o" || e.key === "O") bc.postMessage({ type: "remote", cmd: "outlines" });
  if (e.key === " ") { e.preventDefault(); bc.postMessage({ type: "remote", cmd: "scare" }); }
});
addEventListener("dblclick", (e) => {
  if (edit.wall) { sendPointer("dbl", e); return; }
  goFullscreen();
});
document.addEventListener("fullscreenchange", () => { hint.classList.add("hide"); sendInfo(); });
audioBtn.addEventListener("click", () => scene.enableAudio());

// Live video: screen capture needs one click in this window; camera errors are shown here too.
const liveBox = document.getElementById("liveBox"), liveText = document.getElementById("liveText"), liveBtn = document.getElementById("liveBtn");
let liveNeed = null;
setInterval(() => {
  liveNeed = null;
  for (const spec of liveSpecs(state).values()) {
    const st = liveStatus(spec);
    if (["needs-click", "error", "ended", "unsupported"].includes(st.status)) { liveNeed = { spec, st }; break; }
  }
  liveBox.hidden = !liveNeed;
  if (!liveNeed) return;
  const screen = liveNeed.spec.kind === "screen";
  liveText.textContent = liveNeed.st.status === "unsupported" ? liveNeed.st.error
    : screen ? `${liveNeed.st.error ? liveNeed.st.error + ". " : ""}This show uses a live window.` : liveNeed.st.error || "The camera stream stopped.";
  liveBtn.textContent = screen ? "Start live window" : "Retry camera";
  liveBtn.hidden = liveNeed.st.status === "unsupported";
}, 500);
liveBtn.addEventListener("click", () => { if (liveNeed) retryLive(liveNeed.spec); });

let idle = null;
addEventListener("mousemove", () => {
  document.body.classList.remove("idle");
  clearTimeout(idle);
  idle = setTimeout(() => { if (!edit.wall) document.body.classList.add("idle"); }, 2000);
});

// Auto-fullscreen if opened with ?fs=1 from a user gesture (works in some browsers).
if (new URLSearchParams(location.search).get("fs") === "1") setTimeout(goFullscreen, 300);
