import { Scene } from "./scene.js";
import { EFFECTS, defaultParams } from "./effects.js";
import { defaultState, newSurface, migrate, cloneState, CHANNEL, pointInQuad } from "./state.js";
import { drawOutlines, drawTestPattern } from "./overlay.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl"), ov = $("ov"), octx = ov.getContext("2d");
const scene = new Scene(glc, { audio: false });
const bc = new BroadcastChannel(CHANNEL);

// ---------------- state / undo / sync ----------------
let state = loadLocal();
let selected = state.surfaces[0]?.id || null;
let selCorner = -1;
let undoStack = [], redoStack = [];
let lastSnapshot = cloneState(state);
let media = [];
let outWin = null, outInfo = null, outSeen = -1e9;

function loadLocal() {
  try { const s = localStorage.getItem("pm-state"); if (s) return migrate(JSON.parse(s)); } catch (e) {}
  const st = defaultState();
  st.surfaces.push(newSurface(0));
  return st;
}
let saveTimer = null;
function sync() {
  scene.setState(state);
  bc.postMessage({ type: "state", state });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem("pm-state", JSON.stringify(state)); } catch (e) {} }, 300);
  updateToggles();
}
function commit() {
  undoStack.push(lastSnapshot);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  lastSnapshot = cloneState(state);
  sync();
  renderSurfaceList();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(cloneState(state));
  state = undoStack.pop(); lastSnapshot = cloneState(state);
  if (!state.surfaces.find((s) => s.id === selected)) selected = state.surfaces[0]?.id || null;
  sync(); renderSurfaceList(); renderProps(); toast("Undo");
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(cloneState(state));
  state = redoStack.pop(); lastSnapshot = cloneState(state);
  sync(); renderSurfaceList(); renderProps(); toast("Redo");
}
function replaceState(s) {
  state = migrate(s); selected = state.surfaces[0]?.id || null; selCorner = -1;
  $("projName").value = state.name || "";
  commit(); renderProps();
}
const sel = () => state.surfaces.find((s) => s.id === selected) || null;

// ---------------- output window ----------------
bc.onmessage = (e) => {
  const m = e.data;
  if (m.type === "hello") sync();
  else if (m.type === "outputInfo") {
    outSeen = performance.now(); outInfo = m;
    if (state.output.w !== m.w || state.output.h !== m.h) { state.output = { w: m.w, h: m.h }; lastSnapshot = cloneState(state); sync(); fitPreview(); }
  } else if (m.type === "remote") handleRemote(m.cmd);
};
async function openOutput() {
  if (outWin && !outWin.closed) { outWin.focus(); return; }
  let features = "popup=yes,width=1280,height=720";
  let url = "output.html";
  try {
    if ("getScreenDetails" in window) {
      const sd = await window.getScreenDetails();
      const other = sd.screens.find((s) => !s.isPrimary) || (sd.screens.length > 1 ? sd.screens[1] : null);
      if (other) {
        features = `popup=yes,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight},fullscreen`;
        url += "?fs=1";
        toast(`Opening on ${other.label || "second screen"}`);
      }
    }
  } catch (e) { /* permission denied or unsupported: fall through */ }
  outWin = window.open(url, "pm-output", features);
  setTimeout(sync, 500);
}
$("btnOutput").addEventListener("click", openOutput);
setInterval(() => {
  const el = $("outStatus");
  const alive = !!outInfo && performance.now() - outSeen < 5000;
  el.classList.toggle("on", alive);
  el.textContent = alive ? `output: ${outInfo.w}×${outInfo.h}${outInfo.fullscreen ? " fullscreen" : ""}` : "output: not open";
}, 1000);
bc.postMessage({ type: "ping" });

// ---------------- remote (phone) via SSE ----------------
function handleRemote(cmd) {
  if (cmd === "scare") scare();
  else if (cmd === "blackout") { state.blackout = !state.blackout; commit(); }
  else if (cmd === "outlines") { state.showOutlines = !state.showOutlines; commit(); }
}
try {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => { try { handleRemote(JSON.parse(e.data).cmd); } catch (err) {} };
} catch (e) {}
$("remoteHint").innerHTML = `Open <code>http://${location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "&lt;this-computer-ip&gt;" : location.hostname}:${location.port}/remote.html</code> on your phone (same Wi‑Fi) for a big SCARE button. The server prints the exact address when it starts.`;

