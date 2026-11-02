// Shared graphics for the space packs (effects-space.js, effects-deepspace.js):
// 3D value noise, procedural textures for planets and stars, a per-pixel lit
// sphere renderer, and star fields.
//
// Planets are drawn per pixel into a small ImageData buffer (diameter capped at a
// few hundred pixels, then scaled up by the canvas), with lookup tables computed
// once per size so each frame is only texture lookups and lighting.
import { TAU, seeded, clamp } from "./fx-util.js";

// ------------------------------------------------------------------ noise
function hash(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const a = hash(xi, yi, zi, seed), b = hash(xi + 1, yi, zi, seed);
  const c = hash(xi, yi + 1, zi, seed), d = hash(xi + 1, yi + 1, zi, seed);
  const e = hash(xi, yi, zi + 1, seed), f = hash(xi + 1, yi, zi + 1, seed);
  const g = hash(xi, yi + 1, zi + 1, seed), h = hash(xi + 1, yi + 1, zi + 1, seed);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
export function fbm3(x, y, z, oct = 5, seed = 0, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x, y, z, seed + i * 31); n += a;
    x = x * 2.03 + 1.7; y = y * 2.03 - 3.1; z = z * 2.03 + 0.6; a *= gain;
  }
  return s / n;
}
// Sharp creases (cracks, ridges, filaments): 1 at the crease, falling off either side.
export function ridged3(x, y, z, oct = 4, seed = 0) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const r = 1 - Math.abs(2 * noise3(x, y, z, seed + i * 17) - 1);
    s += a * r * r; n += a;
    x *= 2.1; y *= 2.1; z *= 2.1; a *= 0.5;
  }
  return s / n;
}
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (A, B, t) => [mix(A[0], B[0], t), mix(A[1], B[1], t), mix(A[2], B[2], t)];
const RAD = Math.PI / 180;
const unit = (latDeg, lonDeg) => { const la = latDeg * RAD, lo = lonDeg * RAD; return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; };

// Calls fn(i, x, y, z, latDeg, lonDeg) for every texel of a W×H equirectangular map.
// Longitude 0 is the centre of the face you see when the body is not rotated;
// positive longitude is to the right. Texture builders are generators that yield every
// few rows, so big textures can be built in small slices without freezing the page.
function* eachTexel(W, H, fn) {
  for (let j = 0; j < H; j++) {
    if ((j & 3) === 3) yield;
    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat), latD = lat / RAD;
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * TAU;
      fn(j * W + i, cl * Math.sin(lon), sl, cl * Math.cos(lon), latD, lon > Math.PI ? (lon - TAU) / RAD : lon / RAD);
    }
  }
}

// Craters stamped into a height map and an albedo map, in 3D so there is no
// distortion near the poles. list: [{ c: unit vec, r: angular radius (rad), fresh }]
function* stampCraters(W, H, height, albedo, list, depth = 1) {
  let n = 0;
  for (const cr of list) {
    if (++n % 20 === 0) yield;
    const [cx, cy, cz] = cr.c, r = cr.r;
    const lat0 = Math.asin(cy), lon0 = Math.atan2(cx, cz);
    const j0 = Math.max(0, Math.floor((0.5 - (lat0 + r * 2.2) / Math.PI) * H)), j1 = Math.min(H - 1, Math.ceil((0.5 - (lat0 - r * 2.2) / Math.PI) * H));
    for (let j = j0; j <= j1; j++) {
      const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      const span = cl < 0.05 ? Math.PI : Math.min(Math.PI, (r * 2.2) / cl);
      const i0 = Math.floor(((lon0 - span) / TAU) * W), i1 = Math.ceil(((lon0 + span) / TAU) * W);
      for (let ii = i0; ii <= i1; ii++) {
        const i = ((ii % W) + W) % W, lon = ((i + 0.5) / W) * TAU;
        const dot = cl * Math.sin(lon) * cx + sl * cy + cl * Math.cos(lon) * cz;
        const d = Math.acos(Math.min(1, dot)) / r;
        if (d > 2.2) continue;
        const k = j * W + i;
        // bowl, raised rim, then a faint ejecta blanket
        let hgt = d < 1 ? -(1 - d * d) * 0.9 + 0.35 * d ** 6 : 0.35 * Math.exp(-(((d - 1) / 0.18) ** 2)) + 0.06 * Math.exp(-(d - 1) * 2.5);
        if (cr.peak && d < 0.22) hgt += 0.5 * (1 - d / 0.22);
        height[k] += hgt * depth * Math.min(1, r * 25);
        if (albedo && cr.fresh) albedo[k] *= 1 + cr.fresh * (d < 1.15 ? 0.45 : 0.25 * Math.exp(-(d - 1.15) * 3));
      }
    }
  }
}
function randomCraters(rng, n, rMin, rMax, avoid) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const u = rng() * 2 - 1, a = rng() * TAU, s = Math.sqrt(1 - u * u);
    const c = [s * Math.sin(a), u, s * Math.cos(a)];
    const r = rMin * Math.pow(rMax / rMin, Math.pow(rng(), 2.6)); // many small, few large
    if (avoid && avoid(c) && rng() < 0.8) continue;
    out.push({ c, r, fresh: rng() < 0.12 ? 0.5 + rng() * 0.5 : 0, peak: r > 0.04 });
  }
  return out;
}
// Bright ray systems (Tycho, Copernicus): streaks along great circles from a crater.
function* stampRays(W, H, albedo, center, len, n, seed, strength) {
  const rng = seeded(seed), dirs = Array.from({ length: n }, () => [rng() * TAU, 0.6 + rng() * 0.8, 0.02 + rng() * 0.05]);
  const [cx, cy, cz] = center;
  // local frame at the centre
  const ex = [cz, 0, -cx], el = Math.hypot(ex[0], ex[2]) || 1; ex[0] /= el; ex[2] /= el;
  const nx = [cy * ex[2] - cz * ex[1], cz * ex[0] - cx * ex[2], cx * ex[1] - cy * ex[0]];
  yield* eachTexel(W, H, (k, x, y, z) => {
    const dot = x * cx + y * cy + z * cz;
    if (dot < Math.cos(len)) return;
    const d = Math.acos(Math.min(1, dot)) / len;
    const a = Math.atan2(x * nx[0] + y * nx[1] + z * nx[2], x * ex[0] + y * ex[1] + z * ex[2]);
    let v = 0;
    for (const [ang, l, wdt] of dirs) {
      let da = Math.abs(a - ang); da = Math.min(da, TAU - da);
      if (d < l) v = Math.max(v, Math.exp(-((da / wdt) ** 2)) * (1 - d / l));
    }
    v = v * (0.6 + 0.8 * noise3(x * 40, y * 40, z * 40, seed)) + Math.max(0, 0.25 - d) * 1.2;
    albedo[k] *= 1 + strength * v;
  });
}

