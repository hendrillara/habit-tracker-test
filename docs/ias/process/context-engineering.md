# Context engineering (IAS)

IAS is only as autonomous as its **context flow**. This document defines how context is captured, kept small, and kept current so agents can run longer without constant human interrupts.

## Core idea: a “context flow engine”

Agents should not rely on chat history as the source of truth. The source of truth is the repo:

- **Human-curated Context Pack**: `docs/ias/context/`
- **Canonical world model snapshot**: `docs/ias/project-context.md`
- **Run-specific artifacts**: `docs/ias/runs/`
- **Decisions + gaps** (auditable, non-blocking): `docs/ias/decisions/` and `docs/ias/gaps.md`

The goal is simple: an agent can re-enter the repo at any time, load these files, and act safely.

## The one “full human” step: Context Pack curation

Every run starts from a repository and a base goal. The human’s main job is to create **order**:

- Put base intent in `docs/ias/context/base-goal.md`.
- Put supporting materials in `docs/ias/context/inputs.md` (links, PRDs, notes, client messages, constraints).
- Keep it curated: link out instead of pasting huge blobs; summarize long documents.

If context is missing, agents should proceed with best-practice defaults and record unknowns as decisions/gaps.

For brownfield repositories, the Context Pack should also point to the repo’s existing documentation (or note that it’s stale). See `docs/ias/process/brownfield-context.md`.

For user-facing greenfield work, keep “design intent” explicit in-repo via `docs/ias/design/` (see `docs/ias/process/design-workflow.md`).

## Handshake loop (especially for client work)

Before executing a non-trivial plan, the system should do a “handshake”:

1) Restate understanding: goal, scope, non-goals, assumptions, constraints.
2) Propose next actions and expected outcomes.
3) Ask the smallest set of follow-up questions required to proceed.
4) Iterate until there is a clear “yes”.

This reduces expectation mismatch and prevents “build the wrong thing quickly”.

## Progressive disclosure (avoid instruction bloat)

Keep the top-level instruction surfaces short and universal:

- `AGENTS.md` (Codex CLI) and `CLAUDE.md` (Claude Code) should stay small and stable.
- Put depth in `docs/ias/process/` and `docs/ias/templates/`.
- Put run-specific details in `docs/ias/runs/` and link to them.

Rule of thumb: if you’re about to paste a checklist into `CLAUDE.md`, don’t — add a process doc and link it.

## Context freshness (when to research)

Models are strong at world modeling, but can be stale. If a task depends on current/version-specific facts, engage the Researcher (and MCP if configured). See `docs/ias/process/rule-engine.md`.

## Self-improvement loop (repo as an organism)

After each substantial run, the Orchestrator must:

- Distill stable learnings into `docs/ias/project-context.md` (constraints, production status, preferences).
- Add/adjust minimal process rules in `docs/ias/process/` when a pattern repeats.
- Keep decisions/gaps accurate: resolve, close, or mark as explicit merge blockers.
- Avoid bloat: prefer short summaries + links, archive old run detail instead of expanding global docs.
