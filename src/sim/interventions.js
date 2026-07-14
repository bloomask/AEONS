import { T, PROJECT_TYPES, FACTION_COLORS, GOVS, factionColor, techFx } from "./constants.js";
import { clamp, dist2 } from "./util.js";
import { log, relKey, getRel, facRef, sysRef } from "./events.js";
import { rebuildAdj } from "./galaxy.js";
import { movePop, skewDeaths } from "./society.js";
import { completeProject } from "./phases/projects.js";
import { foundCuratedFaction } from "./factions.js";

// ---------------------------------------------------------------------------
// Curator interventions — the Curate half of the product contract
// (docs/PRODUCT.md). The player never owns a faction, a fleet, or a company;
// they reach into the running world with a small set of bounded acts, each
// grounded in a mechanic the autonomous simulation already has (relief works
// like stockpiles, discord works like rivalry, a curator gate works like gate
// flux). The engine stays in charge of the consequences.
//
// Three hard rules keep this layer honest:
//   • NO RNG. Every intervention is a pure function of (world, params), so
//     applying one never advances or perturbs `w.rng` — the autonomous
//     history around it is untouched, and a replay is exact.
//   • Every applied intervention appends a command record to `w.commands`
//     ({i, year, key, params}) and writes a chronicle entry. The record is
//     the deterministic log: same save + same commands at the same years
//     replays the same history, byte for byte.
//   • `preview` (the "anticipated pressure" the UI shows before confirming)
//     is read-only, like the derived views in diagnose/classify/explain.
//
// Public surface: INTERVENTIONS / INTERVENTION_BY_KEY (definitions the UI
// renders), validateIntervention, previewIntervention, applyIntervention.
// ---------------------------------------------------------------------------

// curator dosage knobs — how hard each act presses on the world. These are
// intervention magnitudes, not autonomous-balance constants, so they live
// here rather than in constants.js `T` (the balance lab never sees them).
export const CURATOR = {
  RELIEF_GRAIN_YEARS: 2.5, // grain delivered, in years of local demand
  RELIEF_MED_PER_POP: 0.3, // medicine delivered per million people
  RELIEF_CALM: 0.08,       // unrest eased by a visible act of kindness
  COLONY_MAX_SHIPS: 2.0,   // settlers carried, in millions (settlement.js cap)
  COLONY_SHIP_FRAC: 0.07,  // fraction of the source world that boards
  PROJECT_GRANT: 80,       // credits granted to a megaproject per act
  SOOTHE_RIVALRY: 35,      // rivalry eased by brokered talks
  BROKERED_RIVALRY: 25,    // rivalry two powers settle at after a brokered peace
  DISCORD_RIVALRY: 35,     // rivalry inflamed by forged grievances
  CALM_UNREST: 0.35,       // unrest eased by doles and festivals
  CALM_RIOT_CD: 3,         // years of riot cooldown bought by the doles
  CALM_GOODS_PER_POP: 0.4, // consumer goods handed out per million people
  INFLAME_UNREST: 0.35,    // unrest stoked by provocateurs
  GATE_RANGE: 260,         // max distance a curator gate can span (shocks.js flux range)
  PLAGUE_SURVIVAL: 0.55,   // base survival of a triggered plague (midpoint of shocks.js roll)
};

export const FACTION_PRESETS = [
  {
    key: "republic", name: "Frontier Republic",
    blurb: "A stable civic colony inclined toward accords and measured expansion.",
    values: { gov: "republic", pop: 5, dev: 0.85, treasury: 90, stability: 0.84, aggr: 0.2, expans: 0.58, tariff: 0.08 },
  },
  {
    key: "empire", name: "Imperial Expedition",
    blurb: "A well-funded command colony built to claim neighbors and endure wars.",
    values: { gov: "empire", pop: 7, dev: 0.9, treasury: 120, stability: 0.76, aggr: 0.72, expans: 0.78, tariff: 0.22 },
  },
  {
    key: "corporate", name: "Commercial Charter",
    blurb: "A compact trade state with deep reserves, low duties, and little appetite for war.",
    values: { gov: "corporate", pop: 4, dev: 1.05, treasury: 150, stability: 0.88, aggr: 0.1, expans: 0.42, tariff: 0.03 },
  },
];

const FACTION_DEFAULTS = FACTION_PRESETS[0].values;
export const CURATED_FACTION_COLORS = FACTION_COLORS;

const ALIVE = 0.05;
const sys = (w, id) => w.systems[Number(id)];
const fac = (w, id) => w.factions[Number(id)];
const isAlive = (s) => !!s && s.pop > ALIVE;
const pop1 = (n) => `${n.toFixed(1)}M`;

const sysOpt = (s) => ({ v: s.id, label: s.name });
const aliveSystems = (w) => w.systems.filter(isAlive);
const liveStates = (w) => w.factions.filter((f) => !f.dead && f.gov !== "pirate");
const emptySystems = (w) => w.systems.filter((s) => s.pop <= ALIVE && !s.ruined);

