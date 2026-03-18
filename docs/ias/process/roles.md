# Default roles

This system assumes an “orchestrator” plus specialized roles. Roles can be merged for MVP workflows.

## Orchestrator (Intuitive Agent)

- Owns the world model, constraints, and “is this good enough?” decisions.
- Delegates work and enforces quality gates.
- Maintains `docs/ias/project-context.md`, `docs/ias/gaps.md`, and decision records.
- Runs the “self-improvement loop”: distill stable learnings into `docs/ias/project-context.md` and minimal rules in `docs/ias/process/` (without bloating global docs).
- In brownfield repos, explicitly decides what existing docs/rules to adopt vs patch (see `docs/ias/process/brownfield-context.md`).

## PM / Value Owner

- Owns user/business value framing and acceptance criteria.
- Validates that outputs match the goal and fit the product scope.

## UI/UX Reviewer

- Ensures UX clarity and visual/pragmatic polish where it matters to users.
- Reviews UI snapshots for regressions and “how it feels” before calling work done.

## Researcher

- Gathers external context when repo context is insufficient (APIs, vendor docs, standards, best practices).
- Produces a short, source-linked research summary and highlights assumptions/unknowns.
- Prefer read-only + web/MCP tools; should not modify code directly.

## Implementer

- Ships code, keeps it maintainable, writes tests for core logic.

## Reviewer

- Performs PR-style review, requests changes, and checks quality gates.

## Test runner

- Runs relevant test commands and analyzes failures.
- Does not author tests by default; test writing stays with the Implementer to keep code ownership coherent.
- For greenfield work, helps establish minimal verification scripts if missing (see `docs/ias/process/verification.md`).

## Screenshotter (optional)

- Captures UI snapshots (desktop + mobile, and native simulators when applicable) as review artifacts.
- Uses repo-defined commands from `docs/ias/templates/ui-snapshot-plan.md`.
- To dispatch a screenshotter from `next_jobs`, emit:
  ```json
  {
    "role": "screenshotter",
    "kind": "screenshot",
    "prompt": "{\"type\":\"screenshot\",\"version\":1,\"url\":\"http://localhost:3000\"}",
    "write": false,
    "network": false,
    "web_search": false
  }
  ```
- Valid role aliases: `screenshotter`, `screenshot`, `ias-screenshotting`, `ias-screenshotter`.
- The `prompt` field must be a valid screenshot job JSON payload (see `parseScreenshotPrompt`).
