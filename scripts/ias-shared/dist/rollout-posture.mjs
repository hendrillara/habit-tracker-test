/**
 * rollout-posture.mts — Rollout posture classification and diagnostics.
 *
 * Pure module. Defines how repos and runtimes are classified relative
 * to a published governance baseline.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
// Value import requires .mjs extension under NodeNext (type imports use .mts).
import { classifyRuntimeHealth } from "./runtime-inventory.mjs";
// ---------------------------------------------------------------------------
// Rollout Posture States
// ---------------------------------------------------------------------------
export const ROLLOUT_POSTURE_STATES = [
    "aligned",
    "drifting",
    "blocked",
    "excepted",
    "stale",
];
const VALID_TRANSITIONS = {
    aligned: ["drifting", "blocked", "stale"],
    drifting: ["aligned", "excepted", "blocked"],
    blocked: ["aligned", "excepted"],
    excepted: ["aligned", "drifting"],
    stale: ["aligned", "drifting", "blocked"],
};
export function isValidRolloutPostureTransition(from, to) {
    return VALID_TRANSITIONS[from].includes(to);
}
/**
 * Classify a repo's rollout posture.
 * Precedence: stale > blocked > excepted > drifting > aligned
 */
export function classifyRepoPosture(input) {
    if (!input.inventoryFresh)
        return "stale";
    if (input.runtimeHealth === "degraded" || input.runtimeHealth === "unreachable")
        return "blocked";
    if (input.hasActiveException)
        return "excepted";
    if (!input.baselineApplied)
        return "drifting";
    return "aligned";
}
export function computeRolloutSummary(repos) {
    const summary = {
        total: repos.length,
        aligned: 0,
        drifting: 0,
        blocked: 0,
        excepted: 0,
        stale: 0,
    };
    for (const { posture } of repos) {
        summary[posture]++;
    }
    return summary;
}
// ---------------------------------------------------------------------------
// Diagnostic Message Builder
// ---------------------------------------------------------------------------
/**
 * Generate a human-readable diagnostic message from a cause code and
 * optional structured detail.
 */
