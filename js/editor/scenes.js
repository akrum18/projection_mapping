// Scenes: one mapped house, several shows. Surfaces and alignment are shared;
// each surface remembers its content and scare per scene in `looks`.
import { app, commit, emit, toast, undo } from "./store.js";
import { cloneState, uid } from "../state.js";
import { themedParams } from "../effects.js";
import { bbox, toPx } from "../geometry.js";

const look = (sf) => ({ content: cloneState(sf.content), scare: cloneState(sf.scare) });
const OFF = () => ({ content: { type: "none" }, scare: { type: "none", duration: 4 } });
export const currentScene = () => app.state.scenes.find((x) => x.id === app.state.scene) || app.state.scenes[0];

// Store what every surface shows now under the active scene.
function saveLooks() {
  for (const sf of app.state.surfaces) { sf.looks ||= {}; sf.looks[app.state.scene] = look(sf); }
}

export function switchScene(id, { quiet = false } = {}) {
  const target = app.state.scenes.find((x) => x.id === id);
  if (!target || id === app.state.scene) return;
  saveLooks();
  for (const sf of app.state.surfaces) {
    const L = sf.looks[id];
    if (L) { sf.content = cloneState(L.content); sf.scare = cloneState(L.scare); }
  }
  app.state.scene = id;
  if (target.theme) app.ui.theme = target.theme;
  commit(); emit("select");
  if (!quiet) toast(`Scene: ${target.name}`);
}

export function nextScene() {
  const list = app.state.scenes;
  if (list.length < 2) return toast("Only one scene. Add another from the show bar.");
  const i = list.findIndex((x) => x.id === app.state.scene);
  switchScene(list[(i + 1) % list.length].id);
}

// Pick a sensible starter effect from each surface's shape and position.
const STARTERS = {
  christmas: { tall: "candycane", roof: "icicles", wide: "lights", big: ["village", "fireplace", "aurora", "sleigh"], other: ["xmastree", "santawindow", "snowman", "wreath", "snowglobe", "ornaments", "gift", "snow"] },
  halloween: { tall: "candle", roof: "blood", wide: "fog", big: ["fireplace", "lightning", "portal"], other: ["watcher", "eyes", "silhouette", "ghost", "spiders", "fire"] },
};
function starterLooks(kind) {
  const S = STARTERS[kind], out = app.state.output, n = { big: 0, other: 0 };
  return app.state.surfaces.map((sf) => {
    const b = bbox(toPx(sf.corners, out));
    const ar = b.w / Math.max(1, b.h), area = (b.w * b.h) / (out.w * out.h);
    let fx;
    if (ar < 0.55) fx = S.tall;
    else if (ar > 3) fx = b.cy / out.h < 0.4 ? S.roof : S.wide;
    else if (area > 0.2) fx = S.big[n.big++ % S.big.length];
    else fx = S.other[n.other++ % S.other.length];
    return {
      content: { type: "effect", effect: fx, params: themedParams(fx, kind) },
      scare: kind === "halloween" ? cloneState(sf.scare) : { type: "none", duration: 4 },
    };
  });
}

function uniqueName(base) {
  const names = new Set(app.state.scenes.map((x) => x.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

// kind: "christmas" | "halloween" | "copy" | "blank"
export function addScene(kind) {
  saveLooks();
  const base = { christmas: "Christmas", halloween: "Halloween", copy: currentScene().name + " copy", blank: "New scene" }[kind];
  const sc = { id: uid(), name: uniqueName(base) };
  if (kind === "christmas" || kind === "halloween") sc.theme = kind;
  const looks = kind === "christmas" || kind === "halloween" ? starterLooks(kind) : null;
  app.state.surfaces.forEach((sf, i) => { sf.looks[sc.id] = kind === "copy" ? look(sf) : kind === "blank" ? OFF() : looks[i]; });
  app.state.scenes.push(sc);
  switchScene(sc.id, { quiet: true });
  toast(looks ? `Added "${sc.name}" with a starter effect on each surface` : `Added "${sc.name}"`);
}

export function renameScene(name) {
  const sc = currentScene();
  name = (name || "").trim();
  if (!name || name === sc.name) return;
  sc.name = name; commit();
}

export function deleteScene() {
  const list = app.state.scenes;
  if (list.length < 2) return toast("A project needs at least one scene");
  const sc = currentScene(), i = list.indexOf(sc);
  switchScene(list[i === 0 ? 1 : i - 1].id, { quiet: true });
  list.splice(list.indexOf(sc), 1);
  for (const sf of app.state.surfaces) delete sf.looks[sc.id];
  commit();
  toast(`Deleted scene "${sc.name}"`, { label: "Undo", fn: undo });
}
