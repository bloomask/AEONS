import { T, GOODS, BASE_PRICE } from "../constants.js";
import { clamp } from "../util.js";
import { log } from "../events.js";

// --- production, consumption, prices ---
export function runEconomy(w, rng, alive) {
  for (const s of alive) {
    s.stock.food *= Math.min(0.97, T.FOOD_SPOILAGE + 0.04 * s.infra.gran); // food is perishable; granaries help
    const mq = s.min * Math.max(T.MIN_QUALITY_FLOOR + 0.15 * s.infra.mine, Math.sqrt(Math.max(0, s.minRes / s.minRes0)));
    const eq = s.en * Math.max(0.4, Math.sqrt(Math.max(0, s.enRes / s.enRes0)));

    // labor allocation follows price signals (with inertia);
    // hungry populations shift hard toward subsistence farming
    const hunger = 1 + 2.5 * Math.max(0, 0.75 - s.wb);
    const wt = {
      food: s.price.food * s.fert * 2.2 * hunger,
      ore: s.price.ore * mq * 2.5,
      fuel: s.price.fuel * eq * 2.5,
      goods: Math.max(0.05, s.price.goods * 1.8 * s.dev - s.price.ore * 0.5 - s.price.fuel * 0.3),
    };
    const sum = wt.food + wt.ore + wt.fuel + wt.goods;
    for (const g of GOODS)
      s.shares[g] = s.shares[g] * 0.5 + (wt[g] / sum) * 0.5;

    const L = s.pop;
    const prod = {
      food: T.FOOD_YIELD * s.fert * L * s.shares.food,
      ore: T.ORE_YIELD * mq * L * s.shares.ore,
      fuel: T.FUEL_YIELD * eq * L * s.shares.fuel,
      goods: 0,
    };
    s.minRes = Math.max(0, s.minRes - prod.ore);
    s.enRes = Math.max(0, s.enRes - prod.fuel * 0.3);

    // industry converts ore+fuel into goods
    const gCap = T.GOODS_YIELD * s.dev * L * s.shares.goods;
    const gMade = Math.min(gCap, s.stock.ore / 0.5, s.stock.fuel / 0.3);
    prod.goods = Math.max(0, gMade);
    s.stock.ore -= prod.goods * 0.5;
    s.stock.fuel -= prod.goods * 0.3;
    for (const g of GOODS) s.stock[g] += prod[g];

    // consumption
    const foodNeed = s.pop * T.FOOD_PER_POP;
    const goodsNeed = s.pop * T.GOODS_PER_POP;
    const ate = Math.min(s.stock.food, foodNeed);
    const used = Math.min(s.stock.goods, goodsNeed);
    s.stock.food -= ate; s.stock.goods -= used;
    const fs = foodNeed > 0 ? ate / foodNeed : 1;
    const gs = goodsNeed > 0 ? used / goodsNeed : 1;
    let wb = 0.8 * fs + 0.2 * gs;
    const capPop = s.hab * 120 + s.fert * 80 + 8 + (s.mega.arcology ? 100 : 0);
    if (s.pop > capPop) wb *= capPop / s.pop;
    s.wb = wb;

    // demography — no rubber-banding
    s.pop *= 1 + clamp((wb - T.GROWTH_THRESHOLD) * 0.05, -0.05, 0.025);
    s.peakPop = Math.max(s.peakPop, s.pop);
    if (fs < 0.45) {
      const before = s.pop;
      s.pop *= 0.85 + 0.3 * fs;
      const lost = before - s.pop;
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

    // prices from local scarcity
    const demand = {
      food: foodNeed, goods: goodsNeed,
      ore: gCap * 0.5, fuel: gCap * 0.3 + s.pop * 0.05,
    };
    for (const g of GOODS) {
      const scarcity = (demand[g] * 1.5 + 1) / (s.stock[g] + prod[g] * 0.5 + 1);
      s.price[g] = BASE_PRICE[g] * clamp(Math.pow(scarcity, 0.75), 0.15, 8);
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
    s.flow = { food: 0, ore: 0, fuel: 0, goods: 0 };
  }
}
