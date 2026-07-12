// Cause & effect tests. The explanations are a pure derived view — assert they
// classify a war's flashpoint from its factors, name the real reason a staple is
// dear on handcrafted worlds, and (for the recorded war cause) never disturb the
// simulation's numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { warCause, explainScarcity, dearestStaple, explainWar } from "../src/sim/explain.js";
import { makeSystem, makeWorld } from "./helpers.js";

test("warCause reports the dominant flashpoint", () => {
  assert.equal(warCause({ holy: true, cd: 0.1, aggr: 0.3, border: 1, mutualTrade: 5 }).key, "creed");
  assert.equal(warCause({ holy: false, cd: 0.6, aggr: 0.3, border: 1, mutualTrade: 5 }).key, "culture");
  assert.equal(warCause({ holy: false, cd: 0.1, aggr: 0.3, border: 6, mutualTrade: 5 }).key, "border");
  assert.equal(warCause({ holy: false, cd: 0.1, aggr: 0.9, border: 1, mutualTrade: 5 }).key, "ambition");
  assert.equal(warCause({ holy: false, cd: 0.1, aggr: 0.3, border: 1, mutualTrade: 0.1 }).key, "estrangement");
  assert.equal(warCause({ holy: false, cd: 0.1, aggr: 0.3, border: 1, mutualTrade: 5 }).key, "rivalry");
  // a long front outweighs a mere creed difference
  assert.equal(warCause({ holy: true, cd: 0.1, aggr: 0.3, border: 6, mutualTrade: 5 }).key, "border");
});

test("the recorded war cause never perturbs the simulation", () => {
  assert.deepEqual(buildStats(runYears(42, 200)).summary, buildStats(runYears(42, 200)).summary);
  // and every declared war carries a cause the UI can read
  const w = runYears(7, 200);
  for (const rec of w.stats.wars) {
    assert.ok(rec.causeText, `war ${rec.a} vs ${rec.b} has no recorded cause`);
    assert.equal(explainWar(rec), rec.causeText);
  }
});

function runYears(seed, y) { const w = genGalaxy(seed); for (let i = 0; i < y; i++) simulateYear(w); return w; }

test("explainScarcity names why a staple is dear", () => {
  // a blockaded world: the siege is the first reason
  const besieged = makeSystem(0, { price: { grain: 2.4 }, siege: { by: 0, since: 5, pair: "x" } });
  const w1 = makeWorld({ systems: [besieged] });
  const r1 = explainScarcity(w1, besieged, "grain");
  assert.equal(r1[0].key, "siege");

  // a mined-out world: depletion explains the dear metals
  const tappedOut = makeSystem(0, { price: { metals: 2.5 }, min: 0.7, minRes: 40, minRes0: 1000 });
  const w2 = makeWorld({ systems: [tappedOut] });
  assert.ok(explainScarcity(w2, tappedOut, "metals").some((r) => r.key === "depletion"));

  // a good at its normal price has nothing to explain
  const calm = makeSystem(0, {});
  const w3 = makeWorld({ systems: [calm] });
  assert.deepEqual(explainScarcity(w3, calm, "grain"), []);
});

test("dearestStaple picks the good furthest above its base price", () => {
  const s = makeSystem(0, { price: { grain: 3.2, fuel: 1.2, medicine: 8 } }); // medicine base 5 → ×1.6
  const w = makeWorld({ systems: [s] });
  const dear = dearestStaple(w, s);
  assert.equal(dear.good, "grain"); // ×3.2 beats medicine ×1.6 and fuel ×0.75
  // nothing dear → null
  assert.equal(dearestStaple(w, makeSystem(1, {})), null);
});