function curatedFactionSpec(w, p) {
  const site = sys(w, p.sysId);
  const base = site?.name?.split(" ")[0] || "Frontier";
  const gov = GOVS[p.gov] && p.gov !== "pirate" ? p.gov : FACTION_DEFAULTS.gov;
  const suffix = gov === "empire" ? "Dominion" : gov === "corporate" ? "Charter" : "Republic";
  const n = String(p.name || `${base} ${suffix}`).trim().slice(0, 48);
  return {
    name: n,
    gov,
    color: /^#[0-9a-f]{6}$/i.test(String(p.color || "")) ? p.color : factionColor(w.nextFid),
    pop: Number(p.pop ?? FACTION_DEFAULTS.pop),
    dev: Number(p.dev ?? FACTION_DEFAULTS.dev),
    treasury: Number(p.treasury ?? FACTION_DEFAULTS.treasury),
    stability: Number(p.stability ?? FACTION_DEFAULTS.stability),
    aggr: Number(p.aggr ?? FACTION_DEFAULTS.aggr),
    expans: Number(p.expans ?? FACTION_DEFAULTS.expans),
    tariff: Number(p.tariff ?? FACTION_DEFAULTS.tariff),
  };
}

// faction-pair params travel as a "lo|hi" relKey string so a command record
// stays a flat JSON object; parse back to the two live factions (or null)
function pairOf(w, p) {
  const [a, b] = String(p.pair ?? "").split("|").map(Number);
  const A = fac(w, a), B = fac(w, b);
  if (!A || !B || A === B || A.dead || B.dead) return null;
  return [A, B];
}

// every faction pair that has anything between it worth brokering or breaking
function statePairs(w) {
  const states = liveStates(w);
  const out = [];
  for (let i = 0; i < states.length; i++)
    for (let j = i + 1; j < states.length; j++) {
      const A = states[i], B = states[j];
      const rel = w.relations[relKey(A.id, B.id)];
      out.push({ A, B, rel, key: relKey(A.id, B.id) });
    }
  return out;
}

const relStatus = (rel) =>
  !rel ? "strangers"
    : rel.war ? `at war since ${rel.war.since}`
      : rel.allied ? "allied"
        : rel.embargo ? `embargo, rivalry ${Math.round(rel.rivalry)}`
          : `rivalry ${Math.round(rel.rivalry)}`;

// what settlement.js demands of a colony site — the curator provisions the
// expedition like a megacorp, so prospector-viability is included
function colonySites(w, from) {
  if (!isAlive(from)) return [];
  return w.adj[from.id]
    .map(({ to }) => w.systems[to])
    .filter((o) =>
      o.pop <= ALIVE && o.hab > 0.3 &&
      (!o.ruined || w.year - o.diedYear > 25) &&
      (o.fert >= 0.3 || o.min + o.rare > 0.7));
}

// the infrastructure a system can still add (settlement.js level caps)
function infraChoices(s) {
  const out = [];
  if (!s) return out;
  if (s.infra.gran < 3) out.push({ v: "gran", label: `orbital granaries (level ${s.infra.gran + 1})` });
  if (s.infra.gate < 3) out.push({ v: "gate", label: `jumpgate docks (level ${s.infra.gate + 1})` });
  if (s.infra.mine < 2) out.push({ v: "mine", label: `deep mine shafts (level ${s.infra.mine + 1})` });
  return out;
}

const fundableProjects = (w) => w.projects
  .map((p, idx) => ({ p, idx }))
  .filter(({ p }) => {
    if (p.done || p.abandoned) return false;
    const f = w.factions[p.fid], s = w.systems[p.sysId];
    return f && !f.dead && s.fid === p.fid && isAlive(s);
  });

