# Startup workflow (deploy + prerequisites)

IAS always starts from a local folder that is (or becomes) a git repository.

Goal: minimize human interaction while ensuring the agent has enough context to run safely and produce high-quality output.

## Prerequisites (machine)

- `git` installed
- a terminal agent runtime:
  - Claude Code, or
  - Codex CLI

Current framework note:

- Node.js 18+ (required for SDK-based runtime execution)

Optional:

- Node.js (common for web repos; needed for many toolchains)

## Prerequisites (repo)

- If the folder is not a git repo, IAS can initialize it (`./scripts/ias preflight --fix`).
- IAS scaffold must exist locally:
  - `docs/ias/` (at least: `project-context.md`, `gaps.md`, `context/`, `decisions/`, `runs/`)

## Minimal human-provided inputs (the “input contract”)

To start an autonomous run, the human should provide:

- Base goal (filled): `docs/ias/context/base-goal.md`
- World-model snapshot fields (filled enough): `docs/ias/project-context.md`
  - `production: true|false`
  - deployed version reference if production
  - `sensitive_data` (at least `none` or a short description)
  - non-negotiable constraints (hard constraints; at least one non-TODO bullet)

Strongly recommended (and required for production/brownfield runs by `preflight`):

- `docs/ias/context/inputs.md` should include at least one non-TODO bullet (links/notes to relevant docs).

Everything else can be discovered by the agent or logged as decisions/gaps.

## Quality gate: preflight

Before starting a substantial run, the orchestrator should run:

- `./scripts/ias preflight`

Note: After bootstrapping into a new repo, `preflight` is expected to fail until the human sets the new repo’s base goal and project context (it should not inherit goals from other projects).

In client-safe mode, `preflight` also checks that framework/IP files are not tracked by git (see `docs/ias/process/ip-boundary.md`).

## Suggested startup sequence

1) Bootstrap into a target repo:
   - internal repo: `./scripts/ias bootstrap /path/to/repo`
   - client repo: `./scripts/ias bootstrap /path/to/repo --local-only`
2) In the target repo:
   - `./scripts/ias preflight --fix`
   - `./scripts/ias new-run <slug>`
   - (optional) `./scripts/ias start-branch <slug>`
   - start the local agent runtime: `ias start`
3) Follow `docs/ias/process/run-protocol.md`.
