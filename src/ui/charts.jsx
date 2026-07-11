import { useState } from "react";

// Small-multiple time-series chart for the Galaxy tab.
// Series colors are validated against the dark panel surface
// (OKLCH lightness band + CVD separation + contrast) — see CHART note
// in theme.js before changing them.
const W = 360, H = 82, PAD_T = 6, PAD_B = 14, PAD_R = 48;

function downsample(arr, n = 240) {
  if (arr.length <= n) return arr;
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

// series: [{key, color, label?}], rows: stats.series (already time-ordered)
export default function Chart({ title, rows, series, fmt, eras, domainMax, area = true }) {
  const [hover, setHover] = useState(null);
  const data = downsample(rows);
  if (data.length < 2) return null;

  const y0 = data[0].y, y1 = data[data.length - 1].y;
  const xOf = (yr) => ((yr - y0) / Math.max(1, y1 - y0)) * (W - PAD_R);
  const max = domainMax ?? Math.max(...series.flatMap((s) => data.map((r) => r[s.key])), 1e-9);
  const yOf = (v) => H - PAD_B - (v / max) * (H - PAD_T - PAD_B);

  const pathOf = (key) =>
    data.map((r, i) => `${i ? "L" : "M"}${xOf(r.y).toFixed(1)},${yOf(r[key]).toFixed(1)}`).join("");

  const last = data[data.length - 1];
  const hoverRow = hover !== null ? data[hover] : null;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const yr = y0 + (Math.max(0, Math.min(1, px / (W - PAD_R)))) * (y1 - y0);
    let best = 0, bd = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(data[i].y - yr);
      if (d < bd) { bd = d; best = i; }
    }
    setHover(best);
  };

  return (
    <div className="relative" style={{ width: W }}>
      <div className="flex items-baseline justify-between">
        <span className="uppercase" style={{ color: "var(--muted)", fontSize: 10, fontFamily: "var(--font-display)", letterSpacing: "0.14em" }}>{title}</span>
        <span style={{ color: series[0].color, fontWeight: 600 }}>
          {fmt(last[series[0].key])}
          {series.length > 1 && (
            <span style={{ color: series[1].color }}> · {fmt(last[series[1].key])}</span>
          )}
        </span>
      </div>
      <svg
        width={W} height={H} style={{ display: "block" }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
      >
        {(eras || []).map((band, i) =>
          i % 2 === 1 ? (
            <rect
              key={i}
              x={xOf(Math.max(band.since, y0))} y={0}
              width={Math.max(0, xOf(Math.min(band.until, y1)) - xOf(Math.max(band.since, y0)))}
              height={H - PAD_B + 4}
              fill="rgba(230,225,211,0.04)"
            />
          ) : null
        )}
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0} x2={W - PAD_R} y1={yOf(max * f)} y2={yOf(max * f)}
            stroke="rgba(230,225,211,0.07)" strokeWidth="1"
          />
        ))}
        {area && series.length === 1 && (
          <path
            d={`${pathOf(series[0].key)}L${xOf(y1).toFixed(1)},${H - PAD_B}L${xOf(y0).toFixed(1)},${H - PAD_B}Z`}
            fill={series[0].color} opacity="0.14"
          />
        )}
        {series.map((s) => (
          <path key={s.key} d={pathOf(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
        ))}
        {/* direct labels at line ends when there are multiple series */}
        {series.length > 1 && series.map((s) => (
          <text
            key={s.key}
            x={W - PAD_R + 3} y={yOf(last[s.key]) + 3}
            fill={s.color} fontSize="9" fontFamily="'IBM Plex Mono', monospace"
          >
            {s.label || s.key}
          </text>
        ))}
        <text x={0} y={PAD_T + 3} fill="#5A6472" fontSize="8" fontFamily="'IBM Plex Mono', monospace">{fmt(max)}</text>
        <text x={0} y={H - 2} fill="#5A6472" fontSize="8" fontFamily="'IBM Plex Mono', monospace">{y0}</text>
        <text x={W - PAD_R} y={H - 2} fill="#5A6472" fontSize="8" textAnchor="end" fontFamily="'IBM Plex Mono', monospace">{y1}</text>
        {hoverRow && (
          <g>
            <line x1={xOf(hoverRow.y)} x2={xOf(hoverRow.y)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(230,225,211,0.4)" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={xOf(hoverRow.y)} cy={yOf(hoverRow[s.key])} r="3" fill={s.color} stroke="#0C121C" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      {hoverRow && (
        <div
          className="absolute pointer-events-none px-1.5 py-0.5 rounded text-xs"
          style={{
            top: -2,
            left: Math.min(xOf(hoverRow.y) + 8, W - 120),
            background: "rgba(6,9,15,0.92)", color: "#E6E1D3",
            border: "1px solid rgba(230,225,211,0.15)", whiteSpace: "nowrap", zIndex: 5,
          }}
        >
          yr {hoverRow.y}: {series.map((s, i) => (
            <span key={s.key} style={{ color: s.color }}>{i > 0 && " · "}{fmt(hoverRow[s.key])}</span>
          ))}
        </div>
      )}
    </div>
  );
}
