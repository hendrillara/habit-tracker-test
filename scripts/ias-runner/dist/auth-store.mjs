import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
function normalizeDeploymentUrlKey(value) {
    return String(value ?? "").trim().replace(/\/+$/, "");
}
function authPath() {
    return path.join(os.homedir(), ".ias", "auth.json");
}
/**
 * Set restrictive permissions on a file or directory (cross-platform).
 * - Unix: uses chmod with the specified mode
 * - Windows: uses icacls to remove inheritance and grant access only to current user
 */
async function setRestrictivePermissions(p, mode) {
    if (process.platform === "win32") {
        // On Windows, use icacls to set restrictive ACLs
        const username = String(process.env.USERNAME ?? "").trim();
        if (!username)
            return; // Can't determine user, skip silently
        try {
            // /inheritance:r - Remove all inherited ACEs
            // /grant:r - Replace existing ACEs (remove all, then add specified)
            // USERNAME:(F) - Grant Full control to current user only
            execFileSync("icacls", [p, "/inheritance:r", "/grant:r", `${username}:(F)`], {
                stdio: "ignore",
                windowsHide: true,
            });
        }
        catch {
            // ignore errors (permission issues, path issues, etc.)
        }
    }
    else {
        // On Unix, use chmod
        try {
            await fs.chmod(p, mode);
        }
        catch {
            // ignore (platform/FS may not support)
        }
    }
}
async function tightenAuthStorePermissions(p) {
    await setRestrictivePermissions(path.dirname(p), 0o700);
    await setRestrictivePermissions(p, 0o600);
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
export async function loadAuthStore() {
    const p = authPath();
    if (!(await fileExists(p)))
        return { version: 1, entries: [] };
    await tightenAuthStorePermissions(p);
    const text = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return { version: 1, entries };
}
export async function getAuthEntry({ convexDeploymentUrl, workspaceSlug }) {
    const store = await loadAuthStore();
    const now = Date.now();
    const dep = normalizeDeploymentUrlKey(convexDeploymentUrl);
    const slug = String(workspaceSlug ?? "").trim();
    for (const e of store.entries) {
        if (!e || typeof e !== "object")
            continue;
        if (normalizeDeploymentUrlKey(e.convexDeploymentUrl) !== dep)
            continue;
        if (String(e.workspaceSlug ?? "").trim() !== slug)
            continue;
        const expiresAt = Number(e.expiresAt ?? NaN);
        if (Number.isFinite(expiresAt) && expiresAt <= now)
            continue;
        const token = String(e.token ?? "").trim();
        if (!token)
            continue;
        return e;
    }
    return null;
}
export function authStorePath() {
    return authPath();
}
//# sourceMappingURL=auth-store.mjs.map