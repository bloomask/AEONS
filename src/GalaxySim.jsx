import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "./sim/constants.js";
import { genGalaxy } from "./sim/galaxy.js";
import { simulateYear } from "./sim/simulate.js";
import { buildStats } from "./sim/stats.js";
import { downloadFile } from "./ui/download.js";
import MapView from "./ui/MapView.jsx";
import Timeline from "./ui/Timeline.jsx";
import TopBar from "./ui/TopBar.jsx";
import StatsStrip from "./ui/StatsStrip.jsx";
import SystemPanel from "./ui/panels/SystemPanel.jsx";
import PowersPanel from "./ui/panels/PowersPanel.jsx";
import TradePanel from "./ui/panels/TradePanel.jsx";
import ChroniclePanel from "./ui/panels/ChroniclePanel.jsx";
import GalaxyPanel from "./ui/panels/GalaxyPanel.jsx";

const TABS = ["system", "powers", "trade", "galaxy", "chronicle"];

export default function GalaxySim() {
  const worldRef = useRef(null);
  const mapApi = useRef(null);

  const [, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("chronicle");
  const [speed, setSpeed] = useState(0);
  const [burn, setBurn] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [overlay, setOverlay] = useState("realm");
  const [evFilter, setEvFilter] = useState("all");
  const [facFilter, setFacFilter] = useState("all");
  const [focusYear, setFocusYear] = useState(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const runBurn = useCallback((w, years, onDone) => {
    setBurn({ done: 0, total: years });
    let done = 0;
    const step = () => {
      const chunk = Math.min(12, years - done);
      for (let i = 0; i < chunk; i++) simulateYear(w);
      done += chunk;
      setBurn({ done, total: years });
      bump();
      if (done < years) setTimeout(step, 0);
      else { setBurn(null); onDone && onDone(); }
    };
    setTimeout(step, 0);
  }, [bump]);

  // init
  useEffect(() => {
    const w = genGalaxy(seed);
    worldRef.current = w;
    setSelected(null);
    setFacFilter("all");
    setFocusYear(null);
    runBurn(w, T.BURN_YEARS, () => setSpeed(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // sim clock — render rate capped at 10/s; higher speeds batch years per tick
  useEffect(() => {
    if (!speed || burn) return;
    const yearsPerTick = Math.max(1, Math.round(speed / 10));
    const iv = setInterval(() => {
      if (worldRef.current) {
        for (let i = 0; i < yearsPerTick; i++) simulateYear(worldRef.current);
        bump();
      }
    }, 1000 / Math.min(speed, 10));
    return () => clearInterval(iv);
  }, [speed, burn, bump]);

  const w = worldRef.current;
  const liveSystems = w ? w.systems.filter((s) => s.pop > 0.05) : [];
  const totalPop = liveSystems.reduce((a, s) => a + s.pop, 0);
  const liveFactions = w ? w.factions.filter((f) => !f.dead) : [];
  const wars = w
    ? Object.entries(w.relations).filter(([, r]) => r.war).map(([k, r]) => ({ k, r }))
    : [];
  const sel = w && selected !== null ? w.systems[selected] : null;

  // selecting a system opens its panel AND flies the camera there
  const openSystem = useCallback((id) => {
    setSelected(id);
    if (id !== null) {
      setTab("system");
      mapApi.current?.focus(id);
    }
  }, []);

  // plain map clicks select without yanking the camera around
  const selectOnMap = useCallback((id) => {
    setSelected(id);
    if (id !== null) setTab("system");
  }, []);

  const scrubTo = useCallback((year) => {
    setFocusYear(year);
    setTab("chronicle");
  }, []);

  const exportJson = () => {
    const wd = worldRef.current;
    if (!wd || burn) return;
    downloadFile(
      `aeons-stats-seed${wd.seed}-y${wd.year}.json`,
      JSON.stringify(buildStats(wd), null, 1),
      "application/json"
    );
  };
  const exportCsv = () => {
    const wd = worldRef.current;
    if (!wd || burn || !wd.stats.series.length) return;
    const keys = Object.keys(wd.stats.series[0]);
    const csv = [keys.join(","), ...wd.stats.series.map((r) => keys.map((k) => r[k]).join(","))].join("\n");
    downloadFile(`aeons-series-seed${wd.seed}-y${wd.year}.csv`, csv, "text/csv");
  };

  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={{ background: "#06090F", color: "#E6E1D3", fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <TopBar
        seed={seed}
        year={w ? w.year : "—"}
        speed={speed}
        setSpeed={setSpeed}
        onCentury={() => w && !burn && runBurn(w, 100)}
        onExportJson={exportJson}
        onExportCsv={exportCsv}
        onNewGalaxy={() => { setSpeed(0); setSeed(Math.floor(Math.random() * 1e6)); }}
      />

      <StatsStrip w={w} liveSystems={liveSystems} totalPop={totalPop} liveFactions={liveFactions} wars={wars} />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <MapView
            worldRef={worldRef}
            selected={selected}
            onSelect={selectOnMap}
            overlay={overlay}
            setOverlay={setOverlay}
            burn={burn}
            mapApi={mapApi}
          />
          {w && !burn && <Timeline w={w} onScrub={scrubTo} focusYear={focusYear} />}
        </div>

        {/* side panel */}
        <div
          className="w-full md:w-96 flex-1 md:flex-none flex flex-col min-h-0"
          style={{ background: "#0C121C", borderLeft: "1px solid rgba(230,225,211,0.12)" }}
        >
          <div className="flex" style={{ borderBottom: "1px solid rgba(230,225,211,0.12)" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 text-xs uppercase tracking-widest"
                style={{
                  fontFamily: "'Chakra Petch', sans-serif",
                  color: tab === t ? "#F2A93B" : "#7C8798",
                  borderBottom: tab === t ? "2px solid #F2A93B" : "2px solid transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs leading-relaxed">
            {tab === "system" && <SystemPanel w={w} sel={sel} />}
            {tab === "powers" && w && (
              <PowersPanel w={w} liveFactions={liveFactions} wars={wars} onOpenSystem={openSystem} />
            )}
            {tab === "trade" && w && <TradePanel w={w} liveSystems={liveSystems} onOpenSystem={openSystem} />}
            {tab === "galaxy" && w && <GalaxyPanel w={w} />}
            {tab === "chronicle" && w && (
              <ChroniclePanel
                w={w}
                evFilter={evFilter} setEvFilter={setEvFilter}
                facFilter={facFilter} setFacFilter={setFacFilter}
                onOpenSystem={openSystem}
                focusYear={focusYear}
                onBackToLive={() => setFocusYear(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
