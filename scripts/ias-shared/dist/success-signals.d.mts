/**
 * success-signals.mts — Transformation success signal snapshots.
 *
 * Pure module. Defines how governed execution evidence is aggregated
 * into success metrics for pilot and rollout review.
 *
 * See domains/08-enterprise-governance-and-rollout/ and domains/06-evidence-and-results/.
 */
export declare const SIGNAL_CATEGORIES: readonly ["quality", "reliability", "governance", "rollout"];
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];
export interface EvidenceReference {
    /** Stable identifier for the evidence source (run ID, result summary ID, repo artifact path). */
    sourceId: string;
    /** Human-readable evidence type label (e.g., "validator_result", "run_outcome"). */
    sourceType: string;
    /** ISO-8601 timestamp of when the evidence was produced. */
    producedAt: string;
}
export interface GovernedExecutionEvidence {
    /** Unique ID for this evidence record. */
    id: string;
    /** ISO-8601 timestamp. */
    producedAt: string;
    /** Evidence kind — maps to signal derivation rules. */
    kind: "run_outcome" | "validator_result" | "approval_decision" | "rollout_posture_change";
    /** Structured payload — shape depends on kind. */
    payload: Record<string, unknown>;
}
export interface SignalValue {
    name: string;
    category: SignalCategory;
    value: number;
    target?: number;
    unit?: string;
    /** Evidence pointers tracing this signal back to governed execution. Empty means unevidenced. */
    evidence: readonly EvidenceReference[];
}
export interface SuccessSignalSnapshot {
    pilotId: string;
    signals: readonly SignalValue[];
    computedAt: string;
    /** Signal categories with zero instrumentation. */
    missingCategories: readonly SignalCategory[];
    /** Total evidence records used to compute this snapshot. */
    evidenceCount: number;
}
export declare function detectMissingCategories(signals: readonly SignalValue[]): readonly SignalCategory[];
export interface CreateSnapshotInput {
    pilotId: string;
    signals: readonly SignalValue[];
}
export declare function createSuccessSnapshot(input: CreateSnapshotInput): SuccessSignalSnapshot;
export declare const SIGNAL_HEALTH_STATUSES: readonly ["healthy", "at_risk", "incomplete"];
export type SignalHealthStatus = (typeof SIGNAL_HEALTH_STATUSES)[number];
export interface SignalHealth {
    status: SignalHealthStatus;
    belowTarget: readonly SignalValue[];
    missingTarget: readonly SignalValue[];
    /** Signal categories with zero instrumentation. */
    missingCategories: readonly SignalCategory[];
    /** Signals that carry values but no evidence provenance. */
    unevidenced: readonly SignalValue[];
}
export declare function computeSignalHealth(signals: readonly SignalValue[]): SignalHealth;
export declare function describeIncompleteSignals(signals: readonly SignalValue[]): string[];
export declare function describeSnapshotGaps(snapshot: SuccessSignalSnapshot): string[];
export interface ComputeSignalsInput {
    pilotId: string;
    evidence: readonly GovernedExecutionEvidence[];
    /** Optional target values keyed by signal name (e.g., { "pass_rate": 0.95 }). */
    targets?: Partial<Record<string, number>>;
}
export declare function computeSignalsFromEvidence(input: ComputeSignalsInput): SuccessSignalSnapshot;
//# sourceMappingURL=success-signals.d.mts.map