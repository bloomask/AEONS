import { useState, useEffect, useRef, useCallback } from "react";
import { genGalaxy } from "./sim/galaxy.js";
import { defaultConfig } from "./sim/config.js";
import { simulateYear } from "./sim/simulate.js";
import { buildStats } from "./sim/stats.js";
import { downloadFile } from "./ui/download.js";
import { loadWorld, safeAutosave, AUTOSAVE_EVERY } from "./ui/saves.js";
import NewGameScreen from "./ui/NewGameScreen.jsx";
import TutorialOverlay from "./ui/TutorialOverlay.jsx";
import { TUT_STEPS, markTutorialSeen } from "./ui/tutorial.js";
import MapView from "./ui/MapView.jsx";
import Ticker from "./ui/Ticker.jsx";
import Timeline from "./ui/Timeline.jsx";
import TopBar from "./ui/TopBar.jsx";
import { SCREENS } from "./ui/theme.js";
import SystemPanel from "./ui/panels/SystemPanel.jsx";
import FactionsPanel from "./ui/panels/FactionsPanel.jsx";
import CuratorPanel from "./ui/panels/CuratorPanel.jsx";
import TradePanel from "./ui/panels/TradePanel.jsx";
import MarketPanel from "./ui/panels/MarketPanel.jsx";
import ChroniclePanel from "./ui/panels/ChroniclePanel.jsx";
import GalaxyPanel from "./ui/panels/GalaxyPanel.jsx";
import SavesPanel from "./ui/panels/SavesPanel.jsx";
import RoutePanel from "./ui/panels/RoutePanel.jsx";
import DiplomacyPanel from "./ui/panels/DiplomacyPanel.jsx";
import WarsPanel from "./ui/panels/WarsPanel.jsx";

// inspection lives in the side window; everything else takes the full screen.
// "factions" inspects the simulation's powers (never the player's — see
// docs/PRODUCT.md); "curate" appears only in Curate mode.
const SIDE_TABS = [
  { key: "system", glyph: "⊙" },
  { key: "factions", glyph: "♜" },
  { key: "curate", glyph: "✳", curateOnly: true },
];

