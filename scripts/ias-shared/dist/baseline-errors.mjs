/**
 * baseline-errors.mts — Error types for baseline publication and assignment.
 *
 * Pure module (no imports from other ias modules).
 * Provides typed error codes for programmatic handling
 * without brittle string matching.
 */
// ---------------------------------------------------------------------------
// BaselineError
// ---------------------------------------------------------------------------
export class BaselineError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "BaselineError";
    }
}
//# sourceMappingURL=baseline-errors.mjs.map