// world event log + inter-faction relation records
export function log(w, t, s, sysId = null) {
  w.events.push({ y: w.year, t, s, sysId });
  if (sysId !== null) {
    const sys = w.systems[sysId];
    sys.history.push({ y: w.year, t, s });
    if (sys.history.length > 12) sys.history.shift();
  }
  if (w.events.length > 800) w.events.splice(0, w.events.length - 800);
}

export const relKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(w, a, b) {
  const k = relKey(a, b);
  if (!w.relations[k]) w.relations[k] = { rivalry: 20, war: null, allied: false };
  return w.relations[k];
}
