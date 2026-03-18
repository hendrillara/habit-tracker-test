/**
 * baseline-errors.mts — Error types for baseline publication and assignment.
 *
 * Pure module (no imports from other ias modules).
 * Provides typed error codes for programmatic handling
 * without brittle string matching.
 */
export type BaselineErrorCode = "INVALID_STATE_TRANSITION" | "DRAFT_ASSIGNMENT_BLOCKED" | "SUPERSEDED_ASSIGNMENT_BLOCKED" | "PROFILE_NOT_FOUND" | "INVALID_PROFILE_IN_REGISTRY" | "EMPTY_TARGET_ID" | "EMPTY_PROFILE_NAME";
export declare class BaselineError extends Error {
    readonly code: BaselineErrorCode;
    constructor(message: string, code: BaselineErrorCode);
}
//# sourceMappingURL=baseline-errors.d.mts.map