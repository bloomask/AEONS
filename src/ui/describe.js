import { GOODS, GOOD_LABEL, GOVS } from "../sim/constants.js";
import { fmtPop } from "./format.js";

// ---------- the gazetteer: a wiki-style lede for any system ----------
// Everything here is read straight off the world state, but the prose is
// deliberately broad and slow: facts are bucketed coarsely, and a system's
// paragraph is regenerated at most once a decade — a chronicler's summary,
// not a ticker. Structural changes (a new flag, a siege, going dark) force
// an immediate rewrite. Phrasing variants are picked by a hash of the
// system's identity, so each world keeps a stable voice.

function hashOf(s) {
  let h = s.id + 1;
  for (let i = 0; i < s.name.length; i++) h = (Math.imul(h, 31) + s.name.charCodeAt(i)) | 0;
  return h >>> 0;
}

const CAUSE_TEXT = {
  famine: "starved out when the grain failed",
  plague: "emptied by plague",
  "war attrition": "ground to dust by war",
  "resource depletion": "abandoned when the mines gave out",
  "economic decline": "slowly forgotten by the trade lanes",
};

function sizeClause(pop) {
  if (pop < 1) return "fewer than a million souls";
  if (pop < 10) return "several million souls";
  if (pop < 60) return "tens of millions";
  if (pop < 300) return "well over a hundred million";
  return "hundreds of millions";
}

export function describeSystem(w, s) {
  // the slow-refresh cache: same fate, same flag, same siege → keep the
  // text for up to a decade before restating it
  const fate = s.ruined ? "ruin" : s.pop <= 0.05 ? "empty" : "live";
  const key = `${fate}|${s.fid}|${s.freePort ? 1 : 0}|${s.siege ? 1 : 0}|${(s.mega.nexus ? 1 : 0) + (s.mega.arcology ? 2 : 0) + (s.mega.terraformed ? 4 : 0)}`;
  if (s._lede && s._lede.key === key && w.year - s._lede.year < 10) return s._lede.text;
  const text = compose(w, s);
  s._lede = { year: w.year, key, text };
  return text;
}

