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
import path from "node:path";
import { resolveGitDir } from "./locks.mjs";
const SAFE_RUN_REF_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
function validateRunRef(runRef) {
    if (!runRef || typeof runRef !== "string") {
        throw new Error("runRef is required and must be a non-empty string");
    }
    if (runRef.includes("..") || runRef.includes("/") || runRef.includes("\\")) {
        throw new Error(`unsafe runRef — path traversal detected: ${runRef}`);
    }
    if (!SAFE_RUN_REF_RE.test(runRef)) {
        throw new Error(`invalid runRef — must match ${SAFE_RUN_REF_RE}: ${runRef}`);
    }
}
/**
 * Resolve the base directory for all transient runner state for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/`
 */
export async function resolveRunnerTransientDir(repoRoot, runRef) {
    validateRunRef(runRef);
    const gitDir = await resolveGitDir(repoRoot);
    return path.join(gitDir, "ias", "runs", runRef, "runner");
}
/**
 * Resolve the runner lock file path for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/lock.json`
 */
export async function resolveRunnerLockPath(repoRoot, runRef) {
    const runnerDir = await resolveRunnerTransientDir(repoRoot, runRef);
    return path.join(runnerDir, "lock.json");
}
/**
 * Resolve the runner jobs directory for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/jobs/`
 */
export async function resolveRunnerJobsDir(repoRoot, runRef) {
    const runnerDir = await resolveRunnerTransientDir(repoRoot, runRef);
    return path.join(runnerDir, "jobs");
}
/**
 * Resolve the base directory containing all transient run directories.
 * Returns: `<gitdir>/ias/runs/`
 */
export async function resolveTransientRunsRoot(repoRoot) {
    const gitDir = await resolveGitDir(repoRoot);
    return path.join(gitDir, "ias", "runs");
}
/**
 * Resolve the session checkpoint file path for a given run.
 * Returns: `<gitdir>/ias/runs/<runRef>/runner/session-checkpoint.json`
 */
export async function resolveSessionCheckpointPath(repoRoot, runRef) {
    validateRunRef(runRef);
    const gitDir = await resolveGitDir(repoRoot);
    return path.join(gitDir, "ias", "runs", runRef, "runner", "session-checkpoint.json");
}
// Re-export resolveGitDir for consumers that need direct gitdir access.
export { resolveGitDir } from "./locks.mjs";
//# sourceMappingURL=runtime-paths.mjs.map