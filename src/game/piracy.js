import { T } from "../sim/constants.js";
import { jumpHops } from "../sim/util.js";
import { makeRng } from "../sim/rng.js";

// ---------------------------------------------------------------------------
// Corsair hazard for the player's convoys. Player ships share the same raid
// geography as the simulation: the lanes within RAID_JUMPS gates of a living
// pirate haven are dangerous waters. Raids are rolled from a per-ship, per-day
// sub-rng (seeded off the world seed) — deterministic for replay, and never
// touching w.rng, so the macro-sim is unperturbed.
// ---------------------------------------------------------------------------

export const PIRACY = {
  BASE_DAILY: 0.05,     // per-day raid chance in fully-raided waters (cfg ×1)
  LOSS: 0.3,            // fraction of the hold skimmed per raid
  PREMIUM_RATE: 0.06,   // annual insurance premium as a fraction of hull value
  REIMBURSE: 0.7,       // insured share of a loss the underwriter covers
};

// systems within a haven's raiding reach — the dangerous lanes run through them
export function raidedSet(w) {
  const havens = [];
  for (const f of w.factions) {
    if (f.dead || f.gov !== "pirate") continue;
    const cap = w.systems[f.capital];
    if (cap && cap.pop > 0.05) havens.push(f.capital);
  }
  if (!havens.length) return null;
  const hops = jumpHops(w, havens, T.RAID_JUMPS);
  const set = new Set();
  for (let i = 0; i < hops.length; i++) if (hops[i] >= 0) set.add(i);
  return set;
}

// what fraction of a route's systems lie in raided waters (0..1)
export function pathExposure(w, path) {
  if (!path || !path.length) return 0;
  const set = raidedSet(w);
  if (!set) return 0;
  let n = 0;
  for (const id of path) if (set.has(id)) n++;
  return n / path.length;
}

// deterministic per-(ship, day) raid roll — independent of w.rng
export function raidRng(w, shipId, day) {
  return makeRng((((w.seed >>> 0) * 2654435761) ^ ((shipId + 1) * 40503) ^ ((day + 1) * 2246822519)) >>> 0);
}
