import { runEconomy } from "./phases/economy.js";
import { runTrade } from "./phases/trade.js";
import { runFinance } from "./phases/finance.js";
import { runSettlement } from "./phases/settlement.js";
import { runPolitics } from "./phases/politics.js";
import { runPirates } from "./phases/pirates.js";
import { runContraband } from "./phases/contraband.js";
import { runProjects } from "./phases/projects.js";
import { runShocks } from "./phases/shocks.js";
import { runFaith } from "./phases/faith.js";
import { runTech } from "./phases/tech.js";
import { recordYear } from "./phases/chronicle.js";

// ---------- yearly simulation ----------
// The year is an ordered list of phases. Phase order is a CONTRACT: each phase
// mutates the shared world object and later phases read what earlier ones wrote
// (e.g. trade fills `s.tradeIn` before politics taxes it). `alive` is snapshotted
// once per year, before the economy runs, and shared by every phase — a phase
// that starves a world to nothing must guard `s.pop <= 0.05` itself.
//
// The pipeline is exposed as data (`PHASES`) so tooling can name, reorder-audit,
// and — via the `onPhase` hook in `simulateYear` — inspect the world after each
// individual phase (see tests/invariants.test.js and docs/PHASES.md). Adding a
// mechanic means adding a `{ name, run }` entry here, not bolting behavior onto
// an unrelated phase.
export const PHASES = [
  { name: "economy", run: (w, rng, alive) => runEconomy(w, rng, alive) },
  { name: "trade", run: (w, rng) => runTrade(w, rng) },
  { name: "finance", run: (w, rng) => runFinance(w, rng) },
  { name: "settlement", run: (w, rng, alive) => runSettlement(w, rng, alive) },
  { name: "politics", run: (w, rng, alive) => runPolitics(w, rng, alive) },
  { name: "pirates", run: (w, rng, alive) => runPirates(w, rng, alive) },
  { name: "contraband", run: (w, rng, alive) => runContraband(w, rng, alive) },
  { name: "projects", run: (w, rng) => runProjects(w, rng) },
  { name: "shocks", run: (w, rng, alive) => runShocks(w, rng, alive) },
  { name: "faith", run: (w, rng, alive) => runFaith(w, rng, alive) },
  { name: "tech", run: (w, rng, alive) => runTech(w, rng, alive) },
  { name: "chronicle", run: (w, rng) => recordYear(w, rng) },
];

// Advance the world one year. `onPhase(name, w)` — if given — is called after
// each phase completes; it is a pure observer (used by tests to assert the
// invariants hold at every step), so it must not touch the rng or mutate `w`.
export function simulateYear(w, onPhase) {
  const rng = w.rng;
  w.year++;

  const alive = w.systems.filter((s) => s.pop > 0.05);

  for (const p of PHASES) {
    p.run(w, rng, alive);
    if (onPhase) onPhase(p.name, w);
  }
}
