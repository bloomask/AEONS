import { EV_STYLE, EV_FILTERS } from "../theme.js";

export default function ChroniclePanel({ w, evFilter, setEvFilter, onOpenSystem }) {
  return (
    <div>
      <div className="flex gap-1 mb-2">
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
      </div>
      {[...w.events].reverse()
        .filter((ev) => !EV_FILTERS[evFilter] || EV_FILTERS[evFilter].has(ev.t))
        .slice(0, 150).map((ev, i) => {
          const st = EV_STYLE[ev.t] || EV_STYLE.era;
          return (
            <div
              key={i}
              className="mb-1.5 flex gap-2 cursor-pointer"
              onClick={() => { if (ev.sysId !== null) onOpenSystem(ev.sysId); }}
            >
              <span style={{ color: "#F2A93B", minWidth: 34 }}>{ev.y}</span>
              <span style={{ color: st.c, minWidth: 52, fontWeight: 600 }}>{st.tag}</span>
              <span style={{ color: "#C9C4B6" }}>{ev.s}</span>
            </div>
          );
        })}
    </div>
  );
}
