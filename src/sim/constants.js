/* ============================================================
   AEONS — a self-regulating galaxy simulator prototype
   1 tick = 1 year. No safety rails: systems starve, mines run
   dry, empires overextend and collapse. History is logged.
   ============================================================ */

// ---------- tuning ----------
export const T = {
  N_SYSTEMS: 96,
  SEEDED: 40,
  START_FACTIONS: 12,
  BURN_YEARS: 300,
  GALAXY_R: 460,
  FOOD_YIELD: 8.5,
  ORE_YIELD: 3.6,
  RARE_YIELD: 1.3,
  FUEL_YIELD: 3.6,
  MIN_QUALITY_FLOOR: 0.25,
  FOOD_SPOILAGE: 0.85,
  GROWTH_THRESHOLD: 0.6,
  // demographic fate weighs the workers' lot, not just the average:
  // births in the towers never outrun deaths in the tenements. Without
  // this the equilibrium is a majority starving under a growing census.
  GROWTH_WORKER_WT: 0.4,
  FAMINE_THRESHOLD: 0.4, // grain satisfaction below this is famine
  // settlers weigh a world's graves before they land. A colony that starves
  // out young (not felled by a passing war or plague, but simply unable to
  // feed itself) marks the world; after ABANDON_LIMIT such failures inside a
  // human span it is written off as a graveyard and no one raises towers there
  // again. This stops the resettle→starve→die→resettle thrash on barren,
  // isolated, prospector worlds that can never sustain a population.
  ABANDON_AGE: 60,      // a death younger than this counts as "starved out", not old age
  ABANDON_LIMIT: 5,     // that many quick failures and the world is a permanent graveyard
  ADMIN_BASE: 0.55,
  ADMIN_EXP: 1.35,
  TAX_RATE: 0.02,
  TAX_PER_POP: 0.12,
  SHIP_UPKEEP: 0.12,
  SHIP_COST: 2.0,
  START_HOUSES: 5,
  START_SHIPS: 30,
  TRAMP_CAP: 1.5,
  HOUSE_RANGE: 280,
  EMBARGO_RIVALRY: 45,
  BUILD_WEALTH: 60,
  CORP_WEALTH: 350,
  CORP_FLEET: 80,
  MAX_FAITHS: 8,
  // corsairs & suppression — all distances in gates (jumpHops), because
  // fleets travel lanes, not empty space
  RAID_JUMPS: 3,        // lanes within this many gates of a haven can be raided
  SUPP_JUMPS: 4,        // how far a state can project a punitive squadron
  SUPP_DECAY: 0.6,      // projected strength lost per gate transited
  SUPP_BASE_COST: 18,   // fitting out a squadron
  SUPP_JUMP_COST: 6,    // supply train per gate to the target
  GRIEVANCE_DECAY: 0.9, // how long victims remember skimmed cargo
  // a haven sinks plunder into teeth, not a vault: shore batteries, boom-
  // chains, a standing squadron. Fortification saturates (one anchorage
  // can mount only so much) and rots without upkeep — so only a haven that
  // keeps earning stays hard to burn out, and hoards never balloon.
  FORT_CAP_PER_SYS: 55, // fortification a single anchorage can carry
  FORT_INVEST: 0.18,    // fraction of surplus treasury spent on works each year
  FORT_RESERVE: 50,     // operating cash a haven keeps before it fortifies
  FORT_DECAY: 0.93,     // works weather and decay without upkeep
  FORT_GRAFT: 0.7,      // share of spend that becomes real defense (rest is graft)
  // arms & war readiness
  ARMS_PER_POP: 0.12,   // weapons a world wants stocked per million people
  ARMS_FLOOR: 0.4,      // combat strength of a totally disarmed world (vs 1.0 fully armed)
  ARMS_BATTLE_USE: 0.18, // fraction of a world's arms spent in a year of fighting at its gates
  // contraband: narcotics & the slave trade
  DRUG_YIELD: 0.05,     // narcotics refined per unit of (pop x dev) at an outlaw world
  DRUG_ADDICT: 1.4,     // how fast consumption builds an addicted underclass
  SLAVE_LABOR: 0.7,     // labor a held slave supplies vs a free worker
  SLAVE_UNREST: 0.5,    // how much a large bonded population inflames the free poor
};

