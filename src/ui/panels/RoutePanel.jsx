import { Section, Tile } from "../widgets.jsx";
import { routeStats } from "../map/routeStats.js";
import { GOVS } from "../../sim/constants.js";

function End({ w, s, onOpenSystem }) {
  const f = s.fid !== null ? w.factions[s.fid] : null;
  const g = f ? GOVS[f.gov] : null;
  return (
    <button className="text-left w-full" onClick={() => onOpenSystem(s.id)} title="Inspect this system">
      <div className="display" style={{ fontWeight: 700, color: "var(--bright)" }}>{s.name}</div>
      <div className="muted">
        {f
          ? <><span style={{ color: f.color }}>■</span> {f.name}{g ? ` · ${g.label.toLowerCase()}` : ""}</>
          : s.freePort ? "free port" : s.pop > 0.05 ? "free system" : "uncolonized"}
      </div>
    </button>
  );
}

export default function RoutePanel({ w, ei, onOpenSystem }) {
  const r = routeStats(w, ei);

  return (
    <div className="space-y-4">
      <div>
        <div className="display text-lg" style={{ fontWeight: 700, color: "var(--bright)" }}>
          {r.A.name} — {r.B.name}
        </div>
        <div style={{ color: r.statusColor }}>
          jumpgate lane · {r.status}
          {r.raidRisk && <span style={{ color: "#A34A3A" }}> · corsair waters</span>}
        </div>
      </div>

      {r.severed && (
        <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(228,87,46,0.12)", color: "var(--red)", border: "1px solid rgba(228,87,46,0.4)" }}>
          {r.besieged ? "A blockade at one end has severed this lane — no cargo moves." : "War or embargo has closed this lane — no cargo moves."}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="throughput" value={r.vol.toFixed(1)} />
        <Tile label="lane length" value={r.length.toFixed(0)} />
        <Tile label="flow" value={Math.abs(r.net) < 0.05 ? "⇌" : (r.net >= 0 ? "→" : "←")} sub={r.dirLabel} />
      </div>

      <Section title="endpoints">
        <div className="space-y-2">
          <End w={w} s={r.A} onOpenSystem={onOpenSystem} />
          <End w={w} s={r.B} onOpenSystem={onOpenSystem} />
        </div>
      </Section>

      <Section title="freight & duties">
        <div className="muted space-y-1">
          <div className="flex justify-between">
            <span>freight multiplier</span>
            <b style={{ color: "var(--text)" }}>×{r.freightMul.toFixed(2)}</b>
          </div>
          <div className="flex justify-between" title="Better gate docks and a nexus cut haulage cost on this lane">
            <span>gate discount</span>
            <b style={{ color: r.gateDiscount < 1 ? "var(--cyan)" : "var(--text)" }}>×{r.gateDiscount.toFixed(2)}</b>
          </div>
          <div className="flex justify-between">
            <span>duty into {r.B.name}</span>
            <b style={{ color: r.tariffAtoB > 0 ? "var(--amber)" : "var(--green)" }}>{(r.tariffAtoB * 100).toFixed(0)}%</b>
          </div>
          <div className="flex justify-between">
            <span>duty into {r.A.name}</span>
            <b style={{ color: r.tariffBtoA > 0 ? "var(--amber)" : "var(--green)" }}>{(r.tariffBtoA * 100).toFixed(0)}%</b>
          </div>
        </div>
      </Section>

      <Section title="cargo" right={<span className="faint">{r.A.name.slice(0, 6)} · {r.B.name.slice(0, 6)} cr</span>}>
        <table className="w-full">
          <tbody>
            {r.goods.map((x) => (
              <tr key={x.g}>
                <td className="py-0.5">
                  {x.label}
                  {x.dir && <span style={{ color: "#C4ECF6" }} title={`margin ${x.margin.toFixed(2)} cr/unit after freight & duty`}> {x.dir === "A→B" ? "→" : "←"}</span>}
                </td>
                <td className="text-right muted" style={x.dir === "B→A" ? { color: "var(--green)" } : undefined}>{x.priceA.toFixed(2)}</td>
                <td className="text-right muted" style={x.dir === "A→B" ? { color: "var(--green)" } : undefined}>{x.priceB.toFixed(2)}</td>
                <td className="text-right faint" style={{ width: 40 }}>{x.cost.toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className="faint pt-1" style={{ fontSize: 10 }}>
                arrows show where cargo profitably flows; last column is freight cr/unit
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {!r.severed && r.flowing.length === 0 && (
        <div className="faint italic">
          Prices on both ends sit within freight cost of each other — nothing moves
          but the lane stays open for when they diverge.
        </div>
      )}
    </div>
  );
}
