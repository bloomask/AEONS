// Balance guard-rail test — a fast subset of the balance lab (scripts/balance-lab.js),
// wired into `npm test` so a tuning change that shoves the galaxy out of its
// intended shape fails CI, not just a manual lab run. It only asserts the HARD
// targets (guard-rails); advisory drift is the lab's job to surface, not to fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { BALANCE_TARGETS, evaluateBalance } from "../src/sim/balance.js";

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

function matrix(seeds, years, cfg) {
  return seeds.map((seed) => {
    const w = genGalaxy(seed, cfg);
    for (let i = 0; i < years; i++) simulateYear(w);
    return buildStats(w).summary;
  });
}

test("hard balance guard-rails hold on the standard galaxy", () => {
  const summaries = matrix([1, 42, 777], 300);
  const failures = [];
  for (const t of BALANCE_TARGETS.filter((t) => !t.warn)) {
    const m = median(summaries.map((s) => t.metric(s)));
    if (m !== null && (m < t.lo || m > t.hi))
      failures.push(`${t.key}=${m} outside [${t.lo}, ${t.hi}] — ${t.label}`);
  }
  assert.deepEqual(failures, [], failures.join("\n  "));
});

test("evaluateBalance grades ok/warn/fail correctly", () => {
  // a plausible healthy summary passes everything
  const w = genGalaxy(7);
  for (let i = 0; i < 200; i++) simulateYear(w);
  const good = evaluateBalance(buildStats(w).summary);
  assert.ok(!good.some((r) => r.status === "fail"), "a normal galaxy should trip no hard target");

  // a runaway hegemon (one power holds the whole map) trips the hard
  // concentration guard-rail — proof the grader actually bites
  const broken = evaluateBalance({
    ...buildStats(w).summary,
    factions: { ...buildStats(w).summary.factions, maxLargestShareEver: 0.99 },
  });
  const conc = broken.find((r) => r.key === "concentration");
  assert.equal(conc.status, "fail");

  // a null metric (no wars concluded → no mean duration) is never a failure
  const noWars = evaluateBalance({
    ...buildStats(w).summary,
    wars: { ...buildStats(w).summary.wars, duration: { mean: null } },
  });
  assert.equal(noWars.find((r) => r.key === "meanWarDuration").status, "ok");
});
