/**
 * stale-artifact-cleanup.mts — Doctor/cleanup for stale transient runner artifacts.
 *
 * Scans .git/ias/runs/ for:
 * - Stale runner locks (PID no longer alive)
 * - Orphaned job directories (job-start.json exists but no result-meta.json, and
 *   no active runner lock)
 *
 * Provides both a scan-only mode (findStaleRunnerArtifacts) and a cleanup mode
 * (cleanStaleRunnerArtifacts) that removes stale artifacts.
 */
export type StaleArtifactScan = {
    /** Absolute paths to stale lock files. */
    staleLocks: string[];
    /** Absolute paths to orphaned job directories. */
    orphanedJobDirs: string[];
    /** Run refs that were scanned. */
    scannedRuns: string[];
    /** Non-fatal errors encountered during scanning. */
    errors: string[];
};
export type CleanupSummary = {
    locksRemoved: number;
    orphanedJobsCleaned: number;
    errors: string[];
};
export type CleanupOptions = {
    pidAlive?: (pid: number) => Promise<boolean>;
};
/**
 * Scan .git/ias/runs/ for stale runner artifacts.
 * Does not modify anything on disk.
 */
export declare function findStaleRunnerArtifacts(repoRoot: string, opts?: CleanupOptions): Promise<StaleArtifactScan>;
/**
 * Remove stale runner artifacts from .git/ias/runs/.
 * Returns a summary of what was cleaned.
 */
export declare function cleanStaleRunnerArtifacts(repoRoot: string, opts?: CleanupOptions): Promise<CleanupSummary>;
//# sourceMappingURL=stale-artifact-cleanup.d.mts.map