// Editor entry point: wires the top bar, show bar, fullscreen mode, keyboard,
// output window, phone remote, media uploads, projects and the tracing photo.
import { app, bc, on, emit, sel, sync, commit, undo, redo, replaceState, setOutputSize, select, setMode, setUI,
  duplicateSurface, deleteSurface, toggleLock, addSurface, toast, outputAlive, canUndo, canRedo, isDirty } from "./editor/store.js";
import { scene, start, fit, zoomBy, wallEvent, space } from "./editor/stage.js";
import { renderLayers } from "./editor/layers.js";
import { switchScene, nextScene, addScene, renameScene, deleteScene, currentScene } from "./editor/scenes.js";
import { render as renderInspector } from "./editor/inspector.js";
import { defaultState } from "./state.js";

const $ = (id) => document.getElementById(id);

on("sync", () => scene.setState(app.state));

// ---------------- popovers ----------------
const pops = [["projBtn", "projMenu"], ["btnOutput", "outMenu"], ["btnRemote", "remoteMenu"], ["btnRef", "refMenu"], ["btnScene", "sceneMenu"]];
function closePops(except) {
  for (const [b, p] of pops) if (p !== except) { $(p).hidden = true; $(b).setAttribute("aria-expanded", "false"); }
}
for (const [b, p] of pops) {
  $(b).addEventListener("click", (e) => {
    e.stopPropagation();
    const open = $(p).hidden;
    closePops(p);
    $(p).hidden = !open; $(b).setAttribute("aria-expanded", String(open));
    if (open) emit("popover", p);
  });
  $(p).addEventListener("click", (e) => e.stopPropagation());
}
document.addEventListener("click", () => closePops());

// ---------------- output window ----------------
let outWin = null;
bc.onmessage = (e) => {
  const m = e.data;
  if (m.type === "hello") sync();
  else if (m.type === "outputInfo") {
    const key = m.oid || "local", prev = app.outputs[key], now = performance.now();
    app.outputs[key] = { ...m, via: e.via === "network" && m.via !== "local" ? "network" : m.via || "local", seen: now, first: prev?.first ?? now };
    pickOutput();
  } else if (m.type === "remote") handleRemote(m.cmd);
  else if (m.type === "wall") wallEvent(m);
  else if (m.type === "key") handleKey({ ...m, preventDefault() {}, fromWall: true });
};
// Several projector windows can be connected (this computer and others). The
// output size follows the one most likely on the projector: fullscreen first,
// then one on another computer, then whichever connected first.
function pickOutput() {
  const now = performance.now();
  const live = Object.entries(app.outputs).filter(([, o]) => now - o.seen < 5000)
    .sort(([, x], [, y]) => (y.fullscreen - x.fullscreen) || ((y.via === "network") - (x.via === "network")) || (x.first - y.first));
  app.output.count = live.length;
  app.output.network = live.filter(([, o]) => o.via === "network").length;
  if (!live.length) return;
  const [, o] = live[0];
  app.output.info = o; app.output.seen = o.seen;
  if (app.state.output.w !== o.w || app.state.output.h !== o.h) setOutputSize(o.w, o.h);
}
async function lanHost() {
  if (!/^(localhost|127\.|\[::1\])/.test(location.hostname)) return location.host;
  try { const info = await (await fetch("/api/info")).json(); return `${info.lan}:${info.port}`; } catch (e) { return "<this-computer-ip>:" + location.port; }
}
async function openOutput() {
  if (outWin && !outWin.closed) { outWin.focus(); return; }
  let features = "popup=yes,width=1280,height=720", url = "output.html";
  try {
    if ("getScreenDetails" in window) {
      const sd = await window.getScreenDetails();
      const other = sd.screens.find((s) => !s.isPrimary) || (sd.screens.length > 1 ? sd.screens[1] : null);
      if (other) {
        features = `popup=yes,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight},fullscreen`;
        url += "?fs=1";
        toast(`Opening on ${other.label || "the second screen"}`);
      }
    }
  } catch (e) { /* permission denied or unsupported */ }
  outWin = window.open(url, "pm-output", features);
  setTimeout(sync, 500);
}
on("openOutput", openOutput);
$("outOpenLocal").addEventListener("click", () => { closePops(); openOutput(); });
on("popover", async (p) => {
  if (p !== "outMenu") return;
  const now = performance.now(), list = $("outList");
  list.innerHTML = "";
  const live = Object.values(app.outputs).filter((o) => now - o.seen < 5000);
  if (!live.length) list.innerHTML = '<div class="empty">No projector window connected yet</div>';
  for (const o of live) {
    const row = document.createElement("div"); row.className = "outrow";
    row.textContent = `${o.via === "network" ? "Another computer" : "This computer"} · ${o.w} × ${o.h}${o.fullscreen ? " · fullscreen" : ""}`;
    list.appendChild(row);
  }
  $("outUrl").textContent = `http://${await lanHost()}/output.html`;
});
$("btnWall").addEventListener("click", () => {
  if (!outputAlive() && !app.ui.wall) return toast("Open the projector window first");
  setUI({ wall: !app.ui.wall });
  toast(app.ui.wall ? "Handles are now on the projector. Drag them there with the mouse." : "Edit on wall off");
});
function statusTick() {
  pickOutput();
  const alive = outputAlive(), i = app.output.info, n = app.output.count;
  $("btnOutput").classList.toggle("live", alive);
  $("outStatus").textContent = !alive ? "Projector window" : n > 1 ? `${n} projector windows · ${i.w} × ${i.h}`
    : `Projector${i.via === "network" ? " (network)" : ""} · ${i.w} × ${i.h}${i.fullscreen ? " · fullscreen" : " · windowed"}`;
  if (!alive && app.ui.wall) setUI({ wall: false });
  $("btnWall").setAttribute("aria-pressed", String(app.ui.wall));
}
setInterval(statusTick, 1000);
on("ui", () => $("btnWall").setAttribute("aria-pressed", String(app.ui.wall)));
bc.postMessage({ type: "ping" });

