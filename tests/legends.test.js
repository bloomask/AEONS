// Map-legend wiring test. The canvas render can't run headless, but the legend
// key is pure data — assert the new "worlds" (archetype) and "stars" (spectral
// class) overlays produce a legend that stays in lock-step with the engine
// tables the map actually draws from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy } from "../src/sim/index.js";
import { legendEntries } from "../src/ui/map/legends.js";
import { ARCHETYPES } from "../src/sim/classify.js";
import { STAR_TYPES } from "../src/sim/cosmos.js";

test("the worlds overlay legend lists every archetype with its map tint", () => {
  const entries = legendEntries(genGalaxy(1), "worlds");
  assert.equal(entries.length, ARCHETYPES.length);
  for (const a of ARCHETYPES) {
    const row = entries.find(([, label]) => label.includes(a.label));
    assert.ok(row, `no legend row for ${a.label}`);
    assert.equal(row[0], a.tint, `${a.label} legend color must match its map tint`);
  }
});

test("the stars overlay legend lists every spectral class", () => {
  const entries = legendEntries(genGalaxy(1), "stars");
  assert.equal(entries.length, STAR_TYPES.length);
  assert.equal(entries[0][0], STAR_TYPES[0].color);
});

test("legend entries are well-formed [color, label] pairs", () => {
  for (const overlay of ["realm", "worlds", "stars", "wealth", "life", "faith"]) {
    for (const row of legendEntries(genGalaxy(2), overlay)) {
      assert.equal(row.length, 2);
      assert.match(row[0], /^#|^rgb/, `${overlay} legend color looks wrong: ${row[0]}`);
      assert.equal(typeof row[1], "string");
    }
  }
});
