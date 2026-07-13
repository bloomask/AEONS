import { useState } from "react";
import { GOVS } from "../../sim/constants.js";
import { Bar, Spark, Section, Tile } from "../widgets.jsx";
import { relKey } from "../../sim/events.js";
import { fmtPop, fmtCredits } from "../format.js";

const GOV_DESC = {
  empire: "heavy taxes and tariffs · expands by subjugation · war unites it, hunger barely moves it",
  republic: "light tariffs · signs accords readily · absorbs only cultural kin · long wars sour the assembly",
  corporate: "lives on trade throughput, not taxes · buys charters from free ports · war is bad for business",
  pirate: "lives on loot skimmed from nearby lanes · no treaties, no wars — only raids and reprisals",
};

const GovBadge = ({ gov }) => {
  const g = GOVS[gov];
  if (!g) return null;
  return (
    <span
      className="px-1.5 py-0.5 rounded uppercase display"
      style={{ color: g.badge, border: `1px solid ${g.badge}55`, fontSize: 8, letterSpacing: "0.1em" }}
    >
      {g.label}
    </span>
  );
};

function WarCard({ w, k, rel }) {
  const [ia, ib] = k.split("|").map(Number);
  const A = w.factions[ia], B = w.factions[ib];
  const dur = w.year - rel.war.since;
  const rec = w.stats.wars[rel.war.rec];
  const sieges = w.systems.filter((s) => s.siege && s.siege.pair === k);
  // war score leans the bar toward whoever is winning
  const lean = Math.tanh(rel.war.score / 5);
  return (
    <div className="p-3 rounded-lg mb-2" style={{ background: "rgba(228,87,46,0.07)", border: "1px solid rgba(228,87,46,0.3)" }}>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <b style={{ color: A.color }}>{A.name}</b>
        <span style={{ color: "var(--red)" }}>⚔</span>
        <b style={{ color: B.color }}>{B.name}</b>
        <span className="ml-auto muted">year {dur} of war</span>
      </div>
      {rec?.causeText && <div className="faint" style={{ fontSize: 11 }}>casus belli — {rec.causeText}</div>}
      <div className="flex h-1.5 rounded-full overflow-hidden my-2" style={{ background: "rgba(233,228,214,0.1)" }}>
        <div style={{ width: `${50 + lean * 50}%`, background: A.color, opacity: 0.85 }} />
        <div style={{ flex: 1, background: B.color, opacity: 0.85 }} />
      </div>
      <div className="muted">
        {rec ? `${rec.battles} battles · ${rec.systemsCeded} systems taken` : ""}
        {sieges.length > 0 && (
          <span style={{ color: "var(--amber)" }}> · under siege: {sieges.map((s) => s.name).join(", ")}</span>
        )}
      </div>
    </div>
  );
}

