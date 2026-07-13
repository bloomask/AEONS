import { useEffect, useState } from "react";
import { EV_STYLE, EV_FILTERS } from "../theme.js";
import { eventInvolves, chronicleRange, MINOR_KEEP_YEARS } from "../../sim/events.js";
import { refName, fmtEffect, whyText, digestText } from "../chronicle.js";

const PAGE = 150;

// headline weight follows the recorded severity: 3 = major history,
// 2 = notable (compact), decade digests render as condensed footnotes
const isMajor = (ev) => ev.sev === 3;

// consecutive repeats of the same minor event at the same system collapse
// into one entry (recent minors that compaction hasn't digested yet)
function coalesce(rows) {
  const out = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (
      last && last.ev && row.ev &&
      row.ev.sysId !== null && !isMajor(row.ev) && row.ev.t !== "era" &&
      last.ev.t === row.ev.t && last.ev.sysId === row.ev.sysId
    ) {
      last.n++;
      last.firstY = row.ev.y;
      continue;
    }
    out.push({ ...row, n: 1, firstY: row.y });
  }
  return out;
}

// the expandable record card: What happened / Why / What changed
function EventDetail({ w, ev, onOpenSystem }) {
  const st = EV_STYLE[ev.t] || EV_STYLE.era;
  const who = [...(ev.actors || []), ...(ev.targets || [])];
  const why = whyText(ev);
  // near-zero deltas ("medicine −0.0") are noise, not history
  const effects = (ev.effects || []).filter(
    (e) => !(typeof e.d === "number" && Math.abs(e.d) < 0.05)
  );
  const Row = ({ label, children }) => (
    <div className="flex gap-2 items-baseline">
      <span className="display uppercase" style={{ color: "var(--muted)", fontSize: 9, letterSpacing: "0.14em", minWidth: 88 }}>
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
  return (
    <div
      className="ml-24 mb-2 px-3 py-2 rounded-lg space-y-1.5"
      style={{ background: "rgba(233,228,214,0.04)", border: `1px solid ${st.c}33`, borderLeftWidth: 3, borderLeftColor: st.c }}
    >
      <Row label="what happened">
        <span style={{ color: "var(--text)" }}>{ev.s}</span>
        {who.length > 0 && (
          <span className="faint"> — {who.map((r) => refName(w, r)).join(", ")}</span>
        )}
      </Row>
      <Row label="why">
        <span className="muted">{why || "the chronicle records no cause"}</span>
        {ev.cause && <span className="faint ml-1.5" title="cause code">[{ev.cause}]</span>}
      </Row>
      <Row label="what changed">
        {effects.length ? (
          <span className="muted">{effects.map((e) => fmtEffect(w, e)).join(" · ")}</span>
        ) : (
          <span className="faint italic">no measurable change was recorded</span>
        )}
      </Row>
      {ev.systems && ev.systems.length > 0 && (
        <Row label="where">
          <span className="flex gap-1.5 flex-wrap">
            {ev.systems.map((id) => (
              <button key={id} className="chip" onClick={() => onOpenSystem(id)}>
                ⊙ {w.systems[id].name}
              </button>
            ))}
          </span>
        </Row>
      )}
    </div>
  );
}

export default function ChroniclePanel({ w, evFilter, setEvFilter, facFilter, setFacFilter, onOpenSystem, focusYear, onBackToLive }) {
  const liveFactions = w.factions.filter((f) => !f.dead);
  const fid = facFilter !== "all" ? +facFilter : null;
  const [limit, setLimit] = useState(PAGE);
  const [openKey, setOpenKey] = useState(null);

  // filters or the scrub window changing resets paging and any open card
  useEffect(() => { setLimit(PAGE); setOpenKey(null); }, [evFilter, facFilter, focusYear]);

  const typeSet = EV_FILTERS[evFilter];
  const inWindow = (y0, y1) =>
    focusYear === null || (y0 <= focusYear + 15 && y1 >= focusYear - 15);

  // events are filtered on their STRUCTURED fields — a power is involved when
  // it appears among the actors or targets, never by matching text or by who
  // happens to own the system today
  const rows = [];
  for (let i = w.events.length - 1; i >= 0; i--) {
    const ev = w.events[i];
    if (typeSet && !typeSet.has(ev.t)) continue;
    if (fid !== null && !eventInvolves(ev, "faction", fid)) continue;
    if (!inWindow(ev.y, ev.y)) continue;
    rows.push({ y: ev.y, i: ev.i, ev });
  }
  // decade digests carry no actor records, so they only join the unfiltered stream
  if (fid === null) {
    for (const agg of w.eventAgg || []) {
      if (typeSet && !typeSet.has(agg.t)) continue;
      if (!inWindow(agg.y0, agg.y1)) continue;
      rows.push({ y: agg.y1, i: 0, agg });
    }
    rows.sort((p, q) => q.y - p.y || q.i - p.i);
  }

  const grouped = coalesce(rows);
  const shown = grouped.slice(0, limit);
  const range = chronicleRange(w);

  let prevYear = null;
  return (
    <div>
      <div className="flex gap-1.5 mb-2 flex-wrap items-center">
        {Object.keys(EV_FILTERS).map((fk) => (
          <button key={fk} onClick={() => setEvFilter(fk)} className={`chip${evFilter === fk ? " on" : ""}`}>
            {fk}
          </button>
        ))}
        <select
          value={facFilter}
          onChange={(e) => setFacFilter(e.target.value)}
          className="ml-auto text-xs rounded-md px-1.5 py-1"
          style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", maxWidth: 150 }}
        >
          <option value="all">every power</option>
          {liveFactions.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* what the archive actually holds — the full session, always */}
      <div className="faint mb-3" style={{ fontSize: 10 }}>
        The full record survives: years {range.from}–{range.to} · {range.events} entries
        {range.digests > 0 && <> · {range.digests} decade digests (minor events older than {MINOR_KEEP_YEARS} years are condensed by decade)</>}
      </div>

      {focusYear !== null && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(242,169,59,0.08)", border: "1px solid rgba(242,169,59,0.3)" }}>
          <span style={{ color: "var(--amber)" }}>viewing years {Math.max(0, focusYear - 15)}–{focusYear + 15}</span>
          <button
            onClick={onBackToLive}
            className="ml-auto px-2.5 py-1 text-xs rounded-md display"
            style={{ background: "var(--amber)", color: "#0A0E16", fontWeight: 600, cursor: "pointer" }}
          >
            ● LIVE
          </button>
        </div>
      )}

      {grouped.length === 0 && (
        <div className="muted italic">
          {focusYear !== null
            ? "Nothing in the record for these years matches the filters."
            : "Nothing to report. The lanes are quiet."}
        </div>
      )}

      {shown.map((row) => {
        const { ev, agg, n, firstY } = row;

        // a decade digest: condensed minor history, rendered as a footnote
        if (agg) {
          const st = EV_STYLE[agg.t] || EV_STYLE.era;
          const key = `agg:${agg.dec}|${agg.t}|${agg.sysId}`;
          const showYear = agg.y1 !== prevYear;
          prevYear = agg.y1;
          return (
            <div
              key={key}
              className="flex gap-2.5 mb-1 cursor-pointer"
              style={{ opacity: 0.6 }}
              title={`the ${agg.dec}s, condensed`}
              onClick={() => { if (agg.sysId !== null) onOpenSystem(agg.sysId); }}
            >
              <span style={{ color: showYear ? "var(--amber)" : "transparent", minWidth: 34 }}>{agg.y1}</span>
              <span
                className="display"
                style={{ color: st.c, minWidth: 54, fontWeight: 600, fontSize: 10, letterSpacing: "0.06em", paddingTop: 1 }}
              >
                {st.tag}
              </span>
              <span className="italic" style={{ color: "#8F8A80" }}>{digestText(w, agg)}</span>
            </div>
          );
        }

        const st = EV_STYLE[ev.t] || EV_STYLE.era;
        const showYear = ev.y !== prevYear;
        prevYear = ev.y;

        if (ev.t === "era") {
          return (
            <div key={ev.i} className="my-4 text-center cursor-pointer" onClick={() => setOpenKey(openKey === ev.i ? null : ev.i)}>
              <div className="mb-2" style={{ borderTop: "1px solid rgba(242,169,59,0.35)" }} />
              <div className="display text-sm" style={{ color: "var(--amber)" }}>
                {ev.y} — {ev.s}
              </div>
              <div className="mt-2" style={{ borderTop: "1px solid rgba(242,169,59,0.35)" }} />
              {openKey === ev.i && <div className="mt-2 text-left"><EventDetail w={w} ev={ev} onOpenSystem={onOpenSystem} /></div>}
            </div>
          );
        }

        const major = isMajor(ev);
        return (
          <div key={ev.i}>
            <div
              className={`flex gap-2.5 cursor-pointer ${major ? "mb-2" : "mb-1"}`}
              style={major ? {} : { opacity: 0.75 }}
              title="What happened · why · what changed"
              onClick={() => setOpenKey(openKey === ev.i ? null : ev.i)}
            >
              <span style={{ color: showYear || openKey === ev.i ? "var(--amber)" : "transparent", minWidth: 34 }}>{ev.y}</span>
              <span
                className="display"
                style={{ color: st.c, minWidth: 54, fontWeight: 600, fontSize: major ? 11 : 10, letterSpacing: "0.06em", paddingTop: 1 }}
              >
                {st.tag}
              </span>
              <span style={{ color: major ? "var(--text)" : "#B0AB9F" }} className={major ? "text-[13px]" : ""}>
                {ev.s}
                {n > 1 && (
                  <span
                    className="ml-1.5 px-1.5 rounded-full text-xs"
                    style={{ background: "rgba(233,228,214,0.1)", color: "var(--muted)" }}
                    title={`repeated over years ${firstY}–${ev.y}`}
                  >
                    ×{n}
                  </span>
                )}
              </span>
            </div>
            {openKey === ev.i && <EventDetail w={w} ev={ev} onOpenSystem={onOpenSystem} />}
          </div>
        );
      })}

      {grouped.length > limit && (
        <button
          className="chip mt-2"
          onClick={() => setLimit((l) => l + PAGE)}
        >
          ▾ older records — showing {shown.length} of {grouped.length}
        </button>
      )}
    </div>
  );
}
