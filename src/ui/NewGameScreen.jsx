import { useState } from "react";
import { CONFIG_GROUPS, PRESETS, defaultConfig } from "../sim/config.js";

// ---------- the founding screen ----------
// Renders itself from CONFIG_GROUPS in sim/config.js: every knob the
// engine reads appears here automatically, grouped and explained.

const fmtVal = (p, v) => {
  if (p.kind === "mult") return v === 0 ? "off" : `×${(+v).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}`;
  if (p.kind === "pct") return `${Math.round(v)}%`;
  return `${Math.round(v)}`;
};

function Param({ p, value, onChange }) {
  const changed = Math.abs(value - p.def) > 1e-9;
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

export default function NewGameScreen({ initialSeed, initialCfg, canCancel, onBegin, onCancel }) {
  const [seed, setSeed] = useState(String(initialSeed));
  const [cfg, setCfg] = useState({ ...defaultConfig(), ...(initialCfg || {}) });
  const [preset, setPreset] = useState(null);

  const set = (key, v) => {
    setCfg((c) => ({ ...c, [key]: v }));
    setPreset(null); // hand-tuning leaves the preset
  };
  const applyPreset = (p) => {
    setCfg({ ...defaultConfig(), ...p.overrides });
    setPreset(p.key);
  };
  const seedNum = () => {
    const n = parseInt(seed, 10);
    return Number.isFinite(n) ? Math.abs(n) % 1e9 : Math.floor(Math.random() * 1e6);
  };
  const reroll = () => setSeed(String(Math.floor(Math.random() * 1e6)));

  const settledCount = Math.max(4, Math.round(cfg.systems * (cfg.settled / 100)));
  const summary =
    `${Math.round(cfg.systems)} systems · ${settledCount} settled · ` +
    `${Math.min(Math.round(cfg.factions), settledCount)} powers · ${Math.round(cfg.houses)} houses · ` +
    (cfg.burnYears > 0 ? `${Math.round(cfg.burnYears)} years of history before you arrive` : "you arrive at the founding");

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

        <div className="sec-head"><span>named galaxies</span><span className="sec-rule" /></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-7">
          {PRESETS.map((p) => (
            <button key={p.key} className={`preset${preset === p.key ? " on" : ""}`} onClick={() => applyPreset(p)}>
              <div className="display" style={{ fontWeight: 600, fontSize: 11, color: preset === p.key ? "var(--amber)" : "var(--text)" }}>
                {p.name}
              </div>
              <div className="faint" style={{ fontSize: 10, lineHeight: 1.5 }}>{p.blurb}</div>
            </button>
          ))}
        </div>

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

        <div
          className="flex items-center gap-4 flex-wrap mt-6 pt-4"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <div className="muted">{summary}</div>
          <div className="flex-1" />
          {canCancel && (
            <button className="btn" onClick={onCancel}>cancel — back to the living galaxy</button>
          )}
          <button
            className="display px-5 py-2.5 rounded-lg"
            style={{ background: "var(--amber)", color: "#0a0e16", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", cursor: "pointer" }}
            onClick={() => onBegin(seedNum(), cfg)}
          >
            ▶ BEGIN THE CHRONICLE
          </button>
        </div>
      </div>
    </div>
  );
}
