/**
 * success-signals.mts — Transformation success signal snapshots.
 *
 * Pure module. Defines how governed execution evidence is aggregated
 * into success metrics for pilot and rollout review.
 *
 * See domains/08-enterprise-governance-and-rollout/ and domains/06-evidence-and-results/.
 */
// ---------------------------------------------------------------------------
// Signal Categories
// ---------------------------------------------------------------------------
export const SIGNAL_CATEGORIES = ["quality", "reliability", "governance", "rollout"];
// ---------------------------------------------------------------------------
// Missing Category Detection
// ---------------------------------------------------------------------------
export function detectMissingCategories(signals) {
    const present = new Set(signals.map((s) => s.category));
    return SIGNAL_CATEGORIES.filter((c) => !present.has(c));
}
export function createSuccessSnapshot(input) {
    const missingCategories = detectMissingCategories(input.signals);
    const evidenceCount = input.signals.reduce((sum, s) => sum + s.evidence.length, 0);
    return {
        pilotId: input.pilotId,
        signals: [...input.signals],
        missingCategories,
        evidenceCount,
        computedAt: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Signal Health
// ---------------------------------------------------------------------------
export const SIGNAL_HEALTH_STATUSES = ["healthy", "at_risk", "incomplete"];
export function computeSignalHealth(signals) {
    const missingTarget = signals.filter((s) => s.target === undefined);
    const belowTarget = signals.filter((s) => s.target !== undefined && s.value < s.target);
    const missingCategories = detectMissingCategories(signals);
    const unevidenced = signals.filter((s) => s.evidence.length === 0);
    let status;
    if (missingCategories.length > 0 || unevidenced.length > 0)
        status = "incomplete";
    else if (missingTarget.length > 0)
        status = "incomplete";
    else if (belowTarget.length > 0)
        status = "at_risk";
    else
        status = "healthy";
    return { status, belowTarget, missingTarget, missingCategories, unevidenced };
}
// ---------------------------------------------------------------------------
// Incomplete Signal Description
// ---------------------------------------------------------------------------
export function describeIncompleteSignals(signals) {
    return signals
        .filter((s) => s.target === undefined)
        .map((s) => `${s.category}/${s.name}: value=${s.value}, no target defined`);
}
// ---------------------------------------------------------------------------
// Snapshot Gap Description
// ---------------------------------------------------------------------------
export function describeSnapshotGaps(snapshot) {
    const gaps = [];
    for (const cat of snapshot.missingCategories) {
        gaps.push(`${cat}: no signals instrumented`);
    }
    for (const s of snapshot.signals) {
        if (s.evidence.length === 0) {
            gaps.push(`${s.category}/${s.name}: value=${s.value}, no evidence provenance`);
        }
        if (s.target === undefined) {
            gaps.push(`${s.category}/${s.name}: value=${s.value}, no target defined`);
        }
    }
    return gaps;
}
function deriveQualitySignals(evidence, targets) {
    const runOutcomes = evidence.filter((e) => e.kind === "run_outcome");
    const validatorResults = evidence.filter((e) => e.kind === "validator_result");
    const signals = [];
    if (runOutcomes.length > 0) {
        const completed = runOutcomes.filter((e) => e.payload.outcome === "completed").length;
        const passRate = completed / runOutcomes.length;
        signals.push({
            name: "pass_rate",
            category: "quality",
            value: Math.round(passRate * 1000) / 1000,
            target: targets["pass_rate"],
            unit: "ratio",
            evidence: runOutcomes.map((e) => ({
                sourceId: e.id,
                sourceType: e.kind,
                producedAt: e.producedAt,
            })),
        });
    }
    if (validatorResults.length > 0) {
        const passed = validatorResults.filter((e) => e.payload.passed === true).length;
        const validatorPassRate = passed / validatorResults.length;
        signals.push({
            name: "validator_pass_rate",
            category: "quality",
            value: Math.round(validatorPassRate * 1000) / 1000,
            target: targets["validator_pass_rate"],
            unit: "ratio",
            evidence: validatorResults.map((e) => ({
                sourceId: e.id,
                sourceType: e.kind,
                producedAt: e.producedAt,
            })),
        });
    }
    return signals;
}
function deriveReliabilitySignals(evidence, targets) {
    const runOutcomes = evidence.filter((e) => e.kind === "run_outcome");
    if (runOutcomes.length === 0)
        return [];
    const failed = runOutcomes.filter((e) => e.payload.outcome === "failed").length;
    const failureRate = failed / runOutcomes.length;
    return [
        {
            name: "failure_rate",
            category: "reliability",
            value: Math.round(failureRate * 1000) / 1000,
            target: targets["failure_rate"],
            unit: "ratio",
            evidence: runOutcomes.map((e) => ({
                sourceId: e.id,
                sourceType: e.kind,
                producedAt: e.producedAt,
            })),
        },
    ];
}
function deriveGovernanceSignals(evidence, targets) {
    const approvalDecisions = evidence.filter((e) => e.kind === "approval_decision");
    if (approvalDecisions.length === 0)
        return [];
    const approved = approvalDecisions.filter((e) => e.payload.decision === "approved").length;
    const approvalRate = approved / approvalDecisions.length;
    return [
        {
            name: "approval_coverage",
            category: "governance",
            value: Math.round(approvalRate * 1000) / 1000,
            target: targets["approval_coverage"],
            unit: "ratio",
            evidence: approvalDecisions.map((e) => ({
                sourceId: e.id,
                sourceType: e.kind,
                producedAt: e.producedAt,
            })),
        },
    ];
}
function deriveRolloutSignals(evidence, targets) {
    const postureChanges = evidence.filter((e) => e.kind === "rollout_posture_change");
    if (postureChanges.length === 0)
        return [];
    // Use the latest posture change to compute alignment.
    const sorted = [...postureChanges].sort((a, b) => new Date(b.producedAt).getTime() - new Date(a.producedAt).getTime());
    const latest = sorted[0];
    const totalRepos = Number(latest.payload.totalRepos ?? 0);
    const alignedRepos = Number(latest.payload.alignedRepos ?? 0);
    const alignmentRate = totalRepos > 0 ? alignedRepos / totalRepos : 0;
    return [
        {
            name: "alignment_rate",
            category: "rollout",
            value: Math.round(alignmentRate * 1000) / 1000,
            target: targets["alignment_rate"],
            unit: "ratio",
            evidence: [
                {
                    sourceId: latest.id,
                    sourceType: latest.kind,
                    producedAt: latest.producedAt,
                },
            ],
        },
    ];
}
export function computeSignalsFromEvidence(input) {
    const targets = input.targets ?? {};
    const signals = [
        ...deriveQualitySignals(input.evidence, targets),
        ...deriveReliabilitySignals(input.evidence, targets),
        ...deriveGovernanceSignals(input.evidence, targets),
        ...deriveRolloutSignals(input.evidence, targets),
    ];
    const missingCategories = detectMissingCategories(signals);
    const evidenceCount = input.evidence.length;
    return {
        pilotId: input.pilotId,
        signals,
        missingCategories,
        evidenceCount,
        computedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=success-signals.mjs.map