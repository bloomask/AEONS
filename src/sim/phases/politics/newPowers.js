import { cultDist } from "../../util.js";
import { foundFaction } from "../../factions.js";

// --- new powers rise from prosperous independents — though true trade
// hubs prefer no flag at all ---
export function runNewPowers(w, rng, alive) {
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