// faction-funded works of generations; cost is treasury paid in over decades
export const PROJECT_TYPES = {
  nexus: {
    name: "Gate Nexus",
    cost: 560,
    blurb: "a lattice of grand gates — freight moves almost for free",
  },
  arcology: {
    name: "Orbital Arcology",
    cost: 700,
    blurb: "ring habitats that let a world carry millions more",
  },
  terraform: {
    name: "Terraforming Array",
    cost: 500,
    blurb: "mirrors and seed-ships that turn rock into farmland",
  },
};

// ---------- technology eras ----------
// A slow galactic tech level, advanced by rich developed worlds and cheap
// electronics. Each era arrives with a named headline technology and nudges
// yields up and freight down — the 500-year arc gets a direction.
export const TECH_ERAS = [
  { name: "The Age of Sail-Gates", tech: null },
  { name: "The Second Foundry Age", tech: "self-tuning smelters" },
  { name: "The Age of Cold Chains", tech: "cryo-freight and cold-sleep shipping" },
  { name: "The Verdant Turn", tech: "vat agriculture" },
  { name: "The Age of Bright Gates", tech: "self-repairing jumpgates" },
  { name: "The Clinical Age", tech: "gene-tailored medicine" },
  { name: "The Age of Thinking Metal", tech: "mindful automata" },
  { name: "The Luminous Age", tech: "zero-loss power lattices" },
];
// what the current tech level does to the world, everywhere at once
export function techFx(w) {
  const lv = w.tech?.level ?? 0;
  return {
    yield: 1 + 0.05 * lv,             // fields, mines, and wells
    mfg: 1 + 0.07 * lv,               // industry gains compound faster
    freight: Math.pow(0.94, lv),      // hauling gets cheaper every era
    med: Math.min(0.35, 0.06 * lv),   // extra plague survival
  };
}

export const FAITH_COLORS = [
  "#E8B04B", "#5CC8DA", "#C05DD6", "#6FBF73",
  "#E4708A", "#7B8CE8", "#E8D14B", "#4FD0A5",
];

// ---------- the commodity tree ----------
// Four categories, seven tradable goods. Raw goods come out of the ground;
// manufactured goods are made by industry from raw inputs (see RECIPES).
export const GOOD_CATS = [
  { key: "food", label: "Food", goods: ["grain"] },
  { key: "minerals", label: "Minerals", goods: ["metals", "rares"] },
  { key: "energy", label: "Energy", goods: ["fuel"] },
  { key: "goods", label: "Goods", goods: ["consumer", "medicine", "electronics"] },
  { key: "arms", label: "Arms", goods: ["weapons"] },
];
export const GOODS = GOOD_CATS.flatMap((c) => c.goods);
// Contraband is NOT part of GOODS: it never flows through the ordinary
// production/consumption/trade loops. It has its own phase (contraband.js),
// its own legality rules, and lives in dedicated system fields. Slaves are
// a population/commodity hybrid — moving them moves people.
export const CONTRABAND = ["drugs", "slaves"];
export const GOOD_LABEL = {
  grain: "grain", metals: "metals", rares: "rare earths", fuel: "fuel",
  consumer: "consumer goods", medicine: "medicine", electronics: "electronics",
  weapons: "weapons", drugs: "narcotics", slaves: "slaves",
};
// All value in the galaxy is denominated in the credit (cr) — the universal
// unit of account. Prices, wealth, treasuries, freight margins, tariffs and
// project costs below are all credit figures; BASE_PRICE is what one unit of
// each good fetches on a market at perfect equilibrium.
export const BASE_PRICE = {
  grain: 1.0, metals: 1.3, rares: 4.0, fuel: 1.6,
  consumer: 3.0, medicine: 5.0, electronics: 6.5, weapons: 8.0,
  // reference prices for the contraband markets (contraband.js sets the
  // live figures); vice and human cargo both fetch a heavy premium
  drugs: 12.0, slaves: 9.0,
};
// per-good freight cost multiplier for hauling across a gate:
// bulk cargo is dear to move, high-value-per-ton cargo is cheap
export const FREIGHT_COST = {
  grain: 1.3, metals: 1.6, rares: 0.5, fuel: 1.0,
  consumer: 0.8, medicine: 0.5, electronics: 0.5, weapons: 0.6,
};
// what one unit of each manufactured good eats off the local stockpile
export const RECIPES = {
  consumer: { metals: 0.4, fuel: 0.25 },
  medicine: { grain: 0.3, rares: 0.1, fuel: 0.1 },
  electronics: { metals: 0.25, rares: 0.3, fuel: 0.2 },
  weapons: { metals: 0.5, electronics: 0.15 }, // arms need steel and circuits
};
// industry output per unit of labor share, scaled by development
export const MFG_YIELD = { consumer: 2.7, medicine: 1.3, electronics: 1.1, weapons: 0.9 };