// ------------------------------------------------------------------ Earth
// Coarse but recognisable coastlines ([lon, lat] in degrees), rasterised into
// masks then roughened with noise so the coast looks fractal up close.
const LAND = [
  // North America (Hudson Bay cut out below)
  [[-168, 65], [-165, 69], [-156, 71.3], [-141, 69.6], [-128, 70], [-115, 68.5], [-105, 68], [-95, 69], [-88, 68.5], [-82, 69.5], [-85, 66], [-80, 63], [-73, 62], [-65, 60], [-61, 56], [-56, 52], [-59, 48], [-64, 48.5], [-66, 45], [-70, 43.5], [-70, 41.8], [-74, 40.5], [-76, 37], [-75.5, 35.2], [-78, 33.8], [-81, 31.5], [-80, 27], [-80.3, 25.2], [-81.8, 26.5], [-82.8, 28.5], [-84, 30], [-89, 30.2], [-91, 29.2], [-94, 29.6], [-97.2, 27.5], [-97.5, 22], [-96, 19], [-94.5, 18.2], [-91, 18.6], [-90.4, 21], [-87, 21.5], [-88, 16], [-83.5, 15], [-83.5, 11], [-81.5, 9], [-79.5, 9.5], [-77.5, 8.5], [-78, 7.2], [-80, 7.3], [-80.5, 8.2], [-83, 8.3], [-85.7, 10.5], [-87.5, 13], [-91.5, 14], [-94.5, 16], [-96.5, 15.7], [-100, 17], [-103.5, 18.3], [-105.5, 20.5], [-105.5, 22.8], [-108, 25.2], [-111, 28], [-112.8, 30.5], [-114.8, 31.6], [-114, 30], [-112.5, 27.5], [-111, 24.5], [-110, 23], [-112, 24.8], [-114, 27.8], [-115.5, 29.6], [-117.1, 32.5], [-118.5, 34], [-120.6, 34.6], [-122.5, 37.5], [-123.8, 39.5], [-124.3, 42], [-124, 46.2], [-124.7, 48.4], [-127.5, 50.5], [-130.5, 54.3], [-133.5, 57.5], [-137, 59], [-140.5, 59.8], [-146, 60.8], [-151.5, 59.2], [-154, 57.5], [-158, 56.6], [-163, 54.8], [-160, 58.5], [-162, 60], [-165.5, 61.5], [-165, 63.4], [-161, 64.5], [-166.5, 65.4], [-168, 65]],
  // Greenland, Iceland and the Canadian Arctic islands
  [[-73, 78.2], [-62, 81.8], [-40, 83.5], [-22, 82.5], [-18, 79.5], [-19.5, 75], [-22, 71.5], [-26, 68.5], [-34, 66], [-40, 64.5], [-43.5, 60], [-47.5, 60.8], [-51, 64], [-53.5, 67.5], [-54, 70.5], [-57.5, 74.5], [-66, 76.2], [-73, 78.2]],
  [[-24.3, 65.5], [-22, 66.4], [-16, 66.5], [-13.5, 65.2], [-15, 64.3], [-18.8, 63.4], [-22.7, 63.8]],
  [[-80, 73.6], [-72, 71.5], [-67, 69], [-62, 66.5], [-64.5, 63], [-69, 62.6], [-72.5, 64.2], [-78, 64.8], [-82, 68], [-89, 70.8], [-80, 73.6]],
  [[-120, 71.7], [-110, 73.2], [-100, 73], [-101, 69.4], [-110, 68.6], [-118.5, 69.6], [-120, 71.7]],
  [[-96, 76.5], [-90, 79.5], [-80, 81.5], [-64, 82.8], [-78, 83.1], [-92, 82], [-97, 80], [-96, 76.5]],
  [[-110, 76.5], [-104, 78.5], [-96, 78], [-98, 75.5], [-108, 75]],
  [[-125, 72.5], [-118, 76.4], [-115, 73.5], [-120, 71.5]],
  // Caribbean
  [[-85, 21.9], [-80.5, 23.1], [-75.5, 20.6], [-74.2, 20.2], [-77.5, 19.9], [-81.5, 22.1]],
  [[-74.4, 19.9], [-70.5, 19.9], [-68.4, 18.6], [-71.3, 17.7], [-74.4, 18.3]],
  [[-67.2, 18.5], [-65.6, 18.4], [-65.7, 17.9], [-67.2, 17.9]],
  // South America
  [[-77.5, 8.6], [-75.5, 10.8], [-73, 11.8], [-71.5, 12.4], [-71.2, 11], [-68.5, 11.3], [-64, 10.6], [-61.5, 10.6], [-60, 8.5], [-57.5, 6.3], [-53.5, 5.8], [-51.3, 4.2], [-50, 1.8], [-48.5, -1], [-44.5, -2.5], [-40, -2.9], [-37, -4.8], [-35.2, -5.5], [-34.8, -7.5], [-35.3, -9.5], [-37.5, -12.2], [-39, -15], [-39.3, -17.8], [-40.5, -20.5], [-42, -23], [-45, -23.8], [-48.2, -26], [-48.7, -28.5], [-50.8, -31], [-53.4, -34], [-55.5, -34.9], [-57.5, -35.5], [-57, -37.8], [-62, -38.9], [-62.5, -40.8], [-65, -41], [-64.5, -42.6], [-65.5, -45], [-67.5, -46.2], [-66, -47.8], [-68.5, -50.5], [-69.2, -52.3], [-68.6, -53.7], [-71, -55.1], [-74, -52.5], [-75.5, -48], [-74, -44], [-73.5, -41], [-73.6, -37], [-72.2, -33], [-71.5, -30], [-70.5, -25], [-70.2, -20], [-70.5, -18.2], [-73, -16.5], [-76.2, -13.8], [-78.8, -9], [-80.5, -6.2], [-81.2, -4.5], [-80, -2.5], [-80.5, -1], [-80, 1], [-78.8, 1.8], [-77.5, 3.8], [-77.4, 6.5], [-77.5, 8.6]],
  // Africa
  [[-17.1, 21], [-16, 24], [-14.5, 26.2], [-13, 27.8], [-9.8, 29.8], [-9.5, 32.5], [-6.8, 34.2], [-5.9, 35.8], [-2, 35.1], [1, 36.5], [5, 36.8], [10, 37.2], [11, 36.8], [10.5, 34.5], [10.2, 33.6], [12, 32.9], [15.3, 32.2], [18.8, 30.4], [20.1, 31.2], [20, 32.6], [22, 32.9], [25, 31.8], [29, 30.9], [32.3, 31.3], [32.5, 29.9], [34.2, 27.8], [35.5, 23.8], [37.3, 19.5], [38.5, 17.5], [39.7, 15.2], [41.6, 13.5], [43.3, 12.5], [44.5, 10.4], [47.5, 11.2], [51.2, 11.8], [51, 10.4], [49.8, 7.5], [47.8, 4.5], [45.3, 1.8], [42.5, -0.8], [40.2, -2.8], [39.2, -5], [39.3, -8], [40.4, -10.5], [40.5, -14.8], [39.5, -16.8], [36.8, -18.8], [35.3, -21.5], [35.5, -24], [32.8, -26], [32.6, -28.4], [31.2, -29.8], [30, -31.3], [27.3, -33.6], [25.5, -34], [22.5, -33.9], [20, -34.8], [18.4, -34.1], [18.3, -32], [17.2, -29.4], [15.2, -26.8], [14.5, -22.6], [13, -19.8], [11.8, -17.2], [12.3, -14], [13.5, -11.5], [13.2, -8.8], [12.2, -6], [11.8, -3.5], [9.6, -1.4], [9.4, 1.2], [9.8, 3.5], [8.7, 4.5], [6.3, 4.3], [4.8, 6.3], [2.5, 6.3], [-0.5, 5.6], [-3, 5.1], [-5.5, 5.1], [-7.6, 4.4], [-9.5, 5.6], [-11.5, 6.9], [-13.2, 8.5], [-14.8, 10.8], [-16.8, 12.6], [-17.2, 14.6], [-16.5, 16.5], [-16.2, 19], [-17.1, 21]],
  [[49.3, -12], [50.5, -15.5], [49.5, -17.8], [48.2, -22.5], [47.1, -24.9], [45.2, -25.5], [43.7, -23.5], [43.4, -21.5], [44.4, -19.5], [44, -17], [46.5, -15.6], [48, -13.5], [49.3, -12]],
  // Eurasia: from Portugal round the Arctic, Pacific and Indian coasts, then back
  // through Arabia, the Levant and the Mediterranean.
  [[-9.5, 37], [-8.9, 41.8], [-9.3, 43.2], [-7.5, 43.8], [-2, 43.4], [-1.5, 44.5], [-1.2, 46.2], [-2.5, 47.3], [-4.6, 47.9], [-4.6, 48.7], [-1.5, 48.8], [-1.3, 49.7], [0.2, 49.6], [1.6, 50.2], [2.5, 51.1], [4.2, 51.6], [4.8, 53], [7, 53.5], [8.5, 54], [8.2, 55.5], [8.5, 57.2], [10.5, 57.7], [7.2, 58], [5.6, 58.8], [5, 60.5], [5.2, 62], [8, 63.4], [10.5, 64.5], [12.8, 66], [14.5, 67.8], [16.5, 68.8], [19, 69.8], [23, 70.6], [26, 71.1], [29, 70.8], [31, 70], [33, 69.4], [36.5, 68.8], [40.5, 67.7], [41.2, 66.8], [38, 66], [34.6, 64.7], [37, 63.8], [40.5, 64.5], [43.5, 66.3], [44.2, 68.4], [46.5, 68], [53.5, 68.6], [58, 68.8], [60.5, 69.8], [64.5, 69.3], [68.5, 68.2], [67, 69.6], [66.8, 71], [69, 72.9], [72.5, 72.8], [72, 71], [72.8, 68.5], [75, 69.5], [74, 72.5], [80, 73.6], [83, 70.5], [86, 74], [87, 75.2], [96, 76.2], [100, 76.6], [104.5, 77.7], [107, 76.5], [112, 76.4], [113.5, 73.6], [119, 73.1], [124, 73.6], [128.5, 72.8], [130, 71], [132, 71.8], [139, 71.6], [141, 72.6], [146, 72.3], [151, 71.4], [155, 71], [160, 70.7], [162.5, 69.6], [168, 70], [171, 69.8], [176, 69.8], [180, 68.8], [180, 65.5], [178.5, 64.5], [177, 62.5], [174, 61.7], [170.5, 60], [166, 60.2], [163.5, 59.8], [163, 57.8], [162, 56.2], [162.5, 54.8], [160.5, 53], [158.5, 52.8], [156.6, 51], [155.8, 53.7], [155.5, 56.8], [156.8, 57.8], [158.5, 58.2], [161.8, 60.4], [160, 61.6], [157, 61.6], [154, 59.4], [151.5, 59.3], [148.5, 59.3], [145.5, 59.4], [142, 59.1], [138.5, 56.5], [135.2, 54.8], [137, 53.8], [140.5, 53.4], [141.3, 52.2], [140.5, 50], [140.2, 48.2], [138.2, 46.6], [135.5, 43.8], [133, 42.8], [131, 42.6], [129.7, 41], [129.5, 39.5], [129.4, 37], [129.2, 35.3], [127, 34.6], [126.4, 34.4], [126.3, 36.8], [126.8, 37.8], [125.2, 38], [124.8, 39.5], [122, 40.4], [121.2, 40.9], [122.2, 39.3], [121.5, 39], [118.5, 39.2], [117.6, 38.6], [118.8, 37.5], [120.8, 37.8], [122.5, 37.2], [120.5, 36], [119.2, 35], [120.3, 34.2], [121.8, 31.7], [121, 30.6], [122, 29.7], [121.4, 28.2], [119.8, 26], [118.6, 24.6], [116.5, 23], [113.5, 22.2], [110.5, 21.2], [110.2, 20.2], [108.6, 21.6], [106.5, 20.4], [105.8, 19], [107.5, 16.5], [109.2, 13.3], [109.2, 11.5], [107.2, 10.4], [105.1, 8.6], [104.8, 10.4], [103, 11.5], [102.3, 12.4], [100.9, 12.7], [100.1, 13.4], [99.2, 10.4], [99.9, 9.2], [100.4, 7.4], [101.3, 6.8], [102.2, 6.2], [103.4, 4.8], [103.5, 2.8], [104.2, 1.4], [103.4, 1.3], [101.4, 2.7], [100.3, 4.4], [100.2, 6.5], [98.6, 8], [98.3, 9.8], [98.7, 12], [98.2, 13.9], [97.6, 16.5], [96.5, 16.5], [94.6, 16.2], [94.4, 18.6], [93.4, 19.8], [92.2, 21.2], [91.8, 22.5], [90.5, 22], [89.1, 21.8], [86.9, 21.3], [86.6, 20.2], [84.9, 19.3], [82.3, 17.2], [80.3, 15.8], [80.1, 13.2], [79.8, 10.5], [78.9, 9.3], [77.5, 8.1], [76.6, 8.9], [75.7, 11.3], [74.8, 12.9], [74.2, 14.8], [73.4, 16.3], [72.8, 19.2], [72.8, 21], [72.6, 22.2], [70.5, 20.8], [69, 22.4], [68.4, 23.6], [67.4, 23.9], [66.4, 25.4], [64.5, 25.2], [61.5, 25.1], [58.5, 25.6], [57.2, 25.9], [56.4, 27.1], [54.7, 26.5], [51.5, 27.9], [50.1, 30.1], [48.5, 29.9], [48, 29.4], [48.8, 27.7], [50.1, 26.4], [50.8, 24.8], [51.6, 25.8], [51.6, 24.3], [54, 24.1], [55.4, 25.4], [56.3, 26.3], [56.4, 24.9], [57.4, 23.9], [58.7, 23.6], [59.8, 22.5], [58.9, 21.1], [57.8, 19.1], [56.7, 18.6], [55.3, 17.4], [52.2, 15.9], [49.6, 14.7], [48.7, 14], [45.6, 13.3], [43.5, 12.7], [42.9, 14.8], [42.6, 16.4], [41.2, 18.7], [40.3, 20.2], [39.1, 21.3], [38.5, 23.6], [37.5, 24.3], [36.4, 26.1], [35.2, 28.1], [34.6, 28.1], [33.6, 27.9], [32.6, 29.9], [32.3, 31.3], [34.2, 31.3], [34.9, 32.8], [35.6, 34.2], [35.9, 35.8], [36.1, 36.8], [34.7, 36.8], [32.5, 36.1], [30.6, 36.7], [29, 36.6], [27.4, 37], [26.3, 38.2], [26.8, 39.3], [26.2, 40.1], [26.6, 40.8], [24.9, 40.9], [23.7, 40.6], [22.8, 40.4], [22.9, 39.4], [23.9, 38.2], [22.8, 37.5], [23.1, 36.4], [21.7, 36.8], [21.1, 37.8], [21.3, 38.8], [20.2, 39.6], [19.3, 40.6], [19.4, 41.9], [18.5, 42.5], [16.4, 43.5], [15.2, 44.3], [14.2, 45.2], [13.6, 45.7], [12.3, 45.3], [12.4, 44.2], [13.7, 43.5], [14.5, 42.2], [16.1, 41.4], [17.5, 40.6], [18.5, 40.1], [17, 39.2], [16.5, 38.2], [15.7, 38], [15.8, 39.5], [15.1, 40.2], [14.2, 40.8], [12.6, 41.5], [11.2, 42.4], [10.5, 42.9], [10.2, 43.9], [8.8, 44.4], [7.5, 43.8], [6.2, 43.1], [4.6, 43.4], [3.2, 43.2], [3.2, 41.9], [2.2, 41.3], [0.8, 41], [0.2, 39.7], [-0.4, 39.3], [0, 38.8], [-0.7, 37.6], [-2.1, 36.7], [-4.4, 36.7], [-5.6, 36], [-6.4, 36.8], [-7.4, 37.2], [-8.9, 37], [-9.5, 37]],
  // British Isles, Svalbard, Novaya Zemlya
  [[-5.7, 50.1], [-3, 50.7], [1.4, 51.2], [1.7, 52.7], [0.2, 53.5], [-0.5, 54.5], [-1.6, 55.6], [-2.1, 56.5], [-1.8, 57.6], [-3.2, 58.6], [-5, 58.6], [-6.2, 57.5], [-5.6, 56.2], [-4.9, 54.8], [-3.2, 54.1], [-3, 53.3], [-4.5, 53.3], [-4.2, 52.3], [-5.2, 51.8], [-3.3, 51.4], [-5.7, 50.1]],
  [[-6, 52.2], [-6.1, 54], [-7.3, 55.3], [-8.4, 54.5], [-10, 53.6], [-10.3, 51.8], [-8.2, 51.6]],
  [[11, 78.5], [16, 80], [27, 80.2], [22, 77.5], [16, 76.6]],
  [[52, 71], [56, 74], [61, 75.8], [68.5, 76.9], [65, 75.5], [58, 73], [55, 70.7]],
  // Mediterranean islands
  [[12.4, 38.1], [15.6, 38.3], [15.1, 36.7], [12.5, 37.6]], [[8.4, 41.1], [9.8, 41], [9.6, 39.1], [8.4, 39]], [[8.6, 43], [9.5, 42.9], [9.4, 41.4], [8.7, 41.6]], [[23.5, 35.6], [26.3, 35.3], [24.5, 34.9]], [[32.3, 35.1], [34.6, 35.6], [33.9, 34.6]],
  // Japan, Taiwan, Sakhalin, Sri Lanka, Hainan
  [[129.6, 33.3], [130.9, 34.4], [133, 35.5], [135.8, 35.6], [137, 37], [139.5, 38.2], [140, 40.5], [141.4, 41.4], [141.9, 39.8], [141.5, 38.3], [140.9, 36.5], [140.8, 35.4], [139.8, 34.9], [138.8, 34.6], [137, 34.6], [135.5, 33.6], [133, 33.3], [131.7, 31.4], [130.2, 31.2], [129.6, 33.3]],
  [[140, 41.5], [141.6, 42.5], [143.5, 42], [145.5, 43.3], [144.5, 44], [142, 45.4], [141.5, 43.6], [140, 42.5]],
  [[120.1, 23], [121, 25.2], [122, 25], [120.8, 21.9]], [[142, 46.1], [143.5, 49], [143, 53.3], [142.2, 54.2], [141.8, 51]],
  [[79.8, 8.5], [80.1, 9.8], [81.9, 7.3], [80.6, 5.9]], [[108.6, 19.2], [110, 20.1], [111, 19.6], [109.6, 18.2]],
  // Philippines, Indonesia, New Guinea
  [[120, 18.5], [122.2, 18.5], [122, 16], [124.2, 13.8], [123, 13], [120.6, 14.2]], [[122, 7], [125.5, 9.6], [126.6, 7.2], [125.3, 5.6], [123.6, 7.7], [122, 6.8]],
  [[123, 11.5], [125.8, 11.5], [124.8, 9.8], [122.5, 9.9]],
  [[95.3, 5.6], [97.5, 5.2], [100.3, 2.2], [103.8, 0.4], [104.5, -1.8], [106, -3], [105.8, -5.8], [104.5, -5.9], [102.3, -4], [101, -2.5], [98.6, 1.7], [95.5, 3.5]],
  [[109, 1.5], [111, 2.8], [113.5, 3.5], [116, 6.9], [117.5, 6.2], [119.2, 5.2], [117.8, 1], [117.5, -1], [116.5, -3.7], [114.5, -4], [111.6, -3.3], [110.2, -2.9], [109, -0.5]],
  [[105.2, -6.8], [106, -5.9], [108.4, -6.3], [111, -6.4], [112.6, -6.9], [114.5, -7.6], [114.5, -8.7], [111, -8.2], [106.5, -7.4]],
  [[119.4, -5.5], [120.4, -2.7], [119.5, 0], [120.9, 1.3], [124.8, 1.5], [123.2, 0.5], [121.2, -0.9], [123.3, -0.9], [121.5, -1.9], [122.3, -4.5], [121.4, -4.7], [120.4, -5.6]],
  [[131, -1.3], [134, -0.8], [138, -1.6], [141, -2.6], [145.5, -4.8], [147.5, -6.2], [150.5, -10.6], [147, -10.1], [144, -8], [141, -9.1], [138, -8.4], [137.6, -5.2], [134.5, -4], [132.5, -4], [132, -2.8]],
  // Australia, Tasmania, New Zealand
  [[113.5, -22], [113.8, -26.2], [115, -30], [115.6, -33.6], [117.9, -35.1], [123.5, -33.9], [126, -32.3], [131, -31.5], [134.2, -32.8], [135.8, -34.8], [137.8, -32.6], [137.6, -35.3], [139.6, -36.2], [140, -37.7], [143.5, -38.8], [146.3, -39.1], [150, -37.5], [151.3, -33.8], [153.1, -30.5], [153.6, -28.2], [153, -25], [150.8, -22.5], [148.7, -20.3], [146.2, -18.6], [145.4, -14.8], [143.5, -14], [142.5, -10.7], [141.5, -13], [141.6, -17], [140.8, -17.4], [139, -17], [137, -15.8], [135.6, -14.5], [136.9, -12.2], [132.6, -11.4], [131, -12.2], [129.5, -14.9], [127, -13.8], [125, -15], [122.2, -17.3], [121, -19.6], [117, -20.6], [114.6, -21.8]],
  [[144.6, -40.7], [148.3, -40.9], [148, -43.2], [146, -43.6], [145, -42]],
  [[172.7, -34.4], [174.3, -35.5], [175.9, -37.5], [178.5, -37.7], [177, -39.5], [176, -41.3], [174.8, -41.3], [174, -39.3], [174.6, -37]],
  [[172.7, -40.5], [174.3, -41.4], [173.2, -43], [171.2, -44.5], [169, -46.6], [166.5, -46], [168.3, -44], [171.4, -41.8]],
  // Antarctic Peninsula (the rest of Antarctica is a function of longitude below)
  [[-57, -63.2], [-60, -64], [-64, -65.8], [-66.5, -68.5], [-68, -71.5], [-62, -73.5], [-58, -68], [-56.5, -64]],
];
const WATER = [
  [[-95, 59], [-94, 61], [-90.5, 63.5], [-87, 64.8], [-82, 64.5], [-78, 62.5], [-77, 60], [-78.5, 56.5], [-79.3, 54], [-81.5, 52.2], [-82.5, 53.5], [-86, 55.5], [-89.5, 56.8], [-92.5, 57.2]],
  [[8.6, 57.3], [10.6, 57.8], [11, 56.6], [12.5, 55.8], [12.6, 56.5], [11.6, 58.2], [11.2, 59.2], [9.5, 59], [7.5, 58.1]],
  [[10.8, 54.4], [14, 53.9], [19, 54.4], [21, 55.6], [21.2, 57], [23.5, 57.6], [24.3, 59.4], [29.5, 59.9], [23, 60.2], [21.5, 61], [21.3, 63.3], [25, 65], [22.5, 65.9], [19.5, 63.6], [17.3, 62], [17.8, 60.6], [19, 59.5], [16.5, 57.5], [16, 56.2], [14.2, 55.4], [12.7, 55.6], [11, 55.3]],
  [[27.8, 41.3], [28, 43.5], [29.6, 45.2], [31, 46.6], [33.5, 44.5], [36.5, 45.3], [38.3, 47.1], [39.5, 47], [38, 44.5], [40, 43.2], [41.6, 41.6], [36.5, 41.3], [33.2, 42], [29, 41.2]],
  [[47, 44.5], [49, 46.5], [51.5, 47], [53.3, 46.6], [51.5, 45], [51, 42.8], [53, 41.5], [54, 39], [53.5, 37.4], [50.5, 37], [49, 38.3], [49.5, 40.3], [47.5, 42.5]],
  [[58.5, 46.5], [61.5, 46.5], [61.5, 44.2], [58.5, 44.2]], // Aral (as it was)
  [[-92, 46.7], [-84.5, 46.5], [-82.5, 45.3], [-79.8, 43.3], [-76.2, 43.6], [-79.2, 43.2], [-83, 42], [-82.5, 43.6], [-84.5, 43.8], [-87.5, 41.7], [-87.8, 44.5], [-89, 46.8]], // Great Lakes
];
const DESERT = [
  [[-16.5, 16], [-16.5, 28], [-8, 31], [0, 32], [10, 31], [20, 29.5], [31, 29.5], [34, 25], [37, 17], [32, 14.5], [22, 14.5], [10, 15], [0, 14.5], [-10, 14.5]],
  [[36, 30], [43, 31], [48, 29.5], [53, 25], [56, 22], [55, 18], [49, 16.5], [44, 16], [41, 19.5], [38.5, 24]],
  [[48, 33], [56, 35], [63, 34], [70, 29], [72, 25], [69, 24], [62, 25.5], [55, 27.5]],
  [[52, 42], [62, 44.5], [70, 44], [80, 41], [88, 42.5], [95, 44], [105, 44], [112, 43], [114, 41], [105, 38.5], [96, 38], [88, 37], [78, 37.5], [70, 38.5], [60, 38.5]],
  [[116, -21], [124, -19], [132, -18.5], [140, -21], [143, -26], [140, -31], [133, -30.5], [126, -29.5], [120, -27], [115, -25]],
  [[12, -16], [18, -18], [24, -20], [26, -24], [23, -28.5], [19, -30], [15.5, -26], [13.5, -21]],
  [[-71.5, -17.5], [-69, -17], [-68.5, -24], [-69.5, -28], [-71.3, -27.5], [-70.5, -22]],
  [[-71.5, -38], [-65, -38], [-65.5, -46], [-68.5, -50.5], [-71.5, -48]],
  [[-121, 37], [-114, 39], [-108, 36], [-103.5, 31.5], [-106, 27], [-110, 26], [-113, 29], [-116.5, 32], [-118.5, 34.5]],
];
// Mountain ranges: [width in degrees, ...points]
const RANGES = [
  [3, [-77, 8], [-78, 1], [-77.5, -6], [-74.5, -13], [-69.5, -17], [-68.5, -23], [-69.5, -30], [-70.5, -36], [-71.5, -42], [-73, -49], [-71, -54]],
  [5, [-150, 63], [-140, 61], [-131, 58], [-125, 54], [-120, 50], [-114.5, 46], [-111, 43], [-107, 39], [-106, 34]],
  [3, [-122, 47], [-121.5, 43], [-122, 40], [-119, 37], [-118, 35.5]],
  [3, [-107, 29], [-104, 24], [-101, 20], [-97, 17]],
  [4, [70, 36.5], [74.5, 35.5], [78.5, 33], [82, 30.5], [86, 28], [90, 28], [94, 28.5], [97, 28]],
  [9, [78, 34.5], [84, 34], [90, 33], [96, 32.5], [100, 31.5]],
  [3, [67, 39], [72, 39.5], [78, 41.5], [84, 42.5], [90, 43]],
  [2, [5.5, 44], [7, 45.8], [10, 46.6], [13, 47], [15.5, 47.2]],
  [2, [40, 43.5], [44, 42.6], [48.5, 41]], [2.5, [44.5, 36], [48, 33.5], [52, 31], [57, 27.8]], [2.5, [-9, 30.5], [-5, 32], [0, 34], [6, 35.5], [10, 35.8]],
  [1.5, [59.5, 68], [59.8, 63], [59, 57], [58, 52]], [3, [38.5, 9], [37.5, 4], [36.5, -1.5], [35, -6], [33.5, -10]],
  [2, [146, -16], [148.5, -21], [151.5, -27], [150.5, -32], [147.5, -37]], [2, [6.5, 60], [9, 62], [13.5, 65.5], [17.5, 68.5], [21, 69.8]],
  [2, [-82, 35], [-80, 37], [-77, 40], [-74, 42.5], [-71, 44.5]], [2, [-0.5, 42.7], [2.5, 42.5]], [2, [99, 51], [108, 56], [125, 60], [140, 63], [155, 66]],
];
const URBAN = [
  [[-95, 29], [-80, 25.5], [-75, 35], [-70, 41.5], [-71, 45], [-83, 46], [-92, 44], [-97, 37]], [[-124, 33], [-117, 32.5], [-116, 34.5], [-122, 39], [-123, 48], [-121.5, 48]],
  [[-10, 36], [3, 36.5], [15, 37.5], [28, 37], [30, 45], [38, 56], [30, 60.5], [18, 60.5], [5, 59], [-6, 55], [-10, 51], [-9, 43]],
  [[68, 23], [73, 18], [77, 8.5], [80, 13], [88, 21.5], [92, 24.5], [88, 27], [78, 31], [72, 32]],
  [[104, 21.5], [113, 22], [121, 30], [122, 37.5], [118, 41], [113, 40], [106, 33], [103, 28]], [[129.5, 31.5], [141, 35], [141.5, 39], [140, 38], [133, 35.5]], [[126.5, 34.5], [129.4, 35.2], [127, 38]],
  [[-48, -26], [-44, -23.5], [-40, -20], [-38, -12], [-35, -6], [-43, -15], [-49, -21]], [[-60, -34.5], [-57.5, -35], [-58.5, -33], [-64, -31.5]],
  [[28, 26.5], [31.5, 31.3], [32.6, 31], [31.5, 24], [32.9, 16]], [[100, 13], [107, 10.5], [106, 21], [100.5, 18]], [[105, -6], [114, -8], [112, -7], [106.5, -6.2]],
  [[150, -36], [153, -27], [151, -33.5]], [[3, 6.2], [8, 5.5], [8.5, 12], [3, 9]], [[44, 25], [51, 25], [56, 25.5], [50, 30]], [[34.5, 31], [36.5, 34], [36, 37.5], [32, 40], [27, 41], [29, 38]],
];

