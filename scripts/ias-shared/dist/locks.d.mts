/**
 * Resolve the actual git directory for a repo root.
 * Handles both normal repos (.git is a directory) and worktrees (.git is a file
 * containing a `gitdir:` pointer).
 *
 * Exported so other shared modules (runtime-paths, stale-artifact-cleanup) can
 * resolve paths under .git/ias/ without duplicating the worktree detection logic.
 */
export declare function resolveGitDir(repoRoot: any): Promise<string>;
export declare function acquireRepoLock(repoRoot: any, options?: any): Promise<{
    ok: boolean;
    lock: any;
    path: string;
    tookOver: boolean;
}>;
export declare function releaseRepoLock(repoRoot: any, options?: any): Promise<{
    ok: boolean;
    released: boolean;
    path: string;
    lock: any;
} | {
    invalidJson?: boolean;
    ok: boolean;
    released: boolean;
    path: string;
    lock?: undefined;
}>;
//# sourceMappingURL=locks.d.mts.map