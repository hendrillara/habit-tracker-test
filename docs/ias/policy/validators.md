# Validator Taxonomy

Validators are **deterministic, stateless rule evaluators** that observe execution context and produce feedback envelopes. They never mutate state, never call LLMs, and never perform non-deterministic operations.

## The Four Kinds

### `hard_stop`

Blocks execution immediately. Cannot be overridden.

- **When to use:** Irreversible or high-risk operations that must never proceed without explicit human action.
- **Example:** Production repo with a destructive migration detected.
- **Feedback includes:** `blockReason` explaining why execution cannot continue.

```typescript
{
  validatorId: "destructive-migration",
  kind: "hard_stop",
  passed: false,
  message: "Destructive migration detected in production repo",
  blockReason: "DROP TABLE detected in migration 0042"
}
```

### `repairable`

Blocks execution but provides a repair hint that the session kernel can act on.

- **When to use:** Problems that can be resolved without human intervention, given the right guidance.
- **Example:** High-impact assumption pending review.
- **Feedback includes:** `repairHint` describing how to resolve the issue.

```typescript
{
  validatorId: "checkpoint_assumptions",
  kind: "repairable",
  passed: false,
  message: "2 high/critical impact assumptions require review",
  repairHint: "Review and resolve assumptions: ASM-001, ASM-002"
}
```

### `policy`

Logs a compliance signal but does not block execution.

- **When to use:** Conventions or soft rules where non-compliance should be visible but not blocking.
- **Example:** Branch prefix doesn't match org convention.
- **Feedback is informational only — execution continues.**

```typescript
{
  validatorId: "branch-convention",
  kind: "policy",
  passed: false,
  message: "Branch does not match convention: feature/* expected, got fix/typo"
}
```

### `evidence`

Captures execution evidence for audit trails. Always passes (evidence is never a failure).

- **When to use:** Recording observable facts about the execution for governance or debugging.
- **Example:** Number of files changed in a session.
- **Feedback includes:** `evidenceRef` linking to the evidence artifact.

```typescript
{
  validatorId: "file-change-count",
  kind: "evidence",
  passed: true,
  message: "Changed 47 files in this session",
  evidenceRef: "session:abc123:changed-paths"
}
```

## Boundary: Validators vs. Agentic Behavior

| Property | Validators | Agents |
|---|---|---|
| Determinism | Always deterministic | Non-deterministic (LLM-driven) |
| State mutation | Never | May mutate (governed writes) |
| Input | `ValidatorContext` (repo root, job kind, session ID, capability state) | Full execution context + conversation history |
| Output | `ValidatorFeedback` envelope | Structured agent output (code, decisions, evidence) |
| Side effects | None | File writes, commits, API calls |
| Execution time | Milliseconds | Seconds to minutes |

Validators run **before and after** agentic execution. They gate whether an agent session should start, and they verify what an agent session produced. Agents should never contain hardcoded validation rules — those belong in validators.

## How to Add a New Validator

1. **Define the validator** in the appropriate module (or create a new file under `src/ias-shared/` or `src/ias-worker/`):

```typescript
import type { ValidatorDefinition, ValidatorContext, ValidatorFeedback } from "../ias-shared/validators.mjs";

export const myValidator: ValidatorDefinition = {
  id: "my_validator",
  name: "My Validator",
  kind: "policy",  // or hard_stop, repairable, evidence
  description: "Checks something specific",
  evaluate: (context: ValidatorContext): ValidatorFeedback => {
    // Your deterministic check here
    const passed = /* your logic */ true;
    return {
      validatorId: "my_validator",
      kind: "policy",
      passed,
      message: passed ? "Check passed" : "Check failed: reason",
    };
  },
};
```

2. **Register it** in the validator registry at startup:

```typescript
import { createValidatorRegistry } from "../ias-shared/validators.mjs";
import { myValidator } from "./my-validator.mjs";

const registry = createValidatorRegistry();
registry.register(myValidator);
```

3. **Write tests** in `tests/validators.test.mjs` or a new test file using `node:test`.

4. **Verify**: `npm run build && npm run typecheck && npm test`

## Key Constraints

- Validators must be **deterministic** — same input always produces same output.
- Validators must not **mutate** state — they observe and report only.
- Validators must not make **network calls** or **LLM calls**.
- The registry is in-process; there is no file-discovery plugin system (yet).
- All validators run to completion; there is no short-circuit on first failure.
