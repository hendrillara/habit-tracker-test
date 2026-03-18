/**
 * pilot-review.mts — Pilot review assembly for stakeholder visibility.
 *
 * Pure module. Aggregates pilot scope, success signals, rollout posture,
 * and checkpoint results into a review-ready summary.
 *
 * See domains/08-enterprise-governance-and-rollout/.
 */
import type { PilotPhase, ExpansionCheckpointResult } from "./pilot-rollout.mts";
import type { SignalHealth } from "./success-signals.mts";
import type { RolloutSummary } from "./rollout-posture.mts";
export type RolloutSummaryInput = RolloutSummary;
export declare const PILOT_READINESS_STATES: readonly ["ready", "not_ready", "incomplete"];
export type PilotReadiness = (typeof PILOT_READINESS_STATES)[number];
export interface PilotReview {
    pilotId: string;
    phase: PilotPhase;
    signalHealth: SignalHealth;
    rolloutSummary: RolloutSummaryInput;
    checkpointResults: readonly ExpansionCheckpointResult[];
    readiness: PilotReadiness;
    blockers: readonly string[];
    computedAt: string;
}
export interface PilotReviewInput {
    pilotId: string;
    phase: PilotPhase;
    signalHealth: SignalHealth;
    rolloutSummary: RolloutSummaryInput;
    checkpointResults: readonly ExpansionCheckpointResult[];
}
export declare function assemblePilotReview(input: PilotReviewInput): PilotReview;
export declare function describeRolloutReadiness(review: PilotReview): string;
//# sourceMappingURL=pilot-review.d.mts.map