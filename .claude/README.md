# Claude Code integration

IAS can run with Claude Code and/or the Claude Agent SDK.

- Claude Code loads project memory from `CLAUDE.md` and project configuration from `.claude/`.
- IAS keeps canonical shared skills in `.agents/skills/`.
- `.claude/skills/` contains Claude compatibility wrappers for those canonical skills.
- IAS also adds `.claude/agents/` and `.claude/commands/` to provide reusable role instructions and slash commands.

Rule: edit canonical shared skills in `.agents/skills/`, not the wrappers.

Start points:

- Run `/agents` to inspect IAS subagents.
- Run `/help` and search for IAS commands (project scope).
- Use `./scripts/ias new-run <slug>` to create run artifacts.

Recommended startup:

- `./scripts/ias preflight --fix`
- `./scripts/ias new-run <slug>`
- `./scripts/ias start-branch <slug>` (optional)

For long runs / context resets:

- `./scripts/ias resume --latest`
