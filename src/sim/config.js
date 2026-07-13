// ---------- simulation configuration ----------
// Every knob the New Game screen exposes lives here, schema-first: the
// setup UI renders itself from CONFIG_GROUPS and the engine reads the
// chosen values off `w.cfg`. Defaults reproduce the classic tuning in
// constants.js exactly — a default config is the game as it always was.

export const CONFIG_GROUPS = [
  {
    key: "galaxy", label: "Galaxy", blurb: "the stage itself — set before the first year is simulated",
    params: [
      { key: "systems", label: "star systems", def: 96, min: 32, max: 160, step: 8, kind: "int",
        blurb: "how many systems the galaxy holds; the map scales to keep the same density" },
      { key: "settled", label: "settled at dawn", def: 42, min: 15, max: 70, step: 1, kind: "pct",
        blurb: "% of systems carrying people in year zero — the rest wait for colony ships" },
      { key: "factions", label: "founding powers", def: 12, min: 4, max: 24, step: 1, kind: "int",
        blurb: "empires and republics standing at the start (capped by settled worlds)" },
      { key: "houses", label: "merchant houses", def: 5, min: 2, max: 10, step: 1, kind: "int",
        blurb: "chartered trading houses flying at the start" },
      { key: "burnYears", label: "years of history", def: 300, min: 0, max: 1000, step: 50, kind: "int",
        blurb: "years simulated before you arrive — 0 drops you at the founding" },
    ],
  },
  {
    key: "worlds", label: "Worlds & Nature", blurb: "what the ground gives and what it carries",
    params: [
      { key: "fertility", label: "fertility", def: 1, min: 0.5, max: 2, step: 0.05, kind: "mult",
        blurb: "crop yields everywhere — below ×1 the grain lanes decide who eats" },
      { key: "richness", label: "resource richness", def: 1, min: 0.4, max: 3, step: 0.05, kind: "mult",
        blurb: "size of ore veins and fuel fields; lean veins mean early depletion crises" },
      { key: "capacity", label: "carrying capacity", def: 1, min: 0.5, max: 2, step: 0.05, kind: "mult",
        blurb: "how many people a world holds before crowding crushes wellbeing" },
    ],
  },
  {
    key: "society", label: "People & Society", blurb: "how humanity grows, moves, and seethes",
    params: [
      { key: "growth", label: "demographic drive", def: 1, min: 0.5, max: 2, step: 0.05, kind: "mult",
        blurb: "how fast populations swell in good years and thin in bad ones" },
      { key: "migration", label: "wanderlust", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "eagerness to emigrate and found colonies — at ×0 nobody leaves home" },
      { key: "unrest", label: "class anger", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "how loudly the bottom notices the gap to the top; feeds riots and revolts" },
      { key: "research", label: "ingenuity", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "how fast rich, developed worlds push the galaxy into new technology eras" },
    ],
  },
  {
    key: "politics", label: "War & Politics", blurb: "the tempers of the powers",
    params: [
      { key: "aggression", label: "aggression", def: 1, min: 0, max: 3, step: 0.05, kind: "mult",
        blurb: "willingness to declare wars and embargoes — ×0 is a galaxy of cold peace" },
      { key: "expansion", label: "expansionism", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "hunger to annex free systems and buy charters" },
      { key: "diplomacy", label: "diplomacy", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "readiness to sign open-lanes accords that zero tariffs between friends" },
      { key: "upheaval", label: "upheaval", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "frequency of revolutions, coups, and secessions when powers falter" },
    ],
  },
  {
    key: "commerce", label: "Commerce", blurb: "the friction on the lanes",
    params: [
      { key: "freight", label: "freight costs", def: 1, min: 0.4, max: 2.5, step: 0.05, kind: "mult",
        blurb: "cost of hauling cargo through a gate — cheap freight knits the galaxy together" },
      { key: "tariffs", label: "tariffs", def: 1, min: 0, max: 2.5, step: 0.05, kind: "mult",
        blurb: "duties every power charges at its borders; ×0 is galactic free trade" },
      { key: "piracy", label: "corsair activity", def: 1, min: 0, max: 3, step: 0.05, kind: "mult",
        blurb: "how readily desperate worlds raise the black flag, and how hard they raid" },
      { key: "contraband", label: "underworld", def: 1, min: 0, max: 3, step: 0.05, kind: "mult",
        blurb: "vigor of the narcotics and slave trades — ×0 is a galaxy with no underworld" },
    ],
  },
  {
    key: "calamities", label: "Calamities", blurb: "what the void throws at you",
    params: [
      { key: "plague", label: "plague", def: 1, min: 0, max: 4, step: 0.1, kind: "mult",
        blurb: "odds of plague sweeping a world each year (base ~0.4%/world)" },
      { key: "flare", label: "stellar flares", def: 1, min: 0, max: 4, step: 0.1, kind: "mult",
        blurb: "odds of a flare scouring a world's stockpiles" },
      { key: "oreStrikes", label: "ore strikes", def: 1, min: 0, max: 4, step: 0.1, kind: "mult",
        blurb: "odds of prospectors finding vast new veins — the one kind shock" },
      { key: "gateFlux", label: "gate flux", def: 1, min: 0, max: 4, step: 0.1, kind: "mult",
        blurb: "how often jumpgates collapse and new ones open, redrawing the lanes" },
    ],
  },
];

