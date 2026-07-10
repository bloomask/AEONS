import { useState } from "react";
import { Bar, Spark } from "../widgets.jsx";
import { relKey } from "../../sim/events.js";
import { fmtPop, fmtMoney } from "../format.js";

function WarCard({ w, k, rel }) {
  const [ia, ib] = k.split("|").map(Number);
  const A = w.factions[ia], B = w.factions[ib];
  const dur = w.year - rel.war.since;
  const rec = w.stats.wars[rel.war.rec];
  const sieges = w.systems.filter((s) => s.siege && s.siege.pair === k);
  // war score leans the bar toward whoever is winning
  const lean = Math.tanh(rel.war.score / 5);
  return (
    <div className="p-2 rounded mb-2" style={{ background: "rgba(228,87,46,0.08)", border: "1px solid rgba(228,87,46,0.3)" }}>
      <div className="flex items-baseline gap-1 flex-wrap">
        <b style={{ color: A.color }}>{A.name}</b>
        <span style={{ color: "#E4572E" }}>⚔</span>
        <b style={{ color: B.color }}>{B.name}</b>
        <span className="ml-auto" style={{ color: "#7C8798" }}>year {dur} of war</span>
      </div>
      <div className="flex h-1.5 rounded overflow-hidden my-1.5" style={{ background: "rgba(230,225,211,0.1)" }}>
        <div style={{ width: `${50 + lean * 50}%`, background: A.color, opacity: 0.85 }} />
        <div style={{ flex: 1, background: B.color, opacity: 0.85 }} />
      </div>
      <div style={{ color: "#7C8798" }}>
        {rec ? `${rec.battles} battles · ${rec.systemsCeded} systems taken` : ""}
        {sieges.length > 0 && (
          <span style={{ color: "#F2A93B" }}> · under siege: {sieges.map((s) => s.name).join(", ")}</span>
        )}
      </div>
    </div>
  );
}

