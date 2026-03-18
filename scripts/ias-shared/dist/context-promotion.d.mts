/**
 * context-promotion.mts — Promotion proposal and review workflow.
 *
 * Pure module. Defines how run-scoped context learnings are proposed
 * for promotion into reusable layers (repo, team, enterprise).
 *
 * See domains/03-context-system/ for domain requirements.
 *
 * Note: crypto.randomUUID() is used as a convenience default for ID generation.
 * Callers may provide deterministic IDs via the factory input for testability.
 */
import type { PolicyLayer } from "./harness-policy.mts";
export declare const PROMOTION_STATES: readonly ["proposed", "under_review", "approved", "rejected", "promoted"];
export type PromotionState = (typeof PROMOTION_STATES)[number];
export declare function isValidPromotionTransition(from: PromotionState, to: PromotionState): boolean;
export type PromotionTarget = PolicyLayer;
export interface PromotionProposal {
    id: string;
    contextItemId: string;
    runRef: string;
    state: PromotionState;
    initialTarget: PromotionTarget;
    effectiveTarget: PromotionTarget;
    rationale: string;
    proposedBy: string;
    proposedAt: string;
    /** Who started the review (set during proposed -> under_review transition). */
    reviewStartedBy?: string;
    /** When the review started (ISO 8601). */
    reviewStartedAt?: string;
    decision?: PromotionDecision;
}
export interface PromotionDecision {
    decidedBy: string;
    decidedAt: string;
    outcome: "approved" | "rejected";
    rationale: string;
    retargetTo?: PromotionTarget;
    /** If re-targeted, the specific rationale for the target change. */
    retargetRationale?: string;
}
export interface PromotionDecisionTrail {
    /** The target layer originally proposed by the run. */
    proposedTarget: PromotionTarget;
    /** The target layer approved by the reviewer. */
    approvedTarget: PromotionTarget;
    /** Whether the reviewer changed the target layer. */
    wasRetargeted: boolean;
    /** The rationale provided when the proposal was created. */
    proposalRationale: string;
    /** The rationale provided by the reviewer when deciding. */
    reviewRationale: string;
    /** If re-targeted, the specific rationale for the target change. */
    retargetRationale?: string;
}
export interface PromotionRecord {
    /** Unique identifier for this promotion record. */
    recordId: string;
    /** The fully-resolved proposal in its terminal promoted state. */
    proposal: PromotionProposal;
    /** Structured decision trail preserving both proposed and approved targets. */
    decisionTrail: PromotionDecisionTrail;
    /** ISO 8601 timestamp when the promotion was finalized. */
    promotedAt: string;
    /** The context item that was promoted. */
    contextItemId: string;
    /** The layer where the context was written. */
    targetLayer: PromotionTarget;
    /** The run that originated this promotion. */
    runRef: string;
}
export interface CreatePromotionInput {
    contextItemId: string;
    runRef: string;
    initialTarget: PromotionTarget;
    rationale: string;
    proposedBy: string;
    /** Optional deterministic ID (defaults to crypto.randomUUID()). */
    id?: string;
    /** Optional timestamp (defaults to new Date().toISOString()). */
    proposedAt?: string;
}
export declare function createPromotionProposal(input: CreatePromotionInput): PromotionProposal;
export interface StartReviewInput {
    reviewStartedBy: string;
    /** Optional timestamp (defaults to new Date().toISOString()). */
    startedAt?: string;
}
export declare function startReview(proposal: PromotionProposal, input: StartReviewInput): PromotionProposal;
export declare function applyPromotionDecision(proposal: PromotionProposal, decision: Omit<PromotionDecision, "decidedAt">): PromotionProposal;
export interface FinalizePromotionInput {
    /** Optional deterministic ID for the record (defaults to crypto.randomUUID()). */
    recordId?: string;
    /** Optional timestamp (defaults to new Date().toISOString()). */
    promotedAt?: string;
}
export declare function finalizePromotion(proposal: PromotionProposal, input?: FinalizePromotionInput): PromotionRecord;
export interface PromotionWritebackResult {
    proposalId: string;
    writtenToLayer: PromotionTarget;
    contextItemId: string;
    writtenAt: string;
    success: boolean;
    error?: string;
}
export declare function validateWritebackPreconditions(proposal: PromotionProposal): {
    valid: boolean;
    reason?: string;
};
export declare function validateRetarget(proposal: PromotionProposal, newTarget: PromotionTarget): {
    valid: boolean;
    reason?: string;
};
export declare function describePromotionRecord(record: PromotionRecord): string;
//# sourceMappingURL=context-promotion.d.mts.map