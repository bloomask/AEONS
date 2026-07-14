import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy } from "../src/sim/galaxy.js";
import { territoryClusters } from "../src/ui/map/territory.js";

test("separated pieces of one faction produce independent territory label anchors", () => {
  const w = genGalaxy(73, { burnYears: 0 });
  for (const s of w.systems) { s.fid = null; s.pop = 0; }
  const f = w.factions[0];
  const [a, b, island] = w.systems;
  Object.assign(a, { fid: f.id, pop: 10, x: 0, y: 0 });
  Object.assign(b, { fid: f.id, pop: 5, x: 80, y: 0 });
  Object.assign(island, { fid: f.id, pop: 3, x: 300, y: 40 });

  const clusters = territoryClusters(w, f.id).sort((x, y) => y.pop - x.pop);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].pop, 15);
  assert.equal(clusters[1].members[0].id, island.id);
  assert.equal(clusters[1].cx, island.x);
  assert.equal(clusters[1].cy, island.y);
});
