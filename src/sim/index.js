// Public surface of the simulation engine. Everything here is plain,
// DOM-free JavaScript — it runs in the browser and in Node alike.
export { genGalaxy, rebuildAdj } from "./galaxy.js";
export { simulateYear } from "./simulate.js";
export { buildStats } from "./stats.js";
export { diagnoseSystem, SEV_CRISIS, SEV_WARNING, SEV_WATCH } from "./diagnose.js";
export { CONFIG_GROUPS, CONFIG_PARAMS, PRESETS, defaultConfig, carryCap } from "./config.js";
export { log, relKey, getRel } from "./events.js";
export {
  T, GOODS, GOOD_CATS, GOOD_LABEL, BASE_PRICE, FREIGHT_COST, RECIPES,
  CLASSES, CLASS_DEF, FACTION_COLORS, CULTURES,
} from "./constants.js";
export { mulberry32, makeRng } from "./rng.js";
export { clamp, dist2, cultDist, avgCult } from "./util.js";
