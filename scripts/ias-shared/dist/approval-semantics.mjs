/**
 * approval-semantics.mts — Approval gate and blocker semantics.
 *
 * Pure module. Defines the minimum distinction between answer (informational)
 * and apply (authoritative), which approvals must remain explicit, and
 * governance visibility for recurring blocker/escalation patterns.
 *
 * See domains/05-approvals-and-blockers/ for domain requirements.
 */
// ---------------------------------------------------------------------------
// Blocker Classification
// ---------------------------------------------------------------------------
export const BLOCKER_CLASSIFICATIONS = ["advisory", "blocking"];
// ---------------------------------------------------------------------------
// Gate Actions
// ---------------------------------------------------------------------------
export const GATE_ACTIONS = ["answer", "apply"];
// ---------------------------------------------------------------------------
// Gate States
// ---------------------------------------------------------------------------
export const GATE_STATES = ["pending", "resolved", "expired"];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function isBlockingGate(gate) {
    return gate.classification === "blocking";
}
export function applyGateDecision(gate, decision) {
    if (gate.state !== "pending") {
        throw new Error(`Cannot apply decision to gate in state "${gate.state}"`);
    }
    if (decision.action === "apply" && gate.classification === "advisory") {
        throw new Error(`Cannot apply authoritative action to advisory gate "${gate.id}"`);
    }
    return {
        ...gate,
        state: "resolved",
        decision: { ...decision, decidedAt: new Date().toISOString() },
    };
}
const ESCALATION_THRESHOLD = 3;
export function detectEscalationPattern(history) {
    const byReason = new Map();
    for (const entry of history) {
        const existing = byReason.get(entry.reason) ?? [];
        existing.push(entry);
        byReason.set(entry.reason, existing);
    }
    const patterns = [];
    for (const [reason, entries] of byReason) {
        if (entries.length >= ESCALATION_THRESHOLD) {
            const classification = entries.some((e) => e.classification === "blocking")
                ? "blocking"
                : "advisory";
            patterns.push({
                reason,
                classification,
                occurrences: entries.length,
                runRefs: entries.map((e) => e.runRef),
            });
        }
    }
    return patterns;
}
//# sourceMappingURL=approval-semantics.mjs.map