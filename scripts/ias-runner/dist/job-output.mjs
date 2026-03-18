const VALID_OUTPUT_STATUSES = new Set(["ok", "needs_human", "blocked", "failed"]);
const JOB_OUTCOME_REASON_SUMMARY_MAX = 400;
const JOB_OUTCOME_REASON_DETAILS_VALUE_MAX = 240;
const READ_ONLY_BLOCK_HINT_RE = /(sandbox[_\s-]*mode\s*[:=]\s*read-?only|approval[_\s-]*policy\s*[:=]\s*never|read[-\s]?only|write access (is )?disabled)/i;
const CONCRETE_WRITE_FAILURE_RE = /(eacces|eperm|permission denied|access is denied|read-only file system|operation not permitted|cannot write|failed to write|unable to write|write failed|enoent|no such file or directory)/i;
function normalizeString(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value.trim();
    return String(value).trim();
}
function defaultSummaryForStatus(status) {
    if (status === "needs_human")
        return "Needs human input";
    if (status === "blocked")
        return "Runner is blocked";
    if (status === "failed")
        return "Runner reported failure";
    return "Completed";
}
function clampText(value, maxLen) {
    const text = normalizeString(value);
    if (!text)
        return "";
    return text.length > maxLen ? text.slice(0, maxLen) : text;
}
export function normalizeJobOutputStatus(result) {
    const raw = result && typeof result === "object" ? result.status : result;
    const status = normalizeString(raw);
    return VALID_OUTPUT_STATUSES.has(status) ? status : "ok";
}
export function buildOutcomeReasonFromOutput(status, result) {
    const data = result && typeof result === "object" ? result : null;
    const summaryRaw = data?.summary ?? null;
    const summary = clampText(summaryRaw, JOB_OUTCOME_REASON_SUMMARY_MAX) || defaultSummaryForStatus(status);
    const details = {};
    if (data) {
        const decisionRequestId = data.decisionRequestId ?? data.decision_request_id;
        if (decisionRequestId)
            details.decisionRequestId = clampText(decisionRequestId, JOB_OUTCOME_REASON_DETAILS_VALUE_MAX);
        const blockedReason = data.blockedReason ?? data.blocked_reason;
        if (blockedReason)
            details.blockedReason = clampText(blockedReason, JOB_OUTCOME_REASON_DETAILS_VALUE_MAX);
    }
    const normalized = normalizeString(status) || "failed";
    const category = normalized === "failed" ? "failed" : "blocked";
    const code = normalized === "ok" ? "done" : normalized;
    const outcomeReason = {
        version: 1,
        category,
        code,
        retryable: true,
        summary,
    };
    if (Object.keys(details).length > 0)
        outcomeReason.details = details;
    return outcomeReason;
}
function summarizeOutputText(result) {
    const data = result && typeof result === "object" ? result : null;
    if (!data)
        return "";
    const summary = normalizeString(data.summary);
    const blockedReason = normalizeString(data.blockedReason ?? data.blocked_reason);
    return [summary, blockedReason].filter(Boolean).join(" | ");
}
export function isLikelyFalseReadOnlyBlockForWriteJob(result, mode) {
    const isWriteEnabled = Boolean(mode && typeof mode === "object" && mode.write);
    if (!isWriteEnabled)
        return false;
    const text = summarizeOutputText(result);
    if (!text)
        return false;
    if (!READ_ONLY_BLOCK_HINT_RE.test(text))
        return false;
    return !CONCRETE_WRITE_FAILURE_RE.test(text);
}
//# sourceMappingURL=job-output.mjs.map