function compose(w, s) {
  const h = hashOf(s);
  const p = (salt, arr) => arr[((h ^ Math.imul(salt + 1, 2654435761)) >>> 0) % arr.length];
  const mineLeft = s.minRes / s.minRes0;

  // natural character, from (nearly) permanent endowments
  const traits = [];
  if (s.fert > 0.6) traits.push(p(1, ["broad grain belts", "rich farmland", "fertile lowlands"]));
  if (s.min > 0.55 && mineLeft > 0.25) traits.push(p(2, ["deep ore veins", "a mineral-heavy crust", "rich metal lodes"]));
  if (s.rare > 0.5) traits.push(p(3, ["rare-earth seams coveted across the lanes", "veins of precious rare earths"]));
  if (s.en > 0.7) traits.push(p(4, ["abundant energy fields", "easily tapped fuel reserves"]));
  const barren = s.fert < 0.2 && s.hab < 0.3;

  if (s.ruined) {
    const d = [...w.stats.deaths].reverse().find((x) => x.system === s.name);
    const cause = d ? CAUSE_TEXT[d.cause] : "gone to silence";
    const peak = d ? d.peakPop : s.peakPop;
    let t = `${s.name} has been dark since ${s.diedYear}, ${cause}. `
      + `At its height it was home to ${fmtPop(peak)}`;
    t += d && d.age !== null
      ? ` and had stood for ${d.age} years. `
      : `, one of the first worlds ever settled. `;
    t += traits.length
      ? `${p(5, ["Prospectors' charts still mark", "Salvage crews still whisper of", "Bolder settlers may yet return for"])} ${traits[0]} beneath the ruins.`
      : p(6, [
        "Only the beacons of its dead ports still answer, on frequencies nobody keeps.",
        "Its towers stand empty; the lanes route around them.",
      ]);
    return t;
  }

  if (s.pop <= 0.05) {
    if (barren && !traits.length)
      return `${s.name} is an unclaimed system, ${p(7, [
        "little but rock and hard radiation",
        "a sunless waste no charter has ever priced",
        "passed over by every wave of settlement",
      ])}. No colony ship has yet thought it worth the fuel.`;
    return `${s.name} is an unclaimed system${s.hab > 0.5 ? " with a temperate, habitable world" : ""}. `
      + (traits.length
        ? `Surveys record ${traits.slice(0, 2).join(" and ")}, awaiting a founder's flag.`
        : `Surveys record nothing remarkable; it waits all the same.`);
  }

  // --- a living world ---
  const f = s.fid !== null ? w.factions[s.fid] : null;

  // character comes from endowments and long-run development, never from
  // this year's traffic
  const character = s.dev > 1.25
    ? p(9, ["an industrial world", "a forge world of stacks and shipyards", "a heavily industrialized world"])
    : s.fert > 0.6
      ? p(10, ["an agrarian world", "a breadbasket world", "a farming world"])
      : s.min > 0.55
        ? p(11, ["a mining world", "a pit-and-smelter world"])
        : barren
          ? p(12, ["a hardscrabble world", "a marginal world on a thin ledger"])
          : p(13, ["a quiet world", "an unhurried backwater", "a modest world"]);

  const age = s.settledYear === null || s.settledYear <= 0
    ? p(14, ["settled in the first age of expansion", "counted among the galaxy's founding worlds"])
    : `settled in ${s.settledYear}`;

  const polity = s.freePort
    ? "chartered as a Free Port, owing duties to no flag"
    : f
      ? f.capital === s.id
        ? `capital of the ${f.name}`
        : `held by the ${f.name}${GOVS[f.gov] ? ` (${GOVS[f.gov].label.toLowerCase()})` : ""}`
      : "independent, flying no flag";

  let t = `${s.name} is ${character} of the ${s.cultName} culture, ${age} and today ${polity}. `;

  // economy: name only the single defining export, if there clearly is one
  const topExp = GOODS.filter((g) => s.flow[g] < -0.5).sort((a, b) => s.flow[a] - s.flow[b])[0];
  if (topExp) t += `On the lanes it is known chiefly for its ${GOOD_LABEL[topExp]}`;
  else t += p(15, ["Its economy is largely its own affair", "The great lanes mostly pass it by"]);
  if (s.min > 0.4 && mineLeft < 0.25) t += `, though its great mines are nearly played out`;
  t += ". ";

  // society, in strokes broad enough to hold for a generation
  const popPhrase = s.pop < s.peakPop * 0.5 && s.peakPop > 1
    ? `Home to ${sizeClause(s.pop)} — a fraction of what it once held — `
    : `Home to ${sizeClause(s.pop)}, `;
  const social = s.classes.elite >= 0.045
    ? p(16, ["it is ruled in practice by a gilded elite", "its towers belong to a narrow, gilded elite"])
    : s.classes.middle > 0.42
      ? p(17, ["it carries a broad, comfortable middle class", "it is anchored by a wide middle class"])
      : s.classes.worker > 0.55
        ? p(18, ["it is a laboring world of dock crews and field hands", "its people are overwhelmingly working folk"])
        : "its classes sit in rough balance";
  const mood = s.unrest > 0.55
    ? p(19, ["; its lower quarters have a long habit of unrest", "; order there is kept, not given"])
    : s.wb > 0.72
      ? p(20, [", and the years have been kind", ", in one of its better ages"])
      : "";
  t += popPhrase + social + mood + ". ";

  // one notable, in rough order of narrative weight
  if (s.siege) t += `It has been under siege by the ${w.factions[s.siege.by].name} since ${s.siege.since}.`;
  else if (s.mega.nexus) t += `Its Gate Nexus makes it a fixed star of galactic freight.`;
  else if (s.mega.arcology) t += `The ring-cities of its Orbital Arcology carry millions above the old world.`;
  else if (s.mega.terraformed) t += `Terraforming mirrors turned its rock green within living memory.`;
  else if (w.year - s.lastPlague <= 15) t += `It is still recovering from the plague of ${s.lastPlague}.`;
  else if (w.year - s.lastFamine <= 15) t += `The hunger years of ${s.lastFamine} are a fresh memory.`;
  else if (w.year - s.lastWar <= 10) t += `The scars of the last war have not yet healed.`;

  return t.trim();
}
