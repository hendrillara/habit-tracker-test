/**
 * pilot-rollout.mts — Pilot rollout model and expansion checkpoint rules.
 *
 * Pure module. Defines pilot lifecycle phases, expansion gates, and
 * evaluation criteria for pilot-to-scale progression.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
// ---------------------------------------------------------------------------
// Pilot Phases
// ---------------------------------------------------------------------------
export const PILOT_PHASES = ["scoping", "active", "expanding", "completed"];
const VALID_TRANSITIONS = {
    scoping: ["active"],
    active: ["expanding", "completed"],
    expanding: ["completed"],
    completed: [],
};
export function isValidPilotTransition(from, to) {
    return VALID_TRANSITIONS[from].includes(to);
}
export function transitionPilotPhase(scope, to) {
    if (!isValidPilotTransition(scope.phase, to)) {
        throw new Error(`Invalid pilot transition: "${scope.phase}" → "${to}"`);
    }
    return { ...scope, phase: to, updatedAt: new Date().toISOString() };
}
export function createPilotScope(input) {
    const now = new Date().toISOString();
    return { ...input, phase: "scoping", createdAt: now, updatedAt: now };
}
export function evaluateExpansionCheckpoint(input) {
    const failed = input.criteria.filter((c) => c.actual < c.threshold);
    return {
        name: input.name,
        passed: failed.length === 0,
        failedCriteria: failed,
        evaluatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=pilot-rollout.mjs.map