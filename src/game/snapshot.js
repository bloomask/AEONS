import { GOODS } from "../sim/constants.js";

// ---------------------------------------------------------------------------
// Keyframe snapshots for the two-clock game layer.
//
// The macro simulation advances a year at a time; the game plays out in days by
// interpolating between two yearly snapshots. A snapshot is a lean, plain-object
// capture of just the fields worth tweening (and enough discrete state to drive
// the display) — cheap to take every year and serializable for saves.
//
// This module reads the world and never mutates it.
// ---------------------------------------------------------------------------

const pickGoods = (obj) => {
  const out = {};
  for (const g of GOODS) out[g] = obj[g];
  return out;
};

/**
 * Capture the interpolatable state of the world at its current year.
 * @param {import("../sim/types.js").World} w
 */
export function snapshot(w) {
  return {
    year: w.year,
    sys: w.systems.map((s) => ({
      // continuous — these tween across the year
      pop: s.pop, wealth: s.wealth, dev: s.dev,
      unrest: s.unrest, wb: s.wb,
      tradeIn: s.tradeIn, tradeOut: s.tradeOut,
      price: pickGoods(s.price),
      stock: pickGoods(s.stock),
      // discrete — snap at the year boundary (carried from the base keyframe)
      fid: s.fid, ruined: s.ruined, freePort: s.freePort,
      siege: s.siege ? s.siege.by : null,
    })),
    fac: w.factions.map((f) => ({
      treasury: f.treasury, stability: f.stability, dead: f.dead,
    })),
    edges: w.edges.map((e) => ({ vol: e.vol, net: e.net })),
  };
}