// ---------------- phone remote ----------------
function handleRemote(cmd) {
  if (cmd === "scare") scare();
  else if (cmd === "blackout") toggleFlag("blackout");
  else if (cmd === "outlines") toggleFlag("showOutlines");
  else if (cmd === "nextScene") nextScene();
}
bc.connectRelay(); // phone remote commands and projector windows on other computers
on("popover", async (p) => { if (p === "remoteMenu") $("remoteUrl").textContent = `http://${await lanHost()}/remote.html`; });

// ---------------- show bar ----------------
let lastShow = performance.now();
function scare() {
  lastShow = performance.now();
  scene.triggerScare(null);
  bc.postMessage({ type: "scare" });
  for (const b of [$("btnScare"), $("fsScare")]) { b.classList.add("fire"); setTimeout(() => b.classList.remove("fire"), 600); }
}
function toggleFlag(k) { app.state[k] = !app.state[k]; commit(); }
$("btnScare").addEventListener("click", scare);
// Auto show: cycles Off → 2 → 5 → 10 → 15 minutes; the editor fires it on schedule
const AUTO_STEPS = [0, 2, 5, 10, 15];
$("btnAuto").addEventListener("click", () => {
  const i = AUTO_STEPS.indexOf(app.state.autoShow || 0);
  app.state.autoShow = AUTO_STEPS[(i + 1) % AUTO_STEPS.length];
  lastShow = performance.now(); commit();
  toast(app.state.autoShow ? `The show runs every ${app.state.autoShow} minutes while the editor is open` : "Auto show off");
});
setInterval(() => { const m = app.state.autoShow || 0; if (m > 0 && performance.now() - lastShow >= m * 60000) scare(); }, 1000);
$("fsScare").addEventListener("click", scare);
$("btnBlackout").addEventListener("click", () => toggleFlag("blackout"));
$("fsBlack").addEventListener("click", () => toggleFlag("blackout"));
$("btnOutlines").addEventListener("click", () => toggleFlag("showOutlines"));
$("btnTest").addEventListener("click", () => toggleFlag("testPattern"));
$("master").addEventListener("input", (e) => { app.state.brightness = +e.target.value; $("masterVal").textContent = Math.round(app.state.brightness * 100) + "%"; sync(); });
$("master").addEventListener("change", commit);
function updateBars() {
  const st = app.state;
  $("btnBlackout").setAttribute("aria-pressed", String(!!st.blackout));
  $("fsBlack").setAttribute("aria-pressed", String(!!st.blackout));
  $("btnOutlines").setAttribute("aria-pressed", String(!!st.showOutlines));
  $("btnTest").setAttribute("aria-pressed", String(!!st.testPattern));
  $("master").value = st.brightness ?? 1;
  $("masterVal").textContent = Math.round((st.brightness ?? 1) * 100) + "%";
  $("btnUndo").disabled = !canUndo(); $("btnRedo").disabled = !canRedo();
  const word = ["christmas", "space"].includes(currentScene()?.theme) ? "SHOW" : "SCARE";
  $("scareLabel").textContent = word; $("fsScareLabel").textContent = word;
  $("autoLabel").textContent = st.autoShow ? `Auto: ${st.autoShow} min` : "Auto: off";
  $("btnAuto").setAttribute("aria-pressed", String(!!st.autoShow));
  $("projTitle").textContent = st.name || "untitled";
  $("saveStatus").textContent = app.serverSaved === null ? (st.surfaces.length ? "Not saved to a project yet" : "") : isDirty() ? "Unsaved changes" : "Saved";
  $("btnSnap").setAttribute("aria-pressed", String(app.ui.snap)); $("btnSnap").classList.toggle("on", app.ui.snap);
  $("btnRef").classList.toggle("on", !!(st.reference.url && st.reference.show));
  document.querySelectorAll("#fsPill [data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === app.ui.mode));
}
on("change", updateBars); on("ui", updateBars); on("select", updateBars);
$("btnUndo").addEventListener("click", undo);
$("btnRedo").addEventListener("click", redo);
$("fsUndo").addEventListener("click", undo);
$("btnAdd").addEventListener("click", () => addSurface());
$("btnSnap").addEventListener("click", () => setUI({ snap: !app.ui.snap }));
document.querySelectorAll("#fsPill [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

// ---------------- fullscreen focus mode ----------------
let idleTimer = null;
function poke(show = true) {
  if (!app.ui.focus) return;
  if (show) document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!$("fsPill").matches(":hover")) document.body.classList.add("idle"); }, 2000);
}
function enterFocus() {
  closePops();
  app.ui.focus = true; document.body.classList.add("focus"); document.body.classList.remove("idle", "hint-off");
  document.documentElement.requestFullscreen?.().catch(() => {});
  setTimeout(() => document.body.classList.add("hint-off"), 5000);
  poke(); fit(); emit("ui");
}
function exitFocus() {
  app.ui.focus = false; document.body.classList.remove("focus", "idle");
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  fit(); emit("ui");
}
const toggleFocus = () => (app.ui.focus ? exitFocus() : enterFocus());
$("btnFull").addEventListener("click", enterFocus);
$("fsExit").addEventListener("click", exitFocus);
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && app.ui.focus) exitFocus(); });
addEventListener("mousemove", (e) => { if (app.ui.focus) poke(e.clientY < 90); });
on("openTab", () => { if (app.ui.focus) exitFocus(); });

