// ---------------------------------------------------------------------------
// Balance targets — the statistical shape a healthy galaxy should have.
//
// The engine is a self-regulating system with no win condition, so "balanced"
// is a range, not a number: wars should be lively but not constant, worlds
// should die but not en masse, no single power should swallow the map. This
// file turns those prose goals into measurable bands, so a tuning change that
// pushes a metric out of range is caught (the balance lab and its test read
// these), instead of being noticed 50 commits later.
//
// Each target reads a metric off the summary that `buildStats` produces and
// checks it against [lo, hi]. `warn` targets flag drift without failing CI;
// hard targets (warn: false) are the guard-rails a release must not cross.
// Ranges are deliberately wide — they catch regressions, not fine tuning.
// Re-derive them with `npm run balance` when the intended balance changes.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BalanceTarget
 * @property {string} key    machine name
 * @property {string} label  human description
 * @property {(summary: any) => (number|null)} metric  reads the figure to test
 * @property {number} lo     inclusive lower bound
 * @property {number} hi     inclusive upper bound
 * @property {boolean} warn  true = advisory (drift), false = hard guard-rail
 * @property {string} [unit]
 */

/** @type {BalanceTarget[]} */
export const BALANCE_TARGETS = [
  {
    key: "warsPerCentury",
    label: "wars declared per century — lively, not constant",
    // calibrated against the matrix: default presets sit near 1.5–2/century,
    // bloodiron pushes ~3.5. The guard-rail catches the two failure modes —
    // a galaxy that never fights, and one at perpetual war — not fine tuning.
    metric: (s) => s.wars.warsPerCentury,
    lo: 0.5, hi: 40, warn: false,
  },
  {
    key: "meanWarDuration",
    label: "mean length of concluded wars (years)",
    metric: (s) => s.wars.duration.mean,
    lo: 2, hi: 20, warn: true, unit: "yr",
  },
  {
    key: "extinctionPct",
    label: "share of all settlements that died — worlds fall, but not all",
    metric: (s) => s.systemDeaths.pctOfSettlementsDied,
    lo: 2, hi: 75, warn: false, unit: "%",
  },
  {
    key: "survivingSystems",
    label: "living systems at the end — the galaxy is not a graveyard",
    metric: (s) => s.galaxyNow.liveSystems,
    lo: 8, hi: 200, warn: false,
  },
  {
    key: "factionsAlive",
    label: "powers still standing — neither wiped out nor untouched",
    metric: (s) => s.galaxyNow.livingFactions,
    lo: 1, hi: 40, warn: false,
  },
  {
    key: "factionsPctDead",
    label: "share of founded powers that fell",
    metric: (s) => s.factions.pctDead,
    lo: 5, hi: 95, warn: true, unit: "%",
  },
  {
    key: "concentration",
    label: "largest realm's peak share of the galaxy — no runaway hegemon",
    metric: (s) => s.factions.maxLargestShareEver,
    lo: 0.1, hi: 0.85, warn: false,
  },
  {
    key: "miseryPct",
    label: "share of worlds in misery at the end",
    metric: (s) => s.galaxyNow.miseryPct,
    lo: 0, hi: 70, warn: true, unit: "%",
  },
  {
    key: "creditPriceIndex",
    label: "credit price index — currency neither collapses nor deflates to dust",
    metric: (s) => s.market.creditPriceIndex,
    lo: 20, hi: 400, warn: true,
  },
  {
    key: "tradeVolume",
    label: "trade moving on the lanes at the end — commerce still breathes",
    metric: (s) => s.market.tradeVolume,
    lo: 1, hi: 50000, warn: true,
  },
  {
    key: "popVsPeak",
    label: "end population vs the galaxy's historical peak (%)",
    metric: (s) => s.galaxyNow.popVsPeakPct,
    lo: 5, hi: 100, warn: true, unit: "%",
  },
];

/**
 * Evaluate a stats summary against the targets.
 * @param {any} summary  the `summary` object from buildStats(w)
 * @returns {{key:string,label:string,value:(number|null),lo:number,hi:number,
 *   warn:boolean,unit?:string,status:"ok"|"warn"|"fail"}[]}
 */
export function evaluateBalance(summary) {
  return BALANCE_TARGETS.map((t) => {
    const value = t.metric(summary);
    let status = "ok";
    // a null metric (e.g. no wars concluded, so no mean duration) is not a
    // failure — there was simply nothing to measure
    if (value !== null && value !== undefined && (value < t.lo || value > t.hi))
      status = t.warn ? "warn" : "fail";
    return { key: t.key, label: t.label, value, lo: t.lo, hi: t.hi, warn: t.warn, unit: t.unit, status };
  });
}
