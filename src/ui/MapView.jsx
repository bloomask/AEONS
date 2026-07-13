import { useEffect, useRef, useState } from "react";
import { clamp } from "../sim/util.js";
import { OVERLAYS } from "./theme.js";
import { drawScene } from "./map/render.js";
import { collectPulses, collectFx } from "./map/effects.js";
import { legendEntries } from "./map/legends.js";
import { tooltipHtml, routeTooltipHtml } from "./map/tooltip.js";

// The canvas map: owns the camera and input; the actual drawing lives in
// map/render.js, territory rasterization in map/territory.js, and the
// event→animation plumbing in map/effects.js.
export default function MapView({ worldRef, selected, onSelect, selectedEdge, onSelectRoute, overlay, setOverlay, burn, mapApi, targeting }) {
  const canvasRef = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.55 });
  const dragRef = useRef(null);
  const hoverRef = useRef(null);
  const hoverEdgeRef = useRef(null);
  const tooltipRef = useRef(null);
  const territoryRef = useRef({ year: -1, seed: null });
  // transient animation state fed by the sim's event/fx queues
  const sceneRef = useRef({ pulses: [], fxAnims: [], lastSeq: 0, fxSeq: 0 });
  const focusRef = useRef(null);
  const burnRef = useRef(burn);
  burnRef.current = burn;
  // the curator's live targeting request, read inside the RAF draw loop
  const targetingRef = useRef(targeting);
  targetingRef.current = targeting;
  const [showLegend, setShowLegend] = useState(false);

  // canonical "a|b" key for an edge index, matching the curator's lane keys
  const edgeKey = (ei) => {
    const e = worldRef.current?.edges[ei];
    if (!e) return null;
    return e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
  };
  // whether the element under the cursor is a valid curator target right now
  const isValidTarget = (id, ei) => {
    const t = targetingRef.current;
    if (!t) return false;
    return t.kind === "edge"
      ? ei !== null && t.valid.has(edgeKey(ei))
      : id !== null && (t.valid.has(id) || t.picked.has(id));
  };

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

        // new-world detection: reset pulses/event cursor, refit camera
        const scene = sceneRef.current;
        if (territoryRef.current.seed !== w.seed) {
          scene.pulses = [];
          scene.fxAnims = [];
          scene.lastSeq = w.eventSeq || 0;
          scene.fxSeq = w.fxSeq || 0;
          territoryRef.current.year = -1;
          fitView();
        }

        collectPulses(w, scene, now, burnRef.current);
        collectFx(w, scene, now, burnRef.current);

        drawScene(ctx, w, v, {
          bw, bh, now, overlay, selected,
          hover: hoverRef.current,
          hoverEdge: hoverEdgeRef.current,
          selectedEdge,
          territory: territoryRef.current,
          pulses: scene.pulses,
          fxAnims: scene.fxAnims,
          targeting: targetingRef.current,
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [worldRef, selected, selectedEdge, overlay]);

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
  // nearest jumpgate lane to the cursor, in SCREEN pixels (zoom-independent).
  // Systems win ties — this is only consulted when no system is under the cursor.
  const nearestEdge = (mx, my) => {
    const w = worldRef.current, v = viewRef.current;
    if (!w) return null;
    const cv = canvasRef.current;
    const sx = (x) => cv.clientWidth / 2 + (x + v.x) * v.scale;
    const sy = (y) => cv.clientHeight / 2 + (y + v.y) * v.scale;
    let best = null, bd = 6; // px
    for (let i = 0; i < w.edges.length; i++) {
      const e = w.edges[i];
      const A = w.systems[e.a], B = w.systems[e.b];
      const ax = sx(A.x), ay = sy(A.y), bx = sx(B.x), by = sy(B.y);
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((mx - ax) * dx + (my - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(mx - (ax + t * dx), my - (ay + t * dy));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const updateTooltip = (id, edge, mx, my) => {
    const el = tooltipRef.current, w = worldRef.current, cv = canvasRef.current;
    if (!el) return;
    if (!w || dragRef.current?.moved || (id === null && edge === null)) { el.style.display = "none"; return; }
    el.innerHTML = id !== null ? tooltipHtml(w, w.systems[id]) : routeTooltipHtml(w, edge);
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
    const id = nearest(mx, my);
    hoverRef.current = id;
    // a lane is only a hover target when no system sits under the cursor
    hoverEdgeRef.current = id === null ? nearestEdge(mx, my) : null;
    const cv = canvasRef.current;
    if (cv) {
      // while aiming a curator act, only valid targets take the pointer cursor
      cv.style.cursor = targetingRef.current
        ? (isValidTarget(id, hoverEdgeRef.current) ? "pointer" : "crosshair")
        : ((id !== null || hoverEdgeRef.current !== null) ? "pointer" : "crosshair");
    }
    const d = dragRef.current;
    if (d) {
      const dx = mx - d.sx, dy = my - d.sy;
      if (Math.hypot(dx, dy) > 5) d.moved = true;
      if (d.moved) {
        viewRef.current.x = d.vx + dx / viewRef.current.scale;
        viewRef.current.y = d.vy + dy / viewRef.current.scale;
      }
    }
    updateTooltip(hoverRef.current, hoverEdgeRef.current, mx, my);
  };
  const onPointerUp = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) {
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const id = nearest(mx, my);
      const t = targetingRef.current;
      // in targeting mode the map is dedicated to aiming: a click on a valid
      // target fills the curator's field; anything else is ignored (the normal
      // inspector selection is suspended until the act is aimed or cancelled)
      if (t) {
        if (t.kind === "edge") {
          const ei = id === null ? nearestEdge(mx, my) : null;
          const k = ei !== null ? edgeKey(ei) : null;
          if (k !== null && t.valid.has(k)) {
            const ed = worldRef.current.edges[ei];
            t.pick(`${ed.a}|${ed.b}`);
          }
        } else if (id !== null && (t.valid.has(id) || t.picked.has(id))) {
          // `picked` is clickable too: it lets a faction pair's first party be
          // clicked again to reset it
          t.pick(id);
        }
        return;
      }
      if (id !== null) onSelect(id);
      else {
        const ei = nearestEdge(mx, my);
        if (ei !== null) onSelectRoute?.(ei);
        else onSelect(null);
      }
    }
  };
  const onPointerLeave = () => {
    hoverRef.current = null;
    hoverEdgeRef.current = null;
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

  const legend = legendEntries(worldRef.current, overlay);

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
        className="absolute pointer-events-none px-2.5 py-2 text-xs glass"
        style={{ display: "none", maxWidth: 230, zIndex: 10, color: "var(--text)", lineHeight: 1.55 }}
      />
      {burn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(4,7,12,0.88)", zIndex: 20 }}>
          <div className="display text-sm" style={{ letterSpacing: "0.25em", color: "var(--bright)" }}>
            SIMULATING HISTORY
          </div>
          <div className="w-56 h-1.5 rounded-full" style={{ background: "rgba(233,228,214,0.1)" }}>
            <div className="h-1.5 rounded-full" style={{ width: `${(burn.done / burn.total) * 100}%`, background: "var(--amber)" }} />
          </div>
          <div className="text-xs muted">year {burn.done} of {burn.total}</div>
        </div>
      )}
      <div className="absolute top-3 left-3 glass glass-seg">
        {OVERLAYS.map((o) => (
          <button key={o} className={overlay === o ? "on" : ""} onClick={() => setOverlay(o)}>
            {o}
          </button>
        ))}
      </div>
      {targeting && !burn && (
        <div
          className="absolute top-3 left-1/2 flex items-center gap-3 px-3 py-1.5 text-xs glass"
          style={{ transform: "translateX(-50%)", zIndex: 16, color: "var(--amber)", borderColor: "rgba(242,169,59,0.5)" }}
        >
          <span className="crt-blink">◎</span>
          <span>{targeting.hint}</span>
          <button onClick={targeting.onCancel} className="link" style={{ color: "var(--muted)", fontSize: 11 }}>✕ cancel</button>
        </div>
      )}
      <div className="absolute top-3 right-3 glass glass-seg">
        <button onClick={fitView} title="Fit galaxy in view">⛶ fit</button>
        <button className={showLegend ? "on" : ""} onClick={() => setShowLegend((s) => !s)} title="Toggle legend">
          ? key
        </button>
      </div>
      <div className="absolute bottom-3 left-3 flex items-end gap-1.5" style={{ zIndex: 15 }}>
        {showLegend ? (
          <div className="text-xs px-3 py-2.5 glass space-y-1" style={{ color: "var(--muted)", maxWidth: 350 }}>
            {legend.map(([c, t], i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span style={{ color: c }}>●</span><span>{t}</span>
              </div>
            ))}
            <div className="faint pt-0.5">drag pan · wheel zoom · click select · ⛶ resets view</div>
          </div>
        ) : (
          <div className="text-xs px-2.5 py-1.5 glass faint" style={{ border: "none" }}>
            drag · wheel · click
          </div>
        )}
      </div>
    </div>
  );
}
