const VALID_JOB_ROLES = new Set(["orchestrator", "implementer", "reviewer", "researcher", "pm", "ux", "test-runner", "screenshotter"]);
const ROLE_ALIASES = new Map([
    ["dev", "implementer"],
    ["developer", "implementer"],
    ["engineer", "implementer"],
    ["engineering", "implementer"],
    ["swe", "implementer"],
    ["programmer", "implementer"],
    ["review", "reviewer"],
    ["code-review", "reviewer"],
    ["pr-review", "reviewer"],
    ["research", "researcher"],
    ["product", "pm"],
    ["product-manager", "pm"],
    ["project-manager", "pm"],
    ["designer", "ux"],
    ["testrunner", "test-runner"],
    ["qa", "test-runner"],
    ["lead", "orchestrator"],
    ["coordinator", "orchestrator"],
    ["architect", "orchestrator"],
    // IAS skill aliases emitted by orchestrator prompts.
    ["ias-orchestrating", "orchestrator"],
    ["ias-implementing", "implementer"],
    ["ias-reviewing", "reviewer"],
    ["ias-researching", "researcher"],
    ["ias-valuing", "pm"],
    ["ias-ux-clarifying", "ux"],
    ["ias-testing", "test-runner"],
    ["screenshotter", "screenshotter"],
    ["screenshot", "screenshotter"],
    ["ias-screenshotting", "screenshotter"],
    ["ias-screenshotter", "screenshotter"],
]);
function normalizeString(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value.trim();
    return String(value).trim();
}
function normalizeRoleKey(value) {
    return normalizeString(value)
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");
}
export function normalizeJobRole(value) {
    const key = normalizeRoleKey(value);
    if (!key)
        return null;
    if (VALID_JOB_ROLES.has(key))
        return key;
    const alias = ROLE_ALIASES.get(key);
    if (alias && VALID_JOB_ROLES.has(alias))
        return alias;
    return null;
}
export async function processNextJobs(nextJobs, opts) {
    const jobs = Array.isArray(nextJobs) ? nextJobs : [];
    const dispatch = opts && typeof opts.dispatch === "function" ? opts.dispatch : null;
    if (!dispatch)
        throw new Error("next_jobs: missing dispatch handler");
    const onWarn = opts && typeof opts.onWarn === "function" ? opts.onWarn : null;
    const warn = (message) => {
        if (onWarn)
            onWarn(message);
    };
    let enqueued = 0;
    let skipped = 0;
    let errors = 0;
    for (const nj of jobs) {
        const role = normalizeJobRole(nj?.role);
        const prompt = normalizeString(nj?.prompt);
        if (!role) {
            skipped += 1;
            warn(`next_jobs: invalid role (${normalizeString(nj?.role) || "missing"})`);
            continue;
        }
        if (!prompt) {
            skipped += 1;
            warn(`next_jobs: missing prompt (role=${role})`);
            continue;
        }
        const kindRaw = normalizeString(nj?.kind).toLowerCase() || "work";
        const kind = kindRaw === "screenshot" ? "screenshot" : "work";
        // For screenshot kind, role must be "screenshotter" (role validation already passed above).
        // For work kind, role must not be "screenshotter" (screenshotter has no work executor).
        if (kind === "work" && role === "screenshotter") {
            skipped += 1;
            warn(`next_jobs: role=screenshotter requires kind=screenshot`);
            continue;
        }
        if (kind === "screenshot" && role !== "screenshotter") {
            skipped += 1;
            warn(`next_jobs: kind=screenshot requires role=screenshotter (got role=${role})`);
            continue;
        }
        const payload = {
            role,
            kind,
            prompt,
            write: Boolean(nj?.write),
            network: Boolean(nj?.network),
            web_search: Boolean(nj?.web_search),
        };
        try {
            await dispatch(payload);
            enqueued += 1;
        }
        catch (e) {
            errors += 1;
            const msg = e instanceof Error ? e.message : String(e);
            warn(`next_jobs: enqueue failed (role=${role}): ${msg}`);
        }
    }
    return { enqueued, skipped, errors };
}
//# sourceMappingURL=next-jobs.mjs.map