import { T, GOVS } from "../../constants.js";
import { clamp, dist2, cultDist, avgCult } from "../../util.js";
import { log } from "../../events.js";
import { foundPirateHaven, killFaction } from "../../factions.js";
import { revolt } from "./revolt.js";

// --- the internal life of each power: treasury, stability, revolution,
// secession, collapse, and expansion into free systems ---
export function runInternalPolitics(w, rng) {
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
    // player-chartered powers are governed by hand: they do not autonomously
    // revolt, secede, collapse, or expand (the `player` flag exists only during
    // a game, so a headless simulation is byte-identical)
    const crisis = f.treasury < -40 || f.stability < 0.45;
    if (!f.player && f.gov === "empire" && crisis && rng.chance(0.25 * w.cfg.upheaval)) {
      revolt(w, rng, f, "republic", (oldName, newName) =>
        `Revolution at ${cap.name}: crowds pull down the imperial sigils, and the ${oldName} is proclaimed the ${newName}.`);
    } else if (!f.player && f.gov === "republic" && atWar && (crisis || f.stability < 0.5) && rng.chance(0.25 * w.cfg.upheaval)) {
      revolt(w, rng, f, "empire", (oldName, newName) =>
        `The generals suspend the assembly of the ${oldName}. It wakes as the ${newName}.`);
    }

    // a great trade hub under a heavy-handed crown may simply buy its way out
    if (!f.player && f.gov === "empire" && f.stability < 0.7) {
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
    if (!f.player && f.stability < 0.35) {
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
    if (!f.player && (f.treasury < -80 || f.stability < 0.12)) {
      killFaction(w, f, "collapses under its own weight; its worlds scatter into independence",
        f.treasury < -80 ? "bankruptcy" : "unrest");
      continue;
    }

    // absorbing free systems: each form of power does it its own way
    if (!f.player && f.gov !== "pirate" && f.treasury > 50 && rng.chance((f.expans * 0.4 * (gov.expandMul || 1) + (f.gov === "corporate" ? 0.15 : 0)) * w.cfg.expansion)) {
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
}
