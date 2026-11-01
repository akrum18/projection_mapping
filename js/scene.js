// Scene: owns textures/sources for every surface and renders the whole state.
// Used identically by the editor preview and the projector output window.
import { Renderer } from "./renderer.js";
import { EFFECTS, effectParams } from "./effects.js";
import { surfaceSizePx } from "./state.js";

const MAX_FX = 768;

export class Scene {
  constructor(canvas, { audio = false } = {}) {
    this.renderer = new Renderer(canvas);
    this.audio = audio;
    this.audioBlocked = false;
    this.sources = new Map();
    this.scares = new Map(); // surfaceId -> { start, key }
    this.state = null;
    this.lastT = performance.now();
  }

  setState(state) {
    this.state = state;
    // keep video settings in sync
    for (const sf of state.surfaces) {
      for (const slot of ["content", "scare"]) {
        const spec = sf[slot];
        if (!spec || spec.type !== "media") continue;
        const src = this.sources.get(this.keyFor(sf, slot, spec));
        if (src && src.kind === "video") this.applyVideoSettings(src, sf, slot);
      }
    }
  }

  keyFor(sf, slot, spec) {
    if (spec.type === "effect") return `fx:${sf.id}:${slot}`;
    if (spec.type === "media") {
      const isVideo = /\.(mp4|webm|mov|m4v|ogv|mkv)(\?|$)/i.test(spec.url || "");
      if (!isVideo) return `img:${spec.url}`;
      return slot === "scare" ? `vid:${spec.url}:scare:${sf.id}` : `vid:${spec.url}`;
    }
    return null;
  }

  applyVideoSettings(src, sf, slot) {
    const el = src.el;
    const wantSound = this.audio && !sf.muted;
    el.muted = !wantSound || this.audioBlocked;
    el.volume = sf.volume ?? 1;
    el.playbackRate = slot === "scare" ? 1 : sf.speed || 1;
    el.loop = slot !== "scare";
  }

  getSource(sf, slot, spec) {
    const key = this.keyFor(sf, slot, spec);
    if (!key) return null;
    let src = this.sources.get(key);
    if (!src) {
      src = { key, kind: null, tex: this.renderer.createTexture(), ready: false, lastUsed: 0 };
      if (spec.type === "effect") {
        src.kind = "effect";
        src.canvas = document.createElement("canvas");
        src.ctx = src.canvas.getContext("2d");
        src.scratch = {};
      } else if (key.startsWith("img:")) {
        src.kind = "image";
        const img = new Image();
        img.onload = () => { this.renderer.upload(src.tex, img); src.ready = true; };
        img.src = spec.url;
        src.el = img;
      } else {
        src.kind = "video";
        const v = document.createElement("video");
        v.playsInline = true;
        v.preload = "auto";
        v.crossOrigin = "anonymous";
        v.src = spec.url;
        v.muted = true;
        src.el = v;
        src.playing = false;
        if (slot !== "scare") this.playVideo(src, sf, slot);
        else { v.load(); }
      }
      this.sources.set(key, src);
    }
    return src;
  }

  playVideo(src, sf, slot) {
    const el = src.el;
    this.applyVideoSettings(src, sf, slot);
    const attempt = () => el.play().then(() => { src.playing = true; }).catch((err) => {
      if (!el.muted) { // sound blocked by autoplay policy: play muted and flag it
        this.audioBlocked = true;
        el.muted = true;
        el.play().then(() => { src.playing = true; }).catch(() => {});
      }
    });
    attempt();
  }

  // Unlock audio after a user gesture in the output window.
  enableAudio() {
    this.audioBlocked = false;
    if (!this.state) return;
    for (const sf of this.state.surfaces) {
      for (const slot of ["content", "scare"]) {
        const spec = sf[slot];
        if (!spec || spec.type !== "media") continue;
        const src = this.sources.get(this.keyFor(sf, slot, spec));
        if (src && src.kind === "video") {
          this.applyVideoSettings(src, sf, slot);
          if (slot === "content" || this.scares.has(sf.id)) src.el.play().catch(() => {});
        }
      }
    }
  }

  triggerScare(ids = null) {
    if (!this.state) return;
    const now = performance.now();
    for (const sf of this.state.surfaces) {
      if (ids && !ids.includes(sf.id)) continue;
      const spec = sf.scare;
      if (!spec || spec.type === "none" || !sf.visible) continue;
      const src = this.getSource(sf, "scare", spec);
      if (!src) continue;
      if (src.kind === "video") {
        try { src.el.currentTime = 0; } catch (e) {}
        this.playVideo(src, sf, "scare");
      } else if (src.kind === "effect") {
        src.scratch = {}; // restart the effect from fresh
      }
      this.scares.set(sf.id, { start: now, key: src.key });
    }
  }

