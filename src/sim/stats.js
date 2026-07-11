import { T, GOODS } from "./constants.js";

// ---------- statistics export ----------
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const meanOf = (arr) =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
const pctBreakdown = (arr, key) => {
  const c = {};
  arr.forEach((x) => (c[x[key]] = (c[x[key]] || 0) + 1));
  const out = {};
  Object.entries(c).forEach(([k, v]) => {
    out[k] = { count: v, pct: +((v / arr.length) * 100).toFixed(1) };
  });
  return out;
};

export function buildStats(w) {
  const S = w.stats;
  const centuries = Math.max(0.01, w.year / 100);
  const settlements = S.seeded + S.c.colony + S.c.resettle;
  const ages = S.deaths.map((d) => d.age).filter((a) => a !== null);
  const endedWars = S.wars.filter((x) => x.end !== null);
  const durs = endedWars.map((x) => x.duration);
  const now = S.series[S.series.length - 1] || {};
  const peakPop = S.series.length ? Math.max(...S.series.map((r) => r.pop)) : 0;
  const maxShareEver = S.series.length ? Math.max(...S.series.map((r) => r.largestShare)) : 0;
  const fLifespans = S.factionDeaths.map((f) => f.lifespan);

  return {
    meta: { seed: w.seed, exportedAtYear: w.year, tuning: T },
    summary: {
      systemDeaths: {
        totalDeaths: S.deaths.length,
        totalSettlements: settlements,
        pctOfSettlementsDied: +((S.deaths.length / Math.max(1, settlements)) * 100).toFixed(1),
        deathsPerCentury: +(S.deaths.length / centuries).toFixed(2),
        ageAtDeath: {
          median: median(ages), mean: meanOf(ages),
          min: ages.length ? Math.min(...ages) : null,
          max: ages.length ? Math.max(...ages) : null,
        },
        causes: pctBreakdown(S.deaths, "cause"),
      },
      factions: {
        founded: S.c.factionsFounded,
        dead: S.factionDeaths.length,
        livingByGov: w.factions.filter((f) => !f.dead).reduce((acc, f) => {
          acc[f.gov || "republic"] = (acc[f.gov || "republic"] || 0) + 1;
          return acc;
        }, {}),
        pctDead: +((S.factionDeaths.length / Math.max(1, S.c.factionsFounded)) * 100).toFixed(1),
        lifespan: { median: median(fLifespans), mean: meanOf(fLifespans) },
        deathCauses: pctBreakdown(S.factionDeaths, "cause"),
        concentrationNow: { largestShare: now.largestShare ?? 0, hhi: now.hhi ?? 0 },
        maxLargestShareEver: maxShareEver,
      },
      wars: {
        declared: S.c.warsDeclared,
        concluded: endedWars.length,
        warsPerCentury: +(S.c.warsDeclared / centuries).toFixed(2),
        duration: { median: median(durs), mean: meanOf(durs), max: durs.length ? Math.max(...durs) : null },
        meanSystemsCeded: meanOf(endedWars.map((x) => x.systemsCeded)),
      },
      eventCounts: { ...S.c },
      merchantHouses: {
        chartered: T.START_HOUSES + S.c.houseFounded,
        bankrupt: S.c.houseBankrupt,
        aliveNow: w.houses.filter((h) => !h.dead).length,
        fleetNow: +w.houses.reduce((a, h) => a + (h.dead ? 0 : h.ships), 0).toFixed(0),
        richestEver: +w.records.richestHouse.toFixed(0),
      },
      galaxyNow: {
        year: w.year,
        pop: now.pop ?? 0, peakPopEver: peakPop,
        popVsPeakPct: peakPop ? +((now.pop / peakPop) * 100).toFixed(1) : 0,
        liveSystems: now.live ?? 0, ruins: now.ruins ?? 0,
        avgWellbeing: now.avgWb ?? 0, miseryPct: now.miseryPct ?? 0,
        livingFactions: now.factions ?? 0, activeWars: now.wars ?? 0,
        independentSystems: now.indep ?? 0,
      },
      // all figures in credits (cr), the universal unit of account
      market: {
        creditPriceIndex: now.cpi ?? 100,
        avgPrices: Object.fromEntries(GOODS.map((g) => [
          g, now["px" + g[0].toUpperCase() + g.slice(1)] ?? null,
        ])),
        tradeVolume: now.trade ?? 0,
        creditsInCirculation: +(
          w.systems.reduce((a, s) => a + (s.pop > 0.05 ? Math.max(0, s.wealth) : 0), 0) +
          w.houses.reduce((a, h) => a + (h.dead ? 0 : Math.max(0, h.wealth)), 0) +
          w.factions.reduce((a, f) => a + (f.dead ? 0 : Math.max(0, f.treasury)), 0)
        ).toFixed(0),
      },
      society: {
        pctElite: now.cElite ?? 0, pctUpper: now.cUpper ?? 0,
        pctMiddle: now.cMiddle ?? 0, pctWorker: now.cWorker ?? 0,
        avgUnrest: now.unrest ?? 0, riots: S.c.riot,
      },
    },
    systemDeaths: S.deaths,
    factionDeaths: S.factionDeaths,
    wars: S.wars,
    houses: w.houses.map((h) => ({
      name: h.name, home: w.systems[h.home].name,
      founded: h.foundedYear, died: h.diedYear,
      ships: +h.ships.toFixed(0), wealth: +h.wealth.toFixed(0),
      peakWealth: +h.peakWealth.toFixed(0), dead: h.dead,
    })),
    series: S.series,
  };
}
