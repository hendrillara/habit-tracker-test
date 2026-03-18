/**
 * Canonical job taxonomy — the product-visible classification of all
 * control-plane job kinds.
 *
 * This is a pure module (no side effects, no imports from other ias modules).
 * Shared between the local agent runtime (framework) and the thin control
 * plane (Console) for schema alignment.
 *
 * See docs/ias/decisions/ for the job taxonomy decision record.
 */
// ---------------------------------------------------------------------------
// Canonical taxonomy
// ---------------------------------------------------------------------------
export const JOB_TAXONOMY = [
    // Execution family — autonomous work
    {
        kind: "work",
        family: "execution",
        requiredOperation: "autonomousExecution",
        description: "Execute autonomous work for a run",
    },
    {
        kind: "pr_review",
        family: "execution",
        requiredOperation: "autonomousExecution",
        description: "Review a pull request",
    },
    // Infrastructure family — repo mutations
    {
        kind: "install_ias",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Bootstrap IAS scaffold into a repo",
    },
    {
        kind: "create_run",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Create a new run in the repo",
    },
    {
        kind: "init_repo_context",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Initialize repo context (goal, metadata, constraints)",
    },
    {
        kind: "context_architect",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Analyze repo and build context summary",
    },
    {
        kind: "update_git_policy",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Update repo git workflow policy",
    },
    {
        kind: "git_repair",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Repair git state (index, HEAD, etc.)",
    },
    {
        kind: "screenshot",
        family: "infrastructure",
        requiredOperation: "mutation",
        description: "Capture UI screenshots via Playwright on the host",
    },
    // Governance family — decision application and validation
    {
        kind: "apply_decision",
        family: "governance",
        requiredOperation: "mutation",
        description: "Apply a decision request to the repo",
    },
    {
        kind: "validate_checkpoints",
        family: "governance",
        requiredOperation: "readOnlyAnalysis",
        description: "Validate run assumptions and checkpoints",
    },
];
// Compile-time check: ensures every JobKind member has a taxonomy entry.
// Adding a new JobKind without a corresponding key here triggers a compile error.
const _exhaustiveKindCheck = {
    work: true,
    pr_review: true,
    install_ias: true,
    create_run: true,
    init_repo_context: true,
    context_architect: true,
    update_git_policy: true,
    apply_decision: true,
    git_repair: true,
    validate_checkpoints: true,
    screenshot: true,
};
void _exhaustiveKindCheck;
// ---------------------------------------------------------------------------
// Derived constants
// ---------------------------------------------------------------------------
/** All valid job kinds as an array (for schema validation). */
export const JOB_KINDS = JOB_TAXONOMY.map((e) => e.kind);
/** Map from kind to required capability-state operation. */
export const JOB_KIND_OPERATION_MAP = Object.fromEntries(JOB_TAXONOMY.map((e) => [e.kind, e.requiredOperation]));
// ---------------------------------------------------------------------------
// Internal lookup
// ---------------------------------------------------------------------------
const _taxonomyByKind = new Map(JOB_TAXONOMY.map((e) => [e.kind, e]));
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Returns true if the string is a valid job kind. */
export function isValidJobKind(kind) {
    return _taxonomyByKind.has(kind);
}
/** Returns the job family for a given kind. */
export function getJobFamily(kind) {
    const entry = _taxonomyByKind.get(kind);
    if (!entry)
        throw new Error(`Unknown job kind: ${kind}`);
    return entry.family;
}
/** Returns the required capability-state operation for a given kind. */
export function getRequiredOperation(kind) {
    const entry = _taxonomyByKind.get(kind);
    if (!entry)
        throw new Error(`Unknown job kind: ${kind}`);
    return entry.requiredOperation;
}
//# sourceMappingURL=job-taxonomy.mjs.map