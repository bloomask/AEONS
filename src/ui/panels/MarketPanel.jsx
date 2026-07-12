import { Fragment } from "react";
import { GOODS, GOOD_CATS, GOOD_LABEL, BASE_PRICE, FREIGHT_COST, techFx } from "../../sim/constants.js";
import { relKey } from "../../sim/events.js";
import Chart from "../charts.jsx";
import { CHART } from "../theme.js";
import { Section, Tile } from "../widgets.jsx";
import { fmtCredits, fmtCompact } from "../format.js";

const Sys = ({ s, onOpen }) => (
  <span className="link" onClick={() => onOpen(s.id)}>{s.name}</span>
);

// same lane economics the traders use (see sim/phases/trade.js)
const gateLv = (s) => s.infra.gate + (s.mega.nexus ? 3 : 0);
const gateDisc = (A, B) => Math.max(0.4, 1 - 0.12 * (gateLv(A) + gateLv(B)));

// scan every open lane for the single most profitable haul on it, net of
// freight, gate discounts, and the destination's tariff — a trader's almanac
function bestRuns(w) {
  const runs = [];
  for (const e of w.edges) {
    const A = w.systems[e.a], B = w.systems[e.b];
    if (A.pop <= 0.05 || B.pop <= 0.05 || A.siege || B.siege) continue;
    let rel = null;
    if (A.fid !== null && B.fid !== null && A.fid !== B.fid) {
      rel = w.relations[relKey(A.fid, B.fid)];
      if (rel && (rel.war || rel.embargo)) continue;
    }
    const gf = gateDisc(A, B) * (w.cfg?.freight ?? 1) * techFx(w).freight;
    const duty = (dst) => {
      if (!rel || dst.fid === null) return 0;
      if (rel.allied) return 0;
      return w.factions[dst.fid].tariff;
    };
    let best = null;
    for (const g of GOODS) {
      const cost = (e.d / 220) * FREIGHT_COST[g] * gf + 0.05;
      for (const [from, to] of [[A, B], [B, A]]) {
        const m = to.price[g] - from.price[g] - cost - duty(to) * to.price[g];
        if (m > 0.05 && (!best || m > best.margin))
          best = { good: g, from, to, margin: m };
      }
    }
    if (best) runs.push(best);
  }
  return runs.sort((a, b) => b.margin - a.margin).slice(0, 8);
}

