/**
 * rollout-posture.mts — Rollout posture classification and diagnostics.
 *
 * Pure module. Defines how repos and runtimes are classified relative
 * to a published governance baseline.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
import type { RuntimeHealth, RuntimeInventoryRecord } from "./runtime-inventory.mts";
export declare const ROLLOUT_POSTURE_STATES: readonly ["aligned", "drifting", "blocked", "excepted", "stale"];
export type RolloutPosture = (typeof ROLLOUT_POSTURE_STATES)[number];
export declare function isValidRolloutPostureTransition(from: RolloutPosture, to: RolloutPosture): boolean;
export interface RolloutScope {
    baselineId: string;
    targetIds: readonly string[];
    createdAt: string;
}
export interface RepoPostureRecord {
    repoId: string;
    posture: RolloutPosture;
    diagnostics?: readonly RolloutDiagnostic[];
}
export interface RolloutDiagnostic {
    repoId: string;
    cause: "baseline_not_applied" | "runtime_unhealthy" | "inventory_stale" | "exception_active" | "version_incompatible" | "unsupported_capability" | "missing_prerequisite" | "no_runtime_mapped";
    message: string;
    /** Optional structured detail for programmatic consumers. */
    detail?: RolloutDiagnosticDetail;
}
/**
 * Discriminated union of structured diagnostic detail objects.
 * Enables consumers to render specifics without parsing message strings.
 */
export type RolloutDiagnosticDetail = {
    kind: "unsupported_capability";
    required: string;
    actual: string | undefined;
} | {
    kind: "missing_prerequisite";
    prerequisite: string;
    currentState: string;
} | {
    kind: "no_runtime_mapped";
    repoId: string;
} | {
    kind: "version_incompatible";
    required: string;
    actual: string | undefined;
} | {
    kind: "runtime_unhealthy";
    runtimeId: string;
    health: string;
};
/**
 * Describes what a repo needs from its runtime for the baseline to be
 * considered aligned. All fields are optional — checks are skipped for
 * fields that are not populated.
 */
export interface RepoRuntimeRequirements {
    repoId: string;
    /** Minimum runtime version required by the baseline. */
    minimumVersion?: string;
    /**
     * Required execution modes (e.g., ["hybrid"]).
     * Stub: retained from spec for forward-compatibility with LUC-34.
     * No check is performed until RuntimeInventoryRecord exposes execution mode data.
     */
    requiredExecutionModes?: readonly string[];
    /** Whether the repo requires write access. */
    requiresWrite?: boolean;
    /**
     * Whether the repo requires network access.
     * Stub: retained from spec for forward-compatibility with LUC-34.
     * No check is performed until RuntimeInventoryRecord exposes network capability data.
     */
    requiresNetwork?: boolean;
    /** The repo's current capability state (discovered / attached / managed). */
    capabilityState?: import("./capability-states.mts").RepoCapabilityState;
}
export interface RepoPostureInput {
    baselineApplied: boolean;
    runtimeHealth: RuntimeHealth;
    hasActiveException: boolean;
    inventoryFresh: boolean;
}
/**
 * Classify a repo's rollout posture.
 * Precedence: stale > blocked > excepted > drifting > aligned
 */
export declare function classifyRepoPosture(input: RepoPostureInput): RolloutPosture;
export interface RolloutSummary {
    total: number;
    aligned: number;
    drifting: number;
    blocked: number;
    excepted: number;
    stale: number;
}
export declare function computeRolloutSummary(repos: readonly Pick<RepoPostureRecord, "posture">[]): RolloutSummary;
/**
 * Generate a human-readable diagnostic message from a cause code and
 * optional structured detail.
 */
export declare function buildDiagnosticMessage(cause: RolloutDiagnostic["cause"], detail?: RolloutDiagnosticDetail): string;
export interface RuntimeSupportResult {
    supported: boolean;
    diagnostics: RolloutDiagnostic[];
}
/**
 * Check whether a runtime supports a repo's requirements.
 *
 * Note on stub fields (cross-ticket resolution):
 * - `requiredExecutionModes` and `requiresNetwork` are retained in
 *   `RepoRuntimeRequirements` for forward-compatibility with LUC-34, but
 *   no checks are performed here because `RuntimeInventoryRecord` does not
 *   yet expose execution mode or network capability data.
 */
export declare function checkRuntimeSupport(repoReqs: RepoRuntimeRequirements, runtime: RuntimeInventoryRecord): RuntimeSupportResult;
export interface BatchPostureInput {
    repos: readonly RepoRuntimeRequirements[];
    runtimes: readonly RuntimeInventoryRecord[];
    baseline: {
        id: string;
        minimumVersion?: string;
    };
    exceptions: readonly {
        repoId: string;
        active: boolean;
    }[];
    /** Staleness threshold for runtime inventory in days. */
    staleDays: number;
}
export interface BatchPostureResult {
    records: RepoPostureRecord[];
    summary: RolloutSummary;
    diagnostics: RolloutDiagnostic[];
}
/**
 * Compute rollout posture for every repo in a scope.
 *
 * Cross-ticket resolution notes (1.4):
 * - LUC-33 owns rollout posture (`aligned | drifting | blocked | excepted | stale`).
 * - LUC-32 owns runtime health (`healthy | degraded | unreachable | stale`).
 * - LUC-34 consumes both taxonomies — it does NOT create a third.
 *
 * effectiveHealth precedence note:
 * If the runtime is already degraded or unreachable, that health stands.
 * If the runtime is healthy but checkRuntimeSupport fails, the effective
 * health is downgraded to "degraded" so posture resolves to "blocked"
 * (unless stale takes higher precedence). The stale check via
 * inventoryFresh is always applied first by classifyRepoPosture.
 */
export declare function computeBatchRolloutPosture(input: BatchPostureInput): BatchPostureResult;
//# sourceMappingURL=rollout-posture.d.mts.map