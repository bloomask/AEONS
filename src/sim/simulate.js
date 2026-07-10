import { runEconomy } from "./phases/economy.js";
import { runTrade } from "./phases/trade.js";
import { runSettlement } from "./phases/settlement.js";
import { runPolitics } from "./phases/politics.js";
import { runShocks } from "./phases/shocks.js";
import { recordYear } from "./phases/chronicle.js";

// ---------- yearly simulation ----------
// Phase order matters: each phase mutates the shared world object and the
// later phases read what the earlier ones wrote. `alive` is snapshotted once
// per year, before the economy runs, and shared by every phase.
export function simulateYear(w) {
  const rng = w.rng;
  w.year++;

  const alive = w.systems.filter((s) => s.pop > 0.05);

  runEconomy(w, rng, alive);
  runTrade(w, rng);
  runSettlement(w, rng, alive);
  runPolitics(w, rng, alive);
  runShocks(w, rng, alive);
  recordYear(w, rng);
}
