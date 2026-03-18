/**
 * deployment-health.mts — Deployment health aggregation for governance views.
 *
 * Pure module. Combines runtime inventory and rollout posture into
 * an aggregate health model for governance leads.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
// Value import requires .mjs extension under NodeNext (type imports use .mts).
import { computeRolloutSummary } from "./rollout-posture.mjs";
export function computeDeploymentHealth(input) {
    const runtimeSummary = {
        total: input.inventoryRecords.length,
        healthy: 0,
        degraded: 0,
        unreachable: 0,
        stale: 0,
    };
    for (const record of input.inventoryRecords) {
        runtimeSummary[record.health]++;
    }
    return {
        runtimeSummary,
        rolloutSummary: computeRolloutSummary(input.rolloutPostures),
        computedAt: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Diagnostic Grouping
// ---------------------------------------------------------------------------
export const DIAGNOSTIC_CATEGORIES = ["rollout_friction", "product_defect"];
const CAUSE_CATEGORY = {
    baseline_not_applied: "rollout_friction",
    runtime_unhealthy: "product_defect",
    inventory_stale: "rollout_friction",
    exception_active: "rollout_friction",
    version_incompatible: "product_defect",
    // New causes (LUC-33)
    unsupported_capability: "product_defect",
    missing_prerequisite: "rollout_friction",
    no_runtime_mapped: "rollout_friction",
};
export function groupDiagnosticsByCause(diagnostics) {
    const groups = {
        rollout_friction: [],
        product_defect: [],
    };
    for (const d of diagnostics) {
        const category = CAUSE_CATEGORY[d.cause];
        groups[category].push(d);
    }
    return groups;
}
//# sourceMappingURL=deployment-health.mjs.map