export default function MarketPanel({ w, liveSystems, onOpenSystem }) {
  const rows = w.stats.series;
  const last = rows[rows.length - 1];
  if (!last || !liveSystems.length) {
    return <div className="muted italic">The exchanges are silent — no living markets to quote.</div>;
  }

  const eras = (w.eras || []).map((e, i, arr) => ({
    ...e,
    until: i + 1 < arr.length ? arr[i + 1].since : w.year,
  }));

  // per-good galactic market stats, computed live
  const board = {};
  for (const g of GOODS) {
    let sum = 0, stock = 0, min = null, max = null, exp = null;
    for (const s of liveSystems) {
      sum += s.price[g];
      stock += s.stock[g];
      if (!min || s.price[g] < min.price[g]) min = s;
      if (!max || s.price[g] > max.price[g]) max = s;
      if (s.flow[g] < -0.3 && (!exp || s.flow[g] < exp.flow[g])) exp = s;
    }
    board[g] = { avg: sum / liveSystems.length, stock, min, max, exp };
  }

  // credits in circulation: every ledger in the galaxy summed
  const circulation =
    liveSystems.reduce((a, s) => a + Math.max(0, s.wealth), 0) +
    w.houses.reduce((a, h) => a + (h.dead ? 0 : Math.max(0, h.wealth)), 0) +
    w.factions.reduce((a, f) => a + (f.dead ? 0 : Math.max(0, f.treasury)), 0);

  const cpi = last.cpi ?? 100;
  const cpiColor = cpi > 140 ? "var(--red)" : cpi > 110 ? "var(--amber)" : cpi < 80 ? "var(--green)" : undefined;
  const runs = bestRuns(w);
  const richest = [...liveSystems].sort((a, b) => b.wealth - a.wealth).slice(0, 6);
  const px = (v) => v.toFixed(2);

  return (
    <div className="space-y-6">
      <div className="faint italic">
        All value is measured in the <b style={{ color: "var(--gold)" }}>credit (cr)</b> — one
        universal unit of account, Core to rim.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="credit price index" value={cpi.toFixed(0)} sub="cost of goods · 100 = par" color={cpiColor} />
        <Tile label="credits in circulation" value={fmtCredits(circulation)} sub="worlds + houses + treasuries" color="var(--gold)" />
        <Tile label="trade volume / yr" value={fmtCompact(last.trade)} color="var(--cyan)" />
        <Tile label="merchant fleet" value={`${last.fleet} hulls`} />
      </div>

      <Section title="galactic market board" right={
        <span className="faint">
          avg · <span style={{ color: "var(--green)" }}>▼ low</span> · <span style={{ color: "var(--red)" }}>▲ high</span>
        </span>
      }>
        {GOOD_CATS.map((cat) => (
          <Fragment key={cat.key}>
            <div className="uppercase pt-2 pb-1 faint" style={{ fontSize: 9, letterSpacing: "0.14em", fontFamily: "var(--font-display)" }}>
              {cat.label}
            </div>
            {cat.goods.map((g) => {
              const b = board[g];
              const ratio = b.avg / BASE_PRICE[g];
              const c = ratio > 1.8 ? "var(--red)" : ratio > 1.25 ? "var(--amber)" : ratio < 0.6 ? "var(--green)" : "var(--text)";
              const detail = `stockpiled ${fmtCompact(b.stock)} galaxy-wide` +
                (b.exp ? ` · top exporter ${b.exp.name} (${(-b.exp.flow[g]).toFixed(1)}/yr)` : " · no major exporter");
              return (
                <div key={g} className="mb-2 pl-2" title={detail}>
                  <div className="flex items-baseline gap-2">
                    <b>{GOOD_LABEL[g]}</b>
                    <span className="ml-auto" style={{ color: c }}>{px(b.avg)} cr</span>
                    <span className="faint" title="galactic average vs base price">×{ratio.toFixed(1)}</span>
                  </div>
                  <div className="muted">
                    <span style={{ color: "var(--green)" }}>▼</span> <Sys s={b.min} onOpen={onOpenSystem} /> {px(b.min.price[g])}
                    {" · "}
                    <span style={{ color: "var(--red)" }}>▲</span> <Sys s={b.max} onOpen={onOpenSystem} /> {px(b.max.price[g])}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </Section>

      <Section title="trader's almanac" right={<span className="faint" title="margins are net of freight, gate discounts, and tariffs">best runs · net</span>}>
        {runs.map((r, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-baseline gap-2">
              <span>{GOOD_LABEL[r.good]}</span>
              <span className="ml-auto" style={{ color: "var(--green)" }}>+{r.margin.toFixed(2)} cr/unit</span>
            </div>
            <div className="muted pl-2">
              buy <Sys s={r.from} onOpen={onOpenSystem} /> @ {px(r.from.price[r.good])}
              {" → "}sell <Sys s={r.to} onOpen={onOpenSystem} /> @ {px(r.to.price[r.good])}
            </div>
          </div>
        ))}
        {runs.length === 0 && (
          <div className="muted italic">No profitable runs today — freight and tariffs eat every spread.</div>
        )}
      </Section>

      <Section title="where the credits pool">
        {richest.map((s) => (
          <div key={s.id} className="flex gap-2 mb-1 items-baseline">
            <span style={{ color: "var(--gold)" }}>◉</span>
            <Sys s={s} onOpen={onOpenSystem} />
            {s.fid !== null && <span style={{ color: w.factions[s.fid].color }}>■</span>}
            <span className="ml-auto">{fmtCredits(s.wealth)}</span>
          </div>
        ))}
      </Section>

      {/* price history: each chart its own block for the column layout */}
      <Chart title="credit price index (100 = par)" rows={rows} eras={eras} fmt={(v) => v.toFixed(0)}
        series={[{ key: "cpi", color: CHART.amber }]} />
      <Chart title="raw goods — mean price (cr)" rows={rows} eras={eras} fmt={fmtCompact} area={false}
        series={[
          { key: "pxGrain", color: CHART.green, label: "grain" },
          { key: "pxMetals", color: CHART.amber, label: "metals" },
          { key: "pxFuel", color: CHART.cyan, label: "fuel" },
          { key: "pxRares", color: CHART.purple, label: "rares" },
        ]} />
      <Chart title="manufactures — mean price (cr)" rows={rows} eras={eras} fmt={fmtCompact} area={false}
        series={[
          { key: "pxConsumer", color: CHART.cyan, label: "consumer" },
          { key: "pxMedicine", color: CHART.green, label: "medicine" },
          { key: "pxElectronics", color: CHART.purple, label: "electr" },
        ]} />
    </div>
  );
}
