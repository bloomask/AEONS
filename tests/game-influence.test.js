// Influence & espionage: bribe, stoke, sabotage. These bend the galaxy directly
// and deterministically, and move the corp's reputation with each power.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats, getRel } from "../src/sim/index.js";
import { Game } from "../src/game/game.js";
import { bribe, stokeRivalry, sabotage, reputation } from "../src/game/influence.js";

function newGame(seed = 42, cash = 5000) {
  const w = genGalaxy(seed);
  for (let i = 0; i < 120; i++) simulateYear(w);
  return new Game(w, { cash });
}
const someFaction = (g) => g.w.factions.find((f) => !f.dead && f.gov !== "pirate");
const twoFactions = (g) => g.w.factions.filter((f) => !f.dead && f.gov !== "pirate").slice(0, 2);

test("bribery buys treasury, stability, and reputation", () => {
  const g = newGame();
  const f = someFaction(g);
  const tr0 = f.treasury, st0 = f.stability, cash0 = g.corp.cash;
  const r = bribe(g, f.id, 100);
  assert.ok(r.ok, r.error);
  assert.equal(g.corp.cash, cash0 - 100);
  assert.ok(f.treasury > tr0, "some of it reached the treasury");
  assert.ok(f.stability >= st0, "stability held or rose");
  assert.ok(reputation(g.corp, f.id) > 0, "standing improved");
});

test("stoking raises the rivalry between two powers", () => {
  const g = newGame();
  const [A, B] = twoFactions(g);
  const before = getRel(g.w, A.id, B.id).rivalry;
  const r = stokeRivalry(g, A.id, B.id, 100);
  assert.ok(r.ok, r.error);
  assert.ok(getRel(g.w, A.id, B.id).rivalry > before, "tensions climbed");
});

test("sabotage destroys a rival's wealth and costs standing", () => {
  const g = newGame();
  const target = g.w.systems.find((s) => s.pop > 2 && s.wealth > 40 && s.fid != null);
  const w0 = target.wealth;
  const r = sabotage(g, target.id, 50);
  assert.ok(r.ok, r.error);
  assert.ok(target.wealth < w0, "operations were wrecked");
  assert.ok(reputation(g.corp, target.fid) < 0, "the victim's power resents it");
});

test("influence is rejected when it can't be afforded or aimed", () => {
  const g = newGame(42, 10);
  const f = someFaction(g);
  assert.equal(bribe(g, f.id, 1000).ok, false, "can't afford");
  assert.equal(stokeRivalry(g, f.id, f.id, 5).ok, false, "need two distinct powers");
  assert.equal(sabotage(g, 999999, 5).ok, false, "no such target");
});

test("influence bends the macro-sim and is deterministic", () => {
  const script = (g) => {
    const [A, B] = twoFactions(g);
    stokeRivalry(g, A.id, B.id, 150);
    bribe(g, A.id, 80);
    const t = g.w.systems.find((s) => s.pop > 2 && s.fid != null).id;
    sabotage(g, t, 40);
    g.stepDay(g.clock.daysPerYear * 3);
  };
  const a = newGame(7); script(a);
  const b = newGame(7); script(b);
  assert.deepEqual(buildStats(a.w).summary, buildStats(b.w).summary);
  assert.equal(a.corp.cash, b.corp.cash);

  // and it actually changed history vs an untouched galaxy
  const plain = genGalaxy(7);
  for (let i = 0; i < a.w.year; i++) simulateYear(plain);
  assert.notDeepEqual(buildStats(a.w).summary, buildStats(plain).summary);
});
