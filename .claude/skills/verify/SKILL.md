---
name: verify
description: Build, launch, and drive AEONS in a browser to verify UI changes end-to-end.
---

# Verifying AEONS changes

## Engine changes (src/sim/)

Headless, no browser needed:

- `npm run sim -- 42 500` — capture before/after and diff; the engine is
  deterministic, so ANY diff means behavior changed.
- `npm run balance` for balance-affecting changes.

## UI changes (src/ui/, src/GalaxySim.jsx)

Build and serve the real bundle, then drive it with playwright-core and the
preinstalled Chromium:

```bash
npm run build
npm run preview -- --port 4173 &   # serves dist/ on http://localhost:4173
```

```js
// driver.mjs — run with plain `node`; resolve playwright-core via the repo
import { createRequire } from "module";
const require = createRequire("/path/to/AEONS/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:4173/");
```

Flows worth driving:

- **Founding screen**: `▶ BEGIN STANDARD GALAXY` starts a galaxy; the default
  config burns 300 years of pre-history first (a few seconds headless — wait
  with a generous timeout for `text=YEAR`).
- **Guided tour**: check the tour checkbox on the founding screen (checked by
  default only while `localStorage["aeons.tutorial.seen"]` is unset — each
  fresh browser launch resets this); replay from the `⟡ tour` top-bar button.
- **Side panel**: click systems on the map canvas or use panel buttons;
  system sub-tabs are chips (overview/society/market/problems).
- **Curate**: switch the top-bar mode to `✳ curate`, pick an instrument row,
  fill the `<select>` targets, apply.

Gotchas:

- Playwright strict mode: prose in panels often repeats UI labels
  (e.g. "anticipated pressure") — prefer `span:text-is(...)` or `.first()`.
- The sim keeps running while you drive; world state (names, years, events)
  shifts between steps. Assert on structure, not on specific world content.
