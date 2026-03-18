# Re-entry protocol (context window resets)

Long-running runs will eventually hit context limits. IAS prevents quality loss by treating the repo as the durable memory and maintaining a **small re-entry packet** that an agent can reload quickly.

## Principle

When the agent’s context is reset/compacted, the agent must be able to:

- regain the holistic goal + constraints
- know what milestone it is in
- know what is done vs next
- know open decisions/gaps and what blocks merge
- know how to verify and demo

This must live in-repo, not in chat history.

## The re-entry packet (read order)

On re-entry, read in this order:

1) `docs/ias/project-context.md` (global world model snapshot)
2) `docs/ias/context/base-goal.md` + `docs/ias/context/inputs.md` (human intent + inputs)
3) Current run:
   - `docs/ias/runs/YYYYMMDD-<run>.md` (run log)
   - `docs/ias/runs/YYYYMMDD-<run>/implementation-plan.md` (milestones)
   - `docs/ias/runs/YYYYMMDD-<run>/run-state.md` (short “where we are now”)
4) `docs/ias/gaps.md` + `docs/ias/decisions/` (what’s missing / pending)
5) If user-facing: `docs/ias/design/` and latest UI snapshots plan/output.

Optional, to sync with code reality:

- `git status` + `git log -10`

## Run state file (must stay short)

`docs/ias/runs/.../run-state.md` is the single “resume here” file.

Rules:

- keep it short (aim: one screen)
- link out to details (do not paste large content)
- update it whenever:
  - a milestone changes
  - major decisions are made
  - the plan shifts
  - before intentionally clearing/compacting context

## Tool support

Use:

- `./scripts/ias resume` to print the re-entry packet and current pending decisions/gaps.

