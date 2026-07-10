// Headless simulation runner: npm run sim [-- <seed> <years>]
// Runs the engine without a browser and prints the summary statistics.
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";

const seed = Number(process.argv[2] ?? 42);
const years = Number(process.argv[3] ?? 500);

const w = genGalaxy(seed);
for (let i = 0; i < years; i++) simulateYear(w);

const stats = buildStats(w);
console.log(JSON.stringify(stats.summary, null, 2));
console.error(`\nseed ${seed}, ${years} years — full export has ${stats.series.length} yearly rows`);