function maskCanvas(W, H, polys, blur, stroke) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  if (blur) g.filter = `blur(${blur}px)`;
  const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
  g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineCap = g.lineJoin = "round";
  for (const poly of polys) {
    if (stroke) {
      const [wd, ...pts] = poly;
      g.lineWidth = (wd / 360) * W;
      g.beginPath(); pts.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la)))); g.stroke();
    } else {
      g.beginPath(); poly.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la)))); g.closePath(); g.fill();
    }
  }
  return g;
}
// Read a mask back in texture order (longitude 0 at column 0) as 0..1 floats.
function readMask(g, W, H) {
  const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const si = (i + (W >> 1)) % W;
    out[j * W + i] = d[(j * W + si) * 4] / 255;
  }
  return out;
}
function landMasks(W, H) {
  const b = W / 768;
  const land = maskCanvas(W, H, LAND, 0.9 * b);
  land.fillStyle = "#000"; land.filter = `blur(${0.9 * b}px)`;
  const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
  for (const poly of WATER) { land.beginPath(); poly.forEach(([lo, la], i) => (i ? land.lineTo(X(lo), Y(la)) : land.moveTo(X(lo), Y(la)))); land.closePath(); land.fill(); }
  const landM = readMask(land, W, H);
  // wide blur of the land mask: shallow seas near coasts, and how far inland a point is
  const wide = document.createElement("canvas"); wide.width = W; wide.height = H;
  const wg = wide.getContext("2d"); wg.filter = `blur(${5 * b}px)`; wg.drawImage(land.canvas, 0, 0);
  return {
    land: landM, wide: readMask(wg, W, H),
    desert: readMask(maskCanvas(W, H, DESERT, 7 * b), W, H),
    mount: readMask(maskCanvas(W, H, RANGES, 2.5 * b, true), W, H),
    urban: readMask(maskCanvas(W, H, URBAN, 4 * b), W, H),
  };
}

