/**
 * governance-surfaces.mts — Buyer/governance compliance view assembly.
 *
 * Pure module. Aggregates evidence boundary, compliance posture, and
 * rollout data into governance-facing views that degrade honestly
 * when information is incomplete.
 *
 * See domains/07-operator-and-team-surfaces/ and domains/08-enterprise-governance-and-rollout/.
 */
// ---------------------------------------------------------------------------
// Governance View
// ---------------------------------------------------------------------------
export const GOVERNANCE_COMPLETENESS_LEVELS = ["complete", "incomplete", "minimal"];
export function assembleGovernanceView(input) {
    const missingAreas = [];
    if (!input.evidenceBoundary)
        missingAreas.push("evidence boundary data");
    if (!input.compliancePosture)
        missingAreas.push("compliance posture data");
    else if (input.compliancePosture.missing > 0)
        missingAreas.push("some compliance postures not declared");
    else if (input.compliancePosture.partial > 0)
        missingAreas.push("some compliance postures only partially declared");
    if (!input.rolloutSummary)
        missingAreas.push("rollout posture data");
    let completeness;
    const provided = [input.evidenceBoundary, input.compliancePosture, input.rolloutSummary].filter(Boolean).length;
    if (provided === 3 && missingAreas.length === 0)
        completeness = "complete";
    else if (provided >= 1)
        completeness = "incomplete";
    else
        completeness = "minimal";
    return {
        ...input,
        completeness,
        missingAreas,
        computedAt: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Missing Posture Description
// ---------------------------------------------------------------------------
export function describeMissingPostures(postures) {
    const missing = [];
    for (const [key, posture] of Object.entries(postures)) {
        if (posture.status === "missing") {
            missing.push(`${posture.category} (${key}): not declared`);
        }
        else if (posture.status === "partial") {
            missing.push(`${posture.category} (${key}): partially declared`);
        }
    }
    return missing;
}
//# sourceMappingURL=governance-surfaces.mjs.map