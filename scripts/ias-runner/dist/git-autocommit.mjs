function normalizeString(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value.trim();
    return String(value).trim();
}
function uniqueOrdered(values) {
    const seen = new Set();
    const out = [];
    for (const v of values) {
        const s = normalizeString(v);
        if (!s)
            continue;
        if (seen.has(s))
            continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}
export const DEFAULT_AUTOCOMMIT_EXCLUDE_PATHS = [
    "node_modules",
    ".npm-cache",
    ".playwright-browsers",
    "playwright-report",
    "test-results",
];
/**
 * Build `git add` arguments for runner auto-commit, excluding common cache/build directories.
 *
 * @param {{ excludePaths?: unknown }} [opts]
 * @returns {string[]}
 */
export function gitAddArgsForAutoCommit(opts = {}) {
    const extraRaw = opts && typeof opts === "object" ? opts.excludePaths : undefined;
    const extra = Array.isArray(extraRaw) ? extraRaw.map((p) => normalizeString(p)).filter(Boolean) : [];
    const excludePaths = uniqueOrdered([...DEFAULT_AUTOCOMMIT_EXCLUDE_PATHS, ...extra]);
    return [
        "add",
        "-A",
        "--",
        ".",
        ...excludePaths.map((p) => `:(exclude)${p}`),
    ];
}
function normalizeJobAttempt(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 1;
    return Math.max(1, Math.floor(n));
}
export function buildJobCommitTrailer(jobId, attemptNumber = 1) {
    const normalizedJobId = normalizeString(jobId);
    const normalizedAttempt = normalizeJobAttempt(attemptNumber);
    if (!normalizedJobId)
        return "";
    return `IAS-Job-Id: ${normalizedJobId}\nIAS-Attempt: ${normalizedAttempt}`;
}
export function withJobCommitTrailer(commitMessage, jobId, attemptNumber = 1) {
    const subject = normalizeString(commitMessage) || "ias(job): update";
    const trailer = buildJobCommitTrailer(jobId, attemptNumber);
    if (!trailer)
        return subject;
    return `${subject}\n\n${trailer}`;
}
export function gitLogArgsForJobCommit(jobId) {
    const normalizedJobId = normalizeString(jobId);
    if (!normalizedJobId)
        return ["log", "--all", "--format=%H"];
    return ["log", "--all", "--grep", `^IAS-Job-Id: ${normalizedJobId}$`, "--extended-regexp", "--format=%H"];
}
//# sourceMappingURL=git-autocommit.mjs.map