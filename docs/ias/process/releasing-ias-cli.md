# Releasing the IAS CLI (`@lucentivelabs/ias`)

This repo publishes the deployable IAS framework + global CLI as `@lucentivelabs/ias` (GitHub Packages).

Releases are **high risk**: the IAS framework + control-plane integration is operationally critical. This document defines the **required release gates**.

Decision record (distribution): `apps/ias-agent-framework/docs/ias/decisions/20251230-0001-github-packages-distribution.md`.

## Automated gates (must be green)

From the repo root:

- Framework: `cd apps/ias-agent-framework && npm test`
- Console (protocol compatibility): `cd apps/ias-console && npm run check && npm test`

Do not publish if any of these are failing.

## Manual gate (recommended): token-free local CLI smoke

This validates the end-to-end bootstrap + repo-first workflow on a fresh temp repo without any external services.

Run:

```bash
node apps/ias-agent-framework/scripts/smoke/local-cli-smoke.mjs
```

Expected success signal:

- Script prints `[smoke] OK`

## Manual gate (required): real E2E control-plane smoke run

The real E2E is the only thing that validates the full loop against a real IAS Console deployment (auth → repo upsert → enqueue → runtime claim loop → bootstrap → create_run → evidence).

Script:

- `apps/ias-agent-framework/scripts/control-plane-e2e-smoke/run.mjs`

Prereqs:

- `gh` installed and authenticated (`gh auth status`)
- GitHub repo you can push to (a dedicated throwaway repo is recommended)
- IAS Console deployment URL + workspace slug
- A valid control-plane service token exported as `IAS_CONTROL_PLANE_SERVICE_TOKEN`

Run:

```bash
export IAS_CONTROL_PLANE_SERVICE_TOKEN="…"
node apps/ias-agent-framework/scripts/control-plane-e2e-smoke/run.mjs \
  --repo "https://github.com/<org>/<repo>.git" \
  --workspace-slug "<workspace-slug>" \
  --convex-deployment-url "https://<deployment>.convex.cloud"
```

Expected success signals:

- Script prints `install_ias done jobId=...`
- Script prints `create_run ... done jobId=...`
- If a PR is opened, script prints `install PR: https://github.com/.../pull/...`

Safety:

- `--reset-base-branch true` is **destructive** and requires `--reset-confirm DESTROY`. Use only on a dedicated test repo.
- Do not paste tokens into logs or commit them anywhere.

## Publish mechanics

Publishing is triggered by pushing a tag `ias-v<version>`:

- Workflow: `.github/workflows/publish-ias.yml`
- Version source: `apps/ias-agent-framework/package.json`
- CI token: uses `GITHUB_TOKEN` with `packages:write` permission in the publish workflow
- Notes: workflow supports `workflow_dispatch` dry-run (`npm publish --dry-run`) for validation without publishing

Checklist:

- Bump version in `apps/ias-agent-framework/package.json`
- Run the automated gates + manual E2E smoke gate
- Create tag: `git tag ias-v<version>`
- Push tag: `git push origin ias-v<version>`

Record evidence:

- Attach the smoke run output (redacted) to the release PR / Linear issue.
