// Thumbnails for effects and media, used by tiles, the layer list and the
// contextual toolbar. Effects are rendered offscreen once and cached.
import { EFFECTS, effectParams } from "./effects.js";

export const isVideoUrl = (u) => /\.(mp4|webm|mov|m4v|ogv|mkv)(\?|#|$)/i.test(u || "");
const TW = 160, TH = 100;
const cache = new Map();
const pending = new Map();

function remember(key, val) {
  cache.set(key, val);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return val;
}

function runEffect(ctx, def, w, h, p, s, frames, t0 = 1) {
  for (let i = 0; i < frames; i++) {
    ctx.save();
    try { def.draw(ctx, w, h, t0 + i / 30, 1 / 30, p, s); } catch (e) { /* ignore broken effect */ }
    ctx.restore();
  }
}

export function effectThumb(name, params) {
  const key = "fx:" + name + ":" + JSON.stringify(params || {});
  if (cache.has(key)) return cache.get(key);
  const def = EFFECTS[name];
  if (!def) return "";
  const c = document.createElement("canvas");
  c.width = TW; c.height = TH;
  const ctx = c.getContext("2d");
  runEffect(ctx, def, TW, TH, effectParams(name, params), {}, 45);
  return remember(key, c.toDataURL("image/png"));
}

// Live preview inside a tile's canvas while it is hovered. Returns a stop fn.
export function animateInto(canvas, name, params) {
  const def = EFFECTS[name];
  if (!def) return () => {};
  const ctx = canvas.getContext("2d");
  const p = effectParams(name, params), s = {};
  let raf = 0, last = performance.now();
  const loop = (now) => {
    if (!canvas.isConnected) return; // tile was re-rendered away while hovered
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    ctx.save();
    try { def.draw(ctx, canvas.width, canvas.height, now / 1000, dt, p, s); } catch (e) {}
    ctx.restore();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

export function mediaThumb(url, onReady) {
  if (!isVideoUrl(url)) return url;
  const key = "vid:" + url;
  if (cache.has(key)) return cache.get(key);
  if (!pending.has(key)) {
    pending.set(key, true);
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.playsInline = true;
    v.src = url;
    const done = (val) => { remember(key, val); pending.delete(key); v.removeAttribute("src"); v.load(); onReady?.(); };
    v.addEventListener("loadeddata", () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch (e) { done(""); } }, { once: true });
    v.addEventListener("seeked", () => {
      try {
        const c = document.createElement("canvas");
        c.width = TW; c.height = Math.round(TW * (v.videoHeight / v.videoWidth || 0.625));
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL("image/jpeg", 0.8));
      } catch (e) { done(""); }
    }, { once: true });
    v.addEventListener("error", () => done(""), { once: true });
  }
  return null;
}

const LIVE_THUMB = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="#10131c"/>' +
  '<circle cx="52" cy="50" r="9" fill="#ff4d4f"/><text x="68" y="58" font-family="sans-serif" font-weight="700" font-size="24" fill="#fff">LIVE</text></svg>');

// Thumbnail URL for a content spec, or null while a video frame is loading.
export function specThumb(spec, onReady) {
  if (!spec || spec.type === "none") return "";
  if (spec.type === "live") return LIVE_THUMB;
  if (spec.type === "effect") return effectThumb(spec.effect, spec.params);
  return mediaThumb(spec.url, onReady);
}

export function specLabel(spec, media = []) {
  if (!spec || spec.type === "none") return "Nothing";
  if (spec.type === "effect") return EFFECTS[spec.effect]?.label || spec.effect;
  if (spec.type === "live") return spec.kind === "screen" ? "Live: window capture" : `Live: ${spec.label || "camera"}`;
  const m = media.find((x) => x.url === spec.url);
  return m ? m.name : decodeURIComponent((spec.url || "").split("/").pop());
}