// ---------------------------------------------------------------------------
// The interventions. Each entry:
//   key/label/glyph/blurb — identity, shown by the UI
//   destructive           — the UI must ask for confirmation before applying
//   fields                — param pickers: {key, label, options(w, sofar)};
//                           option values are plain JSON scalars
//   validate(w, params)   — null when applicable, else a human-readable reason
//   preview(w, params)    — anticipated pressure: read-only prose lines
//   apply(w, params)      — mutate the world + chronicle (assumes validated)
// ---------------------------------------------------------------------------
export const INTERVENTIONS = [
  {
    key: "foundFaction",
    label: "Start a new faction",
    glyph: "\u2691",
    blurb: "Prepare a new people and charter, then raise their flag on an uncolonised system.",
    destructive: false,
    fields: [{ key: "sysId", label: "founding system", mapKind: "system", options: (w) => emptySystems(w).map(sysOpt) }],
    validate(w, p) {
      const s = sys(w, p.sysId);
      if (!s || s.pop > ALIVE || s.ruined) return "the founding site must be an uncolonised system";
      const spec = curatedFactionSpec(w, p);
      if (!spec.name) return "the faction needs a name";
      if (!GOVS[spec.gov] || spec.gov === "pirate") return "choose a civil government";
      if (!(spec.pop >= 1 && spec.pop <= 20)) return "starting population must be between 1M and 20M";
      if (!(spec.dev >= 0.5 && spec.dev <= 1.5)) return "development must be between 0.5 and 1.5";
      if (!(spec.treasury >= 20 && spec.treasury <= 300)) return "treasury must be between 20 and 300 credits";
      for (const k of ["stability", "aggr", "expans"])
        if (!(spec[k] >= 0 && spec[k] <= 1)) return `${k} must be between 0 and 1`;
      if (!(spec.tariff >= 0 && spec.tariff <= 0.5)) return "tariff must be between 0% and 50%";
      return null;
    },
    preview(w, p) {
      const s = sys(w, p.sysId), spec = curatedFactionSpec(w, p);
      return [
        `${spec.name} begins at ${s.name} with ${spec.pop.toFixed(1)}M settlers and ${spec.treasury.toFixed(0)} credits`,
        `${GOVS[spec.gov].label.toLowerCase()} government \u00b7 stability ${Math.round(spec.stability * 100)}% \u00b7 tariff ${Math.round(spec.tariff * 100)}%`,
        `aggression ${Math.round(spec.aggr * 100)}% \u00b7 expansionism ${Math.round(spec.expans * 100)}% \u00b7 development \u00d7${spec.dev.toFixed(2)}`,
      ];
    },
    apply(w, p) {
      foundCuratedFaction(w, sys(w, p.sysId), curatedFactionSpec(w, p));
    },
  },

  {
    key: "relief",
    label: "Relief shipment",
    glyph: "✚",
    blurb: "Unflagged freighters deliver grain and medicine to a struggling world.",
    destructive: false,
    fields: [{ key: "sysId", label: "target world", mapKind: "system", options: (w) => aliveSystems(w).map(sysOpt) }],
    validate(w, p) {
      const s = sys(w, p.sysId);
      return isAlive(s) ? null : "the target must be a living world";
    },
    preview(w, p) {
      const s = sys(w, p.sysId);
      const grain = s.pop * CURATOR.RELIEF_GRAIN_YEARS;
      const med = s.pop * CURATOR.RELIEF_MED_PER_POP;
      return [
        `grain stocks +${grain.toFixed(0)} — roughly ${CURATOR.RELIEF_GRAIN_YEARS} years of local demand against famine`,
        `medicine stocks +${med.toFixed(0)} — a stocked pharmacopoeia blunts the next plague`,
        `unrest eases ${s.unrest.toFixed(2)} → ${Math.max(0, s.unrest - CURATOR.RELIEF_CALM).toFixed(2)}`,
      ];
    },
    apply(w, p) {
      const s = sys(w, p.sysId);
      s.stock.grain += s.pop * CURATOR.RELIEF_GRAIN_YEARS;
      s.stock.medicine += s.pop * CURATOR.RELIEF_MED_PER_POP;
      s.unrest = clamp(s.unrest - CURATOR.RELIEF_CALM, 0, 1);
      log(w, "curate", `Unflagged freighters descend on ${s.name}, holds heavy with grain and medicine. No power claims the kindness.`, s.id, {
        targets: [sysRef(s)], cause: "curate.relief",
        why: "the curator's unseen hand",
        effects: [
          { k: "grain", d: s.pop * CURATOR.RELIEF_GRAIN_YEARS },
          { k: "medicine", d: s.pop * CURATOR.RELIEF_MED_PER_POP },
          { k: "unrest", d: -CURATOR.RELIEF_CALM },
        ],
      });
    },
  },

  {
    key: "sponsorColony",
    label: "Sponsor a colony",
    glyph: "⚘",
    blurb: "Pay the freight for settlers from a thriving world to raise a colony next door.",
    destructive: false,
    fields: [
      {
        key: "fromId", label: "source world", mapKind: "system",
        options: (w) => aliveSystems(w).filter((s) => s.pop > 4 && colonySites(w, s).length).map(sysOpt),
      },
      {
        key: "toId", label: "colony site", mapKind: "system",
        options: (w, p) => colonySites(w, sys(w, p.fromId)).map(sysOpt),
      },
    ],
    validate(w, p) {
      const from = sys(w, p.fromId);
      if (!isAlive(from) || from.pop <= 4) return "the source must be a living world of more than 4M";
      const to = sys(w, p.toId);
      if (!to || !colonySites(w, from).some((o) => o.id === to.id))
        return "the site must be an empty, habitable, viable neighbor of the source";
      return null;
    },
    preview(w, p) {
      const from = sys(w, p.fromId), to = sys(w, p.toId);
      const m = Math.min(CURATOR.COLONY_MAX_SHIPS, from.pop * CURATOR.COLONY_SHIP_FRAC);
      return [
        `${pop1(m)} settlers board at ${from.name} (${pop1(from.pop)} → ${pop1(from.pop - m)})`,
        to.ruined ? `new towers rise over the ruins of ${to.name} (fell in ${to.diedYear})` : `${to.name} is settled for the first time`,
        `the colony is provisioned like a sponsored charter: grain, goods, medicine, development 0.75`,
        from.fid !== null ? `it will fly the flag of ${w.factions[from.fid].name}` : `it will fly no flag — a free world`,
      ];
    },
    apply(w, p) {
      const from = sys(w, p.fromId), to = sys(w, p.toId);
      const m = Math.min(CURATOR.COLONY_MAX_SHIPS, from.pop * CURATOR.COLONY_SHIP_FRAC);
      const wasRuin = to.ruined;
      to.pop = 0;
      movePop(from, to, m); // colony ships fill from the lower decks
      to.fid = from.fid;
      to.colonyFrom = from.id;
      to.dev = 0.75; // curator-provisioned, like a house-sponsored charter
      to.unrest = 0; to.riotCd = 0;
      // provisioned exactly like a house-sponsored expedition (settlement.js):
      // base colony stores plus the sponsor's extra holds
      to.stock.grain = m * 7;
      to.stock.consumer = m * 2;
      to.stock.medicine += m * 0.2;
      // the first generation plants fields before it builds factories
      for (const g of Object.keys(to.shares))
        to.shares[g] = g === "grain" ? 0.55 : 0.45 / (Object.keys(to.shares).length - 1);
      to.ruined = false;
      to.failure = null;
      to.settledYear = w.year; to.peakPop = m;
      to.lastFamine = -99; to.lastPlague = -99; to.lastWar = -99;
      to.faith = from.faith; to.sponsor = null;
      // a fresh colony inherits none of the dead world's underworld
      to.slaves = 0; to.drugs = 0; to.drugLoad = 0;
      w.stats.c[wasRuin ? "resettle" : "colony"]++;
      log(w, "curate",
        wasRuin
          ? `A benefactor no registry names pays the freight: settlers from ${from.name} raise new towers over the ruins of ${to.name}.`
          : `A benefactor no registry names pays the freight: ${from.name} founds a colony at ${to.name}.`,
        to.id, {
          actors: [sysRef(from)], targets: [sysRef(to)], systems: [from.id],
          cause: "curate.colony", why: "the curator paid the freight",
          effects: [
            { k: "pop", d: m, u: "M" },
            ...(to.fid !== null ? [{ k: "owner", from: null, to: to.fid }] : []),
          ],
        });
    },
  },

  {
    key: "fundInfrastructure",
    label: "Fund infrastructure",
    glyph: "⌂",
    blurb: "Endow a world with granaries, gate docks, or deep shafts it could not afford itself.",
    destructive: false,
    fields: [
      {
        key: "sysId", label: "target world", mapKind: "system",
        options: (w) => aliveSystems(w).filter((s) => infraChoices(s).length).map(sysOpt),
      },
      { key: "kind", label: "works", options: (w, p) => infraChoices(sys(w, p.sysId)) },
    ],
    validate(w, p) {
      const s = sys(w, p.sysId);
      if (!isAlive(s)) return "the target must be a living world";
      if (!infraChoices(s).some((c) => c.v === p.kind)) return "those works are already at their limit here";
      return null;
    },
    preview(w, p) {
      const s = sys(w, p.sysId);
      return {
        gran: [
          `granaries ${s.infra.gran} → ${s.infra.gran + 1}: grain keeps ~4% better each year against spoilage`,
          `a deeper larder between harvests — famine pressure eases`,
        ],
        gate: [
          `gate docks ${s.infra.gate} → ${s.infra.gate + 1}: cheaper freight through ${s.name}, more trade routed here`,
          `more traffic also means more customs revenue — and more smugglers caught`,
        ],
        mine: [
          `mine shafts ${s.infra.mine} → ${s.infra.mine + 1}: played-out veins yield again (quality floor rises)`,
          `extends the life of a mining world whose reserves are thinning`,
        ],
      }[p.kind];
    },
    apply(w, p) {
      const s = sys(w, p.sysId);
      s.infra[p.kind]++;
      w.stats.c.build++;
      const what = {
        gran: `new orbital granaries (level ${s.infra.gran})`,
        gate: `expanded jumpgate docks (level ${s.infra.gate})`,
        mine: `deep shafts into the played-out veins (level ${s.infra.mine})`,
      }[p.kind];
      log(w, "curate", `An endowment with no donor's name raises ${what} at ${s.name}.`, s.id, {
        targets: [sysRef(s)], cause: "curate.infrastructure",
        why: "the curator's endowment",
        effects: [{ k: p.kind, v: s.infra[p.kind] }],
      });
    },
  },

  {
    key: "fundProject",
    label: "Endow a megaproject",
    glyph: "✦",
    blurb: "Grant credits to a work of generations already under construction.",
    destructive: false,
    fields: [{
      key: "projectIdx", label: "project", mapKind: "project",
      options: (w) => fundableProjects(w).map(({ p, idx }) => ({
        v: idx,
        label: `${p.name} at ${w.systems[p.sysId].name} (${Math.round((p.progress / p.cost) * 100)}% built)`,
      })),
    }],
    validate(w, p) {
      const pr = w.projects[Number(p.projectIdx)];
      if (!pr) return "no such project";
      if (!fundableProjects(w).some(({ idx }) => idx === Number(p.projectIdx)))
        return "that project is finished, abandoned, or its site is lost";
      return null;
    },
    preview(w, p) {
      const pr = w.projects[Number(p.projectIdx)];
      const grant = Math.min(CURATOR.PROJECT_GRANT, pr.cost - pr.progress);
      const after = pr.progress + grant;
      const lines = [
        `${grant.toFixed(0)} cr reaches the works: ${Math.round((pr.progress / pr.cost) * 100)}% → ${Math.round((after / pr.cost) * 100)}% built`,
      ];
      lines.push(after >= pr.cost
        ? `the grant finishes it — ${PROJECT_TYPES[pr.type].blurb}`
        : `on completion: ${PROJECT_TYPES[pr.type].blurb}`);
      return lines;
    },
    apply(w, p) {
      const pr = w.projects[Number(p.projectIdx)];
      const s = w.systems[pr.sysId];
      const grant = Math.min(CURATOR.PROJECT_GRANT, pr.cost - pr.progress);
      pr.progress += grant;
      log(w, "curate", `An anonymous endowment reaches the ${pr.name} at ${s.name}; the scaffolds swarm with new crews.`, s.id, {
        targets: [facRef(pr.fid), sysRef(s)], cause: "curate.project-grant",
        why: "the curator's endowment",
        effects: [{ k: "credits", d: grant, u: "cr" }, { k: "built", v: Math.round((pr.progress / pr.cost) * 100), u: "%" }],
      });
      if (pr.progress >= pr.cost) completeProject(w, pr);
    },
  },

  {
    key: "brokerPeace",
    label: "Broker peace",
    glyph: "⚑",
    blurb: "Quiet diplomacy ends a war or cools a dangerous rivalry.",
    destructive: false,
    fields: [{
      key: "pair", label: "the parties", mapKind: "factionPair",
      options: (w) => statePairs(w)
        .filter(({ rel }) => rel && (rel.war || rel.rivalry > 20))
        .sort((x, y) => (y.rel.war ? 1000 : y.rel.rivalry) - (x.rel.war ? 1000 : x.rel.rivalry))
        .map(({ A, B, rel, key }) => ({ v: key, label: `${A.name} ↔ ${B.name} (${relStatus(rel)})` })),
    }],
    validate(w, p) {
      const pr = pairOf(w, p);
      if (!pr) return "both powers must still stand";
      const rel = w.relations[relKey(pr[0].id, pr[1].id)];
      if (!rel || (!rel.war && rel.rivalry <= 20)) return "there is nothing between them to settle";
      return null;
    },
    preview(w, p) {
      const [A, B] = pairOf(w, p);
      const rel = getRel(w, A.id, B.id);
      if (rel.war) {
        const sieges = w.systems.filter((s) => s.siege && s.siege.pair === relKey(A.id, B.id)).length;
        return [
          `the war (${w.year - rel.war.since} years old) ends in a brokered peace — no victor, no spoils`,
          sieges ? `${sieges} siege${sieges > 1 ? "s are" : " is"} lifted` : `no sieges to lift`,
          `rivalry settles at ${CURATOR.BROKERED_RIVALRY}; any embargo is lifted`,
        ];
      }
      const after = Math.max(0, rel.rivalry - CURATOR.SOOTHE_RIVALRY);
      return [
        `rivalry ${Math.round(rel.rivalry)} → ${Math.round(after)} (war becomes possible above 55)`,
        rel.embargo && after < 35 ? `the embargo between them is lifted` : `trade terms are unchanged`,
      ];
    },
    apply(w, p) {
      const [A, B] = pairOf(w, p);
      const key = relKey(A.id, B.id);
      const rel = getRel(w, A.id, B.id);
      if (rel.war) {
        const rec = w.stats.wars[rel.war.rec];
        const dur = w.year - rel.war.since;
        if (rec) {
          rec.end = w.year; rec.duration = dur;
          rec.winner = "white peace"; rec.endReason = "brokered peace";
        }
        for (const s of w.systems) if (s.siege && s.siege.pair === key) s.siege = null;
        rel.war = null;
        rel.rivalry = CURATOR.BROKERED_RIVALRY;
        rel.embargo = false;
        log(w, "curate", `Envoys nobody sent meet in a neutral hall, and the guns fall silent: the ${A.name} and the ${B.name} sign an unlooked-for peace.`, null, {
          targets: [facRef(A), facRef(B)], cause: "curate.brokered-peace",
          why: "quiet diplomacy from a hand nobody saw",
          effects: [{ k: "war-years", v: dur, u: "yr" }, { k: "rivalry", v: CURATOR.BROKERED_RIVALRY }],
        });
      } else {
        const before = rel.rivalry;
        rel.rivalry = Math.max(0, rel.rivalry - CURATOR.SOOTHE_RIVALRY);
        const soothMeta = {
          targets: [facRef(A), facRef(B)], cause: "curate.soothed",
          why: "quiet diplomacy from a hand nobody saw",
          effects: [{ k: "rivalry", d: -(before - rel.rivalry) }],
        };
        if (rel.embargo && rel.rivalry < 35) {
          rel.embargo = false;
          log(w, "curate", `Old grievances between the ${A.name} and the ${B.name} are quietly paid off; the embargo lifts, and freighters queue at the reopened gates.`, null, soothMeta);
        } else {
          log(w, "curate", `Back-channel envoys soothe the courts of the ${A.name} and the ${B.name}. The frontier watches stand down.`, null, soothMeta);
        }
      }
    },
  },

  {
    key: "sowDiscord",
    label: "Sow discord",
    glyph: "🗡",
    blurb: "Forged dispatches and vanished envoys set two powers against each other.",
    destructive: true,
    fields: [{
      key: "pair", label: "the parties", mapKind: "factionPair",
      options: (w) => statePairs(w)
        .filter(({ rel }) => !rel || !rel.war)
        .map(({ A, B, rel, key }) => ({ v: key, label: `${A.name} ↔ ${B.name} (${relStatus(rel)})` })),
    }],
    validate(w, p) {
      const pr = pairOf(w, p);
      if (!pr) return "both powers must still stand";
      if (pr.some((f) => f.gov === "pirate")) return "corsairs keep no envoys to poison";
      const rel = w.relations[relKey(pr[0].id, pr[1].id)];
      if (rel?.war) return "they are already at war";
      return null;
    },
    preview(w, p) {
      const [A, B] = pairOf(w, p);
      const rel = getRel(w, A.id, B.id);
      const after = clamp(rel.rivalry + CURATOR.DISCORD_RIVALRY, 0, 100);
      const lines = [`rivalry ${Math.round(rel.rivalry)} → ${Math.round(after)}`];
      if (rel.allied) lines.push(`their open-lanes accord collapses`);
      if (!rel.embargo && after > T.EMBARGO_RIVALRY) lines.push(`customs houses shutter — an embargo takes hold`);
      lines.push(after > 55
        ? `war becomes possible: the yearly diplomacy of the powers may ignite it`
        : `not yet enough for war (possible above 55) — but the frontier hardens`);
      return lines;
    },
    apply(w, p) {
      const [A, B] = pairOf(w, p);
      const rel = getRel(w, A.id, B.id);
      const wasAllied = rel.allied;
      rel.allied = false;
      rel.rivalry = clamp(rel.rivalry + CURATOR.DISCORD_RIVALRY, 0, 100);
      if (!rel.embargo && rel.rivalry > T.EMBARGO_RIVALRY) {
        rel.embargo = true;
        w.stats.c.embargo++;
      }
      log(w, "curate",
        wasAllied
          ? `Forged dispatches surface in both courts: the accord between the ${A.name} and the ${B.name} dies in a night of recalled ambassadors.`
          : `Envoys vanish and letters lie: the ${A.name} and the ${B.name} each blame the other, and the frontier bristles.`,
      null, {
        targets: [facRef(A), facRef(B)], cause: "curate.discord",
        why: "forged dispatches and vanished envoys — the curator's dark hand",
        effects: [{ k: "rivalry", v: Math.round(rel.rivalry) }],
      });
    },
  },

  {
    key: "calmUnrest",
    label: "Quiet the streets",
    glyph: "☼",
    blurb: "Grain doles and festival credits take the heat out of a restless world.",
    destructive: false,
    fields: [{
      key: "sysId", label: "target world", mapKind: "system",
      options: (w) => aliveSystems(w).filter((s) => s.unrest > 0.05).map(sysOpt),
    }],
    validate(w, p) {
      const s = sys(w, p.sysId);
      if (!isAlive(s)) return "the target must be a living world";
      if (s.unrest <= 0.05) return "the streets are already quiet";
      return null;
    },
    preview(w, p) {
      const s = sys(w, p.sysId);
      const after = Math.max(0, s.unrest - CURATOR.CALM_UNREST);
      return [
        `unrest ${s.unrest.toFixed(2)} → ${after.toFixed(2)} (riots fire above 0.80)`,
        `consumer goods +${(s.pop * CURATOR.CALM_GOODS_PER_POP).toFixed(0)} — bread and circuses on every shelf`,
        `no riot for at least ${CURATOR.CALM_RIOT_CD} years`,
      ];
    },
    apply(w, p) {
      const s = sys(w, p.sysId);
      s.unrest = clamp(s.unrest - CURATOR.CALM_UNREST, 0, 1);
      s.riotCd = Math.max(s.riotCd, CURATOR.CALM_RIOT_CD);
      s.stock.consumer += s.pop * CURATOR.CALM_GOODS_PER_POP;
      log(w, "curate", `Grain doles and festival credits flood ${s.name} from purses no clerk can trace. The tenements go quiet.`, s.id, {
        targets: [sysRef(s)], cause: "curate.calmed",
        why: "bread and circuses from purses no clerk can trace",
        effects: [{ k: "unrest", d: -CURATOR.CALM_UNREST }, { k: "consumer", d: s.pop * CURATOR.CALM_GOODS_PER_POP }],
      });
    },
  },

  {
    key: "inflameUnrest",
    label: "Inflame the streets",
    glyph: "🔥",
    blurb: "Provocateurs and pamphlets give a world's grievances new voices.",
    destructive: true,
    fields: [{ key: "sysId", label: "target world", mapKind: "system", options: (w) => aliveSystems(w).map(sysOpt) }],
    validate(w, p) {
      const s = sys(w, p.sysId);
      return isAlive(s) ? null : "the target must be a living world";
    },
    preview(w, p) {
      const s = sys(w, p.sysId);
      const after = Math.min(1, s.unrest + CURATOR.INFLAME_UNREST);
      return [
        `unrest ${s.unrest.toFixed(2)} → ${after.toFixed(2)} (riots fire above 0.80; any riot cooldown is cancelled)`,
        after > 0.8 ? `riots are likely within the year` : `short of rioting — but every crisis now cuts deeper`,
        s.fid !== null
          ? `sustained anger corrodes the stability of ${w.factions[s.fid].name} and feeds secession`
          : `a free world with hot streets is one bad harvest from the black flag`,
      ];
    },
    apply(w, p) {
      const s = sys(w, p.sysId);
      s.unrest = clamp(s.unrest + CURATOR.INFLAME_UNREST, 0, 1);
      s.riotCd = 0;
      log(w, "curate", `Pamphlets nobody printed blow through ${s.name}'s tenements, and old grievances find new voices.`, s.id, {
        targets: [sysRef(s)], cause: "curate.inflamed",
        why: "provocateurs and pamphlets — the curator's dark hand",
        effects: [{ k: "unrest", d: CURATOR.INFLAME_UNREST }],
      });
    },
  },

  {
    key: "openGate",
    label: "Open a jumpgate",
    glyph: "◇",
    blurb: "A gate long thought impossible flares open between two nearby stars.",
    destructive: false,
    fields: [
      {
        key: "a", label: "first system", mapKind: "system",
        options: (w) => w.systems.filter((s) => gateableFrom(w, s).length).map(sysOpt),
      },
      {
        key: "b", label: "second system", mapKind: "system",
        options: (w, p) => (sys(w, p.a) ? gateableFrom(w, sys(w, p.a)).map(sysOpt) : []),
      },
    ],
    validate(w, p) {
      const A = sys(w, p.a), B = sys(w, p.b);
      if (!A || !B || A === B) return "pick two different systems";
      if (hasEdge(w, A.id, B.id)) return "a gate already joins them";
      if (dist2(A, B) >= CURATOR.GATE_RANGE) return "the stars are too far apart for a stable gate";
      return null;
    },
    preview(w, p) {
      const A = sys(w, p.a), B = sys(w, p.b);
      return [
        `a new lane joins ${A.name} (${w.adj[A.id].length} gates) and ${B.name} (${w.adj[B.id].length} gates)`,
        `trade, migration, culture — and wars and plagues — can now flow between them`,
        `the lane is permanent unless gate flux (or a curator) collapses it`,
      ];
    },
    apply(w, p) {
      const A = sys(w, p.a), B = sys(w, p.b);
      w.edges.push({ a: A.id, b: B.id, d: dist2(A, B), vol: 0, net: 0 });
      rebuildAdj(w);
      w.stats.c.gateOpen++;
      log(w, "curate", `A jumpgate long thought impossible flares open between ${A.name} and ${B.name}. No engineer claims the work.`, null, {
        targets: [sysRef(A), sysRef(B)], systems: [A.id, B.id],
        cause: "curate.gate-opened", why: "the curator's unseen hand",
      });
    },
  },

  {
    key: "collapseGate",
    label: "Collapse a jumpgate",
    glyph: "◆",
    blurb: "A lane between two stars shudders and dies. Sabotage, the gatekeepers whisper.",
    destructive: true,
    fields: [{
      key: "edge", label: "the lane", mapKind: "edge",
      options: (w) => w.edges.map((e) => ({
        v: `${e.a}|${e.b}`,
        label: `${w.systems[e.a].name} ⇌ ${w.systems[e.b].name}${e.vol > 0.5 ? ` (busy: ${e.vol.toFixed(1)} freight)` : ""}`,
      })),
    }],
    validate(w, p) {
      return edgeIndexOf(w, p.edge) >= 0 ? null : "no such lane";
    },
    preview(w, p) {
      const e = w.edges[edgeIndexOf(w, p.edge)];
      const A = w.systems[e.a], B = w.systems[e.b];
      const lines = [
        `the ${A.name} ⇌ ${B.name} lane dies — its trade (${e.vol.toFixed(1)} freight last year) must reroute or wither`,
      ];
      for (const end of [A, B])
        if (w.adj[end.id].length <= 1)
          lines.push(`⚠ ${end.name} would be left with no gates at all — cut off from the galaxy`);
      lines.push(`the lane is gone unless gate flux (or a curator) reopens one`);
      return lines;
    },
    apply(w, p) {
      const ei = edgeIndexOf(w, p.edge);
      const e = w.edges[ei];
      const A = w.systems[e.a], B = w.systems[e.b];
      w.edges.splice(ei, 1);
      rebuildAdj(w);
      w.stats.c.gateClose++;
      log(w, "curate", `The jumpgate between ${A.name} and ${B.name} shudders and dies. Sabotage, the gatekeepers whisper — but by whom?`, null, {
        targets: [sysRef(A), sysRef(B)], systems: [A.id, B.id],
        cause: "curate.gate-collapsed", why: "sabotage by a hand nobody saw",
        effects: [{ k: "trade-severed", v: +e.vol.toFixed(1) }],
      });
    },
  },

  {
    key: "triggerPlague",
    label: "Loose a plague",
    glyph: "☠",
    blurb: "A strange strain slips through the gates unbidden. Stocked clinics blunt it.",
    destructive: true,
    fields: [{ key: "sysId", label: "target world", mapKind: "system", options: (w) => aliveSystems(w).map(sysOpt) }],
    validate(w, p) {
      const s = sys(w, p.sysId);
      return isAlive(s) ? null : "the target must be a living world";
    },
    preview(w, p) {
      const s = sys(w, p.sysId);
      const surv = plagueSurvival(w, s);
      const after = s.pop * surv;
      const med = medCover(s);
      return [
        `≈${pop1(s.pop - after)} perish (${pop1(s.pop)} → ${pop1(after)}); the poor quarters bury the most`,
        med > 0.5 ? `its clinics are well stocked — the pharmacopoeia is spent holding the line` : `its clinics are bare — the toll runs high`,
        after <= ALIVE ? `⚠ this would kill the world outright — ${s.name} goes dark` : `medicine stocks are spent to the last vial`,
      ];
    },
    apply(w, p) {
      const s = sys(w, p.sysId);
      const before = s.pop;
      s.pop *= plagueSurvival(w, s);
      s.stock.medicine *= 0.2;
      skewDeaths(s, (before - s.pop) / before);
      s.lastPlague = w.year;
      w.stats.c.plague++;
      log(w, "plague", `Plague erupts on ${s.name} — a strange strain, come through the gate unbidden. Quarantine beacons burn for a generation.`, s.id, {
        targets: [sysRef(s)], cause: "plague.curated",
        why: "a strange strain, loosed by a hand nobody saw",
        effects: [{ k: "pop", d: -(before - s.pop), u: "M" }],
      });
    },
  },
];

