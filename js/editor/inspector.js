// Inspector: tabs for Content, Look, Scare and Position of the selected surface.
import { EFFECTS, THEMES, defaultParams, effectsFor } from "../effects.js";
import { app, bc, on, sel, sync, commit, addSurface } from "./store.js";
import { scene } from "./stage.js";
import { effectThumb, animateInto, mediaThumb, isVideoUrl, specThumb } from "../thumbs.js";
import { liveSupported, liveStatus, listCameras, askCameraPermission, startScreen, retryLive, onLiveChange } from "../live.js";
import { bbox, toPx, toNorm, remapBox, rotate, angleOf } from "../geometry.js";

const root = document.getElementById("inspector");
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fmt = (n) => (Math.abs(n) >= 10 ? Math.round(n) : +n.toFixed(2)).toString();
let uid = 0;

// ---------- small field builders ----------
function range(label, get, set, min, max, step, show = fmt) {
  const row = h("div", "irow"), id = "f" + uid++;
  const l = h("label", null, label); l.htmlFor = id;
  const r = h("input"); r.type = "range"; r.id = id; r.min = min; r.max = max; r.step = step; r.value = get();
  const v = h("span", "val", show(+get()));
  r.addEventListener("input", () => { set(+r.value); v.textContent = show(+r.value); sync(); });
  r.addEventListener("change", commit);
  row.append(l, r, v); return row;
}
function color(label, get, set) {
  const row = h("div", "irow wide"), id = "f" + uid++;
  const l = h("label", null, label); l.htmlFor = id;
  const c = h("input"); c.type = "color"; c.id = id; c.value = get();
  c.addEventListener("input", () => { set(c.value); sync(); });
  c.addEventListener("change", commit);
  row.append(l, c); return row;
}
function text(label, get, set) {
  const row = h("div", "irow wide"), id = "f" + uid++;
  const l = h("label", null, label); l.htmlFor = id;
  const t = h("input"); t.type = "text"; t.id = id; t.value = get();
  t.addEventListener("input", () => { set(t.value); sync(); });
  t.addEventListener("change", commit);
  row.append(l, t); return row;
}
function seg(label, options, get, set) {
  const row = h("div", "irow wide");
  row.appendChild(h("span", null, label));
  const s = h("div", "seg");
  for (const [value, name] of options) {
    const b = h("button", value === get() ? "on" : "", name);
    b.setAttribute("aria-pressed", value === get());
    b.addEventListener("click", () => { set(value); commit(); render(); });
    s.appendChild(b);
  }
  row.appendChild(s); return row;
}
function dropdown(label, options, get, set) {
  const row = h("div", "irow wide"), id = "f" + uid++;
  const l = h("label", null, label); l.htmlFor = id;
  const sl = h("select"); sl.id = id;
  for (const [v, name] of options) { const o = h("option", null, name); o.value = v; sl.appendChild(o); }
  sl.value = get();
  sl.addEventListener("change", () => { set(sl.value); commit(); });
  row.append(l, sl); return row;
}
function toggles(items) {
  const d = h("div", "mrow");
  for (const [label, get, set] of items) {
    const b = h("button", "btn sm", label);
    b.setAttribute("aria-pressed", !!get());
    b.addEventListener("click", () => { set(!get()); commit(); render(); });
    d.appendChild(b);
  }
  return d;
}
function effectParams(spec, box) {
  const def = EFFECTS[spec.effect]; if (!def) return;
  spec.params = { ...defaultParams(spec.effect), ...(spec.params || {}) };
  for (const [k, d] of Object.entries(def.params)) {
    const get = () => spec.params[k], set = (v) => { spec.params[k] = v; };
    if (d.type === "range") box.appendChild(range(d.label, get, set, d.min, d.max, d.step));
    else if (d.type === "color") box.appendChild(color(d.label, get, set));
    else if (d.type === "text") box.appendChild(text(d.label, get, set));
    else if (d.type === "select") {
      const opts = d.options.map((o) => [o, o[0].toUpperCase() + o.slice(1)]);
      // short lists fit a segmented control; longer ones get a dropdown so they don't overflow
      box.appendChild(opts.length <= 3 && d.options.join("").length <= 22 ? seg(d.label, opts, get, set) : dropdown(d.label, opts, get, set));
    }
  }
}

