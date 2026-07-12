import { GOVS } from "../../sim/constants.js";
import { relKey } from "../../sim/events.js";
import { Section, Tile } from "../widgets.jsx";

// The martial history of the galaxy: every campaign now being fought, and
// every war the chroniclers have closed the books on.
const facColor = (w, id, name) => {
  if (id != null && w.factions[id]) return w.factions[id].color;
  const f = w.factions.find((x) => x.name === name);
  return f ? f.color : "#8892A6";
};

function ActiveWar({ w, k, rel, onOpenSystem }) {
  const [ia, ib] = k.split("|").map(Number);
  const A = w.factions[ia], B = w.factions[ib];
  const dur = w.year - rel.war.since;
  const rec = w.stats.wars[rel.war.rec];
  const sieges = w.systems.filter((s) => s.siege && s.siege.pair === k);
  const border = w.edges.filter((e) => {
    const fa = w.systems[e.a].fid, fb = w.systems[e.b].fid;
    return (fa === A.id && fb === B.id) || (fa === B.id && fb === A.id);
  });
  const lean = Math.tanh(rel.war.score / 5); // -1..1, toward whoever leads
  const leader = Math.abs(rel.war.score) < 1 ? null : rel.war.score > 0 ? A : B;
  return (
    <div className="p-3 rounded-lg mb-2" style={{ background: "rgba(228,87,46,0.07)", border: "1px solid rgba(228,87,46,0.3)" }}>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <b className="link" style={{ color: A.color }} onClick={() => onOpenSystem(A.capital)}>{A.name}</b>
        <span style={{ color: "var(--red)" }}>⚔</span>
        <b className="link" style={{ color: B.color }} onClick={() => onOpenSystem(B.capital)}>{B.name}</b>
        <span className="ml-auto muted">year {dur} · {border.length} front{border.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden my-2" style={{ background: "rgba(233,228,214,0.1)" }}>
        <div style={{ width: `${50 + lean * 50}%`, background: A.color, opacity: 0.85, transition: "width 0.4s" }} />
        <div style={{ flex: 1, background: B.color, opacity: 0.85 }} />
      </div>
      <div className="muted">
        {rec ? `${rec.battles} battles · ${rec.systemsCeded} systems taken` : ""}
        {leader && <span> · <b style={{ color: leader.color }}>{leader.name}</b> ascendant</span>}
      </div>
      {sieges.length > 0 && (
        <div className="mt-1" style={{ color: "var(--amber)" }}>
          under siege:{" "}
          {sieges.map((s, i) => (
            <span key={s.id}>
              {i > 0 ? ", " : ""}
              <span className="link" onClick={() => onOpenSystem(s.id)} style={{ color: "var(--amber)" }}>{s.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const OUTCOME_STYLE = {
  "capital sacked": "var(--red)",
  decisive: "var(--amber)",
  exhaustion: "var(--muted)",
  stalemate: "var(--muted)",
  "border dissolved": "var(--muted)",
};

export default function WarsPanel({ w, wars, onOpenSystem }) {
  const records = w.stats.wars;
  const past = records.filter((r) => r.end != null).slice().reverse();

  // summary — count ongoing durations too so the "longest" is honest
  const activeDurs = wars.map(({ r }) => ({ dur: w.year - r.war.since }));
  const longest = Math.max(0, ...records.filter((r) => r.duration != null).map((r) => r.duration), ...activeDurs.map((a) => a.dur));
  const bloodiest = records.reduce((m, r) => (r.battles > (m?.battles ?? -1) ? r : m), null);
  const totalCeded = records.reduce((a, r) => a + (r.systemsCeded || 0), 0);
  const totalBattles = records.reduce((a, r) => a + (r.battles || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="wars fought" value={records.length} sub={`${wars.length} raging now`} />
        <Tile label="longest war" value={`${longest}y`} />
        <Tile label="pitched battles" value={totalBattles} />
        <Tile label="systems conquered" value={totalCeded} />
      </div>

      {wars.length > 0 ? (
        <Section title="wars now raging">
          {wars.map(({ k, r }) => <ActiveWar key={k} w={w} k={k} rel={r} onOpenSystem={onOpenSystem} />)}
        </Section>
      ) : (
        <div className="muted italic">No war burns in the galaxy today.</div>
      )}

      {bloodiest && bloodiest.battles > 0 && (
        <div className="muted">
          Bloodiest campaign on record:{" "}
          <b style={{ color: facColor(w, bloodiest.aId, bloodiest.a) }}>{bloodiest.a}</b> vs{" "}
          <b style={{ color: facColor(w, bloodiest.bId, bloodiest.b) }}>{bloodiest.b}</b>{" "}
          — {bloodiest.battles} battles{bloodiest.duration != null ? ` over ${bloodiest.duration} years` : ""}.
        </div>
      )}

      {past.length > 0 && (
        <Section title={`the war record · ${past.length}`}>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ minWidth: 520 }}>
              <thead>
                <tr className="faint" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  <td className="py-1">belligerents</td>
                  <td className="text-right pl-4">years</td>
                  <td className="text-right pl-4">length</td>
                  <td className="pl-4">outcome</td>
                  <td className="text-right pl-4">taken</td>
                  <td className="text-right pl-4">battles</td>
                </tr>
              </thead>
              <tbody>
                {past.map((r, i) => {
                  const decisive = r.winner && r.winner !== "white peace" && !r.winner.startsWith("none");
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="py-1">
                        <span style={{ color: facColor(w, r.aId, r.a) }}>{r.a}</span>
                        <span className="faint"> vs </span>
                        <span style={{ color: facColor(w, r.bId, r.b) }}>{r.b}</span>
                      </td>
                      <td className="text-right muted pl-4 whitespace-nowrap">{r.start}–{r.end}</td>
                      <td className="text-right muted pl-4">{r.duration}y</td>
                      <td className="pl-4">
                        {decisive
                          ? <span style={{ color: facColor(w, null, r.winner) }}>{r.winner} victory</span>
                          : <span className="muted">{r.winner === "white peace" ? "white peace" : "petered out"}</span>}
                        {r.endReason && (
                          <span style={{ color: OUTCOME_STYLE[r.endReason] || "var(--faint)", fontSize: 10 }}> · {r.endReason}</span>
                        )}
                      </td>
                      <td className="text-right muted pl-4">{r.systemsCeded || 0}</td>
                      <td className="text-right muted pl-4">{r.battles || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
