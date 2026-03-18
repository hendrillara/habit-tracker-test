# IAS framework documentation architecture

This repo treats documentation as first-class artifacts. Canonical documentation is Markdown and should remain current.

In this workspace repo, the framework lives under `apps/ias-agent-framework/`; paths below assume an IAS-installed repo root (where these files live at `docs/ias/**`).

This folder documents the current deployable IAS framework scaffold and the documentation it installs into a target repository. It is implementation/reference documentation for the framework app, not the canonical workspace North Star.

In the Lucentive workspace, current product direction, preferred vocabulary, and target-state contracts live in the root `docs/target-state/` packet. That packet is not part of the default installed scaffold in client repos, so do not assume it exists after bootstrap.

Note: the IAS local runtime stores operational artifacts under `docs/ias/runs/` (JSON/JSONL, prompts, results). These are not “canonical docs”, and in client-safe (`--local-only`) deployments they are local-only by default (gitignored).

## Canonical docs (start here)

- `docs/ias/context/`: Human-curated input (“Context Pack”) for the project.
- `docs/ias/project-context.md`: Global world model + constraints + production status.
- `docs/ias/design/`: Repo-only design package for user-facing products (optional; see `docs/ias/process/design-workflow.md`).
- `docs/ias/gaps.md`: Open items that block completeness/merge, tracked explicitly.
- `docs/ias/decisions/`: Decision records (including “pending” human decisions).
- `docs/ias/process/`: Operating rules, quality gates, and agent workflows.
- `docs/ias/runs/`: Per-run logs (optional but recommended).

Note: some bootstrapped repos intentionally omit additional docs (see “Optional docs” below) to keep client/project installs minimal.

## Tool integrations

IAS is tooling-agnostic. Some docs in this folder describe the framework's current execution mechanics, including the local agent runtime, because those are still part of the deployable scaffold. Treat those details as current implementation reference, not the preferred long-term product model.

### Claude Code

IAS includes optional Claude Code configuration in `.claude/`:

- `.claude/agents/`: IAS role subagents (orchestrator, PM, UX, implementer, reviewer, test-runner).
- `.claude/skills/`: Claude compatibility wrappers and Claude-only skills.
- `.claude/commands/`: IAS slash commands (project scope).
- `.claude/settings.json`: Suggested permission + hook defaults (customize per repo).

Bootstrap IAS into another repository with:

- `ias install --guided` (recommended; includes a PR-first path when `origin` + `gh` auth are available)
- `ias install /path/to/repo` (wrapper around `bootstrap` + verification)
- `./scripts/ias bootstrap /path/to/repo` (lowest-level bootstrap script)

### Agent Skills

IAS keeps canonical shared skills under `.agents/skills/`. Codex discovers that path directly, and Claude uses `.claude/skills/` as a compatibility layer.

### OpenAI Codex CLI

Codex reads instructions from `AGENTS.md` and can be extended with MCP servers (configured in `~/.codex/config.toml`) and execpolicy rules (`~/.codex/rules/`).

## Optional docs (may not be installed)

Some documentation is intentionally excluded from client/project installs by default and is only included in “full” installs:

- `docs/ias/integrations/` (tooling notes; control-plane docs)
- `docs/ias/reference/` (explicitly non-canonical working notes)

## Conventions

- Prefer `kebab-case` for new filenames and directories; avoid spaces for new files.
- Keep docs and implementation in sync: changes to behavior should update docs.
- Never commit real secrets/keys; document required env vars and use placeholders.
