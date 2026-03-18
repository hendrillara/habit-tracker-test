/**
 * Repo capability states — the governance classification of a repo's
 * relationship with IAS. Shared between the local agent runtime (framework)
 * and the thin control plane (Console).
 *
 * See docs/target-state/domains/01-repo-lifecycle/ for state placement rules.
 */
export type RepoCapabilityState = "discovered" | "attached" | "managed";
export interface CapabilityStateContract {
    state: RepoCapabilityState;
    /** Repo contents may be mutated (governed writes). */
    allowsMutation: boolean;
    /** Autonomous execution sessions are permitted. */
    allowsAutonomousExecution: boolean;
    /** Read-only analysis (local or cloud) is permitted. */
    allowsReadOnlyAnalysis: boolean;
    /** IAS artifacts must be present in the repo. */
    requiresIasInstalled: boolean;
}
export declare const CAPABILITY_STATE_MATRIX: Record<RepoCapabilityState, CapabilityStateContract>;
/**
 * Signals available from repo inspection and/or control-plane data.
 * Each field is intentionally simple so both the local agent and Console
 * can supply them from their own data models.
 */
export interface RepoCapabilitySignals {
    /** IAS artifacts present in the repo (e.g. docs/ias/project-context.md exists). */
    iasPresent: boolean;
    /** IAS has been verified on the default branch (PR merged, default-branch check passed). */
    iasVerified: boolean;
}
/**
 * Derive the canonical capability state from inspection signals.
 *
 * - No IAS present → `discovered`
 * - IAS installed but not verified → `attached`
 * - IAS installed AND verified → `managed`
 */
export declare function deriveCapabilityState(signals: RepoCapabilitySignals): RepoCapabilityState;
export declare function isValidCapabilityState(s: string): s is RepoCapabilityState;
/**
 * Look up the full capability contract for a given state.
 */
export declare function getCapabilityContract(state: RepoCapabilityState): CapabilityStateContract;
/**
 * Check whether a given operation kind is permitted at a given state.
 */
export declare function isOperationAllowed(state: RepoCapabilityState, operation: "mutation" | "autonomousExecution" | "readOnlyAnalysis"): boolean;
/**
 * All valid state values, in progression order.
 */
export declare const CAPABILITY_STATES: readonly RepoCapabilityState[];
/**
 * Check whether a transition from `from` to `to` is a valid forward
 * progression (discovered → attached → managed). Backward transitions
 * (e.g. managed → attached for revoking autonomous mutation) are also
 * valid as explicit operator actions.
 */
export declare function isValidTransition(from: RepoCapabilityState, to: RepoCapabilityState): boolean;
//# sourceMappingURL=capability-states.d.mts.map