  scareActive(sf, now) {
    const sc = this.scares.get(sf.id);
    if (!sc) return false;
    const src = this.sources.get(sc.key);
    if (!src) { this.scares.delete(sf.id); return false; }
    const age = now - sc.start;
    let active;
    if (src.kind === "video") {
      const el = src.el;
      if (el.ended) active = false;
      else if (el.readyState < 2) active = age < 8000; // still loading: give up after 8s
      else active = !el.paused || age < 1500;
    } else active = age < (sf.scare.duration || 4) * 1000;
    if (!active) { this.scares.delete(sf.id); if (src.kind === "video") src.el.pause(); }
    return active;
  }

  // Refresh a source's texture for this frame. Returns true when drawable.
  updateSource(src, sf, slot, spec, t, dt, now) {
    src.lastUsed = now;
    if (src.kind === "effect") src.ready = this.updateEffect(src, sf, spec, t, dt);
    else if (src.kind === "video") {
      const el = src.el;
      if (el.readyState >= 2) { this.renderer.upload(src.tex, el); src.ready = true; }
      if (slot === "content" && el.paused && !el.ended && !src.playing && now - (src.playAttempt || 0) > 2000) {
        src.playAttempt = now;
        this.playVideo(src, sf, slot);
      }
    }
    return src.ready;
  }

  updateEffect(src, sf, spec, t, dt) {
    const out = this.state.output;
    const size = surfaceSizePx(sf, out);
    const scale = Math.min(1, MAX_FX / Math.max(size.w, size.h));
    let w = Math.max(32, Math.round((size.w * scale) / 16) * 16), h = Math.max(32, Math.round((size.h * scale) / 16) * 16);
    const def = EFFECTS[spec.effect];
    if (!def) return false;
    if (src.canvas.width !== w || src.canvas.height !== h) {
      // only resize when the aspect changed meaningfully (avoids resetting mid-animation while dragging)
      const curAspect = src.canvas.width / src.canvas.height, newAspect = w / h;
      if (!src.canvas.width || Math.abs(curAspect / newAspect - 1) > 0.12 || Math.abs(src.canvas.width - w) > 160) {
        src.canvas.width = w; src.canvas.height = h; src.scratch = {};
      }
    }
    const p = effectParams(spec.effect, spec.params);
    const ctx = src.ctx;
    ctx.save();
    try { def.draw(ctx, src.canvas.width, src.canvas.height, t, dt, p, src.scratch); } catch (e) { console.warn("effect error", spec.effect, e); }
    ctx.restore();
    this.renderer.upload(src.tex, src.canvas);
    return true;
  }

  // view maps normalised output coords to canvas pixels: px = ox + x * sx.
  // Defaults to filling the canvas; the editor passes one for zoom/pan.
  render(w, h, view = null) {
    const v = view || { sx: w, sy: h, ox: 0, oy: 0 };
    const r = this.renderer;
    r.resize(w, h);
    r.begin();
    const state = this.state;
    if (!state) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const t = now / 1000;
    if (state.blackout) { this.pruneSources(now); return; }

    for (const sf of state.surfaces) {
      // keep scare media warm (preloaded) even when idle
      if (sf.scare && sf.scare.type !== "none") { const s = this.getSource(sf, "scare", sf.scare); if (s) s.lastUsed = now; }
      if (!sf.visible) continue;
      let src = null;
      if (this.scareActive(sf, now)) {
        const ss = this.getSource(sf, "scare", sf.scare);
        if (ss && this.updateSource(ss, sf, "scare", sf.scare, t, dt, now)) src = ss;
      }
      if (!src) {
        const spec = sf.content;
        if (!spec || spec.type === "none") continue;
        const cs = this.getSource(sf, "content", spec);
        if (!cs || !this.updateSource(cs, sf, "content", spec, t, dt, now)) continue;
        src = cs;
      }
      const corners = sf.corners.map(([x, y]) => [v.ox + x * v.sx, v.oy + y * v.sy]);
      r.drawSurface(src.tex, corners, {
        opacity: sf.opacity, feather: sf.feather, crop: sf.crop, flipH: sf.flipH, flipV: sf.flipV,
        brightness: (sf.brightness ?? 1) * (state.brightness ?? 1), tint: sf.tint, blend: sf.blend,
      });
    }
    this.pruneSources(now);
  }

  pruneSources(now) {
    if (now - (this.lastPrune || 0) < 2000) return;
    this.lastPrune = now;
    for (const [key, src] of this.sources) {
      if (now - src.lastUsed > 8000) {
        if (src.kind === "video") { src.el.pause(); src.el.removeAttribute("src"); src.el.load(); }
        this.renderer.deleteTexture(src.tex);
        this.sources.delete(key);
      }
    }
  }
}
