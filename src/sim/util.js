export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const cultDist = (a, b) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 1.73;

export function avgCult(members) {
  const v = [0, 0, 0];
  for (const s of members) for (let k = 0; k < 3; k++) v[k] += s.cult[k];
  return v.map((x) => x / members.length);
}

// hop distances over the jumpgate graph (breadth-first from a set of source
// system ids). Returns one entry per system: 0 for the sources themselves,
// -1 for anything more than maxHops gates away. Distance in *gates*, not
// space — the measure that matters for fleets, freight, and law.
export function jumpHops(w, sources, maxHops) {
  const hops = new Array(w.systems.length).fill(-1);
  let frontier = [];
  for (const id of sources) {
    if (hops[id] === -1) { hops[id] = 0; frontier.push(id); }
  }
  for (let d = 1; d <= maxHops && frontier.length; d++) {
    const next = [];
    for (const id of frontier)
      for (const { to } of w.adj[id])
        if (hops[to] === -1) { hops[to] = d; next.push(to); }
    frontier = next;
  }
  return hops;
}
