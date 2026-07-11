import Chart from "../charts.jsx";
import { CHART } from "../theme.js";
import { Section, Tile } from "../widgets.jsx";
import { fmtPop, fmtCredits } from "../format.js";

export default function GalaxyPanel({ w }) {
  const rows = w.stats.series;
  if (!rows.length) return <div className="muted italic">No history yet.</div>;

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
    <div className="space-y-6">
      <Section title="hall of records">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="longest war" value={R.longestWar > 0 ? `${R.longestWar} years` : "—"} color="var(--red)" />
          <Tile label="worst famine" value={`${R.worstFamine.toFixed(0)}M lost`} color="var(--amber)" />
          <Tile label="greatest realm" value={`${R.largestRealm} systems`} color="var(--purple)" />
          <Tile label="richest house" value={fmtCredits(R.richestHouse)} color="var(--gold)" />
          <Tile label="peak population" value={fmtPop(peakPop)} sub={`now ${fmtPop(rows[rows.length - 1].pop)}`} />
          <Tile
            label="oldest living power"
            value={oldest ? `${w.year - oldest.foundedYear} yrs` : "—"}
            sub={oldest ? oldest.name : ""}
            color={oldest ? oldest.color : undefined}
          />
          <Tile label="wars declared" value={num(w.stats.c.warsDeclared)} color="var(--red)" />
          <Tile label="systems gone dark" value={num(w.stats.deaths.length)} color="#B0453A" />
        </div>
      </Section>

      {w.projects.length > 0 && (
        <Section title="megaprojects">
          {w.projects.filter((p) => !p.done && !p.abandoned).map((p, i) => {
            const f = w.factions[p.fid];
            return (
              <div key={i} className="mb-2.5">
                <div className="flex gap-2 items-baseline">
                  <span style={{ color: "#4FD0A5" }}>◈</span>
                  <span><b>{p.name}</b> at {w.systems[p.sysId].name}</span>
                  <span className="ml-auto" style={{ color: f.color }}>{f.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(233,228,214,0.1)" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (p.progress / p.cost) * 100)}%`, background: "#4FD0A5" }} />
                  </div>
                  <span className="faint">{((p.progress / p.cost) * 100).toFixed(0)}% · yr {p.started}</span>
                </div>
              </div>
            );
          })}
          {w.projects.filter((p) => p.done).length > 0 && (
            <div className="muted mt-1">
              wonders standing:{" "}
              {w.projects.filter((p) => p.done).map((p, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <b style={{ color: "#4FD0A5" }}>{p.name}</b> ({w.systems[p.sysId].name}, {p.endedYear})
                </span>
              ))}
            </div>
          )}
          {w.projects.some((p) => p.abandoned) && (
            <div className="faint mt-1">
              {w.projects.filter((p) => p.abandoned).length} abandoned mid-build — the scaffolds outlived their builders.
            </div>
          )}
        </Section>
      )}

      <Section title="the faiths">
        {w.faiths
          .map((f) => ({ f, worlds: w.systems.filter((s) => s.faith === f.id && s.pop > 0.05).length }))
          .sort((a, b) => b.worlds - a.worlds)
          .map(({ f, worlds }) => (
            <div key={f.id} className="flex gap-2 mb-1 items-baseline">
              <span style={{ color: f.color }}>✦</span>
              <span>{f.name}</span>
              <span className={`ml-auto ${worlds ? "muted" : "faint"}`}>
                {worlds ? `${worlds} world${worlds > 1 ? "s" : ""}` : "extinct"}
                {f.founded > 0 && ` · schism of ${f.founded}`}
              </span>
            </div>
          ))}
      </Section>

      <Section title="the long view">
        <div className="space-y-4">
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
          <Chart title="humanity going hungry" rows={rows} eras={eras} domainMax={100} fmt={pct}
            series={[{ key: "hungerPct", color: CHART.red }]} />
          <Chart title="the social pyramid (% of humanity)" rows={rows} eras={eras} domainMax={100} fmt={pct} area={false}
            series={[
              { key: "cElite", color: CHART.amber, label: "elite" },
              { key: "cUpper", color: CHART.purple, label: "upper" },
              { key: "cMiddle", color: CHART.cyan, label: "middle" },
              { key: "cWorker", color: CHART.green, label: "workers" },
            ]} />
          <Chart title="class unrest" rows={rows} eras={eras} domainMax={1}
            fmt={(v) => (v * 100).toFixed(0) + "%"}
            series={[{ key: "unrest", color: CHART.red }]} />
          <Chart title="worlds in misery" rows={rows} eras={eras} domainMax={100} fmt={pct}
            series={[{ key: "miseryPct", color: CHART.red }]} />
          <Chart title="largest power's share of humanity" rows={rows} eras={eras} domainMax={1}
            fmt={(v) => (v * 100).toFixed(0) + "%"}
            series={[{ key: "largestShare", color: CHART.purple }]} />
          <Chart title="merchant fleet" rows={rows} eras={eras} fmt={num}
            series={[{ key: "fleet", color: CHART.amber }]} />
        </div>
      </Section>

      <Section title="the ages">
        {[...eras].reverse().map((e, i) => (
          <div key={i} className="flex gap-2.5 mb-1">
            <span style={{ color: "var(--amber)", minWidth: 70 }}>{e.since}–{e.until === w.year ? "now" : e.until}</span>
            <span className={i === 0 ? "italic" : "muted"} style={i === 0 ? { color: "var(--text)" } : undefined}>{e.name}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}
