# Parallel work (optional)

IAS defaults to local-sequential execution, but parallel agents can increase throughput if coordinated. The primary risk is merge/edit conflicts and incoherent decisions.

## Runtime reality (Claude Code vs Codex CLI)

“Parallel” can mean two different things:

1) **Parallel reasoning / role separation** (multiple specialist contexts)
2) **Parallel code edits** (two processes editing files at the same time)

Claude Code can do (1) inside a single terminal/session by spawning subagents (skills/agents). Codex CLI, in our current assumptions, is (mostly) single-agent per terminal and therefore sequential unless you run multiple terminals.

IAS is designed to work in both modes by staying repo-first: regardless of runtime, role outputs land in the same auditable artifacts (acceptance criteria, plans, decisions, gaps).

## Safe defaults

- Prefer **sequential** unless the tasks are clearly separable.
- If running in parallel on one machine, enforce **file ownership**: two agents should not edit the same files.
- Coordinate via the run’s work allocation artifact.

## Recommended coordination pattern

1) Orchestrator creates a work allocation:
   - `docs/ias/runs/YYYYMMDD-<run>/work-allocation.md`
2) Assign each parallel agent:
   - a subgoal
   - explicit file/directory ownership
   - dependencies (what must land first)
3) Merge discipline:
   - If possible, use separate branches per workstream and merge/rebase in order.
   - If staying on one branch, serialize commits and re-run verification + review after each chunk.

## Claude Code: “parallel inside one terminal”

Recommended meaning of “parallel” with Claude Code:

- Use subagents to do parallel *analysis* (PM/UX/research/review) while the implementer is coding.
- Keep code edits effectively serialized to avoid conflicts (or strictly partition file ownership).
- The orchestrator is responsible for integrating outputs and keeping `docs/ias/*` coherent.

## Codex CLI: “single endless run”

For Codex CLI (current assumption):

- Run a single agent in one terminal as an “endless run”.
- Emulate “subagents” by doing explicit role passes sequentially using IAS templates.
- If you later want true parallelism, use multiple terminals with strict work allocation and file ownership.

## Common parallel splits (greenfield)

- Design system + UI scaffolding (Implementer A)
- Data model / backend stubs / mocks (Implementer B)
- Research (Researcher) + acceptance criteria tightening (PM) in parallel
- Verification setup (Test runner + Implementer) once code exists

## Coherence rule

Parallel work must not diverge on:

- base goal and acceptance criteria
- design system tokens/patterns
- core domain model semantics

If divergence is likely, run sequentially.
