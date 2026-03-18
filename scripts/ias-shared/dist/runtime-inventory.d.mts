/**
 * runtime-inventory.mts — Runtime inventory records and health classification.
 *
 * Pure module. Defines how local runtimes are tracked, their health
 * classified, and completeness validated for governance visibility.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
import type { RepoCapabilityState } from "./capability-states.mts";
export declare const RUNTIME_HEALTH_STATES: readonly ["healthy", "degraded", "unreachable", "stale"];
export type RuntimeHealth = (typeof RUNTIME_HEALTH_STATES)[number];
export interface RuntimeInventoryRecord {
    id: string;
    machineId?: string;
    version?: string;
    lastSeenAt?: string;
    health: RuntimeHealth;
    capabilityState?: RepoCapabilityState;
    repoIds?: readonly string[];
    updatedAt: string;
}
export interface HealthClassificationInput {
    lastSeenAt?: string;
    version?: string;
    minimumVersion?: string;
    staleDays: number;
}
/**
 * Classify runtime health based on freshness and version compatibility.
 * Precedence: unreachable > stale > degraded > healthy
 */
export declare function classifyRuntimeHealth(input: HealthClassificationInput): RuntimeHealth;
export declare function isRuntimeInventoryComplete(record: Partial<RuntimeInventoryRecord>): boolean;
export declare function createInventoryRecord(input: Omit<RuntimeInventoryRecord, "updatedAt">): RuntimeInventoryRecord;
//# sourceMappingURL=runtime-inventory.d.mts.map