# Human review gates (configurable)

IAS defaults to autonomy and “log + continue”, but some decisions are worth a human go/no-go. This file defines configurable human review gates.

## Configuration surface

Record required human gates in `docs/ias/project-context.md` (either as explicit fields or inside `ux_preferences`/constraints for now).

Examples:

- `design_human_review: required`
- `production: true` (implies stricter gates for risky data/behavior changes)

## Recommended default gates

Always human-review when the change is a one-way door and high impact, especially in production:

- destructive data migrations/backfills
- irreversible changes to data model semantics for live users
- operational changes that can cause downtime without rollback

Often human-review (context-dependent):

- brand/perceived-quality risk (e.g., consumer product in saturated market): require design package approval (`design_human_review: required`)
- vendor lock-in / cost commitments
- legal/compliance posture changes

Not usually a hard gate:

- missing secrets/keys (log decision + gap, proceed with mocks)

## Practical rule

If a human gate is required:

- create a decision record (`merge_blocker: true` if it blocks merging)
- proceed with parallelizable work where feasible (mocks, scaffolding, tests, docs)

