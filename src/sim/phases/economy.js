import { T, GOODS, BASE_PRICE, RECIPES, MFG_YIELD, CLASSES, CLASS_DEF, techFx } from "../constants.js";
import { carryCap } from "../config.js";
import { clamp } from "../util.js";
import { log } from "../events.js";
import { laborForce, skewDeaths, socialMobility, computeUnrest } from "../society.js";

// --- production, consumption, prices, and the social pyramid ---
export function runEconomy(w, rng, alive) {
  const fx = techFx(w); // each technology era lifts yields galaxy-wide
  // powers at war (from last year's relations) mobilize and bid up arms
  const atWarFac = new Set();
  for (const [k, r] of Object.entries(w.relations))
    if (r.war) k.split("|").forEach((x) => atWarFac.add(+x));
  for (const s of alive) {
    s.stock.grain *= Math.min(0.97, T.FOOD_SPOILAGE + 0.04 * s.infra.gran); // grain is perishable; granaries help
    const mq = s.min * Math.max(T.MIN_QUALITY_FLOOR + 0.15 * s.infra.mine, Math.sqrt(Math.max(0, s.minRes / s.minRes0)));
    const eq = s.en * Math.max(0.4, Math.sqrt(Math.max(0, s.enRes / s.enRes0)));

    // labor allocation follows price signals (with inertia);
    // hungry populations shift hard toward subsistence farming.
    // manufacturing weights net out input costs AND are discounted by how
    // much of last year's capacity actually ran — a fat margin on a line
    // with empty input hoppers attracts no hands.
    const inputCost = (g) =>
      Object.entries(RECIPES[g]).reduce((a, [inp, q]) => a + q * s.price[inp], 0);
    // the field hands know who eats last — but they read the trend, not one
    // bad harvest. Using a smoothed multi-year wellbeing (not last year's
    // single value) is what breaks the grain cobweb: a world no longer floods
    // labor into farming after one lean year and gluts the next.
    const hunger = 1 + 2.5 * Math.max(0, 0.75 - (s.wbEma ?? s.classWb.worker));
    const wt = {
      grain: s.price.grain * s.fert * 2.2 * hunger,
      metals: s.price.metals * mq * 2.2,
      rares: s.price.rares * mq * s.rare * 2.2,
      fuel: s.price.fuel * eq * 2.5,
      consumer: Math.max(0.05, (s.price.consumer - inputCost("consumer")) * 1.8 * s.dev * s.mfgEff.consumer),
      medicine: Math.max(0.02, (s.price.medicine - inputCost("medicine")) * 1.2 * s.dev * s.mfgEff.medicine),
      electronics: Math.max(0.02, (s.price.electronics - inputCost("electronics")) * 1.4 * s.dev * s.mfgEff.electronics),
      // arms are an industrial good: only developed worlds make them at scale
      weapons: Math.max(0.02, (s.price.weapons - inputCost("weapons")) * 1.1 * s.dev * s.mfgEff.weapons),
    };
    const sum = GOODS.reduce((a, g) => a + wt[g], 0);
    // labor reallocates with inertia; a higher hold-over damps the year-to-year
    // over-correction that drives the cobweb (fields aren't replowed overnight)
    for (const g of GOODS)
      s.shares[g] = s.shares[g] * 0.72 + (wt[g] / sum) * 0.28;

    // the elite do not work; the labor pool is what the lower strata supply,
    // plus any bonded labor held here — slaves work the fields and mines
    const L = s.pop * Math.max(0.3, laborForce(s.classes)) + s.slaves * T.SLAVE_LABOR;
    const prod = {
      grain: T.FOOD_YIELD * w.cfg.fertility * fx.yield * s.fert * L * s.shares.grain,
      metals: T.ORE_YIELD * fx.yield * mq * L * s.shares.metals,
      rares: T.RARE_YIELD * fx.yield * mq * s.rare * L * s.shares.rares,
      fuel: T.FUEL_YIELD * fx.yield * eq * L * s.shares.fuel,
      consumer: 0, medicine: 0, electronics: 0,
    };
    s.minRes = Math.max(0, s.minRes - prod.metals - prod.rares * 3); // rare veins run through hard rock
    s.enRes = Math.max(0, s.enRes - prod.fuel * 0.3);
    for (const g of ["grain", "metals", "rares", "fuel"]) s.stock[g] += prod[g];

    // industry converts raw stockpiles into manufactures — staples first,
    // so a strained world makes soap before circuit boards
    const mfgDemand = {};
    for (const m of Object.keys(RECIPES)) {
      const cap = MFG_YIELD[m] * fx.mfg * s.dev * L * s.shares[m];
      let made = cap;
      for (const [inp, q] of Object.entries(RECIPES[m]))
        made = Math.min(made, s.stock[inp] / q);
      made = Math.max(0, made);
      for (const [inp, q] of Object.entries(RECIPES[m])) {
        s.stock[inp] -= made * q;
        mfgDemand[inp] = (mfgDemand[inp] || 0) + cap * q;
      }
      prod[m] = made;
      s.stock[m] += made;
      s.mfgEff[m] = Math.max(0.1, s.mfgEff[m] * 0.5 + (cap > 0.01 ? made / cap : 1) * 0.5);
    }

    // consumption, allocated down the pyramid: the elite buy first and the
    // workers get what is left. Each class's wellbeing is its own basket.
    const classDemand = {};
    let grainNeed = 0, grainAte = 0;
    for (const c of CLASSES) {
      const def = CLASS_DEF[c];
      const cpop = s.pop * s.classes[c];
      let wbFood = 1, wbRest = 0, restW = 0;
      for (const [g, per] of Object.entries(def.needs)) {
        const want = cpop * per;
        classDemand[g] = (classDemand[g] || 0) + want;
        const got = Math.min(s.stock[g], want);
        s.stock[g] -= got;
        const sat = want > 0 ? got / want : 1;
        if (g === "grain") { wbFood = sat; grainNeed += want; grainAte += got; }
        else { wbRest += sat * per; restW += per; }
      }
      s.classWb[c] = 0.75 * wbFood + 0.25 * (restW > 0 ? wbRest / restW : 1);
    }
    const fs = grainNeed > 0 ? grainAte / grainNeed : 1;
    let wb = CLASSES.reduce((a, c) => a + s.classWb[c] * s.classes[c], 0);
    const capPop = carryCap(w, s);
    if (s.pop > capPop) {
      const crowd = capPop / s.pop;
      wb *= crowd;
      for (const c of CLASSES) s.classWb[c] *= crowd;
    }
    s.wb = wb;
    // slowly-moving read of the workers' lot, fed back into next year's labor
    // allocation (see `hunger`). Averaged over ~4 years so a 2-year glut/famine
    // alternation cancels instead of reinforcing.
    s.wbEma = (s.wbEma ?? s.classWb.worker) * 0.72 + s.classWb.worker * 0.28;

    // the pyramid shifts: prosperity climbs, misery slides, anger simmers
    socialMobility(s);
    s.unrest = computeUnrest(s, w.cfg.unrest);

    // demography — no rubber-banding. Growth follows the workers' lot as
    // much as the average: a world where the majority queues for rations
    // stops growing long before the towers notice.
    const wbDemo = wb * (1 - T.GROWTH_WORKER_WT) + s.classWb.worker * T.GROWTH_WORKER_WT;
    s.pop *= 1 + clamp((wbDemo - T.GROWTH_THRESHOLD) * 0.05, -0.05, 0.025) * w.cfg.growth;
    s.peakPop = Math.max(s.peakPop, s.pop);
    if (fs < T.FAMINE_THRESHOLD) {
      const before = s.pop;
      s.pop *= 0.85 + 0.3 * fs;
      const lost = before - s.pop;
      skewDeaths(s, lost / before); // famine culls from the bottom up
      s.lastFamine = w.year;
      if (s.famineCd <= 0) {
        w.stats.c.famine++;
        let why = "";
        if (s.siege) why = " under the blockade";
        else if (s.min > 0.35 && s.minRes / s.minRes0 < 0.15) why = " as the great mines fail and the ore money dries up";
        else if (s.fert < 0.15) why = ", a barren world cut off from the grain lanes";
        const v = rng.pick([
          `Famine grips ${s.name}${why}. Granaries empty; the exodus begins.`,
          `The hunger years come to ${s.name}${why}. Ration queues stretch past the starports.`,
          `${s.name} starves${why}. Freighters that once carried ore now carry refugees.`,
        ]);
        log(w, "famine", v, s.id);
        if (lost > w.records.worstFamine && lost > 4) {
          w.records.worstFamine = lost;
          log(w, "era", `${lost.toFixed(0)} million perish at ${s.name} — the worst famine the galaxy has recorded.`, s.id);
        }
        s.famineCd = 5;
      }
    }
    s.famineCd--;

    // when the gap gets loud enough, it spills into the streets
    if (s.unrest > 0.8 && s.pop > 2 && s.riotCd <= 0 && rng.chance(0.08)) {
      s.wealth = Math.max(-20, s.wealth - s.wealth * 0.1 - 5);
      s.stock.consumer *= 0.85;
      s.unrest *= 0.6; // the streets have spoken; the pressure vents
      s.riotCd = 8;
      w.stats.c.riot++;
      log(w, "riot", rng.pick([
        `Bread riots at ${s.name}: the lower quarters burn the counting houses while the towers dine above the smoke.`,
        `${s.name} erupts — dock crews and mine gangs storm the upper rings. The militia holds, barely.`,
        `A general strike paralyzes ${s.name}. The elite pay for peace, this time.`,
      ]), s.id);
    }
    s.riotCd--;

    // prices from local scarcity: households plus industry bid for each good
    const demand = {};
    for (const g of GOODS)
      demand[g] = (classDemand[g] || 0) + (mfgDemand[g] || 0);
    demand.fuel += s.pop * 0.05; // lights and lift fields
    // standing garrisons keep an armory; war empties and refills it faster
    const wartime = s.fid !== null && atWarFac.has(s.fid);
    demand.weapons += s.pop * T.ARMS_PER_POP * (wartime ? 0.55 : 0.14);
    for (const g of GOODS) {
      const scarcity = (demand[g] * 1.5 + 1) / (s.stock[g] + prod[g] * 0.5 + 1);
      s.price[g] = BASE_PRICE[g] * clamp(Math.pow(scarcity, 0.75), 0.15, 8)
        * (w.cartelMul[g] || 1); // a cartel's private duty rides on every unit
    }

    // wealth & development; past a point, luxury and graft eat the surplus
    const pv = GOODS.reduce((acc, g) => acc + prod[g] * s.price[g], 0);
    s.wealth = Math.max(-20,
      s.wealth * 0.99 + pv * 0.06 - s.pop * 0.02 - Math.max(0, s.wealth - 400) * 0.012);
    s.dev = clamp(
      s.dev + clamp((s.wealth / (s.pop * 10 + 1) - 0.5) * 0.004, -0.003, 0.006),
      0.3, 3
    );
    s.tradeIn = 0; s.tradeOut = 0;
    s.flow = Object.fromEntries(GOODS.map((g) => [g, 0]));
  }
}
