/**
 * governance-surfaces.mts — Buyer/governance compliance view assembly.
 *
 * Pure module. Aggregates evidence boundary, compliance posture, and
 * rollout data into governance-facing views that degrade honestly
 * when information is incomplete.
 *
 * See domains/07-operator-and-team-surfaces/ and domains/08-enterprise-governance-and-rollout/.
 */
import type { EvidenceBoundarySummary } from "./evidence-boundary.mts";
import type { CompliancePostureSummary, PostureBase } from "./compliance-posture.mts";
import type { RolloutSummary } from "./rollout-posture.mts";
export type RolloutSummaryInput = RolloutSummary;
export declare const GOVERNANCE_COMPLETENESS_LEVELS: readonly ["complete", "incomplete", "minimal"];
export type GovernanceCompleteness = (typeof GOVERNANCE_COMPLETENESS_LEVELS)[number];
export interface GovernanceView {
    evidenceBoundary?: EvidenceBoundarySummary;
    compliancePosture?: CompliancePostureSummary;
    rolloutSummary?: RolloutSummaryInput;
    completeness: GovernanceCompleteness;
    missingAreas: readonly string[];
    computedAt: string;
}
export interface GovernanceViewInput {
    evidenceBoundary?: EvidenceBoundarySummary;
    compliancePosture?: CompliancePostureSummary;
    rolloutSummary?: RolloutSummaryInput;
}
export declare function assembleGovernanceView(input: GovernanceViewInput): GovernanceView;
export declare function describeMissingPostures(postures: Record<string, Pick<PostureBase, "status" | "category">>): string[];
//# sourceMappingURL=governance-surfaces.d.mts.map