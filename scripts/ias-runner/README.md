# IAS Runner (hybrid)

Production-oriented runner for IAS that can:

- run unattended loops using the Codex TypeScript SDK (preferred)
- support a manual/terminal workflow by printing the exact prompt used for a job

This runner is designed to be bootstrapped into a target repo. Transient state (locks, job metadata, queue) is stored under `.git/ias/runs/<run>/runner/` (naturally gitignored). Durable evidence (run-state, reviews) stays in `docs/ias/runs/<run>/`.

## Install

```bash
cd scripts/ias-runner
npm ci
```

Requires Node.js 18+.

Notes:

- `npm ci` is required for `cp-run-once` / `cp-run-loop` (SDK execution).
- `status` / `check` / `print-prompt` do not require the SDK dependency installed.

## Quickstart (recommended)

Inside the target repo:

```bash
./scripts/ias new-run <slug>
node scripts/ias-runner/run.mjs init --latest
node scripts/ias-runner/run.mjs cp-run-once --latest
```

Run continuously:

```bash
node scripts/ias-runner/run.mjs cp-run-loop
```

Run until no eligible control-plane jobs are available:

```bash
node scripts/ias-runner/run.mjs cp-run-loop --stop-when-idle
```

Stop the loop:

```bash
node scripts/ias-runner/run.mjs stop --latest
```

## Long-running (overnight)

Run the loop unattended, keep the machine awake, and tail a log:

```bash
LOG="/tmp/ias-runner-$(date +%Y%m%d-%H%M%S).log"
touch "$LOG"
caffeinate -dimsu nohup node scripts/ias-runner/run.mjs cp-run-loop >"$LOG" 2>&1 </dev/null &!
echo "runner started: $LOG"
# Monitor in this terminal (Ctrl+C to stop tail), or use a second tab:
tail -f "$LOG"
```

## Git automation (optional)

The runner can auto-branch, auto-commit, and auto-push after successful write jobs (and optionally open a GitHub PR via `gh`).

Configure under `.git/ias/runs/<run>/runner/config.json` -> `git`.

Notes:

- `git.pr.mode: "chain"` creates a sequence of small, stacked PR branches (e.g. `...-c001`, `...-c002`). If you enable auto-merge for chain mode, prefer `git.pr.merge.method: "merge"`; squash/rebase can rewrite history in ways that make stacked PR automation surprising.

Runner consistency check:

```bash
node scripts/ias-runner/run.mjs check --latest
```

## Manual/terminal fallback

If you want to run a job interactively in `codex` (TUI) instead of the SDK loop:

```bash
node scripts/ias-runner/run.mjs print-prompt --latest --job <job-id>
```

Paste the printed prompt into `codex` in the repo root.

## Control plane (HTTP/OpenAPI)

The runner can claim jobs from the IAS Console control plane (HTTP/OpenAPI) and execute them via the OpenAI Codex SDK.

Prereqs:

- Install deps: `(cd scripts/ias-runner && npm ci)`
- Configure the local worker config: `~/.ias/worker.json` (same config used by `scripts/ias-worker`)
  - `controlPlane.convexDeploymentUrl`
  - `controlPlane.workspaceSlug`
  - auth via one of:
    - per-developer device login: `node scripts/ias-worker/run.mjs auth-login` (stores token in `~/.ias/auth.json`)
    - automation/CI: `controlPlane.httpServiceToken`
  - `repos.mappings[]` allowlists `repoId`s for claiming jobs (required; runner will not claim jobs without it)

Commands:

- `node scripts/ias-runner/run.mjs cp-worker-heartbeat [--cp-config <file>] [--status online|offline|draining]`
- `node scripts/ias-runner/run.mjs cp-list-jobs [--cp-config <file>] [--status pending|running|done|failed|blocked|canceled]`
- `node scripts/ias-runner/run.mjs cp-openapi-url [--cp-config <file>]`
- `node scripts/ias-runner/run.mjs cp-run-once --latest|--run <YYYYMMDD-slug> [--cp-config <file>] [--lease-ms <ms>]`

Notes:

- `cp-run-once` executes a single eligible control-plane job (if available).
- Evidence reporting uses commit pointers; if the job produces uncommitted changes without creating a commit, it is marked `blocked`.
