import { T, BASE_PRICE, allowsDrugs, allowsSlaves } from "../constants.js";
import { clamp } from "../util.js";
import { log, facRef, sysRef } from "../events.js";
import { addWorkers } from "../society.js";

// --- the underworld: narcotics and the slave trade ---
// Neither good rides the ordinary lanes. Narcotics are refined only where
// the trade is tolerated and smuggled to markets that ban them; slaves are
// a population/commodity hybrid — bound where the law allows it, freed where
// it does not. Legality follows the flag (constants: GOV_CONTRABAND); free
// worlds decide by their own `outlaw` streak. Runs after piracy so havens,
// conquests, and this year's fortunes are already settled.
const govOf = (w, s) => (s.fid !== null ? w.factions[s.fid].gov : null);

export function runContraband(w, rng, alive) {
  const cb = w.cfg.contraband ?? 1;

  // --- narcotics: refining, the black-market run, and its toll ---
  for (const s of alive) {
    s.drugLoad = Math.max(0, (s.drugLoad || 0) * 0.9); // the addicted underclass thins when the supply dries
    if (allowsDrugs(govOf(w, s), s.outlaw) && s.stock.grain > 1) {
      const made = Math.min(s.pop * s.dev * T.DRUG_YIELD * cb, s.stock.grain * 0.15);
      s.stock.grain -= made * 0.6; // narcotics eat into the food crop
      s.drugs = (s.drugs || 0) + made;
    }
    // price rises with local appetite, falls where the stuff is piled high
    s.price.drugs = BASE_PRICE.drugs * clamp((s.pop * 0.4 + 1) / ((s.drugs || 0) + 1), 0.3, 4);
  }
  // the run: narcotics flow from havens of vice to populous markets, lawful
  // or not — the illegal markets pay a premium and risk the customs cutters
  for (const e of w.edges) {
    const A = w.systems[e.a], B = w.systems[e.b];
    if (A.pop <= 0.05 || B.pop <= 0.05 || A.siege || B.siege) continue;
    for (const [src, dst] of [[A, B], [B, A]]) {
      if ((src.drugs || 0) < 0.5) continue;
      const q = Math.min(src.drugs * 0.25, dst.pop * 0.05 * cb);
      if (q < 0.05) continue;
      const legal = allowsDrugs(govOf(w, dst), dst.outlaw);
      if (!legal && rng.chance(0.22 + 0.04 * dst.infra.gate)) {
        // the run is intercepted at the border: cargo burned, a bust logged
        src.drugs -= q;
        if (dst.fid !== null) w.factions[dst.fid].treasury += q * dst.price.drugs * 0.15;
        w.stats.c.drugBust++;
        if (q > 1.5 && rng.chance(0.3))
          log(w, "drug", `Customs cutters off ${dst.name} seize a narcotics run out of ${src.name}. The wharves smell of burning contraband for a week.`, dst.id, {
            actors: [sysRef(dst)], targets: [sysRef(src)], systems: [src.id],
            cause: "drug.bust", why: "the run crossed a border where the trade is banned",
            effects: [{ k: "drugs", d: -q }],
          });
        continue;
      }
      src.drugs -= q;
      const pay = q * dst.price.drugs * (legal ? 1 : 1.6); // the black market pays more
      dst.wealth = Math.max(-20, dst.wealth - pay * 0.35);
      src.wealth += pay * 0.5;
      const sf = src.fid !== null ? w.factions[src.fid] : null;
      if (sf && sf.gov === "pirate") sf.treasury += pay * 0.3; // vice funds the corsairs
      dst.drugLoad = clamp(dst.drugLoad + q / (dst.pop + 1) * T.DRUG_ADDICT, 0, 1);
      w.stats.c.drugTrade++;
    }
  }
  // toll: an addicted underclass feeds crime and unrest
  for (const s of alive)
    if (s.drugLoad > 0.05) s.unrest = clamp(s.unrest + s.drugLoad * 0.04, 0, 1);

  // --- the slave trade: a bonded workforce that can be bought and shipped ---
  // Slaves are a population/commodity hybrid — they work the fields and mines
  // (economy.js folds them into the labor pool) and they change hands on a
  // market. First settle legality and this year's price at every world.
  for (const s of alive) {
    if (!allowsSlaves(govOf(w, s), s.outlaw)) {
      // manumission by law: where bondage is outlawed, the chains come off —
      // this also fires the year a world changes hands or a republic is born
      if (s.slaves > 0.01) {
        const freed = s.slaves; s.slaves = 0;
        addWorkers(s, freed);
        w.stats.c.slavesFreed++;
        if (freed > 0.5)
          log(w, "slave", `Abolition reaches ${s.name}: ${freed.toFixed(1)}M are struck from the ledgers and freed into the workers' ranks.`, s.id, {
            sev: 2, actors: [sysRef(s)], cause: "slave.abolition",
            why: "bondage became unlawful under the flag now flying here",
            effects: [{ k: "slaves", d: -freed, u: "M" }, { k: "pop", d: freed, u: "M" }],
          });
      }
      s.price.slaves = 0; // no market here
      continue;
    }
    // rich, industrious slaving worlds bid up bonded labor; the price gradient
    // is what pulls captives from the frontier to the great estates
    s.price.slaves = BASE_PRICE.slaves * clamp(s.wealth / (s.pop * 10 + 1) + 0.4, 0.4, 2.5);
  }

  // the market: bonded labor is shipped down the lanes from where it is cheap
  // and plentiful to the slaving powers that will pay for it. Only ever between
  // worlds where the trade is lawful — an abolitionist market frees what lands.
  for (const e of w.edges) {
    const A = w.systems[e.a], B = w.systems[e.b];
    if (A.pop <= 0.05 || B.pop <= 0.05 || A.siege || B.siege) continue;
    if (!(A.price.slaves > 0) || !(B.price.slaves > 0)) continue; // both must be slaving
    const [lo, hi] = A.price.slaves <= B.price.slaves ? [A, B] : [B, A];
    if (lo.slaves < 0.2) continue; // nothing to sell
    if (hi.price.slaves - lo.price.slaves < BASE_PRICE.slaves * 0.2) continue; // need a real margin
    const q = Math.min(lo.slaves * 0.3, Math.max(0, hi.wealth) / hi.price.slaves * 0.3);
    if (q < 0.05) continue;
    lo.slaves -= q; hi.slaves += q; // the workforce moves with the sale
    const pay = q * hi.price.slaves;
    hi.wealth = Math.max(-20, hi.wealth - pay);
    lo.wealth += pay;
    lo.tradeOut += pay; hi.tradeIn += pay;
    w.stats.c.slaveTrade++;
    if (q > 1 && rng.chance(0.15))
      log(w, "slave", `Slavers ship ${q.toFixed(1)}M in bondage down the ${lo.name}–${hi.name} lane to the blocks of ${hi.name}.`, hi.id, {
        actors: [sysRef(lo)], targets: [sysRef(hi)], systems: [lo.id],
        cause: "slave.trade", why: "the price gradient pulls captives to the great estates",
        effects: [{ k: "slaves", d: q, u: "M" }],
      });
  }

  // holding, unrest, and revolt at each slaving world
  for (const s of alive) {
    if (!(s.price.slaves > 0)) continue; // abolitionist worlds handled above

    // debt bondage: a starving world in a slaving realm sells its own poor
    if (s.wb < 0.5 && s.pop > 1 && s.wealth < 25 && rng.chance(0.05 * cb)) {
      const sold = s.pop * rng.range(0.02, 0.06);
      s.pop -= sold; s.slaves += sold;
      s.wealth += sold * s.price.slaves * 0.5;
      w.stats.c.slaveTrade++;
      log(w, "slave", `Hunger drives ${s.name} to the block: ${sold.toFixed(1)}M sell themselves or their children into bondage.`, s.id, {
        actors: [sysRef(s)], cause: "slave.debt-bondage",
        why: "a starving world in a slaving realm sold its own poor",
        effects: [{ k: "pop", d: -sold, u: "M" }, { k: "slaves", d: sold, u: "M" }],
      });
    }

    s.slaves *= 0.995; // bondage is lethal; the numbers thin without fresh captives
    if (s.slaves > 0.05) {
      const share = s.slaves / (s.pop + s.slaves);
      s.unrest = clamp(s.unrest + share * T.SLAVE_UNREST * 0.05, 0, 1);
      // uprising: the bonded break their chains when they grow numerous and angry
      if (share > 0.15 && rng.chance(0.03 + share * 0.12 + s.unrest * 0.05)) {
        const freed = s.slaves * rng.range(0.4, 0.8);
        s.slaves -= freed;
        const killed = freed * 0.3;
        addWorkers(s, freed - killed);
        s.wealth = Math.max(-20, s.wealth - 20);
        s.unrest = clamp(s.unrest + 0.3, 0, 1);
        s.lastWar = w.year;
        w.stats.c.slaveRevolt++;
        log(w, "slave", rng.pick([
          `Slave uprising at ${s.name}: the chains are broken in fire, the estates burn, and ${(freed - killed).toFixed(1)}M walk free.`,
          `${s.name} rises — the bonded overrun the compounds. Blood on the terraces, and a new free underclass by dawn.`,
        ]), s.id, {
          sev: 2, actors: [sysRef(s)], cause: "slave.revolt",
          why: "the bonded grew numerous and angry enough to break their chains",
          effects: [
            { k: "slaves", d: -freed, u: "M" },
            { k: "pop", d: freed - killed, u: "M" },
            { k: "wealth", d: -20, u: "cr" },
          ],
        });
      }
    }
  }

  // corsairs work the slave trade too: havens seize souls off nearby worlds
  for (const f of w.factions) {
    if (f.dead || f.gov !== "pirate") continue;
    if (!rng.chance(0.15 * cb)) continue;
    const haven = w.systems[f.capital];
    if (!haven || haven.pop <= 0.05) continue;
    const prey = w.adj[f.capital]
      .map(({ to }) => w.systems[to])
      .filter((o) => o.pop > 1 && o.fid !== f.id);
    if (!prey.length) continue;
    const victim = rng.pick(prey);
    const taken = Math.min(victim.pop * rng.range(0.01, 0.04), 1.5);
    victim.pop -= taken; haven.slaves += taken;
    victim.lastWar = w.year;
    w.stats.c.enslaved++;
    log(w, "slave", `Corsairs of ${f.name} fall on ${victim.name} and carry off ${taken.toFixed(1)}M to the blocks of ${haven.name}.`, victim.id, {
      actors: [facRef(f)], targets: [sysRef(victim)], systems: [haven.id],
      cause: "slave.raid", why: "a corsair haven works the slave trade off its neighbors",
      effects: [{ k: "pop", d: -taken, u: "M" }, { k: "slaves", d: taken, u: "M" }],
    });
  }
}
