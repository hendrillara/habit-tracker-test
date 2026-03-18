function normalizeString(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value.trim();
    return String(value).trim();
}
/**
 * Cap `evidence.changedPaths` to avoid control-plane payload blowups.
 *
 * @param {unknown} changedPaths
 * @param {{ maxPaths?: number }} [opts]
 * @returns {{ changedPaths: string[]; message: string | null }}
 */
export function capChangedPathsForEvidence(changedPaths, opts = {}) {
    const maxPathsRaw = opts && typeof opts === "object" ? opts.maxPaths : undefined;
    const maxPaths = typeof maxPathsRaw === "number" && Number.isFinite(maxPathsRaw) && maxPathsRaw > 0 ? maxPathsRaw : 500;
    const input = Array.isArray(changedPaths) ? changedPaths : [];
    const paths = input.map((p) => normalizeString(p)).filter(Boolean);
    if (paths.length <= maxPaths)
        return { changedPaths: paths, message: null };
    const truncated = paths.slice(0, maxPaths);
    return { changedPaths: truncated, message: `evidence.changedPaths truncated: sent ${maxPaths}/${paths.length}` };
}
//# sourceMappingURL=evidence.mjs.map