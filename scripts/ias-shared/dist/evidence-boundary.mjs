/**
 * evidence-boundary.mts — Evidence residence classification and boundary summary.
 *
 * Pure module. Defines how evidence is classified by durability
 * and where it resides, for compliance and governance transparency.
 *
 * See domains/06-evidence-and-results/ and domains/08-enterprise-governance-and-rollout/.
 */
// ---------------------------------------------------------------------------
// Evidence Residence
// ---------------------------------------------------------------------------
export const EVIDENCE_RESIDENCES = ["durable", "local_only", "transient"];
// ---------------------------------------------------------------------------
// Storage Type → Residence Mapping
// ---------------------------------------------------------------------------
export const STORAGE_TYPES = ["git_tracked", "control_plane", "git_internal", "local_filesystem", "memory"];
const STORAGE_RESIDENCE_MAP = {
    git_tracked: "durable",
    control_plane: "durable",
    git_internal: "transient",
    local_filesystem: "local_only",
    memory: "transient",
};
export function classifyEvidenceResidence(input) {
    return STORAGE_RESIDENCE_MAP[input.storageType];
}
// ---------------------------------------------------------------------------
// Boundary Description
// ---------------------------------------------------------------------------
export function describeEvidenceBoundary(items) {
    const durable = items.filter((i) => i.residence === "durable");
    const localOnly = items.filter((i) => i.residence === "local_only");
    const transient = items.filter((i) => i.residence === "transient");
    const parts = [];
    if (durable.length > 0)
        parts.push(`${durable.length} durable (git-tracked or control-plane)`);
    if (localOnly.length > 0)
        parts.push(`${localOnly.length} local-only (not replicated)`);
    if (transient.length > 0)
        parts.push(`${transient.length} transient (runtime-only)`);
    return `Evidence boundary: ${parts.join(", ") || "no evidence items"}`;
}
export function computeEvidenceBoundarySummary(items) {
    const summary = { total: items.length, durable: 0, local_only: 0, transient: 0 };
    for (const { residence } of items) {
        summary[residence]++;
    }
    return summary;
}
//# sourceMappingURL=evidence-boundary.mjs.map