const SAFE_FIELDS = new Set([
    "command",
    "exitCode",
    "stderr",
    "stdout",
    "message",
    "summary",
    "suggestion",
    "path",
    "filePath",
    "repoPath",
    "branchName",
]);
const WINDOWS_HOME_PATTERN = /[a-z]:[\\/]+users[\\/]+[^\\/]+/gi;
const UNIX_HOME_PATTERN = /\/home\/[^/\s]+/g;
const MAC_HOME_PATTERN = /\/Users\/[^/\s]+/g;
const BEARER_PATTERN = /Bearer\s+\S+/gi;
const TOKEN_PATTERN = /\b(sk-[A-Za-z0-9_-]+|convex_[A-Za-z0-9_-]+)\b/g;
const ENV_SECRET_PATTERN = /\b[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*=[^\s;]+/g;
const CREDENTIAL_URL_PATTERN = /https?:\/\/[^@\s]+@/gi;
export function redactDetails(details) {
    const out = {};
    for (const [key, value] of Object.entries(details)) {
        if (!SAFE_FIELDS.has(key) || value === undefined)
            continue;
        if (typeof value !== "string") {
            out[key] = value;
            continue;
        }
        out[key] = redactString(value);
    }
    return out;
}
function redactString(input) {
    let value = input;
    value = value.replace(BEARER_PATTERN, "Bearer [REDACTED]");
    value = value.replace(ENV_SECRET_PATTERN, "[REDACTED]");
    value = value.replace(TOKEN_PATTERN, "[REDACTED]");
    value = value.replace(CREDENTIAL_URL_PATTERN, (match) => {
        const protocol = match.toLowerCase().startsWith("https://") ? "https://" : "http://";
        return `${protocol}***:***@`;
    });
    value = value.replace(WINDOWS_HOME_PATTERN, "~");
    value = value.replace(UNIX_HOME_PATTERN, "~");
    value = value.replace(MAC_HOME_PATTERN, "~");
    return value;
}
//# sourceMappingURL=redact-details.mjs.map