// ---------- content tiles ----------
// Only one tile animates at a time; re-rendering the panel ends it.
let preview = null;
function endPreview() { preview?.end(); preview = null; }
function tile(spec, label, on, pick, { thumb, effect, none } = {}) {
  const b = h("button", "tile" + (on ? " on" : "") + (none ? " none" : ""));
  b.draggable = !none;
  const img = h("span", "timg");
  if (thumb) img.style.backgroundImage = `url("${thumb}")`;
  if (none) img.textContent = "—";
  b.append(img, h("span", null, label));
  b.title = none ? "No scare for this surface" : `${label}: click to use, or drag onto any surface on the stage`;
  b.addEventListener("click", pick);
  if (effect) {
    b.addEventListener("mouseenter", () => {
      endPreview();
      const cv = h("canvas", "timg"); cv.width = 160; cv.height = 100;
      img.replaceWith(cv);
      const stop = animateInto(cv, effect, spec.params);
      preview = { tile: b, end: () => { stop(); if (cv.isConnected) cv.replaceWith(img); } };
    });
    b.addEventListener("mouseleave", () => { if (preview?.tile === b) endPreview(); });
  }
  if (!none) {
    b.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-pm-content", JSON.stringify(spec));
      e.dataTransfer.effectAllowed = "copy";
      document.body.classList.add("content-drag");
    });
    b.addEventListener("dragend", () => document.body.classList.remove("content-drag"));
  }
  return b;
}
const sameSpec = (a, b) => a && b && a.type === b.type && (a.type === "effect" ? a.effect === b.effect : a.type === "media" ? a.url === b.url : true);

// Theme filter chips (All / Halloween / Christmas / Basics) above every effect grid.
function themeChips() {
  const d = h("div", "chips"); d.setAttribute("role", "group"); d.setAttribute("aria-label", "Filter effects by theme");
  for (const [k, name] of THEMES) {
    const b = h("button", "chip" + (app.ui.theme === k ? " on" : ""));
    b.textContent = name; b.title = `${effectsFor(k).length} effects`;
    b.setAttribute("aria-pressed", app.ui.theme === k);
    b.addEventListener("click", () => { app.ui.theme = k; try { localStorage.setItem("pm-theme", k); } catch (e) {} render(); });
    d.appendChild(b);
  }
  return d;
}
function effectTiles(current, choose) {
  const g = h("div", "tiles");
  for (const [k, v] of effectsFor(app.ui.theme)) {
    const spec = { type: "effect", effect: k, params: defaultParams(k) };
    g.appendChild(tile(spec, v.label, sameSpec(current, spec), () => choose(spec), { thumb: effectThumb(k), effect: k }));
  }
  return g;
}
function mediaTiles(current, choose) {
  const wrap = h("div", "details-body");
  const up = h("button", "btn sm");
  up.innerHTML = '<svg class="i sm"><use href="#i-upload"/></svg>Upload videos or images';
  up.addEventListener("click", () => document.getElementById("uploadFile").click());
  wrap.appendChild(up);
  if (!app.media.length) { wrap.appendChild(h("p", "medianote", "Nothing here yet. Upload files, drop them anywhere on this window, or copy them into the media/ folder.")); return wrap; }
  const g = h("div", "tiles");
  for (const m of app.media) {
    const spec = { type: "media", url: m.url };
    g.appendChild(tile(spec, m.name, sameSpec(current, spec), () => choose(spec), { thumb: mediaThumb(m.url, () => render()) || "" }));
  }
  wrap.appendChild(g);
  wrap.appendChild(h("p", "medianote", "MP4 (H.264) or WebM loop everywhere. Videos loop as content and play once as a scare."));
  return wrap;
}