function* earthTex(W, H) {
  const M = landMasks(W, H), n = W * H;
  const day = new Uint8ClampedArray(n * 3), night = new Uint8ClampedArray(n * 3), cloud = new Uint8ClampedArray(n);
  const spec = new Uint8ClampedArray(n), height = new Float32Array(n);
  // storm vortices: spiral the cloud field around a few centres (cyclones, a hurricane)
  const vort = [[48, -35, 0.16, 1], [-52, 20, 0.18, -1], [55, 160, 0.14, 1], [-48, 110, 0.17, -1], [18, -60, 0.07, 1.6], [-45, -120, 0.15, -1], [42, 25, 0.12, 1]]
    .map(([la, lo, r, k]) => ({ c: unit(la, lo), r, k }));
  const C = {
    deep: [4, 22, 66], mid: [9, 44, 102], shallow: [24, 92, 140], reef: [40, 140, 160],
    rain: [22, 64, 26], forest: [38, 76, 34], temperate: [78, 104, 52], savanna: [140, 132, 74], desert: [214, 180, 128], red: [190, 128, 82],
    boreal: [34, 62, 40], tundra: [112, 108, 88], rock: [118, 102, 86], snow: [238, 242, 248],
  };
  yield* eachTexel(W, H, (k, x, y, z, lat, lon) => {
    const a = Math.abs(lat);
    // fractal coastline: the soft mask plus noise, thresholded
    const cn = fbm3(x * 9, y * 9, z * 9, W > 1500 ? 5 : 3, 11) - 0.5;
    // Antarctica: the coast sits near 67°S, pulled south by the Ross and Weddell seas
    const ross = ((lon + 175 + 540) % 360) - 180;
    const antarctic = lat < -60 ? smooth(0, 1, (-lat - (66.5 + 9 * Math.exp(-((ross / 22) ** 2)) + 8 * Math.exp(-(((lon + 45) / 18) ** 2)))) / 1.2) : 0;
    const v = Math.max(M.land[k], antarctic) + cn * 0.42;
    // a coast about a texel wide, so magnified it stays a smooth line rather than steps
    const L = smooth(0.5 - 0.06 * (768 / W), 0.5 + 0.06 * (768 / W), v), wide = M.wide[k];
    const detail = fbm3(x * 22, y * 22, z * 22, 3, 5), d2 = fbm3(x * 5, y * 5, z * 5, 4, 9);
    // ocean
    let oc = mix3(C.deep, C.mid, smooth(0.15, 0.7, d2));
    oc = mix3(oc, C.shallow, smooth(0.08, 0.55, wide) * 0.8);
    if (a < 28) oc = mix3(oc, C.reef, smooth(0.3, 0.6, wide) * 0.35);
    // land biome by latitude, then deserts, mountains, ice
    let ld;
    if (a < 10) ld = mix3(C.rain, C.forest, detail);
    else if (a < 20) ld = mix3(C.forest, C.savanna, smooth(10, 19, a) * (0.6 + 0.6 * d2));
    else if (a < 45) ld = mix3(C.savanna, C.temperate, smooth(22, 36, a));
    else if (a < 62) ld = mix3(C.temperate, C.boreal, smooth(48, 58, a));
    else ld = mix3(C.boreal, C.tundra, smooth(60, 68, a));
    const des = M.desert[k] * (0.75 + 0.5 * d2);
    if (des > 0.004) ld = mix3(ld, mix3(C.desert, C.red, smooth(0.45, 0.7, fbm3(x * 7, y * 7, z * 7, 3, 3))), clamp(des, 0, 1));
    const ridge = M.mount[k] > 0.004 ? ridged3(x * 14, y * 14, z * 14, 4, 21) : 0;
    const mt = M.mount[k] * (0.45 + 0.9 * ridge);
    ld = mix3(ld, C.rock, clamp(mt * 0.9, 0, 0.85));
    ld = ld.map((c) => c * (0.82 + 0.36 * detail));
    let ice = antarctic + smooth(74, 80, lat) + (lat > 59 && lon > -75 && lon < -10 && M.land[k] > 0.4 ? smooth(0.4, 0.9, M.land[k]) * smooth(59, 64, lat) : 0);
    ice += smooth(0.55, 0.85, mt) * smooth(28, 48, a) + (a > 66 ? 0.3 * smooth(0.6, 0.8, d2) : 0);
    ld = mix3(ld, C.snow, clamp(ice, 0, 1));
    const col = mix3(oc, ld, L);
    // sea ice around the poles
    const seaIce = smooth(76, 84, lat) + smooth(-64, -70, lat) * 0.9;
    const fin = mix3(col, [222, 232, 240], clamp(seaIce * (1 - L) * (0.7 + 0.5 * detail), 0, 1));
    day[k * 3] = fin[0]; day[k * 3 + 1] = fin[1]; day[k * 3 + 2] = fin[2];
    spec[k] = (1 - L) * (1 - seaIce) * 255;
    height[k] = smooth(0.3, 0.7, v) * 0.1 + L * (mt * 0.9 * ridge + detail * 0.1); // a gentle shelf at the coast, not a cliff
    // night: city lights clustered on land, brightest in the populated belts and on coasts
    const coast = L * smooth(0.25, 0.7, 1 - wide) * 0.15;
    const pop = L * (1 - clamp(ice, 0, 1)) * (1 - clamp(des, 0, 1) * 0.85) * (M.urban[k] * 0.95 + 0.12 * smooth(15, 35, lat) * smooth(62, 50, lat) + coast);
    if (pop > 0.02) {
      // metro areas (clusters) plus a scatter of towns: bright points, not a wash
      const c1 = fbm3(x * 40, y * 40, z * 40, 3, 77), towns = noise3(x * 420, y * 420, z * 420, 78);
      const metro = smooth(0.66 - pop * 0.22, 0.86 - pop * 0.2, c1);
      const li = Math.min(1, metro * (0.25 + 0.75 * towns) + smooth(0.8 - pop * 0.25, 0.95, towns) * 0.8) * Math.min(1, pop * 2);
      night[k * 3] = 255 * li; night[k * 3 + 1] = 186 * li; night[k * 3 + 2] = 104 * li;
    }
    // clouds: warped fbm, spun around storm centres, banded by latitude
    let px = x, py = y, pz = z;
    for (const vt of vort) {
      const dd = Math.acos(clamp(px * vt.c[0] + py * vt.c[1] + pz * vt.c[2], -1, 1));
      if (dd > vt.r * 3) continue;
      const ang = vt.k * 5 * Math.exp(-dd / vt.r) * (vt.k > 1 ? 1.6 : 1);
      // Rodrigues rotation about the vortex axis
      const [ux, uy, uz] = vt.c, cs = Math.cos(ang), sn = Math.sin(ang), dt = px * ux + py * uy + pz * uz;
      const cx = uy * pz - uz * py, cy = uz * px - ux * pz, cz = ux * py - uy * px;
      px = px * cs + cx * sn + ux * dt * (1 - cs); py = py * cs + cy * sn + uy * dt * (1 - cs); pz = pz * cs + cz * sn + uz * dt * (1 - cs);
    }
    const wx = fbm3(px * 2, py * 2, pz * 2, 3, 41) - 0.5, wz = fbm3(px * 2 + 5, py * 2, pz * 2, 3, 42) - 0.5;
    let cv = fbm3(px * 3.2 + wx * 2, py * 6 + wx, pz * 3.2 + wz * 2, W > 1500 ? 7 : 5, 43);
    cv += 0.1 * Math.exp(-(((lat - 5) / 7) ** 2)) - 0.12 * Math.exp(-(((a - 24) / 8) ** 2)) + 0.09 * Math.exp(-(((a - 55) / 11) ** 2)) + 0.05 * smooth(70, 85, a);
    let cl = smooth(0.52, 0.7, cv);
    // fields of small cumulus where the air is moist but not overcast (fine detail up close)
    const cu = smooth(0.56, 0.72, fbm3(x * 46, y * 46, z * 46, 3, 44)) * smooth(0.36, 0.55, cv) * (1 - cl) * (0.6 + 0.6 * Math.exp(-(((a - 12) / 18) ** 2))) * (1 - clamp(des, 0, 1));
    cl = Math.min(1, cl + cu * 0.85);
    for (const vt of vort) if (vt.k > 1) { const dd = Math.acos(clamp(x * vt.c[0] + y * vt.c[1] + z * vt.c[2], -1, 1)) / vt.r; cl = Math.max(cl, smooth(1.4, 0.3, dd) * (dd < 0.12 ? 0.2 : 1)); }
    cloud[k] = 255 * Math.min(1, cl * 1.1);
  });
  return { W, H, day, night, cloud, spec, height };
}

// ------------------------------------------------------------------ other bodies
function* moonTex(W, H) {
  const n = W * H, alb = new Float32Array(n), height = new Float32Array(n), day = new Uint8ClampedArray(n * 3);
  // maria: [lat, lon, radius°]; irregular edges come from noise
  const MARIA = [[33, -16, 16], [28, 17, 9.5], [8.5, 31, 11], [17, 59, 7], [-8, 51, 8.5], [-15, 35, 5], [-21, -17, 9.5], [-24, -39, 5.5], [20, -55, 14], [5, -50, 13], [-5, -38, 9], [56, 1, 6], [55, -18, 5], [57, 25, 5.5], [13, 4, 4.5], [-10, -23, 5.5], [7, -31, 6.5], [25, 44, 4], [-1, -16, 4], [34, -42, 7]]
    .map(([la, lo, r]) => ({ c: unit(la, lo), r: r * RAD }));
  const mare = new Float32Array(n);
  yield* eachTexel(W, H, (k, x, y, z) => {
    let m = 0;
    for (const M of MARIA) { const d = Math.acos(clamp(x * M.c[0] + y * M.c[1] + z * M.c[2], -1, 1)) / M.r; m = Math.max(m, smooth(1.15, 0.55, d + (fbm3(x * 9, y * 9, z * 9, 4, 3) - 0.5) * 0.9)); }
    mare[k] = m;
    const hi = 0.66 + 0.2 * (fbm3(x * 14, y * 14, z * 14, 5, 8) - 0.5);
    alb[k] = mix(hi, 0.3 + 0.08 * fbm3(x * 20, y * 20, z * 20, 3, 9), m);
    height[k] = 0.25 * (fbm3(x * 10, y * 10, z * 10, 5, 4) - 0.5) * (1 - m * 0.7);
  });
  const rng = seeded(42);
  const isMare = (c) => { let m = 0; for (const M of MARIA) m = Math.max(m, Math.acos(clamp(c[0] * M.c[0] + c[1] * M.c[1] + c[2] * M.c[2], -1, 1)) < M.r ? 1 : 0); return m; };
  const craters = randomCraters(rng, W > 400 ? 700 : 260, 0.004, 0.055, isMare);
  // named craters
  for (const [la, lo, r, fresh] of [[-43.3, -11.2, 2.4, 1], [9.6, -20.1, 2.6, 0.8], [8.1, -38, 0.9, 0.9], [23.7, -47.4, 1.1, 1.3], [51.6, -9.4, 2.9, 0], [-58.4, -14.4, 6.5, 0], [-9, -3, 4.5, 0], [-22, -2, 3.2, 0], [-5, 61, 2.4, 0], [-14.5, -1.5, 3, 0], [20, 30, 1, 0.6], [-40, -27, 2, 0]])
    craters.push({ c: unit(la, lo), r: r * RAD, fresh, peak: true });
  yield* stampCraters(W, H, height, alb, craters, 0.55);
  yield* stampRays(W, H, alb, unit(-43.3, -11.2), 0.75, 34, 5, 0.9);
  yield* stampRays(W, H, alb, unit(9.6, -20.1), 0.32, 24, 6, 0.6);
  yield* stampRays(W, H, alb, unit(8.1, -38), 0.2, 16, 7, 0.5);
  yield* stampRays(W, H, alb, unit(23.7, -47.4), 0.14, 14, 8, 0.5);
  for (let k = 0; k < n; k++) {
    const a = clamp(alb[k], 0, 1.3), m = mare[k];
    day[k * 3] = 255 * a * (1 - 0.04 * m) * 0.98; day[k * 3 + 1] = 255 * a * (1 - 0.02 * m) * 0.96; day[k * 3 + 2] = 255 * a * (1 + 0.02 * m) * 0.92;
  }
  return { W, H, day, height };
}

