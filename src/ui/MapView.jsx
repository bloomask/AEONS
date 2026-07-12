import { useEffect, useRef, useState } from "react";
import { clamp } from "../sim/util.js";
import { OVERLAYS } from "./theme.js";
import { drawScene } from "./map/render.js";
import { collectPulses, collectFx } from "./map/effects.js";
import { legendEntries } from "./map/legends.js";
import { tooltipHtml } from "./map/tooltip.js";

// The canvas map: owns the camera and input; the actual drawing lives in
// map/render.js, territory rasterization in map/territory.js, and the
// event→animation plumbing in map/effects.js.
export default function MapView({ worldRef, selected, onSelect, overlay, setOverlay, burn, mapApi }) {
  const canvasRef = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.55 });
  const dragRef = useRef(null);
  const hoverRef = useRef(null);
  const tooltipRef = useRef(null);
  const territoryRef = useRef({ year: -1, seed: null });
  // transient animation state fed by the sim's event/fx queues
  const sceneRef = useRef({ pulses: [], fxAnims: [], lastSeq: 0, fxSeq: 0 });
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
          territory: territoryRef.current,
          pulses: scene.pulses,
          fxAnims: scene.fxAnims,
        });
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
    el.innerHTML = tooltipHtml(w, w.systems[id]);
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
