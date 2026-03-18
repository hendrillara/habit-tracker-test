/**
 * Repo capability states — the governance classification of a repo's
 * relationship with IAS. Shared between the local agent runtime (framework)
 * and the thin control plane (Console).
 *
 * See docs/target-state/domains/01-repo-lifecycle/ for state placement rules.
 */
// ---------------------------------------------------------------------------
// Legal-operation matrix
// ---------------------------------------------------------------------------
export const CAPABILITY_STATE_MATRIX = {
    discovered: {
        state: "discovered",
        allowsMutation: false,
        allowsAutonomousExecution: false,
        allowsReadOnlyAnalysis: true,
        requiresIasInstalled: false,
    },
    attached: {
        state: "attached",
        allowsMutation: false,
        allowsAutonomousExecution: false,
        allowsReadOnlyAnalysis: true,
        requiresIasInstalled: true,
    },
    managed: {
        state: "managed",
        allowsMutation: true,
        allowsAutonomousExecution: true,
        allowsReadOnlyAnalysis: true,
        requiresIasInstalled: true,
    },
};
Object.freeze(CAPABILITY_STATE_MATRIX);
// ---------------------------------------------------------------------------
// Ordered states (for transition validation)
// ---------------------------------------------------------------------------
const STATE_ORDER = [
    "discovered",
    "attached",
    "managed",
];
/**
 * Derive the canonical capability state from inspection signals.
 *
 * - No IAS present → `discovered`
 * - IAS installed but not verified → `attached`
 * - IAS installed AND verified → `managed`
 */
export function deriveCapabilityState(signals) {
    if (!signals.iasPresent)
        return "discovered";
    if (!signals.iasVerified)
        return "attached";
    return "managed";
}
// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------
export function isValidCapabilityState(s) {
    return s === "discovered" || s === "attached" || s === "managed";
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Look up the full capability contract for a given state.
 */
export function getCapabilityContract(state) {
    return CAPABILITY_STATE_MATRIX[state];
}
/**
 * Check whether a given operation kind is permitted at a given state.
 */
export function isOperationAllowed(state, operation) {
    const contract = CAPABILITY_STATE_MATRIX[state];
    switch (operation) {
        case "mutation":
            return contract.allowsMutation;
        case "autonomousExecution":
            return contract.allowsAutonomousExecution;
        case "readOnlyAnalysis":
            return contract.allowsReadOnlyAnalysis;
        default:
            throw new Error(`Unknown operation: ${operation}`);
    }
}
/**
 * All valid state values, in progression order.
 */
export const CAPABILITY_STATES = STATE_ORDER;
/**
 * Check whether a transition from `from` to `to` is a valid forward
 * progression (discovered → attached → managed). Backward transitions
 * (e.g. managed → attached for revoking autonomous mutation) are also
 * valid as explicit operator actions.
 */
export function isValidTransition(from, to) {
    if (from === to)
        return false; // no-op is not a transition
    // All single-step forward or backward transitions are valid.
    const fromIdx = STATE_ORDER.indexOf(from);
    const toIdx = STATE_ORDER.indexOf(to);
    const distance = Math.abs(toIdx - fromIdx);
    // Allow single-step transitions only (no jumping discovered → managed directly).
    return distance === 1;
}
//# sourceMappingURL=capability-states.mjs.map