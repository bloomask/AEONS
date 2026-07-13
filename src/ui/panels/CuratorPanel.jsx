import { useState } from "react";
import {
  INTERVENTIONS, INTERVENTION_BY_KEY,
  previewIntervention, applyIntervention,
} from "../../sim/interventions.js";
import { Section } from "../widgets.jsx";

// ---------------------------------------------------------------------------
// The curator's instruments — the Curate half of the product contract
// (docs/PRODUCT.md). Renders the intervention definitions from
// sim/interventions.js: pick an act, pick its target(s), read the anticipated
// pressure, confirm (twice, if it breaks things), and the act is applied,
// chronicled, and recorded to the world's command ledger.
// ---------------------------------------------------------------------------

// resolve each field's live options in order; a stale selection (the world
// moved on under it) counts as unset, and later fields wait for earlier ones
function resolveFields(w, def, params) {
  const out = [];
  const sofar = {};
  for (const f of def.fields) {
    const opts = f.options(w, sofar);
    const chosen = opts.find((o) => String(o.v) === String(params[f.key]));
    out.push({ field: f, opts, value: chosen ? chosen.v : null });
    if (!chosen) break; // downstream pickers depend on this one
    sofar[f.key] = chosen.v;
  }
  return { fields: out, complete: out.length === def.fields.length && out.every((r) => r.value !== null), sofar };
}

function FieldPicker({ r, onChange }) {
  return (
    <label className="block mb-2">
      <div className="faint mb-0.5" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9 }}>
        {r.field.label}
      </div>
      <select
        className="w-full"
        value={r.value === null ? "" : String(r.value)}
        onChange={(e) => onChange(r.field.key, e.target.value)}
        style={{
          background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)",
          borderRadius: 6, padding: "4px 6px", fontSize: 12,
        }}
      >
        <option value="" disabled>— choose —</option>
        {r.opts.map((o) => (
          <option key={String(o.v)} value={String(o.v)}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function CuratorPanel({ w, selected, onApplied }) {
  const [key, setKey] = useState(null);
  const [params, setParams] = useState({});
  const [armed, setArmed] = useState(false); // destructive acts confirm twice
  const [flash, setFlash] = useState(null);  // what the last act wrote

  const def = key ? INTERVENTION_BY_KEY[key] : null;

  const choose = (k) => {
    const d = INTERVENTION_BY_KEY[k];
    // pre-aim the first world-picker at the selected system when it qualifies
    const p = {};
    if (selected !== null && d.fields.length) {
      const opts = d.fields[0].options(w, {});
      if (opts.some((o) => o.v === selected)) p[d.fields[0].key] = selected;
    }
    setKey(k); setParams(p); setArmed(false); setFlash(null);
  };

  const setField = (fk, v) => {
    // keep raw string values; the sim coerces. Clear downstream picks.
    const idx = def.fields.findIndex((f) => f.key === fk);
    const next = {};
    def.fields.slice(0, idx).forEach((f) => { next[f.key] = params[f.key]; });
    next[fk] = v;
    setParams(next); setArmed(false); setFlash(null);
  };

  if (!def) {
    return (
      <div className="space-y-4">
        <div className="muted italic leading-relaxed">
          The curator's instruments. Each act presses on a mechanic the galaxy
          already lives by — the engine, not the hand, decides what follows.
          Every act is chronicled and entered in the command ledger.
        </div>
        <Section title="instruments">
          {INTERVENTIONS.map((d) => (
            <div key={d.key} className="rowbtn mb-1" onClick={() => choose(d.key)} title={d.blurb}>
              <div className="flex items-center gap-2">
                <span style={{ color: d.destructive ? "var(--red)" : "var(--amber)", width: 16, textAlign: "center" }}>{d.glyph}</span>
                <b>{d.label}</b>
                {d.destructive && (
                  <span className="ml-auto faint" style={{ color: "var(--red)", fontSize: 9, letterSpacing: "0.08em" }}>
                    DESTRUCTIVE
                  </span>
                )}
              </div>
              <div className="muted">{d.blurb}</div>
            </div>
          ))}
        </Section>
        <Ledger w={w} />
      </div>
    );
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
      <button onClick={() => { setKey(null); setFlash(null); }} className="text-xs link" style={{ color: "var(--cyan)" }}>
        ← all instruments
      </button>

      <div>
        <div className="display" style={{ fontWeight: 700, fontSize: 14, color: def.destructive ? "var(--red)" : "var(--amber)" }}>
          {def.glyph} {def.label}
        </div>
        <div className="muted">{def.blurb}</div>
      </div>

      <Section title="target">
        {fields.map((r) => <FieldPicker key={r.field.key} r={r} onChange={setField} />)}
        {fields.length > 0 && fields[0].opts.length === 0 && (
          <div className="muted italic">The galaxy offers no valid target for this act right now.</div>
        )}
      </Section>

      {pv && (
        <Section title="anticipated pressure">
          {pv.ok ? (
            pv.lines.map((line, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <span style={{ color: line.startsWith("⚠") ? "var(--red)" : "var(--amber)" }}>▸</span>
                <span className="muted">{line}</span>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--red)" }}>{pv.error}</div>
          )}
          <div className="faint italic mt-2" style={{ fontSize: 10 }}>
            These are the pressures applied, not promises — the simulation decides what follows.
          </div>
        </Section>
      )}

      {complete && pv?.ok && (
        <div>
          {def.destructive && armed && (
            <div className="mb-2 p-2 rounded-lg" style={{ background: "rgba(228,87,46,0.08)", border: "1px solid rgba(228,87,46,0.4)", color: "var(--red)" }}>
              This cannot be undone, and people will suffer for it. Confirm?
            </div>
          )}
          <button
            className="btn w-full"
            onClick={doApply}
            style={def.destructive
              ? { color: "var(--red)", borderColor: "rgba(228,87,46,0.5)" }
              : { color: "var(--amber)" }}
          >
            {def.destructive ? (armed ? `⚠ confirm — ${def.label.toLowerCase()}` : `${def.glyph} ${def.label.toLowerCase()}…`) : `${def.glyph} ${def.label.toLowerCase()}`}
          </button>
          {def.destructive && armed && (
            <button className="btn w-full mt-1" onClick={() => setArmed(false)}>stay the hand</button>
          )}
        </div>
      )}

      {flash && (
        <div className="p-2 rounded-lg" style={{ background: "rgba(232,209,75,0.06)", border: "1px solid rgba(232,209,75,0.3)" }}>
          {flash.err
            ? <span style={{ color: "var(--red)" }}>{flash.err}</span>
            : (
              <>
                <div className="italic" style={{ color: "var(--gold)" }}>{flash.text}</div>
                <div className="faint mt-1" style={{ fontSize: 10 }}>
                  recorded — command #{flash.rec.i}, year {flash.rec.year}
                </div>
              </>
            )}
        </div>
      )}

      <Ledger w={w} />
    </div>
  );
}

// the deterministic command record, newest first — the proof of the hand
function Ledger({ w }) {
  const cmds = w.commands || [];
  if (!cmds.length) return null;
  return (
    <Section title="command ledger" right={<span className="faint">{cmds.length} act{cmds.length > 1 ? "s" : ""}</span>}>
      {cmds.slice(-8).reverse().map((c) => (
        <div key={c.i} className="mb-0.5 flex gap-2.5 muted">
          <span style={{ color: "var(--amber)", minWidth: 34 }}>{c.year}</span>
          <span>#{c.i} · {INTERVENTION_BY_KEY[c.key]?.label ?? c.key}</span>
        </div>
      ))}
    </Section>
  );
}
