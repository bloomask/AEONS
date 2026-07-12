// Player-corporation tests: the hand-steered trade & logistics loop. A ship is
// commissioned, loaded, dispatched across the gate network, and unloaded; cash,
// cargo, slippage, upkeep, and net worth all resolve deterministically — and the
// player, a price-taker for now, never perturbs the macro-simulation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { Game } from "../src/game/game.js";
import { commission, buy, sell, dispatch, maxBuy } from "../src/game/actions.js";
import { SHIP_CLASSES, shipCargoQty, netWorth } from "../src/game/corp.js";
import { clamp } from "../src/sim/util.js";

function newGame(seed = 42, opts = {}) {
  const w = genGalaxy(seed);
  for (let i = 0; i < 120; i++) simulateYear(w); // start after some history
  return new Game(w, { cash: 1000, ...opts });
}

test("commissioning a ship spends cash and adds a hull at HQ", () => {
  const g = newGame();
  const cash0 = g.corp.cash;
  const r = commission(g, "freighter");
  assert.ok(r.ok);
  assert.equal(g.corp.ships.length, 1);
  assert.equal(g.corp.cash, cash0 - SHIP_CLASSES.freighter.cost);
  assert.equal(r.ship.location, g.corp.home);
});

test("buying loads cargo, costs cash, and prices in slippage", () => {
  const g = newGame();
  commission(g, "bulk");
  const ship = g.corp.ships[0];
  const sv = g.view().sys[ship.location];
  const qty = 10;
  const cash0 = g.corp.cash;
  const expSlip = clamp(qty / (sv.stock.grain + qty), 0, 0.5);
  const expUnit = sv.price.grain * (1 + expSlip);
  const r = buy(g, ship.id, "grain", qty);
  assert.ok(r.ok, r.error);
  assert.ok(Math.abs(r.unit - expUnit) < 1e-3, "fill price includes slippage");
  assert.equal(ship.cargo.grain, qty);
  assert.ok(Math.abs(g.corp.cash - (cash0 - r.cost)) < 1e-6);
});

test("bad orders are rejected, not silently clamped", () => {
  const g = newGame();
  commission(g, "clipper");
  const ship = g.corp.ships[0];
  assert.equal(buy(g, ship.id, "grain", 9999).ok, false);       // over capacity
  assert.equal(buy(g, ship.id, "notagood", 1).ok, false);       // not tradable
  assert.equal(sell(g, ship.id, "grain", 1).ok, false);         // nothing aboard
  assert.equal(dispatch(g, ship.id, ship.location).ok, false);  // already there
});

test("a dispatched ship travels and arrives after roughly its ETA", () => {
  const g = newGame();
  commission(g, "clipper");
  const ship = g.corp.ships[0];
  const dest = g.w.systems.find((s) => s.id !== ship.location && s.pop > 0.05).id;
  const r = dispatch(g, ship.id, dest);
  assert.ok(r.ok, r.error);
  assert.equal(ship.location, null, "in transit");
  g.stepDay(r.eta + 1);
  assert.equal(ship.location, dest, "arrived at destination");
  assert.equal(ship.transit, null);
});

test("a full run moves goods and settles cash by the destination price", () => {
  const g = newGame();
  commission(g, "freighter");
  const ship = g.corp.ships[0];
  const home = ship.location;
  buy(g, ship.id, "grain", 15);
  const dest = g.w.systems.find((s) => s.id !== home && s.pop > 0.05).id;
  const d = dispatch(g, ship.id, dest);
  g.stepDay(d.eta + 1);
  const sv = g.view().sys[dest];
  const held = ship.cargo.grain;
  const cash0 = g.corp.cash;
  const r = sell(g, ship.id, "grain", held);
  assert.ok(r.ok, r.error);
  assert.equal(shipCargoQty(ship), 0, "hold emptied");
  assert.ok(Math.abs(g.corp.cash - (cash0 + r.revenue)) < 1e-6);
  assert.ok(r.unit <= sv.price.grain + 1e-9, "sell price is at or below spot (slippage)");
});

test("idle ships still cost upkeep over the year", () => {
  const g = newGame();
  commission(g, "freighter");
  const cash0 = g.corp.cash;
  g.stepDay(g.clock.daysPerYear);
  const spent = cash0 - g.corp.cash;
  assert.ok(Math.abs(spent - SHIP_CLASSES.freighter.upkeep) < 1e-3, `~1 year of upkeep, got ${spent}`);
});

test("net worth counts cash, hulls, and cargo", () => {
  const g = newGame();
  const nw0 = g.netWorth();
  assert.equal(nw0, g.corp.cash, "no ships yet");
  commission(g, "freighter");
  buy(g, g.corp.ships[0].id, "grain", 10);
  const nw = netWorth(g.corp, g.view());
  assert.ok(nw > g.corp.cash, "hull resale + cargo add value beyond cash");
});

test("the same seed + same orders replays identically", () => {
  const script = (g) => {
    commission(g, "freighter");
    buy(g, g.corp.ships[0].id, "grain", 12);
    const dest = g.w.systems.find((s) => s.id !== g.corp.ships[0].location && s.pop > 0.05).id;
    dispatch(g, g.corp.ships[0].id, dest);
    g.stepDay(30);
  };
  const a = newGame(7); script(a);
  const b = newGame(7); script(b);
  assert.deepEqual(a.corp.ships, b.corp.ships);
  assert.equal(a.corp.cash, b.corp.cash);
});

test("trading never perturbs the macro-simulation (price-taker)", () => {
  // a busily-trading game must leave the galaxy's history byte-identical to a
  // plain run of the same seed advanced the same number of years
  const g = newGame(3);
  commission(g, "bulk");
  for (let k = 0; k < 6; k++) {
    const sh = g.corp.ships[0];
    if (sh.location != null) {
      buy(g, sh.id, "metals", 20);
      const dest = g.w.systems.find((s) => s.id !== sh.location && s.pop > 0.05).id;
      dispatch(g, sh.id, dest);
    }
    g.stepDay(g.clock.daysPerYear); // advance a full year each loop
  }
  const plain = genGalaxy(3);
  for (let i = 0; i < g.w.year; i++) simulateYear(plain);
  assert.deepEqual(buildStats(g.w).summary, buildStats(plain).summary);
});
