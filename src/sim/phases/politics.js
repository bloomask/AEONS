import { T } from "../constants.js";
import { clamp, dist2, cultDist, avgCult } from "../util.js";
import { log, relKey, getRel } from "../events.js";
import { foundFaction, relocateCapital, killFaction } from "../factions.js";

// --- faction economics & politics, diplomacy & war, new powers ---
export function runPolitics(w, rng, alive) {
  // faction economics & politics
  for (const f of w.factions) {
    if (f.dead) continue;
    const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
    if (members.length === 0) { killFaction(w, f, "fades from the star charts, its last worlds gone silent", "extinction"); continue; }
    const cap = w.systems[f.capital];
    f.peakSystems = Math.max(f.peakSystems, members.length);
    f.peakPop = Math.max(f.peakPop, members.reduce((a, s) => a + s.pop, 0));
    if (members.length > w.records.largestRealm) {
      w.records.largestRealm = members.length;
      log(w, "era", `The ${f.name} now rules ${members.length} systems — the greatest realm the galaxy has yet known.`);
    }

    const income = members.reduce(
      (a, s) => a + Math.max(0, s.wealth) * T.TAX_RATE + s.pop * T.TAX_PER_POP, 0);
    const avgDist = members.reduce((a, s) => a + dist2(s, cap), 0) / members.length;
    const admin = T.ADMIN_BASE * Math.pow(members.length, T.ADMIN_EXP) * (1 + avgDist / 300);
    const atWar = Object.entries(w.relations).some(
      ([k, r]) => r.war && k.split("|").map(Number).includes(f.id)
    );
    f.treasury += income - admin - (atWar ? 14 : 0);
    // stability tracks the treasury AND how citizens actually live:
    // famine breeds unrest; large empires strain cohesion
    const avgWbM = members.reduce((a, s) => a + s.wb, 0) / members.length;
    f.stability = clamp(
      f.stability + (f.treasury > 0 ? 0.04 : -0.08) + (atWar ? -0.03 : 0.01)
        - members.length * 0.003 + (avgWbM - 0.58) * 0.25,
      0, 1
    );

    // war effort consumes member stockpiles — famine as a weapon of attrition
    if (atWar) {
      for (const s of members) {
        s.stock.fuel *= 0.92; s.stock.goods *= 0.92;
      }
    }

    // secession of the resentful fringe
    if (f.stability < 0.35) {
      const fCult = avgCult(members);
      for (const s of members) {
        if (s.id === f.capital) continue;
        if (rng.chance(0.04 + cultDist(s.cult, fCult) * 0.1)) {
          s.fid = null;
          w.stats.c.secede++;
          log(w, "secede", `${s.name} declares independence from the ${f.name}.`, s.id);
        }
      }
    }

    // total collapse
    if (f.treasury < -80 || f.stability < 0.12) {
      killFaction(w, f, "collapses under its own weight; its worlds scatter into independence",
        f.treasury < -80 ? "bankruptcy" : "unrest");
      continue;
    }

    // peaceful/forceful annexation of independents
    if (f.treasury > 50 && rng.chance(f.expans * 0.4)) {
      const fCult = avgCult(members);
      const cands = [];
      for (const s of members)
        for (const { to } of w.adj[s.id]) {
          const o = w.systems[to];
          if (o.pop > 0.05 && o.fid === null) cands.push(o);
        }
      if (cands.length) {
        cands.sort((a, b) => cultDist(a.cult, fCult) - cultDist(b.cult, fCult));
        const tgt = cands[0];
        const cd = cultDist(tgt.cult, fCult);
        f.treasury -= 20 + cd * 30;
        tgt.fid = f.id;
        w.stats.c.annex++;
        log(w, "annex",
          cd < 0.25
            ? `${tgt.name} joins the ${f.name} by accord.`
            : `The ${f.name} subjugates ${tgt.name}.`,
          tgt.id);
      }
    }
  }

  // diplomacy: rivalry, alliance, war
  const liveFactions = w.factions.filter((f) => !f.dead);
  for (let i = 0; i < liveFactions.length; i++) {
    for (let j = i + 1; j < liveFactions.length; j++) {
      const A = liveFactions[i], B = liveFactions[j];
      const border = w.edges.filter((e) => {
        const fa = w.systems[e.a].fid, fb = w.systems[e.b].fid;
        return (fa === A.id && fb === B.id) || (fa === B.id && fb === A.id);
      });
      const rel = getRel(w, A.id, B.id);
      if (!border.length) {
        if (rel.war) {
          const rec = w.stats.wars[rel.war.rec];
          if (rec) { rec.end = w.year; rec.duration = w.year - rel.war.since; rec.winner = "none (border lost)"; }
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

      if (!rel.war) {
        rel.rivalry = clamp(
          rel.rivalry + 0.8 + cd * 1.4 + border.length * 0.2 - mutualTrade * 0.25,
          0, 100
        );
        const wasAllied = rel.allied;
        rel.allied = rel.rivalry < 12 && cd < 0.3;
        if (rel.allied && !wasAllied) {
          log(w, "accord", `The ${A.name} and the ${B.name} sign open-lanes accords: no duties, no inspections, shared patrols.`);
        }
        if (!rel.embargo && rel.rivalry > T.EMBARGO_RIVALRY && rng.chance(Math.max(A.aggr, B.aggr) * 0.15)) {
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
          rel.rivalry > 60 && !rel.allied &&
          rng.chance(Math.max(A.aggr, B.aggr) * 0.35) &&
          (A.treasury > 40 || B.treasury > 40)
        ) {
          rel.war = { since: w.year, score: 0, rec: w.stats.wars.length };
          w.stats.wars.push({
            a: A.name, b: B.name, start: w.year,
            end: null, duration: null, winner: null, systemsCeded: 0, battles: 0,
          });
          w.stats.c.warsDeclared++;
          w.warCount++;
          log(w, "war", rng.pick([
            `The ${A.name} and the ${B.name} go to war. Jumpgates between them fall silent.`,
            `War. ${A.name} warships mass along the ${B.name} frontier, and the trade lanes empty overnight.`,
            `Old grievances boil over: the ${A.name} and the ${B.name} take up arms.`,
          ]));
        }
      } else {
        // --- war as geography: battles at gates, sieges, fronts that move ---
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
            if (s.fid === f.id && s.pop > 0.05) str += s.pop * s.dev;
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
          sa.pop *= 0.985; sb.pop *= 0.985;
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
          rel.war = null; rel.rivalry = 25;
        }
      }
    }
  }

  // new powers rise from prosperous independents
  for (const s of alive) {
    if (s.fid === null && s.pop > 8 && s.wealth > 30 && rng.chance(0.03)) {
      const f = foundFaction(w, rng, s, false);
      for (const { to } of w.adj[s.id]) {
        const o = w.systems[to];
        if (o.pop > 0.05 && o.fid === null && cultDist(o.cult, s.cult) < 0.3) o.fid = f.id;
      }
    }
  }
}
