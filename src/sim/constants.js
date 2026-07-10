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
  FOOD_PER_POP: 1.0,
  GOODS_PER_POP: 0.5,
  FOOD_YIELD: 6.0,
  ORE_YIELD: 3.0,
  FUEL_YIELD: 3.0,
  GOODS_YIELD: 2.2,
  MIN_QUALITY_FLOOR: 0.25,
  FOOD_SPOILAGE: 0.85,
  GROWTH_THRESHOLD: 0.58,
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

export const FAITH_COLORS = [
  "#E8B04B", "#5CC8DA", "#C05DD6", "#6FBF73",
  "#E4708A", "#7B8CE8", "#E8D14B", "#4FD0A5",
];

export const GOODS = ["food", "ore", "fuel", "goods"];
export const BASE_PRICE = { food: 1.0, ore: 1.3, fuel: 1.6, goods: 3.2 };
// per-good freight cost multiplier for hauling across a gate
export const FREIGHT_COST = { food: 1.3, ore: 1.6, fuel: 1.0, goods: 0.8 };

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
