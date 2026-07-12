import { runEconomy } from "./phases/economy.js";
import { runTrade } from "./phases/trade.js";
import { runFinance } from "./phases/finance.js";
import { runSettlement } from "./phases/settlement.js";
import { runPolitics } from "./phases/politics.js";
import { runPirates } from "./phases/pirates.js";
import { runProjects } from "./phases/projects.js";
import { runShocks } from "./phases/shocks.js";
import { runFaith } from "./phases/faith.js";
import { runTech } from "./phases/tech.js";
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
  runFinance(w, rng);
  runSettlement(w, rng, alive);
  runPolitics(w, rng, alive);
  runPirates(w, rng, alive);
  runProjects(w, rng);
  runShocks(w, rng, alive);
  runFaith(w, rng, alive);
  runTech(w, rng, alive);
  recordYear(w, rng);
}
