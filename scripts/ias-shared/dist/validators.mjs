/**
 * Validator taxonomy — deterministic rule evaluation for the IAS framework.
 *
 * Validators observe execution context and produce feedback envelopes.
 * They never mutate state or call LLMs. The four kinds form a hierarchy:
 *
 *   hard_stop  → blocks execution, no override
 *   repairable → blocks execution, provides a repair hint
 *   policy     → logs compliance signal, does not block
 *   evidence   → captures audit evidence, does not block
 *
 * This module is the canonical source for the validator taxonomy.
 */
// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------
export function createValidatorRegistry() {
    const validators = new Map();
    return {
        register(validator) {
            if (!validator || !validator.id) {
                throw new Error("validator must have an id");
            }
            if (validators.has(validator.id)) {
                throw new Error(`validator already registered: ${validator.id}`);
            }
            validators.set(validator.id, validator);
        },
        async evaluate(context) {
            const results = [];
            for (const validator of validators.values()) {
                try {
                    results.push(await validator.evaluate(context));
                }
                catch (err) {
                    results.push({
                        validatorId: validator.id,
                        kind: "hard_stop",
                        passed: false,
                        message: `Validator threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
                        blockReason: "validator_error",
                    });
                }
            }
            return results;
        },
        getById(id) {
            return validators.get(id);
        },
        list() {
            return Array.from(validators.values());
        },
    };
}
// ---------------------------------------------------------------------------
// Feedback helpers
// ---------------------------------------------------------------------------
/** True when any feedback in the set is a blocking failure (hard_stop or repairable). */
export function hasBlockingFailure(feedback) {
    return feedback.some((f) => !f.passed && (f.kind === "hard_stop" || f.kind === "repairable"));
}
/** Filter feedback to only hard-stop failures. */
export function getHardStops(feedback) {
    return feedback.filter((f) => !f.passed && f.kind === "hard_stop");
}
/** Filter feedback to only repairable failures. */
export function getRepairableFailures(feedback) {
    return feedback.filter((f) => !f.passed && f.kind === "repairable");
}
//# sourceMappingURL=validators.mjs.map