// ---------- live video ----------
const STATUS_TEXT = { live: "Streaming in this preview", starting: "Starting…", "needs-click": "Not streaming yet", ended: "The stream ended", idle: "Waiting for the camera" };
function liveStatusRow(spec) {
  const st = liveStatus(spec);
  const row = h("div", "livestat " + st.status);
  row.append(h("span", "dot"), h("span", null, st.status === "error" || st.status === "unsupported" ? st.error : STATUS_TEXT[st.status] || st.status));
  if (!["live", "starting", "unsupported"].includes(st.status)) {
    const b = h("button", "btn sm on", spec.kind === "screen" ? "Pick window" : "Retry");
    b.addEventListener("click", () => retryLive(spec));
    row.appendChild(b);
  }
  return row;
}
function livePanel(s, body, choose) {
  if (!liveSupported()) {
    body.appendChild(h("p", "medianote", "Live video only works when the editor is opened at http://localhost:8787 on the projector computer. Browsers block cameras and screen capture on other plain-http addresses."));
    return;
  }
  const isLive = s.content.type === "live";
  if (isLive) {
    body.appendChild(liveStatusRow(s.content));
    body.appendChild(h("p", "medianote", s.content.kind === "screen"
      ? "The projector window captures on its own: click its “Start live window” button once, and pick the same window."
      : "The projector window opens the same camera by itself."));
  }
  body.appendChild(h("h4", null, "Camera or capture device"));
  const cams = h("div", "tiles");
  body.appendChild(cams);
  listCameras().then((list) => {
    if (!list.length) { cams.replaceWith(h("p", "medianote", "No cameras found. Plug in a webcam or HDMI capture card, or set your phone up as a camera (see below).")); return; }
    for (const c of list) {
      const spec = { type: "live", kind: "camera", deviceId: c.deviceId, label: c.label };
      cams.appendChild(tile(spec, c.label, isLive && s.content.kind === "camera" && s.content.deviceId === c.deviceId, () => choose(spec), { thumb: specThumb(spec) }));
    }
    if (!list[0].named) {
      const b = h("button", "btn sm", "Allow camera access to show device names");
      b.addEventListener("click", async () => { try { await askCameraPermission(); } catch (e) {} render(); });
      cams.after(b);
    }
  }).catch(() => {});
  body.appendChild(h("h4", null, "A window or screen"));
  const g = h("div", "tiles");
  const screen = { type: "live", kind: "screen" };
  g.appendChild(tile(screen, "Window capture", isLive && s.content.kind === "screen", () => { choose(screen); startScreen(); }, { thumb: specThumb(screen) }));
  body.appendChild(g);
  const det = h("details"); det.appendChild(h("summary", null, "Stream from a phone or another computer"));
  const db = h("div", "details-body medianote");
  db.innerHTML = `
    <p><b>Phone or PC screen (Windows):</b> Settings › System › Projecting to this PC › Optional features, add <b>Wireless Display</b>, turn projecting on, then open the Wireless Display app. Cast from Android (Cast, Smart View or Screen mirroring) or from another Windows PC (Win+K). Pick <b>Window capture</b> here and choose the Wireless Display window.</p>
    <p><b>Phone camera:</b> Windows 11 can use an Android phone as a webcam (Settings › Bluetooth &amp; devices › Mobile devices). Phone webcam apps work too. Either one shows up above as a camera.</p>
    <p><b>Capture card, OBS:</b> HDMI capture dongles and OBS Virtual Camera also show up as cameras.</p>
    <p><b>iPhone:</b> iPhones can't cast to Windows. Use a webcam app, or an AirPlay receiver app on the PC and capture its window.</p>`;
  det.appendChild(db); body.appendChild(det);
}

