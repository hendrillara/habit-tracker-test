# Quality gates

These are default expectations for work produced by agents.

## Always

- No broken builds.
- Code changes are reviewable (small, clear diffs).
- Core logic is covered by automated tests where it makes sense.
- No known security holes introduced; no secrets committed.
- PR-style review happens and issues are iterated until “green enough”.
- UX clarity is explicitly reviewed for user-facing work (UI/UX role).
- For user-facing changes, UI snapshots are captured and reviewed (see `docs/ias/process/ui-snapshots.md`).

## Typically optional (unless context requires)

- Frontend end-to-end tests.
- Full accessibility pass.
