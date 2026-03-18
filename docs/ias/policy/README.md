# Git Policy (repo-first)

IAS follows a **repo-first** git strategy:

- Prefer existing repo conventions when they exist.
- Otherwise default to a lightweight GitHub-flow style (branch from base branch, PR, merge).

This folder contains the in-repo policy file that the IAS local runtime reads:

- `docs/ias/policy/git.json`

## Precedence (when multiple sources exist)

Highest priority wins:

1) Job payload overrides (Console enqueue / CLI flags)
2) Local runtime config overrides (optional)
3) In-repo policy (`docs/ias/policy/git.json`)
4) Console repo settings (if repo policy is absent or set to `auto`)
5) Heuristics (best-effort detection from the repo itself)

## Why this exists

IAS often runs in **heterogeneous repositories**. Some have strict naming conventions, branching rules, and PR policies; others have none. This policy file makes the effective behavior explicit and auditable (via PRs).

## Schema (v1)

See `docs/ias/policy/git.json`. Fields are intentionally small:

- `baseBranch`: `"auto"` or a concrete branch name (`"main"`, `"develop"`, ...)
- `branchPrefix`: `"auto"` or a concrete prefix (examples: `"ias/"`, `"feature/ias/"`)
- `pr`: default behavior (draft, auto-merge, merge method, delete-branch)
