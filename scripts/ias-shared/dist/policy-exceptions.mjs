/**
 * policy-exceptions.mts — Policy exception requests and review workflow.
 *
 * Pure module. Defines how temporary policy bypasses are requested,
 * reviewed, and tracked for governance visibility.
 *
 * See domains/02-harness-and-policy/ for domain requirements.
 *
 * Note: crypto.randomUUID() is used as a convenience default for ID generation.
 * Callers may provide deterministic IDs via the factory input for testability.
 */
import crypto from "node:crypto";
// ---------------------------------------------------------------------------
// Exception States
// ---------------------------------------------------------------------------
export const EXCEPTION_STATES = ["pending", "approved", "rejected", "expired"];
const VALID_TRANSITIONS = {
    pending: ["approved", "rejected"],
    approved: ["expired"],
    rejected: [],
    expired: [],
};
export function isValidExceptionTransition(from, to) {
    return VALID_TRANSITIONS[from].includes(to);
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Returns true if the exception is in approved state.
 * Expiration is handled at the state-machine level (approved → expired transition),
 * not by checking expiresAt here — callers should transition expired exceptions
 * before calling this function.
 */
export function isExceptionActive(req) {
    return req.state === "approved";
}
export function createExceptionRequest(input) {
    return {
        id: input.id ?? crypto.randomUUID(),
        ruleKey: input.ruleKey,
        scope: input.scope,
        reason: input.reason,
        state: "pending",
        requestedBy: input.requestedBy,
        requestedAt: input.requestedAt ?? new Date().toISOString(),
        expiresAt: input.expiresAt,
    };
}
// ---------------------------------------------------------------------------
// Decision Application
// ---------------------------------------------------------------------------
export function applyExceptionDecision(request, decision) {
    if (request.state !== "pending") {
        throw new Error(`Cannot apply decision to exception in state "${request.state}"`);
    }
    const fullDecision = {
        ...decision,
        decidedAt: new Date().toISOString(),
    };
    return {
        ...request,
        state: decision.outcome === "approved" ? "approved" : "rejected",
        decision: fullDecision,
    };
}
//# sourceMappingURL=policy-exceptions.mjs.map