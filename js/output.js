import { Scene } from "./scene.js";
import { migrate, CHANNEL } from "./state.js";
import { drawOutlines, drawTestPattern } from "./overlay.js";

const glc = document.getElementById("gl");
const ov = document.getElementById("ov");
const octx = ov.getContext("2d");
const hint = document.getElementById("hint");
const conn = document.getElementById("conn");
const audioBtn = document.getElementById("audio");
const scene = new Scene(glc, { audio: true });
const bc = new BroadcastChannel(CHANNEL);
let state = null;
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
};

function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { w: Math.max(2, Math.round(innerWidth * dpr)), h: Math.max(2, Math.round(innerHeight * dpr)) };
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
  const { w, h } = size();
  scene.render(w, h);
  if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
  octx.clearRect(0, 0, w, h);
  if (state) {
    if (state.testPattern) drawTestPattern(octx, w, h);
    if (state.showOutlines) drawOutlines(octx, state, w, h, { labels: true });
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
addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") goFullscreen();
  if (e.key === "h" || e.key === "H") hint.classList.toggle("hide");
  if (e.key === "b" || e.key === "B") bc.postMessage({ type: "remote", cmd: "blackout" });
  if (e.key === " ") bc.postMessage({ type: "remote", cmd: "scare" });
});
addEventListener("dblclick", goFullscreen);
document.addEventListener("fullscreenchange", () => { hint.classList.add("hide"); sendInfo(); });
audioBtn.addEventListener("click", () => scene.enableAudio());

let idle = null;
addEventListener("mousemove", () => {
  document.body.classList.remove("idle");
  clearTimeout(idle);
  idle = setTimeout(() => document.body.classList.add("idle"), 2000);
});

// Auto-fullscreen if opened with ?fs=1 from a user gesture (works in some browsers).
if (new URLSearchParams(location.search).get("fs") === "1") setTimeout(goFullscreen, 300);
