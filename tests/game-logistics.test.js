// Logistics depth: standing routes (automation) and corsair hazard (risk +
// insurance). Routes must shuttle a ship on autopilot; raids must be
// deterministic, share the sim's raid geography, and — with piracy and routes
// both active — still leave the macro-simulation byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { rebuildAdj } from "../src/sim/index.js";
import { T } from "../src/sim/constants.js";
import { Game } from "../src/game/game.js";
import { commission, setRoute, setInsurance } from "../src/game/actions.js";
import { SHIP_CLASSES } from "../src/game/corp.js";
import { pathExposure, raidedSet, raidRng } from "../src/game/piracy.js";
import { makeSystem, makeFaction, makeEdge, makeWorld } from "./helpers.js";

function newGame(seed = 42, opts = {}) {
  const w = genGalaxy(seed);
  for (let i = 0; i < 120; i++) simulateYear(w);
  return new Game(w, { cash: 1000, ...opts });
}

test("a standing route shuttles a ship and trades on autopilot", () => {
  const g = newGame();
  commission(g, "freighter");
  const ship = g.corp.ships[0];
  const home = ship.location;
  const dest = g.w.adj[home].map(({ to }) => to).find((id) => g.w.systems[id].pop > 0.05);
  const r = setRoute(g, ship.id, [
    { sys: home, buy: [{ good: "grain", qty: 15 }] },
    { sys: dest, sell: ["grain"] },
  ]);
  assert.ok(r.ok, r.error);
  g.stepDay(150);
  assert.ok(g.corp.stats.trades >= 2, `route should have bought and sold, got ${g.corp.stats.trades} trades`);
  assert.ok(g.corp.ledger.some((e) => e.text.startsWith("bought")), "a route buy happened");
  assert.ok(g.corp.ledger.some((e) => e.text.startsWith("sold")), "a route sell happened");
  assert.ok(ship.route.leg === 0 || ship.route.leg === 1, "route cycling");
});

test("routes reject malformed orders", () => {
  const g = newGame();
  commission(g, "clipper");
  const id = g.corp.ships[0].id;
  assert.equal(setRoute(g, id, [{ sys: 0 }]).ok, false, "needs >= 2 stops");
  assert.equal(setRoute(g, id, [{ sys: 0 }, { sys: 9999 }]).ok, false, "bad system");
  assert.equal(setRoute(g, id, [{ sys: 0, sell: ["gold"] }, { sys: 1 }]).ok, false, "bad good");
});

test("raid exposure follows the sim's corsair geography", () => {
  // a chain of six systems with a haven at one end; RAID_JUMPS reaches partway
  const sys = Array.from({ length: 6 }, (_, i) => makeSystem(i, { x: i * 40, pop: 5 }));
  const edges = [0, 1, 2, 3, 4].map((i) => makeEdge(i, i + 1, sys));
  const haven = makeFaction(0, { gov: "pirate", capital: 0 });
  sys[0].fid = 0;
  const w = makeWorld({ systems: sys, factions: [haven], edges });
  rebuildAdj(w);
  const raided = raidedSet(w);
  assert.ok(raided.has(0) && raided.has(T.RAID_JUMPS), "reaches RAID_JUMPS gates out");
  assert.equal(pathExposure(w, [0, 1, 2]), 1, "deep in raided waters");
  assert.equal(pathExposure(w, [5]), 0, "beyond the corsairs' reach");
  assert.ok(pathExposure(w, [T.RAID_JUMPS, T.RAID_JUMPS + 1, 5]) < 1, "partial exposure at the edge");
});

test("a raid skims cargo, and insurance reimburses the loss", () => {
  const g = newGame(7);
  commission(g, "bulk");
  const ship = g.corp.ships[0];
  ship.location = null;
  ship.cargo = { metals: 40 };
  ship.transit = { dest: 0, from: 1, dist: 1e9, remaining: 1e9, path: [], exposure: 1 };
  // find a day whose deterministic roll lands a raid (chance ~ BASE_DAILY)
  let day = 0;
  while (raidRng(g.w, ship.id, day).n() >= 0.05 * (g.w.cfg.piracy ?? 1)) day++;
  g.corp.day = day;
  g._maybeRaid(ship);
  assert.ok(ship.cargo.metals < 40, "corsairs skimmed the hold");
  assert.equal(g.corp.stats.raided, 1);

  // insured this time: the underwriter pays out
  setInsurance(g, true);
  ship.cargo = { metals: 40 };
  let d2 = day + 1;
  while (raidRng(g.w, ship.id, d2).n() >= 0.05 * (g.w.cfg.piracy ?? 1)) d2++;
  g.corp.day = d2;
  const cash0 = g.corp.cash;
  g._maybeRaid(ship);
  assert.ok(g.corp.cash > cash0, "insurance paid out on the loss");
});

test("insurance costs a premium on top of upkeep", () => {
  const bare = newGame(); commission(bare, "freighter");
  const safe = newGame(); commission(safe, "freighter"); setInsurance(safe, true);
  const c0b = bare.corp.cash, c0s = safe.corp.cash;
  bare.stepDay(bare.clock.daysPerYear);
  safe.stepDay(safe.clock.daysPerYear);
  const extra = (c0s - safe.corp.cash) - (c0b - bare.corp.cash);
  assert.ok(Math.abs(extra - SHIP_CLASSES.freighter.cost * 0.06) < 1e-2, `premium ~ 6% of hull, got ${extra}`);
});

test("routes + piracy stay deterministic and never perturb the macro-sim", () => {
  const script = (g) => {
    commission(g, "freighter");
    const home = g.corp.ships[0].location;
    const dest = g.w.adj[home].map(({ to }) => to).find((id) => g.w.systems[id].pop > 0.05);
    setInsurance(g, true);
    setRoute(g, g.corp.ships[0].id, [
      { sys: home, buy: [{ good: "grain", qty: 20 }] },
      { sys: dest, sell: ["grain"] },
    ]);
    g.stepDay(g.clock.daysPerYear * 3);
  };
  const a = newGame(11); script(a);
  const b = newGame(11); script(b);
  assert.deepEqual(a.corp.ships, b.corp.ships);
  assert.equal(a.corp.cash, b.corp.cash);

  const plain = genGalaxy(11);
  for (let i = 0; i < a.w.year; i++) simulateYear(plain);
  assert.deepEqual(buildStats(a.w).summary, buildStats(plain).summary);
});
