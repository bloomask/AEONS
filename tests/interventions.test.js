// Curator interventions — the Curate half of the product contract.
//
// The load-bearing promises tested here:
//   • every intervention, applied to a real (generated, aged) world, leaves
//     the world invariant-clean IMMEDIATELY after application — and still
//     clean after the next full simulated year digests it;
//   • every application writes a chronicle entry and appends a deterministic
//     command record to `w.commands`;
//   • previews ("anticipated pressure") are pure — they never mutate the
//     world or touch the rng;
//   • interventions never touch the rng at all, so the same seed + the same
//     commands at the same years replay the same history, byte for byte;
//   • invalid params are rejected without side effects.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  genGalaxy, simulateYear, checkInvariants, serializeWorld,
  INTERVENTIONS, INTERVENTION_BY_KEY, applyIntervention, previewIntervention,
  validateIntervention,
} from "../src/sim/index.js";

const SEEDS = [11, 42, 1234];
const AGE = 150; // years burned before curating — a lived-in galaxy

function agedWorld(seed) {
  const w = genGalaxy(seed, {});
  for (let y = 0; y < AGE; y++) simulateYear(w);
  return w;
}

// Resolve params for a def by walking its field pickers in order and taking
// the first offered option — exactly what a UI user could select. Returns
// null when the world offers no valid target for this intervention.
function firstParams(w, def) {
  const params = {};
  for (const f of def.fields) {
    const opts = f.options(w, params);
    if (!opts.length) return null;
    params[f.key] = opts[0].v;
  }
  return params;
}

// a world fingerprint that any stray mutation or rng touch would change
const snapshot = (w) => JSON.stringify(serializeWorld(w));

test("intervention definitions are complete and well-formed", () => {
  assert.ok(INTERVENTIONS.length >= 6, `at least six interventions shipped (got ${INTERVENTIONS.length})`);
  for (const def of INTERVENTIONS) {
    assert.equal(typeof def.key, "string");
    assert.equal(typeof def.label, "string");
    assert.equal(typeof def.blurb, "string");
    assert.equal(typeof def.destructive, "boolean", `${def.key} declares destructive`);
    assert.ok(Array.isArray(def.fields) && def.fields.length > 0, `${def.key} declares target fields`);
    for (const f of def.fields) assert.equal(typeof f.options, "function", `${def.key}.${f.key} offers options`);
    assert.equal(typeof def.validate, "function");
    assert.equal(typeof def.preview, "function");
    assert.equal(typeof def.apply, "function");
    assert.equal(INTERVENTION_BY_KEY[def.key], def);
  }
  // the destructive set must cover the acts that break things on purpose
  for (const key of ["sowDiscord", "inflameUnrest", "collapseGate", "triggerPlague"])
    assert.equal(INTERVENTION_BY_KEY[key].destructive, true, `${key} requires confirmation`);
});

test("every intervention: applies cleanly, checks invariants immediately, logs, records", () => {
  // each intervention must find a target and apply on at least one seed
  const appliedSomewhere = new Set();

  for (const seed of SEEDS) {
    const w = agedWorld(seed);
    assert.deepEqual(checkInvariants(w), [], `seed ${seed}: aged world starts clean`);

    for (const def of INTERVENTIONS) {
      const params = firstParams(w, def);
      if (!params) continue; // this world offers no target (e.g. no active war)
      assert.equal(validateIntervention(w, def.key, params), null,
        `${def.key} on seed ${seed}: offered options validate`);

      // preview is pure: the anticipated-pressure card never mutates the world
      const before = snapshot(w);
      const pv = previewIntervention(w, def.key, params);
      assert.ok(pv.ok && Array.isArray(pv.lines) && pv.lines.length > 0,
        `${def.key}: preview yields anticipated-pressure lines`);
      for (const line of pv.lines) assert.equal(typeof line, "string");
      assert.equal(snapshot(w), before, `${def.key}: preview mutates nothing`);

      const events0 = w.eventSeq;
      const commands0 = (w.commands || []).length;
      const res = applyIntervention(w, def.key, params);
      assert.ok(res.ok, `${def.key} on seed ${seed} applies`);

      // the REQUIREMENT: invariants immediately after every intervention
      assert.deepEqual(checkInvariants(w, { label: def.key }), [],
        `${def.key} on seed ${seed}: world invariant-clean immediately after`);

      // chronicle entry + deterministic command record
      assert.ok(w.eventSeq > events0, `${def.key}: wrote a chronicle entry`);
      assert.equal(w.commands.length, commands0 + 1, `${def.key}: appended one command record`);
      assert.deepEqual(res.record, w.commands[w.commands.length - 1]);
      assert.deepEqual(res.record, { i: commands0 + 1, year: w.year, key: def.key, params },
        `${def.key}: record carries {i, year, key, params}`);
      assert.equal(JSON.parse(JSON.stringify(res.record)).key, def.key, `${def.key}: record is plain JSON`);

      appliedSomewhere.add(def.key);
    }

    // the curated world must still be digestible by the ordinary pipeline
    simulateYear(w);
    assert.deepEqual(checkInvariants(w), [], `seed ${seed}: clean after the year following curation`);
  }

  for (const def of INTERVENTIONS)
    assert.ok(appliedSomewhere.has(def.key),
      `${def.key} found a valid target on at least one of seeds ${SEEDS.join(", ")}`);
});

test("interventions hold invariants phase-by-phase through the following year", () => {
  const w = agedWorld(SEEDS[0]);
  for (const def of INTERVENTIONS) {
    const params = firstParams(w, def);
    if (!params) continue;
    assert.ok(applyIntervention(w, def.key, params).ok);
    assert.deepEqual(checkInvariants(w, { label: `after ${def.key}` }), []);
    // slavery legality is reconciled by the contraband phase (see invariants.js)
    let past = false;
    simulateYear(w, (name) => {
      past = past || name === "contraband";
      assert.deepEqual(checkInvariants(w, { label: `${def.key} → ${name}`, settled: past }), []);
    });
  }
});

