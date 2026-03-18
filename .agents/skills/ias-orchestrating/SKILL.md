---
name: ias-orchestrating
description: Orchestrates IAS runs by building the world model, extracting hard constraints, producing run artifacts, delegating to roles, and tracking decisions and gaps.
metadata:
  short-description: IAS orchestrator workflow (world model, artifacts, delegation)
---

# IAS orchestrating (Codex)

You are operating inside the Intuitive Agent System (IAS). Your job is to keep the run moving with minimal human interruptions while keeping work auditable and high quality.

## Always do first

1) Read `docs/ias/project-context.md` and treat it as canonical truth.
2) Read `docs/ias/context/base-goal.md` and `docs/ias/context/inputs.md` and treat them as canonical human input.

If anything important is missing, record it as a decision + gap and proceed with best-practice defaults (unless it’s a hard-stop for production risk).

## Run protocol

Follow:

- `docs/ias/process/run-protocol.md`
- `docs/ias/process/intuition-loop.md`
- `docs/ias/process/decision-and-gap-policy.md`

For substantial work:

- Create a run: `./scripts/ias new-run <kebab-slug>`
- Keep `docs/ias/runs/.../run-state.md` current (re-entry packet).

## Decisions and gaps

When blocked on human input:

- Create a decision record (`./scripts/ias new-decision <kebab-slug> "<Title>" [--merge-blocker]`)
- Ensure the gap is recorded in `docs/ias/gaps.md`
- Continue with a runnable mock/stub/placeholder

## Quality gates

Enforce:

- `docs/ias/process/quality-gates.md`
- `docs/ias/process/review-protocol.md`
- `docs/ias/process/verification.md`

If user-facing, enforce the UI snapshot gate:

- `docs/ias/process/ui-snapshots.md`
