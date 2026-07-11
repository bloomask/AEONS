// Headless simulation runner: npm run sim [-- <seed> <years> [preset]]
// Runs the engine without a browser and prints the summary statistics.
// `preset` is a named galaxy from sim/config.js (standard, golden,
// longdark, bloodiron, freelanes, crowded).
import { genGalaxy, simulateYear, buildStats, PRESETS } from "../src/sim/index.js";

const seed = Number(process.argv[2] ?? 42);
const years = Number(process.argv[3] ?? 500);
const presetKey = process.argv[4];
const preset = presetKey ? PRESETS.find((p) => p.key === presetKey) : null;
if (presetKey && !preset) {
  console.error(`unknown preset "${presetKey}" — one of: ${PRESETS.map((p) => p.key).join(", ")}`);
  process.exit(1);
}

const w = genGalaxy(seed, preset ? preset.overrides : undefined);
for (let i = 0; i < years; i++) simulateYear(w);

const stats = buildStats(w);
console.log(JSON.stringify(stats.summary, null, 2));
console.error(`\nseed ${seed}, ${years} years${preset ? `, "${preset.name}"` : ""} — full export has ${stats.series.length} yearly rows`);
