import { mulberry32 } from "../../sim/rng.js";
import { clamp } from "../../sim/util.js";
import { relKey } from "../../sim/events.js";
import { classifySystem, classifyContext } from "../../sim/classify.js";
import { STAR_BY_KEY } from "../../sim/cosmos.js";
import { mixHex, wbColor } from "../theme.js";
import { computeTerritory, territoryClusters, WORLD_R } from "./territory.js";

// The whole map scene for one animation frame. Pure canvas drawing — no
// React, no DOM beyond the 2d context. `frame` carries everything the
// scene needs:
//   { bw, bh, now, overlay, selected, hover, territory, pulses, fxAnims }
// pulses/fxAnims are pruned in place (expired animations dropped).

const diamond = (ctx, X, Y, r) => {
  ctx.beginPath();
  ctx.moveTo(X, Y - r); ctx.lineTo(X + r, Y);
  ctx.lineTo(X, Y + r); ctx.lineTo(X - r, Y);
  ctx.closePath();
};

export function drawScene(ctx, w, v, frame) {
  const { bw, bh, now, overlay, selected, hover, hoverEdge, selectedEdge } = frame;
  const tx = (x) => bw / 2 + (x + v.x) * v.scale;
  const ty = (y) => bh / 2 + (y + v.y) * v.scale;

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
      const cache = frame.territory;
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
  for (let ei = 0; ei < w.edges.length; ei++) {
    const e = w.edges[ei];
    const A = w.systems[e.a], B = w.systems[e.b];
    const atWar = A.fid !== null && B.fid !== null && A.fid !== B.fid &&
      w.relations[relKey(A.fid, B.fid)]?.war;
    const ax = tx(A.x), ay = ty(A.y), bx = tx(B.x), by = ty(B.y);
    // a hovered or selected lane gets a bright halo underneath the lane line
    if (ei === selectedEdge || ei === hoverEdge) {
      ctx.strokeStyle = ei === selectedEdge ? "rgba(230,225,211,0.85)" : "rgba(230,225,211,0.4)";
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.lineWidth = ei === selectedEdge ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
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
    // endpoint rings mark the selected lane's two worlds
    if (ei === selectedEdge) {
      ctx.strokeStyle = "rgba(230,225,211,0.9)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ax, ay, 7, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.stroke();
    }
  }

  if (frame.selectionMode?.kind === "edge") {
    const valid = new Set(frame.selectionMode.validEdgeKeys);
    ctx.strokeStyle = "rgba(242,169,59,0.9)";
    ctx.lineWidth = 2.4;
    for (const e of w.edges) {
      if (!valid.has(`${e.a}|${e.b}`) && !valid.has(`${e.b}|${e.a}`)) continue;
      const A = w.systems[e.a], B = w.systems[e.b];
      ctx.beginPath(); ctx.moveTo(tx(A.x), ty(A.y)); ctx.lineTo(tx(B.x), ty(B.y)); ctx.stroke();
    }
  }

  // convoys: little ships riding the busy lanes
  if (overlay === "realm" || overlay === "trade") {
    for (let ei = 0; ei < w.edges.length; ei++) {
      const e = w.edges[ei];
      if (e.vol <= 0.5) continue;
      const A = w.systems[e.a], B = w.systems[e.b];
      if (A.pop <= 0.05 || B.pop <= 0.05 || A.siege || B.siege) continue;
      const n = clamp(Math.round(e.vol / 2) + 1, 1, 4);
      const cycle = 3500 + e.d * 9;
      const dxu = (B.x - A.x) / e.d, dyu = (B.y - A.y) / e.d;
      const fwd = e.net >= 0 ? 1 : -1;
      for (let k = 0; k < n; k++) {
        let t = ((now + ei * 911 + k * (cycle / n)) % cycle) / cycle;
        if (fwd < 0) t = 1 - t;
        const X = tx(A.x + (B.x - A.x) * t), Y = ty(A.y + (B.y - A.y) * t);
        ctx.strokeStyle = "rgba(196,236,246,0.9)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(X - dxu * fwd * 4, Y - dyu * fwd * 4);
        ctx.stroke();
      }
    }
  }

  // systems
  // the "worlds" overlay colors each world by its economic archetype; the
  // galaxy-relative thresholds are computed once per frame, not per system
  const archCtx = overlay === "worlds" ? classifyContext(w) : null;
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
      // the star map shows every sun, settled or not — an empty system is still
      // a star; other overlays leave the unclaimed worlds a faint gray
      if (overlay === "stars" && s.star) {
        ctx.fillStyle = (STAR_BY_KEY[s.star]?.color || "#8892A6") + "80";
        ctx.beginPath(); ctx.arc(X, Y, 1.6, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = "rgba(124,135,152,0.35)";
        ctx.beginPath(); ctx.arc(X, Y, 1.3, 0, 7); ctx.fill();
      }
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
    } else if (overlay === "worlds") {
      ctx.fillStyle = classifySystem(w, s, archCtx).tint;
    } else if (overlay === "stars") {
      ctx.fillStyle = STAR_BY_KEY[s.star]?.color || "#8892A6";
    } else if (overlay === "faith") {
      ctx.fillStyle = w.faiths[s.faith]?.color || "#8892A6";
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
    // wonders are landmarks: nexus = teal diamond, arcology = halo
    if (overlay === "realm" || overlay === "trade") {
      if (s.mega.nexus) {
        ctx.strokeStyle = "#4FD0A5"; ctx.lineWidth = 1.3;
        diamond(ctx, X, Y, r + 5); ctx.stroke();
      }
      if (s.mega.arcology) {
        ctx.strokeStyle = "rgba(230,225,211,0.75)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X, Y, r + 4.5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(X, Y, r + 6.5, 0, 7); ctx.stroke();
      }
    }
  }


  if (frame.selectionMode?.kind === "system") {
    ctx.strokeStyle = "rgba(242,169,59,0.95)";
    ctx.lineWidth = 1.5;
    for (const id of frame.selectionMode.validSystemIds) {
      const s = w.systems[id];
      if (!s) continue;
      const pulse = 10 + Math.sin(now * 0.005 + id) * 1.5;
      ctx.beginPath(); ctx.arc(tx(s.x), ty(s.y), pulse, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // megaproject construction sites: pulsing scaffold + progress arc
  if (overlay === "realm" || overlay === "trade") {
    for (const p of w.projects) {
      if (p.done || p.abandoned) continue;
      const s = w.systems[p.sysId];
      const X = tx(s.x), Y = ty(s.y);
      const pul = 0.5 + 0.5 * Math.sin(now * 0.004);
      ctx.strokeStyle = `rgba(79,208,165,${(0.35 + 0.45 * pul).toFixed(2)})`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      diamond(ctx, X, Y, 9); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#4FD0A5"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(X, Y, 11, -Math.PI / 2, -Math.PI / 2 + (p.progress / p.cost) * Math.PI * 2);
      ctx.stroke();
    }
    // corp headquarters (gold diamond) and depots (gold tick)
    for (const h of w.houses) {
      if (h.dead || !h.corp) continue;
      const hq = w.systems[h.home];
      ctx.strokeStyle = "#E8B04B"; ctx.lineWidth = 1.2;
      diamond(ctx, tx(hq.x), ty(hq.y), 8); ctx.stroke();
      if (overlay === "trade") {
        ctx.fillStyle = "#E8B04B";
        for (const sid of h.depots) {
          const s = w.systems[sid];
          ctx.fillRect(tx(s.x) + 4, ty(s.y) - 7, 3, 3);
        }
      }
    }
  }

  // event pulses: expanding rings where history just happened
  const alivePulses = [];
  for (const p of frame.pulses) {
    const age = (now - p.t0) / 1400;
    if (age >= 1) continue;
    alivePulses.push(p);
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.85 * (1 - age);
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(tx(p.x), ty(p.y), 5 + age * 30, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  frame.pulses.length = 0;
  frame.pulses.push(...alivePulses);

  // battle shockwaves and siege rings
  const aliveFx = [];
  for (const a of frame.fxAnims) {
    const age = (now - a.t0) / 1600;
    if (age >= 1) continue;
    aliveFx.push(a);
    const X = tx(a.x), Y = ty(a.y);
    if (a.kind === "battle") {
      ctx.globalAlpha = Math.max(0, 0.95 - age * 2.2);
      ctx.fillStyle = "#FFF3DE";
      ctx.beginPath(); ctx.arc(X, Y, 3.5, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.9 * (1 - age);
      ctx.strokeStyle = "#E4572E"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X, Y, 4 + age * 28, 0, 7); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X, Y, 2 + age * 15, 0, 7); ctx.stroke();
    } else {
      // siege: a dashed noose closing around the world
      ctx.globalAlpha = 0.85 * (1 - age);
      ctx.strokeStyle = "#F2A93B"; ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(X, Y, 26 - age * 16, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;
  frame.fxAnims.length = 0;
  frame.fxAnims.push(...aliveFx);

  // faction name labels over their territory (realm overlay only);
  // largest realms label first, colliding labels wait for a closer zoom
  if (overlay === "realm") {
    const cands = [];
    for (const f of w.factions) {
      if (f.dead) continue;
      const clusters = territoryClusters(w, f.id);
      const totalPop = clusters.reduce((sum, c) => sum + c.pop, 0);
      if (totalPop < 8) continue;
      for (const cluster of clusters) cands.push({ f, fp: cluster.pop, totalPop, cx: cluster.cx, cy: cluster.cy });
    }
    cands.sort((a, b) => b.fp - a.fp);
    const placed = [];
    ctx.textAlign = "center";
    for (const { f, fp, totalPop, cx, cy } of cands) {
      const size = clamp(8 + Math.sqrt(Math.max(fp, totalPop * 0.2)) * 0.2, 9, 13.5) * clamp(v.scale / 0.55, 0.75, 1.15);
      ctx.font = `700 ${size.toFixed(1)}px 'Chakra Petch', sans-serif`;
      try { ctx.letterSpacing = `${(size * 0.14).toFixed(1)}px`; } catch { /* older engines */ }
      const label = f.name.toUpperCase();
      const tw = ctx.measureText(label).width;
      const X = tx(cx), Y = ty(cy) - size * 0.8;
      const box = { fid: f.id, x0: X - tw / 2 - 4, x1: X + tw / 2 + 4, y0: Y - size - 2, y1: Y + 4 };
      if (placed.some((b) => b.fid !== f.id && box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) {
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
    const isSel = s.id === selected, isHov = s.id === hover;
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
