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
import type { PolicyLayer } from "./harness-policy.mts";
export declare const EXCEPTION_STATES: readonly ["pending", "approved", "rejected", "expired"];
export type ExceptionState = (typeof EXCEPTION_STATES)[number];
export declare function isValidExceptionTransition(from: ExceptionState, to: ExceptionState): boolean;
export interface ExceptionScope {
    layer: PolicyLayer;
    targetId: string;
}
export interface ExceptionRequest {
    id: string;
    ruleKey: string;
    scope: ExceptionScope;
    reason: string;
    state: ExceptionState;
    requestedBy: string;
    requestedAt: string;
    /** Requested expiration (set by the requester). */
    expiresAt?: string;
    decision?: ExceptionDecision;
}
export interface ExceptionDecision {
    decidedBy: string;
    decidedAt: string;
    outcome: "approved" | "rejected";
    rationale: string;
    /** Granted expiration (set by the reviewer). Takes precedence over ExceptionRequest.expiresAt. */
    grantedExpiresAt?: string;
}
/**
 * Returns true if the exception is in approved state.
 * Expiration is handled at the state-machine level (approved → expired transition),
 * not by checking expiresAt here — callers should transition expired exceptions
 * before calling this function.
 */
export declare function isExceptionActive(req: Pick<ExceptionRequest, "state">): boolean;
export interface CreateExceptionInput {
    ruleKey: string;
    scope: ExceptionScope;
    reason: string;
    requestedBy: string;
    expiresAt?: string;
    /** Optional deterministic ID (defaults to crypto.randomUUID()). */
    id?: string;
    /** Optional timestamp (defaults to new Date().toISOString()). */
    requestedAt?: string;
}
export declare function createExceptionRequest(input: CreateExceptionInput): ExceptionRequest;
export declare function applyExceptionDecision(request: ExceptionRequest, decision: Omit<ExceptionDecision, "decidedAt">): ExceptionRequest;
//# sourceMappingURL=policy-exceptions.d.mts.map