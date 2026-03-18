/**
 * compliance-posture.mts — Compliance-relevant posture declarations.
 *
 * Pure module. Defines product-level posture for model/vendor governance,
 * retention/export, and network/secret handling.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
// ---------------------------------------------------------------------------
// Posture Status
// ---------------------------------------------------------------------------
export const POSTURE_STATUSES = ["declared", "partial", "missing"];
// ---------------------------------------------------------------------------
// Posture Categories
// ---------------------------------------------------------------------------
export const POSTURE_CATEGORIES = ["model_vendor", "retention", "network_secret"];
export function createModelVendorPosture(input) {
    const hasVendor = !!input.vendor;
    const hasModel = !!input.model;
    let status;
    if (hasVendor && hasModel)
        status = "declared";
    else if (hasVendor || hasModel)
        status = "partial";
    else
        status = "missing";
    return {
        status,
        category: "model_vendor",
        vendor: input.vendor,
        model: input.model,
        dataProcessingRegion: input.dataProcessingRegion,
        declaredAt: new Date().toISOString(),
    };
}
export function createRetentionPosture(input) {
    const fields = [input.retentionPolicy, input.exportCapability, input.purgeCapability];
    const defined = fields.filter((f) => f !== undefined && f !== null).length;
    let status;
    if (defined === 3)
        status = "declared";
    else if (defined > 0)
        status = "partial";
    else
        status = "missing";
    return {
        status,
        category: "retention",
        ...input,
        declaredAt: new Date().toISOString(),
    };
}
export function createNetworkSecretPosture(input) {
    const fields = [input.networkBoundary, input.secretStorage, input.secretRotation];
    const defined = fields.filter((f) => f !== undefined && f !== null).length;
    let status;
    if (defined === 3)
        status = "declared";
    else if (defined > 0)
        status = "partial";
    else
        status = "missing";
    return {
        status,
        category: "network_secret",
        ...input,
        declaredAt: new Date().toISOString(),
    };
}
export function computeCompliancePostureSummary(postures) {
    const values = Object.values(postures);
    const summary = {
        declared: 0,
        partial: 0,
        missing: 0,
        overallStatus: "declared",
    };
    if (values.length === 0) {
        summary.overallStatus = "missing";
        return summary;
    }
    for (const { status } of values) {
        summary[status]++;
    }
    if (summary.missing > 0)
        summary.overallStatus = "missing";
    else if (summary.partial > 0)
        summary.overallStatus = "partial";
    else
        summary.overallStatus = "declared";
    return summary;
}
//# sourceMappingURL=compliance-posture.mjs.map