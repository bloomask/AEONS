import { useEffect, useRef } from "react";

// Timeline scrubber under the map: population arc, era bands, war marks.
// Click or drag to open the chronicle around that year.
const H = 56;
const POP_LINE = "#C68018";
const POP_FILL = "rgba(198,128,24,0.28)";
const WAR = "rgba(228,87,46,0.85)";

export default function Timeline({ w, onScrub, focusYear }) {
  const canvasRef = useRef(null);
  const hoverRef = useRef(null);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv || !w) return;
    const series = w.stats.series;
    const dpr = window.devicePixelRatio || 1;
    const bw = cv.clientWidth, bh = H;
    if (cv.width !== bw * dpr || cv.height !== bh * dpr) {
      cv.width = bw * dpr; cv.height = bh * dpr;
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#070B12";
    ctx.fillRect(0, 0, bw, bh);
    if (series.length < 2) return;

    const y0 = series[0].y, y1 = series[series.length - 1].y;
    const xOf = (yr) => ((yr - y0) / Math.max(1, y1 - y0)) * bw;
    const atX = (px) => series[Math.min(series.length - 1, Math.max(0, Math.round((px / bw) * (series.length - 1))))];

    // era bands, alternating, with names where they fit
    const eras = w.eras || [];
    for (let i = 0; i < eras.length; i++) {
      const x = xOf(eras[i].since);
      const xe = i + 1 < eras.length ? xOf(eras[i + 1].since) : bw;
      if (i % 2 === 1) {
        ctx.fillStyle = "rgba(230,225,211,0.045)";
        ctx.fillRect(x, 0, xe - x, bh);
      }
      if (xe - x > 70) {
        ctx.font = "600 8px 'Chakra Petch', sans-serif";
        ctx.fillStyle = "rgba(230,225,211,0.4)";
        ctx.save();
        ctx.beginPath(); ctx.rect(x + 2, 0, xe - x - 4, bh); ctx.clip();
        ctx.fillText(eras[i].name.toUpperCase(), x + 5, 10);
        ctx.restore();
      }
    }

    // population area (one pixel column per sample)
    const maxPop = Math.max(...series.map((r) => r.pop), 1);
    ctx.beginPath();
    ctx.moveTo(0, bh - 6);
    for (let px = 0; px <= bw; px++) {
      const r = atX(px);
      ctx.lineTo(px, bh - 6 - (r.pop / maxPop) * (bh - 22));
    }
    ctx.lineTo(bw, bh - 6);
    ctx.closePath();
    ctx.fillStyle = POP_FILL;
    ctx.fill();
    ctx.beginPath();
    for (let px = 0; px <= bw; px++) {
      const r = atX(px);
      const y = bh - 6 - (r.pop / maxPop) * (bh - 22);
      px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.strokeStyle = POP_LINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // war strip along the bottom
    for (let px = 0; px < bw; px++) {
      const r = atX(px);
      if (r.wars > 0) {
        ctx.fillStyle = WAR;
        ctx.globalAlpha = Math.min(0.35 + r.wars * 0.25, 1);
        ctx.fillRect(px, bh - 4, 1, 4);
      }
    }
    ctx.globalAlpha = 1;

    // focus marker
    if (focusYear !== null) {
      const x = xOf(focusYear);
      ctx.strokeStyle = "#E6E1D3";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, bh); ctx.stroke();
      ctx.setLineDash([]);
    }

    // hover crosshair + year/pop readout
    const hx = hoverRef.current;
    if (hx !== null) {
      const r = atX(hx);
      ctx.strokeStyle = "rgba(230,225,211,0.5)";
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, bh); ctx.stroke();
      ctx.font = "9px 'IBM Plex Mono', monospace";
      const label = `yr ${r.y} · pop ${r.pop >= 1000 ? (r.pop / 1000).toFixed(1) + "B" : r.pop.toFixed(0) + "M"}${r.wars ? ` · ${r.wars} war${r.wars > 1 ? "s" : ""}` : ""}`;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(hx + 6, bw - tw - 8);
      ctx.fillStyle = "rgba(6,9,15,0.85)";
      ctx.fillRect(lx - 3, 12, tw + 6, 12);
      ctx.fillStyle = "#E6E1D3";
      ctx.fillText(label, lx, 21);
    }
  };

  // redraw on every render — the app re-renders on each sim tick
  useEffect(() => { draw(); });

  const yearAt = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const series = w.stats.series;
    if (!series.length) return null;
    const y0 = series[0].y, y1 = series[series.length - 1].y;
    return Math.round(y0 + frac * (y1 - y0));
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full block cursor-crosshair"
      style={{ height: H, borderTop: "1px solid var(--line)" }}
      title="Galactic history — click to open the chronicle at that year"
      onPointerDown={(e) => { const y = yearAt(e); if (y !== null) onScrub(y); }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        hoverRef.current = e.clientX - rect.left;
        if (e.buttons === 1) { const y = yearAt(e); if (y !== null) onScrub(y); }
        draw();
      }}
      onPointerLeave={() => { hoverRef.current = null; draw(); }}
    />
  );
}
