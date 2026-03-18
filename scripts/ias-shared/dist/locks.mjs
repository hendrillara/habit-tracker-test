import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Resolve the actual git directory for a repo root.
 * Handles both normal repos (.git is a directory) and worktrees (.git is a file
 * containing a `gitdir:` pointer).
 *
 * Exported so other shared modules (runtime-paths, stale-artifact-cleanup) can
 * resolve paths under .git/ias/ without duplicating the worktree detection logic.
 */
export async function resolveGitDir(repoRoot) {
    const gitPath = path.join(repoRoot, ".git");
    let stat = null;
    let lstatError = null;
    try {
        stat = await fs.lstat(gitPath);
    }
    catch (e) {
        lstatError = e;
    }
    if (!stat && lstatError && typeof lstatError === "object" && "code" in lstatError && String(lstatError.code) === "EPERM") {
        // Windows can report EPERM on .git metadata in restricted temp dirs.
        // Fall back to a repo-local hidden lock root so work can proceed.
        return path.join(repoRoot, ".git-ias-fallback");
    }
    if (!stat) {
        const code = lstatError && typeof lstatError === "object" && "code" in lstatError ? String(lstatError.code) : "unknown";
        const message = lstatError instanceof Error ? lstatError.message : String(lstatError ?? "not found");
        throw new Error(`missing .git at ${gitPath} (${code}: ${message})`);
    }
    if (stat.isDirectory())
        return gitPath;
    if (!stat.isFile())
        throw new Error(`unsupported .git type at ${gitPath}`);
    const text = await fs.readFile(gitPath, "utf8");
    const line = text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
    const m = line ? line.match(/^gitdir:\s*(?<p>.+)\s*$/i) : null;
    const p = m && m.groups && m.groups.p ? String(m.groups.p).trim() : null;
    if (!p)
        throw new Error(`unable to parse gitdir from ${gitPath}`);
    return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}
function nowMs() {
    return Date.now();
}
function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        // Treat EPERM as alive (process exists, but we can't signal it).
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        return code === "EPERM";
    }
}
function parseOwnerHostPid(owner) {
    const s = String(owner ?? "").trim();
    const at = s.indexOf("@");
    if (at < 0)
        return null;
    const rest = s.slice(at + 1);
    const parts = rest.split(":").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2)
        return null;
    const host = parts[0] ?? "";
    const pidRaw = parts[parts.length - 1] ?? "";
    const pid = Number.parseInt(pidRaw, 10);
    if (!Number.isFinite(pid) || pid <= 0)
        return null;
    return { host, pid };
}
function isStaleLocalOwner(lock) {
    const parsed = parseOwnerHostPid(lock?.owner);
    if (!parsed)
        return false;
    if (parsed.host !== os.hostname())
        return false;
    return !pidAlive(parsed.pid);
}
function defaultOwner() {
    const user = process.env.USER || process.env.LOGNAME || "unknown";
    return `${user}@${os.hostname()}:${process.pid}`;
}
async function lockDir(repoRoot) {
    // Store agent runtime state in gitdir so it never becomes staged/committed.
    const gitDir = await resolveGitDir(repoRoot);
    return path.join(gitDir, "ias", "locks");
}
async function lockPath(repoRoot) {
    const dir = await lockDir(repoRoot);
    return path.join(dir, "repo.lock.json");
}
function randomId() {
    return crypto.randomBytes(8).toString("hex");
}
async function readJsonIfExists(p) {
    if (!(await fileExists(p)))
        return null;
    const text = await fs.readFile(p, "utf8");
    try {
        return JSON.parse(text);
    }
    catch {
        return { __invalidJson: true, raw: text };
    }
}
function isExpired(lock) {
    const expiresAt = Number(lock?.expiresAtMs ?? NaN);
    if (!Number.isFinite(expiresAt))
        return true;
    return nowMs() > expiresAt;
}
export async function acquireRepoLock(repoRoot, options = {}) {
    const ttlMs = Number(options.ttlMs ?? 10 * 60 * 1000);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new Error(`invalid ttlMs: ${options.ttlMs}`);
    }
    const owner = String(options.owner ?? defaultOwner());
    const p = await lockPath(repoRoot);
    await ensureDir(path.dirname(p));
    const lock = {
        id: randomId(),
        owner,
        createdAtMs: nowMs(),
        expiresAtMs: nowMs() + ttlMs,
    };
    try {
        await fs.writeFile(p, JSON.stringify(lock, null, 2) + "\n", { flag: "wx" });
        return { ok: true, lock, path: p, tookOver: false };
    }
    catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
            throw error;
        }
    }
    const existing = await readJsonIfExists(p);
    if (existing && !isExpired(existing) && !isStaleLocalOwner(existing)) {
        return { ok: false, lock: existing, path: p, tookOver: false };
    }
    await fs.writeFile(p, JSON.stringify(lock, null, 2) + "\n", "utf8");
    return { ok: true, lock, path: p, tookOver: true };
}
export async function releaseRepoLock(repoRoot, options = {}) {
    const owner = options.owner ? String(options.owner) : null;
    const p = await lockPath(repoRoot);
    const existing = await readJsonIfExists(p);
    if (!existing) {
        return { ok: true, released: false, path: p };
    }
    const existingOwner = existing && typeof existing === "object" && !Array.isArray(existing) && "owner" in existing ? existing.owner : null;
    const invalidJson = existing && typeof existing === "object" && !Array.isArray(existing) && existing.__invalidJson === true;
    if (!invalidJson && owner && existingOwner !== owner) {
        return { ok: false, released: false, path: p, lock: existing };
    }
    await fs.rm(p, { force: true });
    return { ok: true, released: true, path: p, ...(invalidJson ? { invalidJson: true } : {}) };
}
//# sourceMappingURL=locks.mjs.map