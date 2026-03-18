---
name: ias-screenshotting
description: Use when a user-facing IAS change needs repeatable desktop and mobile screenshot evidence from the run's UI snapshot plan.
---

# IAS screenshotting

## When to use

Use when:

- the change is user-facing and screenshots are a quality gate
- the UI/UX reviewer needs visual evidence without running the app

## How to run

1. Locate the active run directory under `docs/ias/runs/`.
2. Read `ui-snapshot-plan.md` and execute the commands listed there.
3. Save outputs to `docs/ias/runs/<run>/screenshots/`.

If the repo lacks tooling such as Playwright, log the gap and propose the smallest viable setup.
