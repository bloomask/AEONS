// Boardroom presenter tests — the pure view-models the tycoon UI renders. The
// React shell can't run headless, but its data layer can, so the display logic
// is verified here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/game/game.js";
import { apply } from "../src/game/commands.js";
import { overview, fleetRows, marketRows, shipsAt, shipyard, ledgerRows, milestones } from "../src/ui/tycoon/present.js";

function play() {
  const g = newGame(42, { cash: 3000 });
  apply(g, { t: "commission", cls: "freighter" });
  apply(g, { t: "buildDepot", sys: g.corp.home });
  apply(g, { t: "buy", ship: g.corp.ships[0].id, good: "grain", qty: 8 });
  return g;
}

test("overview reports identity, clock, and score", () => {
  const g = play();
  const o = overview(g);
  assert.equal(o.name, g.corp.name);
  assert.equal(o.year, g.year);
  assert.ok(o.netWorth > 0);
  assert.ok(o.rank >= 1);
});

test("fleet rows describe each hull's place and cargo", () => {
  const g = play();
  const rows = fleetRows(g);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "freighter");
  assert.ok(rows[0].docked);
  assert.match(rows[0].cargo, /grain/);
  assert.equal(rows[0].cap, 60);
});

test("market rows carry live prices and a ship's max buy", () => {
  const g = play();
  const shipId = g.corp.ships[0].id;
  const rows = marketRows(g, g.corp.home, shipId);
  assert.equal(rows.length, 8);
  const grain = rows.find((r) => r.good === "grain");
  assert.ok(grain.price > 0 && grain.maxBuy >= 0);
  assert.deepEqual(shipsAt(g, g.corp.home), [shipId]);
});

test("shipyard lists classes with affordability", () => {
  const g = play();
  const yard = shipyard(g);
  assert.ok(yard.length >= 3);
  assert.ok(yard.every((s) => typeof s.affordable === "boolean"));
});

test("ledger and milestones surface progress", () => {
  const g = play();
  assert.ok(ledgerRows(g).length >= 2, "recent transactions listed");
  const ms = milestones(g);
  // a depot is not a holding, and no state chartered yet
  assert.equal(ms.find((m) => m.key === "landlord").done, false);
  assert.equal(ms.find((m) => m.key === "sovereign").done, false);
});