// ---------- tabs ----------
function contentTab(s, body) {
  const sw = h("div", "seg");
  for (const [k, name] of [["effects", "Effects"], ["media", "My media"], ["live", "Live"]]) {
    const b = h("button", app.ui.source === k ? "on" : "", name);
    b.addEventListener("click", () => { app.ui.source = k; render(); });
    sw.appendChild(b);
  }
  body.appendChild(sw);
  const choose = (spec) => {
    if (spec.type === "effect" && s.content.type === "effect" && s.content.effect === spec.effect) return;
    s.content = spec; commit(); render();
  };
  if (app.ui.source === "live") livePanel(s, body, choose);
  else if (app.ui.source === "media") body.appendChild(mediaTiles(s.content, choose));
  else { body.appendChild(themeChips()); body.appendChild(effectTiles(s.content, choose)); }
  if (s.content.type === "effect") { body.appendChild(h("h4", null, (EFFECTS[s.content.effect]?.label || "Effect") + " settings")); effectParams(s.content, body); }
  if (s.content.type === "media" && isVideoUrl(s.content.url)) {
    body.appendChild(h("h4", null, "Video"));
    body.appendChild(range("Speed", () => s.speed, (v) => (s.speed = v), 0.25, 3, 0.05, (v) => v.toFixed(2) + "×"));
    body.appendChild(toggles([["Sound on projector", () => !s.muted, (v) => (s.muted = !v)]]));
    if (!s.muted) body.appendChild(range("Volume", () => s.volume, (v) => (s.volume = v), 0, 1, 0.01, (v) => Math.round(v * 100) + "%"));
  }
  const det = h("details"); det.appendChild(h("summary", null, "Crop (show part of the image)"));
  const db = h("div", "details-body"), cr = s.crop;
  db.appendChild(range("Left", () => cr[0], (v) => (cr[0] = Math.min(v, cr[2] - 0.01)), 0, 1, 0.005));
  db.appendChild(range("Top", () => cr[1], (v) => (cr[1] = Math.min(v, cr[3] - 0.01)), 0, 1, 0.005));
  db.appendChild(range("Right", () => cr[2], (v) => (cr[2] = Math.max(v, cr[0] + 0.01)), 0, 1, 0.005));
  db.appendChild(range("Bottom", () => cr[3], (v) => (cr[3] = Math.max(v, cr[1] + 0.01)), 0, 1, 0.005));
  det.appendChild(db); body.appendChild(det);
}

function lookTab(s, body) {
  const pct = (v) => Math.round(v * 100) + "%";
  body.appendChild(range("Opacity", () => s.opacity, (v) => (s.opacity = v), 0, 1, 0.01, pct));
  body.appendChild(range("Brightness", () => s.brightness, (v) => (s.brightness = v), 0, 2, 0.01, pct));
  body.appendChild(range("Soft edge", () => s.feather, (v) => (s.feather = v), 0, 0.5, 0.01, pct));
  body.appendChild(color("Tint", () => s.tint, (v) => (s.tint = v)));
  body.appendChild(seg("Blend", [["normal", "Normal"], ["add", "Glow"], ["multiply", "Multiply"]], () => s.blend, (v) => (s.blend = v)));
  body.appendChild(h("p", "medianote", "Glow adds light, so eyes, fire and candles blend nicely over other surfaces. Soft edge fades the borders into darkness."));
  body.appendChild(toggles([["Flip ↔", () => s.flipH, (v) => (s.flipH = v)], ["Flip ↕", () => s.flipV, (v) => (s.flipV = v)], ["Visible", () => s.visible, (v) => (s.visible = v)]]));
}

