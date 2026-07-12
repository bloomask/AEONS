// Save/load by replay and the sandbox scorecard. Because the whole game is
// seed + config + an ordered action log, a save is small text and a load
// reproduces the game exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStats } from "../src/sim/index.js";
import { newGame } from "../src/game/game.js";
import { apply } from "../src/game/commands.js";
import { serialize, load } from "../src/game/save.js";
import { scorecard } from "../src/game/score.js";

// drive a representative session entirely through the command layer
function play(seed = 42) {
  const g = newGame(seed, { cash: 3000, burnYears: 120, corpName: "Test Combine" });
  const home = g.corp.home;
  apply(g, { t: "commission", cls: "freighter" });
  const sh = g.corp.ships[0].id;
  apply(g, { t: "buildDepot", sys: home });
  apply(g, { t: "buy", ship: sh, good: "grain", qty: 10 });
  apply(g, { t: "step", n: 20 });
  const dest = g.w.adj[home].map(({ to }) => to).find((id) => g.w.systems[id].pop > 0.05);
  apply(g, { t: "dispatch", ship: sh, dest });
  apply(g, { t: "step", n: g.clock.daysPerYear });
  const seat = g.w.systems.find((s) => s.pop > 0.05 && s.fid === null);
  if (seat) { apply(g, { t: "foundState", seat: seat.id }); apply(g, { t: "tariff", rate: 0.2 }); }
  apply(g, { t: "step", n: g.clock.daysPerYear * 2 });
  return g;
}

test("a save round-trips to a byte-identical game", () => {
  const g = play(42);
  const save = serialize(g);
  assert.equal(typeof save, "string");
  const g2 = load(save);
  assert.equal(g2.w.year, g.w.year);
  assert.equal(g2.corp.cash, g.corp.cash);
  assert.equal(g2.factionId, g.factionId);
  assert.deepEqual(g2.corp.ships, g.corp.ships);
  assert.deepEqual(g2.corp.holdings, g.corp.holdings);
  assert.deepEqual(buildStats(g2.w).summary, buildStats(g.w).summary);
});

test("the save is compact text carrying genesis + action log", () => {
  const g = play(7);
  const save = JSON.parse(serialize(g));
  assert.equal(save.genesis.seed, 7);
  assert.ok(Array.isArray(save.log) && save.log.length > 0);
  // rejected orders are not recorded — only actions that took effect
  apply(g, { t: "buy", ship: 999, good: "grain", qty: 1 }); // no such ship
  assert.equal(JSON.parse(serialize(g)).log.length, save.log.length);
});

test("loading is itself deterministic", () => {
  const save = serialize(play(3));
  const a = load(save), b = load(save);
  assert.deepEqual(buildStats(a.w).summary, buildStats(b.w).summary);
  assert.equal(a.corp.cash, b.corp.cash);
});

test("the scorecard measures the empire", () => {
  const g = play(42);
  const sc = scorecard(g);
  assert.equal(sc.year, g.year);
  assert.ok(sc.netWorth > 0 && sc.fleet >= 1 && sc.depots >= 1);
  assert.equal(sc.hasState, g.factionId != null);
  assert.equal(sc.milestones.sovereign, g.factionId != null);
  assert.equal(sc.milestones.landlord, g.corp.holdings.length > 0);
  assert.ok(sc.rank >= 1 && sc.rank <= sc.ofPlayers);
});
