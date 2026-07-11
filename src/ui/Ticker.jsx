import { useState, useEffect, useRef } from "react";
import { EV_STYLE } from "./theme.js";

// Rotating headline strip over the map: only history-book events make it.
const HEADLINE_TYPES = new Set([
  "era", "war", "peace", "collapse", "capture", "found", "mega", "corp", "faith",
]);

export default function Ticker({ worldRef, onOpen }) {
  const [idx, setIdx] = useState(0);
  const topSeqRef = useRef(0);

  const w = worldRef.current;
  const list = w
    ? [...w.events].reverse().filter((ev) => HEADLINE_TYPES.has(ev.t)).slice(0, 10)
    : [];

  // a fresh headline interrupts the rotation
  useEffect(() => {
    if (list.length && list[0].i !== topSeqRef.current) {
      topSeqRef.current = list[0].i;
      setIdx(0);
    }
  });

  useEffect(() => {
    const iv = setInterval(() => setIdx((i) => i + 1), 7000);
    return () => clearInterval(iv);
  }, []);

  if (!list.length) return null;
  const ev = list[idx % list.length];
  const st = EV_STYLE[ev.t] || EV_STYLE.era;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex justify-center"
      style={{ bottom: 68, zIndex: 15, maxWidth: "72%", pointerEvents: "none" }}
    >
      <button
        key={ev.i}
        onClick={() => onOpen(ev)}
        className="px-3 py-1.5 rounded text-xs text-left"
        style={{
          pointerEvents: "auto",
          background: "rgba(6,9,15,0.88)",
          border: "1px solid rgba(230,225,211,0.16)",
          color: "#E6E1D3",
          animation: "tickerIn 0.5s ease",
          lineHeight: 1.45,
        }}
        title="Open in the chronicle"
      >
        <span style={{ color: "#F2A93B", fontWeight: 600 }}>{ev.y}</span>
        <span style={{ color: st.c, fontWeight: 700 }} className="mx-1.5">{st.tag}</span>
        <span style={{ color: "#D8D3C5" }}>{ev.s}</span>
      </button>
    </div>
  );
}
