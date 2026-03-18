# Run protocol (local, sequential)

This protocol is optimized for running locally on a Mac with coding agents, with minimal human interruption and strong auditability in Git.

Default runtime note:

- The IAS product North Star is one governed local runtime plus a thin control plane.
- For legacy Codex SDK runtime details, see `docs/ias/process/runner.md`.
- If you’re running in a Claude cloud environment, use the terminal-only workflow.

## 0) Start condition

- If you just bootstrapped IAS (install-only), initialize the repo context first:
  - `./scripts/ias init-context` (fills base goal + constraints + inputs)
- Run `./scripts/ias preflight` (use `--fix` to initialize git if needed).
- Ensure the human-curated Context Pack exists and is up to date:
  - `docs/ias/context/README.md`
  - `docs/ias/context/base-goal.md`
  - `docs/ias/context/inputs.md`
- Ensure `docs/ias/project-context.md` is accurate (especially `production` and `deployed_version_ref` if applicable).
- Decide whether the run targets:
  - greenfield product/work
  - brownfield repo work
  - process/org work (docs + rollout plans)

If this will be a long-running session, keep a re-entry point current:

- `docs/ias/process/reentry.md`
- Maintain `docs/ias/runs/.../run-state.md` and use `./scripts/ias resume` after context resets.

If `engagement_type: brownfield`, do a quick context audit early:

- Create `docs/ias/runs/YYYYMMDD-<run>/context-audit.md` (from `docs/ias/templates/context-audit.md`)
- Follow `docs/ias/process/brownfield-context.md`

## 1) Intake

Create a run log:

- `docs/ias/runs/YYYYMMDD-<run-name>.md` using `docs/ias/templates/run-log.md`

Capture the base input in the run log or link a separate intake doc using:

- `docs/ias/templates/intake.md`

If there is an external stakeholder (client, internal requester), do a quick “handshake” pass:

- Restate the goal + scope + assumptions.
- Ask only the minimum clarifying questions needed to proceed.

Create a milestone-based implementation plan:

- `docs/ias/templates/implementation-plan.md`

If the work is user-facing and greenfield, initialize a repo-only design package:

- `./scripts/ias init-design`
- Follow `docs/ias/process/design-workflow.md`

If running multiple agents in parallel, create a work allocation:

- `docs/ias/templates/work-allocation.md`
- Follow `docs/ias/process/parallel-work.md`

## 2) Model and constrain (the “intuition loop” setup)

For non-trivial work, produce these artifacts before implementation:

- Acceptance criteria: `docs/ias/templates/acceptance-criteria.md`
- World model: `docs/ias/templates/world-model.md`
- Constraints taxonomy: `docs/ias/templates/constraints-taxonomy.md`
- Run plan: `docs/ias/templates/run-plan.md`

Guidance:

- Treat hard constraints as ground truth.
- Everything else is a hypothesis: document as assumptions/unknowns.

## 3) Delegate to roles (sequential by default)

Execute roles in this order unless context suggests otherwise:

0) Researcher (if external/current context is needed; see `docs/ias/process/rule-engine.md`)
1) PM / value owner (tighten outcomes, acceptance criteria)
2) UI/UX reviewer (clarity + critical-path polish guidance)
3) Implementer (code + tests for core logic)
3.5) UI snapshots (if user-facing; see `docs/ias/process/ui-snapshots.md`)
4) Reviewer (PR-style review + iteration until “green enough”)
5) Orchestrator (final holistic “does this make sense?” check)

Notes on runtime:

- Claude Code can spawn subagents within one terminal/session. Use this to separate role contexts while keeping repo artifacts as the source of truth.
- Codex CLI (single terminal assumption) should run these role passes sequentially, using the templates as structured prompts.

## 4) Decisions and gaps (keep running)

If anything would normally require human input:

- Log a decision in `docs/ias/decisions/`
- Add a gap entry in `docs/ias/gaps.md`
- Continue with mocks/stubs/placeholders so the system remains runnable

Hard-stops are reserved primarily for production risk (see `docs/ias/process/decision-and-gap-policy.md`).

## 5) Pre-finish quality passes

Before calling the run “done”, complete:

- Persona passes: `docs/ias/templates/persona-passes.md`
- Review checklist: `docs/ias/templates/review-checklist.md`

## 6) Finish criteria

The outcome is “production-ready for the context” when:

- core acceptance criteria is met
- build is not broken
- meaningful tests exist for core logic
- P0/P1 issues are resolved or explicitly logged as non-blocking
- gaps/decisions are either resolved or explicitly marked (and merge blockers are resolved)

## 7) Distill and prune (keep context healthy)

Before closing a substantial run:

- Update `docs/ias/project-context.md` with any stable new constraints/preferences.
- Ensure `docs/ias/gaps.md` and `docs/ias/decisions/` reflect current reality.
- Keep global docs concise; link to run artifacts instead of copying content.