function* mercuryTex(W, H) {
  const n = W * H, alb = new Float32Array(n), height = new Float32Array(n), day = new Uint8ClampedArray(n * 3);
  yield* eachTexel(W, H, (k, x, y, z) => {
    alb[k] = 0.55 + 0.25 * (fbm3(x * 6, y * 6, z * 6, 5, 61) - 0.5) - 0.12 * smooth(0.55, 0.7, fbm3(x * 3, y * 3, z * 3, 3, 62));
    height[k] = 0.2 * (fbm3(x * 12, y * 12, z * 12, 4, 63) - 0.5);
  });
  const rng = seeded(88), craters = randomCraters(rng, W > 400 ? 1000 : 360, 0.004, 0.07);
  craters.push({ c: unit(30, -170), r: 0.38, fresh: 0, peak: false }); // Caloris
  yield* stampCraters(W, H, height, alb, craters, 0.6);
  yield* stampRays(W, H, alb, unit(-10, 20), 0.5, 26, 64, 0.8);
  yield* stampRays(W, H, alb, unit(25, -30), 0.35, 20, 65, 0.6);
  for (let k = 0; k < n; k++) { const a = clamp(alb[k], 0, 1.3); day[k * 3] = 255 * a; day[k * 3 + 1] = 245 * a; day[k * 3 + 2] = 228 * a; }
  return { W, H, day, height };
}

function* marsTex(W, H) {
  const n = W * H, height = new Float32Array(n), day = new Uint8ClampedArray(n * 3);
  const alb = new Float32Array(n).fill(1);
  const OLY = unit(18.6, -134), THAR = unit(1, -112), HELLAS = unit(-42, 70), ARGYRE = unit(-50, -43), SYRTIS = unit(9, 70), ELYS = unit(25, 147);
  const ang = (x, y, z, c) => Math.acos(clamp(x * c[0] + y * c[1] + z * c[2], -1, 1));
  yield* eachTexel(W, H, (k, x, y, z, lat, lon) => {
    const big = fbm3(x * 2.2, y * 2.2, z * 2.2, 5, 31), det = fbm3(x * 14, y * 14, z * 14, 4, 32);
    // dark albedo regions (Syrtis Major, Mare Acidalium, Sinus Meridiani...) and bright deserts
    let dark = smooth(0.52, 0.66, big + 0.12 * Math.exp(-((ang(x, y, z, SYRTIS) / 0.28) ** 2)) + 0.1 * Math.exp(-(((lat + 20) / 15) ** 2)) - 0.12 * Math.exp(-((ang(x, y, z, THAR) / 0.6) ** 2)));
    dark *= 1 - smooth(0.25, 0.45, Math.exp(-((ang(x, y, z, HELLAS) / 0.32) ** 2)));
    let col = mix3([206, 120, 70], [214, 150, 98], det);
    col = mix3(col, [112, 62, 42], dark * 0.85);
    let h = 0.18 * (det - 0.5) + 0.25 * Math.exp(-((ang(x, y, z, THAR) / 0.45) ** 2));
    // Olympus Mons and the Tharsis volcanoes
    for (const [c, r, hh] of [[OLY, 0.11, 1.6], [unit(-8.4, -120.5), 0.05, 1], [unit(1.5, -112.5), 0.05, 1], [unit(12, -104.5), 0.05, 1], [ELYS, 0.06, 0.7]]) {
      const d = ang(x, y, z, c) / r; if (d < 1.6) { h += hh * Math.max(0, 1 - d) ** 1.5 - (d < 0.12 ? 0.4 * hh : 0); if (d > 1 && d < 1.25) col = mix3(col, [150, 85, 55], 0.25); }
    }
    // Valles Marineris: a long canyon system east of Tharsis
    const vl = lon + 75, vlat = lat + 8 + 4 * Math.sin(vl * 0.12);
    if (Math.abs(vl) < 30) { const cw = 1.4 + 1.2 * noise3(x * 30, y * 30, z * 30, 33); const cv = smooth(cw, 0, Math.abs(vlat)) * smooth(30, 20, Math.abs(vl)); h -= cv * 1.1; col = mix3(col, [120, 66, 44], cv * 0.6); }
    for (const [c, r] of [[HELLAS, 0.38], [ARGYRE, 0.2]]) { const d = ang(x, y, z, c) / r; if (d < 1.3) { h -= 0.7 * Math.max(0, 1 - d * d); h += 0.25 * Math.exp(-(((d - 1) / 0.12) ** 2)); col = mix3(col, [222, 172, 120], 0.45 * Math.max(0, 1 - d)); } }
    // polar caps with spiral troughs, a dusty haze over Hellas
    const capN = smooth(77 - 12 * (big - 0.5), 83, lat), capS = smooth(-80 + 10 * (big - 0.5), -86, lat);
    const spiral = smooth(0.3, 0.7, 0.5 + 0.5 * Math.sin((90 - Math.abs(lat)) * 0.7 + lon * RAD * 2 + det * 3));
    const cap = Math.max(capN, capS) * (0.82 + 0.18 * spiral);
    col = mix3(col, [246, 240, 236], clamp(cap, 0, 1));
    day[k * 3] = col[0]; day[k * 3 + 1] = col[1]; day[k * 3 + 2] = col[2];
    height[k] = h;
  });
  yield* stampCraters(W, H, height, alb, randomCraters(seeded(7), W > 400 ? 420 : 160, 0.004, 0.06, (c) => c[1] > 0.2), 0.5);
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) day[k * 3 + c] *= alb[k];
  return { W, H, day, height };
}

function* bandTex(W, H, bands, opts) {
  const n = W * H, day = new Uint8ClampedArray(n * 3);
  const bandAt = (lat) => {
    for (let i = 1; i < bands.length; i++) if (lat <= bands[i][0]) { const [l0, ...c0] = bands[i - 1], [l1, ...c1] = bands[i]; const t = (lat - l0) / (l1 - l0); return mix3(c0, c1, t * t * (3 - 2 * t)); }
    return bands[bands.length - 1].slice(1);
  };
  yield* eachTexel(W, H, (k, x, y, z, lat, lon) => {
    // turbulence stretched along longitude (zonal winds), stronger at belt edges
    const tu = fbm3(x * opts.f, y * opts.f * opts.stretch, z * opts.f, 5, opts.seed) - 0.5;
    const tw = fbm3(x * opts.f * 3, y * opts.f * opts.stretch * 2, z * opts.f * 3, 4, opts.seed + 9) - 0.5;
    // a second warp, fed by the first, rolls the flow into eddies and curls (shear
    // between jets of opposite direction, strongest at the belt edges)
    const edge = 0.5 + 0.5 * Math.abs(Math.sin(lat * 0.33));
    const tq = fbm3(x * opts.f * 5 + tu * 5, y * opts.f * opts.stretch * 2.2 + tw * 4, z * opts.f * 5 - tu * 5, W > 500 ? 6 : 4, opts.seed + 17) - 0.5;
    let la = lat + tu * opts.warp + tw * opts.warp * 0.5 * Math.sin(lat * 0.35) + tq * opts.warp * 0.7 * edge;
    let col = bandAt(la).map((c) => c * (1 + tw * opts.contrast + tq * opts.contrast * 0.9));
    if (opts.extra) col = opts.extra(col, x, y, z, lat, lon, tu, tw);
    day[k * 3] = col[0]; day[k * 3 + 1] = col[1]; day[k * 3 + 2] = col[2];
  });
  return { W, H, day };
}
const oval = (lat, lon, la0, lo0, rLat, rLon) => { let dl = lon - lo0; dl = ((dl + 540) % 360) - 180; return Math.hypot(dl / rLon, (lat - la0) / rLat); };

