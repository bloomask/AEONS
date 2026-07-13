import { useState, useRef, useCallback, useEffect } from "react";
import {
  INTERVENTIONS, INTERVENTION_BY_KEY,
  previewIntervention, applyIntervention,
} from "../../sim/interventions.js";
import { Section } from "../widgets.jsx";

// ---------------------------------------------------------------------------
// The curator's instruments — the Curate half of the product contract
// (docs/PRODUCT.md). Renders the intervention definitions from
// sim/interventions.js: pick an act, then aim it BY CLICKING THE TARGET ON THE
// MAP (a world, a jumpgate lane, a realm's territory), read the anticipated
// pressure, confirm (twice, if it breaks things), and the act is applied,
// chronicled, and recorded to the world's command ledger.
//
// Targeting is a conversation with the map. For each unfilled target field the
// panel lifts a "targeting request" up to the app (via `onTargeting`), which
// hands it to MapView: the valid targets light up, and a click on one fills
// the field. A faction pair is two clicks (first realm, then the second).
// ---------------------------------------------------------------------------

const ALIVE = 0.05;
// canonicalize a "a|b" edge/pair key so either endpoint order compares equal
const canon = (v) => {
  const [a, b] = String(v).split("|").map(Number);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

// resolve each field's live options in order; a stale selection (the world
// moved on under it) counts as unset, and later fields wait for earlier ones
function resolveFields(w, def, params) {
  const out = [];
  const sofar = {};
  for (const f of def.fields) {
    const opts = f.options(w, sofar);
    const chosen = opts.find((o) => String(o.v) === String(params[f.key]));
    out.push({ field: f, opts, value: chosen ? chosen.v : null, label: chosen ? chosen.label : null });
    if (!chosen) break; // downstream pickers depend on this one
    sofar[f.key] = chosen.v;
  }
  return { fields: out, complete: out.length === def.fields.length && out.every((r) => r.value !== null), sofar };
}

// The map elements a spatial field accepts, as the sets MapView highlights and
// hit-tests. `pick` decides the flavour:
//   system/project/faction → a set of SYSTEM ids (click a world / a territory)
//   edge                   → a set of canonical "a|b" lane keys (click a lane)
// For a faction pair, `pairFirst` (a fid, or null) splits the two clicks: with
// none chosen the valid realms are anyone in a qualifying pair; once the first
// is locked, only its qualifying partners stay valid and the first is "picked".
function spatialTargets(w, field, sofar, pairFirst) {
  const opts = field.options(w, sofar || {});
  if (field.pick === "edge")
    return { kind: "edge", valid: new Set(opts.map((o) => canon(o.v))), picked: new Set() };

  if (field.pick === "faction") {
    const pairs = opts.map((o) => {
      const [a, b] = String(o.v).split("|").map(Number);
      return { a, b };
    });
    let validFids, pickedFids;
    if (pairFirst == null) {
      validFids = new Set(pairs.flatMap((p) => [p.a, p.b]));
      pickedFids = new Set();
    } else {
      validFids = new Set(pairs.filter((p) => p.a === pairFirst || p.b === pairFirst)
        .map((p) => (p.a === pairFirst ? p.b : p.a)));
      pickedFids = new Set([pairFirst]);
    }
    const valid = new Set(), picked = new Set();
    for (const s of w.systems) {
      if (s.pop <= ALIVE || s.fid == null) continue;
      if (pickedFids.has(s.fid)) picked.add(s.id);
      else if (validFids.has(s.fid)) valid.add(s.id);
    }
    return { kind: "system", valid, picked };
  }

  // system / project → a set of system ids
  const valid = new Set(opts.map((o) =>
    field.pick === "project" ? w.projects[Number(o.v)].sysId : Number(o.v)));
  return { kind: "system", valid, picked: new Set() };
}

// the map-banner instruction for the field currently being aimed
function hintFor(field, pairFirst, w) {
  if (field.pick === "edge") return "Click a jumpgate lane on the map";
  if (field.pick === "project") return "Click the megaproject's world on the map";
  if (field.pick === "faction")
    return pairFirst == null
      ? "Click a realm's territory to name the first party"
      : `First party: ${w.factions[pairFirst].name} — now click the second realm`;
  return `Click the ${field.label} on the map`;
}

const sig = (t) => t
  ? `${t.kind}|${t.hint}|${[...t.valid].map(String).sort().join(",")}|${[...t.picked].map(String).sort().join(",")}`
  : "";

export default function CuratorPanel({ w, selected, onApplied, onTargeting }) {
  const [key, setKey] = useState(null);
  const [params, setParams] = useState({});
  const [armed, setArmed] = useState(false);   // destructive acts confirm twice
  const [flash, setFlash] = useState(null);    // what the last act wrote
  const [pairFirst, setPairFirst] = useState(null); // first realm of a pair pick

  const def = key ? INTERVENTION_BY_KEY[key] : null;

  // refs so the stable map callbacks always read the live picking context
  const defRef = useRef(def); defRef.current = def;
  const ctxRef = useRef(null);

  // set a field's value, clearing any downstream picks that depended on it
  const setField = useCallback((fk, v) => {
    const d = defRef.current;
    setParams((prev) => {
      const idx = d.fields.findIndex((f) => f.key === fk);
      const next = {};
      d.fields.slice(0, idx).forEach((f) => { next[f.key] = prev[f.key]; });
      next[fk] = v;
      return next;
    });
    setPairFirst(null); setArmed(false); setFlash(null);
  }, []);

  // clear a field (and everything downstream of it) — re-opens it for aiming
  const clearFrom = useCallback((fk) => {
    const d = defRef.current;
    setParams((prev) => {
      const idx = d.fields.findIndex((f) => f.key === fk);
      const next = {};
      d.fields.slice(0, idx).forEach((f) => { next[f.key] = prev[f.key]; });
      return next;
    });
    setPairFirst(null); setArmed(false); setFlash(null);
  }, []);

  const backToList = useCallback(() => {
    setKey(null); setParams({}); setPairFirst(null); setArmed(false); setFlash(null);
  }, []);

  // a click on the map arrives here: resolve the clicked element to an option
  // value for the field being aimed. `el` is a system id, or a "a|b" lane key.
  const mapPick = useCallback((el) => {
    const c = ctxRef.current;
    if (!c || !c.field) return;
    const f = c.field;
    const opts = f.options(c.w, c.sofar || {});
    if (f.pick === "edge") {
      const m = opts.find((o) => canon(o.v) === canon(el));
      if (m) setField(f.key, m.v);
      return;
    }
    if (f.pick === "faction") {
      const s = c.w.systems[el];
      if (!s || s.fid == null) return;
      const fid = s.fid;
      const pairs = opts.map((o) => {
        const [a, b] = String(o.v).split("|").map(Number);
        return { a, b, v: o.v };
      });
      if (c.pairFirst == null) {
        if (pairs.some((p) => p.a === fid || p.b === fid)) setPairFirst(fid);
        return;
      }
      if (fid === c.pairFirst) { setPairFirst(null); return; } // click again to reset
      const p = pairs.find((pp) =>
        (pp.a === c.pairFirst && pp.b === fid) || (pp.b === c.pairFirst && pp.a === fid));
      if (p) { setField(f.key, p.v); setPairFirst(null); }
      return;
    }
    // system / project: match the clicked world back to an option
    const m = f.pick === "project"
      ? opts.find((o) => c.w.projects[Number(o.v)].sysId === el)
      : opts.find((o) => Number(o.v) === el);
    if (m) setField(f.key, m.v);
  }, [setField]);

  const choose = (k) => {
    const d = INTERVENTION_BY_KEY[k];
    // pre-aim the first world-picker at the selected system when it qualifies
    const p = {};
    const f0 = d.fields[0];
    if (selected !== null && f0 && (f0.pick === "system")) {
      const opts = f0.options(w, {});
      if (opts.some((o) => Number(o.v) === selected)) p[f0.key] = selected;
    }
    setKey(k); setParams(p); setPairFirst(null); setArmed(false); setFlash(null);
  };

  // ---- resolve the current picking state (recomputed every render) ----
  const resolved = def ? resolveFields(w, def, params) : null;
  const current = resolved && !resolved.complete
    ? resolved.fields[resolved.fields.length - 1] // the first unfilled field
    : null;
  const currentSpatial = current && current.field.pick !== "choice" && current.opts.length > 0
    ? current : null;

  // keep the live context the stable map callbacks read
  ctxRef.current = currentSpatial
    ? { w, field: currentSpatial.field, sofar: resolved.sofar, pairFirst }
    : null;

  // build the targeting request the map fulfils (null when nothing to aim)
  let targeting = null;
  if (currentSpatial) {
    const t = spatialTargets(w, currentSpatial.field, resolved.sofar, pairFirst);
    targeting = {
      kind: t.kind, valid: t.valid, picked: t.picked,
      hint: hintFor(currentSpatial.field, pairFirst, w),
      pick: mapPick, onCancel: backToList,
    };
  }

  // lift the request to the app (→ MapView) whenever it materially changes,
  // and withdraw it when the panel unmounts (leaving Curate closes this tab)
  const tsig = sig(targeting);
  const tRef = useRef(targeting); tRef.current = targeting;
  useEffect(() => { onTargeting?.(tRef.current); }, [tsig, onTargeting]);
  useEffect(() => () => onTargeting?.(null), [onTargeting]);

  if (!def) {
    return (
      <div className="space-y-4">
        <div className="muted italic leading-relaxed">
          The curator's instruments. Pick an act, then aim it by clicking its
          target on the map. Each act presses on a mechanic the galaxy already
          lives by — the engine, not the hand, decides what follows. Every act
          is chronicled and entered in the command ledger.
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

  const pv = resolved.complete ? previewIntervention(w, def.key, params) : null;

  const doApply = () => {
    if (def.destructive && !armed) { setArmed(true); return; }
    const res = applyIntervention(w, def.key, params);
    setArmed(false);
    if (!res.ok) { setFlash({ err: res.error }); return; }
    const ev = w.events[w.events.length - 1];
    setFlash({ text: ev?.s, rec: res.record });
    setParams({}); setPairFirst(null); // spent — re-aim for the next dose
    onApplied();
  };

  return (
    <div className="space-y-4">
      <button onClick={backToList} className="text-xs link" style={{ color: "var(--cyan)" }}>
        ← all instruments
      </button>

      <div>
        <div className="display" style={{ fontWeight: 700, fontSize: 14, color: def.destructive ? "var(--red)" : "var(--amber)" }}>
          {def.glyph} {def.label}
        </div>
        <div className="muted">{def.blurb}</div>
      </div>

      <Section title="target">
        {def.fields.map((f, i) => {
          const r = resolved.fields[i];
          if (!r) return (
            <div key={f.key} className="mb-2 faint italic" style={{ fontSize: 11 }}>
              {fieldLabel(f)} — aim the previous target first
            </div>
          );
          const filled = r.value !== null;
          if (filled) return (
            <FilledField key={f.key} r={r} onChange={() => clearFrom(f.key)} />
          );
          if (r.field.pick === "choice") return (
            <ChoiceField key={f.key} r={r} onPick={(v) => setField(f.key, v)} />
          );
          // the field being aimed on the map
          return (
            <MapPrompt key={f.key} field={f} opts={r.opts} pairFirst={pairFirst} w={w} onReset={() => setPairFirst(null)} />
          );
        })}
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

      {resolved.complete && pv?.ok && (
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

const fieldLabel = (f) => (
  <span className="faint" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9 }}>
    {f.label}
  </span>
);

// a field already aimed: show what was chosen, with a link to re-aim it
function FilledField({ r, onChange }) {
  return (
    <div className="mb-2">
      <div className="mb-0.5">{fieldLabel(r.field)}</div>
      <div className="flex items-center gap-2 rowbtn" style={{ cursor: "default" }}>
        <span style={{ color: "var(--cyan)" }}>◈</span>
        <span className="truncate">{r.label}</span>
        <button onClick={onChange} className="ml-auto link" style={{ color: "var(--cyan)", fontSize: 10 }}>change</button>
      </div>
    </div>
  );
}

// the field currently being aimed on the map — the panel just narrates it
function MapPrompt({ field, opts, pairFirst, w }) {
  if (!opts.length) return (
    <div className="mb-2">
      <div className="mb-0.5">{fieldLabel(field)}</div>
      <div className="muted italic">The galaxy offers no valid target for this act right now.</div>
    </div>
  );
  return (
    <div className="mb-2">
      <div className="mb-0.5">{fieldLabel(field)}</div>
      <div className="p-2 rounded-lg flex items-center gap-2"
        style={{ background: "rgba(242,169,59,0.07)", border: "1px dashed rgba(242,169,59,0.45)", color: "var(--amber)" }}>
        <span className="crt-blink">◎</span>
        <span style={{ fontSize: 11 }}>{hintFor(field, pairFirst, w)}</span>
        <span className="ml-auto faint" style={{ fontSize: 9 }}>{opts.length} valid</span>
      </div>
    </div>
  );
}

// the one non-spatial picker: infrastructure works (a short button group)
function ChoiceField({ r, onPick }) {
  return (
    <div className="mb-2">
      <div className="mb-0.5">{fieldLabel(r.field)}</div>
      <div className="space-y-1">
        {r.opts.map((o) => (
          <button key={String(o.v)} className="btn w-full" style={{ textAlign: "left", fontSize: 11 }} onClick={() => onPick(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
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