// ---------------- top bar ----------------
function scare() {
  scene.triggerScare(null);
  bc.postMessage({ type: "scare" });
  const b = $("btnScare"); b.classList.add("active"); setTimeout(() => b.classList.remove("active"), 600);
}
$("btnScare").addEventListener("click", scare);
$("btnBlackout").addEventListener("click", () => { state.blackout = !state.blackout; commit(); });
$("btnOutlines").addEventListener("click", () => { state.showOutlines = !state.showOutlines; commit(); });
$("btnTest").addEventListener("click", () => { state.testPattern = !state.testPattern; commit(); });
$("master").addEventListener("input", (e) => { state.brightness = +e.target.value; sync(); });
$("master").addEventListener("change", commit);
function updateToggles() {
  $("btnBlackout").classList.toggle("active", !!state.blackout);
  $("btnOutlines").classList.toggle("active", !!state.showOutlines);
  $("btnTest").classList.toggle("active", !!state.testPattern);
  $("master").value = state.brightness ?? 1;
}

// ---------------- surfaces list ----------------
$("btnAdd").addEventListener("click", () => addSurface());
function addSurface(content) {
  const s = newSurface(state.surfaces.length);
  if (content) s.content = content;
  state.surfaces.push(s); selected = s.id; selCorner = -1;
  commit(); renderProps();
}
function renderSurfaceList() {
  const ul = $("surfaceList"); ul.innerHTML = "";
  state.surfaces.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = s.id === selected ? "sel" : "";
    li.innerHTML = `<span class="num">${i + 1}</span><span class="eye ${s.visible ? "on" : ""}" title="Toggle visible">👁</span><span class="name"></span><button class="small up" title="Move down in stack (draw earlier)">▲</button><button class="small down" title="Move up in stack (draw later)">▼</button>`;
    li.querySelector(".name").textContent = s.name;
    li.addEventListener("click", () => { selected = s.id; selCorner = -1; renderSurfaceList(); renderProps(); });
    li.querySelector(".eye").addEventListener("click", (e) => { e.stopPropagation(); s.visible = !s.visible; commit(); });
    li.querySelector(".up").addEventListener("click", (e) => { e.stopPropagation(); if (i > 0) { state.surfaces.splice(i, 1); state.surfaces.splice(i - 1, 0, s); commit(); } });
    li.querySelector(".down").addEventListener("click", (e) => { e.stopPropagation(); if (i < state.surfaces.length - 1) { state.surfaces.splice(i, 1); state.surfaces.splice(i + 1, 0, s); commit(); } });
    ul.appendChild(li);
  });
}

