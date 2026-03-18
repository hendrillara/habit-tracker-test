import { spawn } from "node:child_process";
async function execFileCapture(cmd, args, opts = {}) {
    return await new Promise((resolve) => {
        const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += String(d)));
        child.stderr.on("data", (d) => (stderr += String(d)));
        child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
}
export async function findPrUrlForHeadBranch(repoRoot, headBranch, exec = execFileCapture) {
    const ghOk = await exec("gh", ["--version"], { cwd: repoRoot });
    if (ghOk.code !== 0)
        return null;
    const authOk = await exec("gh", ["auth", "status"], { cwd: repoRoot });
    if (authOk.code !== 0)
        return null;
    const res = await exec("gh", ["pr", "list", "--head", headBranch, "--state", "all", "--limit", "1", "--json", "url"], { cwd: repoRoot });
    if (res.code !== 0)
        return null;
    try {
        const parsed = JSON.parse(res.stdout || "[]");
        const pr = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
        const url = pr && typeof pr.url === "string" ? pr.url : null;
        return url ? String(url) : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=pr-evidence.mjs.map