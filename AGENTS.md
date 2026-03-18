# Project repo using IAS (Intuitive Agent System)

This repository is a **project repo** that uses the **IAS Agent Framework** to run coding agents in a repo-first, auditable way.

Do **not** treat this repo as the IAS framework source repository. IAS is installed here as a scaffold under:

- `docs/ias/` (repo-first artifacts and templates)
- `scripts/ias` (helper CLI)
- Optional components depending on install profile:
  - `scripts/ias-runner/` (hybrid runner)
  - `scripts/ias-worker/` (control-plane worker)

## Canonical inputs (human-provided)

- Base goal: `docs/ias/context/base-goal.md`
- Project context + hard constraints: `docs/ias/project-context.md`
- Inputs/links: `docs/ias/context/inputs.md`

## Quick start

1) Fill the input contract above (replace `TODO`s).
2) Run: `./scripts/ias preflight`
3) Create a run: `./scripts/ias new-run <kebab-slug>`

## Skill layout

- Codex/shared skills live in `.agents/skills/`.
- Claude discovers project skills from `.claude/skills/`.
- When both exist, edit the canonical `.agents/skills/` skill and keep `.claude/skills/` wrappers thin.
- Keep top-level instructions short and push detail into `references/`, docs, or scripts.
- For concurrent implementation work, prefer separate git worktrees instead of a shared checkout.
