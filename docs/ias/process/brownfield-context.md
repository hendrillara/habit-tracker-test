# Brownfield context (adopt, clean up, improve)

In brownfield repositories, context already exists: READMEs, ADRs, architecture docs, runbooks, CI/CD notes, and sometimes agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, etc.).

IAS treats this as an asset, not a liability.

## Goal

Make existing context:

- **usable** (easy to find and trust),
- **current** (reflects reality),
- **non-duplicative** (one source of truth per topic),
- **agent-friendly** (small top-level rules, deeper docs linked).

## Default approach: “accept or improve”

For each existing context artifact:

1) **Inventory it** (name, location, what it claims).
2) **Assess quality**:
   - Is it current and consistent with the code?
   - Is it scoped (does it say what it is / isn’t)?
   - Is it discoverable (linked from an index)?
   - Is it concise (links out vs huge paste)?
3) Decide one of:
   - **Adopt**: keep as-is; link it from IAS.
   - **Patch**: make minimal edits to remove contradictions/rot.
   - **Deprecate**: keep the file but add a short deprecation note + link to the new canonical doc.
   - **Archive**: move to an archive folder only if the repo convention supports it (avoid breaking external links).

Log the decision if it changes norms or affects many files (see `docs/ias/process/decision-and-gap-policy.md`).

## Where IAS should anchor

IAS does not require migrating all docs into `docs/ias/`. Instead:

- `docs/ias/project-context.md` holds the **canonical operational snapshot** (production status, constraints, preferences).
- `docs/ias/context/*` holds the **human-curated Context Pack** for this engagement.
- Existing repo docs remain the primary source when they are good; IAS links to them.

## Brownfield “context audit” artifact

For non-trivial brownfield work, create a short audit early in the run:

- `docs/ias/runs/YYYYMMDD-<run>/context-audit.md` (from template)

This should include:

- discovered context files and what they cover
- contradictions/rot discovered
- minimal fix plan (what to patch now vs later)

## Continuous improvement

After each substantial run, the Orchestrator should:

- fix one or two “highest leverage” documentation issues found (rot, missing index, contradictions)
- avoid massive doc rewrites unless explicitly in scope
- keep instruction surfaces (`AGENTS.md`, `CLAUDE.md`) lean and stable, link out to deeper docs

