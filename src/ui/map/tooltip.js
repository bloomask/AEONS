import { GOVS } from "../../sim/constants.js";
import { fmtPop } from "../format.js";
import { routeStats } from "./routeStats.js";

// hover-tooltip body for a system — returns an HTML string
export function tooltipHtml(w, s) {
  const f = s.fid !== null ? w.factions[s.fid] : null;
  let status;
  if (s.ruined) status = `<span style="color:#B0453A">ruins · fell ${s.diedYear}</span>`;
  else if (s.pop <= 0.05) status = `<span style="color:#7C8798">uncolonized</span>`;
  else if (f) {
    const g = GOVS[f.gov];
    status = `<span style="color:${f.color}">■ ${f.name}</span>` +
      `${f.capital === s.id ? " · capital" : ""}` +
      (g ? ` · <span style="color:${g.badge}">${g.label.toLowerCase()}</span>` : "");
  } else status = `<span style="color:#8892A6">free system</span>`;
  let body = "";
  if (s.pop > 0.05) {
    const wbC = s.wb < 0.5 ? "#E4572E" : s.wb < 0.65 ? "#F2A93B" : "#6FBF73";
    const unC = s.unrest > 0.6 ? "#E4572E" : s.unrest > 0.35 ? "#F2A93B" : "#7C8798";
    body = `<div style="color:#7C8798;margin-top:2px">pop <b style="color:#E6E1D3">${fmtPop(s.pop)}</b>
      · wellbeing <b style="color:${wbC}">${(s.wb * 100).toFixed(0)}%</b>
      · unrest <b style="color:${unC}">${(s.unrest * 100).toFixed(0)}%</b>
      ${s.siege ? '<span style="color:#E4572E"> · UNDER SIEGE</span>' : ""}</div>`;
  }
  return `<div style="font-weight:600">${s.name}</div><div>${status}</div>${body}`;
}

// hover-tooltip body for a jumpgate lane — returns an HTML string
export function routeTooltipHtml(w, ei) {
  const r = routeStats(w, ei);
  const top = r.flowing[0];
  const cargo = r.severed
    ? '<span style="color:#E4572E">no cargo — lane severed</span>'
    : top
      ? `busiest cargo <b style="color:#C4ECF6">${top.label}</b> <span style="color:#7C8798">${top.dir}</span>`
      : '<span style="color:#7C8798">no profitable cargo</span>';
  return `<div style="font-weight:600">${r.A.name} — ${r.B.name}</div>`
    + `<div style="color:${r.statusColor}">${r.status}</div>`
    + `<div style="color:#7C8798;margin-top:2px">throughput <b style="color:#E6E1D3">${r.vol.toFixed(1)}</b>`
    + ` · ${r.length.toFixed(0)} lane-units`
    + `${r.raidRisk ? ' · <span style="color:#A34A3A">corsair waters</span>' : ""}</div>`
    + `<div style="color:#7C8798">${cargo}</div>`;
}
