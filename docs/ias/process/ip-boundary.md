# IP boundary: framework vs project artifacts

When deploying IAS into client brownfield repositories, we often must not commit the **generic agent framework** (our IP) into the client’s git history. At the same time, we still want to commit **project-specific artifacts** (decisions, gaps, context) because they improve delivery quality and auditability.

## Two layers

### 1) IAS framework (generic, reusable) — do not commit to client repos

Examples:

- IAS process docs and templates (generic instructions)
- `.agents/` shared Agent Skills (canonical cross-client skill source)
- `.claude/` subagents/skills/commands configuration
- `scripts/ias` helper CLI
- `scripts/ias-runner/` Codex SDK runtime + its dependencies
- generic operating instructions (`AGENTS.md`, `CLAUDE.md`)
- shared MCP config (`.mcp.json`)
- runtime telemetry under `docs/ias/runs/` (prompts, JSONL events, job artifacts)

These can exist locally on the developer machine inside the client repo, but should be gitignored for IP protection.

### 2) IAS project artifacts (client/project-specific) — safe to commit

These are tied to the engagement and become part of the project’s delivery record:

- `docs/ias/project-context.md` (production status, constraints, preferences for this project)
- `docs/ias/context/` (ordered inputs: goal, PRD links, constraints)
- `docs/ias/gaps.md` (known gaps and deferrals)
- `docs/ias/decisions/` (pending/resolved decisions)
- `docs/ias/runs/` (run logs and artifacts; commit if useful)
- `docs/ias/design/` (Markdown design package; assets can remain local-only)

Notes:

- In client-safe mode, runtime telemetry under `docs/ias/runs/` is treated as framework/telemetry by default and is gitignored, even though it lives under `docs/ias/runs/`.
- If a client explicitly wants runtime telemetry committed for audit, treat it as an opt-in exception and document it in `docs/ias/project-context.md` (and adjust `.gitignore` accordingly).

## How to enforce this split

Use client-safe bootstrap:

- `./scripts/ias bootstrap /path/to/target-repo --local-only`

This appends `.gitignore` rules that ignore the framework while allowlisting the artifact paths above (so decisions/gaps/context remain committable).

If a project wants a different boundary, encode it in the repo’s `.gitignore` and `docs/ias/project-context.md`.
