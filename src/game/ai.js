import { GOODS, FREIGHT_COST } from "../sim/constants.js";
import { SHIP_CLASSES } from "./corp.js";
import { allDistances } from "./pathfind.js";
import { commission, setRoute } from "./actions.js";

// ---------------------------------------------------------------------------
// A scripted AI corporation — a competent greedy trader. It exists to exercise
// and BALANCE the tycoon economy: run it across the seed matrix and watch
// whether a sensible player grows steadily, treads water, or dies. Deterministic
// (no rng), so it is a stable yardstick. Not the game's opponent AI — a probe.
// ---------------------------------------------------------------------------

const MAX_FLEET = 6;

// the best two-way arbitrage pair from system `A`: a partner B and the goods to
// carry each way, netting out freight over the distance
function bestPair(game, A) {
  const view = game.view();
  const pa = view.sys[A].price;
  const dist = allDistances(game.w, A);
  let best = null;
  for (const s of game.w.systems) {
    if (s.id === A || s.pop <= 0.05 || !Number.isFinite(dist[s.id]) || dist[s.id] > 320) continue;
    const pb = view.sys[s.id].price;
    let gX = null, mX = 0, gY = null, mY = 0;
    for (const g of GOODS) {
      const freight = (dist[s.id] / 220) * FREIGHT_COST[g];
      const out = pb[g] - pa[g] - freight;    // carry g from A to B
      const back = pa[g] - pb[g] - freight;   // carry g from B to A
      if (out > mX) { mX = out; gX = g; }
      if (back > mY) { mY = back; gY = g; }
    }
    const total = mX + mY;
    if (gX && gY && (!best || total > best.total)) best = { B: s.id, gX, gY, total };
  }
  return best;
}

/** Assign idle ships the best round-trip route they can find, from their berth. */
export function assignRoutes(game) {
  for (const sh of game.corp.ships) {
    if (sh.location == null || sh.route) continue;
    const cap = SHIP_CLASSES[sh.class].cargo;
    const pair = bestPair(game, sh.location);
    if (!pair || pair.total <= 0.2) continue; // no worthwhile lane from here
    setRoute(game, sh.id, [
      { sys: sh.location, buy: [{ good: pair.gX, qty: cap }], sell: [pair.gY] },
      { sys: pair.B, buy: [{ good: pair.gY, qty: cap }], sell: [pair.gX] },
    ]);
  }
}

/**
 * Play the AI corp for `years`: each year, grow the fleet when flush, keep every
 * hull on its best route, then let the days run.
 * @returns the game (mutated)
 */
export function runAi(game, years) {
  for (let y = 0; y < years; y++) {
    if (game.corp.cash > 250 && game.corp.ships.length < MAX_FLEET) commission(game, "freighter");
    assignRoutes(game);
    game.stepDay(game.clock.daysPerYear);
  }
  return game;
}
