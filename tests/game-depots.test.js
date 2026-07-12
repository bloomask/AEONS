// Depots & warehousing: own storage at a system to stockpile goods and time the
// market. Still price-taking — depots hold the corp's own cargo, never the
// world's — so the macro-sim stays byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { Game } from "../src/game/game.js";
import { commission, buy, store, load, buildDepot, DEPOT } from "../src/game/actions.js";
import { netWorth } from "../src/game/corp.js";

function newGame(seed = 42) {
  const w = genGalaxy(seed);
  for (let i = 0; i < 120; i++) simulateYear(w);
  return new Game(w, { cash: 1000 });
}

test("building a depot costs cash and stands at the system", () => {
  const g = newGame();
  const cash0 = g.corp.cash;
  const r = buildDepot(g, g.corp.home);
  assert.ok(r.ok, r.error);
  assert.equal(g.corp.cash, cash0 - DEPOT.COST);
  assert.ok(g.corp.depots[g.corp.home], "depot recorded at HQ");
  assert.equal(buildDepot(g, g.corp.home).ok, false, "no second depot on one world");
});

test("cargo moves between ship and depot and is valued in net worth", () => {
  const g = newGame();
  commission(g, "freighter");
  const ship = g.corp.ships[0];
  buildDepot(g, ship.location);
  buy(g, ship.id, "grain", 30);
  assert.ok(store(g, ship.id, "grain", 20).ok);
  assert.equal(ship.cargo.grain, 10, "20 offloaded to the depot");
  assert.equal(g.corp.depots[ship.location].stock.grain, 20);
  // warehoused goods count toward net worth
  const nw = netWorth(g.corp, g.view());
  assert.ok(nw > g.corp.cash, "depot stock adds value");
  // and can be loaded back
  assert.ok(load(g, ship.id, "grain", 5).ok);
  assert.equal(ship.cargo.grain, 15);
  assert.equal(g.corp.depots[ship.location].stock.grain, 15);
});

test("depot moves reject impossible orders", () => {
  const g = newGame();
  commission(g, "clipper");
  const ship = g.corp.ships[0];
  assert.equal(store(g, ship.id, "grain", 5).ok, false, "no depot here yet");
  buildDepot(g, ship.location);
  assert.equal(store(g, ship.id, "grain", 5).ok, false, "nothing aboard to store");
  assert.equal(load(g, ship.id, "grain", 5).ok, false, "depot is empty");
});

test("depots cost upkeep but never perturb the macro-sim", () => {
  const g = newGame();
  const cash0 = g.corp.cash;
  buildDepot(g, g.corp.home);
  g.stepDay(g.clock.daysPerYear);
  const spent = cash0 - DEPOT.COST - g.corp.cash;
  assert.ok(Math.abs(spent - DEPOT.UPKEEP) < 1e-2, `~1 year of depot upkeep, got ${spent}`);

  const plain = genGalaxy(42);
  for (let i = 0; i < g.w.year; i++) simulateYear(plain);
  assert.deepEqual(buildStats(g.w).summary, buildStats(plain).summary);
});
