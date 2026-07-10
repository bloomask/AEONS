import { useEffect, useRef } from "react";
import { mulberry32 } from "../sim/rng.js";
import { clamp } from "../sim/util.js";
import { relKey } from "../sim/events.js";
import { mixHex, wbColor, OVERLAYS } from "./theme.js";

// The galaxy map: canvas renderer, pan/zoom/selection input, overlay
// switcher, legend, and the burn-in progress screen.
export default function MapView({ worldRef, selected, onSelect, overlay, setOverlay, burn }) {
  const canvasRef = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.55 });
  const dragRef = useRef(null);
  const hoverRef = useRef(null);

  // draw loop
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = canvasRef.current, w = worldRef.current;
      if (cv && w) {
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
        const tx = (x) => bw / 2 + (x + v.x) * v.scale;
        const ty = (y) => bh / 2 + (y + v.y) * v.scale;

        // faint starfield
        ctx.fillStyle = "rgba(230,225,211,0.05)";
        const srng = mulberry32(w.seed);
        for (let i = 0; i < 90; i++)
          ctx.fillRect(srng() * bw, srng() * bh, 1, 1);

        // territory glow (realm overlay only)
        if (overlay === "realm") {
          for (const s of w.systems) {
            if (s.fid === null || s.pop <= 0.05) continue;
            const f = w.factions[s.fid];
            const r = (18 + Math.sqrt(s.pop) * 3) * v.scale;
            const g = ctx.createRadialGradient(tx(s.x), ty(s.y), 0, tx(s.x), ty(s.y), r);
            g.addColorStop(0, f.color + "26");
            g.addColorStop(1, f.color + "00");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(tx(s.x), ty(s.y), r, 0, 7); ctx.fill();
          }
        }

        // gates
        const tradeEmph = overlay === "trade" ? 2.2 : 1;
        for (const e of w.edges) {
          const A = w.systems[e.a], B = w.systems[e.b];
          const atWar = A.fid !== null && B.fid !== null && A.fid !== B.fid &&
            w.relations[relKey(A.fid, B.fid)]?.war;
          ctx.beginPath();
          ctx.moveTo(tx(A.x), ty(A.y)); ctx.lineTo(tx(B.x), ty(B.y));
          if (atWar) {
            ctx.strokeStyle = "rgba(228,87,46,0.55)";
            ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
          } else if (e.vol > 0.3) {
            ctx.strokeStyle = `rgba(92,200,218,${clamp((0.12 + e.vol * 0.03) * tradeEmph, 0, 0.85)})`;
            ctx.setLineDash([]); ctx.lineWidth = clamp((0.5 + e.vol * 0.06) * tradeEmph, 0.5, 3.5);
          } else {
            ctx.strokeStyle = "rgba(124,135,152,0.13)";
            ctx.setLineDash([]); ctx.lineWidth = 0.6;
          }
          ctx.stroke(); ctx.setLineDash([]);
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

        // selection ring + labels
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
  const onPointerDown = (e) => {
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
  const onWheel = (e) => {
    const v = viewRef.current;
    v.scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0012), 0.35, 6);
  };

  return (
    <div className="relative flex-1 min-h-0" style={{ minHeight: "45vh" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
      {burn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(6,9,15,0.85)" }}>
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
      <div className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded" style={{ background: "rgba(12,18,28,0.8)", color: "#7C8798" }}>
        {overlay === "realm" && <>drag pan · wheel zoom · tap a system | <span style={{ color: "#5CC8DA" }}>cyan</span> trade · <span style={{ color: "#E4572E" }}>red dash</span> war/siege · <span style={{ color: "#F2A93B" }}>amber ring</span> misery · <span style={{ color: "#B0453A" }}>✕</span> ruins</>}
        {overlay === "wealth" && <>dot color: <span style={{ color: "#2E3A52" }}>poor</span> → <span style={{ color: "#F2A93B" }}>rich</span> (wealth per capita)</>}
        {overlay === "life" && <>dot color: <span style={{ color: "#E4572E" }}>starving</span> → <span style={{ color: "#F2A93B" }}>strained</span> → <span style={{ color: "#6FBF73" }}>thriving</span></>}
        {overlay === "trade" && <>lane brightness = flow volume · dot color = throughput. Watch wars dim whole regions.</>}
        {overlay === "culture" && <>dot color = culture vector. Watch trade blur borders and isolation sharpen them.</>}
      </div>
    </div>
  );
}
