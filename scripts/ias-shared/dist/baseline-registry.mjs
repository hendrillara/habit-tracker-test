/**
 * baseline-registry.mts — Baseline scope resolution registry.
 *
 * Pure, in-memory registry that answers "what baseline applies to scope X
 * at layer Y?" with explicit gap surfacing. No persistence — accepts arrays
 * of profiles and assignments and computes derived state.
 *
 * See domains/02-harness-and-policy/ for domain requirements.
 */
import { POLICY_LAYERS, resolveEffectivePolicy } from "./harness-policy.mjs";
import { BaselineError } from "./baseline-errors.mjs";
// ---------------------------------------------------------------------------
// Registry Creation
// ---------------------------------------------------------------------------
/**
 * Create a validated baseline registry from profiles and assignments.
 * Validates referential integrity and profile state constraints.
 */
export function createBaselineRegistry(profiles, assignments) {
    const profileMap = new Map();
    for (const p of profiles) {
        profileMap.set(p.id, p);
    }
    for (const assignment of assignments) {
        const profile = profileMap.get(assignment.profileId);
        if (!profile) {
            throw new BaselineError(`Assignment references non-existent profile "${assignment.profileId}"`, "PROFILE_NOT_FOUND");
        }
        if (profile.state !== "published" && profile.state !== "applied") {
            throw new BaselineError(`Assignment references profile "${assignment.profileId}" in invalid state "${profile.state}" (must be published or applied)`, "INVALID_PROFILE_IN_REGISTRY");
        }
    }
    return { profiles: profileMap, assignments };
}
// ---------------------------------------------------------------------------
// Scope Resolution
// ---------------------------------------------------------------------------
const LAYER_TO_QUERY_FIELD = {
    enterprise: "enterpriseId",
    team: "teamId",
    repo: "repoId",
};
/**
 * Resolve which baseline applies at each layer for a given scope query.
 * Returns explicit `{ status: "missing" }` for unresolved layers.
 */
export function resolveBaselineForScope(registry, query) {
    function resolveLayer(layer) {
        const queryField = LAYER_TO_QUERY_FIELD[layer];
        const targetId = query[queryField];
        if (targetId === undefined) {
            return { status: "missing" };
        }
        for (const assignment of registry.assignments) {
            if (assignment.layer === layer && assignment.targetId === targetId) {
                const profile = registry.profiles.get(assignment.profileId);
                if (profile) {
                    return { status: "resolved", profile, assignment };
                }
            }
        }
        return { status: "missing" };
    }
    return {
        enterprise: resolveLayer("enterprise"),
        team: resolveLayer("team"),
        repo: resolveLayer("repo"),
    };
}
// ---------------------------------------------------------------------------
// Effective Policy from Resolution
// ---------------------------------------------------------------------------
/**
 * Compute effective policy from a scope resolution, listing any missing layers as gaps.
 */
export function effectivePolicyFromResolution(resolution) {
    const layers = [];
    const gaps = [];
    for (const layer of POLICY_LAYERS) {
        const lr = resolution[layer];
        if (lr.status === "resolved") {
            layers.push({ layer, rules: lr.profile.rules });
        }
        else {
            gaps.push(layer);
        }
    }
    const effective = resolveEffectivePolicy(layers);
    return { effective, gaps };
}
//# sourceMappingURL=baseline-registry.mjs.map