function scareTab(s, body) {
  body.appendChild(h("p", "medianote", "When SCARE fires (Space, the show bar or the phone remote), this surface switches to the clip below, plays it once, then goes back to its normal content."));
  const choose = (spec) => { s.scare = { ...spec, duration: s.scare?.duration ?? 4 }; commit(); render(); };
  const g = h("div", "tiles");
  g.appendChild(tile({ type: "none" }, "Nothing", s.scare.type === "none", () => choose({ type: "none" }), { none: true }));
  for (const m of app.media) { const spec = { type: "media", url: m.url }; g.appendChild(tile(spec, m.name, sameSpec(s.scare, spec), () => choose(spec), { thumb: mediaThumb(m.url, () => render()) || "" })); }
  for (const [k, v] of effectsFor(app.ui.theme)) { const spec = { type: "effect", effect: k, params: defaultParams(k) }; g.appendChild(tile(spec, v.label, sameSpec(s.scare, spec), () => choose(spec), { thumb: effectThumb(k), effect: k })); }
  if (s.scare.type !== "none") {
    const vid = s.scare.type === "media" && isVideoUrl(s.scare.url);
    if (!vid) body.appendChild(range("Hold for", () => s.scare.duration ?? 4, (v) => (s.scare.duration = v), 0.5, 30, 0.5, (v) => v + " s"));
    else body.appendChild(h("p", "medianote", "Plays the whole video once."));
    if (s.scare.type === "effect") effectParams(s.scare, body);
    const t = h("button", "btn"); t.innerHTML = '<svg class="i"><use href="#i-play"/></svg>Test on this surface only';
    t.addEventListener("click", () => { scene.triggerScare([s.id]); bc.postMessage({ type: "scare", ids: [s.id] }); });
    body.appendChild(t);
  }
  body.appendChild(h("h4", null, "Scare source"));
  body.appendChild(themeChips());
  body.appendChild(g);
}

let posInputs = null;
function posTab(s, body) {
  const out = app.state.output;
  const grid = h("div", "numgrid");
  posInputs = {};
  const field = (key, label, apply) => {
    const w = h("label", "num-in"); w.appendChild(h("span", null, label));
    const i = h("input"); i.type = "number"; i.step = key === "r" ? 1 : 1;
    i.addEventListener("change", () => { if (s.locked) return; apply(+i.value); commit(); });
    i.addEventListener("keydown", (e) => e.stopPropagation());
    w.appendChild(i); grid.appendChild(w); posInputs[key] = i;
  };
  const cur = () => toPx(s.corners, out);
  const setBox = (patch) => { const c = cur(), a = bbox(c); const b = { x0: a.x0, y0: a.y0, w: a.w, h: a.h, ...patch }; s.corners = toNorm(remapBox(c, a, b), out); };
  field("x", "X", (v) => setBox({ x0: v }));
  field("y", "Y", (v) => setBox({ y0: v }));
  field("w", "W", (v) => setBox({ w: Math.max(4, v) }));
  field("h", "H", (v) => setBox({ h: Math.max(4, v) }));
  field("r", "Rot", (v) => { const c = cur(), b = bbox(c); s.corners = toNorm(rotate(c, ((v - angleOf(c)) * Math.PI) / 180, b.cx, b.cy), out); });
  body.appendChild(grid);
  updatePos();
  body.appendChild(h("p", "medianote", `Projector pixels (${out.w} × ${out.h}). Arrow keys nudge 1 px, Shift+arrow 10 px.`));
  const btns = h("div", "mrow");
  const mk = (t, fn) => { const b = h("button", "btn sm", t); b.disabled = s.locked; b.addEventListener("click", () => { fn(); commit(); }); btns.appendChild(b); };
  mk("Fill output", () => (s.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]));
  mk("Straighten", () => { const b = bbox(s.corners); s.corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]; });
  mk("Centre", () => { const b = bbox(s.corners); s.corners = s.corners.map(([x, y]) => [x + 0.5 - b.cx, y + 0.5 - b.cy]); });
  body.appendChild(btns);
  const det = h("details"); det.appendChild(h("summary", null, "Exact corner positions"));
  const db = h("div", "details-body");
  ["Top-left", "Top-right", "Bottom-right", "Bottom-left"].forEach((name, i) => {
    const row = h("div", "irow wide"); row.appendChild(h("span", null, name));
    const pair = h("div", "numgrid");
    for (const k of [0, 1]) {
      const w = h("label", "num-in"); w.appendChild(h("span", null, k ? "Y" : "X"));
      const inp = h("input"); inp.type = "number"; inp.value = Math.round(s.corners[i][k] * (k ? out.h : out.w));
      inp.addEventListener("keydown", (e) => e.stopPropagation());
      inp.addEventListener("change", () => { if (s.locked) return; s.corners[i][k] = +inp.value / (k ? out.h : out.w); commit(); });
      w.appendChild(inp); pair.appendChild(w);
    }
    row.appendChild(pair); db.appendChild(row);
  });
  det.appendChild(db); body.appendChild(det);
  if (s.locked) body.appendChild(h("p", "medianote", "This surface is locked. Unlock it (L) to change its position."));
}
function updatePos() {
  const s = sel();
  if (!posInputs || !s || app.ui.tab !== "pos") return;
  const c = toPx(s.corners, app.state.output), b = bbox(c);
  const vals = { x: b.x0, y: b.y0, w: b.w, h: b.h, r: angleOf(c) };
  for (const [k, v] of Object.entries(vals)) { const i = posInputs[k]; if (i && document.activeElement !== i) i.value = Math.round(v); }
}

