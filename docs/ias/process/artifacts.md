# Required artifacts

For non-trivial work, the orchestrator ensures these artifacts exist and are kept current.

## Always

- `docs/ias/context/` (human-curated Context Pack)
- `docs/ias/project-context.md`
- `docs/ias/gaps.md`

If the work is user-facing, the design package is recommended (and may be required by `design_gate` in `docs/ias/project-context.md`):

- `docs/ias/design/`

## Per run (recommended)

- `docs/ias/runs/YYYYMMDD-<run-name>.md` (from `docs/ias/templates/run-log.md`)
- Implementation plan (milestones): `docs/ias/templates/implementation-plan.md`
- UI snapshot plan + output (if user-facing; see `docs/ias/process/ui-snapshots.md`)

## Per change (as applicable)

- Acceptance criteria (use `docs/ias/templates/acceptance-criteria.md`)
- World model (use `docs/ias/templates/world-model.md`)
- Constraints taxonomy (use `docs/ias/templates/constraints-taxonomy.md`)
- Run plan / subgoals (use `docs/ias/templates/run-plan.md`)
- Research notes (use `docs/ias/templates/research-notes.md`)
- UI snapshot plan (use `docs/ias/templates/ui-snapshot-plan.md`)
- Persona pass checklist (use `docs/ias/templates/persona-passes.md`)
- Review checklist (use `docs/ias/templates/review-checklist.md`)
