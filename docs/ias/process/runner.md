# Hybrid mode (current framework implementation)

> **Terminology note (March 2026):** This document uses legacy terminology (`runner`, `worker`, `hybrid`) extensively. These terms are superseded by the local-agent-first model. See `docs/ias/design/vocabulary-mapping.md` for the current-to-target term mapping. Full terminology cleanup is tracked in LUC-16. Do not use this document as vocabulary guidance for new work.

This page documents the current framework hybrid runner. It is implementation-reference material, not the IAS product North Star.

When running IAS with GPT via OpenAI Codex in the current framework, the default execution mode is **hybrid**:

- a **runner loop** that executes queued, bounded turns using the **Codex TypeScript SDK**
- a **terminal/manual fallback** (Codex CLI) for interactive work and recovery

The key IAS design principle still holds:

- The repo is the source of truth (`docs/ias/*`), not chat history.

## What “hybrid” means

- **Interactive mode (terminal):** humans run `codex` or Claude Code, follow `docs/ias/process/run-protocol.md`, and write artifacts.
- **Runner mode (SDK):** a daemon-like process:
  - reads IAS re-entry context from the repo
  - pops a job from a queue
  - runs one bounded Codex turn
  - stores logs/results back into the repo
  - enqueues follow-up jobs

## When you can’t run the runner

- **Terminal-only (local):** run IAS with Codex CLI or Claude Code and follow `docs/ias/process/run-protocol.md`.
- **Cloud (Claude/“Cloud Garden”):** use the terminal-only workflow; the OpenAI Codex SDK runner is not available there.

## Where runner state lives

Runner state is stored per run:

- `.git/ias/runs/<run>/runner/queue/{pending,running,done,failed}/`
- `.git/ias/runs/<run>/runner/jobs/<job-id>/` (prompt, JSONL events, results)
- `.git/ias/runs/<run>/runner/config.json` (defaults)
- `.git/ias/runs/<run>/runner/lock.json` (process lock while runner is active)

This keeps everything auditable and allows clean re-entry.

Note: `--latest` selects the most recently updated run (based on `.git/ias/runs/<run>/runner/state.json` when present).

Client-safe note:

- Runner transient state lives under `.git/ias/runs/` (naturally gitignored). Durable evidence (run-state.md, reviews/) stays in `docs/ias/runs/`.

## Setup (hybrid)

1) Create a run:

- `./scripts/ias new-run <slug>`

2) Install the runner dependencies (once per repo checkout):

- `cd scripts/ias-runner && npm ci`

3) Initialize runner directories for the run:

- `node scripts/ias-runner/run.mjs init --latest`

Note: `npm install` is required only for SDK execution (`run-once` / `run-loop`). Commands like `status`, `recover`, `check`, and `print-prompt` can run without it.

## Queue workflow (recommended)

Enqueue a job:

- `node scripts/ias-runner/run.mjs enqueue --latest --role orchestrator --prompt "Propose the next best milestone"`

Run one job:

- `node scripts/ias-runner/run.mjs run-once --latest`

Run continuously:

- `node scripts/ias-runner/run.mjs run-loop --latest`

Run until the queue is empty (“finished”):

- `node scripts/ias-runner/run.mjs run-loop --latest --stop-when-idle`

Stop:

- `node scripts/ias-runner/run.mjs stop --latest`

Status (includes lock info):

- `node scripts/ias-runner/run.mjs status --latest`
- Watch mode (opt-in, TTY-only):
  - `node scripts/ias-runner/run.mjs status --latest --watch`

Recover stuck jobs (after crashes):

- `node scripts/ias-runner/run.mjs recover --latest`

Retry failed jobs (after transient failures):

- `node scripts/ias-runner/run.mjs retry-failed --latest`

Runner consistency check (recommended before merge):

- `node scripts/ias-runner/run.mjs check --latest`
- `./scripts/ias check-runner` (defaults to `--latest`)

This check enforces that `run-state.md` is updated during write-capable jobs (so “resume here” stays reliable).

## Manual/terminal fallback

If you want to run a queued job interactively in `codex`:

1) Print the exact prompt used for a job:
   - `node scripts/ias-runner/run.mjs print-prompt --latest --job <job-id>`
2) Paste into an interactive `codex` session in the repo root.

## Safety defaults

- Runner defaults to `approvalPolicy: never`.
- Role-based sandboxing:
  - `reviewer` / `pm` / `ux`: `read-only`
  - `implementer` / `orchestrator` / `test-runner`: `workspace-write`
  - `researcher`: `read-only` with network + web search enabled

Tune defaults per run via `.git/ias/runs/<run>/runner/config.json`.

Note: You can explicitly allow writes for a queued job by passing `--write` to `enqueue` (useful for doc-only work in `pm`/`ux`).

