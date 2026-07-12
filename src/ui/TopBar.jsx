import { fmtPop } from "./format.js";
import { SCREENS } from "./theme.js";

const Vital = ({ label, value, color }) => (
  <div className="vital">
    <div className="vital-v" style={color ? { color } : undefined}>{value}</div>
    <div className="vital-l">{label}</div>
  </div>
);

// The command bar: brand · galaxy vitals · full-screen panel toggles ·
// era · the clock · transport. The year is the hero readout; the four
// screen buttons each summon a full-screen panel (toggle to dismiss).
export default function TopBar({
  seed, year, speed, setSpeed, onCentury, onNewGalaxy,
  screen, setScreen, w, liveSystems, totalPop, liveFactions, wars,
}) {
  const ruins = w ? w.systems.filter((s) => s.ruined).length : 0;
  const fallen = w ? w.factions.length - liveFactions.length : 0;
  return (
    <header
      className="flex items-center gap-x-4 gap-y-2 px-4 py-2 flex-wrap"
      style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)", position: "relative", zIndex: 40 }}
    >
      <div className="flex items-baseline gap-2">
        <div className="display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.22em", color: "var(--bright)" }}>
          <span style={{ color: "var(--amber)" }}>◈</span> AEONS
        </div>
        <div className="faint" style={{ fontSize: 10 }}>seed {seed}</div>
      </div>

      {w && (
        <div className="flex items-center gap-4 flex-wrap">
          <Vital label="systems" value={`${liveSystems.length}/${w.systems.length}`} />
          <Vital label="ruins" value={ruins} color={ruins ? "#B0453A" : undefined} />
          <Vital label="population" value={fmtPop(totalPop)} />
          <Vital label="powers" value={fallen ? `${liveFactions.length} · ${fallen}†` : liveFactions.length} />
          <Vital label="wars" value={wars.length} color={wars.length ? "var(--red)" : undefined} />
        </div>
      )}

      <div className="seg" style={{ fontFamily: "var(--font-display)" }}>
        {Object.entries(SCREENS).map(([key, s]) => (
          <button
            key={key}
            className={screen === key ? "on" : ""}
            onClick={() => setScreen(screen === key ? null : key)}
            title={s.title}
            style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}
          >
            {s.glyph} {key}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {w && (
        <div className="text-right hidden lg:block">
          <div className="italic" style={{ color: "var(--amber)", fontSize: 11, opacity: 0.85 }}>{w.era.name}</div>
        </div>
      )}
      <div className="display" style={{ fontWeight: 700, fontSize: 19, color: "var(--amber)", letterSpacing: "0.04em" }}>
        {typeof year === "number" ? `YEAR ${year}` : "—"}
      </div>

      <div className="seg">
        <button className={speed === 0 ? "on" : ""} onClick={() => setSpeed(0)} title="Pause">⏸</button>
        <button className={speed === 1 ? "on" : ""} onClick={() => setSpeed(1)} title="1 yr/s">▶</button>
        <button className={speed === 5 ? "on" : ""} onClick={() => setSpeed(5)} title="5 yr/s">▶▶</button>
        <button className={speed === 20 ? "on" : ""} onClick={() => setSpeed(20)} title="20 yr/s">▶▶▶</button>
        <button onClick={onCentury} title="Fast-forward a century">+100y</button>
      </div>
      <button className="btn" onClick={onNewGalaxy} title="Found a new galaxy">↻ new</button>
    </header>
  );
}