function jupiterTex(W, H) {
  return bandTex(W, H, [
    [-90, 118, 116, 118], [-66, 136, 126, 116], [-52, 178, 158, 132], [-40, 214, 196, 166], [-34, 186, 150, 116], [-27, 225, 210, 182], [-21, 176, 116, 80], [-13, 166, 108, 74],
    [-7, 238, 224, 198], [3, 232, 216, 186], [8, 196, 150, 110], [12, 158, 96, 66], [18, 150, 94, 64], [22, 234, 216, 186], [28, 190, 150, 112], [34, 222, 204, 172], [42, 184, 156, 126], [56, 168, 152, 136], [70, 136, 130, 128], [90, 118, 116, 120],
  ], { f: 2.6, stretch: 5, warp: 7, contrast: 0.45, seed: 101, extra(col, x, y, z, lat, lon, tu, tw) {
    // Great Red Spot with its swirling interior and pale hollow around it
    const d = oval(lat + tu * 2, lon, -22, 20, 6.5, 12);
    if (d < 1.6) {
      // anticyclonic flow: sample turbulence in coordinates spun round the centre, faster near the rim
      const ex = ((((lon - 20 + 540) % 360) - 180) / 12), ey = (lat + 22) / 6.5, spin = 2.6 * Math.min(1, d) ** 1.5;
      const rx = ex * Math.cos(spin) - ey * Math.sin(spin), ry = ex * Math.sin(spin) + ey * Math.cos(spin);
      const inner = fbm3(rx * 3, ry * 3, 7.7, 5, 141) - 0.5;
      col = mix3(col, [238, 224, 200], smooth(1.6, 1.1, d) * 0.65); // the pale "hollow" around it
      const core = mix3([214, 124, 82], [178, 78, 50], smooth(0.2, 0.85, d)).map((c) => c * (1 + inner * 0.5));
      col = mix3(col, core, smooth(1.05, 0.78, d + inner * 0.15));
    }
    // white ovals and dark barges
    for (const [la, lo, r] of [[-41, -40, 2.4], [-41, 60, 2], [-41, 140, 2.2], [-34, -120, 1.6], [37, 80, 1.7], [-58, 0, 1.6]]) { const e = oval(lat, lon, la, lo, r, r * 1.6); if (e < 1.3) col = mix3(col, [242, 236, 220], smooth(1.3, 0.6, e)); }
    for (const [la, lo] of [[15, -30], [15, 50], [15, 130], [16, -150], [-17, 100]]) { const e = oval(lat, lon, la, lo, 1.4, 4); if (e < 1.2) col = mix3(col, [104, 56, 40], smooth(1.2, 0.5, e) * 0.85); }
    // blue-grey festoons trailing from the equatorial zone
    const fest = smooth(0.62, 0.75, noise3(x * 5, y * 30, z * 5, 131)) * Math.exp(-(((lat - 7) / 2.5) ** 2));
    return mix3(col, [92, 98, 120], fest * 0.7);
  } });
}
function saturnTex(W, H) {
  return bandTex(W, H, [
    [-90, 140, 136, 122], [-70, 180, 156, 110], [-50, 214, 184, 126], [-36, 226, 198, 140], [-24, 204, 168, 106], [-14, 232, 204, 142], [0, 240, 218, 160], [12, 228, 196, 132], [22, 198, 160, 100], [34, 222, 190, 130], [50, 204, 172, 118], [66, 172, 156, 124], [90, 130, 140, 150],
  ], { f: 2, stretch: 7, warp: 3, contrast: 0.2, seed: 201, extra(col, x, y, z, lat, lon) {
    // the north polar hexagon
    const r = 90 - lat, sector = Math.PI / 3, a = (((lon * RAD) % sector) + sector) % sector - sector / 2;
    const hex = (13 * Math.cos(Math.PI / 6)) / Math.cos(a);
    if (r < hex + 1.5) col = mix3(col, [150, 156, 160], smooth(hex + 1.5, hex - 0.5, r) * 0.45);
    if (r < 4) col = mix3(col, [110, 116, 124], smooth(4, 0, r) * 0.6);
    return col;
  } });
}
function uranusTex(W, H) {
  return bandTex(W, H, [[-90, 150, 214, 222], [-40, 170, 226, 232], [0, 176, 228, 234], [40, 168, 224, 230], [70, 200, 236, 240], [90, 214, 240, 244]], { f: 2, stretch: 8, warp: 2, contrast: 0.06, seed: 301 });
}
function neptuneTex(W, H) {
  return bandTex(W, H, [[-90, 50, 76, 170], [-70, 66, 100, 210], [-45, 74, 112, 226], [-26, 56, 90, 206], [-10, 70, 108, 222], [10, 78, 118, 230], [40, 64, 98, 210], [90, 52, 80, 180]], { f: 2.4, stretch: 6, warp: 5, contrast: 0.25, seed: 401, extra(col, x, y, z, lat, lon) {
    const d = oval(lat, lon, -20, 10, 6, 11);
    if (d < 1.3) col = mix3(col, [28, 40, 110], smooth(1.2, 0.5, d));
    // bright methane-ice clouds: the companion of the dark spot, "Scooter", and streaks
    for (const [la, lo, rl, ro] of [[-14, 12, 1.4, 8], [-42, -60, 1.6, 6], [-54, 90, 1.2, 4], [28, -100, 1.3, 14], [32, 40, 1, 9]]) { const e = oval(lat, lon, la, lo, rl, ro); if (e < 1.4) col = mix3(col, [236, 242, 255], smooth(1.4, 0.3, e) * 0.9); }
    return col;
  } });
}
function* venusTex(W, H) {
  const n = W * H, day = new Uint8ClampedArray(n * 3);
  yield* eachTexel(W, H, (k, x, y, z, lat, lon) => {
    // superrotating clouds sheared into the dark "Y" and chevrons
    const sh = (Math.abs(lat) / 90) * 1.4, cs = Math.cos(sh), sn = Math.sin(sh);
    const xx = x * cs - z * sn, zz = x * sn + z * cs;
    const v = fbm3(xx * 2.5, y * 7, zz * 2.5, 6, 501), v2 = fbm3(x * 9, y * 9, z * 9, 3, 502);
    const t = smooth(0.3, 0.7, v) * 0.75 + v2 * 0.25;
    const col = mix3([186, 150, 92], [244, 226, 182], t);
    day[k * 3] = col[0]; day[k * 3 + 1] = col[1]; day[k * 3 + 2] = col[2];
  });
  return { W, H, day };
}
function* plutoTex(W, H) {
  const n = W * H, day = new Uint8ClampedArray(n * 3), height = new Float32Array(n);
  yield* eachTexel(W, H, (k, x, y, z, lat, lon) => {
    const det = fbm3(x * 8, y * 8, z * 8, 5, 601);
    let col = mix3([200, 160, 120], [226, 196, 160], det);
    // dark red-brown equatorial belt (Cthulhu) and the bright nitrogen-ice heart
    const belt = smooth(14, 0, Math.abs(lat + 8 + 10 * (fbm3(x * 3, y * 3, z * 3, 3, 602) - 0.5))) * smooth(0.25, 0.5, Math.abs(((lon + 60 + 540) % 360) - 180) / 180) * 1.0;
    col = mix3(col, [86, 44, 30], clamp(belt * 1.3, 0, 0.92));
    const heartL = oval(lat, lon, 22, -8, 17, 15), heartR = oval(lat, lon, 18, 18, 20, 16);
    const tri = lat < 15 && lat > -12 && Math.abs(lon - 4) < (lat + 12) * 0.9;
    const heart = Math.max(smooth(1.05, 0.8, heartL + (det - 0.5) * 0.3), smooth(1.05, 0.75, heartR + (det - 0.5) * 0.4) * 0.85, tri ? 0.9 : 0);
    col = mix3(col, [246, 240, 232], heart);
    // polygonal cells on the smooth plain of the heart's left lobe
    if (heartL < 1) { const cell = ridged3(x * 30, y * 30, z * 30, 2, 603); col = mix3(col, [210, 200, 190], smooth(0.85, 0.98, cell) * 0.6); }
    col = mix3(col, [232, 214, 200], smooth(55, 75, lat) * 0.6);
    day[k * 3] = col[0]; day[k * 3 + 1] = col[1]; day[k * 3 + 2] = col[2];
    height[k] = 0.15 * (det - 0.5) * (1 - heart);
  });
  yield* stampCraters(W, H, height, null, randomCraters(seeded(9), 120, 0.006, 0.05, (c) => c[1] > 0.1 && c[2] > 0.6), 0.6);
  return { W, H, day, height };
}
function* lavaTex(W, H) {
  const n = W * H, day = new Uint8ClampedArray(n * 3), emit = new Uint8ClampedArray(n * 3), height = new Float32Array(n);
  yield* eachTexel(W, H, (k, x, y, z) => {
    const crust = fbm3(x * 5, y * 5, z * 5, 5, 701), crack = ridged3(x * 7 + crust, y * 7, z * 7 - crust, 4, 702);
    const sea = smooth(0.38, 0.3, crust);
    const c = mix3([46, 36, 34], [74, 62, 58], fbm3(x * 20, y * 20, z * 20, 3, 703));
    day[k * 3] = c[0]; day[k * 3 + 1] = c[1]; day[k * 3 + 2] = c[2];
    const e = Math.max(smooth(0.78, 0.95, crack), sea) * (0.6 + 0.4 * fbm3(x * 30, y * 30, z * 30, 2, 704));
    emit[k * 3] = 255 * e; emit[k * 3 + 1] = 120 * e * e; emit[k * 3 + 2] = 30 * e * e * e;
    height[k] = 0.4 * crust - 0.3 * e;
  });
  return { W, H, day, emit, height };
}
// The photosphere: granulation, sunspot groups with umbra and penumbra, bright faculae.
function* sunTex(W, H, seed) {
  const n = W * H, day = new Uint8ClampedArray(n * 3);
  const rng = seeded(seed);
  const spots = [];
  if (seed === 1) for (let g = 0; g < 6; g++) {
    const la = (rng() < 0.5 ? -1 : 1) * (8 + rng() * 22), lo = rng() * 360 - 180;
    for (let s = 0; s < 2 + rng() * 5; s++) spots.push({ c: unit(la + (rng() - 0.5) * 6, lo + (rng() - 0.5) * 14), r: (0.4 + rng() * 1.6) * RAD });
  }
  yield* eachTexel(W, H, (k, x, y, z) => {
    const cells = ridged3(x * 46, y * 46, z * 46, 2, seed * 13), fine = noise3(x * 140, y * 140, z * 140, seed * 13 + 1);
    let v = 0.78 + 0.16 * (1 - cells) + 0.06 * fine;
    for (const sp of spots) {
      const d = Math.acos(clamp(x * sp.c[0] + y * sp.c[1] + z * sp.c[2], -1, 1)) / sp.r;
      if (d < 4) {
        const fil = 0.75 + 0.25 * noise3(x * 300, y * 300, z * 300, 99);
        v = Math.min(v, d < 0.45 ? 0.12 : d < 1 ? 0.5 * fil : 1);
        if (d > 1.2) v += 0.1 * Math.exp(-(d - 1.2)) * smooth(0.5, 0.7, fine); // faculae
      }
    }
    day[k * 3] = day[k * 3 + 1] = day[k * 3 + 2] = 255 * clamp(v, 0, 1);
  });
  return { W, H, day };
}

// tilt: spin axis rolled in the picture (°); pitch: axis tipped toward you (rad).
// spin: rad/s at speed 1. light: "lambert" (lit gas and cloud), "lommel" (airless dust,
// flat-looking full disc). ring: [inner, outer] in planet radii.
export const BODIES = {
  earth: { label: "Earth", gen: earthTex, tilt: 23.4, pitch: 0.12, spin: 0.06, light: "lambert", atmo: [80, 140, 255], atmoK: 1, ambient: 0.012, bump: 1.4, specK: 0.7, cloudSpin: 1.15, nightK: 1 },
  moon: { label: "Moon", gen: moonTex, tilt: 0, pitch: 0.03, spin: 0, light: "lommel", ambient: 0.022, bump: 2.4 },
  mars: { label: "Mars", gen: marsTex, tilt: 25, pitch: 0.38, spin: 0.06, light: "mixed", atmo: [240, 170, 130], atmoK: 0.35, ambient: 0.01, bump: 1.4 },
  jupiter: { label: "Jupiter", gen: jupiterTex, tilt: 3, pitch: 0.05, spin: 0.12, light: "gas", atmo: [230, 210, 180], atmoK: 0.25, ambient: 0.006 },
  saturn: { label: "Saturn", gen: saturnTex, tilt: 26.7, pitch: 0.42, spin: 0.11, light: "gas", atmo: [235, 215, 170], atmoK: 0.2, ambient: 0.006, ring: [1.24, 2.34] },
  venus: { label: "Venus", gen: venusTex, tilt: 3, pitch: 0.04, spin: 0.03, light: "gas", atmo: [255, 236, 180], atmoK: 1.5, ambient: 0.01 },
  mercury: { label: "Mercury", gen: mercuryTex, tilt: 0, pitch: 0.02, spin: 0.02, light: "lommel", ambient: 0.008, bump: 2.6 },
  uranus: { label: "Uranus", gen: uranusTex, tilt: 98, pitch: 0.4, spin: 0.08, light: "gas", atmo: [170, 230, 240], atmoK: 0.7, ambient: 0.01, ring: [1.6, 2.05], ringFaint: true },
  neptune: { label: "Neptune", gen: neptuneTex, tilt: 28, pitch: 0.1, spin: 0.08, light: "gas", atmo: [110, 150, 255], atmoK: 0.75, ambient: 0.01 },
  pluto: { label: "Pluto", gen: plutoTex, tilt: 18, pitch: 0.25, spin: 0.025, light: "lommel", atmo: [130, 170, 255], atmoK: 0.3, ambient: 0.012, bump: 2.5 },
  "lava world": { label: "Lava world", gen: lavaTex, tilt: 12, pitch: 0.1, spin: 0.05, light: "mixed", atmo: [255, 120, 60], atmoK: 0.45, ambient: 0.02, bump: 2, emitK: 1 },
  sun: { label: "Sun", gen: (W, H) => sunTex(W, H, 1), emissive: true },
  sun2: { label: "Sun", gen: (W, H) => sunTex(W, H, 2), emissive: true },
};

// Textures are generated once per body. The small one (tile previews, and the first
// moments on a big surface) is built at once; the full-size one is built in the
// background in ~10 ms slices and swapped in when it's ready.
const texCache = new Map(), queue = [];
let pumping = false;
const drain = (gen) => { let r; while (!(r = gen.next()).done); return r.value; };
function pump() {
  const job = queue[0];
  if (!job) { pumping = false; return; }
  const end = performance.now() + 10;
  while (performance.now() < end) { const r = job.gen.next(); if (r.done) { texCache.set(job.key, r.value); queue.shift(); break; } }
  setTimeout(pump, 0);
}
// level: 0 = small only, 1 = full size, 2 = extra large (Earth seen up close from orbit).
// Returns the best texture built so far and queues the rest.
export function bodyTex(name, level) {
  level = level === true ? 1 : level || 0;
  const keys = [name + ":S", name + ":L", name + ":XL"];
  if (!texCache.has(keys[0])) texCache.set(keys[0], drain(BODIES[name].gen(256, 128)));
  let best = keys[0];
  for (let l = 1; l <= level; l++) {
    if (texCache.has(keys[l])) { best = keys[l]; continue; }
    if (!queue.some((j) => j.key === keys[l])) {
      const W = l === 2 ? 2048 : name === "earth" || name === "moon" ? 1024 : 768;
      queue.push({ key: keys[l], gen: BODIES[name].gen(W, W / 2) });
      if (!pumping) { pumping = true; setTimeout(pump, 0); }
    }
  }
  return texCache.get(best);
}
// Resolves once every queued texture is built (used by tests and screenshots).
export const texturesReady = () => new Promise((res) => { const check = () => (queue.length ? setTimeout(check, 30) : res()); check(); });