## Model selection

The runner chooses a model per job in this order:

- `IAS_MODEL` env var (if set)
- `.git/ias/runs/<run>/runner/config.json` → `model` (default: `gpt-5.2`)
- fallbacks from `IAS_MODEL_FALLBACKS` (comma-separated) and `config.json` → `modelFallbacks`
- built-in safety fallback: `gpt-5.1`

Operational note: If you see a model error like “not supported when using Codex with a ChatGPT account”, prefer non-`-max` models (e.g. `IAS_MODEL=gpt-5.2`).

## Timeouts and retries

- Each queued job is a **bounded** Codex turn; the runner enforces `maxTurnMs` per job (default: 30 minutes).
- If a job hits `maxTurnMs` or encounters a transient backend/network failure, the runner will **requeue it automatically** (bounded by `config.json` → `retry.maxAttempts`), using `notBeforeMs` to avoid hot loops.
- If a job is already in `queue/failed/`, use `retry-failed` to requeue it.

## Visible progress (recommended)

See `docs/ias/process/cli-output.md` for the output contract.

The runner prints a small set of consistent, prefixed human lines in `run-loop` (lock acquisition/release, recovered jobs, stop/idle states).

## Runner idempotency notes

- Decision creation is idempotent by decision slug: if a matching decision file already exists, the runner will not create a duplicate (it will only ensure the corresponding gap line exists).

## Git automation (optional)

The runner can optionally manage git in the working repository:

- Ensure you’re on a run branch (default: `ias/<run>`)
- Auto-commit after successful write jobs
- Auto-push to `origin`
- Optional GitHub PR creation via `gh`

Configure under `.git/ias/runs/<run>/runner/config.json` → `git`.

Note: if `git.branch.base` / `git.pr.base` does not exist in the repo, the runner will fall back to `origin/HEAD`’s default branch.

### Multiple PRs (by milestone)

If `git.pr.mode` is set to `milestone`, the runner derives the desired branch name from `docs/ias/runs/<run>/run-state.md` → `current_milestone`:

- `M1` → `ias/<run>-m1`
- `M2` → `ias/<run>-m2`

This yields multiple PRs over the run (one per milestone), instead of a single ever-growing PR.

If `git.pr.review.auto` is enabled, the runner will enqueue reviewer jobs automatically after write-capable jobs. Reviewer outputs are persisted under `docs/ias/runs/<run>/reviews/`.

#### Iterative PR review loop (recommended)

If `git.pr.review.loop.enabled` is enabled, the runner will keep the system moving without human intervention by automatically iterating:

- reviewer → (request changes) → implementer fix → reviewer → … (until approve or `maxCycles`)

The reviewer stays read-only; the fix work happens in a separate write-capable job on the PR’s head branch.

#### Auto-merge (optional)

If `git.pr.merge.auto` is enabled, the runner will auto-merge PRs after an `approve` review decision:

- It marks draft PRs as “ready for review”
- It merges via `gh pr merge` (optionally `--auto` to wait for checks)
- In `chain` mode, it merges sequentially (C001 must be merged before C002, etc.)

Note: In `chain` mode, prefer `"method": "merge"`; squash/rebase merges require extra rebase/retargeting logic for downstream chain branches.

Note: GitHub does not allow you to “approve” or “request changes” on your own PR. If the runner is authenticated as the same GitHub user that created the PR, it will fall back to posting the review as a PR comment (and still continue the internal review→fix loop). For true GitHub approvals as a quality gate, use a separate GitHub identity/token for the reviewer/merger.

### Multiple PRs (PR chain)

If `git.pr.mode` is set to `chain`, the runner will:

- work on branches like `ias/<run>-c001`, `ias/<run>-c002`, ...
- open a PR for each branch
- rotate to a new branch automatically after `git.pr.chain.rotateAfterWriteJobs` write-capable jobs
- set PR base to the previous chain branch (so PRs stay small and mergeable in order)

## Long-running (overnight) runs

If you want to run unattended for hours, run the loop in the background, keep the machine awake, and tail a log:

- Start:
  - `LOG="/tmp/ias-runner-$(date +%Y%m%d-%H%M%S).log"; touch "$LOG"; caffeinate -dimsu nohup node scripts/ias-runner/run.mjs run-loop --latest >"$LOG" 2>&1 </dev/null &!; echo "runner started: $LOG"`
- Monitor:
  - `tail -f /tmp/ias-runner-*.log` (this is foreground; use a second terminal tab/window)
- Stop cleanly:
  - `node scripts/ias-runner/run.mjs stop --latest`
- Recover after crashes:
  - `node scripts/ias-runner/run.mjs recover --latest`
