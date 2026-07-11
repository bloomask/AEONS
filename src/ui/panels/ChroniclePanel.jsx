import { EV_STYLE, EV_FILTERS } from "../theme.js";

// headline events keep full weight; everything else renders compact and
// consecutive repeats from the same system collapse into one entry
const MAJOR = new Set(["war", "peace", "collapse", "found", "capture", "mega", "corp"]);

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
      <div className="flex gap-1 mb-2 flex-wrap items-center">
        {Object.keys(EV_FILTERS).map((fk) => (
          <button
            key={fk}
            onClick={() => setEvFilter(fk)}
            className="px-2 py-0.5 text-xs rounded uppercase tracking-wider"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              background: evFilter === fk ? "#E6E1D3" : "rgba(230,225,211,0.06)",
              color: evFilter === fk ? "#06090F" : "#7C8798",
            }}
          >
            {fk}
          </button>
        ))}
        <select
          value={facFilter}
          onChange={(e) => setFacFilter(e.target.value)}
          className="ml-auto text-xs rounded px-1 py-0.5"
          style={{ background: "#141C2A", color: "#E6E1D3", border: "1px solid rgba(230,225,211,0.15)", maxWidth: 150 }}
        >
          <option value="all">every power</option>
          {liveFactions.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {focusYear !== null && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded" style={{ background: "rgba(242,169,59,0.1)", border: "1px solid rgba(242,169,59,0.3)" }}>
          <span style={{ color: "#F2A93B" }}>viewing years {Math.max(0, focusYear - 15)}–{focusYear + 15}</span>
          <button
            onClick={onBackToLive}
            className="ml-auto px-2 py-0.5 text-xs rounded"
            style={{ background: "#F2A93B", color: "#06090F", fontWeight: 600 }}
          >
            ● LIVE
          </button>
        </div>
      )}

      {grouped.length === 0 && (
        <div style={{ color: "#7C8798" }} className="italic">
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
            <div key={i} className="my-3 text-center">
              <div style={{ borderTop: "1px solid rgba(242,169,59,0.35)" }} className="mb-1.5" />
              <div style={{ color: "#F2A93B", fontFamily: "'Chakra Petch', sans-serif" }} className="text-sm">
                {ev.y} — {ev.s}
              </div>
              <div style={{ borderTop: "1px solid rgba(242,169,59,0.35)" }} className="mt-1.5" />
            </div>
          );
        }

        const major = MAJOR.has(ev.t);
        return (
          <div
            key={i}
            className={`flex gap-2 cursor-pointer ${major ? "mb-2" : "mb-1"}`}
            style={major ? {} : { opacity: 0.78 }}
            onClick={() => { if (ev.sysId !== null) onOpenSystem(ev.sysId); }}
          >
            <span style={{ color: showYear ? "#F2A93B" : "transparent", minWidth: 34 }}>{ev.y}</span>
            <span style={{ color: st.c, minWidth: 52, fontWeight: 600 }} className={major ? "text-[13px]" : ""}>{st.tag}</span>
            <span style={{ color: major ? "#E6E1D3" : "#B8B3A6" }} className={major ? "text-[13px]" : ""}>
              {ev.s}
              {n > 1 && (
                <span
                  className="ml-1.5 px-1 rounded text-xs"
                  style={{ background: "rgba(230,225,211,0.1)", color: "#7C8798" }}
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
