// Territory & statecraft: the corp founds a real power on the map and rules it.
// A player faction is flagged so the sim runs its economy but never revolts,
// secedes, collapses, or expands it autonomously; and a galaxy with NO player
// faction stays byte-identical (the guards are inert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { Game } from "../src/game/game.js";
import { foundState, annex, colonize, setTariff, stateTransfer, STATE } from "../src/game/statecraft.js";

function newGame(seed = 42, cash = 3000) {
  const w = genGalaxy(seed);
  for (let i = 0; i < 120; i++) simulateYear(w);
  return new Game(w, { cash });
}

test("headless simulation is byte-identical (player guards are inert)", () => {
  const a = genGalaxy(9), b = genGalaxy(9);
  for (let i = 0; i < 300; i++) { simulateYear(a); simulateYear(b); }
  assert.deepEqual(buildStats(a).summary, buildStats(b).summary);
});

test("chartering a state raises a real, player-flagged power on the map", () => {
  const g = newGame();
  const seat = g.w.systems.find((s) => s.pop > 0.05 && s.fid === null).id;
  const cash0 = g.corp.cash;
  const r = foundState(g, seat, "Vessari Combine");
  assert.ok(r.ok, r.error);
  assert.equal(g.corp.cash, cash0 - STATE.CHARTER_COST);
  const f = g.w.factions[g.factionId];
  assert.ok(f && f.player, "the faction is flagged player-controlled");
  assert.equal(f.gov, "corporate");
  assert.equal(g.w.systems[seat].fid, f.id, "the seat flies the flag");
  assert.equal(foundState(g, seat).ok, false, "only one charter");
});

test("a chartered state annexes free worlds and founds colonies", () => {
  const g = newGame();
  const seat = g.w.systems.find((s) => s.pop > 0.05 && s.fid === null).id;
  foundState(g, seat);
  const free = g.w.systems.find((s) => s.pop > 0.05 && s.fid === null && s.id !== seat);
  if (free) { assert.ok(annex(g, free.id).ok); assert.equal(free.fid, g.factionId); }
  const empty = g.w.systems.find((s) => s.pop <= 0.05 && !s.ruined && s.hab > 0.4);
  if (empty) {
    assert.ok(colonize(g, empty.id, 60).ok);
    assert.ok(empty.pop > 0.05, "the colony is settled");
    assert.equal(empty.fid, g.factionId, "under the corp's flag");
  }
});

test("governing sets tariffs and moves money to and from the treasury", () => {
  const g = newGame();
  foundState(g, g.w.systems.find((s) => s.pop > 0.05 && s.fid === null).id);
  assert.ok(setTariff(g, 0.25).ok);
  assert.equal(g.w.factions[g.factionId].tariff, 0.25);
  assert.equal(setTariff(g, 9).tariff, 0.5, "tariff capped at 0.5");
  const cash0 = g.corp.cash, tr0 = g.w.factions[g.factionId].treasury;
  stateTransfer(g, 100);
  assert.equal(g.corp.cash, cash0 - 100);
  assert.equal(g.w.factions[g.factionId].treasury, tr0 + 100);
  stateTransfer(g, -50);
  assert.equal(g.w.factions[g.factionId].treasury, tr0 + 50);
});

test("a player state persists where an AI one would have collapsed", () => {
  const g = newGame();
  foundState(g, g.w.systems.find((s) => s.pop > 0.05 && s.fid === null).id);
  const f = g.w.factions[g.factionId];
  f.treasury = -200; f.stability = 0.05; // conditions that kill an AI faction
  g.stepDay(g.clock.daysPerYear * 2);
  assert.equal(f.dead, false, "the player's power does not auto-collapse");
});

test("statecraft is deterministic in the seed and orders", () => {
  const script = (g) => {
    foundState(g, g.w.systems.find((s) => s.pop > 0.05 && s.fid === null).id);
    setTariff(g, 0.2);
    const empty = g.w.systems.find((s) => s.pop <= 0.05 && !s.ruined && s.hab > 0.4);
    if (empty) colonize(g, empty.id, 60);
    g.stepDay(g.clock.daysPerYear * 3);
  };
  const a = newGame(7); script(a);
  const b = newGame(7); script(b);
  assert.deepEqual(buildStats(a.w).summary, buildStats(b.w).summary);
  assert.equal(a.corp.cash, b.corp.cash);
});
