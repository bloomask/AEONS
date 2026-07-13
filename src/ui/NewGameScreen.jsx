import { useState } from "react";
import { CONFIG_GROUPS, CONFIG_PARAMS, PRESETS, defaultConfig, galaxyIntensity } from "../sim/config.js";
import { tutorialSeen } from "./tutorial.js";

// ---------- the founding screen ----------
// Quick Start first: begin a standard galaxy in one click, or pick a named
// preset — the two dozen individual knobs live behind "advanced galaxy
// settings" for players who want to hand-tune. Renders itself from
// CONFIG_GROUPS in sim/config.js: every knob the engine reads appears here
// automatically, grouped and explained.

const EPS = 1e-9;
const INTENSITY_COLOR = {
  peaceful: "var(--green)",
  temperate: "var(--cyan)",
  volatile: "var(--amber)",
  catastrophic: "var(--red)",
};

const fmtVal = (p, v) => {
  if (p.kind === "mult") return v === 0 ? "off" : `×${(+v).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}`;
  if (p.kind === "pct") return `${Math.round(v)}%`;
  return `${Math.round(v)}`;
};

const PARAM_BY_KEY = Object.fromEntries(CONFIG_PARAMS.map((p) => [p.key, p]));
const presetConfig = (p) => ({ ...defaultConfig(), ...p.overrides });
const sameConfig = (a, b) => CONFIG_PARAMS.every((p) => Math.abs(a[p.key] - b[p.key]) < EPS);

function IntensityChip({ cfg }) {
  const t = galaxyIntensity(cfg);
  return (
    <span
      className="display uppercase"
      title={t.blurb}
      style={{
        color: INTENSITY_COLOR[t.key],
        border: "1px solid currentcolor",
        borderRadius: 999,
        padding: "1px 8px",
        fontSize: 9,
        letterSpacing: "0.14em",
        whiteSpace: "nowrap",
      }}
    >
      {t.label}
    </span>
  );
}

function Param({ p, value, onChange }) {
  const changed = Math.abs(value - p.def) > EPS;
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2">
        <span>{p.label}</span>
        <span
          className="ml-auto display"
          style={{ fontWeight: 600, color: changed ? "var(--amber)" : "var(--muted)" }}
          title={changed ? `default ${fmtVal(p, p.def)}` : "at its default"}
        >
          {fmtVal(p, value)}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        min={p.min} max={p.max} step={p.step}
        value={value}
        onChange={(e) => onChange(p.key, +e.target.value)}
        onDoubleClick={() => onChange(p.key, p.def)}
        title="double-click to reset"
      />
      <div className="faint" style={{ fontSize: 10, lineHeight: 1.5 }}>{p.blurb}</div>
    </div>
  );
}

// what a preset changes against the Standard Model, in the params' own units
function overrideSummary(p) {
  const keys = Object.keys(p.overrides);
  if (!keys.length) return "the baseline itself — every knob at its classic value";
  return keys
    .map((k) => `${PARAM_BY_KEY[k].label} ${fmtVal(PARAM_BY_KEY[k], p.overrides[k])}`)
    .join(" · ");
}

