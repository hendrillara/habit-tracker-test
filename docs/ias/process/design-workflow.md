# Design-first workflow (repo-only)

For greenfield, user-facing products, IAS should default to **design-first**: establish the design system and key screens before deep implementation. This reduces churn and improves perceived quality.

This workflow is repo-only: Markdown + (optional) local screenshots.

## Config (per project)

Set these in `docs/ias/project-context.md`:

- `design_gate`: `required` | `optional` (design package completeness gate)
- `design_human_review`: `required` | `optional` (whether a human must review/approve the design package before deep UI work)
- `ui_snapshots_commit`: `true` | `false`

Defaults:

- `design_gate: optional` (safe for speed-to-learning)
- `design_human_review: optional` (opt-in when brand/perceived-quality risk is high)
- `ui_snapshots_commit: false` (local-agent review by default; force-add images when needed)

## Design package (Milestone 0)

Create a “design package” in `docs/ias/design/`:

- `docs/ias/design/brief.md` (product vibe, positioning, trust cues, UI tone)
- `docs/ias/design/system.md` (tokens + components + layout rules)
- `docs/ias/design/flows.md` (1–3 critical user flows)
- `docs/ias/design/screens.md` (screen list + acceptance checks per screen)

Use `./scripts/ias init-design` to scaffold these files from templates.

## Gate behavior

There are two separate questions:

1) **Should the design package exist (and be minimally filled) before deep UI work?** (`design_gate`)
2) **Does a human need to approve that design package?** (`design_human_review`)

### Design package gate (`design_gate`)

If `design_gate: required` and the work is user-facing:

- Do not claim “implementation complete” without a minimally filled design package and initial UI snapshots for the critical screens.

If `design_gate: optional`:

- Create the design package early, but allow implementation to proceed in parallel.

### Human design review gate (`design_human_review`)

If `design_human_review: required` and the work is user-facing:

- The orchestrator must request a human “go/no-go” on the design package before investing in deep UI build-out.
- While waiting, agents may proceed with parallelizable, low-regret work (repo scaffolding, data model stubs, mocks, infra setup) if it does not lock in UI decisions.

If `design_human_review: optional`:

- Treat design review as agent-owned unless the context indicates high brand/perceived-quality risk.

## How to produce “design” without Figma

1) Draft the design package Markdown (brief/system/flows/screens).
2) Implement a minimal design system (tokens + primitives) in code.
3) Build static screens with mock data.
4) Capture UI snapshots for desktop + mobile.

This keeps design decisions explicit and makes them reviewable.

## Screenshots policy (repo-first, but not always committed)

UI snapshots are still required for user-facing work, but they do not have to be committed by default.

- Default: store under `docs/ias/runs/.../screenshots/` and keep local.
- If humans need to review without running the app, force-add selected screenshots:
  - `git add -f docs/ias/runs/.../screenshots/*.png`

See `docs/ias/process/ui-snapshots.md`.