export default function GalaxySim() {
  const worldRef = useRef(null);
  const mapApi = useRef(null);
  // sim-year of the last autosave — a new one rotates in every AUTOSAVE_EVERY years
  const lastAutoRef = useRef(0);

  const [, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  // the curator's live targeting request (Curate mode): what the map should
  // highlight and accept clicks for. Null whenever nothing is being aimed.
  const [curateTargeting, setCurateTargeting] = useState(null);
  // a selected lane is stored by its endpoint pair, not its index — gate
  // flux splices w.edges, so indices are not stable across years
  const [selEdge, setSelEdge] = useState(null);
  const [sideTab, setSideTab] = useState("system");
  // the system inspector's sub-tab lives here (not in SystemPanel) so the
  // guided tour can watch it and steer it
  const [sysSub, setSysSub] = useState("overview");
  // the interaction contract (docs/PRODUCT.md): "observe" watches the galaxy
  // run itself; "curate" adds the intervention instruments — nothing more
  const [mode, setMode] = useState("observe");
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
  // the guided first session: null, or {i: step index, entry: snapshot taken
  // when the step began (so "change the speed" means "since this step")}
  const [tut, setTut] = useState(null);
  const [tutFlags, setTutFlags] = useState({ factionOpened: false, eventFollowed: false });

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // ---- the guided tour (skippable, replayable from the top bar) ----
  const tutEntry = useCallback((spd) => ({
    speed: spd,
    commands: worldRef.current?.commands?.length || 0,
  }), []);
  const startTutorial = useCallback((spd) => {
    markTutorialSeen();
    setTutFlags({ factionOpened: false, eventFollowed: false });
    setTut({ i: 0, entry: tutEntry(spd) });
  }, [tutEntry]);
  const endTutorial = useCallback(() => setTut(null), []);
  const tutStep = useCallback((di, spd) => {
    setTut((t) => {
      if (!t) return t;
      const i = t.i + di;
      if (i >= TUT_STEPS.length) return null; // finished
      return { i: Math.max(0, i), entry: tutEntry(spd) };
    });
  }, [tutEntry]);

  // leaving Curate mode closes the curator tab it owns
  const switchMode = useCallback((m) => {
    setMode(m);
    if (m === "observe") setSideTab((t) => (t === "curate" ? "system" : t));
  }, []);

  // rotating autosave: once the clock has advanced a full interval past the
  // last one, snapshot the live world (best-effort — never interrupts play)
  const maybeAutosave = useCallback((w) => {
    if (!w) return;
    if (w.year - lastAutoRef.current < AUTOSAVE_EVERY) return;
    lastAutoRef.current = w.year;
    safeAutosave(w);
  }, []);

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
  const begin = useCallback((newSeed, newCfg, opts) => {
    setSetupOpen(false);
    setSpeed(0);
    setSeed(newSeed);
    setCfg(newCfg);
    setSelected(null);
    setSelEdge(null);
    setSideTab("system");
    setSysSub("overview");
    setScreen(null);
    setFacFilter("all");
    setFocusYear(null);
    if (opts?.tutorial) startTutorial(0); else endTutorial();
    const w = genGalaxy(newSeed, newCfg);
    worldRef.current = w;
    lastAutoRef.current = w.year;
    const burnY = Math.round(newCfg.burnYears);
    // start the autosave clock from the end of the pre-history burn, so the
    // first autosave lands a full interval into live play, not on year one
    const armAutosave = () => { lastAutoRef.current = worldRef.current?.year ?? 0; };
    if (burnY > 0) runBurn(w, burnY, () => { armAutosave(); setSpeed(1); });
    else { armAutosave(); setSpeed(1); bump(); }
  }, [runBurn, bump, startTutorial, endTutorial]);

  // install a loaded galaxy (from a slot id, or an already-parsed world from a
  // file import) in place of the running one. May throw (bad/newer save) — the
  // Saves panel catches and surfaces the message.
  const loadGame = useCallback((id, preloaded) => {
    const w = preloaded || loadWorld(id);
    setSpeed(0);
    setSetupOpen(false);
    setSeed(w.seed);
    setCfg(w.cfg);
    setSelected(null);
    setSelEdge(null);
    setSideTab("system");
    setSysSub("overview");
    setScreen(null);
    setFacFilter("all");
    setFocusYear(null);
    setBurn(null);
    endTutorial();
    worldRef.current = w;
    lastAutoRef.current = w.year;
    bump();
  }, [bump, endTutorial]);

  // sim clock — render rate capped at 10/s; higher speeds batch years per tick
  useEffect(() => {
    if (!speed || burn) return;
    const yearsPerTick = Math.max(1, Math.round(speed / 10));
    const iv = setInterval(() => {
      if (worldRef.current) {
        for (let i = 0; i < yearsPerTick; i++) simulateYear(worldRef.current);
        maybeAutosave(worldRef.current);
        bump();
      }
    }, 1000 / Math.min(speed, 10));
    return () => clearInterval(iv);
  }, [speed, burn, bump, maybeAutosave]);

  // Esc closes an open full-screen panel
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setScreen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the tour's "follow an event" step also accepts opening the chronicle
  // directly — latch it so esc-ing back out doesn't undo the deed
  useEffect(() => {
    if (tut && screen === "chronicle") {
      setTutFlags((f) => (f.eventFollowed ? f : { ...f, eventFollowed: true }));
    }
  }, [tut, screen]);

  const w = worldRef.current;
  const liveSystems = w ? w.systems.filter((s) => s.pop > 0.05) : [];
  const totalPop = liveSystems.reduce((a, s) => a + s.pop, 0);
  const liveFactions = w ? w.factions.filter((f) => !f.dead) : [];
  const wars = w
    ? Object.entries(w.relations).filter(([, r]) => r.war).map(([k, r]) => ({ k, r }))
    : [];
  const sel = w && selected !== null ? w.systems[selected] : null;
  // resolve the selected lane's endpoints back to a live edge index each
  // render — it stays valid even after gate flux reshuffles w.edges
  const selEdgeIdx = w && selEdge
    ? w.edges.findIndex((e) =>
      (e.a === selEdge.a && e.b === selEdge.b) || (e.a === selEdge.b && e.b === selEdge.a))
    : -1;

  // selecting a system closes any full-screen panel, opens the side
  // inspector, AND flies the camera there
  const openSystem = useCallback((id) => {
    setSelected(id);
    setSelEdge(null);
    if (id !== null) {
      setScreen(null);
      setSideTab("system");
      mapApi.current?.focus(id);
    }
  }, []);

  // plain map clicks select without yanking the camera around
  const selectOnMap = useCallback((id) => {
    setSelected(id);
    if (id !== null) { setSelEdge(null); setSideTab("system"); }
  }, []);

  // selecting a lane: remember its endpoints, drop any system selection,
  // and bring the inspection window forward
  const selectRoute = useCallback((ei) => {
    const wd = worldRef.current;
    if (!wd || !wd.edges[ei]) return;
    const e = wd.edges[ei];
    setSelEdge({ a: e.a, b: e.b });
    setSelected(null);
    setScreen(null);
    setSideTab("system");
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
        mode={mode}
        setMode={switchMode}
        onCentury={() => w && !burn && runBurn(w, 100, () => maybeAutosave(worldRef.current))}
        onNewGalaxy={() => { setSpeed(0); setSetupOpen(true); }}
        onTour={() => startTutorial(speed)}
        touring={!!tut}
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
            selectedEdge={selEdgeIdx >= 0 ? selEdgeIdx : null}
            onSelectRoute={selectRoute}
            overlay={overlay}
            setOverlay={setOverlay}
            burn={burn}
            mapApi={mapApi}
            targeting={mode === "curate" ? curateTargeting : null}
          />
          {w && !burn && (
            <Ticker
              worldRef={worldRef}
              onOpen={(ev) => {
                setTutFlags((f) => (f.eventFollowed ? f : { ...f, eventFollowed: true }));
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
            {SIDE_TABS.filter((t) => !t.curateOnly || mode === "curate").map(({ key, glyph }) => {
              const isRoute = key === "system" && !!selEdge;
              return (
                <button key={key} onClick={() => setSideTab(key)} className={`navtab${sideTab === key ? " on" : ""}`}>
                  <span className="glyph">{isRoute ? "⇌" : glyph}</span>
                  {isRoute ? "route" : key}
                </button>
              );
            })}
          </nav>
          <div className="flex-1 overflow-y-auto p-4 text-xs" style={{ lineHeight: 1.6 }}>
            {sideTab === "system" && (
              selEdge
                ? (selEdgeIdx >= 0
                  ? <RoutePanel w={w} ei={selEdgeIdx} onOpenSystem={openSystem} />
                  : <div className="muted italic leading-relaxed">This jumpgate lane has since collapsed — its stars drift apart on the map. Pick another lane or a system to inspect.</div>)
                : <SystemPanel w={w} sel={sel} sub={sysSub} onSub={setSysSub} />
            )}
            {sideTab === "factions" && w && (
              <FactionsPanel
                w={w} liveFactions={liveFactions} wars={wars} onOpenSystem={openSystem}
                onInspect={() => setTutFlags((f) => (f.factionOpened ? f : { ...f, factionOpened: true }))}
              />
            )}
            {sideTab === "curate" && w && mode === "curate" && !burn && (
              <CuratorPanel w={w} selected={selected} onApplied={bump} onTargeting={setCurateTargeting} />
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
                {screen === "diplomacy" && <DiplomacyPanel w={w} liveFactions={liveFactions} onOpenSystem={openSystem} />}
                {screen === "wars" && <WarsPanel w={w} wars={wars} onOpenSystem={openSystem} />}
                {screen === "trade" && <TradePanel w={w} onOpenSystem={openSystem} />}
                {screen === "market" && <MarketPanel w={w} liveSystems={liveSystems} onOpenSystem={openSystem} />}
                {screen === "galaxy" && <GalaxyPanel w={w} />}
                {screen === "saves" && <SavesPanel world={w} onLoad={loadGame} />}
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

        {/* the guided first session floats above everything (including the
            full-screen panels, so it survives a trip into the chronicle) */}
        {tut && w && !burn && (
          <TutorialOverlay
            w={w}
            step={tut.i}
            entry={tut.entry}
            flags={tutFlags}
            sel={sel}
            sideTab={sideTab}
            sysSub={sysSub}
            speed={speed}
            mode={mode}
            screen={screen}
            actions={{ openSystem, setSideTab, setSysSub, setSpeed, setMode: switchMode, setScreen }}
            onNext={() => tutStep(1, speed)}
            onBack={() => tutStep(-1, speed)}
            onSkip={endTutorial}
          />
        )}
      </div>
    </div>
  );
}
