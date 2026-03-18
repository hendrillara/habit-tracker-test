# Deploying IAS into any repository (local Mac workflow)

IAS is designed to be “dropped into” an arbitrary git repository (greenfield or brownfield) and then used by coding agents to execute a goal end-to-end.

## 1) Bootstrap (copy IAS scaffold into the target repo)

From this repository, run:

- `./scripts/ias bootstrap /path/to/target-repo`
  - For client repos / IP protection: `./scripts/ias bootstrap /path/to/target-repo --local-only`
  - If you add `--commit`/`--push`/`--pr`, IAS requires the repo to be clean of **tracked** changes, but it will not fail just because you have untracked “noise” (e.g. `.DS_Store`, `.idea/`).
  - `--commit` stages and commits only IAS-owned paths (it does not `git add -A` the whole repo).

If you have the internal global CLI installed, you can run the same bootstrap from anywhere:

- `ias bootstrap /path/to/target-repo`

This copies into the target repository:

- `docs/ias/` (canonical IAS docs, templates, process)
- `scripts/ias` (local helper CLI)
- `scripts/ias-runner/` (Codex SDK runtime)
- `AGENTS.md` and `CLAUDE.md` (agent operating protocol)
- `.agents/` (canonical shared Agent Skills)
- `.claude/` (optional Claude Code integration: agents/skills/commands/settings)

Use `--force` to overwrite existing IAS files in the target repo.

## Install reliability (Console-driven)

When IAS is installed via the IAS Console runtime (`install_ias` job), git-related failures during bootstrap/commit/push may be converted into a follow-up `git_repair` job: IAS captures the error + `git status` and lets an AI attempt a safe fix, then retries the install once.

## Upgrading an existing IAS install

If you run `bootstrap` with `--force` in a repo that already has IAS, the bootstrapper preserves project artifacts under `docs/ias/`:

- `docs/ias/project-context.md`
- `docs/ias/gaps.md`
- `docs/ias/context/`
- `docs/ias/decisions/`
- `docs/ias/runs/`
- `docs/ias/design/`

For a fresh bootstrap (no existing `docs/ias/`), IAS intentionally resets project artifacts (e.g., `gaps.md`, `context/inputs.md`, `decisions/`, `runs/`, `design/`) to blank scaffolds so the IAS home repo cannot “leak” prior project state into a new target repo.

### Local-only mode (client-safe)

If you pass `--local-only`, IAS will also append ignore rules to the target repo’s `.gitignore` so the IAS framework files are not committed.

Tradeoffs:

- Pros: your generic agent framework/IP does not land in the client’s git history.
- Pros: project artifacts remain committable/auditable in the client repo (decisions, gaps, run logs, project context).
- Cons: each developer machine must bootstrap locally to get the runtime files (scripts, `.claude/`, templates/process docs).
  - This includes `.agents/skills/` for Codex/shared skill usage.

### What is “framework” vs “artifact”?

In local-only mode, the target repo will ignore the generic framework (IP) but allow committing these artifacts under `docs/ias/`:

- `docs/ias/project-context.md`
- `docs/ias/gaps.md`
- `docs/ias/context/`
- `docs/ias/decisions/`
- `docs/ias/runs/`
- `docs/ias/design/` (Markdown; assets are typically local-only)

Runtime telemetry note:

- The local runtime stores operational telemetry under `docs/ias/runs/` (prompts, JSONL events, job artifacts). In local-only mode this telemetry is treated as framework/telemetry by default and is gitignored, even though it lives under `docs/ias/runs/`.

### Client-safe validation checklist

After bootstrapping with `--local-only`, sanity-check:

- `git status` shows no tracked framework files (`.claude/`, `scripts/ias`, `scripts/ias-runner/`, `docs/ias/process/`, `docs/ias/templates/`, etc.).
- `docs/ias/project-context.md` and `docs/ias/context/base-goal.md` are target-specific (not inherited from another repo).
- Runtime telemetry under `docs/ias/runs/` stays untracked unless you explicitly opt in.

## 2) Set the world model for the target repo

In the target repo, update:

- `docs/ias/project-context.md`
- `docs/ias/context/` (human-curated Context Pack)

Minimum required fields to set correctly:

- `production` and `deployed_version_ref`
- `sensitive_data` (at least `none` or a short description)
- non-negotiable constraints
- stakeholders + success criteria

For production/brownfield runs, also add at least one real link/note to `docs/ias/context/inputs.md` (tickets/PRDs/architecture notes).

If the target repo is brownfield and already has docs/instructions, run a short “context audit” and decide what to adopt vs improve:

- `docs/ias/process/brownfield-context.md`

## 3) Intake a base goal and start a run

In the target repo:

- `./scripts/ias new-run <kebab-slug>`

Fill the generated artifacts under:

- `docs/ias/runs/YYYYMMDD-<slug>/`

Follow:

- `docs/ias/process/run-protocol.md`

## 4) Operate with minimal human interruption

When required input is missing:

- record a pending decision in `docs/ias/decisions/`
- record a corresponding gap in `docs/ias/gaps.md`
- proceed with mocks/stubs/placeholders so the system remains runnable

## 5) Finish criteria

Use:

- `docs/ias/process/quality-gates.md`
- `docs/ias/process/review-protocol.md`

The default “done” condition is: acceptance criteria met, build is not broken, meaningful core-logic tests exist, no unresolved merge blockers, and any deferred gaps are explicitly logged.
