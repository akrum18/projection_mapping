// Live video sources for surfaces:
//   { type: "live", kind: "camera", deviceId, label }  webcams, HDMI capture cards,
//       phone-as-webcam (Windows 11 connected camera, DroidCam…), OBS Virtual Camera
//   { type: "live", kind: "screen" }  a captured window or screen, e.g. the Windows
//       Wireless Display app showing a phone or PC casting to this computer.
// Each window (editor, projector output) opens its own capture. Browsers only allow
// capture on secure origins, which includes http://localhost where this app runs.
// Cameras start on their own once permission is granted; screen capture needs a click.

const entries = new Map(); // key -> { status, stream, video, error }
const listeners = new Set();
export const onLiveChange = (fn) => listeners.add(fn);
const changed = () => listeners.forEach((fn) => fn());

export const liveKey = (spec) => (spec.kind === "screen" ? "screen" : "cam:" + (spec.deviceId || "default"));
export const liveSupported = () => !!(navigator.mediaDevices && window.isSecureContext);

function attach(key, stream) {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.autoplay = true;
  video.srcObject = stream;
  video.play().catch(() => {});
  const e = { status: "live", stream, video };
  entries.set(key, e);
  for (const t of stream.getVideoTracks()) t.addEventListener("ended", () => {
    if (entries.get(key) === e) { entries.set(key, { status: key === "screen" ? "needs-click" : "ended" }); changed(); }
  });
  changed();
}

const videoInputs = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");

// Device ids are not stable across windows (or after re-plugging), so fall back to the
// camera's name, which is saved alongside the id.
async function resolveCamera(spec) {
  if (!spec.deviceId && !spec.label) return null;
  let cams = await videoInputs();
  if (spec.label && !cams.some((c) => c.label)) { await askCameraPermission(); cams = await videoInputs(); }
  const hit = cams.find((c) => c.deviceId === spec.deviceId) || cams.find((c) => c.label && c.label === spec.label);
  if (!hit) throw Object.assign(new Error("not found"), { name: "NotFoundError" });
  return hit.deviceId;
}

async function startCamera(spec) {
  const key = liveKey(spec);
  entries.set(key, { status: "starting" });
  try {
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    const id = await resolveCamera(spec);
    if (id) video.deviceId = { exact: id };
    attach(key, await navigator.mediaDevices.getUserMedia({ video, audio: false }));
  } catch (err) {
    const name = spec.label ? `"${spec.label}"` : "That camera";
    entries.set(key, { status: "error", error: err.name === "NotAllowedError" ? "Camera permission was blocked" : err.name === "NotFoundError" || err.name === "OverconstrainedError" ? `${name} isn't connected` : err.message });
    changed();
  }
}

// Must be called from a click (browsers require a user gesture for screen capture).
export async function startScreen() {
  if (!liveSupported()) return false;
  const old = entries.get("screen");
  old?.stream?.getTracks().forEach((t) => t.stop());
  entries.set("screen", { status: "starting" }); changed();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 }, displaySurface: "window" }, audio: false });
    attach("screen", stream);
    return true;
  } catch (err) {
    entries.set("screen", { status: "needs-click", error: err.name === "NotAllowedError" ? "Window sharing was cancelled" : err.message });
    changed();
    return false;
  }
}

// Video element for a spec, starting a camera if needed. null until frames arrive.
export function liveVideo(spec) {
  if (!liveSupported()) return null;
  const key = liveKey(spec);
  let e = entries.get(key);
  if (!e) {
    if (spec.kind === "screen") { entries.set(key, (e = { status: "needs-click" })); changed(); }
    else { startCamera(spec); return null; }
  }
  return e.status === "live" && e.video.readyState >= 2 ? e.video : null;
}

export function liveStatus(spec) {
  if (!liveSupported()) return { status: "unsupported", error: "Live video needs the editor opened at http://localhost (or HTTPS)." };
  return entries.get(liveKey(spec)) || { status: spec.kind === "screen" ? "needs-click" : "idle" };
}

export function retryLive(spec) {
  const key = liveKey(spec), e = entries.get(key);
  e?.stream?.getTracks().forEach((t) => t.stop());
  entries.delete(key);
  if (spec.kind === "screen") return startScreen();
  startCamera(spec);
}

// Stop captures no surface uses any more (keeps the camera light off when unused).
export function releaseUnused(keys) {
  for (const [key, e] of entries) {
    if (keys.has(key)) continue;
    e.stream?.getTracks().forEach((t) => t.stop());
    entries.delete(key);
  }
}

// Specs in a project that use live video, deduplicated by capture.
export function liveSpecs(state) {
  const out = new Map();
  for (const sf of state?.surfaces || []) {
    for (const spec of [sf.content, sf.scare]) if (spec?.type === "live") out.set(liveKey(spec), spec);
  }
  return out;
}

// Cameras and capture devices. Labels are only filled in after camera permission.
export async function listCameras() {
  if (!liveSupported()) return [];
  return (await videoInputs()).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}`, named: !!d.label }));
}
export async function askCameraPermission() {
  const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  s.getTracks().forEach((t) => t.stop());
}