export const INTERVENTION_BY_KEY = Object.fromEntries(INTERVENTIONS.map((d) => [d.key, d]));

// shared helpers for the defs above
const hasEdge = (w, a, b) => w.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
const gateableFrom = (w, s) =>
  w.systems.filter((o) => o.id !== s.id && !hasEdge(w, s.id, o.id) && dist2(s, o) < CURATOR.GATE_RANGE);
function edgeIndexOf(w, edgeParam) {
  const [a, b] = String(edgeParam ?? "").split("|").map(Number);
  return w.edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}
const medCover = (s) => clamp(s.stock.medicine / (s.pop * 0.25 + 0.01), 0, 1);
// deterministic twin of the shocks.js plague roll: the base toll sits at the
// midpoint of its rng.range(0.4, 0.7), medicine and medical eras blunt it
const plagueSurvival = (w, s) =>
  Math.min(0.97, CURATOR.PLAGUE_SURVIVAL + 0.25 * medCover(s) + techFx(w).med);

/** Is this intervention applicable with these params? null = yes, else why not. */
export function validateIntervention(w, key, params) {
  const def = INTERVENTION_BY_KEY[key];
  if (!def) return `unknown intervention "${key}"`;
  return def.validate(w, params || {});
}

/**
 * Anticipated pressure — what applying (key, params) would push on, as prose
 * lines for the confirmation card. Read-only: never mutates `w`, never touches
 * the rng. Returns { ok, error?, lines? }.
 */
export function previewIntervention(w, key, params) {
  const err = validateIntervention(w, key, params);
  if (err) return { ok: false, error: err };
  return { ok: true, lines: INTERVENTION_BY_KEY[key].preview(w, params) };
}

/**
 * Apply an intervention to the live world. Validates first; on success the
 * world is mutated, a chronicle entry is logged, `w.stats.c.curated` is
 * bumped, and a deterministic command record {i, year, key, params} is
 * appended to `w.commands` (created lazily for pre-curator saves) and
 * returned. Interventions never touch `w.rng` — the world's future changes
 * only because its STATE changed, never because the stream was advanced — so
 * replaying the same save with the same command records at the same years
 * reproduces the same world, byte for byte.
 * Returns { ok, error?, record? }.
 */
export function applyIntervention(w, key, params) {
  const err = validateIntervention(w, key, params);
  if (err) return { ok: false, error: err };
  INTERVENTION_BY_KEY[key].apply(w, params);
  w.stats.c.curated = (w.stats.c.curated || 0) + 1;
  if (!w.commands) w.commands = [];
  const record = { i: w.commands.length + 1, year: w.year, key, params: { ...params } };
  w.commands.push(record);
  return { ok: true, record };
}
