/**
 * evidence-boundary.mts — Evidence residence classification and boundary summary.
 *
 * Pure module. Defines how evidence is classified by durability
 * and where it resides, for compliance and governance transparency.
 *
 * See domains/06-evidence-and-results/ and domains/08-enterprise-governance-and-rollout/.
 */
export declare const EVIDENCE_RESIDENCES: readonly ["durable", "local_only", "transient"];
export type EvidenceResidence = (typeof EVIDENCE_RESIDENCES)[number];
export declare const STORAGE_TYPES: readonly ["git_tracked", "control_plane", "git_internal", "local_filesystem", "memory"];
export type StorageType = (typeof STORAGE_TYPES)[number];
export declare function classifyEvidenceResidence(input: {
    storageType: StorageType;
}): EvidenceResidence;
export interface EvidenceBoundaryItem {
    id: string;
    description: string;
    residence: EvidenceResidence;
    storageType?: StorageType;
}
export declare function describeEvidenceBoundary(items: readonly EvidenceBoundaryItem[]): string;
export interface EvidenceBoundarySummary {
    total: number;
    durable: number;
    local_only: number;
    transient: number;
}
export declare function computeEvidenceBoundarySummary(items: readonly Pick<EvidenceBoundaryItem, "residence">[]): EvidenceBoundarySummary;
//# sourceMappingURL=evidence-boundary.d.mts.map