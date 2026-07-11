import { clamp } from "../sim/util.js";

// The shared UI kit. Every panel builds from these + the classes in
// index.css so the whole app speaks one surface language.
// (Defined at module scope: stable component identity across re-renders —
// defining these inside a component recreates the type every render, which
// remounts the DOM nodes and eats clicks at high sim speeds.)

export const Btn = ({ active, onClick, children, title }) => (
  <button title={title} onClick={onClick} className={`btn${active ? " on" : ""}`}>
    {children}
  </button>
);

// section with the standard tick · title · hairline header
export const Section = ({ title, right, children }) => (
  <div>
    <div className="sec-head">
      <span>{title}</span>
      <span className="sec-rule" />
      {right && <span style={{ letterSpacing: 0, textTransform: "none" }}>{right}</span>}
    </div>
    {children}
  </div>
);

// stat tile: value over label, optional sub-line and accent color
export const Tile = ({ label, value, sub, color }) => (
  <div className="tile">
    <div className="tile-v" style={color ? { color } : undefined}>{value}</div>
    <div className="tile-l">{label}</div>
    {sub && <div className="tile-s">{sub}</div>}
  </div>
);

export const Bar = ({ v, color }) => (
  <div className="h-1.5 rounded-full" style={{ background: "rgba(233,228,214,0.09)" }}>
    <div
      className="h-1.5 rounded-full"
      style={{ width: `${clamp(v, 0, 1) * 100}%`, background: color, transition: "width 0.3s" }}
    />
  </div>
);

export const Spark = ({ data, color, label, fmt }) => {
  if (!data || data.length < 2) return null;
  const W = 150, H = 28;
  const mn = Math.min(...data), mx = Math.max(...data);
  const span = mx - mn || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - 2 - ((v - mn) / span) * (H - 4)}`
  ).join(" ");
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 faint">{label}</span>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.3" opacity="0.9" />
      </svg>
      <span style={{ color }}>{fmt(data[data.length - 1])}</span>
    </div>
  );
};