// ---------------- properties panel ----------------
function field(label, ctl, valEl) {
  const f = document.createElement("div"); f.className = "field";
  const l = document.createElement("span"); l.textContent = label;
  const c = document.createElement("div"); c.className = "ctl"; c.appendChild(ctl); if (valEl) c.appendChild(valEl);
  f.append(l, c); return f;
}
function rangeField(label, get, set, min, max, step) {
  const r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = get();
  const v = document.createElement("span"); v.className = "val"; v.textContent = fmt(get());
  r.addEventListener("input", () => { set(+r.value); v.textContent = fmt(+r.value); sync(); });
  r.addEventListener("change", commit);
  return field(label, r, v);
}
const fmt = (n) => (Math.abs(n) >= 10 ? Math.round(n) : +n.toFixed(2)).toString();
function selectField(label, options, get, set) {
  const s = document.createElement("select");
  for (const o of options) { const op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.disabled) op.disabled = true; s.appendChild(op); }
  s.value = get();
  s.addEventListener("change", () => { set(s.value); commit(); });
  return field(label, s);
}
function textField(label, get, set) {
  const i = document.createElement("input"); i.type = "text"; i.value = get();
  i.addEventListener("input", () => { set(i.value); sync(); });
  i.addEventListener("change", commit);
  return field(label, i);
}
function colorField(label, get, set) {
  const i = document.createElement("input"); i.type = "color"; i.value = get();
  i.addEventListener("input", () => { set(i.value); sync(); });
  i.addEventListener("change", commit);
  return field(label, i);
}
function checkField(items) {
  const d = document.createElement("div"); d.className = "checks";
  for (const [label, get, set] of items) {
    const l = document.createElement("label"); const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!get();
    c.addEventListener("change", () => { set(c.checked); commit(); });
    l.append(c, label); d.appendChild(l);
  }
  return d;
}
function contentOptions(includeNone) {
  const opts = [];
  if (includeNone) opts.push({ value: "none", label: "— none —" });
  opts.push({ value: "", label: "── Effects ──", disabled: true });
  for (const [k, v] of Object.entries(EFFECTS)) opts.push({ value: "effect:" + k, label: v.label });
  if (media.length) {
    opts.push({ value: "", label: "── Media ──", disabled: true });
    for (const m of media) opts.push({ value: "media:" + m.url, label: `${m.kind === "video" ? "🎬" : "🖼"} ${m.name}` });
  }
  return opts;
}
function specValue(spec) {
  if (!spec || spec.type === "none") return "none";
  if (spec.type === "effect") return "effect:" + spec.effect;
  return "media:" + spec.url;
}
function specFromValue(v, prev) {
  if (v === "none") return { type: "none", duration: prev?.duration ?? 4 };
  if (v.startsWith("effect:")) {
    const effect = v.slice(7);
    const params = prev?.type === "effect" && prev.effect === effect ? prev.params : defaultParams(effect);
    return { type: "effect", effect, params, duration: prev?.duration ?? 4 };
  }
  return { type: "media", url: v.slice(6), duration: prev?.duration ?? 4 };
}
function effectParamFields(spec, container) {
  const def = EFFECTS[spec.effect]; if (!def) return;
  spec.params = { ...defaultParams(spec.effect), ...(spec.params || {}) };
  for (const [k, d] of Object.entries(def.params)) {
    const get = () => spec.params[k], set = (v) => { spec.params[k] = v; };
    if (d.type === "range") container.appendChild(rangeField(d.label, get, set, d.min, d.max, d.step));
    else if (d.type === "color") container.appendChild(colorField(d.label, get, set));
    else if (d.type === "text") container.appendChild(textField(d.label, get, set));
    else if (d.type === "select") container.appendChild(selectField(d.label, d.options.map((o) => ({ value: o, label: o })), get, set));
  }
}
function renderProps() {
  const p = $("props"); p.innerHTML = ""; p.className = "panel right props";
  const s = sel();
  if (!s) { p.innerHTML = '<p class="hint">Select or add a surface.</p>'; return; }
  const h = (t) => { const e = document.createElement("h3"); e.textContent = t; p.appendChild(e); };
  h("Surface");
  p.appendChild(textField("Name", () => s.name, (v) => { s.name = v; renderSurfaceList(); }));
  p.appendChild(rangeField("Opacity", () => s.opacity, (v) => (s.opacity = v), 0, 1, 0.01));
  p.appendChild(rangeField("Brightness", () => s.brightness, (v) => (s.brightness = v), 0, 2, 0.01));
  p.appendChild(colorField("Tint", () => s.tint, (v) => (s.tint = v)));
  p.appendChild(selectField("Blend", [{ value: "normal", label: "Normal" }, { value: "add", label: "Add (glow)" }, { value: "multiply", label: "Multiply" }], () => s.blend, (v) => (s.blend = v)));
  p.appendChild(rangeField("Soft edge", () => s.feather, (v) => (s.feather = v), 0, 0.5, 0.01));
  p.appendChild(checkField([["Flip H", () => s.flipH, (v) => (s.flipH = v)], ["Flip V", () => s.flipV, (v) => (s.flipV = v)], ["Visible", () => s.visible, (v) => (s.visible = v)]]));

  h("Content");
  p.appendChild(selectField("Source", contentOptions(false), () => specValue(s.content), (v) => { s.content = specFromValue(v, s.content); renderProps(); }));
  if (s.content.type === "effect") effectParamFields(s.content, p);
  if (s.content.type === "media") {
    const isVideo = /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(s.content.url);
    if (isVideo) {
      p.appendChild(rangeField("Speed", () => s.speed, (v) => (s.speed = v), 0.25, 3, 0.05));
      p.appendChild(checkField([["Sound on output", () => !s.muted, (v) => (s.muted = !v)]]));
      p.appendChild(rangeField("Volume", () => s.volume, (v) => (s.volume = v), 0, 1, 0.01));
    }
  }
  h("Crop (texture window)");
  const cr = s.crop;
  p.appendChild(rangeField("Left", () => cr[0], (v) => (cr[0] = Math.min(v, cr[2] - 0.01)), 0, 1, 0.005));
  p.appendChild(rangeField("Top", () => cr[1], (v) => (cr[1] = Math.min(v, cr[3] - 0.01)), 0, 1, 0.005));
  p.appendChild(rangeField("Right", () => cr[2], (v) => (cr[2] = Math.max(v, cr[0] + 0.01)), 0, 1, 0.005));
  p.appendChild(rangeField("Bottom", () => cr[3], (v) => (cr[3] = Math.max(v, cr[1] + 0.01)), 0, 1, 0.005));

  h("Scare (Space / remote)");
  p.appendChild(selectField("Scare source", contentOptions(true), () => specValue(s.scare), (v) => { s.scare = specFromValue(v, s.scare); renderProps(); }));
  if (s.scare.type !== "none") {
    const isVideo = s.scare.type === "media" && /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(s.scare.url);
    if (!isVideo) p.appendChild(rangeField("Duration (s)", () => s.scare.duration ?? 4, (v) => (s.scare.duration = v), 0.5, 30, 0.5));
    else p.appendChild(Object.assign(document.createElement("p"), { className: "hint", textContent: "Plays the whole video once, then returns to the normal content." }));
    if (s.scare.type === "effect") effectParamFields(s.scare, p);
    const tb = document.createElement("button"); tb.className = "small"; tb.textContent = "Test this scare";
    tb.addEventListener("click", () => { scene.triggerScare([s.id]); bc.postMessage({ type: "scare", ids: [s.id] }); });
    p.appendChild(tb);
  }

  h("Corners");
  s.corners.forEach((c, i) => {
    const row = document.createElement("div"); row.className = "field";
    const l = document.createElement("span"); l.textContent = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"][i];
    const ctl = document.createElement("div"); ctl.className = "ctl";
    for (const k of [0, 1]) {
      const n = document.createElement("input"); n.type = "number"; n.step = 1; n.style.width = "70px";
      n.value = Math.round(c[k] * (k ? state.output.h : state.output.w));
      n.addEventListener("change", () => { c[k] = +n.value / (k ? state.output.h : state.output.w); commit(); });
      ctl.appendChild(n);
    }
    row.append(l, ctl); p.appendChild(row);
  });
  const btns = document.createElement("div"); btns.className = "btns";
  const mk = (t, fn, cls = "small") => { const b = document.createElement("button"); b.className = cls; b.textContent = t; b.addEventListener("click", fn); btns.appendChild(b); };
  mk("Reset corners", () => { s.corners = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]; commit(); renderProps(); });
  mk("Fill screen", () => { s.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; commit(); renderProps(); });
  mk("Duplicate", () => { const d = cloneState(s); d.id = newSurface().id; d.name += " copy"; d.corners = d.corners.map(([x, y]) => [x + 0.03, y + 0.03]); state.surfaces.splice(state.surfaces.indexOf(s) + 1, 0, d); selected = d.id; commit(); renderProps(); });
  mk("Delete", () => deleteSurface(s), "small danger");
  p.appendChild(btns);
}
function deleteSurface(s) {
  const i = state.surfaces.indexOf(s); if (i < 0) return;
  state.surfaces.splice(i, 1);
  selected = state.surfaces[Math.min(i, state.surfaces.length - 1)]?.id || null; selCorner = -1;
  commit(); renderProps(); toast("Surface deleted (Ctrl+Z to undo)");
}