test("interventions never touch the rng and replay deterministically", () => {
  const seed = 7;
  const mk = () => {
    const w = genGalaxy(seed, {});
    for (let y = 0; y < 80; y++) simulateYear(w);
    return w;
  };

  // plan a command script against a scouted copy of the world
  const scout = mk();
  const script = [];
  for (const def of INTERVENTIONS) {
    const params = firstParams(scout, def);
    if (params) { script.push({ key: def.key, params }); applyIntervention(scout, def.key, params); }
  }
  assert.ok(script.length >= 6, `the scouted world accepts at least six interventions (got ${script.length})`);

  // two fresh worlds, same seed: A is curated by the script, B twice over
  const run = (cmds) => {
    const w = mk();
    for (const c of cmds) {
      const r = applyIntervention(w, c.key, c.params);
      assert.ok(r.ok, `${c.key} replays`);
    }
    for (let y = 0; y < 60; y++) simulateYear(w);
    return w;
  };
  const A = run(script), B = run(script);
  assert.equal(snapshot(A), snapshot(B), "same seed + same commands = identical history");

  // and each apply consumes no rng AT ALL: the counter is identical before
  // and after (the consequences ripple through later years only because the
  // world changed, never because the stream was advanced)
  const C = mk();
  for (const c of script) {
    const rng0 = C.rng.snapshot();
    assert.ok(applyIntervention(C, c.key, c.params).ok);
    assert.equal(C.rng.snapshot(), rng0, `${c.key} draws no rng`);
  }
});

test("invalid interventions are rejected without side effects", () => {
  const w = agedWorld(SEEDS[1]);
  const before = snapshot(w);

  const cases = [
    ["notAThing", {}],
    ["relief", { sysId: -1 }],
    ["relief", {}],
    ["sponsorColony", { fromId: 0, toId: 0 }],
    ["brokerPeace", { pair: "9999|9998" }],
    ["openGate", { a: 0, b: 0 }],
    ["collapseGate", { edge: "nope" }],
    ["triggerPlague", { sysId: w.systems.findIndex((s) => s.pop <= 0.05) }],
  ];
  for (const [key, params] of cases) {
    const res = applyIntervention(w, key, params);
    assert.equal(res.ok, false, `${key} with bad params is refused`);
    assert.equal(typeof res.error, "string");
  }
  assert.equal(snapshot(w), before, "refused interventions leave no trace");
});

test("the sharpest interventions do what they claim", () => {
  const w = agedWorld(SEEDS[2]);

  // brokered peace actually ends a war when one exists
  const warKey = Object.keys(w.relations).find((k) => w.relations[k].war);
  if (warKey) {
    const res = applyIntervention(w, "brokerPeace", { pair: warKey });
    assert.ok(res.ok);
    assert.equal(w.relations[warKey].war, null, "the war is over");
    assert.ok(!w.systems.some((s) => s.siege && s.siege.pair === warKey), "its sieges are lifted");
    assert.deepEqual(checkInvariants(w), []);
  }

  // a triggered plague culls but medicine matters, and the record shows it
  const target = w.systems.filter((s) => s.pop > 5).sort((a, b) => b.pop - a.pop)[0];
  assert.ok(target, "an aged world has a populous target");
  const before = target.pop;
  const res = applyIntervention(w, "triggerPlague", { sysId: target.id });
  assert.ok(res.ok);
  assert.ok(target.pop < before && target.pop > 0, "the plague culls without zeroing");
  assert.equal(target.lastPlague, w.year);
  assert.deepEqual(checkInvariants(w), []);

  // a curator gate exists and carries the adjacency with it
  const openDef = INTERVENTION_BY_KEY.openGate;
  const gp = (function () {
    const p = {};
    for (const f of openDef.fields) {
      const o = f.options(w, p);
      if (!o.length) return null;
      p[f.key] = o[0].v;
    }
    return p;
  })();
  if (gp) {
    const edges0 = w.edges.length;
    assert.ok(applyIntervention(w, "openGate", gp).ok);
    assert.equal(w.edges.length, edges0 + 1);
    assert.ok(w.adj[gp.a].some(({ to }) => to === gp.b), "adjacency rebuilt");
    assert.deepEqual(checkInvariants(w), []);
  }
});

test("a curated faction uses its fine-tuned settings and an empty founding system", () => {
  const w = genGalaxy(2026, { factions: 0, burnYears: 0 });
  const site = w.systems.find((s) => s.pop <= 0.05 && !s.ruined);
  assert.ok(site);
  const params = {
    sysId: site.id, name: "Orison Compact", gov: "corporate", color: "#5CC8DA",
    pop: 9.5, dev: 1.2, treasury: 210, stability: 0.91,
    aggr: 0.12, expans: 0.67, tariff: 0.04,
  };
  const rng0 = w.rng.snapshot();
  const res = applyIntervention(w, "foundFaction", params);
  assert.ok(res.ok);
  assert.equal(w.rng.snapshot(), rng0, "founding consumes no rng");
  const f = w.factions[0];
  assert.equal(f.name, params.name);
  assert.equal(f.gov, params.gov);
  assert.equal(f.color, params.color);
  assert.equal(f.capital, site.id);
  assert.equal(f.aggr, params.aggr);
  assert.equal(f.expans, params.expans);
  assert.equal(f.tariff, params.tariff);
  assert.equal(site.fid, f.id);
  assert.equal(site.pop, params.pop);
  assert.deepEqual(checkInvariants(w), []);
});
