import { Btn } from "./widgets.jsx";

export default function TopBar({ seed, year, speed, setSpeed, onCentury, onExportJson, onExportCsv, onNewGalaxy }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 flex-wrap"
      style={{ borderBottom: "1px solid rgba(230,225,211,0.12)", background: "#0C121C" }}
    >
      <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, letterSpacing: "0.15em" }} className="text-base">
        AEONS
      </div>
      <div className="text-xs" style={{ color: "#7C8798" }}>seed {seed}</div>
      <div className="flex-1" />
      <div className="text-sm" style={{ color: "#F2A93B", fontWeight: 600 }}>
        YEAR {year}
      </div>
      <div className="flex gap-1">
        <Btn active={speed === 0} onClick={() => setSpeed(0)} title="Pause">⏸</Btn>
        <Btn active={speed === 1} onClick={() => setSpeed(1)} title="1 yr/s">▶</Btn>
        <Btn active={speed === 5} onClick={() => setSpeed(5)} title="5 yr/s">▶▶</Btn>
        <Btn active={speed === 20} onClick={() => setSpeed(20)} title="20 yr/s">▶▶▶</Btn>
        <Btn onClick={onCentury} title="Fast-forward a century">+100y</Btn>
        <Btn onClick={onExportJson} title="Download full statistics (summary + deaths + wars + yearly series) as JSON">⬇ stats</Btn>
        <Btn onClick={onExportCsv} title="Download yearly time series as CSV">⬇ csv</Btn>
        <Btn onClick={onNewGalaxy} title="New galaxy">↻ new</Btn>
      </div>
    </div>
  );
}
