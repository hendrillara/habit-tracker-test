/**
 * deployment-health.mts — Deployment health aggregation for governance views.
 *
 * Pure module. Combines runtime inventory and rollout posture into
 * an aggregate health model for governance leads.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
import type { RuntimeHealth } from "./runtime-inventory.mts";
import type { RolloutPosture, RolloutDiagnostic, RolloutSummary } from "./rollout-posture.mts";
export interface RuntimeSummary {
    total: number;
    healthy: number;
    degraded: number;
    unreachable: number;
    stale: number;
}
export interface DeploymentHealthView {
    runtimeSummary: RuntimeSummary;
    rolloutSummary: RolloutSummary;
    computedAt: string;
}
export interface InventoryInput {
    id: string;
    health: RuntimeHealth;
    version?: string;
    lastSeenAt?: string;
}
export interface DeploymentHealthInput {
    inventoryRecords: readonly InventoryInput[];
    rolloutPostures: readonly {
        repoId: string;
        posture: RolloutPosture;
    }[];
}
export declare function computeDeploymentHealth(input: DeploymentHealthInput): DeploymentHealthView;
export declare const DIAGNOSTIC_CATEGORIES: readonly ["rollout_friction", "product_defect"];
export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];
export declare function groupDiagnosticsByCause(diagnostics: readonly RolloutDiagnostic[]): Record<DiagnosticCategory, RolloutDiagnostic[]>;
//# sourceMappingURL=deployment-health.d.mts.map