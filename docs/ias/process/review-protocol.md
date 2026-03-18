# Review protocol (PR-style)

Goal: iterate until “green enough” for the context, with minimal wasted loops.

## Cycle

1) Reviewer produces a structured review (use `docs/ias/templates/review-checklist.md`).
2) Implementer fixes issues or explicitly rejects with rationale.
3) Repeat until:
   - no P0/P1 issues remain
   - core logic tests are present where meaningful
   - build is not broken
   - unresolved gaps/decisions are explicitly recorded (and merge blockers resolved)

## Pragmatic review policy

- Prefer shipping: approve when there are no P0 issues and only minor P1 items.
- Put “nice-to-have” feedback into P2 and do not block on it.
- Only request changes for material correctness/security/build/UX issues that would be painful to fix later.

## Severity levels (suggested)

- P0: must fix before merge (correctness, security, data loss, broken build)
- P1: should fix before merge (maintainability, major UX clarity issues)
- P2: can defer (nice-to-have improvements)
