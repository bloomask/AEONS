import { useState } from "react";
import { GOODS } from "../../sim/constants.js";
import { fmtMoney } from "../format.js";
import { Spark } from "../widgets.jsx";

const Tile = ({ label, value, color = "#E6E1D3" }) => (
  <div className="px-2 py-1.5 rounded" style={{ background: "rgba(230,225,211,0.05)", border: "1px solid rgba(230,225,211,0.08)" }}>
    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, color }} className="text-base leading-tight">{value}</div>
    <div style={{ color: "#7C8798", fontSize: 10 }} className="uppercase tracking-wider">{label}</div>
  </div>
);

function HouseDetail({ w, h, onBack, onOpenSystem }) {
  const trace = h.trace || [];
  const inc = h.income || 0;
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs" style={{ color: "#5CC8DA" }}>← all commerce</button>
      <div>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, color: "#E8B04B" }} className="text-lg leading-tight">
          {h.corp ? "◆◆" : "◆"} {h.name}
        </div>
        <div style={{ color: "#7C8798" }}>
          {h.corp ? `megacorporation · incorporated ${h.corpYear}` : "merchant house"} · est. {h.foundedYear}
          {" · seat at "}
          <span className="cursor-pointer underline" onClick={() => onOpenSystem(h.home)}>
            {w.systems[h.home].name}
          </span>
        </div>
        {h.dead && (
          <div className="mt-1 px-2 py-1 rounded" style={{ background: "rgba(228,87,46,0.12)", color: "#E4572E", border: "1px solid rgba(228,87,46,0.35)" }}>
            BANKRUPT — hulls seized in {h.diedYear}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Tile label="fleet" value={`${h.ships.toFixed(0)} hulls`} />
        <Tile label="wealth" value={fmtMoney(h.wealth)} color={h.wealth < 0 ? "#E4572E" : "#E6E1D3"} />
        <Tile label="income / yr" value={fmtMoney(inc)} color={inc > 0 ? "#6FBF73" : "#7C8798"} />
      </div>
      {h.corp && (
        <div style={{ color: "#7C8798" }}>
          income: freight <b style={{ color: "#E6E1D3" }}>{fmtMoney(h.incFreight || 0)}</b>
          {" · "}depots <b style={{ color: "#E8B04B" }}>{fmtMoney(h.incDepots || 0)}</b>
          {" · "}colony charters <b style={{ color: "#6FBF73" }}>{fmtMoney(h.incColonies || 0)}</b>
        </div>
      )}
      {trace.length > 5 && (
        <div className="space-y-1">
          <div style={{ color: "#7C8798" }}>last {trace.length} years</div>
          <Spark data={trace.map((t) => t.w)} color="#E6E1D3" label="wealth" fmt={(v) => fmtMoney(v)} />
          <Spark data={trace.map((t) => t.s)} color="#5CC8DA" label="fleet" fmt={(v) => v.toFixed(0)} />
          <Spark data={trace.map((t) => t.inc)} color="#6FBF73" label="income" fmt={(v) => fmtMoney(v)} />
        </div>
      )}
      {h.corp && h.depots.length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">freight depots</div>
          {h.depots.map((sid) => {
            const s = w.systems[sid];
            return (
              <div key={sid} className="flex gap-2 mb-0.5">
                <span style={{ color: "#E8B04B" }}>▪</span>
                <span className="cursor-pointer" onClick={() => onOpenSystem(sid)}>{s.name}</span>
                <span className="ml-auto" style={{ color: "#7C8798" }}>
                  {s.pop > 0.05 ? `imports ${s.tradeIn.toFixed(1)}/yr` : "port dead"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {h.corp && h.sponsored.length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">chartered colonies</div>
          {h.sponsored.map((sp) => {
            const s = w.systems[sp.sys];
            return (
              <div key={sp.sys} className="flex gap-2 mb-0.5">
                <span style={{ color: "#6FBF73" }}>▪</span>
                <span className="cursor-pointer" onClick={() => onOpenSystem(sp.sys)}>{s.name}</span>
                <span className="ml-auto" style={{ color: "#7C8798" }}>charter runs {sp.until - w.year} more yrs</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TradePanel({ w, liveSystems, onOpenSystem }) {
  const [detailId, setDetailId] = useState(null);
  const detail = detailId !== null ? w.houses[detailId] : null;
  if (detail) {
    return <HouseDetail w={w} h={detail} onBack={() => setDetailId(null)} onOpenSystem={onOpenSystem} />;
  }

  const live = w.houses.filter((h) => !h.dead);
  const corps = live.filter((h) => h.corp).sort((a, b) => b.wealth - a.wealth);
  const houses = live.filter((h) => !h.corp).sort((a, b) => b.wealth - a.wealth);
  const dead = w.houses.filter((h) => h.dead);

  return (
    <div className="space-y-3">
      {corps.length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">megacorporations</div>
          {corps.map((h) => (
            <div
              key={h.id}
              className="p-2 rounded mb-1.5 cursor-pointer"
              style={{ background: "rgba(232,176,75,0.07)", border: "1px solid rgba(232,176,75,0.3)" }}
              onClick={() => setDetailId(h.id)}
              title="Open corporation details"
            >
              <div className="flex items-baseline gap-2">
                <span style={{ color: "#E8B04B" }}>◆◆</span>
                <b>{h.name}</b>
                <span className="ml-auto" style={{ color: "#7C8798" }}>of {w.systems[h.home].name}</span>
              </div>
              <div style={{ color: "#7C8798" }} className="mt-0.5">
                {h.ships.toFixed(0)} hulls · <span style={{ color: "#E6E1D3" }}>{fmtMoney(h.wealth)}</span>
                {" · "}<span style={{ color: (h.income || 0) > 0 ? "#6FBF73" : "#7C8798" }}>{(h.income || 0) >= 0 ? "+" : ""}{fmtMoney(h.income || 0)}/yr</span>
                {h.depots.length > 0 && <> · {h.depots.length} depot{h.depots.length > 1 ? "s" : ""}</>}
                {h.sponsored.length > 0 && <> · {h.sponsored.length} colony charter{h.sponsored.length > 1 ? "s" : ""}</>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">merchant houses</div>
        {houses.map((h) => (
          <div key={h.id} className="flex gap-2 mb-0.5 items-baseline cursor-pointer" onClick={() => setDetailId(h.id)} title="Open house details">
            <span style={{ color: "#E8B04B" }}>◆</span>
            <span>
              <b>{h.name}</b> <span style={{ color: "#7C8798" }}>of {w.systems[h.home].name}</span>
            </span>
            <span className="ml-auto" style={{ color: "#7C8798" }}>
              {h.ships.toFixed(0)} hulls · <span style={{ color: h.wealth < 0 ? "#E4572E" : "#E6E1D3" }}>{fmtMoney(h.wealth)}</span>
            </span>
          </div>
        ))}
        {houses.length === 0 && <div style={{ color: "#7C8798" }}>Every house flying today has incorporated.</div>}
        {dead.length > 0 && (
          <div style={{ color: "#7C8798" }} className="mt-1">
            {dead.length} ruined: {dead.map((h) => h.name).join(", ")}
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
                <span style={{ color: "#7C8798" }}>{e.net >= 0.2 ? "→" : e.net <= -0.2 ? "←" : "↔"}</span>
                <span className="cursor-pointer" onClick={() => onOpenSystem(B.id)}>{B.name}</span>
                {(A.mega.nexus || B.mega.nexus) && <span style={{ color: "#4FD0A5" }} title="Gate Nexus lane">◈</span>}
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