function RelationMatrix({ w, factions }) {
  const top = factions.slice(0, 10);
  if (top.length < 2) return null;
  const cellStyle = (a, b) => {
    if (a.id === b.id) return { background: "rgba(233,228,214,0.04)" };
    const rel = w.relations[relKey(a.id, b.id)];
    if (!rel) return { background: "rgba(233,228,214,0.07)" };
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
    <Section title="standings">
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
                  style={{ width: 15, height: 15, borderRadius: 3, ...cellStyle(a, b) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="faint mt-1.5" style={{ fontSize: 10 }}>
        <span style={{ color: "var(--red)" }}>■</span> war ·{" "}
        <span style={{ color: "var(--amber)" }}>■</span> embargo ·{" "}
        <span style={{ color: "var(--cyan)" }}>■</span> accord ·{" "}
        <span style={{ color: "rgba(228,120,60,0.7)" }}>■</span> rivalry (darker = calmer)
      </div>
    </Section>
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
      <span className="w-24 muted">{label}</span>
      <div className="flex-1"><Bar v={v} color={color} /></div>
    </div>
  );
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs link" style={{ color: "var(--cyan)" }}>← all factions</button>
      <div>
        <div className="display text-lg leading-tight" style={{ fontWeight: 700, color: f.color }}>
          ■ {f.name}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap muted mt-0.5">
          <GovBadge gov={f.gov} />
          <span>
            est. {f.foundedYear} · seat at{" "}
            <span className="link" onClick={() => onOpenSystem(f.capital)}>
              {w.systems[f.capital].name}
            </span>
          </span>
        </div>
        {f.ruler && (
          <div className="mt-1.5" style={{ color: "var(--gold)" }}>
            ♛ {f.ruler.title} <b>{f.ruler.name}</b>
            <span className="faint"> · reigning {Math.max(0, w.year - f.ruler.since)} years</span>
          </div>
        )}
        {GOV_DESC[f.gov] && <div className="faint mt-1">{GOV_DESC[f.gov]}</div>}
        {f.corpId != null && w.houses[f.corpId] && (
          <div className="mt-1" style={{ color: "var(--gold)" }}>flag of {w.houses[f.corpId].name}</div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="subjects" value={fmtPop(fp)} />
        <Tile label="systems" value={members.length} />
        <Tile label="treasury" value={fmtCredits(f.treasury)} />
      </div>
      <div className="space-y-1.5">
        <Trait label="stability" v={f.stability} color={f.stability < 0.35 ? "var(--red)" : "var(--green)"} />
        <Trait label="aggression" v={f.aggr} color="var(--red)" />
        <Trait label="expansionism" v={f.expans} color="var(--purple)" />
        <Trait label={`tariff ${(f.tariff * 100).toFixed(0)}%`} v={f.tariff / 0.25} color="var(--gold)" />
      </div>
      {trace.length > 5 && (
        <Section title={`last ${trace.length} years`}>
          <div className="space-y-1.5">
            <Spark data={trace.map((t) => t.p)} color="#E9E4D6" label="subjects" fmt={(v) => fmtPop(v)} />
            <Spark data={trace.map((t) => t.s)} color="#C05DD6" label="systems" fmt={(v) => v.toFixed(0)} />
            <Spark data={trace.map((t) => t.t)} color="#E8B04B" label="treasury" fmt={(v) => v.toFixed(0)} />
          </div>
        </Section>
      )}
      {myWars.length > 0 && (
        <div style={{ color: "var(--red)" }}>
          at war with {myWars.map(({ k }) => {
            const other = k.split("|").map(Number).find((x) => x !== f.id);
            return w.factions[other].name;
          }).join(", ")}
        </div>
      )}
      <Section title="worlds">
        <div className="flex flex-wrap gap-1.5">
          {[...members].sort((a, b) => b.pop - a.pop).map((s) => (
            <button
              key={s.id}
              onClick={() => onOpenSystem(s.id)}
              className="px-2 py-1 rounded-md text-xs"
              style={{
                background: "var(--surface)",
                border: `1px solid ${s.id === f.capital ? f.color : "var(--line)"}`,
                color: "var(--text)",
                cursor: "pointer",
              }}
              title={`${fmtPop(s.pop)}${s.id === f.capital ? " · capital" : ""}${s.siege ? " · UNDER SIEGE" : ""}`}
            >
              {s.id === f.capital ? "★ " : ""}{s.name}{s.siege ? " ⚠" : ""}
            </button>
          ))}
        </div>
      </Section>
      {mentions.length > 0 && (
        <Section title="in the chronicle">
          {mentions.map((ev, i) => (
            <div key={i} className="mb-1.5 flex gap-2.5">
              <span style={{ color: "var(--amber)", minWidth: 34 }}>{ev.y}</span>
              <span className="muted">{ev.s}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

export default function FactionsPanel({ w, liveFactions, wars, onOpenSystem }) {
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

  const freeCount = w.systems.filter((s) => s.fid === null && s.pop > 0.05).length;
  const govCounts = liveFactions.reduce((acc, f) => {
    acc[f.gov] = (acc[f.gov] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex gap-4 flex-wrap muted">
        {Object.entries(GOVS).map(([k, g]) =>
          govCounts[k] ? (
            <span key={k}>
              <b style={{ color: g.badge }}>{govCounts[k]}</b> {g.label.toLowerCase()}{govCounts[k] > 1 ? "s" : ""}
            </span>
          ) : null
        )}
        <span><b style={{ color: "var(--text)" }}>{freeCount}</b> free system{freeCount !== 1 ? "s" : ""}</span>
      </div>

      {wars.length > 0 && (
        <Section title="active wars">
          {wars.map(({ k, r }) => <WarCard key={k} w={w} k={k} rel={r} />)}
        </Section>
      )}

      <RelationMatrix w={w} factions={ranked.map((r) => r.f).filter((f) => f.gov !== "pirate")} />

      <Section title="factions">
        {ranked.map(({ f, members }) => {
          const fp = members.reduce((a, s) => a + s.pop, 0);
          const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
          return (
            <div
              key={f.id}
              className="rowbtn mb-1"
              onClick={() => setDetailFid(f.id)}
              title="Open faction details"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ color: f.color }}>■</span>
                <b>{f.name}</b>
                <GovBadge gov={f.gov} />
                {myWars.length > 0 && <span style={{ color: "var(--red)" }}>⚔</span>}
                <span className="ml-auto faint">est. {f.foundedYear}</span>
              </div>
              <div className="muted">
                {members.length} systems · {fmtPop(fp)} · treasury {fmtCredits(f.treasury)} · capital {w.systems[f.capital].name}
              </div>
              {f.ruler && (
                <div className="faint" style={{ color: "var(--gold)" }}>
                  ♛ {f.ruler.title} {f.ruler.name}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="faint">stability</span>
                <div className="flex-1"><Bar v={f.stability} color={f.stability < 0.35 ? "var(--red)" : "var(--green)"} /></div>
              </div>
            </div>
          );
        })}
      </Section>

      {w.factions.filter((f) => f.dead).length > 0 && (
        <Section title="fallen factions">
          {w.factions.filter((f) => f.dead).map((f) => (
            <div key={f.id} className="muted mb-0.5">
              <span style={{ color: f.color, opacity: 0.5 }}>■</span> {f.name} ({f.foundedYear}–{f.diedYear})
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
