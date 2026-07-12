import { clamp } from "../../util.js";
import { T, allowsSlaves } from "../../constants.js";
import { log, fx, relKey } from "../../events.js";
import { relocateCapital } from "../../factions.js";
import { addWorkers } from "../../society.js";
import { revolt } from "./revolt.js";

// a world fights at a fraction of its weight when its armories are bare —
// full strength needs weapons stocked to ARMS_PER_POP of its population
function armsReadiness(s) {
  const r = clamp(s.stock.weapons / (s.pop * T.ARMS_PER_POP + 0.01), 0, 1);
  return T.ARMS_FLOOR + (1 - T.ARMS_FLOOR) * r;
}

// --- war as geography: battles at gates, sieges, fronts that move ---
// Runs one year of an active war between A and B. `border` is the list of
// contested edges (recomputed by diplomacy each year).
export function runWarYear(w, rng, A, B, rel, border) {
  const dur = w.year - rel.war.since;
  const key = relKey(A.id, B.id);
  const rec = w.stats.wars[rel.war.rec];
  const localStrength = (f, e) => {
    const near = new Set([e.a, e.b]);
    for (const { to } of w.adj[e.a]) near.add(to);
    for (const { to } of w.adj[e.b]) near.add(to);
    let str = 0;
    for (const id of near) {
      const s = w.systems[id];
      if (s.fid === f.id && s.pop > 0.05) str += s.pop * s.dev * armsReadiness(s);
    }
    return str * 0.7 + Math.max(0, f.treasury) * 0.05;
  };

  // 1-2 battles a year at contested gates
  const nBattles = Math.min(border.length, 1 + (rng.chance(0.4) ? 1 : 0));
  const pool = [...border];
  for (let bi = 0; bi < nBattles; bi++) {
    const e = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    const sa = w.systems[e.a], sb = w.systems[e.b];
    const rollA = localStrength(A, e) * rng.range(0.7, 1.3);
    const rollB = localStrength(B, e) * rng.range(0.7, 1.3);
    const winF = rollA > rollB ? A : B;
    const loseF = winF === A ? B : A;
    rel.war.score += winF === A ? 1 : -1;
    w.stats.c.battle++;
    if (rec) rec.battles++;
    fx(w, { t: "battle", a: e.a, b: e.b });
    sa.pop *= 0.985; sb.pop *= 0.985;
    sa.stock.weapons *= 1 - T.ARMS_BATTLE_USE; // munitions spent at the front
    sb.stock.weapons *= 1 - T.ARMS_BATTLE_USE;
    sa.lastWar = w.year; sb.lastWar = w.year;
    const gate = `${sa.name}–${sb.name}`;
    const winSys = sa.fid === winF.id ? sa : sb;
    const lostSys = winSys === sa ? sb : sa;
    if (winSys.siege && winSys.siege.by === loseF.id) {
      // the besieged side won the gate: siege broken
      winSys.siege = null;
      w.stats.c.siegeLift++;
      log(w, "siege", `The siege of ${winSys.name} is broken at the ${gate} gate. Relief convoys pour in.`, winSys.id);
    } else if (!lostSys.siege && lostSys.fid === loseF.id) {
      lostSys.siege = { by: winF.id, since: w.year, pair: key };
      fx(w, { t: "siege", sys: lostSys.id });
      log(w, "siege", rng.pick([
        `${winF.name} forces win the ${gate} gate and lay siege to ${lostSys.name}. Nothing flies in or out.`,
        `Victory at ${gate}: the ${winF.name} throws a blockade around ${lostSys.name}.`,
      ]), lostSys.id);
    } else {
      log(w, "battle", rng.pick([
        `Battle at the ${gate} gate: ${winF.name} forces rout the ${loseF.name}.`,
        `The fleets of the ${winF.name} scatter the ${loseF.name} line at ${gate}.`,
        `A bloody stalemate at ${gate} breaks in the ${winF.name}'s favor.`,
      ]));
    }
  }

  // sieges tighten: starvation is the weapon (economy does the killing)
  let capitalSacked = false;
  for (const s of w.systems) {
    if (!s.siege || s.siege.pair !== key || s.pop <= 0.05) continue;
    s.pop *= 0.97; s.lastWar = w.year;
    const siegeDur = w.year - s.siege.since;
    if ((siegeDur >= 2 && s.wb < 0.45) || siegeDur >= 4) {
      const taker = w.factions[s.siege.by];
      const loserF = taker.id === A.id ? B : A;
      const wasCapital = loserF.capital === s.id;
      s.fid = taker.id; s.siege = null;
      for (const k of ["gran", "gate", "mine"])
        if (s.infra[k] > 0 && rng.chance(0.5)) s.infra[k]--;
      // the spoils of conquest cut both ways: a slaver binds a share of the
      // conquered into chains; an abolitionist victor strikes them off
      if (allowsSlaves(taker.gov, false) && s.pop > 1 && rng.chance(0.5)) {
        const taken = s.pop * rng.range(0.05, 0.15);
        s.pop -= taken; s.slaves += taken;
        w.stats.c.enslaved++;
        log(w, "slave", `${taken.toFixed(1)}M of ${s.name} are dragged into bondage as the ${taker.name} sacks the world.`, s.id);
      } else if (!allowsSlaves(taker.gov, false) && s.slaves > 0.1) {
        const freed = s.slaves; s.slaves = 0;
        addWorkers(s, freed);
        w.stats.c.slavesFreed++;
        log(w, "slave", `The ${taker.name} strike the chains from ${freed.toFixed(1)}M at ${s.name}; the freed swell the workers' ranks.`, s.id);
      }
      rel.war.score += taker.id === A.id ? 2 : -2;
      w.stats.c.siegeFall++; w.stats.c.cede++;
      if (rec) rec.systemsCeded++;
      log(w, "capture", wasCapital
        ? `${s.name} FALLS. The ${loserF.name}'s own capital is sacked after a ${siegeDur}-year siege.`
        : `${s.name} falls to the ${taker.name} after ${siegeDur} years under blockade.`, s.id);
      if (wasCapital) {
        loserF.stability = clamp(loserF.stability - 0.3, 0, 1);
        relocateCapital(w, loserF);
        capitalSacked = true;
      }
    }
  }

  // peace: exhaustion, decisive score, capital sack, or sheer length
  const exhausted = A.treasury < 0 || B.treasury < 0;
  if (capitalSacked || (dur > 3 && Math.abs(rel.war.score) > 4) || exhausted || dur > 15) {
    const winner = rel.war.score > 0 ? A : rel.war.score < 0 ? B : (exhausted ? null : A);
    for (const s of w.systems)
      if (s.siege && s.siege.pair === key) s.siege = null;
    if (rec) {
      rec.end = w.year; rec.duration = dur;
      rec.winner = winner ? winner.name : "white peace";
    }
    const taken = rec ? rec.systemsCeded : 0;
    if (winner && taken > 0) {
      log(w, "peace", `The Treaty of ${w.systems[winner.capital].name} ends ${dur} years of war. ${taken} system${taken > 1 ? "s" : ""} remain${taken > 1 ? "" : "s"} in ${winner.name} hands.`);
    } else if (winner) {
      log(w, "peace", `Peace between the ${A.name} and the ${B.name} after ${dur} years. The ${winner.name} claims victory, though the borders barely moved.`);
    } else {
      log(w, "peace", `Exhausted and bankrupt, the ${A.name} and the ${B.name} lay down arms after ${dur} years. Nobody calls it victory.`);
    }
    if (dur > w.records.longestWar && dur >= 8) {
      w.records.longestWar = dur;
      log(w, "era", `${dur} years of war between the ${A.name} and the ${B.name} — the longest anyone living can remember.`);
    }
    // defeat is the great regime-changer
    if (winner && taken > 0) {
      const loser = winner === A ? B : A;
      if (loser.gov === "empire" && rng.chance(0.4 * w.cfg.upheaval)) {
        revolt(w, rng, loser, "republic", (oldName, newName) =>
          `The defeat breaks the dynasty: the ${oldName} is swept away, and the ${newName} rises from the wreckage.`);
      } else if (loser.gov === "republic" && rng.chance(0.25 * w.cfg.upheaval)) {
        revolt(w, rng, loser, "empire", (oldName, newName) =>
          `Humiliated, the assembly of the ${oldName} hands power to a strongman. It wakes as the ${newName}.`);
      }
    }
    rel.war = null; rel.rivalry = 25;
  }
}
