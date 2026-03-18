# Decision + gap policy (minimize human interruptions)

## Principle

Agents should keep momentum. Human input is collected in parallel via decision records and gaps.

## When input is missing

1) Create a decision record in `docs/ias/decisions/` (`status: pending`).
2) Add an entry to `docs/ias/gaps.md` linking the decision.
3) Continue with a best-practice default and a runnable mock/stub.

## Escalation heuristic (hard-stop vs log-and-continue)

Default is **log-and-continue**. Hard-stop is reserved for “one-way door” decisions and production risk.

Use this rubric when deciding:

- impact: 1–5 (user/business/operational impact)
- irreversibility: 1–5 (cost/time to undo, lock-in)
- uncertainty: 1–5 (how confident the agent is given repo + context)

Guidance:

- If `production: false` in `docs/ias/project-context.md`, avoid hard-stops unless all three are 4–5.
- If `production: true`, treat high-impact changes to data/behavior as hard-stops even if the agent is confident.

## Knowledge freshness (when to research)

LLMs are strong at general world modeling, but may be trained on stale snapshots. If the task depends on current facts or provider docs, engage the Researcher and/or MCP (see `docs/ias/process/rule-engine.md`).

## Secrets/keys

- Never commit real secrets.
- If an integration needs credentials, implement against a mock/stub and document required env vars.

## Breaking changes

- “Breaking” is defined relative to the deployed version (not `main`).
- If `production: false` in `docs/ias/project-context.md`, proceed by default and log decisions/gaps as needed.
- If `production: true`, treat risky data/behavior changes as high-scrutiny and escalate when needed.
