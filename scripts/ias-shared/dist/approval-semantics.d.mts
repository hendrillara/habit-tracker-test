/**
 * approval-semantics.mts — Approval gate and blocker semantics.
 *
 * Pure module. Defines the minimum distinction between answer (informational)
 * and apply (authoritative), which approvals must remain explicit, and
 * governance visibility for recurring blocker/escalation patterns.
 *
 * See domains/05-approvals-and-blockers/ for domain requirements.
 */
export declare const BLOCKER_CLASSIFICATIONS: readonly ["advisory", "blocking"];
export type BlockerClassification = (typeof BLOCKER_CLASSIFICATIONS)[number];
export declare const GATE_ACTIONS: readonly ["answer", "apply"];
export type GateAction = (typeof GATE_ACTIONS)[number];
export declare const GATE_STATES: readonly ["pending", "resolved", "expired"];
export type GateState = (typeof GATE_STATES)[number];
export interface ApprovalGate {
    id: string;
    classification: BlockerClassification;
    state: GateState;
    reason: string;
    sessionRef?: string;
    runRef?: string;
    decision?: GateDecision;
}
export interface GateDecision {
    action: GateAction;
    decidedBy: string;
    decidedAt: string;
    outcome: "approved" | "rejected" | "acknowledged" | "deferred";
    rationale: string;
}
export declare function isBlockingGate(gate: Pick<ApprovalGate, "classification">): boolean;
export declare function applyGateDecision(gate: Pick<ApprovalGate, "id" | "classification" | "state" | "reason">, decision: Omit<GateDecision, "decidedAt">): ApprovalGate;
export interface GateHistoryEntry {
    gateId: string;
    reason: string;
    classification: BlockerClassification;
    runRef: string;
}
export interface EscalationPattern {
    reason: string;
    classification: BlockerClassification;
    occurrences: number;
    runRefs: readonly string[];
}
export declare function detectEscalationPattern(history: readonly GateHistoryEntry[]): EscalationPattern[];
//# sourceMappingURL=approval-semantics.d.mts.map