// Saturn-style ring density and colour by radius (planet radii).
function ringProfile(name, r) {
  if (name === "uranus") {
    for (const [r0, w, d] of [[1.64, 0.008, 0.5], [1.7, 0.006, 0.4], [1.79, 0.006, 0.4], [1.86, 0.01, 0.5], [2.0, 0.02, 0.9]]) if (Math.abs(r - r0) < w) return [d * 0.5, 150, 160, 170];
    return [0, 0, 0, 0];
  }
  const fine = 0.84 + 0.1 * Math.sin(r * 140) * Math.sin(r * 37) + 0.16 * (noise3(r * 60, 0.5, 0.5, 9) - 0.5);
  if (r < 1.24) return [0, 0, 0, 0];
  if (r < 1.53) return [(0.1 + 0.08 * smooth(1.24, 1.53, r)) * fine, 150, 140, 128]; // C ring
  if (r < 1.95) return [Math.min(1, (0.72 + 0.25 * smooth(1.53, 1.75, r)) * fine), 228, 212, 180]; // B ring
  if (r < 2.03) return [0.05, 120, 110, 100]; // Cassini division
  if (r < 2.27) { if (r > 2.209 && r < 2.217) return [0.02, 0, 0, 0]; return [0.55 * fine, 214, 196, 166]; } // A ring, Encke gap
  if (Math.abs(r - 2.326) < 0.006) return [0.5, 220, 210, 190]; // F ring
  return [0, 0, 0, 0];
}

// ------------------------------------------------------------------ sphere renderer
// The spin axis and two equatorial directions in view space (x right, y up, z toward you)
// for a body whose axis is rolled `tilt` degrees in the picture and tipped `pitch` rad toward you.
export function axesFor(tilt, pitch) {
  const roll = (-tilt * Math.PI) / 180, cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const toView = (x, y, z) => { const y1 = y * cp - z * sp, z1 = y * sp + z * cp; return [x * cr - y1 * sr, x * sr + y1 * cr, z1]; };
  const toBody = (x, y, z) => { const x1 = x * cr + y * sr, y1 = -x * sr + y * cr; return [x1, y1 * cp + z * sp, -y1 * sp + z * cp]; };
  return { toView, toBody, axis: toView(0, 1, 0), e1: toView(1, 0, 0), e3: toView(0, 0, 1) };
}

