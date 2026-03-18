/**
 * Runner validator gate — integration point between the validator registry
 * and the runner execution loop.
 *
 * The gate evaluates all registered validators and returns a structured
 * result that the runner (and later the session kernel, LUC-10) can
 * consume to decide whether to proceed, repair, or abort.
 *
 * This module is intentionally light: it provides the integration scaffolding
 * without rewiring the existing execution loop.
 */
import { getHardStops, getRepairableFailures, } from "../../ias-shared/dist/validators.mjs";
/**
 * Run all registered validators and produce a gate result.
 *
 * Decision logic:
 *   - Any hard_stop failure → abort (cannot proceed)
 *   - Any repairable failure (no hard_stops) → repair (can retry after fix)
 *   - All pass → proceed
 */
export async function evaluateValidatorGate(registry, context) {
    const feedback = await registry.evaluate(context);
    const hardStops = getHardStops(feedback);
    const repairableFailures = getRepairableFailures(feedback);
    let outcome;
    if (hardStops.length > 0) {
        outcome = "abort";
    }
    else if (repairableFailures.length > 0) {
        outcome = "repair";
    }
    else {
        outcome = "proceed";
    }
    return { outcome, feedback, hardStops, repairableFailures };
}
//# sourceMappingURL=validator-gate.mjs.map