// ---------- the social pyramid ----------
// Every settled world's population splits into four strata. `labor` is how
// much of the class actually works the fields, mines, and lines; `needs`
// is yearly consumption per million; `mobility` is eagerness to emigrate;
// `mortality` is relative death rate when famine or plague culls a world.
// Consumption is allocated top-down: the elite buy first, workers get
// whatever is left on the shelves — scarcity lands on the bottom.
export const CLASSES = ["elite", "upper", "middle", "worker"];
export const CLASS_DEF = {
  elite: {
    label: "Elite", color: "#E8B04B", labor: 0,
    needs: { grain: 1.0, consumer: 1.2, medicine: 0.4, electronics: 0.6 },
    mobility: 0.15, mortality: 0.4,
  },
  upper: {
    label: "Upper class", color: "#C05DD6", labor: 0.35,
    needs: { grain: 1.0, consumer: 0.8, medicine: 0.3, electronics: 0.25 },
    mobility: 0.5, mortality: 0.7,
  },
  middle: {
    label: "Middle class", color: "#5CC8DA", labor: 0.8,
    needs: { grain: 1.0, consumer: 0.5, medicine: 0.15, electronics: 0.05 },
    mobility: 0.9, mortality: 1.0,
  },
  worker: {
    label: "Workers", color: "#6FBF73", labor: 1.0,
    needs: { grain: 1.0, consumer: 0.2 },
    mobility: 1.2, mortality: 1.15,
  },
};
// the mix of an old settled world, and of the steerage decks of a colony ship
export const START_MIX = { elite: 0.02, upper: 0.1, middle: 0.33, worker: 0.55 };
export const ELITE_CAP = 0.06; // no world stays majority-idle for long

export const FACTION_COLORS = [
  "#E8B04B", "#5CC8DA", "#C05DD6", "#6FBF73", "#E4708A",
  "#7B8CE8", "#D9823B", "#4FD0A5", "#B8C94A", "#DA5CB0",
  "#8A6FE8", "#4BA3E8", "#E8D14B", "#5CE87B",
];

export const CULTURES = [
  { name: "Vessari", syll: ["ve", "sa", "ri", "al", "ith", "ora", "en", "lys", "mar"], vec: [0.9, 0.2, 0.4] },
  { name: "Korrin", syll: ["kor", "gra", "dun", "vok", "tar", "rok", "bar", "ug", "drenn"], vec: [0.1, 0.8, 0.3] },
  { name: "Auleth", syll: ["au", "leth", "ei", "sol", "ane", "yr", "cel", "ion", "the"], vec: [0.5, 0.1, 0.9] },
  { name: "Dzan", syll: ["dza", "khe", "mun", "tsa", "ryn", "gol", "she", "kai", "urt"], vec: [0.3, 0.6, 0.8] },
  { name: "Meridian", syll: ["mer", "ida", "nov", "ter", "lux", "pra", "vin", "sta", "cor"], vec: [0.7, 0.5, 0.1] },
  { name: "Oktai", syll: ["ok", "tai", "hru", "zem", "vol", "nak", "iri", "shu", "pon"], vec: [0.2, 0.4, 0.6] },
];

