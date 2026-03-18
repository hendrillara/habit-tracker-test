/**
 * runtime-inventory.mts — Runtime inventory records and health classification.
 *
 * Pure module. Defines how local runtimes are tracked, their health
 * classified, and completeness validated for governance visibility.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
// ---------------------------------------------------------------------------
// Runtime Health
// ---------------------------------------------------------------------------
export const RUNTIME_HEALTH_STATES = ["healthy", "degraded", "unreachable", "stale"];
/**
 * Classify runtime health based on freshness and version compatibility.
 * Precedence: unreachable > stale > degraded > healthy
 */
export function classifyRuntimeHealth(input) {
    if (!input.lastSeenAt)
        return "unreachable";
    const lastSeen = new Date(input.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeen))
        return "unreachable";
    const staleThreshold = input.staleDays * 24 * 60 * 60 * 1000;
    if (Date.now() - lastSeen > staleThreshold)
        return "stale";
    if (input.version && input.minimumVersion && !isVersionCompatible(input.version, input.minimumVersion)) {
        return "degraded";
    }
    return "healthy";
}
// ---------------------------------------------------------------------------
// Version Comparison (simple semver major.minor.patch)
// ---------------------------------------------------------------------------
function parseVersion(v) {
    const parts = v.split(".").map(Number);
    if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p)))
        return null;
    return parts;
}
function isVersionCompatible(actual, minimum) {
    const a = parseVersion(actual);
    const m = parseVersion(minimum);
    // Unparseable versions cannot be compared — skip version check, don't penalize.
    if (!a || !m)
        return true;
    if (a[0] !== m[0])
        return a[0] > m[0];
    if (a[1] !== m[1])
        return a[1] > m[1];
    return a[2] >= m[2];
}
// ---------------------------------------------------------------------------
// Completeness Check
// ---------------------------------------------------------------------------
export function isRuntimeInventoryComplete(record) {
    return !!(record.id &&
        record.version &&
        record.lastSeenAt &&
        record.health &&
        record.capabilityState);
}
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createInventoryRecord(input) {
    return { ...input, updatedAt: new Date().toISOString() };
}
//# sourceMappingURL=runtime-inventory.mjs.map