/**
 * baseline-registry.mts — Baseline scope resolution registry.
 *
 * Pure, in-memory registry that answers "what baseline applies to scope X
 * at layer Y?" with explicit gap surfacing. No persistence — accepts arrays
 * of profiles and assignments and computes derived state.
 *
 * See domains/02-harness-and-policy/ for domain requirements.
 */
import type { HarnessProfile, BaselineAssignment, PolicyLayer } from "./harness-policy.mts";
export interface BaselineRegistry {
    /** All registered profiles, keyed by profile ID. */
    profiles: ReadonlyMap<string, HarnessProfile>;
    /** All scope assignments. */
    assignments: readonly BaselineAssignment[];
}
export interface ScopeQuery {
    enterpriseId?: string;
    teamId?: string;
    repoId?: string;
}
export type LayerResolution = {
    status: "resolved";
    profile: HarnessProfile;
    assignment: BaselineAssignment;
} | {
    status: "missing";
};
export interface ScopeResolution {
    enterprise: LayerResolution;
    team: LayerResolution;
    repo: LayerResolution;
}
/**
 * Create a validated baseline registry from profiles and assignments.
 * Validates referential integrity and profile state constraints.
 */
export declare function createBaselineRegistry(profiles: readonly HarnessProfile[], assignments: readonly BaselineAssignment[]): BaselineRegistry;
/**
 * Resolve which baseline applies at each layer for a given scope query.
 * Returns explicit `{ status: "missing" }` for unresolved layers.
 */
export declare function resolveBaselineForScope(registry: BaselineRegistry, query: ScopeQuery): ScopeResolution;
/**
 * Compute effective policy from a scope resolution, listing any missing layers as gaps.
 */
export declare function effectivePolicyFromResolution(resolution: ScopeResolution): {
    effective: Record<string, unknown>;
    gaps: PolicyLayer[];
};
//# sourceMappingURL=baseline-registry.d.mts.map