import { T, GOVS, FACTION_SUFFIX_AGGR, FACTION_SUFFIX_CALM } from "../constants.js";
import { clamp, dist2, cultDist, avgCult } from "../util.js";
import { log, fx, relKey, getRel } from "../events.js";
import { foundFaction, foundPirateHaven, relocateCapital, killFaction } from "../factions.js";
import { majorityFaith } from "./faith.js";

function revolt(w, rng, f, toGov, why) {
  const words = f.name.split(" ");
  words[words.length - 1] = rng.pick(toGov === "republic" ? FACTION_SUFFIX_CALM : FACTION_SUFFIX_AGGR);
  const oldName = f.name;
  f.gov = toGov;
  f.name = words.join(" ");
  f.tariff = Math.min(0.5, rng.range(...GOVS[toGov].tariff) * (w.cfg?.tariffs ?? 1));
  f.stability = 0.55;
  f.treasury = Math.max(f.treasury, 20); // the new government repudiates the old debts
  w.stats.c.revolution++;
  log(w, "revolution", why(oldName, f.name), f.capital);
}

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

    const gov = GOVS[f.gov] || GOVS.republic;
    // how a power pays for itself depends on what it is: empires and
    // republics tax heads and wealth, charters skim trade throughput,
    // corsairs live on loot (added by the pirates phase)
    let income;
    if (f.gov === "corporate") {
      const corp = f.corpId != null ? w.houses[f.corpId] : null;
      income = members.reduce((a, s) => a + s.tradeIn * 0.06 + s.pop * 0.02, 0)
        + (corp && !corp.dead ? 3 : 0);
    } else {
      // the taxable base tops out — past a point the rich hide the rest —
      // so a long war or a bloated realm can genuinely run out of money
      income = members.reduce(
        (a, s) => a + Math.min(Math.max(0, s.wealth), 300) * T.TAX_RATE + s.pop * T.TAX_PER_POP, 0
      ) * gov.taxMul;
    }
    const avgDist = members.reduce((a, s) => a + dist2(s, cap), 0) / members.length;
    const admin = f.gov === "pirate"
      ? members.length * 0.4
      : T.ADMIN_BASE * Math.pow(members.length, T.ADMIN_EXP) * (1 + avgDist / 300);
    const atWar = Object.entries(w.relations).some(
      ([k, r]) => r.war && k.split("|").map(Number).includes(f.id)
    );
    f.treasury += income - admin - (atWar ? gov.warCost : 0);
    // stability tracks the treasury AND how citizens actually live —
    // but how much the rulers care depends on the form of power
    const avgWbM = members.reduce((a, s) => a + s.wb, 0) / members.length;
    const avgUnrest = members.reduce((a, s) => a + (s.unrest || 0), 0) / members.length;
    if (f.gov !== "pirate") {
      f.stability = clamp(
        f.stability + (f.treasury > 0 ? 0.04 : -0.08) + (atWar ? gov.warStab : 0.01)
          - members.length * 0.003 + (avgWbM - 0.58) * gov.wbStab
          - avgUnrest * 0.05, // class anger corrodes every form of power
        0, 1
      );
    }

    // revolutions from internal crisis: broke or crumbling empires birth
    // republics; desperate wartime republics fall to the generals
    const crisis = f.treasury < -40 || f.stability < 0.45;
    if (f.gov === "empire" && crisis && rng.chance(0.25 * w.cfg.upheaval)) {
      revolt(w, rng, f, "republic", (oldName, newName) =>
        `Revolution at ${cap.name}: crowds pull down the imperial sigils, and the ${oldName} is proclaimed the ${newName}.`);
    } else if (f.gov === "republic" && atWar && (crisis || f.stability < 0.5) && rng.chance(0.25 * w.cfg.upheaval)) {
      revolt(w, rng, f, "empire", (oldName, newName) =>
        `The generals suspend the assembly of the ${oldName}. It wakes as the ${newName}.`);
    }

    // a great trade hub under a heavy-handed crown may simply buy its way out
    if (f.gov === "empire" && f.stability < 0.7) {
      const hub = members.find((s) =>
        s.id !== f.capital && s.tradeIn > 20 && s.wealth > 200 && !s.freePort);
      if (hub && rng.chance(0.02)) {
        hub.fid = null;
        hub.freePort = true;
        hub.wealth -= 80;
        f.treasury += 60;
        w.stats.c.freePorts++;
        log(w, "found", `${hub.name} buys its charter from the ${f.name} outright. The Free Port of ${hub.name} opens its docks to all flags.`, hub.id);
      }
    }

    // war effort consumes member stockpiles — famine as a weapon of attrition
    if (atWar) {
      for (const s of members) {
        s.stock.fuel *= 0.92; s.stock.consumer *= 0.92; s.stock.metals *= 0.94;
      }
    }

    // secession of the resentful fringe — and the truly desperate
    // don't declare a republic, they raise the black flag
    if (f.stability < 0.35) {
      const fCult = avgCult(members);
      for (const s of members) {
        if (s.id === f.capital) continue;
        if (rng.chance((0.04 + cultDist(s.cult, fCult) * 0.1 + (s.unrest || 0) * 0.04) * w.cfg.upheaval)) {
          s.fid = null;
          w.stats.c.secede++;
          log(w, "secede", `${s.name} declares independence from the ${f.name}.`, s.id);
          if (s.wealth > 50) {
            s.freePort = true;
            w.stats.c.freePorts++;
            log(w, "found", `${s.name} charters itself a Free Port. The customs men are put on the first ship out.`, s.id);
          } else if (s.wb < 0.55 && rng.chance(0.3)) foundPirateHaven(w, rng, s);
        }
      }
    }

    // total collapse
    if (f.treasury < -80 || f.stability < 0.12) {
      killFaction(w, f, "collapses under its own weight; its worlds scatter into independence",
        f.treasury < -80 ? "bankruptcy" : "unrest");
      continue;
    }

    // absorbing free systems: each form of power does it its own way
    if (f.gov !== "pirate" && f.treasury > 50 && rng.chance((f.expans * 0.4 * (gov.expandMul || 1) + (f.gov === "corporate" ? 0.15 : 0)) * w.cfg.expansion)) {
      const fCult = avgCult(members);
      const cands = [];
      for (const s of members)
        for (const { to } of w.adj[s.id]) {
          const o = w.systems[to];
          if (o.pop > 0.05 && o.fid === null) cands.push(o);
        }
      if (f.gov === "corporate") {
        // charters are bought, not taken — and only worth buying at a port.
        // But the last free ports are untouchable: everyone, corporations
        // included, needs somewhere neutral to trade.
        const portCount = w.systems.filter((s) => s.freePort && s.pop > 0.05).length;
        const tgt = cands.filter((o) =>
          (o.tradeIn > 2 || o.wealth > 25) && (!o.freePort || portCount > 2))
          .sort((a, b) => b.tradeIn - a.tradeIn)[0];
        const cost = tgt ? 25 + tgt.wealth * 0.2 + (tgt.freePort ? 120 : 0) : 0;
        if (tgt && f.treasury > cost + 30) {
          f.treasury -= cost;
          tgt.fid = f.id;
          tgt.freePort = false; // bought out, charter and all
          w.stats.c.annex++;
          log(w, "annex", `The ${f.name} purchases the charter of ${tgt.name}. The customs houses reopen under a company seal.`, tgt.id);
        }
      } else {
        // true free ports are beyond any state's reach: too connected,
        // too useful to everyone — only a corporation can buy one
        const takeable = cands.filter((o) => !o.freePort && o.tradeIn <= 10 && o.wealth <= 80);
        takeable.sort((a, b) => cultDist(a.cult, fCult) - cultDist(b.cult, fCult));
        const tgt = takeable[0];
        const cd = tgt ? cultDist(tgt.cult, fCult) : 1;
        // mid-tier free systems still buy off annexation when they can
        const resisted = tgt && tgt.wealth > 45 && rng.chance(f.gov === "empire" ? 0.55 : 0.75);
        // republics only welcome kin; empires take what borders them
        if (tgt && !resisted && (f.gov === "empire" || cd < 0.35)) {
          f.treasury -= (20 + cd * 30) * (f.gov === "empire" ? 0.85 : 1);
          tgt.fid = f.id;
          w.stats.c.annex++;
          log(w, "annex",
            f.gov === "republic" || cd < 0.25
              ? `${tgt.name} joins the ${f.name} by accord.`
              : `The ${f.name} subjugates ${tgt.name}.`,
            tgt.id);
        }
      }
    }
  }

  // diplomacy: rivalry, alliance, war — corsairs are outlaws, not states,
  // so they never appear at the table (the pirates phase handles them)
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
      // shared creeds calm the frontier; rival creeds inflame it
      const holy = majorityFaith(mA) !== majorityFaith(mB);

      if (!rel.war) {
        rel.rivalry = clamp(
          rel.rivalry + 0.8 + cd * 1.4 + border.length * 0.2 - mutualTrade * 0.25
            + (holy ? 0.35 : -0.35),
          0, 100
        );
        const wasAllied = rel.allied;
        rel.allied = rel.rivalry < Math.min(gA.allyRivalry, gB.allyRivalry) * w.cfg.diplomacy && cd < 0.3;
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
          rel.rivalry > 60 && !rel.allied &&
          rng.chance(Math.max(A.aggr, B.aggr) * 0.35 * ((gA.warMul + gB.warMul) / 2) * w.cfg.aggression) &&
          (A.treasury > 40 || B.treasury > 40)
        ) {
          rel.war = { since: w.year, score: 0, rec: w.stats.wars.length };
          w.stats.wars.push({
            a: A.name, b: B.name, start: w.year,
            end: null, duration: null, winner: null, systemsCeded: 0, battles: 0,
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
          fx(w, { t: "battle", a: e.a, b: e.b });
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
    }
  }

  // new powers rise from prosperous independents — though true trade
  // hubs prefer no flag at all
  for (const s of alive) {
    if (s.fid === null && !s.freePort && s.pop > 8 && s.wealth > 30 && s.tradeIn <= 10 && rng.chance(0.03)) {
      const f = foundFaction(w, rng, s, false);
      for (const { to } of w.adj[s.id]) {
        const o = w.systems[to];
        // kin join the new power — but free ports keep their own flag
        if (o.pop > 0.05 && o.fid === null && !o.freePort && o.tradeIn <= 10 && cultDist(o.cult, s.cult) < 0.3) o.fid = f.id;
      }
    }
  }
}
