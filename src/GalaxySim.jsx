import { useState, useEffect, useRef, useCallback } from "react";
import { genGalaxy } from "./sim/galaxy.js";
import { defaultConfig } from "./sim/config.js";
import { simulateYear } from "./sim/simulate.js";
import { buildStats } from "./sim/stats.js";
import { downloadFile } from "./ui/download.js";
import NewGameScreen from "./ui/NewGameScreen.jsx";
import MapView from "./ui/MapView.jsx";
import Ticker from "./ui/Ticker.jsx";
import Timeline from "./ui/Timeline.jsx";
import TopBar from "./ui/TopBar.jsx";
import { SCREENS } from "./ui/theme.js";
import SystemPanel from "./ui/panels/SystemPanel.jsx";
import PowersPanel from "./ui/panels/PowersPanel.jsx";
import TradePanel from "./ui/panels/TradePanel.jsx";
import MarketPanel from "./ui/panels/MarketPanel.jsx";
import ChroniclePanel from "./ui/panels/ChroniclePanel.jsx";
import GalaxyPanel from "./ui/panels/GalaxyPanel.jsx";

// inspection lives in the side window; everything else takes the full screen
const SIDE_TABS = [
  { key: "system", glyph: "⊙" },
  { key: "powers", glyph: "♜" },
];

export default function GalaxySim() {
  const worldRef = useRef(null);
  const mapApi = useRef(null);

  const [, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const [sideTab, setSideTab] = useState("system");
  const [screen, setScreen] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [burn, setBurn] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [cfg, setCfg] = useState(defaultConfig);
  const [setupOpen, setSetupOpen] = useState(true);
  const [overlay, setOverlay] = useState("realm");
  const [evFilter, setEvFilter] = useState("all");
  const [facFilter, setFacFilter] = useState("all");
  const [focusYear, setFocusYear] = useState(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const runBurn = useCallback((w, years, onDone) => {
    setBurn({ done: 0, total: years });
    let done = 0;
    const step = () => {
      if (worldRef.current !== w) return; // a newer galaxy superseded this burn
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

  // founding: generate the configured galaxy and burn its pre-history
  const begin = useCallback((newSeed, newCfg) => {
    setSetupOpen(false);
    setSpeed(0);
    setSeed(newSeed);
    setCfg(newCfg);
    setSelected(null);
    setSideTab("system");
    setScreen(null);
    setFacFilter("all");
    setFocusYear(null);
    const w = genGalaxy(newSeed, newCfg);
    worldRef.current = w;
    const burnY = Math.round(newCfg.burnYears);
    if (burnY > 0) runBurn(w, burnY, () => setSpeed(1));
    else { setSpeed(1); bump(); }
  }, [runBurn, bump]);

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

  // Esc closes an open full-screen panel
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setScreen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const w = worldRef.current;
  const liveSystems = w ? w.systems.filter((s) => s.pop > 0.05) : [];
  const totalPop = liveSystems.reduce((a, s) => a + s.pop, 0);
  const liveFactions = w ? w.factions.filter((f) => !f.dead) : [];
  const wars = w
    ? Object.entries(w.relations).filter(([, r]) => r.war).map(([k, r]) => ({ k, r }))
    : [];
  const sel = w && selected !== null ? w.systems[selected] : null;

  // selecting a system closes any full-screen panel, opens the side
  // inspector, AND flies the camera there
  const openSystem = useCallback((id) => {
    setSelected(id);
    if (id !== null) {
      setScreen(null);
      setSideTab("system");
      mapApi.current?.focus(id);
    }
  }, []);

  // plain map clicks select without yanking the camera around
  const selectOnMap = useCallback((id) => {
    setSelected(id);
    if (id !== null) setSideTab("system");
  }, []);

  const scrubTo = useCallback((year) => {
    setFocusYear(year);
    setScreen("chronicle");
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

  // the founding screen replaces everything until a galaxy is begun
  if (setupOpen) {
    return (
      <NewGameScreen
        initialSeed={seed}
        initialCfg={cfg}
        canCancel={!!w}
        onBegin={begin}
        onCancel={() => setSetupOpen(false)}
      />
    );
  }

  const scr = screen ? SCREENS[screen] : null;

  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-ui)" }}
    >
      <TopBar
        seed={seed}
        year={w ? w.year : "—"}
        speed={speed}
        setSpeed={setSpeed}
        onCentury={() => w && !burn && runBurn(w, 100)}
        onNewGalaxy={() => { setSpeed(0); setSetupOpen(true); }}
        screen={screen}
        setScreen={setScreen}
        w={w}
        liveSystems={liveSystems}
        totalPop={totalPop}
        liveFactions={liveFactions}
        wars={wars}
      />

      <div className="relative flex-1 flex flex-col md:flex-row min-h-0">
        <div className="relative flex-1 flex flex-col min-h-0">
          <MapView
            worldRef={worldRef}
            selected={selected}
            onSelect={selectOnMap}
            overlay={overlay}
            setOverlay={setOverlay}
            burn={burn}
            mapApi={mapApi}
          />
          {w && !burn && (
            <Ticker
              worldRef={worldRef}
              onOpen={(ev) => {
                if (ev.sysId !== null) openSystem(ev.sysId);
                else setScreen("chronicle");
              }}
            />
          )}
          {w && !burn && <Timeline w={w} onScrub={scrubTo} focusYear={focusYear} />}
        </div>

        {/* the inspection window: system & power details only */}
        <div
          className="w-full md:w-[26rem] flex-1 md:flex-none flex flex-col min-h-0"
          style={{ background: "var(--panel)", borderLeft: "1px solid var(--line)" }}
        >
          <nav className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
            {SIDE_TABS.map(({ key, glyph }) => (
              <button key={key} onClick={() => setSideTab(key)} className={`navtab${sideTab === key ? " on" : ""}`}>
                <span className="glyph">{glyph}</span>
                {key}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ lineHeight: 1.6 }}>
            {sideTab === "system" && <SystemPanel w={w} sel={sel} />}
            {sideTab === "powers" && w && (
              <PowersPanel w={w} liveFactions={liveFactions} wars={wars} onOpenSystem={openSystem} />
            )}
          </div>
        </div>

        {/* full-screen panels take over everything below the command bar */}
        {scr && w && (
          <div className="fs-overlay">
            <div className="fs-head">
              <span style={{ color: "var(--amber)", fontSize: 15 }}>{scr.glyph}</span>
              <span className="display" style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bright)" }}>
                {scr.title}
              </span>
              <span className="faint">esc closes</span>
              <div className="flex-1" />
              {screen === "galaxy" && (
                <>
                  <button className="btn" onClick={exportJson} title="Download full statistics (summary + deaths + wars + yearly series) as JSON">⬇ json</button>
                  <button className="btn" onClick={exportCsv} title="Download yearly time series as CSV">⬇ csv</button>
                </>
              )}
              <button className="btn" onClick={() => setScreen(null)} title="Close (Esc)">✕ close</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className={`mx-auto p-6 text-xs ${scr.narrow ? "max-w-3xl" : "max-w-6xl fs-cols"}`} style={{ lineHeight: 1.6 }}>
                {screen === "trade" && <TradePanel w={w} onOpenSystem={openSystem} />}
                {screen === "market" && <MarketPanel w={w} liveSystems={liveSystems} onOpenSystem={openSystem} />}
                {screen === "galaxy" && <GalaxyPanel w={w} />}
                {screen === "chronicle" && (
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
        )}
      </div>
    </div>
  );
}
