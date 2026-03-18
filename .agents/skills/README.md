# Agent Skills (IAS canonical)

`apps/ias-agent-framework/.agents/skills/` is the canonical framework skill source.

- Codex discovers these skills directly from `.agents/skills/`.
- Claude compatibility wrappers live under `.claude/skills/`.
- Edit canonical framework skills here, not in wrapper directories.
- Keep main `SKILL.md` files concise and move depth into `references/` when needed.

These skills are part of the IAS framework. In client-safe (`--local-only`) deployments, `.agents/` and `.claude/` are intended to be local-only (gitignored).
