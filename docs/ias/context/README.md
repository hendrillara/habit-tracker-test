# Context Pack (human-curated)

This folder is the **single human-first step** before an IAS run. The goal is to provide the base context in an ordered, easy-to-consume way.

IAS is repo-first: the codebase is context too. This folder exists to capture the context that is *not* naturally expressed by the codebase (goals, constraints, PRDs, links, client requirements, etc.).

## How to use

1) Put the **base goal** in `docs/ias/context/base-goal.md` (can be 1 line).
2) Add any relevant documents as Markdown in this folder (or link to them from `docs/ias/context/inputs.md`).
3) Keep it tidy; prefer links over copy/pasting large external docs.

Agents should treat this folder as canonical input. They may append clarifications, but should not rewrite or erase original human-provided intent without creating a decision record.

## Greenfield checklist

- `base-goal.md`: what to build (outcome statement)
- `inputs.md`: links to inspiration, competitors, constraints, brand, etc.
- Optional: PRD / user stories / success metrics (can be brief)

## Brownfield checklist

- `base-goal.md`: what to change/achieve
- `inputs.md`: client requirements, existing docs, tickets, architecture notes
- Optional: “known pain points”, “known risks”, “what not to touch”
