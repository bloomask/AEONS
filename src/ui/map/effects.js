import { EV_STYLE } from "../theme.js";

// Fresh sim events/effects → transient map animations. State is the caller's
// mutable scratch object: { lastSeq, fxSeq, pulses, fxAnims }. During burn-in
// the cursors advance without spawning animations.

// map events worth flashing on the map to their chronicle colors
const PULSE_TYPES = new Set([
  "famine", "plague", "battle", "siege", "capture", "colony", "death",
  "found", "secede", "annex", "strike", "flare", "build", "house",
  "mega", "faith", "corp", "pirate", "raid", "revolution", "slave", "drug",
  "curate",
]);

// collect fresh events into map pulses (skipped during burn-in)
export function collectPulses(w, state, now, burning) {
  const seq = w.eventSeq || 0;
  if (burning) {
    state.lastSeq = seq;
  } else if (seq > state.lastSeq) {
    const fresh = [];
    for (let i = w.events.length - 1; i >= 0 && w.events[i].i > state.lastSeq; i--)
      fresh.push(w.events[i]);
    state.lastSeq = seq;
    for (const ev of fresh.slice(0, 24).reverse()) {
      if (ev.sysId === null || !PULSE_TYPES.has(ev.t)) continue;
      const s = w.systems[ev.sysId];
      state.pulses.push({ x: s.x, y: s.y, color: (EV_STYLE[ev.t] || EV_STYLE.era).c, t0: now });
    }
    if (state.pulses.length > 40)
      state.pulses.splice(0, state.pulses.length - 40);
  }
}

// collect battle/siege effects from the sim's fx queue
export function collectFx(w, state, now, burning) {
  const fseq = w.fxSeq || 0;
  if (burning) {
    state.fxSeq = fseq;
  } else if (fseq > state.fxSeq) {
    const freshFx = [];
    for (let i = w.fx.length - 1; i >= 0 && w.fx[i].i > state.fxSeq; i--)
      freshFx.push(w.fx[i]);
    state.fxSeq = fseq;
    for (const f of freshFx.slice(0, 12)) {
      if (f.t === "battle") {
        const A = w.systems[f.a], B = w.systems[f.b];
        state.fxAnims.push({ kind: "battle", x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, t0: now });
      } else if (f.t === "siege") {
        const s = w.systems[f.sys];
        state.fxAnims.push({ kind: "siege", x: s.x, y: s.y, t0: now });
      }
    }
    if (state.fxAnims.length > 24)
      state.fxAnims.splice(0, state.fxAnims.length - 24);
  }
}
