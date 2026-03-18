# Rule engine (IAS)

This document defines deterministic rules agents should follow. It is intentionally lightweight and designed for terminal-based Claude Code workflows.

## 1) Knowledge freshness rule (when to engage the Researcher)

Assumption: LLMs have strong general world modeling, but their training data can be stale (often ~months to ~1+ year behind). Therefore:

- Default: proceed with best-practice reasoning using repo context + general knowledge.
- If the task depends on **current** or **version-specific** information, engage the Researcher and/or MCP.

### Trigger conditions (use Researcher)

Engage the Researcher when any of these are true:

- **Time-sensitive facts**: pricing, product availability, “current best model”, rate limits, policy/legal changes, vendor terms.
- **Rapidly changing domains**: security advisories (CVEs), cloud service behavior, SDK/CLI flags, breaking changes in frameworks.
- **Vendor/API integration**: any integration that must match the provider’s current docs (auth flows, headers, endpoints, limits).
- **Post-cutoff claims**: the plan includes “latest”, “new”, “recent”, or a version/date not present in the repo.
- **High-stakes uncertainty**: decision impact is high and a wrong external fact would cause rework or risk.

### Output requirements

Research output must:

- include sources (URLs) for each key finding
- call out assumptions and unknowns explicitly
- recommend the minimal “current facts” needed to proceed safely

Recommended artifact: `docs/ias/templates/research-notes.md`.

## 2) Scope rule (stay problem- and environment-aware)

Before implementation, ensure the world model and hard constraints are captured in `docs/ias/project-context.md` and run artifacts.

## 3) Production risk rule (breaking changes only vs deployed)

- “Breaking” is defined relative to the deployed version, not `main`.
- If `production: true`, treat risky data/behavior changes as high scrutiny and escalate per `docs/ias/process/decision-and-gap-policy.md`.

## 4) UI snapshot rule (when screenshots are required)

If the change is user-facing (any UI or client-like interface), screenshots are required as a quality gate:

- Web UI: at least one desktop + one mobile viewport per critical screen.
- Native UI (when applicable): simulator/emulator screenshots if tooling exists.

If the project has no UI, or the change is purely backend/infra, skip this gate.

If screenshots cannot be produced (no runnable UI yet, missing tooling), record a decision + gap and proceed with a minimal placeholder plan.
