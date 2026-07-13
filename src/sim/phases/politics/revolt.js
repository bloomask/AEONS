import { GOVS, FACTION_SUFFIX_AGGR, FACTION_SUFFIX_CALM } from "../../constants.js";
import { log, facRef } from "../../events.js";

// regime change in place: the power keeps its id and worlds but takes a new
// government, name, and ledger. Shared by internal crises and lost wars.
// `cause` names what forced it ("revolution.crisis" | "revolution.defeat");
// `causeWhy` is the prose reason recorded on the event.
export function revolt(w, rng, f, toGov, why, cause = "revolution.crisis", causeWhy = null) {
  const words = f.name.split(" ");
  words[words.length - 1] = rng.pick(toGov === "republic" ? FACTION_SUFFIX_CALM : FACTION_SUFFIX_AGGR);
  const oldName = f.name;
  const oldGov = f.gov;
  f.gov = toGov;
  f.name = words.join(" ");
  f.tariff = Math.min(0.5, rng.range(...GOVS[toGov].tariff) * (w.cfg?.tariffs ?? 1));
  f.stability = 0.55;
  f.treasury = Math.max(f.treasury, 20); // the new government repudiates the old debts
  w.stats.c.revolution++;
  log(w, "revolution", why(oldName, f.name), f.capital, {
    actors: [facRef(f)], cause, why: causeWhy,
    effects: [{ k: "gov", from: oldGov, to: toGov }],
  });
}
