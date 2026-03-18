import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { resolveTransientRunsRoot } from "../../ias-shared/dist/runtime-paths.mjs";
const RUN_DIR_RE = /^20\d{6}-[a-z0-9]+(-[a-z0-9]+)*$/;
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch (e) {
        if (e?.code === "ENOENT")
            return false;
        console.warn(`[crash-recovery] unexpected error checking file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
        return false;
    }
}
async function readJson(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
}
async function writeJson(filePath, value) {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
async function pidAliveDefault(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        return code === "EPERM"; // EPERM means process exists but we lack permission
    }
}
/**
 * Discover run directories containing transient runner state.
 * Scans .git/ias/runs/ (transient state root) instead of docs/ias/runs/.
 */
export async function discoverRunDirs(repoRoot) {
    const runsRoot = await resolveTransientRunsRoot(repoRoot);
    const entries = await fs.readdir(runsRoot, { withFileTypes: true }).catch((e) => {
        if (e?.code === "ENOENT")
            return [];
        console.warn(`[crash-recovery] failed to scan directory: ${e instanceof Error ? e.message : String(e)}`);
        return [];
    });
    return entries
        .filter((entry) => entry.isDirectory() && RUN_DIR_RE.test(entry.name))
        .map((entry) => path.join(runsRoot, entry.name))
        .sort();
}
export async function recoverRunRunnerArtifacts(runDir, opts = {}) {
    const runRef = path.basename(runDir);
    const runnerDir = path.join(runDir, "runner");
    const lockPath = path.join(runnerDir, "lock.json");
    const jobsDir = path.join(runnerDir, "jobs");
    const result = { runRef, lockReleased: false, recoveredJobs: [], errors: [] };
    const pidAlive = typeof opts.pidAlive === "function" ? opts.pidAlive : pidAliveDefault;
    let shouldRecoverJobs = false;
    if (!(await fileExists(runnerDir)))
        return result;
    if (await fileExists(lockPath)) {
        try {
            const lock = await readJson(lockPath);
            const pid = Number(lock?.pid);
            const alive = Number.isFinite(pid) && pid > 0 ? await pidAlive(pid) : false;
            if (!alive) {
                await fs.rm(lockPath, { force: true });
                result.lockReleased = true;
                shouldRecoverJobs = true;
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`lock: corrupt lock removed (${msg})`);
            await fs.rm(lockPath, { force: true });
            result.lockReleased = true;
            shouldRecoverJobs = true;
        }
    }
    // Only finalize orphaned jobs when we have clear stale-owner evidence.
    if (!shouldRecoverJobs)
        return result;
    if (!(await fileExists(jobsDir)))
        return result;
    const entries = await fs.readdir(jobsDir, { withFileTypes: true }).catch((e) => {
        if (e?.code === "ENOENT")
            return [];
        console.warn(`[crash-recovery] failed to scan directory: ${e instanceof Error ? e.message : String(e)}`);
        return [];
    });
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const jobId = entry.name;
        const jobDir = path.join(jobsDir, jobId);
        const startPath = path.join(jobDir, "job-start.json");
        const metaPath = path.join(jobDir, "result-meta.json");
        if (!(await fileExists(startPath)))
            continue;
        if (await fileExists(metaPath))
            continue;
        try {
            const finishedAt = new Date();
            const recoveryMessage = `Recovered after unclean runner exit: stale in-progress job had no result metadata (jobId=${jobId})`;
            await writeJson(metaPath, {
                jobId,
                status: "failed",
                finishedAt: finishedAt.toISOString(),
                finishedAtMs: finishedAt.getTime(),
                recovered: true,
                recoveredReason: "stale_in_progress_job",
            });
            await fs.writeFile(path.join(jobDir, "error.txt"), `${recoveryMessage}\n`, "utf8");
            result.recoveredJobs.push(jobId);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(`job=${jobId}: ${msg}`);
        }
    }
    return result;
}
export async function recoverRunnerArtifacts(repoRoot, opts = {}) {
    const runDirs = opts.runDir ? [path.resolve(opts.runDir)] : await discoverRunDirs(repoRoot);
    const runs = [];
    for (const runDir of runDirs) {
        runs.push(await recoverRunRunnerArtifacts(runDir, { pidAlive: opts.pidAlive }));
    }
    const locksReleased = runs.filter((run) => run.lockReleased).length;
    const jobsRecovered = runs.reduce((sum, run) => sum + run.recoveredJobs.length, 0);
    const runsWithActions = runs.filter((run) => run.lockReleased || run.recoveredJobs.length > 0).length;
    const runsWithErrors = runs.filter((run) => run.errors.length > 0).length;
    return {
        runsScanned: runDirs.length,
        locksReleased,
        jobsRecovered,
        runsWithActions,
        runsWithErrors,
        runs,
    };
}
export function hasRecoveryActions(report) {
    if (!report)
        return false;
    return report.locksReleased > 0 || report.jobsRecovered > 0 || report.runsWithErrors > 0;
}
export function formatRecoverySummary(report, context = "startup") {
    const lines = [
        `[runner] ${context} recovery: scanned=${report.runsScanned} locksReleased=${report.locksReleased} jobsRecovered=${report.jobsRecovered} errors=${report.runsWithErrors}`,
    ];
    for (const run of report.runs) {
        if (!run.lockReleased && run.recoveredJobs.length === 0 && run.errors.length === 0)
            continue;
        const parts = [`run=${run.runRef}`];
        if (run.lockReleased)
            parts.push("released stale lock");
        if (run.recoveredJobs.length > 0)
            parts.push(`recovered jobs: ${run.recoveredJobs.join(", ")}`);
        if (run.errors.length > 0)
            parts.push(`errors: ${run.errors.join(" | ")}`);
        lines.push(`[runner] ${context} recovery: ${parts.join("; ")}`);
    }
    return lines;
}
//# sourceMappingURL=crash-recovery.mjs.map