/**
 * runtime-paths.mts — Resolve transient runner state paths under .git/ias/.
 *
 * Runner transient state (locks, job execution metadata) is intentionally stored
 * under the git directory so it is naturally gitignored and never accidentally
 * committed alongside durable evidence (requirements.md, run-state.md, decisions.md)
 * which remains in docs/ias/runs/.
 *
 * See docs/ias/decisions/ for the transient state placement decision record.
 */
/**
 * Resolve the base directory for all transient runner state for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/`
 */
export declare function resolveRunnerTransientDir(repoRoot: string, runRef: string): Promise<string>;
/**
 * Resolve the runner lock file path for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/lock.json`
 */
export declare function resolveRunnerLockPath(repoRoot: string, runRef: string): Promise<string>;
/**
 * Resolve the runner jobs directory for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/jobs/`
 */
export declare function resolveRunnerJobsDir(repoRoot: string, runRef: string): Promise<string>;
/**
 * Resolve the base directory containing all transient run directories.
 * Returns: `<gitdir>/ias/runs/`
 */
export declare function resolveTransientRunsRoot(repoRoot: string): Promise<string>;
/**
 * Resolve the session checkpoint file path for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/session-checkpoint.json`
 */
export declare function resolveSessionCheckpointPath(repoRoot: string, runRef: string): Promise<string>;
export { resolveGitDir } from "./locks.mjs";
//# sourceMappingURL=runtime-paths.d.mts.map