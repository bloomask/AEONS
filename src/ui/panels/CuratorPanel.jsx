import { useEffect, useState } from "react";
import {
  INTERVENTIONS, INTERVENTION_BY_KEY, FACTION_PRESETS, CURATED_FACTION_COLORS,
  previewIntervention, applyIntervention,
} from "../../sim/interventions.js";
import { GOVS } from "../../sim/constants.js";
import { Section } from "../widgets.jsx";

function resolveFields(w, def, params) {
  const out = [];
  const sofar = {};
  for (const f of def.fields) {
    const opts = f.options(w, sofar);
    const chosen = opts.find((o) => String(o.v) === String(params[f.key]));
    out.push({ field: f, opts, value: chosen ? chosen.v : null, chosen });
    if (!chosen) break;
    sofar[f.key] = chosen.v;
  }
  return { fields: out, complete: out.length === def.fields.length && out.every((r) => r.value !== null) };
}

const fieldCaption = (r) => r.chosen?.label || "No target selected";

function ChoicePicker({ r, onChange }) {
  return (
    <div className="mb-3">
      <div className="faint mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9 }}>
        {r.field.label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {r.opts.map((o) => (
          <button key={String(o.v)} className={`chip${String(r.value) === String(o.v) ? " on" : ""}`} onClick={() => onChange(r.field.key, o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TargetPicker({ r, active, onSelect }) {
  return (
    <div className="mb-3">
      <div className="faint mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9 }}>
        {r.field.label}
      </div>
      <button className={`rowbtn w-full${active ? " on" : ""}`} onClick={onSelect} disabled={!r.opts.length}>
        <div className="flex items-center gap-2">
          <span style={{ color: active ? "var(--cyan)" : "var(--amber)" }}>{r.field.mapKind === "edge" ? "\u21cc" : "\u2299"}</span>
          <b>{active ? "Selection active" : r.value === null ? "Select on map" : "Change selection"}</b>
        </div>
        <div className="muted">{r.opts.length ? fieldCaption(r) : "No valid target exists right now."}</div>
      </button>
    </div>
  );
}

function Setting({ label, value, min, max, step, format, onChange }) {
  return (
    <label className="block mb-3">
      <div className="flex items-baseline gap-2">
        <span>{label}</span>
        <span className="ml-auto display muted">{format(value)}</span>
      </div>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

function FactionFounder({ w, selectionMode, onRequestSelection, onCancelSelection, onApplied, onBack }) {
  const [presetKey, setPresetKey] = useState(FACTION_PRESETS[0].key);
  const [values, setValues] = useState({ ...FACTION_PRESETS[0].values });
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => CURATED_FACTION_COLORS[w.nextFid % CURATED_FACTION_COLORS.length]);
  const [advanced, setAdvanced] = useState(false);
  const [flash, setFlash] = useState(null);
  const empty = INTERVENTION_BY_KEY.foundFaction.fields[0].options(w, {});

  const applyPreset = (p) => {
    setPresetKey(p.key);
    setValues({ ...p.values });
    setFlash(null);
  };
  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setPresetKey(null);
    setFlash(null);
  };
  const beginPlacement = () => {
    const validSystemIds = empty.map((o) => Number(o.v));
    onRequestSelection({
      ownerKey: "foundFaction", fieldKey: "sysId", kind: "system", validSystemIds,
      prompt: "Choose an uncolonised system to found this faction",
    }, ({ id }) => {
      const params = { sysId: id, name, color, ...values };
      const res = applyIntervention(w, "foundFaction", params);
      if (!res.ok) setFlash({ err: res.error });
      else {
        const ev = w.events[w.events.length - 1];
        setFlash({ text: ev?.s, rec: res.record });
        onApplied();
      }
    });
  };

  const active = selectionMode?.ownerKey === "foundFaction";
  return (
    <div className="space-y-4">
      <button onClick={() => { onCancelSelection(); onBack(); }} className="text-xs link" style={{ color: "var(--cyan)" }}>
        {"\u2190"} all instruments
      </button>
      <div>
        <div className="display" style={{ fontWeight: 700, fontSize: 14, color: "var(--amber)" }}>{"\u2691"} Start a new faction</div>
        <div className="muted">Shape a new power, then choose the empty system where its first settlement will rise.</div>
      </div>

      <Section title="faction preset">
        <div className="space-y-1.5">
          {FACTION_PRESETS.map((p) => (
            <button key={p.key} className={`preset w-full text-left${presetKey === p.key ? " on" : ""}`} onClick={() => applyPreset(p)}>
              <b>{p.name}</b>
              <div className="faint">{p.blurb}</div>
            </button>
          ))}
        </div>
      </Section>

      <div>
        <label className="block mb-1 faint" htmlFor="faction-name">Faction name</label>
        <input
          id="faction-name" value={name} maxLength={48}
          onChange={(e) => setName(e.target.value)} placeholder="Derived from the founding system"
          className="w-full px-2 py-1.5 rounded-md"
          style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)" }}
        />
      </div>

      <button className="btn" onClick={() => setAdvanced((v) => !v)}>{advanced ? "\u25be" : "\u25b8"} advanced settings</button>
      {advanced && (
        <div className="card p-3">
          <div className="faint mb-1 uppercase" style={{ fontSize: 9 }}>government</div>
          <div className="seg mb-3">
            {["republic", "empire", "corporate"].map((gov) => (
              <button key={gov} className={values.gov === gov ? "on" : ""} onClick={() => set("gov", gov)}>{GOVS[gov].label}</button>
            ))}
          </div>
          <div className="faint mb-1 uppercase" style={{ fontSize: 9 }}>flag colour</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {CURATED_FACTION_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} title={c} aria-label={`Use ${c}`} style={{ width: 22, height: 22, background: c, border: color === c ? "2px solid var(--bright)" : "1px solid var(--line)", borderRadius: 4 }} />
            ))}
          </div>
          <Setting label="starting population" value={values.pop} min={1} max={20} step={0.5} format={(v) => `${v.toFixed(1)}M`} onChange={(v) => set("pop", v)} />
          <Setting label="development" value={values.dev} min={0.5} max={1.5} step={0.05} format={(v) => `\u00d7${v.toFixed(2)}`} onChange={(v) => set("dev", v)} />
          <Setting label="treasury" value={values.treasury} min={20} max={300} step={10} format={(v) => `${v} cr`} onChange={(v) => set("treasury", v)} />
          <Setting label="stability" value={values.stability} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("stability", v)} />
          <Setting label="aggression" value={values.aggr} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("aggr", v)} />
          <Setting label="expansionism" value={values.expans} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("expans", v)} />
          <Setting label="tariff" value={values.tariff} min={0} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("tariff", v)} />
        </div>
      )}

      <button className={`btn w-full${active ? " on" : ""}`} onClick={active ? onCancelSelection : beginPlacement} disabled={!empty.length} style={{ color: "var(--amber)" }}>
        {active ? "Cancel map selection" : empty.length ? "\u2299 Select founding system" : "No uncolonised systems available"}
      </button>
      {active && <div className="muted italic">The next valid system you click will immediately raise this faction's flag.</div>}
      <Flash flash={flash} />
    </div>
  );
}

function Flash({ flash }) {
  if (!flash) return null;
  return (
    <div className="p-2 rounded-lg" style={{ background: "rgba(232,209,75,0.06)", border: "1px solid rgba(232,209,75,0.3)" }}>
      {flash.err ? <span style={{ color: "var(--red)" }}>{flash.err}</span> : (
        <>
          <div className="italic" style={{ color: "var(--gold)" }}>{flash.text}</div>
          <div className="faint mt-1" style={{ fontSize: 10 }}>recorded - command #{flash.rec.i}, year {flash.rec.year}</div>
        </>
      )}
    </div>
  );
}

export default function CuratorPanel({ w, selected, selectionMode, onRequestSelection, onCancelSelection, onApplied }) {
  const [key, setKey] = useState(null);
  const [params, setParams] = useState({});
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState(null);
  const def = key ? INTERVENTION_BY_KEY[key] : null;

  useEffect(() => () => onCancelSelection(), [onCancelSelection]);

  const choose = (k) => {
    onCancelSelection();
    const d = INTERVENTION_BY_KEY[k];
    const p = {};
    if (selected !== null && d.fields.length && d.fields[0].mapKind === "system") {
      const opts = d.fields[0].options(w, {});
      if (opts.some((o) => Number(o.v) === selected)) p[d.fields[0].key] = selected;
    }
    setKey(k); setParams(p); setArmed(false); setFlash(null);
  };

  const setField = (fk, v) => {
    const idx = def.fields.findIndex((f) => f.key === fk);
    const next = {};
    def.fields.slice(0, idx).forEach((f) => { next[f.key] = params[f.key]; });
    next[fk] = v;
    setParams(next); setArmed(false); setFlash(null);
  };

  const requestField = (r) => {
    const base = { ownerKey: def.key, fieldKey: r.field.key };
    if (r.field.mapKind === "edge") {
      onRequestSelection({ ...base, kind: "edge", validEdgeKeys: r.opts.map((o) => String(o.v)), prompt: `Select ${r.field.label} on the map` }, ({ edgeKey }) => setField(r.field.key, edgeKey));
      return;
    }
    if (r.field.mapKind === "project") {
      const bySystem = new Map(r.opts.map((o) => [w.projects[Number(o.v)]?.sysId, o.v]));
      onRequestSelection({ ...base, kind: "system", validSystemIds: [...bySystem.keys()], prompt: "Select the system hosting the project" }, ({ id }) => setField(r.field.key, bySystem.get(id)));
      return;
    }
    if (r.field.mapKind === "factionPair") {
      const pairs = r.opts.map((o) => ({ option: o, ids: String(o.v).split("|").map(Number) }));
      const firstFids = [...new Set(pairs.flatMap((p) => p.ids))];
      const idsFor = (fids) => w.systems.filter((s) => s.pop > 0.05 && fids.includes(s.fid)).map((s) => s.id);
      onRequestSelection({ ...base, kind: "system", validSystemIds: idsFor(firstFids), prompt: "Select a system belonging to the first faction" }, ({ id }) => {
        const first = w.systems[id].fid;
        const matching = pairs.filter((p) => p.ids.includes(first));
        const secondFids = matching.map((p) => p.ids.find((fid) => fid !== first));
        onRequestSelection({ ...base, kind: "system", validSystemIds: idsFor(secondFids), prompt: `Select the other faction opposite ${w.factions[first].name}` }, ({ id: secondId }) => {
          const second = w.systems[secondId].fid;
          const match = matching.find((p) => p.ids.includes(second));
          if (match) setField(r.field.key, match.option.v);
        });
      });
      return;
    }
    onRequestSelection({ ...base, kind: "system", validSystemIds: r.opts.map((o) => Number(o.v)), prompt: `Select ${r.field.label} on the map` }, ({ id }) => setField(r.field.key, id));
  };

  if (!def) {
    return (
      <div className="space-y-4">
        <div className="muted italic leading-relaxed">Each instrument presses on a mechanic the galaxy already lives by. Every act is chronicled and entered in the command ledger.</div>
        <Section title="instruments">
          {INTERVENTIONS.map((d) => (
            <button key={d.key} className="rowbtn mb-1 w-full text-left" onClick={() => choose(d.key)} title={d.blurb}>
              <div className="flex items-center gap-2">
                <span style={{ color: d.destructive ? "var(--red)" : "var(--amber)", width: 16, textAlign: "center" }}>{d.glyph}</span>
                <b>{d.label}</b>
                {d.destructive && <span className="ml-auto faint" style={{ color: "var(--red)", fontSize: 9 }}>DESTRUCTIVE</span>}
              </div>
              <div className="muted">{d.blurb}</div>
            </button>
          ))}
        </Section>
        <Ledger w={w} />
      </div>
    );
  }

  if (def.key === "foundFaction") {
    return <FactionFounder w={w} selectionMode={selectionMode} onRequestSelection={onRequestSelection} onCancelSelection={onCancelSelection} onApplied={onApplied} onBack={() => setKey(null)} />;
  }

  const { fields, complete } = resolveFields(w, def, params);
  const pv = complete ? previewIntervention(w, def.key, params) : null;
  const doApply = () => {
    if (def.destructive && !armed) { setArmed(true); return; }
    const res = applyIntervention(w, def.key, params);
    setArmed(false);
    if (!res.ok) { setFlash({ err: res.error }); return; }
    const ev = w.events[w.events.length - 1];
    setFlash({ text: ev?.s, rec: res.record });
    onApplied();
  };

  return (
    <div className="space-y-4">
      <button onClick={() => { onCancelSelection(); setKey(null); setFlash(null); }} className="text-xs link" style={{ color: "var(--cyan)" }}>{"\u2190"} all instruments</button>
      <div>
        <div className="display" style={{ fontWeight: 700, fontSize: 14, color: def.destructive ? "var(--red)" : "var(--amber)" }}>{def.glyph} {def.label}</div>
        <div className="muted">{def.blurb}</div>
      </div>
      <Section title="target">
        {fields.map((r) => r.field.mapKind
          ? <TargetPicker key={r.field.key} r={r} active={selectionMode?.ownerKey === def.key && selectionMode?.fieldKey === r.field.key} onSelect={() => requestField(r)} />
          : <ChoicePicker key={r.field.key} r={r} onChange={setField} />)}
      </Section>
      {pv && (
        <Section title="anticipated pressure">
          {pv.ok ? pv.lines.map((line, i) => <div key={i} className="mb-1 flex gap-2"><span style={{ color: line.startsWith("\u26a0") ? "var(--red)" : "var(--amber)" }}>{"\u25b8"}</span><span className="muted">{line}</span></div>) : <div style={{ color: "var(--red)" }}>{pv.error}</div>}
          <div className="faint italic mt-2" style={{ fontSize: 10 }}>These are pressures, not promises. The simulation decides what follows.</div>
        </Section>
      )}
      {complete && pv?.ok && (
        <div>
          {def.destructive && armed && <div className="mb-2 p-2 rounded-lg" style={{ background: "rgba(228,87,46,0.08)", border: "1px solid rgba(228,87,46,0.4)", color: "var(--red)" }}>This cannot be undone. Confirm?</div>}
          <button className="btn w-full" onClick={doApply} style={{ color: def.destructive ? "var(--red)" : "var(--amber)" }}>
            {def.destructive ? (armed ? `Confirm - ${def.label.toLowerCase()}` : `${def.glyph} ${def.label.toLowerCase()}...`) : `${def.glyph} ${def.label.toLowerCase()}`}
          </button>
          {def.destructive && armed && <button className="btn w-full mt-1" onClick={() => setArmed(false)}>Stay the hand</button>}
        </div>
      )}
      <Flash flash={flash} />
      <Ledger w={w} />
    </div>
  );
}

function Ledger({ w }) {
  const cmds = w.commands || [];
  if (!cmds.length) return null;
  return (
    <Section title="command ledger" right={<span className="faint">{cmds.length} act{cmds.length > 1 ? "s" : ""}</span>}>
      {cmds.slice(-8).reverse().map((c) => (
        <div key={c.i} className="mb-0.5 flex gap-2.5 muted"><span style={{ color: "var(--amber)", minWidth: 34 }}>{c.year}</span><span>#{c.i} - {INTERVENTION_BY_KEY[c.key]?.label ?? c.key}</span></div>
      ))}
    </Section>
  );
}