// ---------- render ----------
const TABS = [["content", "Content"], ["look", "Look"], ["scare", "Scare"], ["pos", "Position"]];
let renderedFor = "";
export function render() {
  const s = sel();
  // keep the scroll position when re-rendering the same surface and tab (e.g. after a slider change)
  const key = (s ? s.id : "") + ":" + app.ui.tab;
  const prevScroll = key === renderedFor ? root.querySelector(".ibody")?.scrollTop || 0 : 0;
  renderedFor = key;
  endPreview();
  root.innerHTML = ""; posInputs = null;
  if (!s) {
    const e = h("div", "empty-ins");
    e.appendChild(h("p", null, app.state.surfaces.length ? "Select a surface on the stage or in the list to edit it." : "Add a surface to get started. Or drag an effect below straight onto the stage."));
    const b = h("button", "btn"); b.innerHTML = '<svg class="i"><use href="#i-plus"/></svg>Add surface';
    b.addEventListener("click", () => addSurface());
    e.appendChild(b);
    root.appendChild(e);
    const body = h("div", "ibody");
    body.appendChild(h("h4", null, "Effects"));
    body.appendChild(themeChips());
    body.appendChild(effectTiles(null, (spec) => addSurface(spec)));
    root.appendChild(body);
    return;
  }
  const idx = app.state.surfaces.indexOf(s);
  const head = h("div", "ihead");
  const name = h("input"); name.type = "text"; name.value = s.name; name.setAttribute("aria-label", "Surface name");
  name.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") name.blur(); });
  name.addEventListener("change", () => { s.name = name.value.trim() || s.name; commit(); });
  head.append(name, h("span", "dim small", `Surface ${idx + 1} of ${app.state.surfaces.length}${s.locked ? " · locked" : ""}`));
  root.appendChild(head);
  const tabs = h("div", "tabs"); tabs.setAttribute("role", "tablist");
  for (const [k, label] of TABS) {
    const b = h("button", app.ui.tab === k ? "on" : "", label);
    b.setAttribute("role", "tab"); b.setAttribute("aria-selected", app.ui.tab === k);
    b.addEventListener("click", () => { app.ui.tab = k; render(); });
    tabs.appendChild(b);
  }
  root.appendChild(tabs);
  const body = h("div", "ibody");
  ({ content: contentTab, look: lookTab, scare: scareTab, pos: posTab })[app.ui.tab](s, body);
  root.appendChild(body);
  body.scrollTop = prevScroll;
}

on("select", render);
on("change", () => { if (!root.contains(document.activeElement) || document.activeElement.type !== "text") render(); });
on("media", render);
on("sync", updatePos);
on("openTab", (t) => { app.ui.tab = t; render(); });
onLiveChange(() => { const s = sel(); if (s && app.ui.tab === "content" && (app.ui.source === "live" || s.content.type === "live")) render(); });
