// AI-player balance probe: a scripted greedy trader run across seeds. It checks
// the tycoon economy is sane — a competent player neither explodes to infinity
// nor death-spirals — and, being a pure trader, never perturbs the macro-sim.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { newGame } from "../src/game/game.js";
import { runAi } from "../src/game/ai.js";

test("the AI trader is deterministic", () => {
  const a = runAi(newGame(42, { cash: 600 }), 30);
  const b = runAi(newGame(42, { cash: 600 }), 30);
  assert.equal(a.netWorth(), b.netWorth());
  assert.deepEqual(a.corp.ships, b.corp.ships);
});

test("the tycoon economy stays sane across the seed matrix", () => {
  // a broad guard-rail: not NaN, not runaway-rich, not a bottomless money pit.
  // If a tuning change breaks the trade economy, this is where it shows.
  for (const seed of [1, 7, 42, 101, 777]) {
    const g = runAi(newGame(seed, { cash: 600 }), 40);
    const nw = g.netWorth();
    assert.ok(Number.isFinite(nw), `seed ${seed}: net worth non-finite`);
    assert.ok(nw > -2000 && nw < 5e6, `seed ${seed}: net worth ${nw} outside a sane band`);
    assert.ok(Number.isFinite(g.corp.cash), `seed ${seed}: cash non-finite`);
  }
});

test("a pure-trading AI never perturbs the macro-sim", () => {
  const g = runAi(newGame(3, { cash: 600 }), 25);
  const plain = genGalaxy(3);
  for (let i = 0; i < g.w.year; i++) simulateYear(plain);
  assert.deepEqual(buildStats(g.w).summary, buildStats(plain).summary);
});
