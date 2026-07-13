import { diagnoseSystem, SEV_CRISIS, SEV_WARNING } from "../sim/diagnose.js";

// ---------------------------------------------------------------------------
// The guided first session — a five-minute tour of the bridge. Pure step
// definitions; TutorialOverlay renders them and GalaxySim owns the state.
// Every step is either informational (`info: true`, always passable) or has a
// `done(ctx)` condition the player satisfies by actually using the app —
// plus a `show me` action that performs the move for them, so nobody can get
// stuck. The tour is strictly a UI layer: it never touches the world object.
// ---------------------------------------------------------------------------

const SEEN_KEY = "aeons.tutorial.seen";

export function tutorialSeen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
export function markTutorialSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode — the tour just re-offers */ }
}

// the settled world with the gravest diagnosis — where the tour points its
// telescope. Read-only, same thresholds the engine uses.
export function findTroubledSystem(w) {
  let best = null, bestScore = 0;
  for (const s of w.systems) {
    if (s.pop <= 0.05) continue;
    const probs = diagnoseSystem(w, s);
    if (!probs.length) continue;
    const score = probs.reduce(
      (a, p) => a + (p.sev === SEV_CRISIS ? 3 : p.sev === SEV_WARNING ? 2 : 1), 0);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// ctx: { w, sel, selProbs, troubled, sideTab, sysSub, speed, mode, screen,
//        flags: {factionOpened, eventFollowed}, entry: {speed, commands} }
// actions: { openSystem, setSideTab, setSysSub, setSpeed, setMode, setScreen }
export const TUT_STEPS = [
  {
    key: "welcome", title: "Welcome to the bridge", info: true,
    body: () =>
      "AEONS is a galaxy that runs itself — economy, trade, war, faith, and " +
      "technology unfold year by year with no input from you. Your role is to " +
      "watch, understand, and occasionally nudge. This tour takes about five " +
      "minutes. Skip it any time; replay it from the ⟡ tour button in the top bar.",
  },
  {
    key: "faction", title: "Meet the powers",
    body: () =>
      "The map is carved up by factions — empires, republics, corporate " +
      "charters. Open the ♜ factions tab in the side window and click any " +
      "faction to read its temperament, its wars, and its worlds.",
    done: (c) => c.flags.factionOpened,
    action: { label: "open the factions tab", run: (a) => a.setSideTab("factions") },
  },
  {
    key: "troubled", title: "Find a world in trouble",
    body: (c) => c.troubled
      ? `Every dot on the map is a living world, sized by population and colored ` +
        `by allegiance. Some are thriving; some are failing. Click ${c.troubled.name} — ` +
        `it is struggling right now — or hunt for any world that looks dim.`
      : "Every dot on the map is a living world. Remarkably, none of them is in " +
        "trouble right now — click any settled world to inspect it.",
    // a galaxy with zero troubled worlds still lets the tour proceed
    done: (c) => !!c.sel && c.sel.pop > 0.05 && (c.selProbs.length > 0 || !c.troubled),
    action: {
      label: "take me to a troubled world",
      run: (a, c) => c.troubled && a.openSystem(c.troubled.id),
    },
  },
  {
    key: "problems", title: "Open the problems tab",
    body: (c) =>
      `The side window now shows ${c.sel ? c.sel.name : "your world"}. Its ` +
      "problems tab names everything holding the world back, judged by the " +
      "same thresholds the engine itself lives by. Open it.",
    done: (c) => c.sideTab === "system" && !!c.sel && c.sysSub === "problems",
    action: {
      label: "open it for me",
      run: (a) => { a.setSideTab("system"); a.setSysSub("problems"); },
    },
  },
  {
    key: "read", title: "Reading a diagnosis", info: true,
    body: (c) => {
      const probs = c.selProbs || [];
      const name = c.sel ? c.sel.name : "a world";
      if (!c.sel || !probs.length) {
        return `${name} has a clean bill: wellbeing above the growth threshold, no ` +
          "shocks — left alone, it thrives. When a world does fail, this tab says " +
          "why: CRISIS entries are existential, WARNINGs erode it, WATCH items " +
          "bear watching. The overview and market tabs carry the rest of the " +
          "story — wellbeing, trade flows, and why staples turned dear.";
      }
      const worst = probs[0];
      const sev = worst.sev === SEV_CRISIS ? "a crisis" : worst.sev === SEV_WARNING ? "a warning" : "a watch item";
      return `${name} carries ${probs.length} problem${probs.length > 1 ? "s" : ""}; the ` +
        `gravest is ${sev} — ${worst.tag}: ${worst.text} CRISIS entries are ` +
        "existential, WARNINGs erode a world, WATCH items bear watching. Cross-read " +
        "the overview tab (wellbeing, exports) and the market tab (why staples " +
        "turned dear) and you can explain why any world is thriving or failing.";
    },
  },
  {
    key: "speed", title: "Command the clock",
    body: () =>
      "History needs time. The transport controls at the top right run the " +
      "years: ⏸ pause, ▶ one year a second, ▶▶ five, ▶▶▶ twenty, and +100y " +
      "leaps a century. Change the speed now — pause to study, sprint to see " +
      "eras turn.",
    done: (c) => c.speed !== c.entry.speed,
  },
  {
    key: "follow", title: "Follow the news",
    body: () =>
      "As history is written, headlines drift across the bottom of the map. " +
      "Click one to follow it into the chronicle — the full record of " +
      "everything that has ever happened — or press ≡ chronicle in the top " +
      "bar. Esc brings you back to the map.",
    done: (c) => c.flags.eventFollowed || c.screen === "chronicle",
  },
  {
    key: "curate", title: "The unseen hand",
    body: () =>
      "So far you have only watched. Switch to ✳ curate in the top bar and a " +
      "✳ curate tab joins the side window: bounded instruments like a relief " +
      "shipment or sponsoring a colony. Pick one, then aim it by clicking its " +
      "target on the map — the valid worlds and lanes light up. Read the " +
      "anticipated pressure, and apply it. The engine — not your hand — " +
      "decides what follows.",
    done: (c) => ((c.w && c.w.commands ? c.w.commands.length : 0) > c.entry.commands),
    action: {
      label: "open the curator's instruments",
      run: (a) => { a.setMode("curate"); a.setSideTab("curate"); },
    },
  },
  {
    key: "finish", title: "The chronicle is yours", info: true,
    body: () =>
      "You can now read a world: its archetype and problems tell you what it " +
      "is and what ails it, the market tells you why, the chronicle tells you " +
      "how it came to pass — and curate mode lets you press a thumb on the " +
      "scale. Replay this tour any time from ⟡ tour in the top bar.",
  },
];
