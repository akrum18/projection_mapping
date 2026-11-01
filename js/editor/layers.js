// Surfaces list: thumbnails, visibility, lock, rename, drag to reorder.
import { app, on, select, commit, toggleLock } from "./store.js";
import { specThumb, specLabel } from "../thumbs.js";

const ul = document.getElementById("surfaceList");
let dragId = null;

const icon = (id) => `<svg class="i"><use href="#${id}"/></svg>`;

export function renderLayers() {
  ul.innerHTML = "";
  const list = app.state.surfaces;
  if (!list.length) {
    ul.innerHTML = '<li class="empty">No surfaces yet. Click Add, or drag an effect from the right-hand panel onto the stage.</li>';
    return;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const li = document.createElement("li");
    li.className = (s.id === app.ui.selected ? "sel " : "") + (s.visible ? "" : "hidden-s");
    li.draggable = true;
    li.dataset.id = s.id;
    li.innerHTML = `
      <button class="lmain" title="Click to select · double-click to rename · drag to reorder">
        <span class="num">${i + 1}</span><span class="lthumb"></span>
        <span class="ltext"><span class="lname"></span><span class="lfx"></span></span>
      </button>
      <button class="icon eye" aria-pressed="${!s.visible}">${icon(s.visible ? "i-eye" : "i-eyeoff")}</button>
      <button class="icon lock ${s.locked ? "on" : ""}" aria-pressed="${s.locked}">${icon(s.locked ? "i-lock" : "i-unlock")}</button>`;
    li.querySelector(".lname").textContent = s.name;
    li.querySelector(".lfx").textContent = specLabel(s.content, app.media) + (s.scare?.type !== "none" ? " · scare" : "");
    const url = specThumb(s.content, renderLayers);
    if (url) li.querySelector(".lthumb").style.backgroundImage = `url("${url}")`;
    const eye = li.querySelector(".eye"), lock = li.querySelector(".lock");
    eye.setAttribute("aria-label", (s.visible ? "Hide " : "Show ") + s.name);
    eye.title = s.visible ? "Hide on projector" : "Show on projector";
    lock.setAttribute("aria-label", (s.locked ? "Unlock " : "Lock ") + s.name);
    lock.title = s.locked ? "Unlock position · L" : "Lock position · L";

    const main = li.querySelector(".lmain");
    main.addEventListener("click", () => select(s.id));
    main.addEventListener("dblclick", () => rename(li, s));
    eye.addEventListener("click", () => { s.visible = !s.visible; commit(); });
    lock.addEventListener("click", () => { select(s.id); toggleLock(s); });

    li.addEventListener("dragstart", (e) => {
      dragId = s.id;
      e.dataTransfer.setData("application/x-pm-layer", s.id);
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => li.classList.add("dragging"));
    });
    li.addEventListener("dragend", () => { dragId = null; clearMarks(); renderLayers(); });
    li.addEventListener("dragover", (e) => {
      if (!dragId || dragId === s.id) return;
      e.preventDefault(); e.stopPropagation();
      const r = li.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
      clearMarks(); li.classList.add(above ? "drop-above" : "drop-below");
    });
    li.addEventListener("drop", (e) => {
      if (!dragId || dragId === s.id) return;
      e.preventDefault(); e.stopPropagation();
      const above = li.classList.contains("drop-above");
      const arr = app.state.surfaces, moving = arr.find((x) => x.id === dragId);
      arr.splice(arr.indexOf(moving), 1);
      const j = arr.indexOf(s);
      // the list is shown top-of-stack first, so "above" means drawn later
      arr.splice(above ? j + 1 : j, 0, moving);
      dragId = null; clearMarks(); commit();
    });
    ul.appendChild(li);
  }
}
function clearMarks() { ul.querySelectorAll(".drop-above,.drop-below").forEach((x) => x.classList.remove("drop-above", "drop-below")); }

function rename(li, s) {
  const main = li.querySelector(".lmain");
  const input = document.createElement("input");
  input.type = "text"; input.value = s.name; input.setAttribute("aria-label", "Surface name");
  main.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = (save) => {
    if (done) return; done = true;
    if (save && input.value.trim()) { s.name = input.value.trim(); commit(); } else renderLayers();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); e.stopPropagation(); });
  input.addEventListener("blur", () => finish(true));
}

on("change", renderLayers);
on("select", renderLayers);
on("media", renderLayers);
