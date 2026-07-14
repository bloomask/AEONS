// Focused phase tests — small handcrafted worlds with predictable outcomes,
// one mechanic at a time. Where the full-run tests prove the whole engine stays
// coherent, these pin down what each individual phase is supposed to DO, so a
// balance or refactor change that quietly breaks (say) trade arbitrage or
// abolition fails here with a pointed message instead of drifting a summary stat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runEconomy } from "../src/sim/phases/economy.js";
import { runTrade } from "../src/sim/phases/trade.js";
import { runFinance } from "../src/sim/phases/finance.js";
import { runSettlement } from "../src/sim/phases/settlement.js";
import { runContraband } from "../src/sim/phases/contraband.js";
import { runShocks } from "../src/sim/phases/shocks.js";
import { runWarYear } from "../src/sim/phases/politics/war.js";
import { getRel } from "../src/sim/events.js";
import { checkInvariants } from "../src/sim/invariants.js";
import { makeSystem, makeFaction, makeHouse, makeEdge, makeWorld, fixedRng, alive } from "./helpers.js";

// ---------------- economy ----------------
test("economy: a fertile, farming world grows grain and stays lawful", () => {
  const s = makeSystem(0, { fert: 0.9, pop: 10, wealth: 60, stock: { grain: 5 },
    shares: Object.fromEntries([["grain", 0.6]]) });
  const w = makeWorld({ systems: [s] });
  runEconomy(w, w.rng, alive(w));
  assert.ok(s.stock.grain > 5, `grain should accumulate from farming, got ${s.stock.grain}`);
  assert.ok(s.classWb.worker <= 1 && s.classWb.worker > 0, "worker wellbeing in band");
  assert.deepEqual(checkInvariants(w), [], "economy leaves a lawful world");
});

test("economy: a barren, cut-off world famines and loses population", () => {
  // no fertility, no grain, no imports → grain satisfaction 0 → famine
  const s = makeSystem(0, { fert: 0, pop: 20, stock: { grain: 0 },
    shares: Object.fromEntries([["grain", 0]]) });
  const w = makeWorld({ systems: [s] });
  const before = s.pop;
  runEconomy(w, w.rng, alive(w));
  assert.ok(s.pop < before, `famine should cull pop (${before} → ${s.pop})`);
  assert.equal(s.lastFamine, w.year, "famine year recorded");
  assert.equal(w.stats.c.famine, 1, "a famine event was counted");
});

// ---------------- trade ----------------
test("trade: goods flow down the price gradient across a gate", () => {
  // A: cheap, well-stocked grain. B: dear grain and coin to buy it.
  const A = makeSystem(0, { x: 0, wealth: 200, stock: { grain: 100 }, price: { grain: 0.5 } });
  const B = makeSystem(1, { x: 40, wealth: 200, stock: { grain: 2 }, price: { grain: 4 } });
  const w = makeWorld({ systems: [A, B], edges: [makeEdge(0, 1, [A, B])], cfg: { freight: 0.4 } });
  const a0 = A.stock.grain, b0 = B.stock.grain;
  runTrade(w, w.rng);
  assert.ok(A.stock.grain < a0, "seller ships grain out");
  assert.ok(B.stock.grain > b0, "buyer receives grain");
  assert.ok(w.edges[0].vol > 0, "the lane carries volume");
  assert.deepEqual(checkInvariants(w), []);
});

// ---------------- finance ----------------
test("finance: a corp lender floats a loan to a promising, broke world", () => {
  const home = makeSystem(0, { pop: 5, wealth: 300 });
  const borrower = makeSystem(1, { pop: 8, wealth: 3, dev: 0.9, lastFamine: -99 });
  const lender = makeHouse(0, { home: 0, corp: true, wealth: 400 });
  const w = makeWorld({ systems: [home, borrower], houses: [lender], rng: fixedRng(0) });
  runFinance(w, w.rng); // fixedRng(0) forces the rng.chance gate
  assert.equal(w.loans.length, 1, "exactly one loan floated");
  assert.equal(w.loans[0].kind, "sys");
  assert.equal(w.loans[0].bid, 1);
  assert.ok(borrower.wealth > 3, "the loan credited the borrower");
  assert.equal(w.stats.c.loanMade, 1);
});

