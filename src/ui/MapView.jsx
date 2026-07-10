import { useEffect, useRef, useState } from "react";
import { mulberry32 } from "../sim/rng.js";
import { clamp } from "../sim/util.js";
import { relKey } from "../sim/events.js";
import { hexToRgb, mixHex, wbColor, EV_STYLE, OVERLAYS } from "./theme.js";
import { fmtPop } from "./format.js";

// ---- territory layer -------------------------------------------------
// Ownership is rasterized once per sim year into a world-space offscreen
// canvas (nearest living member system within reach, via bucket grid),
// then drawn under the map with the current pan/zoom transform.
const WORLD_R = 520;          // half-extent of the rasterized world square
const GRID = 448;             // cells per side
const CELL = (WORLD_R * 2) / GRID;
const REACH = 60;             // world units a system projects territory over

function computeTerritory(w, cache) {
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

// map events worth flashing on the map to their chronicle colors
const PULSE_TYPES = new Set([
  "famine", "plague", "battle", "siege", "capture", "colony", "death",
  "found", "secede", "annex", "strike", "flare", "build", "house",
]);

export default function MapView({ worldRef, selected, onSelect, overlay, setOverlay, burn, mapApi }) {
  const canvasRef = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.55 });
  const dragRef = useRef(null);
  const hoverRef = useRef(null);
  const tooltipRef = useRef(null);
  const territoryRef = useRef({ year: -1, seed: null });
  const pulsesRef = useRef([]);
  const lastSeqRef = useRef(0);
  const focusRef = useRef(null);
  const burnRef = useRef(burn);
  burnRef.current = burn;
  const [showLegend, setShowLegend] = useState(false);

  const fitView = () => {
    const cv = canvasRef.current, w = worldRef.current;
    if (!cv || !w) return;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const s of w.systems) {
      minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x);
      miny = Math.min(miny, s.y); maxy = Math.max(maxy, s.y);
    }
    const v = viewRef.current;
    v.scale = clamp(0.9 * Math.min(
      cv.clientWidth / Math.max(80, maxx - minx + 120),
      cv.clientHeight / Math.max(80, maxy - miny + 120)
    ), 0.35, 6);
    v.x = -(minx + maxx) / 2;
    v.y = -(miny + maxy) / 2;
    focusRef.current = null;
  };

  // camera api for the rest of the app: fly to a system
  useEffect(() => {
    if (!mapApi) return;
    mapApi.current = {
      focus(id) {
        const w = worldRef.current;
        if (!w || w.systems[id] === undefined) return;
        const s = w.systems[id];
        focusRef.current = { x: -s.x, y: -s.y, scale: Math.max(viewRef.current.scale, 1.4) };
      },
      fit: fitView,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapApi]);

  // draw loop
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = canvasRef.current, w = worldRef.current;
      if (cv && w) {
        const now = performance.now();
        const ctx = cv.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const bw = cv.clientWidth, bh = cv.clientHeight;
        if (cv.width !== bw * dpr || cv.height !== bh * dpr) {
          cv.width = bw * dpr; cv.height = bh * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#06090F";
        ctx.fillRect(0, 0, bw, bh);
        const v = viewRef.current;

        // camera easing toward a focus target
        const fc = focusRef.current;
        if (fc) {
          v.x += (fc.x - v.x) * 0.14;
          v.y += (fc.y - v.y) * 0.14;
          v.scale += (fc.scale - v.scale) * 0.14;
          if (Math.abs(fc.x - v.x) < 0.5 && Math.abs(fc.y - v.y) < 0.5 && Math.abs(fc.scale - v.scale) < 0.01)
            focusRef.current = null;
        }

        const tx = (x) => bw / 2 + (x + v.x) * v.scale;
        const ty = (y) => bh / 2 + (y + v.y) * v.scale;

        // new-world detection: reset pulses/event cursor, refit camera
        if (territoryRef.current.seed !== w.seed) {
          pulsesRef.current = [];
          lastSeqRef.current = w.eventSeq || 0;
          territoryRef.current.year = -1;
          fitView();
        }

        // collect fresh events into map pulses (skipped during burn-in)
        const seq = w.eventSeq || 0;
        if (burnRef.current) {
          lastSeqRef.current = seq;
        } else if (seq > lastSeqRef.current) {
          const fresh = [];
          for (let i = w.events.length - 1; i >= 0 && w.events[i].i > lastSeqRef.current; i--)
            fresh.push(w.events[i]);
          lastSeqRef.current = seq;
          for (const ev of fresh.slice(0, 24).reverse()) {
            if (ev.sysId === null || !PULSE_TYPES.has(ev.t)) continue;
            const s = w.systems[ev.sysId];
            pulsesRef.current.push({ x: s.x, y: s.y, color: (EV_STYLE[ev.t] || EV_STYLE.era).c, t0: now });
          }
          if (pulsesRef.current.length > 40)
            pulsesRef.current.splice(0, pulsesRef.current.length - 40);
        }

        // faint starfield
        ctx.fillStyle = "rgba(230,225,211,0.05)";
        const srng = mulberry32(w.seed);
        for (let i = 0; i < 90; i++)
          ctx.fillRect(srng() * bw, srng() * bh, 1, 1);

        // territory regions with crisp borders (realm overlay only)
        if (overlay === "realm") {
          // the raster is strategic-scale: fade it out as the camera closes in
          const terrAlpha = clamp(1.35 - v.scale * 0.35, 0, 1);
          if (terrAlpha > 0.02) {
            const cache = territoryRef.current;
            if (cache.year !== w.year || cache.seed !== w.seed) computeTerritory(w, cache);
            ctx.imageSmoothingEnabled = true;
            ctx.globalAlpha = terrAlpha;
            ctx.drawImage(
              cache.canvas,
              tx(-WORLD_R), ty(-WORLD_R),
              WORLD_R * 2 * v.scale, WORLD_R * 2 * v.scale
            );
            ctx.globalAlpha = 1;
          }
        }

        // gates
        const tradeEmph = overlay === "trade" ? 2.2 : 1;
        const dashDrift = (now * 0.02) % 14;
        for (const e of w.edges) {
          const A = w.systems[e.a], B = w.systems[e.b];
          const atWar = A.fid !== null && B.fid !== null && A.fid !== B.fid &&
            w.relations[relKey(A.fid, B.fid)]?.war;
          ctx.beginPath();
          ctx.moveTo(tx(A.x), ty(A.y)); ctx.lineTo(tx(B.x), ty(B.y));
          if (atWar) {
            ctx.strokeStyle = "rgba(228,87,46,0.55)";
            ctx.setLineDash([4, 4]); ctx.lineDashOffset = 0; ctx.lineWidth = 1;
          } else if (e.vol > 0.3) {
            // freight convoys: dashes drift along the lane in the net flow direction
            ctx.strokeStyle = `rgba(92,200,218,${clamp((0.12 + e.vol * 0.03) * tradeEmph, 0, 0.85)})`;
            ctx.setLineDash([5, 9]);
            ctx.lineDashOffset = (e.net >= 0 ? -1 : 1) * dashDrift;
            ctx.lineWidth = clamp((0.5 + e.vol * 0.06) * tradeEmph, 0.5, 3.5);
          } else {
            ctx.strokeStyle = "rgba(124,135,152,0.13)";
            ctx.setLineDash([]); ctx.lineWidth = 0.6;
          }
          ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        }

        // systems
        for (const s of w.systems) {
          const X = tx(s.x), Y = ty(s.y);
          if (s.ruined) {
            ctx.strokeStyle = "rgba(176,69,58,0.8)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(X, Y, 3.4, 0, 7); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(X - 2.2, Y - 2.2); ctx.lineTo(X + 2.2, Y + 2.2);
            ctx.moveTo(X + 2.2, Y - 2.2); ctx.lineTo(X - 2.2, Y + 2.2);
            ctx.stroke();
            continue;
          }
          if (s.pop <= 0.05) {
            ctx.fillStyle = "rgba(124,135,152,0.35)";
            ctx.beginPath(); ctx.arc(X, Y, 1.3, 0, 7); ctx.fill();
            continue;
          }
          const f = s.fid !== null ? w.factions[s.fid] : null;
          const r = clamp(2 + Math.sqrt(s.pop) * 0.85, 2, 9);
          if (overlay === "wealth") {
            const wpc = clamp(s.wealth / (s.pop * 3 + 1), 0, 1);
            ctx.fillStyle = mixHex("#2E3A52", "#F2A93B", wpc);
          } else if (overlay === "life") {
            ctx.fillStyle = wbColor(s.wb);
          } else if (overlay === "trade") {
            const th = clamp((s.tradeIn + s.tradeOut) / 40, 0, 1);
            ctx.fillStyle = mixHex("#3A4657", "#5CC8DA", th);
          } else if (overlay === "culture") {
            ctx.fillStyle = `rgb(${Math.round(90 + s.cult[0] * 165)},${Math.round(90 + s.cult[1] * 165)},${Math.round(90 + s.cult[2] * 165)})`;
          } else {
            ctx.fillStyle = f ? f.color : "#8892A6";
          }
          ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
          if (s.siege) {
            ctx.strokeStyle = "#E4572E"; ctx.lineWidth = 1.2;
            ctx.setLineDash([2.5, 2.5]);
            ctx.beginPath(); ctx.arc(X, Y, r + 3.5, 0, 7); ctx.stroke();
            ctx.setLineDash([]);
          } else if (s.wb < 0.5 && overlay === "realm") {
            ctx.strokeStyle = "#F2A93B"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(X, Y, r + 2.5, 0, 7); ctx.stroke();
          }
          if (f && f.capital === s.id && overlay === "realm") {
            ctx.strokeStyle = "#E6E1D3"; ctx.lineWidth = 1;
            ctx.strokeRect(X - r - 3, Y - r - 3, (r + 3) * 2, (r + 3) * 2);
          }
        }

        // event pulses: expanding rings where history just happened
        const alivePulses = [];
        for (const p of pulsesRef.current) {
          const age = (now - p.t0) / 1400;
          if (age >= 1) continue;
          alivePulses.push(p);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = 0.85 * (1 - age);
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.arc(tx(p.x), ty(p.y), 5 + age * 30, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        pulsesRef.current = alivePulses;

        // faction name labels over their territory (realm overlay only);
        // largest realms label first, colliding labels wait for a closer zoom
        if (overlay === "realm") {
          const cands = [];
          for (const f of w.factions) {
            if (f.dead) continue;
            const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
            if (!members.length) continue;
            const fp = members.reduce((a, s) => a + s.pop, 0);
            if (fp < 8) continue;
            let cx = 0, cy = 0;
            for (const s of members) { cx += s.x * s.pop; cy += s.y * s.pop; }
            cands.push({ f, fp, cx: cx / fp, cy: cy / fp });
          }
          cands.sort((a, b) => b.fp - a.fp);
          const placed = [];
          ctx.textAlign = "center";
          for (const { f, fp, cx, cy } of cands) {
            const size = clamp(9 + Math.sqrt(fp) * 0.35, 10, 22) * clamp(v.scale / 0.55, 0.8, 1.5);
            ctx.font = `700 ${size.toFixed(1)}px 'Chakra Petch', sans-serif`;
            try { ctx.letterSpacing = `${(size * 0.18).toFixed(1)}px`; } catch { /* older engines */ }
            const label = f.name.toUpperCase();
            const tw = ctx.measureText(label).width;
            const X = tx(cx), Y = ty(cy) - size * 0.8;
            const box = { x0: X - tw / 2 - 4, x1: X + tw / 2 + 4, y0: Y - size - 2, y1: Y + 4 };
            if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) {
              try { ctx.letterSpacing = "0px"; } catch { /* older engines */ }
              continue;
            }
            placed.push(box);
            ctx.lineWidth = Math.max(2.5, size * 0.22);
            ctx.strokeStyle = "rgba(6,9,15,0.75)";
            ctx.strokeText(label, X, Y);
            ctx.fillStyle = f.color + "E6";
            ctx.fillText(label, X, Y);
            try { ctx.letterSpacing = "0px"; } catch { /* older engines */ }
          }
          ctx.textAlign = "left";
        }

        // selection ring + system labels
        for (const s of w.systems) {
          const isSel = s.id === selected, isHov = s.id === hoverRef.current;
          if (!isSel && !isHov && !(v.scale > 1.3 && s.pop > 8)) continue;
          const X = tx(s.x), Y = ty(s.y);
          if (isSel) {
            ctx.strokeStyle = "#E6E1D3"; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(X, Y, 11, 0, 7); ctx.stroke();
          }
          ctx.font = "10px 'IBM Plex Mono', monospace";
          ctx.fillStyle = isSel || isHov ? "#E6E1D3" : "rgba(230,225,211,0.55)";
          ctx.fillText(s.name, X + 9, Y - 7);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, selected, overlay]);

  // input
  const screenToWorld = (mx, my) => {
    const cv = canvasRef.current, v = viewRef.current;
    return {
      x: (mx - cv.clientWidth / 2) / v.scale - v.x,
      y: (my - cv.clientHeight / 2) / v.scale - v.y,
    };
  };
  const nearest = (mx, my) => {
    const w = worldRef.current;
    if (!w) return null;
    const p = screenToWorld(mx, my);
    let best = null, bd = 16 / viewRef.current.scale;
    for (const s of w.systems) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  };
  const updateTooltip = (id, mx, my) => {
    const el = tooltipRef.current, w = worldRef.current, cv = canvasRef.current;
    if (!el) return;
    if (id === null || !w || dragRef.current?.moved) { el.style.display = "none"; return; }
    const s = w.systems[id];
    const f = s.fid !== null ? w.factions[s.fid] : null;
    let status;
    if (s.ruined) status = `<span style="color:#B0453A">ruins · fell ${s.diedYear}</span>`;
    else if (s.pop <= 0.05) status = `<span style="color:#7C8798">uncolonized</span>`;
    else if (f) status = `<span style="color:${f.color}">■ ${f.name}</span>${f.capital === s.id ? " · capital" : ""}`;
    else status = `<span style="color:#8892A6">independent</span>`;
    let body = "";
    if (s.pop > 0.05) {
      const wbC = s.wb < 0.5 ? "#E4572E" : s.wb < 0.65 ? "#F2A93B" : "#6FBF73";
      body = `<div style="color:#7C8798;margin-top:2px">pop <b style="color:#E6E1D3">${fmtPop(s.pop)}</b>
        · wellbeing <b style="color:${wbC}">${(s.wb * 100).toFixed(0)}%</b>
        ${s.siege ? '<span style="color:#E4572E"> · UNDER SIEGE</span>' : ""}</div>`;
    }
    el.innerHTML = `<div style="font-weight:600">${s.name}</div><div>${status}</div>${body}`;
    el.style.display = "block";
    const flipX = mx > cv.clientWidth - 240;
    const flipY = my > cv.clientHeight - 90;
    el.style.left = flipX ? "" : `${mx + 16}px`;
    el.style.right = flipX ? `${cv.clientWidth - mx + 8}px` : "";
    el.style.top = flipY ? "" : `${my + 12}px`;
    el.style.bottom = flipY ? `${cv.clientHeight - my + 8}px` : "";
  };
  const onPointerDown = (e) => {
    focusRef.current = null;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      sx: e.clientX - rect.left, sy: e.clientY - rect.top,
      vx: viewRef.current.x, vy: viewRef.current.y, moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    hoverRef.current = nearest(mx, my);
    const d = dragRef.current;
    if (d) {
      const dx = mx - d.sx, dy = my - d.sy;
      if (Math.hypot(dx, dy) > 5) d.moved = true;
      if (d.moved) {
        viewRef.current.x = d.vx + dx / viewRef.current.scale;
        viewRef.current.y = d.vy + dy / viewRef.current.scale;
      }
    }
    updateTooltip(hoverRef.current, mx, my);
  };
  const onPointerUp = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) {
      const id = nearest(e.clientX - rect.left, e.clientY - rect.top);
      onSelect(id);
    }
  };
  const onPointerLeave = () => {
    hoverRef.current = null;
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  };
  const onWheel = (e) => {
    const cv = canvasRef.current, v = viewRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const p = screenToWorld(mx, my);
    focusRef.current = null;
    v.scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0012), 0.35, 6);
    // keep the world point under the cursor fixed while zooming
    v.x = (mx - cv.clientWidth / 2) / v.scale - p.x;
    v.y = (my - cv.clientHeight / 2) / v.scale - p.y;
  };

  const LEGENDS = {
    realm: [
      ["#5CC8DA", "bright lanes = trade flow (dashes drift with cargo)"],
      ["#E4572E", "red dashed lane = war front · dashed ring = siege"],
      ["#F2A93B", "amber ring = population in misery"],
      ["#E6E1D3", "square = faction capital"],
      ["#B0453A", "✕ = dead system (ruins)"],
      ["#7C8798", "colored rings pulse where events just happened"],
    ],
    wealth: [["#2E3A52", "poor"], ["#F2A93B", "rich (wealth per capita)"]],
    life: [["#E4572E", "starving"], ["#F2A93B", "strained"], ["#6FBF73", "thriving"]],
    trade: [["#5CC8DA", "lane brightness = flow volume · dot = throughput"]],
    culture: [["#E6E1D3", "dot color = culture vector; trade blurs borders, isolation sharpens them"]],
  };

  return (
    <div className="relative flex-1 min-h-0" style={{ minHeight: "45vh" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none px-2 py-1.5 text-xs rounded"
        style={{
          display: "none", maxWidth: 220, zIndex: 10,
          background: "rgba(12,18,28,0.94)", color: "#E6E1D3",
          border: "1px solid rgba(230,225,211,0.18)", lineHeight: 1.5,
        }}
      />
      {burn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(6,9,15,0.85)", zIndex: 20 }}>
          <div style={{ fontFamily: "'Chakra Petch', sans-serif", letterSpacing: "0.2em" }} className="text-sm">
            SIMULATING HISTORY
          </div>
          <div className="w-48 h-1.5 rounded" style={{ background: "rgba(230,225,211,0.1)" }}>
            <div className="h-1.5 rounded" style={{ width: `${(burn.done / burn.total) * 100}%`, background: "#F2A93B" }} />
          </div>
          <div className="text-xs" style={{ color: "#7C8798" }}>year {burn.done} of {burn.total}</div>
        </div>
      )}
      <div className="absolute top-2 left-2 flex gap-1">
        {OVERLAYS.map((o) => (
          <button
            key={o}
            onClick={() => setOverlay(o)}
            className="px-2 py-0.5 text-xs rounded uppercase tracking-wider"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              background: overlay === o ? "#F2A93B" : "rgba(12,18,28,0.85)",
              color: overlay === o ? "#06090F" : "#7C8798",
              border: "1px solid rgba(230,225,211,0.15)",
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <button
        onClick={fitView}
        title="Fit galaxy in view"
        className="absolute top-2 right-2 px-2 py-0.5 text-xs rounded"
        style={{
          fontFamily: "'Chakra Petch', sans-serif",
          background: "rgba(12,18,28,0.85)", color: "#7C8798",
          border: "1px solid rgba(230,225,211,0.15)",
        }}
      >
        ⛶ fit
      </button>
      <div className="absolute bottom-2 left-2 flex items-end gap-1.5">
        <button
          onClick={() => setShowLegend((s) => !s)}
          className="px-2 py-1 text-xs rounded"
          style={{
            background: showLegend ? "#E6E1D3" : "rgba(12,18,28,0.85)",
            color: showLegend ? "#06090F" : "#7C8798",
            border: "1px solid rgba(230,225,211,0.15)",
          }}
        >
          ? legend
        </button>
        {showLegend ? (
          <div className="text-xs px-2.5 py-2 rounded space-y-1" style={{ background: "rgba(12,18,28,0.92)", color: "#7C8798", border: "1px solid rgba(230,225,211,0.12)", maxWidth: 340 }}>
            {(LEGENDS[overlay] || []).map(([c, t], i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <span style={{ color: c }}>●</span><span>{t}</span>
              </div>
            ))}
            <div style={{ color: "#5A6472" }}>drag pan · wheel zoom · click select · ⛶ resets view</div>
          </div>
        ) : (
          <div className="text-xs px-2 py-1 rounded" style={{ background: "rgba(12,18,28,0.8)", color: "#5A6472" }}>
            drag · wheel · click
          </div>
        )}
      </div>
    </div>
  );
}
