import { clamp } from "../sim/util.js";

// Defined at module scope: stable component identity across re-renders.
// (Defining these inside the main component recreates the type every render,
// which remounts the DOM nodes and eats clicks at high sim speeds.)
export const Btn = ({ active, onClick, children, title }) => (
  <button
    title={title}
    onClick={onClick}
    className="px-2 py-1 text-xs rounded"
    style={{
      fontFamily: "'IBM Plex Mono', monospace",
      background: active ? "#E6E1D3" : "rgba(230,225,211,0.08)",
      color: active ? "#06090F" : "#E6E1D3",
      border: "1px solid rgba(230,225,211,0.2)",
    }}
  >
    {children}
  </button>
);

export const Bar = ({ v, color }) => (
  <div className="h-1.5 rounded" style={{ background: "rgba(230,225,211,0.1)" }}>
    <div className="h-1.5 rounded" style={{ width: `${clamp(v, 0, 1) * 100}%`, background: color }} />
  </div>
);

export const Spark = ({ data, color, label, fmt }) => {
  if (!data || data.length < 2) return null;
  const W = 130, H = 26;
  const mn = Math.min(...data), mx = Math.max(...data);
  const span = mx - mn || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - 2 - ((v - mn) / span) * (H - 4)}`
  ).join(" ");
  return (
    <div className="flex items-center gap-2">
      <span className="w-14" style={{ color: "#7C8798" }}>{label}</span>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
      </svg>
      <span style={{ color }}>{fmt(data[data.length - 1])}</span>
    </div>
  );
};
