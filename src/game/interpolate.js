import { GOODS } from "../sim/constants.js";

// ---------------------------------------------------------------------------
// Interpolation between two yearly keyframes — the "fake day ticks" that give
// the player a smooth, day-by-day galaxy while the real simulation only steps
// once a year. Continuous fields lerp; discrete state is carried from the base
// (start-of-year) keyframe and snaps at the boundary when base advances.
// Pure: builds a fresh view object, mutates neither keyframe.
// ---------------------------------------------------------------------------

const lerp = (x, y, t) => x + (y - x) * t;
const lerpGoods = (a, b, t) => {
  const out = {};
  for (const g of GOODS) out[g] = lerp(a[g], b[g], t);
  return out;
};

/**
 * A day-view of the galaxy at fraction `t` (0..1) through the lived year.
 * @param {ReturnType<import("./snapshot.js").snapshot>} base     start-of-year
 * @param {ReturnType<import("./snapshot.js").snapshot>} forecast next year
 * @param {number} t  0 = base exactly, 1 = forecast exactly
 */
export function lerpSnapshot(base, forecast, t) {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const sys = base.sys.map((sa, i) => {
    const sb = forecast.sys[i] || sa; // systems never change count, but be safe
    return {
      pop: lerp(sa.pop, sb.pop, u),
      wealth: lerp(sa.wealth, sb.wealth, u),
      dev: lerp(sa.dev, sb.dev, u),
      unrest: lerp(sa.unrest, sb.unrest, u),
      wb: lerp(sa.wb, sb.wb, u),
      tradeIn: lerp(sa.tradeIn, sb.tradeIn, u),
      tradeOut: lerp(sa.tradeOut, sb.tradeOut, u),
      price: lerpGoods(sa.price, sb.price, u),
      stock: lerpGoods(sa.stock, sb.stock, u),
      // discrete state comes from the base year (snaps when base advances)
      fid: sa.fid, ruined: sa.ruined, freePort: sa.freePort, siege: sa.siege,
    };
  });
  // factions are append-only: interpolate the ones present at the base year,
  // pass newer ones through unchanged (they appear at the next boundary)
  const fac = base.fac.map((fa, i) => {
    const fb = forecast.fac[i] || fa;
    return { treasury: lerp(fa.treasury, fb.treasury, u), stability: lerp(fa.stability, fb.stability, u), dead: fa.dead };
  });
  // edges can change count (gate flux); only tween when the graph is stable,
  // otherwise show the base year's lanes until the boundary
  const stable = base.edges.length === forecast.edges.length;
  const edges = base.edges.map((ea, i) => stable
    ? { vol: lerp(ea.vol, forecast.edges[i].vol, u), net: lerp(ea.net, forecast.edges[i].net, u) }
    : { vol: ea.vol, net: ea.net });
  return { year: base.year, t: u, sys, fac, edges };
}