// ---------------- phone layout: Surfaces and Edit as bottom sheets ----------------
const isPhone = () => matchMedia("(max-width: 820px)").matches;
const sheetNow = () => (document.body.classList.contains("sheet-layers") ? "layers" : document.body.classList.contains("sheet-edit") ? "edit" : null);
function setSheet(name) {
  const b = document.body;
  b.classList.toggle("sheet-layers", name === "layers");
  b.classList.toggle("sheet-edit", name === "edit");
  b.classList.toggle("sheet-open", !!name);
  $("mobLayers").setAttribute("aria-pressed", String(name === "layers"));
  $("mobEdit").setAttribute("aria-pressed", String(name === "edit"));
  $("mobStage").setAttribute("aria-pressed", String(!name));
}
$("mobLayers").addEventListener("click", () => setSheet(sheetNow() === "layers" ? null : "layers"));
$("mobEdit").addEventListener("click", () => setSheet(sheetNow() === "edit" ? null : "edit"));
$("mobStage").addEventListener("click", () => setSheet(null));
on("openTab", () => { if (isPhone()) setSheet("edit"); });

// ---------------- help ----------------
const openHelp = () => { closePops(); $("helpModal").hidden = false; $("helpClose").focus(); };
$("btnHelp").addEventListener("click", openHelp);
$("helpClose").addEventListener("click", () => ($("helpModal").hidden = true));
$("helpModal").addEventListener("click", (e) => { if (e.target === $("helpModal")) $("helpModal").hidden = true; });