export const CONFIG_PARAMS = CONFIG_GROUPS.flatMap((g) => g.params);

export function defaultConfig() {
  return Object.fromEntries(CONFIG_PARAMS.map((p) => [p.key, p.def]));
}

// named galaxies: a handful of authored starting conditions
export const PRESETS = [
  {
    key: "standard", name: "The Standard Model",
    blurb: "the galaxy as the chroniclers know it — every knob at its classic value",
    overrides: {},
  },
  {
    key: "golden", name: "Golden Age",
    blurb: "rich veins, fat harvests, calm tempers — history as a long afternoon",
    overrides: { fertility: 1.3, richness: 1.6, aggression: 0.5, diplomacy: 1.6, plague: 0.5, flare: 0.5, piracy: 0.5 },
  },
  {
    key: "longdark", name: "The Long Dark",
    blurb: "thin soil, sick worlds, dying mines — survival is the only victory",
    overrides: { fertility: 0.7, richness: 0.6, plague: 2.2, flare: 2, growth: 0.8, piracy: 1.6, unrest: 1.4 },
  },
  {
    key: "bloodiron", name: "Blood & Iron",
    blurb: "proud powers, short fuses, borders drawn in fire",
    overrides: { aggression: 2.4, expansion: 1.6, upheaval: 1.6, diplomacy: 0.4, factions: 16 },
  },
  {
    key: "freelanes", name: "The Free Lanes",
    blurb: "weak states, cheap freight, merchant princes — and corsairs in the shallows",
    overrides: { factions: 7, houses: 9, freight: 0.55, tariffs: 0.3, piracy: 1.8, expansion: 0.6 },
  },
  {
    key: "crowded", name: "Crowded Sky",
    blurb: "a dense, teeming galaxy already bursting at the seams",
    overrides: { systems: 144, settled: 60, factions: 20, migration: 1.6, capacity: 0.8, unrest: 1.3 },
  },
];

// ---------- intensity ----------
// A one-word temperament for a configuration — the Quick Start screen's
// answer to "how rough will this history be?". Pure arithmetic over the
// config: hostile tempers and calamities push it up, abundance pulls it
// down. The tier boundaries are calibrated so the named presets read the
// way their blurbs promise (Golden Age peaceful, The Long Dark catastrophic).
export const INTENSITY_TIERS = [
  { key: "peaceful", label: "peaceful", max: 0.85,
    blurb: "calm lanes and mild tempers — history as a long afternoon" },
  { key: "temperate", label: "temperate", max: 1.15,
    blurb: "the classic balance — trouble comes, but so do the good years" },
  { key: "volatile", label: "volatile", max: 1.5,
    blurb: "wars, revolts, and lean harvests will shape this history" },
  { key: "catastrophic", label: "catastrophic", max: Infinity,
    blurb: "a hostile galaxy — survival itself will be the story" },
];

export function galaxyIntensity(cfg) {
  const c = { ...defaultConfig(), ...cfg };
  const lean = (v) => 1 / Math.max(0.25, v); // scarcity: below ×1 turns hostile
  const hostility = (c.aggression + c.upheaval + c.unrest + c.piracy) / 4;
  const calamity = (c.plague + c.flare) / 2;
  const scarcity = (lean(c.fertility) + lean(c.richness) + lean(c.capacity)) / 3;
  const score = hostility * 0.45 + calamity * 0.3 + scarcity * 0.25;
  return { score, ...INTENSITY_TIERS.find((t) => score < t.max) };
}

// carrying capacity in millions — the one formula economy.js and
// diagnose.js must agree on, so it lives here
export function carryCap(w, s) {
  return (s.hab * 120 + s.fert * 80 + 8) * (w.cfg?.capacity ?? 1) + (s.mega.arcology ? 100 : 0);
}
