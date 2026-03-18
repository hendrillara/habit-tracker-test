# IAS in a project repo

This is a **project repository using IAS** (not the IAS framework source repo).

## Start here (canonical)

1) `docs/ias/project-context.md`
2) `docs/ias/context/base-goal.md`
3) `docs/ias/context/inputs.md`
4) Current run artifacts under `docs/ias/runs/` (if any)

## Commands

- `./scripts/ias preflight`
- `./scripts/ias new-run <kebab-slug>`
- `./scripts/ias inbox`

## Skill layout

- Canonical shared skills live in `.agents/skills/`.
- Claude compatibility wrappers live in `.claude/skills/`.
- Keep top-level skill files concise and use `references/` for detailed procedures.
- For concurrent implementation work, use separate git worktrees rather than sharing a checkout.
