# Git + PR workflow (IAS)

IAS is repo-first and audit-first. Even when running locally and sequentially, changes should be **PR-shaped**: small, reviewable, and iterated via a reviewer pass until “green enough”.

This document defines a lightweight workflow that works on any git repo and optionally integrates with GitHub PRs when available.

## Defaults (MVP)

- Work on a **single working branch** at a time.
- Treat each “meaningful artifact” (milestone) as a PR-sized unit.
- Always run a PR-style review pass (even if you don’t open a GitHub PR yet).

## Branch naming

Recommended pattern:

- `ias/YYYYMMDD-<slug>`

Use `./scripts/ias start-branch <slug>` to create the branch consistently.

## PR-shaped iteration loop

1) **Start work**
   - Create a run: `./scripts/ias new-run <slug>`
   - Create a branch: `./scripts/ias start-branch <slug>`
2) **Implement**
   - Keep diffs small and focused.
   - Commit in logical chunks (avoid “wip soup”).
3) **Verify**
   - Run the repo’s standard checks (tests/build/lint/typecheck).
   - If no checks exist (greenfield), add minimal ones (see `docs/ias/process/greenfield-recipes.md`).
4) **Review**
   - Run the Reviewer role and record the outcome in the run’s review checklist.
   - Iterate until P0/P1 are resolved (see `docs/ias/process/review-protocol.md`).
   - Ensure the human decision inbox is addressed (`./scripts/ias inbox`), and merge blockers are resolved (`./scripts/ias check`).
5) **Optionally open a GitHub PR**
   - If `gh` is available and repo is on GitHub, open a PR from the branch.
   - Otherwise, treat the branch review as the PR and merge locally when ready.

If you are using the local runtime with SDK execution, you can optionally enable git automation (auto-branch, auto-commit, auto-push, and optional `gh` PR creation) via runtime config.

## Local runtime: multiple PRs + self-review (recommended)

If you want IAS to open **multiple PRs over a run** (instead of one big PR), use one of these modes:

- `milestone`: one PR per milestone (derived from `current_milestone` in `run-state.md`)
- `chain`: many small PRs in sequence (PR N targets PR N-1’s branch), rotated automatically after N write jobs

Example runtime config:

```json
{
  "git": {
    "enabled": true,
    "autoCommit": true,
    "autoPush": true,
    "pr": {
      "auto": true,
      "draft": true,
      "base": "main",
      "mode": "chain",
      "chain": { "rotateAfterWriteJobs": 5 },
      "review": {
        "auto": true,
        "role": "reviewer",
        "loop": { "enabled": true, "maxCycles": 3, "fixRole": "implementer" }
      },
      "merge": { "auto": true, "method": "merge", "waitForChecks": true }
    }
  }
}
```

Notes:

- `chain` mode yields “regular PRs” even within the same milestone, without requiring merges between PRs. Merge in order (PR1 → PR2 → PR3) when ready.
- If you enable auto-merge in `chain` mode, use `"method": "merge"` (squash/rebase requires extra rebase/retargeting logic).
- `milestone` mode works best when milestones are merged in order (M1 merged before starting M2). If you advance milestones without merging, later PRs may include earlier work depending on branch ancestry.

## “PR review agent” in practice

Claude Code:

- Use the `ias-reviewer` subagent for the review pass.

Codex CLI:

- Prompt for a reviewer pass explicitly and structure it with `docs/ias/templates/review-checklist.md`.

The reviewer should be read-only and should not “fix” issues directly; it should request changes, and the implementer should address them.

In SDK execution mode, you can enable an automatic review loop (`git.pr.review.loop`) so the runtime repeatedly enqueues:

- reviewer → (request changes) → implementer fix → reviewer → … (until approve or max cycles)

## Merge discipline

- Don’t merge with unresolved merge blockers (`./scripts/ias check` must pass).
- If a decision/gap remains, it must be explicitly marked as non-blocking or deferred with rationale.
