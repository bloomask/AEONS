import { useState } from "react";
import { GOVS } from "../../sim/constants.js";
import { Bar, Spark, Section, Tile } from "../widgets.jsx";
import { eventInvolves } from "../../sim/events.js";
import { lastEvents } from "../chronicle.js";
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

function FactionDetail({ w, f, wars, onBack, onOpenSystem }) {
  const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
  const fp = members.reduce((a, s) => a + s.pop, 0);
  const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
  const trace = f.trace || [];
  // structured involvement — the power appears among the event's recorded
  // actors or targets, never a text match against its (renameable) name
  const mentions = lastEvents(w, (ev) => eventInvolves(ev, "faction", f.id), 10);
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
          {mentions.map((ev) => (
            <div key={ev.i} className="mb-1.5 flex gap-2.5">
              <span style={{ color: "var(--amber)", minWidth: 34 }}>{ev.y}</span>
              <span className="muted">{ev.s}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// onInspect (optional) fires when a faction's detail view is opened — the
// guided tour listens for it
export default function FactionsPanel({ w, liveFactions, wars, onOpenSystem, onInspect }) {
  const [detailFid, setDetailFid] = useState(null);
  const [sort, setSort] = useState("population");
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
    .map((f) => {
      const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
      return { f, members, pop: members.reduce((x, s) => x + s.pop, 0) };
    })
    .sort((a, b) => {
      if (sort === "name") return a.f.name.localeCompare(b.f.name);
      if (sort === "systems") return b.members.length - a.members.length || b.pop - a.pop;
      if (sort === "treasury") return b.f.treasury - a.f.treasury;
      if (sort === "stability") return b.f.stability - a.f.stability;
      if (sort === "age") return a.f.foundedYear - b.f.foundedYear;
      return b.pop - a.pop;
    });

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

      <Section
        title="factions"
        right={(
          <div className="flex flex-wrap justify-end gap-1">
            {["population", "systems", "treasury", "stability", "age", "name"].map((k) => (
              <button key={k} className={`chip${sort === k ? " on" : ""}`} onClick={() => setSort(k)}>{k}</button>
            ))}
          </div>
        )}
      >
        {ranked.map(({ f, members, pop: fp }) => {
          const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
          return (
            <div
              key={f.id}
              className="rowbtn mb-1"
              onClick={() => { setDetailFid(f.id); onInspect && onInspect(f.id); }}
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