// ---------------- keyboard ----------------
let nudgeTimer = null;
function nudge(dx, dy) {
  const s = sel(); if (!s) return;
  if (s.locked) return toast(`"${s.name}" is locked. Press L to unlock.`);
  const nx = dx / app.state.output.w, ny = dy / app.state.output.h;
  if (app.ui.mode === "warp" && app.ui.selCorner >= 0) { s.corners[app.ui.selCorner][0] += nx; s.corners[app.ui.selCorner][1] += ny; }
  else s.corners = s.corners.map(([x, y]) => [x + nx, y + ny]);
  sync();
  clearTimeout(nudgeTimer); nudgeTimer = setTimeout(commit, 400);
}
function handleKey(e) {
  const k = (e.key || "").toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (!$("helpModal").hidden || !$("camModal").hidden) { if (k === "escape") { $("helpModal").hidden = true; closeCam(); } return; }
  if (mod && k === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && k === "y") { e.preventDefault(); return redo(); }
  if (mod && k === "s") { e.preventDefault(); return saveProject(); }
  if (mod && k === "d") { e.preventDefault(); return duplicateSurface(); }
  if (mod || e.altKey) return;
  if (e.key === " ") { e.preventDefault(); return scare(); }
  if (e.key === "?") return openHelp();
  if (k === "f" && !e.fromWall) return toggleFocus();
  if (k === "b") return toggleFlag("blackout");
  if (k === "o") return toggleFlag("showOutlines");
  if (k === "t") return toggleFlag("testPattern");
  if (e.key === "+" || e.key === "=") return zoomBy(1.25);
  if (e.key === "-" || e.key === "_") return zoomBy(0.8);
  if (e.key === "0") return fit();
  if (/^[1-9]$/.test(e.key)) { const s = app.state.surfaces[+e.key - 1]; if (s) select(s.id); return; }
  if (k === "escape") {
    closePops();
    if (app.ui.selCorner >= 0) { app.ui.selCorner = -1; emit("select"); }
    else if (app.ui.selected) select(null);
    else if (app.ui.focus) exitFocus();
    return;
  }
  const s = sel(); if (!s) return;
  if (k === "w") { if (s.locked) return toast(`"${s.name}" is locked. Press L to unlock.`); return setMode(app.ui.mode === "warp" ? "transform" : "warp"); }
  if (k === "l") return toggleLock(s);
  if (k === "delete" || k === "backspace") { e.preventDefault(); return deleteSurface(s); }
  if (k === "tab") {
    e.preventDefault();
    if (s.locked) return;
    if (app.ui.mode !== "warp") setMode("warp");
    app.ui.selCorner = ((app.ui.selCorner < 0 ? (e.shiftKey ? 0 : -1) : app.ui.selCorner) + (e.shiftKey ? 3 : 1)) % 4;
    return emit("select");
  }
  const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (d) { e.preventDefault(); const step = e.shiftKey ? 10 : 1; nudge(d[0] * step, d[1] * step); }
}
addEventListener("keydown", (e) => {
  const t = document.activeElement;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) {
    if (e.key === "Escape") t.blur();
    return;
  }
  if (t && t.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) { if (e.key === " ") { e.preventDefault(); scare(); } return; }
  handleKey(e);
});

