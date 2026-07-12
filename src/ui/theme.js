import { clamp } from "../sim/util.js";

// ---------- event styling ----------
export const EV_STYLE = {
  war: { c: "#E4572E", tag: "WAR" }, peace: { c: "#7B8CE8", tag: "PEACE" },
  battle: { c: "#E4708A", tag: "BATTLE" }, siege: { c: "#F2A93B", tag: "SIEGE" },
  capture: { c: "#C05DD6", tag: "TAKEN" },
  collapse: { c: "#E4572E", tag: "FALL" }, death: { c: "#B0453A", tag: "DARK" },
  famine: { c: "#F2A93B", tag: "FAMINE" }, plague: { c: "#F2A93B", tag: "PLAGUE" },
  colony: { c: "#6FBF73", tag: "COLONY" }, found: { c: "#5CC8DA", tag: "RISE" },
  secede: { c: "#F2A93B", tag: "SPLIT" }, annex: { c: "#C05DD6", tag: "ANNEX" },
  cede: { c: "#C05DD6", tag: "CEDE" }, strike: { c: "#E8B04B", tag: "STRIKE" },
  flare: { c: "#F2A93B", tag: "FLARE" }, gate: { c: "#5CC8DA", tag: "GATE" },
  era: { c: "#E6E1D3", tag: "ERA" }, cap: { c: "#7B8CE8", tag: "SEAT" },
  house: { c: "#E8B04B", tag: "HOUSE" }, embargo: { c: "#F2A93B", tag: "EMBARGO" },
  build: { c: "#6FBF73", tag: "BUILD" }, accord: { c: "#5CC8DA", tag: "ACCORD" },
  mega: { c: "#4FD0A5", tag: "WONDER" }, faith: { c: "#B79BE8", tag: "FAITH" },
  corp: { c: "#E8B04B", tag: "CORP" },
  pirate: { c: "#A34A3A", tag: "CORSAIR" }, raid: { c: "#A34A3A", tag: "RAID" },
  revolution: { c: "#F2A93B", tag: "REVOLT" },
  riot: { c: "#E4572E", tag: "RIOT" },
};

export const EV_FILTERS = {
  all: null,
  war: new Set(["war", "peace", "battle", "siege", "capture", "cede", "pirate", "raid"]),
  realm: new Set(["found", "collapse", "secede", "annex", "cap", "era", "faith", "revolution"]),
  economy: new Set(["house", "corp", "embargo", "build", "mega", "accord", "strike", "gate", "flare"]),
  life: new Set(["famine", "plague", "colony", "death", "riot"]),
};

// ---------- overlay colors ----------
export function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
export function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
export function wbColor(wb) {
  return wb < 0.55 ? mixHex("#E4572E", "#F2A93B", clamp(wb / 0.55, 0, 1))
    : mixHex("#F2A93B", "#6FBF73", clamp((wb - 0.55) / 0.45, 0, 1));
}

export const OVERLAYS = ["realm", "wealth", "life", "trade", "faith", "culture"];

// full-screen panels summoned from the command bar; the side window is
// reserved for system/power inspection
export const SCREENS = {
  trade: { glyph: "⇌", title: "Trade & Commerce", narrow: false },
  market: { glyph: "◈", title: "The Galactic Market", narrow: false },
  galaxy: { glyph: "✦", title: "The Long View", narrow: false },
  chronicle: { glyph: "≡", title: "The Chronicle", narrow: true },
};

// Chart series colors — darker steps of the app palette, validated against
// the dark panel surface (OKLCH lightness band 0.48–0.67, chroma floor,
// CVD adjacent-pair separation, ≥3:1 contrast). Multi-series charts must
// also direct-label their lines (red↔green sits in the CVD floor band).
export const CHART = {
  amber: "#C68018",
  cyan: "#2E9DB1",
  green: "#459C4E",
  purple: "#C05DD6",
  red: "#E4572E",
};
