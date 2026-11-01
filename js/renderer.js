// Minimal WebGL renderer: draws textured quads with a perspective (homography)
// warp so a flat texture lands correctly on a projected 4-corner surface.
import { hexToRgb01 } from "./state.js";

const VS = `
attribute vec2 aUV;
uniform mat3 uH;
uniform vec2 uRes;
varying vec2 vUV;
void main() {
  vec3 p = uH * vec3(aUV, 1.0);
  // homogeneous pixel coords -> clip space; keeping w gives perspective-correct interpolation
  gl_Position = vec4(2.0 * p.x / uRes.x - p.z, p.z - 2.0 * p.y / uRes.y, 0.0, p.z);
  vUV = aUV;
}`;

const FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform float uOpacity;
uniform float uFeather;
uniform float uKey;
uniform vec4 uCrop;
uniform vec2 uFlip;
uniform vec3 uTint;
void main() {
  vec2 uv = mix(vUV, 1.0 - vUV, uFlip);
  vec2 tuv = mix(uCrop.xy, uCrop.zw, uv);
  vec4 c = texture2D(uTex, tuv);
  // Black is "no light" on a projector, so let it show what's underneath: coverage
  // follows brightness (black = clear, white = solid). Colour is premultiplied, so
  // soft glows and greys add their light without darkening the surface below.
  if (uKey > 0.5) c.a = max(c.r, max(c.g, c.b));
  float e = 1.0;
  if (uFeather > 0.0) {
    e = smoothstep(0.0, uFeather, vUV.x) * smoothstep(0.0, uFeather, 1.0 - vUV.x)
      * smoothstep(0.0, uFeather, vUV.y) * smoothstep(0.0, uFeather, 1.0 - vUV.y);
  }
  c.rgb *= uTint;
  gl_FragColor = c * uOpacity * e;
}`;

// Unit square (0,0),(1,0),(1,1),(0,1) -> quad. Returns column-major mat3.
export function homography(c) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = c;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, cc, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x2 - x1; cc = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0;
  } else {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-9) return null;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; cc = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  return new Float32Array([a, d, g, b, e, h, cc, f, 1]);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext("webgl", { alpha: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false }));
    if (!gl) throw new Error("WebGL not available");
    const prog = (this.prog = gl.createProgram());
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.u = {};
    for (const n of ["uH", "uRes", "uTex", "uOpacity", "uFeather", "uCrop", "uFlip", "uTint", "uKey"]) this.u[n] = gl.getUniformLocation(prog, n);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aUV");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.uniform1i(this.u.uTex, 0);
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.w = w; this.h = h;
  }

  begin() {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.u.uRes, this.w, this.h);
  }

  createTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return tex;
  }

  upload(tex, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (e) {
      /* video not decodable yet */
    }
  }

  deleteTexture(tex) {
    this.gl.deleteTexture(tex);
  }

  // cornersPx: 4 [x,y] in canvas pixels, order TL, TR, BR, BL.
  drawSurface(tex, cornersPx, o) {
    const gl = this.gl;
    const H = homography(cornersPx);
    if (!H) return;
    gl.uniformMatrix3fv(this.u.uH, false, H);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1f(this.u.uOpacity, o.opacity ?? 1);
    gl.uniform1f(this.u.uFeather, o.feather ?? 0);
    gl.uniform1f(this.u.uKey, o.keyBlack && (o.blend || "normal") === "normal" ? 1 : 0);
    const cr = o.crop || [0, 0, 1, 1];
    gl.uniform4f(this.u.uCrop, cr[0], cr[1], cr[2], cr[3]);
    gl.uniform2f(this.u.uFlip, o.flipH ? 1 : 0, o.flipV ? 1 : 0);
    const t = hexToRgb01(o.tint || "#ffffff");
    const b = o.brightness ?? 1;
    gl.uniform3f(this.u.uTint, t[0] * b, t[1] * b, t[2] * b);
    if (o.blend === "add") gl.blendFunc(gl.ONE, gl.ONE);
    else if (o.blend === "multiply") gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
}
