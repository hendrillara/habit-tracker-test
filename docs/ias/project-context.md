# Project context (canonical)

Update this file at the start of any substantial run. It is the shared “world model” for agents and reviewers.

## Status

- production: TODO
- deployed_version_ref: n/a
- engagement_type: greenfield
- execution_mode: local-runtime-first (record any temporary framework-specific command path in notes)

## Research tools (optional)

- web_search: true
- mcp_pack: none
- mcp_budget_calls_per_task: 3
- preferred_mcp_servers:
  - (optional) perplexity
  - (optional) context7
- cli_skills:
  - (optional) firecrawl — CLI skill, not MCP; requires `FIRECRAWL_API_KEY`

## Goal

- base_goal_ref: `docs/ias/context/base-goal.md`
- success_criteria:
  - TODO

## Stakeholders

- primary_stakeholder: TODO
- users: TODO
- other_stakeholders:
  - TODO

## Non-negotiable constraints (hard constraints)

- Markdown-only documentation under `docs/` (keep docs current with behavior changes).
- No real secrets in git (use placeholders/mocks and document required env vars).

## Constraints (soft / preferences)

- tech_preferences:
  - TypeScript
  - Next.js (common default)
  - Tailwind + shadcn/ui + Convex (greenfield default)
- testing_preferences:
  - unit_tests_for_core_logic: true
  - frontend_e2e: false
- docs_conventions:
  - markdown_only: true
  - keep_docs_current: true
- ux_preferences:
  - design_gate: optional
  - design_human_review: optional
  - ui_snapshots_commit: false

## Risks / sensitivities

- sensitive_data: none
- security_baseline: "no known critical vulnerabilities; do not commit secrets"
- operational_risk_tolerance: medium
