import { useMemo } from "react";
import { diagnoseSystem } from "../sim/diagnose.js";
import { TUT_STEPS, findTroubledSystem } from "./tutorial.js";

// ---------------------------------------------------------------------------
// The tour card — floats over the map (and above the full-screen panels, so
// it survives a trip into the chronicle). GalaxySim owns which step we are
// on; this component evaluates the current step's condition against live app
// state every render and lights the way forward.
// ---------------------------------------------------------------------------

export default function TutorialOverlay({
  w, step, entry, flags,
  sel, sideTab, sysSub, speed, mode, screen,
  actions, onNext, onBack, onSkip,
}) {
  const st = TUT_STEPS[step];
  const last = step === TUT_STEPS.length - 1;

  // the tour's telescope target — rescanned as the years pass so the pointer
  // never aims at a world that has since healed or gone dark
  const troubled = useMemo(
    () => (st.key === "troubled" ? findTroubledSystem(w) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.key, w, w.year]
  );
  const selProbs = sel && sel.pop > 0.05 ? diagnoseSystem(w, sel) : [];
  const ctx = { w, sel, selProbs, troubled, sideTab, sysSub, speed, mode, screen, flags, entry };

  const done = st.info || !!st.done(ctx);

  return (
    <div
      className="absolute glass p-4 text-xs"
      style={{ left: 12, top: 56, zIndex: 35, width: 340, maxWidth: "calc(100% - 24px)", lineHeight: 1.6 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="display uppercase"
          style={{ color: "var(--amber)", fontSize: 9, letterSpacing: "0.18em", fontWeight: 700 }}
        >
          ⟡ guided tour
        </span>
        <span className="faint">{step + 1}/{TUT_STEPS.length}</span>
        <div className="flex gap-1 ml-1">
          {TUT_STEPS.map((s, i) => (
            <span key={s.key} style={{
              width: 5, height: 5, borderRadius: "50%",
              background: i < step ? "var(--amber)" : i === step ? "var(--bright)" : "rgba(233,228,214,0.18)",
            }} />
          ))}
        </div>
        <button className="ml-auto faint" style={{ cursor: "pointer" }} onClick={onSkip} title="End the tour — replay it any time from ⟡ tour in the top bar">
          skip tour ✕
        </button>
      </div>

      <div className="display mb-1" style={{ fontWeight: 700, fontSize: 13, color: "var(--bright)" }}>
        {st.title}
      </div>
      <div className="muted mb-3">{st.body(ctx)}</div>

      {!st.info && (
        <div className="mb-3 flex items-center gap-2" style={{ color: done ? "var(--green)" : "var(--faint)" }}>
          {done ? "✓ done — carry on when ready" : "○ waiting for you…"}
          {!done && st.action && (
            <button className="btn ml-auto" onClick={() => st.action.run(actions, ctx)}>
              {st.action.label}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {step > 0 && <button className="btn" onClick={onBack}>← back</button>}
        <div className="flex-1" />
        <button
          className={`btn${done ? " on" : ""}`}
          disabled={!done}
          style={done ? undefined : { opacity: 0.45, cursor: "default" }}
          onClick={() => done && onNext()}
        >
          {last ? "✓ finish tour" : "next →"}
        </button>
      </div>
    </div>
  );
}