// ---------------- preview canvas & mouse ----------------
let css = { w: 2, h: 2 };
function fitPreview() {
  const wrap = $("previewWrap");
  const W = wrap.clientWidth - 16, H = wrap.clientHeight - 16;
  const ar = state.output.w / state.output.h;
  let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
  css = { w: Math.max(2, Math.floor(w)), h: Math.max(2, Math.floor(h)) };
  for (const c of [glc, ov]) { c.style.width = css.w + "px"; c.style.height = css.h + "px"; }
}
new ResizeObserver(fitPreview).observe($("previewWrap"));
fitPreview();

function frame() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(css.w * dpr), h = Math.round(css.h * dpr);
  scene.render(w, h);
  if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
  octx.clearRect(0, 0, w, h);
  if (state.testPattern) drawTestPattern(octx, w, h);
  if (state.blackout) { octx.fillStyle = "rgba(0,0,0,0.6)"; octx.fillRect(0, 0, w, h); octx.fillStyle = "#f55"; octx.font = `bold ${h / 12}px sans-serif`; octx.textAlign = "center"; octx.fillText("BLACKOUT", w / 2, h / 2); }
  drawOutlines(octx, state, w, h, { selected, handles: true, corner: selCorner });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

let drag = null;
const toNorm = (e) => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
ov.addEventListener("pointerdown", (e) => {
  const p = toNorm(e);
  const hitR = 12 / css.w;
  const s = sel();
  if (s) {
    for (let i = 0; i < 4; i++) {
      const c = s.corners[i];
      if (Math.hypot((c[0] - p[0]) * css.w, (c[1] - p[1]) * css.h) < 12) {
        selCorner = i; drag = { mode: "corner", s, i, start: p, orig: [...c] };
        try { ov.setPointerCapture(e.pointerId); } catch (err) {} return;
      }
    }
  }
  for (let i = state.surfaces.length - 1; i >= 0; i--) {
    const sf = state.surfaces[i];
    if (pointInQuad(p, sf.corners)) {
      if (selected !== sf.id) { selected = sf.id; renderSurfaceList(); renderProps(); }
      selCorner = -1;
      drag = { mode: "move", s: sf, start: p, orig: sf.corners.map((c) => [...c]) };
      try { ov.setPointerCapture(e.pointerId); } catch (err) {} return;
    }
  }
});
ov.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = toNorm(e);
  const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
  if (drag.mode === "corner") { drag.s.corners[drag.i] = [drag.orig[0] + dx, drag.orig[1] + dy]; }
  else drag.s.corners = drag.orig.map(([x, y]) => [x + dx, y + dy]);
  sync();
});
ov.addEventListener("pointerup", () => { if (drag) { drag = null; commit(); renderProps(); } });

addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveProject(); return; }
  if (e.key === " ") { e.preventDefault(); scare(); return; }
  const k = e.key.toLowerCase();
  if (k === "b") { state.blackout = !state.blackout; commit(); return; }
  if (k === "o") { state.showOutlines = !state.showOutlines; commit(); return; }
  if (k === "t") { state.testPattern = !state.testPattern; commit(); return; }
  if (/^[1-9]$/.test(e.key)) { const sf = state.surfaces[+e.key - 1]; if (sf) { selected = sf.id; selCorner = -1; renderSurfaceList(); renderProps(); } return; }
  const s = sel(); if (!s) return;
  if (e.key === "Delete" || e.key === "Backspace") { deleteSurface(s); return; }
  if (e.key === "Tab") { e.preventDefault(); selCorner = (selCorner + 1) % 4; return; }
  if (e.key === "Escape") { selCorner = -1; return; }
  const step = (e.shiftKey ? 10 : 1);
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const dx = (d[0] * step) / state.output.w, dy = (d[1] * step) / state.output.h;
  if (selCorner >= 0) { s.corners[selCorner][0] += dx; s.corners[selCorner][1] += dy; }
  else s.corners = s.corners.map(([x, y]) => [x + dx, y + dy]);
  sync();
  clearTimeout(window._nudgeCommit); window._nudgeCommit = setTimeout(() => { commit(); renderProps(); }, 400);
});

