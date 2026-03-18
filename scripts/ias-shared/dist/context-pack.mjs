/**
 * context-pack.mts — Context pack assembly and preview contract.
 *
 * Pure module. Defines how context is assembled, explained, and previewed
 * before and after governed work.
 *
 * See domains/03-context-system/ for domain requirements.
 */
import crypto from "node:crypto";
// ---------------------------------------------------------------------------
// Context Item Status
// ---------------------------------------------------------------------------
export const CONTEXT_ITEM_STATUSES = ["selected", "omitted", "missing"];
const _statusSet = new Set(CONTEXT_ITEM_STATUSES);
export function isValidContextItemStatus(s) {
    return _statusSet.has(s);
}
// ---------------------------------------------------------------------------
// Context Source Origins
// ---------------------------------------------------------------------------
export const CONTEXT_ORIGINS = ["repo", "standards", "policy", "domain", "live", "run_scoped"];
export function assembleContextPack(input) {
    const items = input.items.map((i) => ({ ...i }));
    return {
        runRef: input.runRef,
        assembledAt: new Date().toISOString(),
        selected: items.filter((i) => i.status === "selected"),
        omitted: items.filter((i) => i.status === "omitted"),
        missing: items.filter((i) => i.status === "missing"),
        allItems: items,
    };
}
// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export function describePackSummary(pack) {
    const parts = [];
    if (pack.selected.length > 0)
        parts.push(`${pack.selected.length} selected`);
    if (pack.omitted.length > 0)
        parts.push(`${pack.omitted.length} omitted`);
    if (pack.missing.length > 0)
        parts.push(`${pack.missing.length} missing`);
    return `Context pack for ${pack.runRef}: ${parts.join(", ") || "empty"}`;
}
export function classifyFreshness(input) {
    if (input.manualStaleOverride) {
        return {
            lastRefreshedAt: input.lastRefreshedAt,
            sourceVersion: input.sourceVersion,
            manualStaleOverride: true,
            status: "stale",
        };
    }
    if (!input.lastRefreshedAt) {
        return {
            sourceVersion: input.sourceVersion,
            status: "unknown",
        };
    }
    const refreshed = new Date(input.lastRefreshedAt).getTime();
    if (!Number.isFinite(refreshed)) {
        return {
            lastRefreshedAt: input.lastRefreshedAt,
            sourceVersion: input.sourceVersion,
            status: "unknown",
        };
    }
    const maxAge = input.maxAgeDays * 24 * 60 * 60 * 1000;
    const isStale = Date.now() - refreshed > maxAge;
    return {
        lastRefreshedAt: input.lastRefreshedAt,
        sourceVersion: input.sourceVersion,
        status: isStale ? "stale" : "current",
    };
}
// ---------------------------------------------------------------------------
// Context Decision Explanation (LUC-30)
// ---------------------------------------------------------------------------
export function explainContextDecision(item) {
    const parts = [`Context item "${item.id}" from source "${item.sourceId}": ${item.status}`];
    if (item.reason)
        parts.push(`— ${item.reason}`);
    if (item.freshness) {
        parts.push(`(freshness: ${item.freshness.status})`);
        if (item.freshness.lastRefreshedAt) {
            parts.push(`[last refreshed: ${item.freshness.lastRefreshedAt}]`);
        }
    }
    return parts.join(" ");
}
// ---------------------------------------------------------------------------
// Readiness Classification (LUC-29)
// ---------------------------------------------------------------------------
export function classifyReadiness(pack) {
    const hasRequiredMissing = pack.missing.some((item) => item.required === true);
    if (hasRequiredMissing)
        return "blocked";
    const hasStaleSelected = pack.selected.some((item) => item.freshness?.status === "stale");
    if (hasStaleSelected)
        return "degraded";
    return "ready";
}
// ---------------------------------------------------------------------------
// Preview Summary (LUC-29)
// ---------------------------------------------------------------------------
export function describePreviewSummary(pack, readiness) {
    const parts = [`Context preview for ${pack.runRef}:`];
    parts.push(`${pack.selected.length} selected`);
    if (pack.omitted.length > 0)
        parts.push(`${pack.omitted.length} omitted`);
    const requiredMissing = pack.missing.filter((i) => i.required === true);
    const optionalMissing = pack.missing.filter((i) => !i.required);
    if (requiredMissing.length > 0) {
        parts.push(`${requiredMissing.length} REQUIRED missing`);
    }
    if (optionalMissing.length > 0) {
        parts.push(`${optionalMissing.length} optional missing`);
    }
    parts.push(`— readiness: ${readiness}`);
    return parts.join(", ").replace(":,", ":");
}
// ---------------------------------------------------------------------------
// Build Context Pack Preview (LUC-29)
// ---------------------------------------------------------------------------
export function buildContextPackPreview(input) {
    const pack = assembleContextPack({ runRef: input.runRef, items: input.items });
    const readiness = classifyReadiness(pack);
    const summary = describePreviewSummary(pack, readiness);
    return {
        previewId: input.previewId ?? crypto.randomUUID(),
        pack,
        sources: input.sources,
        readiness,
        summary,
        generatedAt: input.generatedAt ?? new Date().toISOString(),
    };
}
// ---------------------------------------------------------------------------
// Explain Preview (LUC-29)
// ---------------------------------------------------------------------------
export function explainPreview(preview) {
    return preview.pack.allItems.map((item) => ({
        itemId: item.id,
        sourceId: item.sourceId,
        status: item.status,
        required: item.required ?? false,
        reason: item.reason,
        freshness: item.freshness,
        decision: explainContextDecision(item),
    }));
}
// ---------------------------------------------------------------------------
// Freshness Explanation (LUC-22 Story 2)
// ---------------------------------------------------------------------------
export function describeFreshness(signal) {
    if (signal.manualStaleOverride) {
        return "Marked stale by operator override";
    }
    switch (signal.status) {
        case "current":
            return signal.lastRefreshedAt
                ? `Current (last refreshed ${signal.lastRefreshedAt})`
                : "Current";
        case "stale":
            return signal.lastRefreshedAt
                ? `Stale (last refreshed ${signal.lastRefreshedAt})`
                : "Stale (no refresh timestamp)";
        case "unknown":
            return "Unknown freshness (no refresh data available)";
    }
}
export function explainFreshness(signal) {
    let staleCause = null;
    if (signal.status === "stale") {
        staleCause = signal.manualStaleOverride
            ? "manual_override"
            : "age";
    }
    return {
        signal,
        description: describeFreshness(signal),
        staleCause,
    };
}
export function availableActionsForMissing(item) {
    const actions = [];
    if (item.status === "missing") {
        actions.push({
            kind: "link_source",
            label: "Link source",
            description: "Connect a context source to resolve this gap",
        });
        if (item.required) {
            actions.push({
                kind: "acknowledge",
                label: "Acknowledge and proceed",
                description: "Accept the gap and allow execution to continue",
            });
            actions.push({
                kind: "mark_optional",
                label: "Mark as optional",
                description: "Downgrade this item so it no longer blocks execution",
            });
        }
    }
    if (item.freshness?.status === "stale") {
        actions.push({
            kind: "refresh_source",
            label: "Refresh source",
            description: "Re-fetch context from the source to update freshness",
        });
    }
    return actions;
}
//# sourceMappingURL=context-pack.mjs.map