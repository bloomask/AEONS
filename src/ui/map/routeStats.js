import { T, GOODS, GOOD_LABEL, FREIGHT_COST, GOVS, techFx } from "../../sim/constants.js";
import { relKey, getRel } from "../../sim/events.js";
import { jumpHops } from "../../sim/util.js";

// Live, derived statistics for one jumpgate lane (edge index `ei`). Pure —
// reads the world, mutates nothing. Shared by the hover tooltip and the
// full route inspection panel so both always agree. Mirrors the arbitrage
// math in phases/trade.js so "why does cargo move here" is answerable.
export function routeStats(w, ei) {
  const e = w.edges[ei];
  const A = w.systems[e.a], B = w.systems[e.b];
  const fA = A.fid !== null ? w.factions[A.fid] : null;
  const fB = B.fid !== null ? w.factions[B.fid] : null;

  // relation & lane status between two different powers
  let rel = null, status = "open", statusColor = "#5CC8DA";
  if (A.fid !== null && B.fid !== null && A.fid === B.fid) {
    status = "internal"; statusColor = "#8892A6";
  } else if (fA && fB) {
    rel = getRel(w, A.fid, B.fid);
    if (rel.war) { status = "war — severed"; statusColor = "#E4572E"; }
    else if (rel.embargo) { status = "embargo — severed"; statusColor = "#E4572E"; }
    else if (rel.allied) { status = "allied — duty-free"; statusColor = "#6FBF73"; }
    else { status = "cross-border"; statusColor = "#F2A93B"; }
  } else {
    status = "open"; statusColor = "#5CC8DA";
  }
  const besieged = !!(A.siege || B.siege);
  const severed = besieged || status.includes("severed");

  // freight economics (same constants the trade phase uses)
  const fr = w.cfg.freight * techFx(w).freight;
  const gateLv = (s) => s.infra.gate + (s.mega.nexus ? 3 : 0);
  const gf = Math.max(0.4, 1 - 0.12 * (gateLv(A) + gateLv(B)));
  const dutyRate = (dst) => {
    if (!rel || dst.fid === null || rel.allied) return 0;
    return w.factions[dst.fid].tariff;
  };

  // per-good arbitrage: gap, freight, duty, and whether cargo would flow
  const goods = [];
  for (const g of GOODS) {
    const cost = (e.d / 220) * FREIGHT_COST[g] * gf * fr + 0.05;
    const gap = B.price[g] - A.price[g]; // + means B dearer, cargo flows A→B
    let dir = null, margin = 0;
    if (!severed) {
      if (gap > cost + dutyRate(B) * B.price[g]) { dir = "A→B"; margin = gap - cost - dutyRate(B) * B.price[g]; }
      else if (-gap > cost + dutyRate(A) * A.price[g]) { dir = "B→A"; margin = -gap - cost - dutyRate(A) * A.price[g]; }
    }
    goods.push({ g, label: GOOD_LABEL[g], priceA: A.price[g], priceB: B.price[g], gap, cost, dir, margin });
  }
  const flowing = goods.filter((x) => x.dir).sort((a, b) => b.margin - a.margin);

  // corsair exposure: is either end within raiding reach of a live haven?
  const pirateSys = [];
  for (const s of w.systems)
    if (s.pop > 0.05 && s.fid !== null && w.factions[s.fid]?.gov === "pirate") pirateSys.push(s.id);
  let raidRisk = false;
  if (pirateSys.length) {
    const hops = jumpHops(w, pirateSys, T.RAID_JUMPS);
    raidRisk = (hops[e.a] >= 0 && hops[e.a] <= T.RAID_JUMPS) ||
      (hops[e.b] >= 0 && hops[e.b] <= T.RAID_JUMPS);
  }

  return {
    ei, e, A, B, fA, fB, rel, status, statusColor, severed, besieged,
    length: e.d, vol: e.vol, net: e.net,
    dirLabel: Math.abs(e.net) < 0.05 ? "balanced" : (e.net >= 0 ? `${A.name} → ${B.name}` : `${B.name} → ${A.name}`),
    gateDiscount: gf, freightMul: fr,
    tariffAtoB: dutyRate(B), tariffBtoA: dutyRate(A),
    goods, flowing, raidRisk,
  };
}
