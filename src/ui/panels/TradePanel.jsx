import { GOODS } from "../../sim/constants.js";
import { fmtMoney } from "../format.js";

export default function TradePanel({ w, liveSystems, onOpenSystem }) {
  return (
    <div className="space-y-3">
      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">merchant houses</div>
        {[...w.houses].filter((h) => !h.dead).sort((a, b) => b.wealth - a.wealth).map((h) => (
          <div key={h.id} className="flex gap-2 mb-0.5 items-baseline">
            <span style={{ color: "#E8B04B" }}>◆</span>
            <span className="cursor-pointer" onClick={() => onOpenSystem(h.home)}>
              <b>{h.name}</b> <span style={{ color: "#7C8798" }}>of {w.systems[h.home].name}</span>
            </span>
            <span className="ml-auto" style={{ color: "#7C8798" }}>
              {h.ships.toFixed(0)} hulls · <span style={{ color: h.wealth < 0 ? "#E4572E" : "#E6E1D3" }}>{fmtMoney(h.wealth)}</span>
            </span>
          </div>
        ))}
        {w.houses.some((h) => h.dead) && (
          <div style={{ color: "#7C8798" }} className="mt-1">
            {w.houses.filter((h) => h.dead).length} house{w.houses.filter((h) => h.dead).length > 1 ? "s" : ""} ruined: {w.houses.filter((h) => h.dead).map((h) => h.name).join(", ")}
          </div>
        )}
      </div>
      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">busiest lanes</div>
        {[...w.edges]
          .filter((e) => e.vol > 0.3)
          .sort((a, b) => b.vol - a.vol)
          .slice(0, 12)
          .map((e, i) => {
            const A = w.systems[e.a], B = w.systems[e.b];
            return (
              <div key={i} className="flex gap-2 mb-0.5">
                <span style={{ color: "#5CC8DA", minWidth: 40, textAlign: "right" }}>{e.vol.toFixed(1)}</span>
                <span className="cursor-pointer" onClick={() => onOpenSystem(A.id)}>{A.name}</span>
                <span style={{ color: "#7C8798" }}>↔</span>
                <span className="cursor-pointer" onClick={() => onOpenSystem(B.id)}>{B.name}</span>
              </div>
            );
          })}
        {w.edges.every((e) => e.vol <= 0.3) && (
          <div style={{ color: "#7C8798" }}>The lanes are quiet. War, poverty, or self-sufficiency — check the overlays.</div>
        )}
      </div>
      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">great exporters</div>
        {GOODS.map((g) => {
          const top = liveSystems.filter((s) => s.flow[g] < -0.5).sort((a, b) => a.flow[g] - b.flow[g])[0];
          return (
            <div key={g} className="flex gap-2 mb-0.5">
              <span className="capitalize w-14">{g}</span>
              {top ? (
                <span className="cursor-pointer" onClick={() => onOpenSystem(top.id)}>
                  {top.name} <span style={{ color: "#6FBF73" }}>({(-top.flow[g]).toFixed(1)}/yr)</span>
                </span>
              ) : (
                <span style={{ color: "#7C8798" }}>no major exporter</span>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">galaxy prices (mean)</div>
        {(() => {
          const last = w.stats.series[w.stats.series.length - 1];
          if (!last) return null;
          return (
            <div className="flex gap-4">
              <span>food <b style={{ color: last.pFood > 2 ? "#E4572E" : "#E6E1D3" }}>{last.pFood}</b></span>
              <span>goods <b style={{ color: last.pGoods > 6 ? "#E4572E" : "#E6E1D3" }}>{last.pGoods}</b></span>
              <span>trade vol <b style={{ color: "#5CC8DA" }}>{last.trade}</b></span>
              <span>fleet <b style={{ color: "#E8B04B" }}>{last.fleet}</b></span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
