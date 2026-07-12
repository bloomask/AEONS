import { GOVS } from "../../sim/constants.js";
import { relKey, getRel } from "../../sim/events.js";
import { Section, Tile } from "../widgets.jsx";

// Every diplomatic tie in the galaxy: the standings matrix, plus the pacts,
// trade wars, and simmering rivalries spelled out. Corsairs keep no treaties,
// so they never sit at the table.
const relOf = (w, a, b) => w.relations[relKey(a, b)] || null;

function Matrix({ w, factions }) {
  if (factions.length < 2) return <div className="muted italic">Too few powers for a diplomatic map.</div>;
  const cell = (a, b) => {
    if (a.id === b.id) return { bg: "rgba(233,228,214,0.05)", t: a.name };
    const rel = relOf(w, a.id, b.id);
    if (!rel) return { bg: "rgba(233,228,214,0.06)", t: `${a.name} ↔ ${b.name}: no contact` };
    if (rel.war) return { bg: "#E4572E", t: `${a.name} ↔ ${b.name}: AT WAR since ${rel.war.since}` };
    if (rel.allied) return { bg: "#5CC8DA", t: `${a.name} ↔ ${b.name}: open-lanes accord · rivalry ${rel.rivalry.toFixed(0)}` };
    if (rel.embargo) return { bg: "#F2A93B", t: `${a.name} ↔ ${b.name}: embargo · rivalry ${rel.rivalry.toFixed(0)}` };
    return { bg: `rgba(228,120,60,${(rel.rivalry / 100) * 0.6 + 0.04})`, t: `${a.name} ↔ ${b.name}: rivalry ${rel.rivalry.toFixed(0)}/100` };
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
        <tbody>
          <tr>
            <td />
            {factions.map((f) => (
              <td key={f.id} title={f.name} style={{ color: f.color, fontSize: 11, textAlign: "center", width: 16 }}>■</td>
            ))}
          </tr>
          {factions.map((a) => (
            <tr key={a.id}>
              <td className="pr-2 whitespace-nowrap" style={{ textAlign: "right" }}>
                <span style={{ color: a.color }}>■</span>{" "}
                <span className="muted" style={{ fontSize: 11 }}>{a.name}</span>
              </td>
              {factions.map((b) => {
                const c = cell(a, b);
                return <td key={b.id} title={c.t} style={{ width: 16, height: 16, borderRadius: 3, background: c.bg }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DiplomacyPanel({ w, liveFactions, onOpenSystem }) {
  // states only — corsair havens are outlaws, not diplomatic actors
  const states = liveFactions
    .filter((f) => f.gov !== "pirate")
    .map((f) => ({ f, pop: w.systems.filter((s) => s.fid === f.id && s.pop > 0.05).reduce((a, s) => a + s.pop, 0) }))
    .sort((a, b) => b.pop - a.pop)
    .map((x) => x.f);

  // walk every state pair once, bucket the ties
  const wars = [], allies = [], embargoes = [], rivalries = [];
  for (let i = 0; i < states.length; i++)
    for (let j = i + 1; j < states.length; j++) {
      const A = states[i], B = states[j];
      const rel = relOf(w, A.id, B.id);
      if (!rel) continue;
      if (rel.war) wars.push({ A, B, rel });
      else if (rel.allied) allies.push({ A, B, rel });
      else if (rel.embargo) embargoes.push({ A, B, rel });
      if (!rel.war && !rel.allied && rel.rivalry >= 40) rivalries.push({ A, B, rel });
    }
  rivalries.sort((a, b) => b.rel.rivalry - a.rel.rivalry);

  const Pair = ({ A, B, note, noteColor }) => (
    <div className="flex items-baseline gap-1.5 flex-wrap mb-1">
      <span className="link" style={{ color: A.color }} onClick={() => onOpenSystem(A.capital)}>■ {A.name}</span>
      <span className="faint">·</span>
      <span className="link" style={{ color: B.color }} onClick={() => onOpenSystem(B.capital)}>■ {B.name}</span>
      {note && <span className="ml-auto" style={{ color: noteColor || "var(--muted)" }}>{note}</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="powers" value={states.length} />
        <Tile label="alliances" value={allies.length} color="var(--cyan)" />
        <Tile label="active wars" value={wars.length} color={wars.length ? "var(--red)" : undefined} />
        <Tile label="embargoes" value={embargoes.length} color={embargoes.length ? "var(--amber)" : undefined} />
      </div>

      <Section title="the standings">
        <Matrix w={w} factions={states} />
        <div className="faint mt-2" style={{ fontSize: 11 }}>
          <span style={{ color: "var(--red)" }}>■</span> war ·{" "}
          <span style={{ color: "var(--cyan)" }}>■</span> open-lanes accord ·{" "}
          <span style={{ color: "var(--amber)" }}>■</span> embargo ·{" "}
          <span style={{ color: "rgba(228,120,60,0.7)" }}>■</span> rivalry (brighter = hotter) · read a row against the top swatches
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
        {wars.length > 0 && (
          <Section title="at war">
            {wars.map(({ A, B, rel }) => (
              <Pair key={relKey(A.id, B.id)} A={A} B={B} note={`since ${rel.war.since}`} noteColor="var(--red)" />
            ))}
          </Section>
        )}
        {allies.length > 0 && (
          <Section title="open-lanes accords">
            {allies.map(({ A, B, rel }) => (
              <Pair key={relKey(A.id, B.id)} A={A} B={B} note={`rivalry ${rel.rivalry.toFixed(0)}`} noteColor="var(--cyan)" />
            ))}
          </Section>
        )}
        {embargoes.length > 0 && (
          <Section title="trade wars">
            {embargoes.map(({ A, B, rel }) => (
              <Pair key={relKey(A.id, B.id)} A={A} B={B} note={`rivalry ${rel.rivalry.toFixed(0)}`} noteColor="var(--amber)" />
            ))}
          </Section>
        )}
        {rivalries.length > 0 && (
          <Section title="simmering rivalries">
            {rivalries.slice(0, 12).map(({ A, B, rel }) => (
              <Pair key={relKey(A.id, B.id)} A={A} B={B} note={`${rel.rivalry.toFixed(0)}/100`}
                noteColor={rel.rivalry > 55 ? "var(--red)" : "var(--amber)"} />
            ))}
          </Section>
        )}
      </div>

      {wars.length === 0 && allies.length === 0 && embargoes.length === 0 && rivalries.length === 0 && (
        <div className="muted italic">The galaxy is at peace — no wars, no pacts, no quarrels worth the name. For now.</div>
      )}
    </div>
  );
}
