import Chart from "../charts.jsx";
import { CHART } from "../theme.js";
import { fmtPop, fmtMoney } from "../format.js";

const Tile = ({ label, value, sub, color = "#E6E1D3" }) => (
  <div className="px-2 py-1.5 rounded" style={{ background: "rgba(230,225,211,0.05)", border: "1px solid rgba(230,225,211,0.08)" }}>
    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, color }} className="text-base leading-tight">
      {value}
    </div>
    <div style={{ color: "#7C8798", fontSize: 10 }} className="uppercase tracking-wider">{label}</div>
    {sub && <div style={{ color: "#7C8798", fontSize: 10 }}>{sub}</div>}
  </div>
);

export default function GalaxyPanel({ w }) {
  const rows = w.stats.series;
  if (!rows.length) return <div style={{ color: "#7C8798" }}>No history yet.</div>;

  const eras = (w.eras || []).map((e, i, arr) => ({
    ...e,
    until: i + 1 < arr.length ? arr[i + 1].since : w.year,
  }));

  const liveF = w.factions.filter((f) => !f.dead);
  const oldest = liveF.length
    ? liveF.reduce((a, b) => (a.foundedYear < b.foundedYear ? a : b))
    : null;
  const peakPop = Math.max(...rows.map((r) => r.pop));
  const R = w.records;

  const pct = (v) => v.toFixed(0) + "%";
  const num = (v) => v.toFixed(0);

  return (
    <div className="space-y-4">
      <div>
        <div style={{ color: "#7C8798" }} className="mb-1.5 uppercase tracking-widest">hall of records</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Tile label="longest war" value={R.longestWar > 0 ? `${R.longestWar} years` : "—"} color="#E4572E" />
          <Tile label="worst famine" value={`${R.worstFamine.toFixed(0)}M lost`} color="#F2A93B" />
          <Tile label="greatest realm" value={`${R.largestRealm} systems`} color="#C05DD6" />
          <Tile label="richest house" value={fmtMoney(R.richestHouse)} color="#E8B04B" />
          <Tile label="peak population" value={fmtPop(peakPop)} sub={`now ${fmtPop(rows[rows.length - 1].pop)}`} />
          <Tile
            label="oldest living power"
            value={oldest ? `${w.year - oldest.foundedYear} yrs` : "—"}
            sub={oldest ? oldest.name : ""}
            color={oldest ? oldest.color : "#E6E1D3"}
          />
          <Tile label="wars declared" value={num(w.stats.c.warsDeclared)} color="#E4572E" />
          <Tile label="systems gone dark" value={num(w.stats.deaths.length)} color="#B0453A" />
        </div>
      </div>

      <div>
        <div style={{ color: "#7C8798" }} className="mb-1.5 uppercase tracking-widest">the long view</div>
        <div className="space-y-3">
          <Chart title="population" rows={rows} eras={eras} fmt={fmtPop}
            series={[{ key: "pop", color: CHART.amber }]} />
          <Chart title="living systems vs ruins" rows={rows} eras={eras} fmt={num} area={false}
            series={[
              { key: "live", color: CHART.green, label: "live" },
              { key: "ruins", color: CHART.red, label: "ruins" },
            ]} />
          <Chart title="living powers" rows={rows} eras={eras} fmt={num}
            series={[{ key: "factions", color: CHART.cyan }]} />
          <Chart title="active wars" rows={rows} eras={eras} fmt={num}
            series={[{ key: "wars", color: CHART.red }]} />
          <Chart title="trade volume" rows={rows} eras={eras} fmt={num}
            series={[{ key: "trade", color: CHART.cyan }]} />
          <Chart title="average wellbeing" rows={rows} eras={eras} domainMax={1}
            fmt={(v) => (v * 100).toFixed(0) + "%"}
            series={[{ key: "avgWb", color: CHART.green }]} />
          <Chart title="worlds in misery" rows={rows} eras={eras} domainMax={100} fmt={pct}
            series={[{ key: "miseryPct", color: CHART.red }]} />
          <Chart title="largest power's share of humanity" rows={rows} eras={eras} domainMax={1}
            fmt={(v) => (v * 100).toFixed(0) + "%"}
            series={[{ key: "largestShare", color: CHART.purple }]} />
          <Chart title="merchant fleet" rows={rows} eras={eras} fmt={num}
            series={[{ key: "fleet", color: CHART.amber }]} />
        </div>
      </div>

      <div>
        <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">the ages</div>
        {[...eras].reverse().map((e, i) => (
          <div key={i} className="flex gap-2 mb-0.5">
            <span style={{ color: "#F2A93B", minWidth: 70 }}>{e.since}–{e.until === w.year ? "now" : e.until}</span>
            <span style={{ color: i === 0 ? "#E6E1D3" : "#7C8798" }} className={i === 0 ? "italic" : ""}>{e.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
