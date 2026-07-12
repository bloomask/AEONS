// Shortest path across the jumpgate network, weighted by lane length. Used to
// route a dispatched ship and to estimate its travel time. Pure read of the
// world's edges/adjacency. O(V^2) Dijkstra — V is small (tens of systems).

/**
 * @param {import("../sim/types.js").World} w
 * @param {number} from system id
 * @param {number} to   system id
 * @returns {{ path: number[], dist: number } | null}  null if unreachable
 */
export function shortestPath(w, from, to) {
  if (from === to) return { path: [from], dist: 0 };
  const n = w.systems.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const seen = new Array(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!seen[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1 || u === to) break;
    seen[u] = true;
    for (const { to: v, e } of w.adj[u] || []) {
      const nd = dist[u] + w.edges[e].d;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let c = to; c !== -1; c = prev[c]) path.unshift(c);
  return { path, dist: dist[to] };
}