test("finance: a serviced loan pays interest back to the lender", () => {
  const sys = makeSystem(0, { pop: 8, wealth: 300 });
  const lender = makeHouse(0, { home: 0, corp: true, wealth: 400 });
  const w = makeWorld({ systems: [sys], houses: [lender], rng: fixedRng(0.9999) });
  w.loans = [{ kind: "sys", bid: 0, lender: 0, principal: 100, rate: 0.1, since: w.year - 1, missed: 0 }];
  const cash0 = sys.wealth, lend0 = lender.wealth;
  runFinance(w, w.rng); // fixedRng(0.9999) suppresses new lending — isolate servicing
  assert.ok(sys.wealth < cash0, "borrower paid interest (and amortized)");
  assert.ok(lender.wealth > lend0, "lender received the payment");
  assert.ok(w.loans[0].principal < 100, "principal amortized down");
});

// ---------------- settlement ----------------
test("settlement: a world below the life threshold dies and is wiped clean", () => {
  // capital lives on sys 1 so the death doesn't cascade into faction collapse
  const dying = makeSystem(0, { pop: 0.03, fid: 0, slaves: 2, siege: { by: 0, since: 1, pair: "x" } });
  const seat = makeSystem(1, { pop: 10, fid: 0 });
  const f = makeFaction(0, { capital: 1 });
  const w = makeWorld({ systems: [dying, seat], factions: [f] });
  runSettlement(w, w.rng, alive(w));
  assert.ok(dying.ruined, "the world is marked a ruin");
  assert.equal(dying.pop, 0, "a ruin holds no one");
  assert.equal(dying.fid, null, "a ruin flies no flag");
  assert.equal(dying.slaves, 0, "a ruin holds no bonded population");
  assert.equal(dying.siege, null, "a ruin holds no siege");
  assert.equal(w.stats.deaths.length, 1, "the death is chronicled");
  assert.equal(dying.failedSettlements, 1, "the failed site remembers its collapse");
  assert.equal(dying.failure.ownerId, f.id, "the failure ledger records the responsible power");
  assert.equal(dying.failure.finalPop, 0.03, "the final population is preserved before cleanup");
  assert.ok(dying.failure.factors.length > 0, "the failure ledger explains contributing conditions");
  assert.deepEqual(checkInvariants(w), [], "a settled ruin passes every invariant");
});

test("settlement: powers launch provisioned colonies only from durable surplus", () => {
  const source = makeSystem(0, {
    pop: 20, fid: 0, wb: 0.82, wealth: 100, settledYear: 0,
    stock: { grain: 100 },
  });
  const target = makeSystem(1, { pop: 0, hab: 0.8, fert: 0.6, settledYear: null, peakPop: 0 });
  const f = makeFaction(0, { capital: 0, treasury: 120 });
  const w = makeWorld({
    systems: [source, target], factions: [f], edges: [makeEdge(0, 1, [source, target])],
    year: 50, rng: fixedRng(0),
  });
  runSettlement(w, w.rng, alive(w));
  assert.ok(target.pop >= 1.5, `a viable expedition carries a durable population, got ${target.pop}`);
  assert.ok(target.stock.grain >= target.pop * 8, "the colony begins with at least eight years of grain reserves");
  assert.equal(target.fid, f.id);
  assert.equal(source.lastColonyYear, w.year, "the source enters a launch cooldown");
  assert.ok(f.treasury < 120, "the sponsoring power pays for the expedition");
});

test("settlement: powers support young colonies instead of abandoning them", () => {
  const parent = makeSystem(0, { pop: 20, fid: 0, settledYear: 0 });
  const colony = makeSystem(1, {
    pop: 2, fid: 0, settledYear: 92, colonyFrom: 0,
    stock: { grain: 0 },
  });
  const f = makeFaction(0, { capital: 0, treasury: 100 });
  const w = makeWorld({
    systems: [parent, colony], factions: [f], edges: [makeEdge(0, 1, [parent, colony])],
    year: 100, rng: fixedRng(0.9999),
  });
  runSettlement(w, w.rng, alive(w));
  assert.equal(colony.stock.grain, colony.pop * 2, "the colony receives a two-year strategic grain reserve");
  assert.ok(f.treasury < 100, "the owning power bears the support cost");
});

test("settlement: repeatedly failed sites are not immediately recolonised", () => {
  const source = makeSystem(0, { pop: 20, fid: 0, wb: 0.82, wealth: 100, stock: { grain: 100 } });
  const ruin = makeSystem(1, {
    pop: 0, hab: 0.8, fert: 0.7, ruined: true, diedYear: 30,
    settledYear: 0, failedSettlements: 1,
  });
  const f = makeFaction(0, { capital: 0, treasury: 120 });
  const w = makeWorld({
    systems: [source, ruin], factions: [f], edges: [makeEdge(0, 1, [source, ruin])],
    year: 100, rng: fixedRng(0),
  });
  runSettlement(w, w.rng, alive(w));
  assert.equal(ruin.pop, 0, "one prior failure requires 90 quiet years before another autonomous attempt");
  assert.ok(ruin.ruined);
});

