import { useState } from "react";
import { Section, Tile } from "../widgets.jsx";
import { fmtCredits } from "../format.js";
import { apply } from "../../game/commands.js";
import {
  overview, fleetRows, marketRows, shipsAt, shipyard, ledgerRows, milestones,
} from "./present.js";

// The corporate boardroom: the player's dashboard over a live Game. All display
// logic is in present.js (tested); this is a thin render plus buttons that
// dispatch commands. The game mutates in place, so a version counter forces a
// re-render after each command. `sel` is the map's selected system id.
export default function BoardroomPanel({ game, sel }) {
  const [, bump] = useState(0);
  const act = (cmd) => { const r = apply(game, cmd); bump((n) => n + 1); return r; };
  const [qty, setQty] = useState(10);

  const o = overview(game);
  const fleet = fleetRows(game);
  const dockedHere = sel != null ? shipsAt(game, sel) : [];
  const shipId = dockedHere[0] ?? null;
  const market = sel != null ? marketRows(game, sel, shipId) : [];

  return (
    <div className="space-y-5">
      <div>
        <div className="display text-lg" style={{ fontWeight: 700, color: "var(--bright)" }}>{o.name}</div>
        <div className="muted">year {o.year} · day {o.day} · rank {o.rank}/{o.ofPlayers} · {o.commerceShare}% of galactic commerce</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="cash" value={fmtCredits(o.cash)} />
        <Tile label="net worth" value={fmtCredits(o.netWorth)} />
        <Tile label="systems held" value={o.systemsHeld} />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button className="chip" onClick={() => act({ t: "step", n: 1 })}>+1 day</button>
        <button className="chip" onClick={() => act({ t: "step", n: 30 })}>+1 month</button>
        <button className="chip" onClick={() => act({ t: "step", n: game.clock.daysPerYear })}>+1 year</button>
        <button className="chip" onClick={() => act({ t: "insurance", on: !game.corp.insured })}>
          insurance {game.corp.insured ? "on" : "off"}
        </button>
      </div>

      <Section title="shipyard">
        <div className="flex gap-1.5 flex-wrap">
          {shipyard(game).map((s) => (
            <button key={s.key} className="chip" disabled={!s.affordable}
              title={`cargo ${s.cargo} · speed ${s.speed} · upkeep ${s.upkeep}/yr`}
              onClick={() => act({ t: "commission", cls: s.key })}>
              {s.label} · {fmtCredits(s.cost)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={`fleet · ${fleet.length}`}>
        {fleet.length === 0 && <div className="muted italic">No hulls yet — commission one above.</div>}
        {fleet.map((sh) => (
          <div key={sh.id} className="mb-1.5">
            <div className="flex items-baseline gap-2">
              <b>{sh.label} #{sh.id}</b>
              {sh.onRoute && <span className="faint">· on route</span>}
              <span className="ml-auto muted">{sh.where}</span>
            </div>
            <div className="faint">{sh.cargo} · {sh.used}/{sh.cap} hold</div>
          </div>
        ))}
      </Section>

      {sel != null && (
        <Section title={`market · ${game.w.systems[sel].name}`}
          right={shipId != null ? <span className="faint">ship #{shipId} docked</span> : <span className="faint">no ship here</span>}>
          <div className="flex items-center gap-2 mb-2">
            <span className="muted">qty</span>
            <input type="number" value={qty} min={1} onChange={(e) => setQty(Math.max(1, +e.target.value || 1))}
              className="w-16 px-1" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4 }} />
            <button className="chip" onClick={() => act({ t: "buildDepot", sys: sel })}
              disabled={!!game.corp.depots[sel]}>build depot</button>
            <button className="chip" onClick={() => act({ t: "invest", sys: sel, amount: 100 })}>invest 100</button>
          </div>
          <table className="w-full">
            <tbody>
              {market.map((r) => (
                <tr key={r.good}>
                  <td className="py-0.5">{r.label}</td>
                  <td className="text-right muted">{r.stock}</td>
                  <td className="text-right" style={{ width: 60 }}>{r.price.toFixed(2)}</td>
                  <td className="text-right" style={{ width: 90 }}>
                    {shipId != null && (
                      <>
                        <button className="link" style={{ color: "var(--green)" }}
                          onClick={() => act({ t: "buy", ship: shipId, good: r.good, qty })}>buy</button>
                        {" · "}
                        <button className="link" style={{ color: "var(--cyan)" }}
                          onClick={() => act({ t: "sell", ship: shipId, good: r.good, qty })}>sell</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="milestones">
        {milestones(game).map((m) => (
          <div key={m.key} className="muted">
            <span style={{ color: m.done ? "var(--green)" : "var(--muted)" }}>{m.done ? "✓" : "○"}</span> {m.label}
          </div>
        ))}
      </Section>

      <Section title="ledger">
        {ledgerRows(game).map((e, i) => (
          <div key={i} className="flex gap-2.5 mb-0.5">
            <span style={{ color: e.delta >= 0 ? "var(--green)" : "var(--red)", minWidth: 60 }} className="text-right">
              {e.delta >= 0 ? "+" : ""}{e.delta.toFixed(0)}
            </span>
            <span className="muted">{e.text}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}
