import { hexToRgb } from "../theme.js";

// ---- territory layer -------------------------------------------------
// Ownership is rasterized once per sim year into a world-space offscreen
// canvas (nearest living member system within reach, via bucket grid),
// then drawn under the map with the current pan/zoom transform.
export const WORLD_R = 640;   // half-extent of the rasterized world square (covers the largest configurable galaxy)
const GRID = 448;             // cells per side
const CELL = (WORLD_R * 2) / GRID;
const REACH = 60;             // world units a system projects territory over

export function computeTerritory(w, cache) {
  if (!cache.canvas) {
    cache.canvas = document.createElement("canvas");
    cache.canvas.width = GRID; cache.canvas.height = GRID;
    cache.owners = new Int16Array(GRID * GRID);
  }
  const owners = cache.owners;
  owners.fill(-1);
  const src = w.systems.filter((s) => s.pop > 0.05 && s.fid !== null);
  const buckets = new Map();
  const bk = (bx, by) => bx * 4096 + by;
  for (const s of src) {
    const bx = Math.floor((s.x + WORLD_R) / REACH), by = Math.floor((s.y + WORLD_R) / REACH);
    const k = bk(bx, by);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const r2max = REACH * REACH;
  for (let gy = 0; gy < GRID; gy++) {
    const y = -WORLD_R + (gy + 0.5) * CELL;
    const by = Math.floor((y + WORLD_R) / REACH);
    for (let gx = 0; gx < GRID; gx++) {
      const x = -WORLD_R + (gx + 0.5) * CELL;
      const bx = Math.floor((x + WORLD_R) / REACH);
      let best = null, bd = r2max;
      for (let ix = bx - 1; ix <= bx + 1; ix++)
        for (let iy = by - 1; iy <= by + 1; iy++) {
          const cell = buckets.get(bk(ix, iy));
          if (!cell) continue;
          for (const s of cell) {
            const dx = s.x - x, dy = s.y - y;
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = s; }
          }
        }
      if (best) owners[gy * GRID + gx] = best.fid;
    }
  }
  const colorCache = {};
  const rgbOf = (fid) => colorCache[fid] || (colorCache[fid] = hexToRgb(w.factions[fid].color));
  const ctx = cache.canvas.getContext("2d");
  const img = ctx.createImageData(GRID, GRID);
  const px = img.data;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const o = owners[gy * GRID + gx];
      if (o < 0) continue;
      const up = gy > 0 ? owners[(gy - 1) * GRID + gx] : -1;
      const dn = gy < GRID - 1 ? owners[(gy + 1) * GRID + gx] : -1;
      const lf = gx > 0 ? owners[gy * GRID + gx - 1] : -1;
      const rt = gx < GRID - 1 ? owners[gy * GRID + gx + 1] : -1;
      const border = up !== o || dn !== o || lf !== o || rt !== o;
      const [r, g, b] = rgbOf(o);
      const i = (gy * GRID + gx) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
      px[i + 3] = border ? 150 : 38;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.year = w.year;
  cache.seed = w.seed;
}