function PresetComparison({ selectedKey }) {
  return (
    <div className="card p-4 mb-7 overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="faint text-left uppercase display" style={{ fontSize: 9, letterSpacing: "0.14em" }}>
            <th className="pb-2 pr-4">galaxy</th>
            <th className="pb-2 pr-4">intensity</th>
            <th className="pb-2">differs from the Standard Model</th>
          </tr>
        </thead>
        <tbody className="align-top">
          {PRESETS.map((p) => (
            <tr key={p.key} style={{ borderTop: "1px solid var(--line)" }}>
              <td className="py-2 pr-4 whitespace-nowrap">
                <span className="display" style={{ fontWeight: 600, color: selectedKey === p.key ? "var(--amber)" : "var(--text)" }}>
                  {p.name}
                </span>
              </td>
              <td className="py-2 pr-4"><IntensityChip cfg={presetConfig(p)} /></td>
              <td className="py-2 muted" style={{ lineHeight: 1.6 }}>{overrideSummary(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function NewGameScreen({ initialSeed, initialCfg, canCancel, onBegin, onCancel }) {
  const [seed, setSeed] = useState(String(initialSeed));
  const [cfg, setCfg] = useState({ ...defaultConfig(), ...(initialCfg || {}) });
  const [advanced, setAdvanced] = useState(false);
  const [compare, setCompare] = useState(false);
  // the tour offers itself to first-time founders; veterans opt back in
  const [tour, setTour] = useState(() => !tutorialSeen());

  // which named galaxy the current settings ARE, if any — derived, so
  // hand-tuning a preset's knob naturally turns it "custom"
  const matched = PRESETS.find((p) => sameConfig(cfg, presetConfig(p)));
  const changed = CONFIG_PARAMS.filter((p) => Math.abs(cfg[p.key] - p.def) > EPS);

  const set = (key, v) => setCfg((c) => ({ ...c, [key]: v }));
  const applyPreset = (p) => setCfg(presetConfig(p));
  const resetAll = () => setCfg(defaultConfig());

  const seedNum = () => {
    const n = parseInt(seed, 10);
    return Number.isFinite(n) ? Math.abs(n) % 1e9 : Math.floor(Math.random() * 1e6);
  };
  const reroll = () => setSeed(String(Math.floor(Math.random() * 1e6)));
  const begin = () => onBegin(seedNum(), cfg, { tutorial: tour });

  const beginLabel = matched
    ? (matched.key === "standard" ? "BEGIN STANDARD GALAXY" : `BEGIN — ${matched.name.toUpperCase()}`)
    : "BEGIN — CUSTOM GALAXY";

  const settledCount = Math.max(4, Math.round(cfg.systems * (cfg.settled / 100)));
  const summary =
    `${Math.round(cfg.systems)} systems · ${settledCount} settled · ` +
    `${Math.min(Math.round(cfg.factions), settledCount)} powers · ${Math.round(cfg.houses)} houses · ` +
    (cfg.burnYears > 0 ? `${Math.round(cfg.burnYears)} years of history before you arrive` : "you arrive at the founding");

  const BeginButton = () => (
    <button
      className="display px-5 py-2.5 rounded-lg"
      style={{ background: "var(--amber)", color: "#0a0e16", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", cursor: "pointer" }}
      onClick={begin}
    >
      ▶ {beginLabel}
    </button>
  );

  return (
    <div className="w-full h-screen overflow-y-auto" style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-ui)" }}>
      <div className="max-w-5xl mx-auto px-6 py-8 text-xs" style={{ lineHeight: 1.6 }}>
        <div className="flex items-end gap-4 flex-wrap mb-1">
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "0.22em", color: "var(--bright)" }}>
              <span style={{ color: "var(--amber)" }}>◈</span> AEONS
            </div>
            <div className="muted italic">Found a galaxy. Set its temperament. Watch it write its own chronicle.</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <label className="muted" htmlFor="seed">seed</label>
            <input
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
              className="px-2 py-1.5 rounded-md w-28"
              style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", fontFamily: "var(--font-ui)" }}
            />
            <button className="btn" onClick={reroll} title="Roll a new seed">⚄</button>
          </div>
        </div>
        <div className="faint mb-6">
          Every history is deterministic: the same seed and the same settings always produce the same galaxy, year for year.
        </div>

        {/* quick start — one click to a galaxy */}
        <div className="card p-5 mb-7" style={{ borderColor: "rgba(242,169,59,0.4)" }}>
          <div className="flex items-center gap-x-5 gap-y-3 flex-wrap">
            <BeginButton />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <IntensityChip cfg={cfg} />
                <span className="muted">{summary}</span>
              </div>
              <label className="flex items-center gap-2 mt-1.5 muted" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={tour} onChange={(e) => setTour(e.target.checked)} style={{ accentColor: "var(--amber)" }} />
                guide my first session — a five-minute tour of the bridge (skippable, replayable)
              </label>
            </div>
            {canCancel && (
              <button className="btn ml-auto" onClick={onCancel}>cancel — back to the living galaxy</button>
            )}
          </div>
        </div>

        <div className="sec-head">
          <span>named galaxies</span>
          <span className="sec-rule" />
          <button className={`chip${compare ? " on" : ""}`} onClick={() => setCompare((v) => !v)} title="What each named galaxy changes against the Standard Model">
            ⇆ compare
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {PRESETS.map((p) => {
            const on = matched?.key === p.key;
            return (
              <button key={p.key} className={`preset${on ? " on" : ""}`} onClick={() => applyPreset(p)}>
                <div className="flex items-baseline gap-2">
                  <div className="display" style={{ fontWeight: 600, fontSize: 11, color: on ? "var(--amber)" : "var(--text)" }}>
                    {p.name}
                  </div>
                  <span className="ml-auto"><IntensityChip cfg={presetConfig(p)} /></span>
                </div>
                <div className="faint" style={{ fontSize: 10, lineHeight: 1.5 }}>{p.blurb}</div>
              </button>
            );
          })}
        </div>
        {compare && <PresetComparison selectedKey={matched?.key} />}

        {/* the full knob wall, folded away until asked for */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button className="btn" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "▾" : "▸"} advanced galaxy settings
            {!matched && changed.length > 0 && (
              <span style={{ color: "var(--amber)" }}> · {changed.length} changed</span>
            )}
          </button>
          <button
            className="btn"
            onClick={resetAll}
            disabled={changed.length === 0}
            style={changed.length === 0 ? { opacity: 0.4, cursor: "default" } : undefined}
            title="Return every setting to the Standard Model"
          >
            ↺ reset all
          </button>
          {!matched && (
            <span className="faint italic">
              a custom galaxy — {changed.length} knob{changed.length !== 1 ? "s" : ""} off the standard
            </span>
          )}
        </div>

        {advanced && (
          <div className="grid md:grid-cols-2 gap-4">
            {CONFIG_GROUPS.map((g) => (
              <div key={g.key} className="card p-4">
                <div className="sec-head" style={{ marginBottom: 4 }}>
                  <span>{g.label}</span>
                  <span className="sec-rule" />
                </div>
                <div className="faint italic mb-3" style={{ fontSize: 10 }}>{g.blurb}</div>
                {g.params.map((p) => (
                  <Param key={p.key} p={p} value={cfg[p.key]} onChange={set} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div
          className="flex items-center gap-4 flex-wrap mt-6 pt-4"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <div className="muted flex items-center gap-2 flex-wrap">
            <IntensityChip cfg={cfg} />
            <span>{summary}</span>
          </div>
          <div className="flex-1" />
          {canCancel && (
            <button className="btn" onClick={onCancel}>cancel — back to the living galaxy</button>
          )}
          <BeginButton />
        </div>
      </div>
    </div>
  );
}
