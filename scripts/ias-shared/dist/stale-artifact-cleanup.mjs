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
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { resolveTransientRunsRoot } from "./runtime-paths.mjs";
const RUN_DIR_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch (e) {
        if (e && typeof e === "object" && "code" in e && e.code === "ENOENT")
            return false;
        throw e;
    }
}
async function readJson(p) {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
}
function pidAliveDefault(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        return code === "EPERM";
    }
}
async function isLockStale(lockPath, pidAlive) {
    let lock;
    try {
        lock = await readJson(lockPath);
    }
    catch {
        return true; // Corrupt/unreadable lock is stale by definition
    }
    const pid = Number(lock?.pid);
    if (!Number.isFinite(pid) || pid <= 0)
        return true;
    return !(await pidAlive(pid)); // Let pidAlive errors propagate
}
async function discoverRunDirs(runsRoot) {
    let entries;
    try {
        entries = await fs.readdir(runsRoot, { withFileTypes: true });
    }
    catch (e) {
        if (e && typeof e === "object" && "code" in e && e.code === "ENOENT")
            return [];
        throw e;
    }
    return entries
        .filter((entry) => entry.isDirectory() && RUN_DIR_RE.test(entry.name))
        .map((entry) => ({ name: entry.name, path: path.join(runsRoot, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
async function findOrphanedJobs(jobsDir) {
    if (!(await fileExists(jobsDir)))
        return [];
    const entries = await fs.readdir(jobsDir, { withFileTypes: true });
    const orphaned = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const jobDir = path.join(jobsDir, entry.name);
        const hasStart = await fileExists(path.join(jobDir, "job-start.json"));
        const hasResult = await fileExists(path.join(jobDir, "result-meta.json"));
        if (hasStart && !hasResult) {
            orphaned.push(jobDir);
        }
    }
    return orphaned;
}
/**
 * Scan .git/ias/runs/ for stale runner artifacts.
 * Does not modify anything on disk.
 */
export async function findStaleRunnerArtifacts(repoRoot, opts = {}) {
    const pidAlive = typeof opts.pidAlive === "function" ? opts.pidAlive : async (pid) => pidAliveDefault(pid);
    const runsRoot = await resolveTransientRunsRoot(repoRoot);
    const runDirs = await discoverRunDirs(runsRoot);
    const result = {
        staleLocks: [],
        orphanedJobDirs: [],
        scannedRuns: runDirs.map((d) => d.name),
        errors: [],
    };
    for (const runDir of runDirs) {
        const runnerDir = path.join(runDir.path, "runner");
        if (!(await fileExists(runnerDir)))
            continue;
        const lockPath = path.join(runnerDir, "lock.json");
        const jobsDir = path.join(runnerDir, "jobs");
        // Check for stale lock
        if (await fileExists(lockPath)) {
            try {
                if (await isLockStale(lockPath, pidAlive)) {
                    result.staleLocks.push(lockPath);
                }
                else {
                    // Lock is active — skip orphan detection for this run
                    continue;
                }
            }
            catch (e) {
                // pidAlive threw — cannot determine liveness; skip this lock
                const msg = e instanceof Error ? e.message : String(e);
                result.errors.push(`${lockPath}: pid liveness check failed (${msg})`);
                continue;
            }
        }
        // Check for orphaned jobs (only when no active lock)
        const orphaned = await findOrphanedJobs(jobsDir);
        result.orphanedJobDirs.push(...orphaned);
    }
    return result;
}
/**
 * Remove stale runner artifacts from .git/ias/runs/.
 * Returns a summary of what was cleaned.
 */
export async function cleanStaleRunnerArtifacts(repoRoot, opts = {}) {
    const scan = await findStaleRunnerArtifacts(repoRoot, opts);
    const summary = {
        locksRemoved: 0,
        orphanedJobsCleaned: 0,
        errors: [],
    };
    for (const lockPath of scan.staleLocks) {
        try {
            await fs.rm(lockPath, { force: true });
            summary.locksRemoved++;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            summary.errors.push(`lock ${lockPath}: ${msg}`);
        }
    }
    for (const jobDir of scan.orphanedJobDirs) {
        try {
            await fs.rm(jobDir, { recursive: true, force: true });
            summary.orphanedJobsCleaned++;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            summary.errors.push(`job ${jobDir}: ${msg}`);
        }
    }
    return summary;
}
//# sourceMappingURL=stale-artifact-cleanup.mjs.map