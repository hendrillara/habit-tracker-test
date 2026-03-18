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
import crypto from "node:crypto";
// ---------------------------------------------------------------------------
// Promotion States
// ---------------------------------------------------------------------------
export const PROMOTION_STATES = [
    "proposed",
    "under_review",
    "approved",
    "rejected",
    "promoted",
];
const VALID_TRANSITIONS = {
    proposed: ["under_review"],
    under_review: ["approved", "rejected"],
    approved: ["promoted"],
    rejected: [],
    promoted: [],
};
export function isValidPromotionTransition(from, to) {
    return VALID_TRANSITIONS[from].includes(to);
}
export function createPromotionProposal(input) {
    if (!input.rationale.trim()) {
        throw new Error("Promotion proposal requires non-empty rationale");
    }
    return {
        id: input.id ?? crypto.randomUUID(),
        contextItemId: input.contextItemId,
        runRef: input.runRef,
        state: "proposed",
        initialTarget: input.initialTarget,
        effectiveTarget: input.initialTarget,
        rationale: input.rationale,
        proposedBy: input.proposedBy,
        proposedAt: input.proposedAt ?? new Date().toISOString(),
    };
}
export function startReview(proposal, input) {
    if (proposal.state !== "proposed") {
        throw new Error(`Cannot start review on proposal in state "${proposal.state}"`);
    }
    return {
        ...proposal,
        state: "under_review",
        reviewStartedBy: input.reviewStartedBy,
        reviewStartedAt: input.startedAt ?? new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Decision Application
// ---------------------------------------------------------------------------
export function applyPromotionDecision(proposal, decision) {
    if (proposal.state !== "under_review") {
        throw new Error(`Cannot apply decision to proposal in state "${proposal.state}"`);
    }
    if (!decision.rationale.trim()) {
        throw new Error("Promotion decision requires non-empty rationale");
    }
    const fullDecision = {
        ...decision,
        decidedAt: new Date().toISOString(),
    };
    return {
        ...proposal,
        state: decision.outcome === "approved" ? "approved" : "rejected",
        effectiveTarget: decision.retargetTo ?? proposal.effectiveTarget,
        decision: fullDecision,
    };
}
export function finalizePromotion(proposal, input) {
    if (proposal.state !== "approved") {
        throw new Error(`Cannot finalize promotion for proposal in state "${proposal.state}"`);
    }
    if (!proposal.decision) {
        throw new Error("Cannot finalize promotion without a recorded decision");
    }
    const promotedAt = input?.promotedAt ?? new Date().toISOString();
    const wasRetargeted = proposal.initialTarget !== proposal.effectiveTarget;
    const promotedProposal = {
        ...proposal,
        state: "promoted",
    };
    return {
        recordId: input?.recordId ?? crypto.randomUUID(),
        proposal: promotedProposal,
        decisionTrail: {
            proposedTarget: proposal.initialTarget,
            approvedTarget: proposal.effectiveTarget,
            wasRetargeted,
            proposalRationale: proposal.rationale,
            reviewRationale: proposal.decision.rationale,
            retargetRationale: proposal.decision.retargetRationale ?? undefined,
        },
        promotedAt,
        contextItemId: proposal.contextItemId,
        targetLayer: proposal.effectiveTarget,
        runRef: proposal.runRef,
    };
}
export function validateWritebackPreconditions(proposal) {
    if (proposal.state !== "approved") {
        return {
            valid: false,
            reason: `Proposal must be approved before writeback (current: ${proposal.state})`,
        };
    }
    if (!proposal.decision) {
        return {
            valid: false,
            reason: "Approved proposal has no decision record",
        };
    }
    return { valid: true };
}
// ---------------------------------------------------------------------------
// Retarget Validation (LUC-22 Story 4)
// ---------------------------------------------------------------------------
export function validateRetarget(proposal, newTarget) {
    if (proposal.state !== "under_review") {
        return {
            valid: false,
            reason: `Cannot re-target proposal in state "${proposal.state}"`,
        };
    }
    if (newTarget === proposal.initialTarget) {
        return {
            valid: false,
            reason: "New target is the same as the initial target",
        };
    }
    return { valid: true };
}
// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export function describePromotionRecord(record) {
    const trail = record.decisionTrail;
    const retargetNote = trail.wasRetargeted
        ? ` (re-targeted from ${trail.proposedTarget} to ${trail.approvedTarget})`
        : "";
    return `Promotion ${record.recordId}: context "${record.contextItemId}" promoted to ${record.targetLayer}${retargetNote} from run ${record.runRef}`;
}
//# sourceMappingURL=context-promotion.mjs.map