function RelationMatrix({ w, factions }) {
  const top = factions.slice(0, 10);
  if (top.length < 2) return null;
  const cellStyle = (a, b) => {
    if (a.id === b.id) return { background: "rgba(230,225,211,0.04)" };
    const rel = w.relations[relKey(a.id, b.id)];
    if (!rel) return { background: "rgba(230,225,211,0.07)" };
    if (rel.war) return { background: "#E4572E" };
    if (rel.allied) return { background: "#5CC8DA" };
    if (rel.embargo) return { background: "#F2A93B" };
    return { background: `rgba(228,120,60,${(rel.rivalry / 100) * 0.55 + 0.04})` };
  };
  const cellTitle = (a, b) => {
    if (a.id === b.id) return a.name;
    const rel = w.relations[relKey(a.id, b.id)];
    if (!rel) return `${a.name} ↔ ${b.name}: no contact`;
    if (rel.war) return `${a.name} ↔ ${b.name}: AT WAR since ${rel.war.since}`;
    if (rel.allied) return `${a.name} ↔ ${b.name}: open-lanes accord`;
    if (rel.embargo) return `${a.name} ↔ ${b.name}: embargo · rivalry ${rel.rivalry.toFixed(0)}`;
    return `${a.name} ↔ ${b.name}: rivalry ${rel.rivalry.toFixed(0)}/100`;
  };
  return (
    <div>
      <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">standings</div>
      <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
        <tbody>
          <tr>
            <td />
            {top.map((f) => (
              <td key={f.id} title={f.name} style={{ color: f.color, fontSize: 10, textAlign: "center" }}>■</td>
            ))}
          </tr>
          {top.map((a) => (
            <tr key={a.id}>
              <td title={a.name} style={{ color: a.color, fontSize: 10 }}>■</td>
              {top.map((b) => (
                <td
                  key={b.id}
                  title={cellTitle(a, b)}
                  style={{ width: 14, height: 14, borderRadius: 2, ...cellStyle(a, b) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: "#7C8798", fontSize: 10 }} className="mt-1">
        <span style={{ color: "#E4572E" }}>■</span> war ·{" "}
        <span style={{ color: "#F2A93B" }}>■</span> embargo ·{" "}
        <span style={{ color: "#5CC8DA" }}>■</span> accord ·{" "}
        <span style={{ color: "rgba(228,120,60,0.7)" }}>■</span> rivalry (darker = calmer)
      </div>
    </div>
  );
}

function FactionDetail({ w, f, wars, onBack, onOpenSystem }) {
  const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
  const fp = members.reduce((a, s) => a + s.pop, 0);
  const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
  const trace = f.trace || [];
  const mentions = [...w.events].reverse().filter((ev) => ev.s.includes(f.name)).slice(0, 10);
  const Trait = ({ label, v, color }) => (
    <div className="flex items-center gap-2">
      <span className="w-24" style={{ color: "#7C8798" }}>{label}</span>
      <div className="flex-1"><Bar v={v} color={color} /></div>
    </div>
  );
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs" style={{ color: "#5CC8DA" }}>← all powers</button>
      <div>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, color: f.color }} className="text-lg leading-tight">
          ■ {f.name}
        </div>
        <div style={{ color: "#7C8798" }}>
          est. {f.foundedYear} · seat at{" "}
          <span className="cursor-pointer underline" onClick={() => onOpenSystem(f.capital)}>
            {w.systems[f.capital].name}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["subjects", fmtPop(fp)],
          ["systems", members.length],
          ["treasury", fmtMoney(f.treasury)],
        ].map(([l, v]) => (
          <div key={l} className="px-2 py-1.5 rounded" style={{ background: "rgba(230,225,211,0.05)" }}>
            <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700 }} className="text-base">{v}</div>
            <div style={{ color: "#7C8798", fontSize: 10 }} className="uppercase tracking-wider">{l}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Trait label="stability" v={f.stability} color={f.stability < 0.35 ? "#E4572E" : "#6FBF73"} />
        <Trait label="aggression" v={f.aggr} color="#E4572E" />
        <Trait label="expansionism" v={f.expans} color="#C05DD6" />
        <Trait label={`tariff ${(f.tariff * 100).toFixed(0)}%`} v={f.tariff / 0.25} color="#E8B04B" />
      </div>
      {trace.length > 5 && (
        <div className="space-y-1">
          <div style={{ color: "#7C8798" }}>last {trace.length} years</div>
          <Spark data={trace.map((t) => t.p)} color="#E6E1D3" label="subjects" fmt={(v) => fmtPop(v)} />
          <Spark data={trace.map((t) => t.s)} color="#C05DD6" label="systems" fmt={(v) => v.toFixed(0)} />
          <Spark data={trace.map((t) => t.t)} color="#E8B04B" label="treasury" fmt={(v) => v.toFixed(0)} />
        </div>
      )}
      {myWars.length > 0 && (
        <div style={{ color: "#E4572E" }}>
          at war with {myWars.map(({ k }) => {
            const other = k.split("|").map(Number).find((x) => x !== f.id);
            return w.factions[other].name;
          }).join(", ")}
        </div>
      )}
      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">worlds</div>
        <div className="flex flex-wrap gap-1">
          {[...members].sort((a, b) => b.pop - a.pop).map((s) => (
            <button
              key={s.id}
              onClick={() => onOpenSystem(s.id)}
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                background: "rgba(230,225,211,0.06)",
                border: `1px solid ${s.id === f.capital ? f.color : "rgba(230,225,211,0.12)"}`,
                color: "#E6E1D3",
              }}
              title={`${fmtPop(s.pop)}${s.id === f.capital ? " · capital" : ""}${s.siege ? " · UNDER SIEGE" : ""}`}
            >
              {s.id === f.capital ? "★ " : ""}{s.name}{s.siege ? " ⚠" : ""}
            </button>
          ))}
        </div>
      </div>
      {mentions.length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">in the chronicle</div>
          {mentions.map((ev, i) => (
            <div key={i} className="mb-1 flex gap-2">
              <span style={{ color: "#F2A93B", minWidth: 34 }}>{ev.y}</span>
              <span style={{ color: "#B8B3A6" }}>{ev.s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PowersPanel({ w, liveFactions, wars, onOpenSystem }) {
  const [detailFid, setDetailFid] = useState(null);
  const detail = detailFid !== null ? w.factions[detailFid] : null;

  if (detail && !detail.dead) {
    return (
      <FactionDetail
        w={w} f={detail} wars={wars}
        onBack={() => setDetailFid(null)}
        onOpenSystem={onOpenSystem}
      />
    );
  }

  const ranked = liveFactions
    .map((f) => ({ f, members: w.systems.filter((s) => s.fid === f.id && s.pop > 0.05) }))
    .sort((a, b) => b.members.reduce((x, s) => x + s.pop, 0) - a.members.reduce((x, s) => x + s.pop, 0));

  return (
    <div className="space-y-3">
      {wars.length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">active wars</div>
          {wars.map(({ k, r }) => <WarCard key={k} w={w} k={k} rel={r} />)}
        </div>
      )}

      <RelationMatrix w={w} factions={ranked.map((r) => r.f)} />

      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">powers</div>
        {ranked.map(({ f, members }) => {
          const fp = members.reduce((a, s) => a + s.pop, 0);
          const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
          return (
            <div
              key={f.id}
              className="pb-2 mb-2 cursor-pointer"
              style={{ borderBottom: "1px solid rgba(230,225,211,0.08)" }}
              onClick={() => setDetailFid(f.id)}
              title="Open faction details"
            >
              <div className="flex items-center gap-2">
                <span style={{ color: f.color }}>■</span>
                <b>{f.name}</b>
                {myWars.length > 0 && <span style={{ color: "#E4572E" }}>⚔</span>}
                <span className="ml-auto" style={{ color: "#7C8798" }}>est. {f.foundedYear}</span>
              </div>
              <div style={{ color: "#7C8798" }}>
                {members.length} systems · {fmtPop(fp)} · treasury {fmtMoney(f.treasury)} · capital {w.systems[f.capital].name}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span style={{ color: "#7C8798" }}>stability</span>
                <div className="flex-1"><Bar v={f.stability} color={f.stability < 0.35 ? "#E4572E" : "#6FBF73"} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {w.factions.filter((f) => f.dead).length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">fallen powers</div>
          {w.factions.filter((f) => f.dead).map((f) => (
            <div key={f.id} style={{ color: "#7C8798" }}>
              <span style={{ color: f.color, opacity: 0.5 }}>■</span> {f.name} ({f.foundedYear}–{f.diedYear})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