// ---------------- media ----------------
async function refreshMedia() {
  try { media = await (await fetch("/api/media")).json(); } catch (e) { media = []; }
  const ul = $("mediaList"); ul.innerHTML = "";
  if (!media.length) ul.innerHTML = '<li class="hint">No media yet. Drop files here or into the media/ folder, then ↻.</li>';
  for (const m of media) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="kind">${m.kind === "video" ? "🎬" : "🖼"}</span><span class="name"></span><button class="small" title="Use as scare clip">scare</button>`;
    li.querySelector(".name").textContent = m.name;
    li.title = "Click: set as content of selected surface. 'scare': set as its scare clip.";
    li.addEventListener("click", () => { const s = sel(); const spec = { type: "media", url: m.url }; if (s) { s.content = spec; commit(); renderProps(); } else addSurface(spec); });
    li.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); const s = sel(); if (!s) return toast("Select a surface first"); s.scare = { type: "media", url: m.url, duration: 4 }; commit(); renderProps(); });
    ul.appendChild(li);
  }
  renderProps();
}
$("btnRefreshMedia").addEventListener("click", refreshMedia);
let dragDepth = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("dropHint").classList.add("on"); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("dropHint").classList.remove("on"); } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => {
  e.preventDefault(); dragDepth = 0; $("dropHint").classList.remove("on");
  const files = [...(e.dataTransfer?.files || [])];
  for (const f of files) {
    if (f.name.endsWith(".json")) { try { replaceState(JSON.parse(await f.text())); toast("Project imported"); } catch (err) { toast("Bad JSON"); } continue; }
    toast(`Uploading ${f.name}…`);
    try {
      const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: "PUT", body: f });
      const j = await r.json();
      toast(j.ok ? `Uploaded ${j.name}` : `Upload failed: ${j.error}`);
    } catch (err) { toast("Upload failed"); }
  }
  refreshMedia();
});

// ---------------- projects ----------------
async function refreshProjects() {
  let list = [];
  try { list = await (await fetch("/api/projects")).json(); } catch (e) {}
  const s = $("projList"); s.innerHTML = "";
  if (!list.length) s.innerHTML = "<option value=''>(no saved projects)</option>";
  for (const n of list) { const o = document.createElement("option"); o.value = n; o.textContent = n; s.appendChild(o); }
}
async function saveProject() {
  const name = $("projName").value.trim() || "halloween";
  state.name = name;
  try {
    const r = await fetch(`/api/project/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(state) });
    toast(r.ok ? `Saved "${name}"` : "Save failed");
  } catch (e) { toast("Save failed (server not running?)"); }
  refreshProjects();
}
$("btnSave").addEventListener("click", saveProject);
$("btnLoad").addEventListener("click", async () => {
  const name = $("projList").value; if (!name) return;
  try { replaceState(await (await fetch(`/api/project/${encodeURIComponent(name)}`)).json()); toast(`Loaded "${name}"`); } catch (e) { toast("Load failed"); }
});
$("btnExport").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }));
  a.download = (state.name || "project") + ".json"; a.click();
});
$("btnImport").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { replaceState(JSON.parse(await f.text())); toast("Project imported"); } catch (err) { toast("Bad JSON"); }
  e.target.value = "";
});
$("btnNew").addEventListener("click", () => { const st = defaultState(); st.surfaces.push(newSurface(0)); replaceState(st); toast("New project (Ctrl+Z to undo)"); });

// ---------------- misc ----------------
let toastTimer = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2200); }

$("projName").value = state.name || "";
sync(); renderSurfaceList(); renderProps(); refreshMedia(); refreshProjects();

// Debug handle (handy in the browser console): pm.state(), pm.scene, pm.scare()
window.pm = { scene, state: () => state, scare, sync, commit, undo, redo, debug: () => ({ undo: undoStack.length, redo: redoStack.length, selected, selCorner, last: lastSnapshot.surfaces.length }) };