export class SphereView {
  // bw×bh buffer; centre (cx, cy) and radius R in buffer pixels.
  constructor(bw, bh, cx, cy, R, { tilt = 0, pitch = 0, ring = null, ringName = "", halo = 0.06 } = {}) {
    Object.assign(this, { bw, bh, cx, cy, R, ring, ringName });
    this.canvas = document.createElement("canvas");
    this.canvas.width = bw; this.canvas.height = bh;
    this.g = this.canvas.getContext("2d");
    this.img = this.g.createImageData(bw, bh);
    // body → view: v = Rz(roll) · Rx(pitch) · b
    const { toView, toBody, axis, e1, e3 } = axesFor(tilt, pitch);
    this.axis = axis; this.e1 = e1; this.e3 = e3;
    const idx = [], N = [], LL = [], T = [], cov = [];
    const x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(bw - 1, Math.ceil(cx + R + 1));
    const y0 = Math.max(0, Math.floor(cy - R - 1)), y1 = Math.min(bh - 1, Math.ceil(cy + R + 1));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const dx = (px + 0.5 - cx) / R, dy = -(py + 0.5 - cy) / R, d2 = dx * dx + dy * dy;
      const dist = Math.sqrt(d2) * R;
      if (dist > R + 0.5) continue;
      const k = Math.min(1, d2), nz = Math.sqrt(1 - k), nn = Math.sqrt(dx * dx + dy * dy + nz * nz) || 1;
      const vx = dx / nn, vy = dy / nn, vz = nz / nn;
      const [bx, by, bz] = toBody(vx, vy, vz);
      const lat = Math.asin(clamp(by, -1, 1)), lon = Math.atan2(bx, bz);
      const E = toView(Math.cos(lon), 0, -Math.sin(lon)), Nn = toView(-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon));
      idx.push(py * bw + px); N.push(vx, vy, vz); LL.push(lat, lon); T.push(E[0], E[1], E[2], Nn[0], Nn[1], Nn[2]);
      cov.push(clamp(R + 0.5 - dist, 0, 1));
    }
    this.idx = Int32Array.from(idx); this.N = Float32Array.from(N); this.LL = Float32Array.from(LL); this.T = Float32Array.from(T); this.cov = Float32Array.from(cov);
    // atmosphere halo just outside the limb
    const hidx = [], hd = [], hdir = [], H = R * halo;
    if (halo > 0) {
      const hx0 = Math.max(0, Math.floor(cx - R - H)), hx1 = Math.min(bw - 1, Math.ceil(cx + R + H)), hy0 = Math.max(0, Math.floor(cy - R - H)), hy1 = Math.min(bh - 1, Math.ceil(cy + R + H));
      for (let py = hy0; py <= hy1; py++) for (let px = hx0; px <= hx1; px++) {
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy, dist = Math.hypot(dx, dy);
        if (dist < R - 1 || dist > R + H) continue;
        hidx.push(py * bw + px); hd.push((dist - R) / H); hdir.push(dx / dist, -dy / dist);
      }
    }
    this.hidx = Int32Array.from(hidx); this.hd = Float32Array.from(hd); this.hdir = Float32Array.from(hdir);
    // rings: where each pixel's line of sight crosses the equatorial plane
    if (ring) {
      const [ax, ay, az] = this.axis, ridx = [], rr = [], rp = [];
      if (Math.abs(az) > 0.01) {
        const ext = ring[1] * R + 1;
        for (let py = Math.max(0, Math.floor(cy - ext)); py <= Math.min(bh - 1, Math.ceil(cy + ext)); py++) for (let px = Math.max(0, Math.floor(cx - ext)); px <= Math.min(bw - 1, Math.ceil(cx + ext)); px++) {
          const x = (px + 0.5 - cx) / R, y = -(py + 0.5 - cy) / R, z = -(ax * x + ay * y) / az, r = Math.sqrt(x * x + y * y + z * z);
          if (r < ring[0] || r > ring[1]) continue;
          const inDisk = x * x + y * y < 1;
          if (inDisk && z < Math.sqrt(1 - x * x - y * y)) continue; // behind the planet
          ridx.push(py * bw + px); rr.push(r); rp.push(x, y, z);
        }
      }
      this.ridx = Int32Array.from(ridx); this.rr = Float32Array.from(rr); this.rp = Float32Array.from(rp);
      this.rtab = Array.from({ length: 1024 }, (_, i) => ringProfile(ringName, ring[0] + ((ring[1] - ring[0]) * i) / 1023));
    }
  }
  ringAt(r) { const i = Math.round(((r - this.ring[0]) / (this.ring[1] - this.ring[0])) * 1023); return i < 0 || i > 1023 ? null : this.rtab[i]; }

  // o: { rot, cloudRot, L: [x,y,z] unit (view space, y up, z toward you), tint: [r,g,b] for stars,
  //      atmoK, nightK, limb (stars), exposure }
  draw(tex, body, o) {
    const d = this.img.data, W = tex.W, H = tex.H, day = tex.day, night = tex.night, cloud = tex.cloud, spec = tex.spec, hgt = tex.height, emit = tex.emit;
    d.fill(0);
    const [Lx, Ly, Lz] = o.L, N = this.N, LL = this.LL, T = this.T, cov = this.cov, idx = this.idx;
    const rotW = (o.rot / TAU) * W, crotW = ((o.cloudRot ?? o.rot) / TAU) * W;
    const bump = (body.bump || 0) * (W / 768) * 0.9, amb = body.ambient || 0, atmo = body.atmo, atmoK = (body.atmoK || 0) * (o.atmoK ?? 1);
    const nightK = (body.nightK || 0) * (o.nightK ?? 1), specK = body.specK || 0, emitK = (body.emitK || 0) * (o.emitK ?? 1);
    const model = body.light, star = body.emissive, tint = o.tint || [255, 255, 255], exp = o.exposure ?? 1;
    const hx = Lx, hy = Ly, hz = Lz + 1, hl = Math.hypot(hx, hy, hz) || 1; // half vector for glints
    const ring = this.ring, [ax, ay, az] = this.axis, aL = ax * Lx + ay * Ly + az * Lz;
    for (let p = 0, n = idx.length; p < n; p++) {
      const k = idx[p] * 4;
      let nx = N[p * 3], ny = N[p * 3 + 1], nz = N[p * 3 + 2];
      const lat = LL[p * 2], lon = LL[p * 2 + 1];
      // bilinear texture lookup
      const fy = (0.5 - lat / Math.PI) * H - 0.5, fx = (lon / TAU) * W + rotW - 0.5;
      const y0 = fy < 0 ? 0 : fy > H - 1 ? H - 1 : fy | 0, y1 = y0 + 1 > H - 1 ? H - 1 : y0 + 1, ty = clamp(fy - y0, 0, 1);
      const xf = Math.floor(fx), tx = fx - xf, x0 = ((xf % W) + W) % W, x1 = (x0 + 1) % W;
      const i00 = y0 * W + x0, i10 = y0 * W + x1, i01 = y1 * W + x0, i11 = y1 * W + x1;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      let r = day[i00 * 3] * w00 + day[i10 * 3] * w10 + day[i01 * 3] * w01 + day[i11 * 3] * w11;
      let g = day[i00 * 3 + 1] * w00 + day[i10 * 3 + 1] * w10 + day[i01 * 3 + 1] * w01 + day[i11 * 3 + 1] * w11;
      let b = day[i00 * 3 + 2] * w00 + day[i10 * 3 + 2] * w10 + day[i01 * 3 + 2] * w01 + day[i11 * 3 + 2] * w11;
      if (star) {
        // limb darkening: dimmer and redder toward the edge
        // limb darkening, and the colour shift that goes with it: near-white where we see
        // deep, hot layers at the centre, through the star's colour to deep orange-red at the edge
        const mu = nz, I = (r / 255) * (1 - 0.62 * (1 - mu) - 0.2 * (1 - mu) * (1 - mu)) * exp;
        let c0, c1, k;
        if (I < 0.62) { c0 = [tint[0] * 0.8, tint[1] * 0.38, tint[2] * 0.16]; c1 = tint; k = I / 0.62; }
        else { c0 = tint; c1 = [255, 250, 236]; k = Math.min(1, (I - 0.62) / 0.45); }
        const br = Math.min(1, 0.25 + I * 0.9);
        r = (c0[0] + (c1[0] - c0[0]) * k) * br; g = (c0[1] + (c1[1] - c0[1]) * k) * br; b = (c0[2] + (c1[2] - c0[2]) * k) * br;
      } else {
        if (hgt && bump) {
          const ia = y0 * W, dh = hgt[ia + x1] - hgt[ia + ((x0 - 1 + W) % W)], dv = hgt[(y0 > 0 ? y0 - 1 : 0) * W + x0] - hgt[y1 * W + x0];
          const e = p * 6;
          nx -= bump * (dh * T[e] + dv * T[e + 3]); ny -= bump * (dh * T[e + 1] + dv * T[e + 4]); nz -= bump * (dh * T[e + 2] + dv * T[e + 5]);
          const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= l; ny *= l; nz *= l;
        }
        const ndl = nx * Lx + ny * Ly + nz * Lz, mu0 = N[p * 3] * Lx + N[p * 3 + 1] * Ly + N[p * 3 + 2] * Lz;
        let lit;
        if (model === "lommel") { const m0 = Math.max(0, ndl), mu = Math.max(0.05, N[p * 3 + 2]); lit = mu0 > -0.02 ? (2 * m0) / (m0 + mu) * 0.75 + m0 * 0.25 : 0; }
        else if (model === "mixed") { const m0 = Math.max(0, ndl), mu = Math.max(0.05, N[p * 3 + 2]); lit = mu0 > -0.02 ? ((2 * m0) / (m0 + mu)) * 0.45 + m0 * 0.55 : 0; }
        else if (model === "gas") lit = Math.max(0, ndl) * (0.55 + 0.45 * Math.pow(Math.max(0, N[p * 3 + 2]), 0.35));
        else lit = Math.max(0, ndl * 0.92 + 0.08);
        if (mu0 < 0.02 && model !== "lambert") lit *= smooth(-0.02, 0.06, mu0);
        // shadow of the rings on the planet
        if (ring && Math.abs(aL) > 0.02) {
          const s = -(ax * N[p * 3] + ay * N[p * 3 + 1] + az * N[p * 3 + 2]) / aL;
          if (s > 0) { const qx = N[p * 3] + s * Lx, qy = N[p * 3 + 1] + s * Ly, qz = N[p * 3 + 2] + s * Lz, rr = Math.sqrt(qx * qx + qy * qy + qz * qz); const R = this.ringAt(rr); if (R) lit *= 1 - R[0] * 0.85; }
        }
        let cl = 0;
        if (cloud) {
          const cfx = (lon / TAU) * W + crotW - 0.5, cxf = Math.floor(cfx), ctx_ = cfx - cxf, c0 = ((cxf % W) + W) % W, c1 = (c0 + 1) % W;
          cl = ((cloud[y0 * W + c0] * (1 - ctx_) + cloud[y0 * W + c1] * ctx_) * (1 - ty) + (cloud[y1 * W + c0] * (1 - ctx_) + cloud[y1 * W + c1] * ctx_) * ty) / 255;
        }
        let L = lit + amb;
        // cloud shadows: look up the cloud deck a little way toward the Sun; the
        // offset grows as the Sun gets lower, so shadows stretch out near the terminator
        if (cloud && ndl > 0.02) {
          const e = p * 6, le = Lx * T[e] + Ly * T[e + 1] + Lz * T[e + 2], ln = Lx * T[e + 3] + Ly * T[e + 4] + Lz * T[e + 5];
          const sl = Math.hypot(le, ln) || 1, d = Math.min(0.03, (0.004 * Math.sqrt(Math.max(0, 1 - ndl * ndl))) / ndl);
          const sx = Math.round((lon / TAU) * W + crotW + ((le / sl) * d * W) / (TAU * Math.max(0.15, Math.cos(lat)))), sy = Math.round(fy - ((ln / sl) * d * H) / Math.PI);
          const cs = cloud[clamp(sy, 0, H - 1) * W + ((sx % W) + W) % W] / 255;
          L *= 1 - 0.5 * cs * (1 - cl);
        }
        r *= L; g *= L; b *= L;
        if (specK && spec) {
          const sp = (spec[i00] * w00 + spec[i10] * w10 + spec[i01] * w01 + spec[i11] * w11) / 255;
          if (sp > 0 && ndl > 0) { const nh = (N[p * 3] * hx + N[p * 3 + 1] * hy + N[p * 3 + 2] * hz) / hl; const s = sp * specK * (Math.pow(Math.max(0, nh), 70) * 2.2 + Math.pow(Math.max(0, nh), 8) * 0.18) * (1 - cl); r += 255 * s; g += 240 * s; b += 215 * s; }
        }
        // thin cloud is greyer, thick cloud tops brilliant white
        if (cl > 0) { const cL = (Math.max(0, mu0 * 0.9 + 0.1) + amb) * (0.72 + 0.28 * cl); r = r * (1 - cl) + 250 * cl * cL; g = g * (1 - cl) + 252 * cl * cL; b = b * (1 - cl) + 255 * cl * cL; }
        if (night && nightK) {
          const dark = 1 - smooth(-0.12, 0.08, mu0);
          // break the lights into points finer than the texture: towns, not a glow
          if (dark > 0) { const hv = hash(Math.floor(fx * 4), Math.floor(fy * 4), 0, 5), nk = dark * nightK * (1 - cl * 0.75) * (0.15 + 2.2 * hv * hv * hv); r += (night[i00 * 3] * w00 + night[i10 * 3] * w10 + night[i01 * 3] * w01 + night[i11 * 3] * w11) * nk; g += (night[i00 * 3 + 1] * w00 + night[i10 * 3 + 1] * w10 + night[i01 * 3 + 1] * w01 + night[i11 * 3 + 1] * w11) * nk; b += (night[i00 * 3 + 2] * w00 + night[i10 * 3 + 2] * w10 + night[i01 * 3 + 2] * w01 + night[i11 * 3 + 2] * w11) * nk; }
        }
        if (emit && emitK) { r += (emit[i00 * 3] * w00 + emit[i11 * 3] * w11 + emit[i10 * 3] * w10 + emit[i01 * 3] * w01) * emitK; g += (emit[i00 * 3 + 1] * w00 + emit[i11 * 3 + 1] * w11 + emit[i10 * 3 + 1] * w10 + emit[i01 * 3 + 1] * w01) * emitK; b += (emit[i00 * 3 + 2] * w00 + emit[i11 * 3 + 2] * w11 + emit[i10 * 3 + 2] * w10 + emit[i01 * 3 + 2] * w01) * emitK; }
        if (atmo && atmoK) {
          // scattering: blue haze thickening toward the limb on the day side, a warm band at the terminator
          const rim = Math.pow(1 - Math.max(0, N[p * 3 + 2]), 3), day_ = smooth(-0.25, 0.4, mu0);
          const a = rim * day_ * atmoK * 0.9;
          r = r * (1 - a * 0.5) + atmo[0] * a; g = g * (1 - a * 0.5) + atmo[1] * a; b = b * (1 - a * 0.5) + atmo[2] * a;
          const tw = Math.exp(-(((mu0 - 0.02) / 0.06) ** 2)) * atmoK * 0.14 * rim;
          r += 255 * tw; g += 110 * tw; b += 40 * tw;
        }
      }
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255 * cov[p];
    }
    // halo: the atmosphere seen edge-on, brightest on the sunlit side
    if (this.hidx.length && (atmo && atmoK || star)) {
      const col = star ? tint : atmo, k0 = star ? 1 : atmoK;
      for (let p = 0, n = this.hidx.length; p < n; p++) {
        const k = this.hidx[p] * 4, t = this.hd[p];
        const side = star ? 1 : smooth(-0.45, 0.6, this.hdir[p * 2] * Lx + this.hdir[p * 2 + 1] * Ly) * (0.4 + 0.6 * smooth(-0.6, 0.2, Lz));
        const a = clamp((t < 0 ? 1 : Math.exp(-t * 3.2) * (1 - t)) * side * Math.min(1, k0) * (star ? 0.8 : 0.9), 0, 1);
        if (a <= 0.003) continue;
        const pa = d[k + 3] / 255, na = a + pa * (1 - a);
        if (t < 0) { d[k] = d[k] + col[0] * a * 0.6; d[k + 1] = d[k + 1] + col[1] * a * 0.6; d[k + 2] = d[k + 2] + col[2] * a * 0.6; continue; }
        d[k] = (col[0] * a + d[k] * pa * (1 - a)) / na; d[k + 1] = (col[1] * a + d[k + 1] * pa * (1 - a)) / na; d[k + 2] = (col[2] * a + d[k + 2] * pa * (1 - a)) / na; d[k + 3] = na * 255;
      }
    }
    if (ring && this.ridx.length) {
      const litFace = Math.sign(aL) === Math.sign(az);
      for (let p = 0, n = this.ridx.length; p < n; p++) {
        const R = this.ringAt(this.rr[p]); if (!R || R[0] <= 0.005) continue;
        const k = this.ridx[p] * 4, x = this.rp[p * 3], y = this.rp[p * 3 + 1], z = this.rp[p * 3 + 2];
        // the planet's shadow across the rings
        const t = x * Lx + y * Ly + z * Lz, sx = x - t * Lx, sy = y - t * Ly, sz = z - t * Lz;
        const shadow = t < 0 && sx * sx + sy * sy + sz * sz < 1 ? 0.04 : 1;
        const dens = R[0], br = (litFace ? 0.6 + 0.4 * Math.sqrt(Math.abs(aL)) : 0.25 + dens * (1 - dens) * 1.6) * shadow * (body.ringFaint ? 0.6 : 1);
        const a = Math.min(1, dens * (body.ringFaint ? 0.7 : 1)), pa = d[k + 3] / 255, na = a + pa * (1 - a);
        d[k] = (R[1] * br * a + d[k] * pa * (1 - a)) / na; d[k + 1] = (R[2] * br * a + d[k + 1] * pa * (1 - a)) / na; d[k + 2] = (R[3] * br * a + d[k + 2] * pa * (1 - a)) / na; d[k + 3] = na * 255;
      }
    }
    this.g.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

// ------------------------------------------------------------------ stars
// Stellar colours by spectral class, weighted roughly as they appear to the eye.
export const STAR_COLORS = [["#9bb0ff", 0.06], ["#cad7ff", 0.14], ["#f4f5ff", 0.22], ["#fff3e4", 0.24], ["#ffd9a8", 0.2], ["#ffbb7a", 0.14]];
export function starColor(r) { let a = 0; for (const [c, w] of STAR_COLORS) { a += w; if (r < a) return c; } return STAR_COLORS[2][0]; }

// A fixed star field: faint stars baked into a cached canvas, the brightest few drawn
// each frame so they can twinkle and carry diffraction spikes.
export function starfield(ctx, w, h, t, s, { density = 1, seed = 3, twinkle = 1, spikes = 0, bright = 1, key = "sf" } = {}) {
  const cacheKey = `${w}x${h}:${density}:${seed}`;
  if (!s[key] || s[key].k !== cacheKey) {
    const rng = seeded(seed), c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d"), n = Math.round((w * h) / 900 * density), big = [];
    const m = Math.max(0.6, Math.min(w, h) / 500);
    for (let i = 0; i < n; i++) {
      const x = rng() * w, y = rng() * h, mag = Math.pow(rng(), 7), col = starColor(rng());
      if (mag > 0.25 && big.length < 80) { big.push({ x, y, mag, col, ph: rng() * TAU, sp: 0.6 + rng() * 2 }); continue; }
      g.globalAlpha = 0.25 + 0.75 * Math.min(1, mag * 4 + rng() * 0.3);
      g.fillStyle = col;
      const r = (0.45 + mag * 2.2) * m;
      if (r > 1.6) { g.beginPath(); g.arc(x, y, r / 2, 0, TAU); g.fill(); } else g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    s[key] = { k: cacheKey, c, big, m };
  }
  const S = s[key];
  ctx.globalAlpha = bright; ctx.drawImage(S.c, 0, 0);
  for (const st of S.big) {
    const tw = 1 - twinkle * 0.35 * (0.5 + 0.5 * Math.sin(t * st.sp * 3 + st.ph)) * (0.5 + 0.5 * Math.sin(t * st.sp * 7.3 + st.ph * 2));
    const r = (1 + st.mag * 3.2) * S.m;
    ctx.globalAlpha = bright * tw;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glow(st.col), st.x - r * 2.5, st.y - r * 2.5, r * 5, r * 5);
    if (spikes && st.mag > 0.72) drawSpikes(ctx, st.x, st.y, r * 5 * Math.min(1.5, spikes) * st.mag, st.col, bright * tw * 0.7, spikes > 1.5 ? "jwst" : "hubble");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(st.x, st.y, r * 0.35, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
const glows = new Map();
export function glow(color, size = 64, falloff = 0.22) {
  const key = color + size + falloff;
  if (glows.has(key)) return glows.get(key);
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const n = parseInt(color.slice(1), 16), rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(falloff, `rgba(${rgb},0.5)`); gr.addColorStop(0.55, `rgba(${rgb},0.1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  glows.set(key, c);
  return c;
}
// Diffraction spikes: four (refractor-style vanes) or the six-plus-two of a segmented mirror.
export function drawSpikes(ctx, x, y, len, color, alpha, style = "hubble") {
  const angs = style === "jwst" ? [[Math.PI / 2, 1], [Math.PI / 2 + Math.PI / 3, 1], [Math.PI / 2 - Math.PI / 3, 1], [0, 0.45]] : [[Math.PI / 4, 1], [-Math.PI / 4, 1]];
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const [a, k] of angs) {
    const dx = Math.cos(a) * len * k, dy = Math.sin(a) * len * k;
    const gr = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, color); gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = gr; ctx.globalAlpha = alpha * (k < 1 ? 0.7 : 1); ctx.lineWidth = Math.max(0.6, len * 0.035);
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  ctx.restore();
}

// Fit a planet buffer to a canvas: returns a cached SphereView sized for (w, h).
export function planetView(s, key, w, h, cx, cy, R, opts, maxR = 190) {
  const f = Math.min(1, maxR / R), bw = Math.max(8, Math.round(w * f)), bh = Math.max(8, Math.round(h * f));
  const sig = [bw, bh, cx, cy, R, JSON.stringify(opts)].join("|");
  if (!s[key] || s[key].sig !== sig) s[key] = { sig, f, view: new SphereView(bw, bh, cx * f, cy * f, R * f, opts) };
  return s[key];
}
