import { useState } from "react";
import { Spark, Section, Tile } from "../widgets.jsx";
import { fmtCredits } from "../format.js";

function HouseDetail({ w, h, onBack, onOpenSystem }) {
  const trace = h.trace || [];
  const inc = h.income || 0;
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs link" style={{ color: "var(--cyan)" }}>← all commerce</button>
      <div>
        <div className="display text-lg leading-tight" style={{ fontWeight: 700, color: "var(--gold)" }}>
          {h.corp ? "◆◆" : "◆"} {h.name}
        </div>
        <div className="muted">
          {h.corp ? `megacorporation · incorporated ${h.corpYear}` : "merchant house"} · est. {h.foundedYear}
          {" · seat at "}
          <span className="link" onClick={() => onOpenSystem(h.home)}>
            {w.systems[h.home].name}
          </span>
        </div>
        {h.dead && (
          <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: "rgba(228,87,46,0.12)", color: "var(--red)", border: "1px solid rgba(228,87,46,0.35)" }}>
            BANKRUPT — hulls seized in {h.diedYear}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="fleet" value={`${h.ships.toFixed(0)} hulls`} />
        <Tile label="wealth" value={fmtCredits(h.wealth)} color={h.wealth < 0 ? "var(--red)" : undefined} />
        <Tile label="income / yr" value={fmtCredits(inc)} color={inc > 0 ? "var(--green)" : "var(--muted)"} />
      </div>
      {h.corp && (
        <div className="muted">
          income: freight <b style={{ color: "var(--text)" }}>{fmtCredits(h.incFreight || 0)}</b>
          {" · "}depots <b style={{ color: "var(--gold)" }}>{fmtCredits(h.incDepots || 0)}</b>
          {" · "}colony charters <b style={{ color: "var(--green)" }}>{fmtCredits(h.incColonies || 0)}</b>
        </div>
      )}
      {trace.length > 5 && (
        <Section title={`last ${trace.length} years`}>
          <div className="space-y-1.5">
            <Spark data={trace.map((t) => t.w)} color="#E9E4D6" label="wealth" fmt={(v) => fmtCredits(v)} />
            <Spark data={trace.map((t) => t.s)} color="#5CC8DA" label="fleet" fmt={(v) => v.toFixed(0)} />
            <Spark data={trace.map((t) => t.inc)} color="#6FBF73" label="income" fmt={(v) => fmtCredits(v)} />
          </div>
        </Section>
      )}
      {h.corp && h.depots.length > 0 && (
        <Section title="freight depots">
          {h.depots.map((sid) => {
            const s = w.systems[sid];
            return (
              <div key={sid} className="flex gap-2 mb-1">
                <span style={{ color: "var(--gold)" }}>▪</span>
                <span className="link" onClick={() => onOpenSystem(sid)}>{s.name}</span>
                <span className="ml-auto muted">
                  {s.pop > 0.05 ? `imports ${s.tradeIn.toFixed(1)}/yr` : "port dead"}
                </span>
              </div>
            );
          })}
        </Section>
      )}
      {h.corp && h.sponsored.length > 0 && (
        <Section title="chartered colonies">
          {h.sponsored.map((sp) => {
            const s = w.systems[sp.sys];
            return (
              <div key={sp.sys} className="flex gap-2 mb-1">
                <span style={{ color: "var(--green)" }}>▪</span>
                <span className="link" onClick={() => onOpenSystem(sp.sys)}>{s.name}</span>
                <span className="ml-auto muted">charter runs {sp.until - w.year} more yrs</span>
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );
}

export default function TradePanel({ w, onOpenSystem }) {
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
    <div className="space-y-6">
      {corps.length > 0 && (
        <Section title="megacorporations">
          {corps.map((h) => (
            <div
              key={h.id}
              className="p-3 rounded-lg mb-2 cursor-pointer"
              style={{ background: "rgba(232,176,75,0.06)", border: "1px solid rgba(232,176,75,0.28)" }}
              onClick={() => setDetailId(h.id)}
              title="Open corporation details"
            >
              <div className="flex items-baseline gap-2">
                <span style={{ color: "var(--gold)" }}>◆◆</span>
                <b>{h.name}</b>
                <span className="ml-auto muted">of {w.systems[h.home].name}</span>
              </div>
              <div className="muted mt-1">
                {h.ships.toFixed(0)} hulls · <span style={{ color: "var(--text)" }}>{fmtCredits(h.wealth)}</span>
                {" · "}<span style={{ color: (h.income || 0) > 0 ? "var(--green)" : "var(--muted)" }}>{(h.income || 0) >= 0 ? "+" : ""}{fmtCredits(h.income || 0)}/yr</span>
                {h.depots.length > 0 && <> · {h.depots.length} depot{h.depots.length > 1 ? "s" : ""}</>}
                {h.sponsored.length > 0 && <> · {h.sponsored.length} colony charter{h.sponsored.length > 1 ? "s" : ""}</>}
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title="merchant houses">
        {houses.map((h) => (
          <div key={h.id} className="rowbtn flex gap-2 items-baseline" onClick={() => setDetailId(h.id)} title="Open house details">
            <span style={{ color: "var(--gold)" }}>◆</span>
            <span>
              <b>{h.name}</b> <span className="faint">of {w.systems[h.home].name}</span>
            </span>
            <span className="ml-auto muted">
              {h.ships.toFixed(0)} hulls · <span style={{ color: h.wealth < 0 ? "var(--red)" : "var(--text)" }}>{fmtCredits(h.wealth)}</span>
            </span>
          </div>
        ))}
        {houses.length === 0 && <div className="muted italic">Every house flying today has incorporated.</div>}
        {dead.length > 0 && (
          <div className="faint mt-2">
            {dead.length} ruined: {dead.map((h) => h.name).join(", ")}
          </div>
        )}
      </Section>

      <Section title="busiest lanes">
        {[...w.edges]
          .filter((e) => e.vol > 0.3)
          .sort((a, b) => b.vol - a.vol)
          .slice(0, 12)
          .map((e, i) => {
            const A = w.systems[e.a], B = w.systems[e.b];
            return (
              <div key={i} className="flex gap-2 mb-1">
                <span style={{ color: "var(--cyan)", minWidth: 40, textAlign: "right" }}>{e.vol.toFixed(1)}</span>
                <span className="link" onClick={() => onOpenSystem(A.id)}>{A.name}</span>
                <span className="faint">{e.net >= 0.2 ? "→" : e.net <= -0.2 ? "←" : "↔"}</span>
                <span className="link" onClick={() => onOpenSystem(B.id)}>{B.name}</span>
                {(A.mega.nexus || B.mega.nexus) && <span style={{ color: "#4FD0A5" }} title="Gate Nexus lane">◈</span>}
              </div>
            );
          })}
        {w.edges.every((e) => e.vol <= 0.3) && (
          <div className="muted italic">The lanes are quiet. War, poverty, or self-sufficiency — check the overlays.</div>
        )}
      </Section>

      <div className="faint">
        Prices, exporters, and the credit itself live in the <b style={{ color: "var(--gold)" }}>market</b> tab.
      </div>
    </div>
  );
}
