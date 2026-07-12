// Capital & industry: the price-maker layer. Lending, investing, and foreclosure
// actually move the galaxy — so these tests check that the influence lands
// (the world CHANGES), that it stays deterministic, and — crucially — that a
// corp which does nothing macro still leaves the sim byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { Game } from "../src/game/game.js";
import { lend, invest, foreclose } from "../src/game/actions.js";
import { netWorth } from "../src/game/corp.js";

function newGame(seed = 42, cash = 5000) {
  const w = genGalaxy(seed);
  for (let i = 0; i < 120; i++) simulateYear(w);
  return new Game(w, { cash });
}

test("a purely-trading corp still leaves the macro-sim byte-identical", () => {
  // the price-maker hook must be inert until the player actually uses it
  const g = newGame(42);
  g.stepDay(g.clock.daysPerYear * 5);
  const plain = genGalaxy(42);
  for (let i = 0; i < g.w.year; i++) simulateYear(plain);
  assert.deepEqual(buildStats(g.w).summary, buildStats(plain).summary);
});

test("lending pays the principal out, lands in the galaxy, and is serviced", () => {
  const g = newGame();
  const target = g.w.systems.find((s) => s.pop > 3 && s.wealth < 60);
  const cash0 = g.corp.cash;
  const r = lend(g, "sys", target.id, 80, 0.1);
  assert.ok(r.ok, r.error);
  assert.equal(g.corp.cash, cash0 - 80, "principal leaves cash immediately");
  assert.equal(g.corp.loans.length, 1);
  g.stepDay(g.clock.daysPerYear * 3);
  // the money reached the galaxy — its history now differs from an untouched run
  const plain = genGalaxy(42);
  for (let i = 0; i < g.w.year; i++) simulateYear(plain);
  assert.notDeepEqual(buildStats(g.w).summary, buildStats(plain).summary);
  // and the loan book moved: serviced (amortized/repaid) or defaulted
  const loan = g.corp.loans[0];
  assert.ok(!loan || loan.principal < 80 || loan.missed > 0, "the debt was serviced or fell into arrears");
});

test("investing develops a world (raises its wealth and industry)", () => {
  const g = newGame();
  const s = g.w.systems.find((x) => x.pop > 2);
  const dev0 = s.dev, wealth0 = s.wealth;
  assert.ok(invest(g, s.id, 100).ok);
  g.stepDay(g.clock.daysPerYear);
  assert.ok(s.dev > dev0 || s.wealth > wealth0, "the investment built something");
});

test("foreclosure needs real arrears, then seizes a company town", () => {
  const g = newGame();
  const target = g.w.systems.find((s) => s.pop > 3 && s.wealth < 60);
  lend(g, "sys", target.id, 60, 0.15);
  assert.equal(foreclose(g, 0).ok, false, "cannot foreclose a loan in good standing");
  // drive it into arrears by hand, then foreclose
  g.corp.loans[0].missed = 2;
  const r = foreclose(g, 0);
  assert.ok(r.ok, r.error);
  assert.ok(g.corp.holdings.includes(target.id), "seized as a holding");
  assert.equal(g.corp.loans.length, 0, "the loan is closed");
});

test("company towns pay a dividend and it shows in net worth", () => {
  const g = newGame();
  const s = g.w.systems.find((x) => x.pop > 3 && x.wealth > 40);
  g.corp.holdings.push(s.id);
  const cash0 = g.corp.cash;
  g.stepDay(g.clock.daysPerYear);
  assert.ok(g.corp.cash > cash0, "the holding paid a dividend");
  assert.ok(netWorth(g.corp, g.view(), g.w) >= g.corp.cash, "holding valued in net worth");
});

test("capital play is deterministic in the seed and action sequence", () => {
  const script = (g) => {
    const t = g.w.systems.find((s) => s.pop > 3 && s.wealth < 60).id;
    lend(g, "sys", t, 70, 0.1);
    invest(g, g.corp.home, 50);
    g.stepDay(g.clock.daysPerYear * 3);
  };
  const a = newGame(7); script(a);
  const b = newGame(7); script(b);
  assert.deepEqual(buildStats(a.w).summary, buildStats(b.w).summary);
  assert.equal(a.corp.cash, b.corp.cash);
  assert.deepEqual(a.corp.loans, b.corp.loans);
});
