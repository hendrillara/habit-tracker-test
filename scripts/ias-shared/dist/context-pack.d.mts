/**
 * context-pack.mts — Context pack assembly and preview contract.
 *
 * Pure module. Defines how context is assembled, explained, and previewed
 * before and after governed work.
 *
 * See domains/03-context-system/ for domain requirements.
 */
export declare const CONTEXT_ITEM_STATUSES: readonly ["selected", "omitted", "missing"];
export type ContextItemStatus = (typeof CONTEXT_ITEM_STATUSES)[number];
export declare function isValidContextItemStatus(s: string): s is ContextItemStatus;
export declare const CONTEXT_ORIGINS: readonly ["repo", "standards", "policy", "domain", "live", "run_scoped"];
export type ContextOrigin = (typeof CONTEXT_ORIGINS)[number];
export interface ContextSource {
    id: string;
    name: string;
    origin: ContextOrigin;
}
export interface ContextItemInput {
    id: string;
    sourceId: string;
    status: ContextItemStatus;
    reason: string;
    /** Whether this context item is required for execution. Defaults to false. */
    required?: boolean;
}
export interface ContextItem extends ContextItemInput {
    /** Freshness metadata (enhanced by LUC-30). */
    freshness?: FreshnessSignal;
}
export interface FreshnessSignal {
    lastRefreshedAt?: string;
    sourceVersion?: string;
    manualStaleOverride?: boolean;
    status: "current" | "stale" | "unknown";
}
export interface SelectedContextPack {
    runRef: string;
    assembledAt: string;
    selected: readonly ContextItem[];
    omitted: readonly ContextItem[];
    missing: readonly ContextItem[];
    allItems: readonly ContextItem[];
}
export interface AssembleInput {
    runRef: string;
    items: readonly ContextItemInput[];
}
export declare function assembleContextPack(input: AssembleInput): SelectedContextPack;
export declare function describePackSummary(pack: SelectedContextPack): string;
export interface FreshnessInput {
    lastRefreshedAt?: string;
    sourceVersion?: string;
    manualStaleOverride?: boolean;
    maxAgeDays: number;
}
export declare function classifyFreshness(input: FreshnessInput): FreshnessSignal;
export declare function explainContextDecision(item: ContextItem): string;
export type ContextPackReadiness = "ready" | "blocked" | "degraded";
export interface ContextPackPreview {
    /** Stable identifier for this preview instance, used for consumer attribution. */
    previewId: string;
    /** The assembled context pack this preview describes. */
    pack: SelectedContextPack;
    /** Registry of all context sources referenced by items in the pack. */
    sources: readonly ContextSource[];
    /** Whether the pack is ready for execution (no required-missing items). */
    readiness: ContextPackReadiness;
    /** Human-readable summary of the preview. */
    summary: string;
    /** ISO 8601 timestamp when the preview was generated. */
    generatedAt: string;
}
export interface BuildPreviewInput {
    runRef: string;
    items: readonly ContextItemInput[];
    sources: readonly ContextSource[];
    /** Optional deterministic ID (defaults to crypto.randomUUID()). */
    previewId?: string;
    /** Optional timestamp (defaults to new Date().toISOString()). */
    generatedAt?: string;
}
export interface PreviewItemExplanation {
    itemId: string;
    sourceId: string;
    status: ContextItemStatus;
    required: boolean;
    reason: string;
    freshness: FreshnessSignal | undefined;
    decision: string;
}
export declare function classifyReadiness(pack: SelectedContextPack): ContextPackReadiness;
export declare function describePreviewSummary(pack: SelectedContextPack, readiness: ContextPackReadiness): string;
export declare function buildContextPackPreview(input: BuildPreviewInput): ContextPackPreview;
export declare function explainPreview(preview: ContextPackPreview): readonly PreviewItemExplanation[];
export declare function describeFreshness(signal: FreshnessSignal): string;
export interface FreshnessExplanation {
    signal: FreshnessSignal;
    description: string;
    staleCause: "age" | "source_version_drift" | "manual_override" | null;
}
export declare function explainFreshness(signal: FreshnessSignal): FreshnessExplanation;
export type MissingContextActionKind = "link_source" | "refresh_source" | "acknowledge" | "mark_optional";
export interface MissingContextAction {
    kind: MissingContextActionKind;
    label: string;
    description: string;
}
export declare function availableActionsForMissing(item: ContextItem): readonly MissingContextAction[];
//# sourceMappingURL=context-pack.d.mts.map