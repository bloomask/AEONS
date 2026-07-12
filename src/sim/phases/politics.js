import { runInternalPolitics } from "./politics/internal.js";
import { runDiplomacy } from "./politics/diplomacy.js";
import { runNewPowers } from "./politics/newPowers.js";

// The politics phase in three movements, in this order:
//   1. internal  — each power's treasury, stability, revolts, secession,
//                  collapse, and expansion into free systems
//   2. diplomacy — pairwise rivalry, alliances, embargoes, war and peace
//   3. newPowers — prosperous independents proclaim new factions
export function runPolitics(w, rng, alive) {
  runInternalPolitics(w, rng);
  runDiplomacy(w, rng);
  runNewPowers(w, rng, alive);
}
