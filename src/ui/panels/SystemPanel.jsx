import { Fragment, useState } from "react";
import { GOODS, GOOD_CATS, GOOD_LABEL, BASE_PRICE, CLASSES, CLASS_DEF, T, allowsDrugs, allowsSlaves } from "../../sim/constants.js";
import { diagnoseSystem, SEV_CRISIS, SEV_WARNING } from "../../sim/diagnose.js";
import { Bar, Spark, Section, Tile } from "../widgets.jsx";
import { fmtPop, fmtCredits } from "../format.js";
import { describeSystem } from "../describe.js";

const SEV_STYLE = {
  [SEV_CRISIS]: { color: "var(--red)", raw: "#E4572E", label: "CRISIS" },
  [SEV_WARNING]: { color: "var(--amber)", raw: "#F2A93B", label: "WARNING" },
  0: { color: "var(--muted)", raw: "#8A94A6", label: "WATCH" },
};

const SUBTABS = ["overview", "society", "market", "problems"];

function Endowments({ sel }) {
  const mineLeft = Math.max(0, sel.minRes / sel.minRes0);
  const rows = [
    ["fertile", sel.fert, "var(--green)", null],
    ["minerals", sel.min * Math.sqrt(mineLeft), "var(--gold)", `${(mineLeft * 100).toFixed(0)}% left`],
    ["rare earths", sel.rare * Math.sqrt(mineLeft), "#DA5CB0", null],
    ["energy", sel.en * Math.sqrt(Math.max(0, sel.enRes / sel.enRes0)), "var(--cyan)", null],
    ["habitable", sel.hab, "var(--purple)", null],
  ];
  return (
    <Section title="endowments">
      <div className="space-y-1.5">
        {rows.map(([label, v, color, note]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-20 muted">{label}</span>
            <div className="flex-1"><Bar v={v} color={color} /></div>
            {note && <span className="faint">{note}</span>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function LocalRecord({ sel }) {
  if (!sel.history.length) return null;
  return (
    <Section title="local record">
      {[...sel.history].reverse().map((h, i) => (
        <div key={i} className="mb-1.5 flex gap-2.5">
          <span style={{ color: "var(--amber)", minWidth: 30 }}>{h.y}</span>
          <span className="muted">{h.s}</span>
        </div>
      ))}
    </Section>
  );
}

function ArmsAndUnderworld({ w, sel }) {
  const gov = sel.fid !== null ? w.factions[sel.fid].gov : null;
  const need = sel.pop * T.ARMS_PER_POP;
  const readiness = need > 0 ? Math.min(1, sel.stock.weapons / need) : 1;
  const rc = readiness < 0.4 ? "var(--red)" : readiness < 0.75 ? "var(--amber)" : "var(--green)";
  const drugsLegal = allowsDrugs(gov, sel.outlaw);
  const slavesLegal = allowsSlaves(gov, sel.outlaw);
  const showUnderworld = sel.slaves > 0.05 || sel.drugLoad > 0.03 || (sel.drugs || 0) > 0.3 || drugsLegal || slavesLegal;
  return (
    <>
      <div>
        <div className="flex justify-between mb-1">
          <span className="muted" title="Combat strength is capped by the arms in the armory — a bare armory fights at a fraction of full weight">garrison arms</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: rc }}>
            {(readiness * 100).toFixed(0)}% armed
          </span>
        </div>
        <Bar v={readiness} color={rc} />
      </div>
      {showUnderworld && (
        <Section title="the underworld">
          <div className="muted space-y-1">
            {sel.slaves > 0.05 && (
              <div>
                bonded population <b style={{ color: "var(--red)" }}>{fmtPop(sel.slaves)}</b>
                <span className="faint"> · {((sel.slaves / (sel.pop + sel.slaves)) * 100).toFixed(0)}% of all souls here</span>
              </div>
            )}
            {(sel.drugs || 0) > 0.3 && (
              <div>narcotics stockpiled <b style={{ color: "var(--purple)" }}>{sel.drugs.toFixed(1)}</b></div>
            )}
            {sel.drugLoad > 0.03 && (
              <div>addicted underclass <b style={{ color: "var(--purple)" }}>{(sel.drugLoad * 100).toFixed(0)}%</b> <span className="faint">— feeds unrest</span></div>
            )}
            <div className="faint">
              {slavesLegal ? "slave-holding lawful" : "abolitionist"} · narcotics {drugsLegal ? "tolerated" : "banned (smuggled)"}
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

function Overview({ w, sel }) {
  const i = sel.infra;
  const seat = w.houses.filter((h) => !h.dead && h.home === sel.id);
  const depotOwners = sel.depots.map((hid) => w.houses[hid]).filter((h) => h && !h.dead);
  const backer = sel.sponsor !== null ? w.houses[sel.sponsor] : null;
  const pips = (n, max) => "●".repeat(n) + "○".repeat(max - n);
  const imp = GOODS.filter((g) => sel.flow[g] > 0.3).map((g) => GOOD_LABEL[g]);
  const exp = GOODS.filter((g) => sel.flow[g] < -0.3).map((g) => GOOD_LABEL[g]);
  const hasInfra = i.gran > 0 || i.gate > 0 || i.mine > 0 || seat.length > 0 || depotOwners.length > 0 || backer;
  return (
    <div className="space-y-5">
      {sel.siege && (
        <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(228,87,46,0.12)", color: "var(--red)", border: "1px solid rgba(228,87,46,0.4)" }}>
          UNDER SIEGE by the {w.factions[sel.siege.by].name} since {sel.siege.since} — all trade severed
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="population" value={fmtPop(sel.pop)} />
        <Tile label="wealth" value={fmtCredits(sel.wealth)} color={sel.wealth < 0 ? "var(--red)" : undefined} />
        <Tile label="industry" value={`×${sel.dev.toFixed(2)}`} />
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <span className="muted">wellbeing</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{(sel.wb * 100).toFixed(0)}%</span>
        </div>
        <Bar v={sel.wb} color={sel.wb < 0.5 ? "var(--red)" : sel.wb < 0.65 ? "var(--amber)" : "var(--green)"} />
      </div>
      <ArmsAndUnderworld w={w} sel={sel} />
      {hasInfra && (
        <Section title="on the ground">
          <div className="muted space-y-1">
            {(i.gran > 0 || i.gate > 0 || i.mine > 0) && (
              <div className="flex gap-4 flex-wrap">
                {i.gran > 0 && <span>granaries <b style={{ color: "var(--green)" }}>{pips(i.gran, 3)}</b></span>}
                {i.gate > 0 && <span>gate docks <b style={{ color: "var(--cyan)" }}>{pips(i.gate, 3)}</b></span>}
                {i.mine > 0 && <span>deep mines <b style={{ color: "var(--gold)" }}>{pips(i.mine, 2)}</b></span>}
              </div>
            )}
            {seat.map((h) => (
              <div key={h.id}>seat of <b style={{ color: "var(--gold)" }}>{h.name}</b> ({h.ships.toFixed(0)} hulls)</div>
            ))}
            {depotOwners.map((h) => (
              <div key={`d${h.id}`}>▪ freight depot of <b style={{ color: "var(--gold)" }}>{h.name}</b></div>
            ))}
            {backer && !backer.dead && (
              <div>colony charter held by <b style={{ color: "var(--gold)" }}>{backer.name}</b></div>
            )}
          </div>
        </Section>
      )}
      {(imp.length > 0 || exp.length > 0) && (
        <div className="muted">
          {exp.length > 0 && <span>exports <b style={{ color: "var(--green)" }}>{exp.join(", ")}</b></span>}
          {exp.length > 0 && imp.length > 0 && " · "}
          {imp.length > 0 && <span>imports <b style={{ color: "var(--cyan)" }}>{imp.join(", ")}</b></span>}
        </div>
      )}
      {sel.trace.length > 5 && (
        <Section title={`last ${sel.trace.length} years`}>
          <div className="space-y-1.5">
            <Spark data={sel.trace.map((t) => t.p)} color="#E9E4D6" label="pop" fmt={fmtPop} />
            <Spark data={sel.trace.map((t) => t.f)} color="#6FBF73" label="grain cr" fmt={(v) => v.toFixed(2)} />
            <Spark data={sel.trace.map((t) => t.g)} color="#C05DD6" label="goods cr" fmt={(v) => v.toFixed(2)} />
          </div>
        </Section>
      )}
      <LocalRecord sel={sel} />
    </div>
  );
}

function Society({ sel }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="muted">the social pyramid</span>
          <span style={{ color: sel.unrest > 0.6 ? "var(--red)" : sel.unrest > 0.35 ? "var(--amber)" : "var(--muted)" }}>
            unrest {(sel.unrest * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(233,228,214,0.08)" }}
          title={CLASSES.map((c) => `${CLASS_DEF[c].label} ${(sel.classes[c] * 100).toFixed(0)}%`).join(" · ")}>
          {CLASSES.map((c) => (
            <div key={c} style={{ width: `${sel.classes[c] * 100}%`, background: CLASS_DEF[c].color }} />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {CLASSES.map((c) => {
          const wb = sel.classWb[c];
          const wc = wb < 0.5 ? "var(--red)" : wb < 0.65 ? "var(--amber)" : "var(--green)";
          return (
            <div key={c} className="flex items-baseline gap-2">
              <span style={{ color: CLASS_DEF[c].color }}>■</span>
              <span>{CLASS_DEF[c].label.toLowerCase()}</span>
              <span className="faint">{(sel.classes[c] * 100).toFixed(0)}%</span>
              <span className="ml-auto" style={{ color: wc }} title="how well this class lives">
                {(wb * 100).toFixed(0)}% content
              </span>
            </div>
          );
        })}
      </div>
      <div className="faint italic">
        Consumption is allocated top-down — the elite buy first, the workers
        get what is left on the shelves. Scarcity always lands on the bottom.
      </div>
    </div>
  );
}

function Market({ sel }) {
  return (
    <div className="space-y-5">
      <Section title="local market" right={<span className="faint">stock · price cr · vs norm</span>}>
        <table className="w-full">
          <tbody>
            {GOOD_CATS.map((cat) => (
              <Fragment key={cat.key}>
                <tr>
                  <td colSpan={4} className="uppercase pt-2 pb-0.5 faint" style={{ fontSize: 9, letterSpacing: "0.14em", fontFamily: "var(--font-display)" }}>
                    {cat.label}
                  </td>
                </tr>
                {cat.goods.map((g) => {
                  const ratio = sel.price[g] / BASE_PRICE[g];
                  const c = ratio > 1.8 ? "var(--red)" : ratio < 0.6 ? "var(--green)" : "var(--text)";
                  const arrow = ratio > 1.8 ? "▲" : ratio > 1.25 ? "△" : ratio < 0.6 ? "▼" : ratio < 0.8 ? "▽" : "·";
                  return (
                    <tr key={g}>
                      <td className="pl-2 py-0.5">{GOOD_LABEL[g]}</td>
                      <td className="text-right muted">{sel.stock[g].toFixed(1)}</td>
                      <td className="text-right" style={{ color: c }}>{sel.price[g].toFixed(2)}</td>
                      <td className="text-right" style={{ color: c, width: 54 }} title={`${(ratio * 100).toFixed(0)}% of base price`}>
                        {arrow} ×{ratio.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Section>
      <Endowments sel={sel} />
    </div>
  );
}

function Problems({ sel, probs }) {
  if (probs.length === 0) {
    const growth = (sel.wb - T.GROWTH_THRESHOLD) * 0.05 * 100;
    return (
      <div className="px-3 py-2.5 rounded-lg space-y-1"
        style={{ background: "rgba(111,191,115,0.08)", border: "1px solid rgba(111,191,115,0.3)" }}>
        <div className="display" style={{ color: "var(--green)", fontWeight: 700 }}>
          ✓ No problems
        </div>
        <div className="muted">
          {sel.name} thrives: wellbeing {(sel.wb * 100).toFixed(0)}%, every class fed,
          the lanes open, and the population growing
          {growth > 0.05 ? ` ~${Math.min(2.5, growth).toFixed(1)}%/yr` : ""}.
        </div>
      </div>
    );
  }
  const count = (sev) => probs.filter((p) => p.sev === sev).length;
  return (
    <div className="space-y-2.5">
      <div className="muted">
        {count(SEV_CRISIS) > 0 && <span style={{ color: "var(--red)" }}>{count(SEV_CRISIS)} crisis · </span>}
        {count(SEV_WARNING) > 0 && <span style={{ color: "var(--amber)" }}>{count(SEV_WARNING)} warning · </span>}
        {count(0) > 0 && <span>{count(0)} watch · </span>}
        a system with none of these thrives on its own
      </div>
      {probs.map((p, i) => {
        const st = SEV_STYLE[p.sev];
        return (
          <div key={i} className="px-3 py-2 rounded-lg"
            style={{ background: `${st.raw}10`, border: `1px solid ${st.raw}30`, borderLeftWidth: 3, borderLeftColor: st.raw }}>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="display uppercase" style={{ color: st.color, fontSize: 9, letterSpacing: "0.16em" }}>
                {st.label}
              </span>
              <b>{p.tag}</b>
            </div>
            <div style={{ color: "#A8B0BD" }}>{p.text}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function SystemPanel({ w, sel }) {
  const [sub, setSub] = useState("overview");
  if (!sel) {
    return (
      <div className="muted italic leading-relaxed">
        Tap a system on the map to inspect it. Dots are sized by population and
        colored by allegiance. Everything you see emerged from the simulation —
        nothing is scripted.
      </div>
    );
  }

  const settled = sel.pop > 0.05;
  const probs = settled ? diagnoseSystem(w, sel) : [];
  const worst = probs.length ? SEV_STYLE[probs[0].sev].color : "var(--green)";

  return (
    <div className="space-y-4">
      <div>
        <div className="display text-lg" style={{ fontWeight: 700, color: "var(--bright)" }}>
          {sel.name}
        </div>
        <div className="muted">
          {sel.ruined
            ? `RUINS — went dark in year ${sel.diedYear}`
            : !settled
              ? "Uncolonized"
              : sel.fid !== null
                ? <span><span style={{ color: w.factions[sel.fid].color }}>■</span> {w.factions[sel.fid].name}{w.factions[sel.fid].capital === sel.id ? " · CAPITAL" : ""}</span>
                : "Free System — no authority, no duties"}
          {" · "}{sel.cultName} culture
          {w.faiths[sel.faith] && (
            <> · <span style={{ color: w.faiths[sel.faith].color }}>{w.faiths[sel.faith].name}</span></>
          )}
        </div>
        {(sel.mega.nexus || sel.mega.arcology || sel.mega.terraformed) && (
          <div className="mt-1" style={{ color: "#4FD0A5" }}>
            {sel.mega.nexus && <span title="Freight moves almost for free through its grand gates">◈ Gate Nexus </span>}
            {sel.mega.arcology && <span title="Ring habitats carry millions beyond the world's natural limit">◍ Orbital Arcology </span>}
            {sel.mega.terraformed && <span title="Terraformed — the rains came, and the rock turned green">❋ Terraformed</span>}
          </div>
        )}
      </div>

      <div
        className="italic pl-3"
        style={{ color: "#9AA5B5", borderLeft: "2px solid var(--line-2)", lineHeight: 1.65 }}
      >
        {describeSystem(w, sel)}
      </div>

      {settled ? (
        <>
          <div className="flex gap-1.5 flex-wrap pt-1">
            {SUBTABS.map((t) => (
              <button key={t} onClick={() => setSub(t)} className={`chip${sub === t ? " on" : ""}`}>
                {t}
                {t === "problems" && (
                  <b style={{ color: worst }}> {probs.length === 0 ? "✓" : probs.length}</b>
                )}
              </button>
            ))}
          </div>
          {sub === "overview" && <Overview w={w} sel={sel} />}
          {sub === "society" && <Society sel={sel} />}
          {sub === "market" && <Market sel={sel} />}
          {sub === "problems" && <Problems sel={sel} probs={probs} />}
        </>
      ) : (
        <>
          <Endowments sel={sel} />
          <LocalRecord sel={sel} />
        </>
      )}
    </div>
  );
}
