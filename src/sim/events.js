// world event log + inter-faction relation records
export function log(w, t, s, sysId = null) {
  // monotonic sequence number so the UI can detect fresh events even
  // after the log's front has been trimmed
  w.eventSeq = (w.eventSeq || 0) + 1;
  w.events.push({ y: w.year, t, s, sysId, i: w.eventSeq });
  if (sysId !== null) {
    const sys = w.systems[sysId];
    sys.history.push({ y: w.year, t, s });
    if (sys.history.length > 12) sys.history.shift();
  }
  if (w.events.length > 800) w.events.splice(0, w.events.length - 800);
}

// short-lived visual effects (battles, sieges) the map animates;
// entries carry world data only, the renderer decides how they look
export function fx(w, payload) {
  w.fxSeq = (w.fxSeq || 0) + 1;
  w.fx.push({ ...payload, i: w.fxSeq, y: w.year });
  if (w.fx.length > 120) w.fx.splice(0, w.fx.length - 120);
}

export const relKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(w, a, b) {
  const k = relKey(a, b);
  if (!w.relations[k]) w.relations[k] = { rivalry: 20, war: null, allied: false };
  return w.relations[k];
}
