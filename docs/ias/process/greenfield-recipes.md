# Greenfield recipes (default stacks)

IAS is problem-agnostic, but for greenfield work we standardize on a default stack to maximize velocity and quality. Repos can override this in `docs/ias/project-context.md`.

## Web app (default)

Default stack:

- TypeScript
- Next.js
- Tailwind CSS
- shadcn/ui (component primitives)
- Convex (backend + database)

Principles:

- Establish a **design system early** (tokens, typography, spacing, component patterns) before deep implementation.
- Optimize for modern, beautiful, and clear UX on the critical path.

Recommended first step for user-facing products:

- `./scripts/ias init-design`
- Follow `docs/ias/process/design-workflow.md` (gate is configurable via `design_gate` in `docs/ias/project-context.md`).

Suggested baseline repo commands (add if missing):

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm test` (meaningful unit tests for core logic; avoid toy tests)

UI snapshots:

- Required for user-facing work (see `docs/ias/process/ui-snapshots.md`).

## Native mobile (default)

Default stack:

- TypeScript
- React Native (Expo is a recommended default unless the repo dictates otherwise)
- Tailwind-equivalent styling approach (repo-specific)
- Convex (backend + database)

Principles:

- Design system first, then implement.
- Ensure critical flows feel native and low-friction.

## Brownfield note

For brownfield repositories, default to the repo’s established stack and conventions. Only introduce new tooling when missing and high leverage (see `docs/ias/process/brownfield-context.md`).
