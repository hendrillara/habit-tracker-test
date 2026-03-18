# Process

This directory defines how agents operate inside this repo.

This directory is implementation-reference material for the current framework mechanics. In the Lucentive workspace, pair it with the root `docs/target-state/` packet for active product direction and migration work. In installed repos, treat this directory as the local implementation contract unless upstream framework docs say otherwise.

- `docs/ias/process/quality-gates.md`: What “good” means before merge.
- `docs/ias/process/roles.md`: Default agent personas and responsibilities.
- `docs/ias/process/decision-and-gap-policy.md`: How to proceed without blocking on humans.
- `docs/ias/process/intuition-loop.md`: The canonical “Niklas-style” problem-solving loop.
- `docs/ias/process/context-engineering.md`: How context stays small, current, and auditable.
- `docs/ias/process/brownfield-context.md`: How to adopt and improve existing repo context.
- `docs/ias/process/git-pr-workflow.md`: How to run PR-shaped work locally (and on GitHub).
- `docs/ias/process/verification.md`: How tests/build/lint/typecheck are handled.
- `docs/ias/process/greenfield-recipes.md`: Default stacks and baseline expectations for greenfield.
- `docs/ias/process/design-workflow.md`: Repo-only design-first workflow for user-facing greenfield.
- `docs/ias/process/ui-hygiene.md`: Universal UI coherence baseline.
- `docs/ias/process/human-review-gates.md`: Configurable human go/no-go gates.
- `docs/ias/process/parallel-work.md`: How to coordinate parallel agents safely.
- `docs/ias/process/ip-boundary.md`: What not to commit in client repos.
- `docs/ias/process/startup.md`: Prerequisites, minimal human input, and preflight gate.
- `docs/ias/process/reentry.md`: How to resume after context resets.
- `docs/ias/process/artifacts.md`: Required artifacts for a run/PR.
- `docs/ias/process/review-protocol.md`: How review cycles run until “green enough”.
- `docs/ias/process/run-protocol.md`: The current end-to-end run sequence (local, sequential).
- `docs/ias/process/rule-engine.md`: Deterministic rules (when to research, when to escalate, etc.).
- `docs/ias/process/ui-snapshots.md`: Screenshot quality gate for user-facing work.
- `docs/ias/process/deploying.md`: How to bootstrap IAS into any repository (including client-safe local-only mode).
- `docs/ias/process/global-cli.md`: Internal global CLI install + local agent commands (GitHub Packages).
- `docs/ias/process/cli-output.md`: Output flags + non-TTY behavior contract (`--json`, `--color`, `NO_COLOR`, `IAS_FORMAT`).
- `docs/ias/process/releasing-ias-cli.md`: Release checklist + required real E2E smoke gate for publishing `@lucentivelabs/ias`.
- `docs/ias/process/runner.md`: Legacy Codex SDK runtime reference. The runtime is now unified under `ias start`.
- `docs/ias/integrations/`: Optional Claude Code / Agent SDK integration guidance.
