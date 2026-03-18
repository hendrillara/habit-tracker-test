# UI snapshots (screenshots as a quality gate)

If work is user-facing (web UI, mobile UI, client-like interface), the system must produce **repeatable UI snapshots** and use them as a review artifact.

This is a quality gate: agents should not claim “done” for user-facing work without screenshots (unless explicitly logged as a gap with rationale).

## What to capture

### Web (default)

Capture at least:

- Desktop viewport (e.g., 1440×900)
- Mobile viewport (e.g., 390×844)

For each relevant flow, capture the critical screens:

- entry point (landing / start of flow)
- key steps (forms, confirmations)
- success state
- error/empty state if relevant

### Native mobile (optional, when applicable)

If the project is native iOS/Android and a simulator is available, capture:

- at least one primary device viewport per platform
- the same “critical screens” list as web

## Where to store

Per run:

- Plan: `docs/ias/runs/YYYYMMDD-<run>/ui-snapshot-plan.md`
- Output: `docs/ias/runs/YYYYMMDD-<run>/screenshots/`

By default, screenshots are for local agent review and are not committed (the run scaffolding writes a `.gitignore` in the screenshots folder). If humans need to review without running the app, force-add selected screenshots:

- `git add -f docs/ias/runs/YYYYMMDD-<run>/screenshots/*.png`

Teams can configure this per repo via `ui_snapshots_commit` in `docs/ias/project-context.md` and adjust expectations accordingly.

## How to run (recommended tooling)

IAS is terminal-first. Use whichever is feasible for the target repo:

- Web: Playwright (preferred) or an equivalent browser automation runner.
- iOS simulator: `xcrun simctl io booted screenshot <path>` (requires Xcode tools).
- Android emulator: `adb exec-out screencap -p > <path>` (requires Android platform tools).

### Web (JavaScript/TypeScript repos) + Chrome/Chromium (recommended)

Even if you normally use Chrome interactively, don’t rely on a human-driven browser state for snapshots. Instead, make screenshots **repeatable** by running a browser automation pass from the terminal against a local dev server (or preview server).

Recommended options (in order):

1) **Playwright via `npx` (no repo dependency required)** (best default)
   - Works even if the target repo does not already use Playwright.
   - Produces deterministic screenshots (fixed viewport sizes).
   - Uses Playwright’s bundled Chromium by default (close enough for layout/regression).
2) **Playwright installed as a dev dependency** (when you need scripted flows)
   - Useful for authenticated or multi-step flows that require clicks/fills and reusable scripts.
   - Can be added to the repo as `@playwright/test` + a small snapshot script.
3) **Attach to an existing running Chrome via DevTools (CDP)** (only when necessary)
   - Useful if the UI requires a complex manual login state you haven’t made reproducible yet.
   - Requires starting Chrome with `--remote-debugging-port` and (ideally) a dedicated `--user-data-dir`.

Chrome extensions are usually not worth it for this:

- `chrome.tabs.captureVisibleTab` is “what’s on screen now” (harder to make deterministic, full-page capture is awkward, and mobile emulation is inconsistent).
- You’d be building and maintaining a custom product (permissions, updates, reliability).

If a repo doesn’t yet have screenshot tooling, create a decision + gap and proceed with placeholders until the tooling is in place.

## Minimal terminal recipe (repo-agnostic)

Assuming the app is running locally (e.g., at `http://localhost:3000`):

1) Install browsers (once per machine, cached):
   - `npx -y playwright@latest install chromium`
2) Capture snapshots:
   - `npx -y playwright@latest screenshot http://localhost:3000/ docs/ias/runs/YYYYMMDD-<run>/screenshots/home-desktop.png --viewport-size=1440,900 --full-page`
   - `npx -y playwright@latest screenshot http://localhost:3000/ docs/ias/runs/YYYYMMDD-<run>/screenshots/home-mobile.png --viewport-size=390,844 --full-page`

For complex flows (login, multi-step forms), prefer making the flow reproducible (seeded user + scripted login) and then use a Playwright script in the repo.

## Review expectations

UI/UX review should use screenshots to check:

- clarity of the next action (no confusion)
- critical path friction (too many steps, poor defaults)
- obvious visual regressions (layout breaks, overflow, unreadable text)
