// Automated balance laboratory: npm run balance [-- <years> [seeds] [preset]]
//
// Runs a fixed seed matrix across every preset, aggregates the metrics that
// describe a galaxy's balance (wars, extinctions, concentration, survival,
// prices, trade, misery), and checks each preset's central tendency against the
// targets in src/sim/balance.js. Prints a table per preset and a verdict.
//
//   npm run balance                 # default matrix, 500 years
//   npm run balance -- 800          # longer horizon
//   npm run balance -- 500 3,7,42   # explicit seeds
//   npm run balance -- 500 all standard   # one preset only
//
// Exit code is non-zero if any HARD target (a guard-rail) fails on any preset,
// so this doubles as a CI gate. Warn-level targets never fail the run.
import { genGalaxy, simulateYear, buildStats, PRESETS, BALANCE_TARGETS } from "../src/sim/index.js";

const args = process.argv.slice(2);
const years = Number(args[0] ?? 500);
const seeds = (args[1] && args[1] !== "all")
  ? args[1].split(",").map(Number)
  : [1, 7, 42, 101, 777];
const onlyPreset = args[2];
const presets = onlyPreset ? PRESETS.filter((p) => p.key === onlyPreset) : PRESETS;
if (onlyPreset && !presets.length) {
  console.error(`unknown preset "${onlyPreset}" — one of: ${PRESETS.map((p) => p.key).join(", ")}`);
  process.exit(1);
}

// central tendency across the seed matrix: median resists a single wild seed
const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor(v.length / 2)];
};
const fmt = (v, unit) => v === null || v === undefined ? "  —  "
  : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (+v.toFixed(2)).toString()) + (unit || "");
const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);

const C = process.stdout.isTTY
  ? { ok: (s) => `\x1b[32m${s}\x1b[0m`, warn: (s) => `\x1b[33m${s}\x1b[0m`, fail: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` }
  : { ok: (s) => s, warn: (s) => s, fail: (s) => s, dim: (s) => s, bold: (s) => s };
const mark = { ok: C.ok("ok  "), warn: C.warn("warn"), fail: C.fail("FAIL") };

console.log(C.bold(`\nAEONS balance laboratory — ${years} years × seeds [${seeds.join(", ")}]\n`));

let hardFailures = 0, warnings = 0;

for (const preset of presets) {
  // run the matrix, collect each seed's summary
  const summaries = seeds.map((seed) => {
    const w = genGalaxy(seed, preset.overrides);
    for (let i = 0; i < years; i++) simulateYear(w);
    return buildStats(w).summary;
  });

  // median of each target metric across the seeds, then grade it
  const rows = BALANCE_TARGETS.map((t) => {
    const vals = summaries.map((s) => t.metric(s));
    const m = median(vals);
    // grade the MEDIAN across the matrix, not any single seed's outcome
    let status = "ok";
    if (m !== null && m !== undefined && (m < t.lo || m > t.hi)) status = t.warn ? "warn" : "fail";
    if (status === "fail") hardFailures++;
    if (status === "warn") warnings++;
    return { t, m, lo: Math.min(...vals.filter((x) => x != null)), hi: Math.max(...vals.filter((x) => x != null)), status };
  });

  console.log(C.bold(`── ${preset.name} `) + C.dim(`(${preset.key})`));
  console.log(C.dim(`   ${pad("metric", 20)} ${pad("median", 10)} ${pad("range", 16)} ${pad("target", 14)} status`));
  for (const r of rows) {
    const range = r.lo === r.hi ? fmt(r.m, r.t.unit) : `${fmt(r.lo, r.t.unit)}–${fmt(r.hi, r.t.unit)}`;
    const target = `[${fmt(r.t.lo)}, ${fmt(r.t.hi)}]` + (r.t.warn ? C.dim("~") : "");
    const line = `   ${pad(r.t.key, 20)} ${pad(fmt(r.m, r.t.unit), 10)} ${pad(range, 16)} ${pad(target, 14)} ${mark[r.status]}`;
    console.log(line);
  }
  console.log();
}

console.log(C.dim(`(~ marks advisory/warn targets; hard targets are guard-rails)`));
if (hardFailures) {
  console.log(C.fail(C.bold(`\n✗ ${hardFailures} hard balance target(s) out of range across the matrix.`)));
  process.exit(1);
} else if (warnings) {
  console.log(C.warn(`\n△ ${warnings} advisory target(s) drifting — worth a look, not a failure.`));
  console.log(C.ok(C.bold(`✓ all hard balance guard-rails held.`)));
} else {
  console.log(C.ok(C.bold(`\n✓ every balance target in range across the matrix.`)));
}