// ---------------- media ----------------
async function refreshMedia() {
  try { app.media = await (await fetch("/api/media")).json(); } catch (e) { app.media = []; }
  emit("media");
}
async function upload(file, name = file.name) {
  const r = await fetch(`/api/upload?name=${encodeURIComponent(name)}`, { method: "PUT", body: file });
  return r.json();
}
async function uploadFiles(files) {
  for (const f of files) {
    if (f.name.endsWith(".json")) { try { replaceState(JSON.parse(await f.text())); toast("Project imported"); } catch (err) { toast("That JSON file isn't a project"); } continue; }
    toast(`Uploading ${f.name}…`);
    try { const j = await upload(f); toast(j.ok ? `Added ${j.name} to My media` : `Upload failed: ${j.error}`); }
    catch (err) { toast("Upload failed (is server.py running?)"); }
  }
  app.ui.source = "media"; app.ui.tab = "content";
  refreshMedia();
}
$("uploadFile").addEventListener("change", (e) => { uploadFiles([...e.target.files]); e.target.value = ""; });
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $("dropHint").classList.add("on"); });
addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $("dropHint").classList.remove("on"); } });
addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $("dropHint").classList.remove("on");
  uploadFiles([...e.dataTransfer.files]);
});

// ---------------- projects ----------------
async function refreshProjects() {
  let list = [];
  try { list = await (await fetch("/api/projects")).json(); } catch (e) {}
  const box = $("projList"); box.innerHTML = "";
  if (!list.length) { box.innerHTML = '<div class="empty">No saved projects yet</div>'; return; }
  for (const n of list) {
    const b = document.createElement("button"); b.className = "mi"; b.textContent = n;
    if (n === app.state.name) b.appendChild(Object.assign(document.createElement("span"), { className: "dim small", textContent: "current" }));
    b.addEventListener("click", () => loadProject(n));
    box.appendChild(b);
  }
}
async function saveProject() {
  const name = ($("projName").value || app.state.name || "halloween").trim();
  app.state.name = name;
  try {
    const r = await fetch(`/api/project/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(app.state) });
    if (r.ok) { app.serverSaved = JSON.stringify(app.state); toast(`Saved "${name}"`); } else toast("Save failed");
  } catch (e) { toast("Save failed (is server.py running?)"); }
  commit(); refreshProjects(); closePops();
}
async function loadProject(name) {
  try { replaceState(await (await fetch(`/api/project/${encodeURIComponent(name)}`)).json(), { fromServer: true }); toast(`Opened "${name}"`); fit(); }
  catch (e) { toast("Couldn't open that project"); }
  closePops();
}
on("popover", (p) => { if (p === "projMenu") { $("projName").value = app.state.name || ""; refreshProjects(); } });
$("projName").addEventListener("keydown", (e) => { if (e.key === "Enter") saveProject(); });
$("projName").addEventListener("change", () => { app.state.name = $("projName").value.trim() || app.state.name; commit(); });
$("mSave").addEventListener("click", saveProject);
$("mNew").addEventListener("click", () => { replaceState({ ...defaultState(), name: "untitled" }); app.serverSaved = null; closePops(); fit(); toast("New project", { label: "Undo", fn: undo }); });
$("mExport").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(app.state, null, 1)], { type: "application/json" }));
  a.download = (app.state.name || "project") + ".json"; a.click();
});
$("mImport").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { replaceState(JSON.parse(await f.text())); toast("Project imported"); } catch (err) { toast("That JSON file isn't a project"); }
  e.target.value = ""; closePops();
});

// ---------------- tracing photo ----------------
function setRef(patch) { Object.assign(app.state.reference, patch); commit(); syncRefMenu(); }
function syncRefMenu() {
  const r = app.state.reference;
  $("refShow").checked = !!r.show; $("refShow").disabled = !r.url;
  $("refNight").checked = !!r.night; $("refNight").disabled = !r.url;
  $("refOpacity").value = r.opacity; $("refRemove").hidden = !r.url;
}
on("popover", (p) => { if (p === "refMenu") syncRefMenu(); });
$("refChoose").addEventListener("click", () => $("refFile").click());
$("refFile").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = await upload(f, "reference-" + f.name); if (j.ok) { setRef({ url: j.url, show: true }); toast("Tracing photo added"); } else toast(j.error); }
  catch (err) { toast("Upload failed (is server.py running?)"); }
  e.target.value = "";
});
$("refShow").addEventListener("change", (e) => setRef({ show: e.target.checked }));
$("refNight").addEventListener("change", (e) => setRef({ night: e.target.checked, show: e.target.checked || app.state.reference.show }));
$("refOpacity").addEventListener("input", (e) => { app.state.reference.opacity = +e.target.value; sync(); });
$("refOpacity").addEventListener("change", commit);
$("refRemove").addEventListener("click", () => setRef({ url: "", show: false }));
let camStream = null;
$("refCam").addEventListener("click", async () => {
  closePops();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } });
    $("camVideo").srcObject = camStream; $("camModal").hidden = false;
  } catch (e) { toast("Couldn't open the camera"); }
});
function closeCam() { $("camModal").hidden = true; camStream?.getTracks().forEach((t) => t.stop()); camStream = null; }
$("camClose").addEventListener("click", closeCam);
$("camShot").addEventListener("click", () => {
  const v = $("camVideo"), c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
  closeCam();
  c.toBlob(async (blob) => {
    try { const j = await upload(blob, `reference-${Date.now()}.jpg`); if (j.ok) { setRef({ url: j.url, show: true }); toast("Tracing photo captured"); } }
    catch (err) { toast("Upload failed"); }
  }, "image/jpeg", 0.9);
});

// ---------------- scenes ----------------
function renderSceneTabs() {
  const box = $("sceneTabs"); box.innerHTML = "";
  for (const sc of app.state.scenes) {
    const b = document.createElement("button");
    b.textContent = sc.name;
    b.className = sc.id === app.state.scene ? "on" : "";
    b.setAttribute("aria-pressed", String(sc.id === app.state.scene));
    b.title = sc.id === app.state.scene ? "Current scene (rename it from the + menu)" : `Switch every surface to "${sc.name}"`;
    b.addEventListener("click", () => switchScene(sc.id));
    box.appendChild(b);
  }
}
on("change", renderSceneTabs);
on("popover", (p) => { if (p === "sceneMenu") { $("sceneName").value = currentScene().name; $("sceneDelete").disabled = app.state.scenes.length < 2; } });
$("sceneName").addEventListener("change", (e) => renameScene(e.target.value));
$("sceneName").addEventListener("keydown", (e) => { if (e.key === "Enter") { renameScene(e.target.value); closePops(); } });
$("sceneDelete").addEventListener("click", () => { deleteScene(); closePops(); });
document.querySelectorAll("#sceneMenu [data-new]").forEach((b) => b.addEventListener("click", () => { addScene(b.dataset.new); closePops(); }));

// ---------------- start ----------------
sync(); renderLayers(); renderInspector(); renderSceneTabs(); updateBars(); start();
refreshMedia();
setInterval(updateBars, 2000);

// Debug handle for the browser console.
window.pm = { app, scene, space, scare, sync, commit, undo, redo, sel };
