import { T, GOVS } from "../../constants.js";
import { clamp, cultDist, avgCult } from "../../util.js";
import { log, relKey, getRel } from "../../events.js";
import { majorityFaith } from "../faith.js";
import { warCause } from "../../explain.js";
import { runWarYear } from "./war.js";

// --- diplomacy: rivalry, alliance, embargo, war and peace ---
// Corsairs are outlaws, not states, so they never appear at the table
// (the pirates phase handles them).
export function runDiplomacy(w, rng) {
  const liveFactions = w.factions.filter((f) => !f.dead && f.gov !== "pirate");
  for (let i = 0; i < liveFactions.length; i++) {
    for (let j = i + 1; j < liveFactions.length; j++) {
      const A = liveFactions[i], B = liveFactions[j];
      const gA = GOVS[A.gov] || GOVS.republic, gB = GOVS[B.gov] || GOVS.republic;
      const border = w.edges.filter((e) => {
        const fa = w.systems[e.a].fid, fb = w.systems[e.b].fid;
        return (fa === A.id && fb === B.id) || (fa === B.id && fb === A.id);
      });
      const rel = getRel(w, A.id, B.id);
      if (!border.length) {
        if (rel.war) {
          const rec = w.stats.wars[rel.war.rec];
          if (rec) { rec.end = w.year; rec.duration = w.year - rel.war.since; rec.winner = "none (border lost)"; rec.endReason = "border dissolved"; }
          const k2 = relKey(A.id, B.id);
          for (const s of w.systems) if (s.siege && s.siege.pair === k2) s.siege = null;
          rel.war = null; rel.rivalry = 30;
          log(w, "peace", `The war between the ${A.name} and the ${B.name} peters out — their frontiers no longer touch.`);
        }
        rel.rivalry = Math.max(0, rel.rivalry - 1);
        continue;
      }
      const mutualTrade = border.reduce((a, e) => a + e.vol, 0);
      const mA = w.systems.filter((s) => s.fid === A.id && s.pop > 0);
      const mB = w.systems.filter((s) => s.fid === B.id && s.pop > 0);
      if (!mA.length || !mB.length) continue;
      const cd = cultDist(avgCult(mA), avgCult(mB));
      // shared creeds calm the frontier; rival creeds inflame it
      const holy = majorityFaith(mA) !== majorityFaith(mB);

      if (!rel.war) {
        const aggr = Math.max(A.aggr, B.aggr);
        rel.rivalry = clamp(
          rel.rivalry
            + 0.8 + cd * 1.4 + border.length * 0.2
            // ambition and the era's temper stoke the frontier — THIS is what
            // the aggression knob drives; without it, tension never climbs to war
            + (0.5 + aggr) * w.cfg.aggression * 0.9
            - Math.min(mutualTrade * 0.25, 2.5) // trade cools tempers, but only so far
            + (holy ? 0.5 : -0.3),
          0, 100
        );
        const wasAllied = rel.allied;
        // accords need genuine calm and kinship — an aggressive galaxy rarely finds it
        rel.allied = rel.rivalry < Math.min(gA.allyRivalry, gB.allyRivalry) * w.cfg.diplomacy && cd < 0.25;
        if (rel.allied && !wasAllied) {
          log(w, "accord", `The ${A.name} and the ${B.name} sign open-lanes accords: no duties, no inspections, shared patrols.`);
        }
        if (!rel.embargo && rel.rivalry > T.EMBARGO_RIVALRY && rng.chance(Math.max(A.aggr, B.aggr) * 0.15 * w.cfg.aggression)) {
          rel.embargo = true;
          w.stats.c.embargo++;
          log(w, "embargo", rng.pick([
            `The ${A.name} and the ${B.name} embargo one another. Customs houses shutter along the frontier.`,
            `Trade war: freighters are turned back at every gate between the ${A.name} and the ${B.name}.`,
          ]));
        } else if (rel.embargo && rel.rivalry < 35) {
          rel.embargo = false;
          log(w, "embargo", `The embargo between the ${A.name} and the ${B.name} is lifted. Freighters queue at the reopened gates.`);
        }
        if (
          rel.rivalry > 55 && !rel.allied &&
          rng.chance(aggr * 0.45 * ((gA.warMul + gB.warMul) / 2) * w.cfg.aggression) &&
          (A.treasury > 30 || B.treasury > 30)
        ) {
          rel.war = { since: w.year, score: 0, rec: w.stats.wars.length };
          // record why it ignited — a pure annotation (no rng), so the chronicle
          // and the wars panel can answer "what was this war about?"
          const cause = warCause({ holy, cd, aggr, border: border.length, mutualTrade });
          w.stats.wars.push({
            a: A.name, b: B.name, aId: A.id, bId: B.id, start: w.year,
            end: null, duration: null, winner: null, endReason: null, systemsCeded: 0, battles: 0,
            cause: cause.key, causeText: cause.label,
          });
          w.stats.c.warsDeclared++;
          w.warCount++;
          log(w, "war", rng.pick(holy
            ? [
              `Holy war. The ${A.name} and the ${B.name} take up arms, each certain heaven rides with their fleets.`,
              `The creeds collide: the ${A.name} declares the ${B.name} apostate, and the gates between them fall silent.`,
            ]
            : [
              `The ${A.name} and the ${B.name} go to war. Jumpgates between them fall silent.`,
              `War. ${A.name} warships mass along the ${B.name} frontier, and the trade lanes empty overnight.`,
              `Old grievances boil over: the ${A.name} and the ${B.name} take up arms.`,
            ]));
        }
      } else {
        runWarYear(w, rng, A, B, rel, border);
      }
    }
  }
}
