/**
 * pilot-review.mts — Pilot review assembly for stakeholder visibility.
 *
 * Pure module. Aggregates pilot scope, success signals, rollout posture,
 * and checkpoint results into a review-ready summary.
 *
 * See domains/08-enterprise-governance-and-rollout/.
 */
// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------
export const PILOT_READINESS_STATES = ["ready", "not_ready", "incomplete"];
export function assemblePilotReview(input) {
    const blockers = [];
    if (input.signalHealth.status === "at_risk") {
        for (const s of input.signalHealth.belowTarget) {
            blockers.push(`Signal "${s.name}" below target: ${s.value} < ${s.target}`);
        }
    }
    if (input.signalHealth.status === "incomplete") {
        for (const s of input.signalHealth.missingTarget) {
            blockers.push(`Signal "${s.name}" has no target defined`);
        }
    }
    if (input.signalHealth.missingCategories && input.signalHealth.missingCategories.length > 0) {
        blockers.push(`Missing instrumentation for: ${input.signalHealth.missingCategories.join(", ")}`);
    }
    if (input.signalHealth.unevidenced && input.signalHealth.unevidenced.length > 0) {
        blockers.push(`${input.signalHealth.unevidenced.length} signal(s) lack evidence provenance`);
    }
    const failedCheckpoints = input.checkpointResults.filter((c) => !c.passed);
    for (const cp of failedCheckpoints) {
        blockers.push(`Checkpoint "${cp.name}" failed: ${cp.failedCriteria.map((c) => c.name).join(", ")}`);
    }
    if (input.rolloutSummary.blocked > 0) {
        blockers.push(`${input.rolloutSummary.blocked} repos blocked in rollout`);
    }
    let readiness;
    if (input.signalHealth.status === "incomplete")
        readiness = "incomplete";
    else if (blockers.length > 0)
        readiness = "not_ready";
    else
        readiness = "ready";
    return {
        ...input,
        readiness,
        blockers,
        computedAt: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Rollout Readiness Description
// ---------------------------------------------------------------------------
export function describeRolloutReadiness(review) {
    if (review.readiness === "ready") {
        return `Pilot "${review.pilotId}" is ready for expansion (${review.rolloutSummary.aligned}/${review.rolloutSummary.total} repos aligned).`;
    }
    if (review.readiness === "incomplete") {
        return `Pilot "${review.pilotId}" has incomplete signal data — cannot assess readiness.`;
    }
    return `Pilot "${review.pilotId}" is not ready: ${review.blockers.join("; ")}`;
}
//# sourceMappingURL=pilot-review.mjs.map