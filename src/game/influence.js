import { clamp } from "../sim/util.js";
import { getRel } from "../sim/events.js";
import { logLedger } from "./corp.js";

// ---------------------------------------------------------------------------
// Influence & espionage — power the money can't buy openly. Grease a ruler's
// palm to build standing, secretly stoke two powers toward war (weapons demand
// is good for business), or sabotage a rival's operations. These mutate the
// galaxy directly (price-maker), deterministically, and move the corp's
// reputation with each power. No rng — covert acts still replay exactly.
// ---------------------------------------------------------------------------

export const INFLUENCE = {
  BRIBE_REP: 0.04,      // reputation gained per credit bribed
  STOKE_RATE: 0.15,     // rivalry added per credit spent stoking
  SABOTAGE_DAMAGE: 0.6, // wealth destroyed per credit of sabotage
  SABOTAGE_REP: 0.03,   // reputation lost with the victim per credit
  REP_MIN: -100, REP_MAX: 100,
};

const err = (error) => ({ ok: false, error });
const moveRep = (corp, fid, d) => { corp.rep[fid] = clamp((corp.rep[fid] || 0) + d, INFLUENCE.REP_MIN, INFLUENCE.REP_MAX); };

export const reputation = (corp, fid) => corp.rep[fid] || 0;

/** Grease a power's ruling class: buys treasury, stability, and standing. */
export function bribe(game, fid, amount) {
  const f = game.w.factions[fid];
  if (!f || f.dead) return err("no such power");
  if (f.gov === "pirate") return err("corsairs take loot, not bribes");
  if (!(amount > 0)) return err("amount must be positive");
  if (game.corp.cash < amount) return err("insufficient cash");
  game.corp.cash -= amount;
  f.treasury += amount * 0.5;                                  // half greases palms, half vanishes
  f.stability = clamp(f.stability + amount * 0.0004, 0, 1);
  moveRep(game.corp, fid, amount * INFLUENCE.BRIBE_REP);
  logLedger(game.corp, `bribed the ${f.name}`, -amount);
  return { ok: true, rep: reputation(game.corp, fid) };
}

/** Covertly stoke two powers toward war — no fingerprints, no reputation cost. */
export function stokeRivalry(game, a, b, amount) {
  const A = game.w.factions[a], B = game.w.factions[b];
  if (!A || !B || A.dead || B.dead || a === b) return err("need two living rival powers");
  if (A.gov === "pirate" || B.gov === "pirate") return err("corsairs keep no diplomacy");
  if (!(amount > 0)) return err("amount must be positive");
  if (game.corp.cash < amount) return err("insufficient cash");
  game.corp.cash -= amount;
  const rel = getRel(game.w, a, b);
  rel.rivalry = clamp(rel.rivalry + amount * INFLUENCE.STOKE_RATE, 0, 100);
  logLedger(game.corp, `stoked the rivalry between the ${A.name} and the ${B.name}`, -amount);
  return { ok: true, rivalry: rel.rivalry };
}

/** Sabotage a world's operations — destroys wealth, at the cost of standing. */
export function sabotage(game, sys, amount) {
  const s = game.w.systems[sys];
  if (!s || s.pop <= 0.05) return err("no operations to sabotage here");
  if (!(amount > 0)) return err("amount must be positive");
  if (game.corp.cash < amount) return err("insufficient cash");
  game.corp.cash -= amount;
  const damage = amount * INFLUENCE.SABOTAGE_DAMAGE;
  s.wealth = Math.max(-20, s.wealth - damage);
  s.stock.consumer *= 0.9;
  if (s.fid != null) moveRep(game.corp, s.fid, -amount * INFLUENCE.SABOTAGE_REP);
  logLedger(game.corp, `sabotaged operations at ${s.name}`, -amount);
  return { ok: true, damage };
}
