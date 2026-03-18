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
/** All valid job kinds in the system. */
export type JobKind = "work" | "pr_review" | "install_ias" | "create_run" | "init_repo_context" | "context_architect" | "update_git_policy" | "apply_decision" | "git_repair" | "validate_checkpoints" | "screenshot";
/** Job family — groups kinds by operator intent. */
export type JobFamily = "execution" | "infrastructure" | "governance";
/** Required capability-state operation for a job kind. */
export type RequiredOperation = "mutation" | "autonomousExecution" | "readOnlyAnalysis";
/** Canonical taxonomy entry linking kind → family → required operation. */
export interface JobTaxonomyEntry {
    kind: JobKind;
    family: JobFamily;
    requiredOperation: RequiredOperation;
    description: string;
}
export declare const JOB_TAXONOMY: readonly JobTaxonomyEntry[];
/** All valid job kinds as an array (for schema validation). */
export declare const JOB_KINDS: readonly JobKind[];
/** Map from kind to required capability-state operation. */
export declare const JOB_KIND_OPERATION_MAP: Record<JobKind, RequiredOperation>;
/** Returns true if the string is a valid job kind. */
export declare function isValidJobKind(kind: string): kind is JobKind;
/** Returns the job family for a given kind. */
export declare function getJobFamily(kind: JobKind): JobFamily;
/** Returns the required capability-state operation for a given kind. */
export declare function getRequiredOperation(kind: JobKind): RequiredOperation;
//# sourceMappingURL=job-taxonomy.d.mts.map