// ---------------- contraband ----------------
test("contraband: abolition frees slaves held under a republic", () => {
  const s = makeSystem(0, { pop: 10, slaves: 3, fid: 0 });
  const f = makeFaction(0, { gov: "republic", capital: 0 });
  const w = makeWorld({ systems: [s], factions: [f] });
  runContraband(w, w.rng, alive(w));
  assert.equal(s.slaves, 0, "abolition strikes every chain");
  assert.ok(s.pop > 10, "the freed swell the population");
  assert.equal(w.stats.c.slavesFreed, 1);
  assert.deepEqual(checkInvariants(w), [], "no republic world holds slaves after contraband");
});

test("contraband: an outlaw free world refines narcotics; a lawful one does not", () => {
  const vice = makeSystem(0, { outlaw: true, fid: null, pop: 20, dev: 1, stock: { grain: 50 } });
  const lawful = makeSystem(1, { outlaw: false, fid: null, pop: 20, dev: 1, stock: { grain: 50 } });
  const w = makeWorld({ systems: [vice, lawful] });
  runContraband(w, w.rng, alive(w));
  assert.ok(vice.drugs > 0, "the outlaw world refines narcotics");
  assert.equal(lawful.drugs, 0, "the lawful world refines none");
});

// ---------------- war ----------------
test("war: a year of war fights battles at the gate and burns arms", () => {
  const a = makeSystem(0, { fid: 0, pop: 30, dev: 1, stock: { weapons: 10 } });
  const b = makeSystem(1, { fid: 1, pop: 30, dev: 1, stock: { weapons: 10 } });
  const A = makeFaction(0, { capital: 0, treasury: 100 });
  const B = makeFaction(1, { capital: 1, treasury: 100 });
  const edge = makeEdge(0, 1, [a, b]);
  const w = makeWorld({ systems: [a, b], factions: [A, B], edges: [edge], rng: fixedRng(0.5) });
  const rel = getRel(w, 0, 1);
  w.stats.wars.push({ a: 0, b: 1, start: w.year, end: null, duration: 0, battles: 0, systemsCeded: 0 });
  rel.war = { since: w.year, score: 0, rec: 0 };
  const armsA0 = a.stock.weapons, armsB0 = b.stock.weapons;
  runWarYear(w, w.rng, A, B, rel, [edge]);
  assert.ok(w.stats.c.battle >= 1, "at least one battle was fought");
  assert.ok(a.stock.weapons < armsA0 && b.stock.weapons < armsB0, "munitions were spent at the front");
  assert.ok(a.lastWar === w.year || b.lastWar === w.year, "the war touched the frontier worlds");
  assert.deepEqual(checkInvariants(w), []);
});

// ---------------- shocks ----------------
test("shocks: with every calamity dialed to zero, none fire", () => {
  const sys = Array.from({ length: 6 }, (_, i) => makeSystem(i, { x: i * 30, pop: 10, stock: { medicine: 5 } }));
  const w = makeWorld({ systems: sys, cfg: { plague: 0, flare: 0, oreStrikes: 0, gateFlux: 0 } });
  for (let y = 0; y < 50; y++) { w.year++; runShocks(w, w.rng, alive(w)); }
  const c = w.stats.c;
  assert.equal(c.plague + c.flare + c.strike + c.gateOpen + c.gateClose, 0,
    "no calamity or gate event may fire when their odds are zero");
});

test("shocks: a forced plague culls population and spends the pharmacopoeia", () => {
  const s = makeSystem(0, { pop: 40, stock: { medicine: 1 } });
  // huge plague multiplier + fixedRng(0) forces the 0.004*mult chance to fire
  const w = makeWorld({ systems: [s], cfg: { plague: 100, flare: 0, oreStrikes: 0, gateFlux: 0 }, rng: fixedRng(0) });
  const pop0 = s.pop, med0 = s.stock.medicine;
  runShocks(w, w.rng, alive(w));
  assert.ok(s.pop < pop0, "plague culls population");
  assert.ok(s.stock.medicine < med0, "clinics spend medicine holding the line");
  assert.equal(s.lastPlague, w.year, "plague year recorded");
  assert.equal(w.stats.c.plague, 1);
});