export function buildDiagnosticMessage(cause, detail) {
    switch (cause) {
        case "baseline_not_applied":
            return "Baseline has not been applied to this repo.";
        case "runtime_unhealthy": {
            const d = detail;
            return d ? `Runtime ${d.runtimeId} is ${d.health}.` : "Runtime is unhealthy.";
        }
        case "inventory_stale":
            return "Runtime inventory is stale. Posture cannot be determined until inventory is refreshed.";
        case "exception_active":
            return "An active governance exception is in place for this repo.";
        case "version_incompatible": {
            const d = detail;
            if (d?.actual)
                return `Runtime version ${d.actual} is below the required minimum ${d.required}.`;
            return `Runtime version is unknown. Required minimum: ${d?.required ?? "unspecified"}.`;
        }
        case "unsupported_capability": {
            const d = detail;
            if (d)
                return `Runtime does not support required capability: ${d.required}.`;
            return "Runtime does not support a required capability.";
        }
        case "missing_prerequisite": {
            const d = detail;
            if (d)
                return `Repo must reach ${d.prerequisite} state before baseline rollout. Current state: ${d.currentState}.`;
            return "A prerequisite for baseline rollout is not met.";
        }
        case "no_runtime_mapped":
            return "No runtime is mapped to this repo.";
        default:
            return "Unknown diagnostic cause.";
    }
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
export function checkRuntimeSupport(repoReqs, runtime) {
    const diagnostics = [];
    // Version check
    if (repoReqs.minimumVersion && runtime.version) {
        const actualParts = runtime.version.split(".").map(Number);
        const requiredParts = repoReqs.minimumVersion.split(".").map(Number);
        if (actualParts.length === 3 &&
            requiredParts.length === 3 &&
            actualParts.every((p) => Number.isFinite(p)) &&
            requiredParts.every((p) => Number.isFinite(p))) {
            const below = actualParts[0] < requiredParts[0] ||
                (actualParts[0] === requiredParts[0] && actualParts[1] < requiredParts[1]) ||
                (actualParts[0] === requiredParts[0] && actualParts[1] === requiredParts[1] && actualParts[2] < requiredParts[2]);
            if (below) {
                diagnostics.push({
                    repoId: repoReqs.repoId,
                    cause: "version_incompatible",
                    message: buildDiagnosticMessage("version_incompatible", {
                        kind: "version_incompatible",
                        required: repoReqs.minimumVersion,
                        actual: runtime.version,
                    }),
                    detail: { kind: "version_incompatible", required: repoReqs.minimumVersion, actual: runtime.version },
                });
            }
        }
    }
    else if (repoReqs.minimumVersion && !runtime.version) {
        diagnostics.push({
            repoId: repoReqs.repoId,
            cause: "version_incompatible",
            message: buildDiagnosticMessage("version_incompatible", {
                kind: "version_incompatible",
                required: repoReqs.minimumVersion,
                actual: undefined,
            }),
            detail: { kind: "version_incompatible", required: repoReqs.minimumVersion, actual: undefined },
        });
    }
    // Capability state check — discovered repos cannot run governed execution
    if (repoReqs.capabilityState === "discovered") {
        diagnostics.push({
            repoId: repoReqs.repoId,
            cause: "missing_prerequisite",
            message: buildDiagnosticMessage("missing_prerequisite", {
                kind: "missing_prerequisite",
                prerequisite: "managed",
                currentState: "discovered",
            }),
            detail: { kind: "missing_prerequisite", prerequisite: "managed", currentState: "discovered" },
        });
    }
    // Write capability check
    if (repoReqs.requiresWrite && runtime.capabilityState && runtime.capabilityState !== "managed") {
        diagnostics.push({
            repoId: repoReqs.repoId,
            cause: "unsupported_capability",
            message: buildDiagnosticMessage("unsupported_capability", {
                kind: "unsupported_capability",
                required: "write_access",
                actual: `capabilityState:${runtime.capabilityState}`,
            }),
            detail: {
                kind: "unsupported_capability",
                required: "write_access",
                actual: `capabilityState:${runtime.capabilityState}`,
            },
        });
    }
    // NOTE: requiredExecutionModes and requiresNetwork are stub fields.
    // Checks will be added when RuntimeInventoryRecord gains the relevant
    // capability data (expected in LUC-34).
    return { supported: diagnostics.length === 0, diagnostics };
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
export function computeBatchRolloutPosture(input) {
    const { repos, runtimes, baseline, exceptions, staleDays } = input;
    // Build runtime-to-repo mapping
    const runtimesByRepo = new Map();
    for (const rt of runtimes) {
        if (rt.repoIds) {
            for (const repoId of rt.repoIds) {
                let list = runtimesByRepo.get(repoId);
                if (!list) {
                    list = [];
                    runtimesByRepo.set(repoId, list);
                }
                list.push(rt);
            }
        }
    }
    // Build exceptions lookup
    const exceptionByRepo = new Map();
    for (const exc of exceptions) {
        exceptionByRepo.set(exc.repoId, exc.active);
    }
    const records = [];
    const allDiagnostics = [];
    for (const repo of repos) {
        const repoDiagnostics = [];
        const mappedRuntimes = runtimesByRepo.get(repo.repoId) ?? [];
        // No runtime mapped
        if (mappedRuntimes.length === 0) {
            repoDiagnostics.push({
                repoId: repo.repoId,
                cause: "no_runtime_mapped",
                message: buildDiagnosticMessage("no_runtime_mapped"),
                detail: { kind: "no_runtime_mapped", repoId: repo.repoId },
            });
            records.push({ repoId: repo.repoId, posture: "blocked", diagnostics: repoDiagnostics });
            allDiagnostics.push(...repoDiagnostics);
            continue;
        }
        // Select best runtime (healthiest, most recent)
        const HEALTH_ORDER = { healthy: 0, degraded: 1, stale: 2, unreachable: 3 };
        const classifiedRuntimes = mappedRuntimes.map((rt) => ({
            runtime: rt,
            health: classifyRuntimeHealth({
                lastSeenAt: rt.lastSeenAt,
                version: rt.version,
                minimumVersion: baseline.minimumVersion,
                staleDays,
            }),
        }));
        classifiedRuntimes.sort((a, b) => {
            const healthDiff = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
            if (healthDiff !== 0)
                return healthDiff;
            const aTime = a.runtime.lastSeenAt ? new Date(a.runtime.lastSeenAt).getTime() : 0;
            const bTime = b.runtime.lastSeenAt ? new Date(b.runtime.lastSeenAt).getTime() : 0;
            return bTime - aTime;
        });
        const selected = classifiedRuntimes[0];
        const runtimeHealth = selected.health;
        // Check inventory freshness
        const inventoryFresh = runtimeHealth !== "stale";
        if (!inventoryFresh) {
            repoDiagnostics.push({
                repoId: repo.repoId,
                cause: "inventory_stale",
                message: buildDiagnosticMessage("inventory_stale"),
            });
        }
        // Check runtime support
        const supportResult = checkRuntimeSupport({ ...repo, minimumVersion: repo.minimumVersion ?? baseline.minimumVersion }, selected.runtime);
        repoDiagnostics.push(...supportResult.diagnostics);
        // Determine effective health.
        // If the runtime is already degraded or unreachable, keep that status.
        // If the runtime reports healthy/stale but support checks fail, downgrade
        // to "degraded" so posture resolves to "blocked". The stale precedence
        // in classifyRepoPosture ensures stale inventory is never masked.
        const effectiveHealth = runtimeHealth === "degraded" || runtimeHealth === "unreachable"
            ? runtimeHealth
            : !supportResult.supported
                ? "degraded"
                : runtimeHealth;
        if (effectiveHealth === "degraded" || effectiveHealth === "unreachable") {
            repoDiagnostics.push({
                repoId: repo.repoId,
                cause: "runtime_unhealthy",
                message: buildDiagnosticMessage("runtime_unhealthy", {
                    kind: "runtime_unhealthy",
                    runtimeId: selected.runtime.id,
                    health: effectiveHealth,
                }),
                detail: { kind: "runtime_unhealthy", runtimeId: selected.runtime.id, health: effectiveHealth },
            });
        }
        // Check baseline application
        const baselineApplied = repo.capabilityState === "managed";
        if (!baselineApplied) {
            repoDiagnostics.push({
                repoId: repo.repoId,
                cause: "baseline_not_applied",
                message: buildDiagnosticMessage("baseline_not_applied"),
            });
        }
        // Check exception
        const hasActiveException = exceptionByRepo.get(repo.repoId) ?? false;
        if (hasActiveException) {
            repoDiagnostics.push({
                repoId: repo.repoId,
                cause: "exception_active",
                message: buildDiagnosticMessage("exception_active"),
            });
        }
        // Classify posture
        const posture = classifyRepoPosture({
            baselineApplied,
            runtimeHealth: effectiveHealth,
            hasActiveException,
            inventoryFresh,
        });
        records.push({ repoId: repo.repoId, posture, diagnostics: repoDiagnostics });
        allDiagnostics.push(...repoDiagnostics);
    }
    // Post-computation invariant: stale inventory must never appear aligned.
    // Defense-in-depth — classifyRepoPosture handles this via precedence,
    // but the batch-level assertion catches regressions if the precedence
    // logic is ever refactored.
    for (const record of records) {
        if (record.posture === "aligned") {
            const mapped = runtimesByRepo.get(record.repoId) ?? [];
            for (const rt of mapped) {
                const h = classifyRuntimeHealth({
                    lastSeenAt: rt.lastSeenAt,
                    version: rt.version,
                    minimumVersion: baseline.minimumVersion,
                    staleDays,
                });
                if (h === "stale") {
                    throw new Error(`Invariant violation: repo ${record.repoId} has stale runtime inventory but posture is aligned`);
                }
            }
        }
    }
    return {
        records,
        summary: computeRolloutSummary(records),
        diagnostics: allDiagnostics,
    };
}
//# sourceMappingURL=rollout-posture.mjs.map