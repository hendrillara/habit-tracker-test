# Decision records

Decision records are lightweight, auditable notes for important choices and for “pending” human input.

## File naming

- `docs/ias/decisions/YYYYMMDD-####-short-title.md`

## Status

Each decision must include one of:

- `status: pending`
- `status: accepted`
- `status: rejected`
- `status: superseded`

If `status: pending`, state whether it is a merge blocker.

## Template

Use `docs/ias/templates/decision-record.md`.