export const FACTION_SUFFIX_CALM = ["League", "Compact", "Union", "Concord", "Assembly"];
export const FACTION_SUFFIX_AGGR = ["Hegemony", "Mandate", "Ascendancy", "Dominion", "Combine"];

// ---------- forms of power ----------
// Free systems are the fifth form: no faction at all — no duties, no
// protection. Everything with a government gets a row here.
export const GOVS = {
  empire: {
    label: "Empire", badge: "#E4708A",
    taxMul: 1.2,            // the throne takes more
    tariff: [0.15, 0.3],
    warMul: 1.4,            // quicker to draw the sword
    warCost: 10,            // war machine runs cheap — it is the state
    warStab: 0.005,         // war unites the empire
    wbStab: 0.15,           // the court barely hears the hungry
    allyRivalry: 8,         // almost never signs accords
    expandMul: 1.2,
  },
  republic: {
    label: "Republic", badge: "#5CC8DA",
    taxMul: 0.95,
    tariff: [0.03, 0.15],
    warMul: 0.6,
    warCost: 14,
    warStab: -0.06,         // assemblies sour on long wars
    wbStab: 0.3,            // voters remember empty granaries
    allyRivalry: 16,        // signs open-lanes accords readily
    expandMul: 0.8,
  },
  corporate: {
    label: "Corporate Charter", badge: "#E8B04B",
    taxMul: 0,              // income comes from trade throughput instead
    tariff: [0, 0.05],
    warMul: 0.15,           // war is bad for business
    warCost: 20,
    warStab: -0.08,
    wbStab: 0.15,
    allyRivalry: 20,
    expandMul: 0,           // expands only by purchasing charters
  },
  pirate: {
    label: "Corsair Haven", badge: "#A34A3A",
    taxMul: 0,              // lives on loot, handled by the pirates phase
    tariff: [0, 0],
    warMul: 0,              // outlaws: no declared wars, no diplomacy
    warCost: 0,
    warStab: 0,
    wbStab: 0,
    allyRivalry: 0,
    expandMul: 0,
  },
};

// --- contraband legality by government ---
// Narcotics and the slave trade are lawful only under some flags. Republics
// abolish both on principle; empires keep slaves but outlaw the drug trade;
// chartered corporations ban both to protect their trading access; only the
// corsairs deal openly in everything. Free systems each decide for
// themselves — an "outlaw" free port tolerates both (s.outlaw).
export const GOV_CONTRABAND = {
  empire: { drugs: false, slaves: true },
  republic: { drugs: false, slaves: false },
  corporate: { drugs: false, slaves: false },
  pirate: { drugs: true, slaves: true },
};
// `gov` is a faction government key, or null for a free system (then the
// world's own outlaw flag decides).
export function allowsDrugs(gov, outlaw) {
  return gov ? !!GOV_CONTRABAND[gov]?.drugs : !!outlaw;
}
export function allowsSlaves(gov, outlaw) {
  return gov ? !!GOV_CONTRABAND[gov]?.slaves : !!outlaw;
}

export const PIRATE_COLORS = ["#A34A3A", "#8A3B4C", "#95502E"];
export const CORP_STATE_COLORS = ["#E8B04B", "#D9A63F", "#C99648"];

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// the fixed palette covers the founding powers; later factions get a
// golden-angle hue so neighbors never share a color, however many rise
export function factionColor(id) {
  if (id < FACTION_COLORS.length) return FACTION_COLORS[id];
  return hslToHex((id * 137.508) % 360, 0.6, 0.62);
}
