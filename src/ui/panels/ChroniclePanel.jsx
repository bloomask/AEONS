import { EV_STYLE, EV_FILTERS } from "../theme.js";

// headline events keep full weight; everything else renders compact and
// consecutive repeats from the same system collapse into one entry
const MAJOR = new Set(["war", "peace", "collapse", "found", "capture", "mega", "corp", "pirate", "revolution"]);

function coalesce(rows) {
  const out = [];
  for (const ev of rows) {
    const last = out[out.length - 1];
    if (
      last && ev.sysId !== null && !MAJOR.has(ev.t) && ev.t !== "era" &&
      last.ev.t === ev.t && last.ev.sysId === ev.sysId
    ) {
      last.n++;
      last.firstY = ev.y;
      continue;
    }
    out.push({ ev, n: 1, firstY: ev.y });
  }
  return out;
}

export default function ChroniclePanel({ w, evFilter, setEvFilter, facFilter, setFacFilter, onOpenSystem, focusYear, onBackToLive }) {
  const liveFactions = w.factions.filter((f) => !f.dead);
  const fac = facFilter !== "all" ? w.factions[+facFilter] : null;

  let rows = [...w.events].reverse()
    .filter((ev) => !EV_FILTERS[evFilter] || EV_FILTERS[evFilter].has(ev.t));
  if (fac) {
    rows = rows.filter((ev) =>
      ev.s.includes(fac.name) ||
      (ev.sysId !== null && w.systems[ev.sysId].fid === fac.id)
    );
  }
  if (focusYear !== null) rows = rows.filter((ev) => Math.abs(ev.y - focusYear) <= 15);
  const grouped = coalesce(rows).slice(0, 150);

  let prevYear = null;
  return (
    <div>
      <div className="flex gap-1.5 mb-3 flex-wrap items-center">
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
            ? "No records survive from this era — the archives only reach back so far."
            : "Nothing to report. The lanes are quiet."}
        </div>
      )}

      {grouped.map(({ ev, n, firstY }, i) => {
        const st = EV_STYLE[ev.t] || EV_STYLE.era;
        const showYear = ev.y !== prevYear;
        prevYear = ev.y;

        if (ev.t === "era") {
          return (
            <div key={i} className="my-4 text-center">
              <div className="mb-2" style={{ borderTop: "1px solid rgba(242,169,59,0.35)" }} />
              <div className="display text-sm" style={{ color: "var(--amber)" }}>
                {ev.y} — {ev.s}
              </div>
              <div className="mt-2" style={{ borderTop: "1px solid rgba(242,169,59,0.35)" }} />
            </div>
          );
        }

        const major = MAJOR.has(ev.t);
        return (
          <div
            key={i}
            className={`flex gap-2.5 cursor-pointer ${major ? "mb-2" : "mb-1"}`}
            style={major ? {} : { opacity: 0.75 }}
            onClick={() => { if (ev.sysId !== null) onOpenSystem(ev.sysId); }}
          >
            <span style={{ color: showYear ? "var(--amber)" : "transparent", minWidth: 34 }}>{ev.y}</span>
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
        );
      })}
    </div>
  );
}
