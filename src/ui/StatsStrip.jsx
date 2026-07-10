import { T } from "../sim/constants.js";

export default function StatsStrip({ w, liveSystems, totalPop, liveFactions, wars }) {
  return (
    <div className="flex gap-4 px-3 py-1 text-xs flex-wrap" style={{ color: "#7C8798", background: "#0C121C", borderBottom: "1px solid rgba(230,225,211,0.08)" }}>
      <span>systems <b style={{ color: "#E6E1D3" }}>{liveSystems.length}</b>/{T.N_SYSTEMS}</span>
      <span>ruins <b style={{ color: "#B0453A" }}>{w ? w.systems.filter((s) => s.ruined).length : 0}</b></span>
      <span>pop <b style={{ color: "#E6E1D3" }}>{totalPop.toFixed(0)}M</b></span>
      <span>powers <b style={{ color: "#E6E1D3" }}>{liveFactions.length}</b> ({w ? w.factions.length - liveFactions.length : 0} fallen)</span>
      <span>wars <b style={{ color: wars.length ? "#E4572E" : "#E6E1D3" }}>{wars.length}</b></span>
      <span className="ml-auto italic" style={{ color: "#F2A93B" }}>{w ? w.era.name : ""}</span>
    </div>
  );
}
