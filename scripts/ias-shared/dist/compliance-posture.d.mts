/**
 * compliance-posture.mts — Compliance-relevant posture declarations.
 *
 * Pure module. Defines product-level posture for model/vendor governance,
 * retention/export, and network/secret handling.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
export declare const POSTURE_STATUSES: readonly ["declared", "partial", "missing"];
export type PostureStatus = (typeof POSTURE_STATUSES)[number];
export declare const POSTURE_CATEGORIES: readonly ["model_vendor", "retention", "network_secret"];
export type PostureCategory = (typeof POSTURE_CATEGORIES)[number];
export interface PostureBase {
    status: PostureStatus;
    category: PostureCategory;
    declaredAt?: string;
    notes?: string;
}
export interface ModelVendorPosture extends PostureBase {
    category: "model_vendor";
    vendor?: string;
    model?: string;
    dataProcessingRegion?: string;
}
export interface ModelVendorInput {
    vendor?: string;
    model?: string;
    dataProcessingRegion?: string;
}
export declare function createModelVendorPosture(input: ModelVendorInput): ModelVendorPosture;
export interface RetentionPosture extends PostureBase {
    category: "retention";
    retentionPolicy?: string;
    exportCapability?: boolean;
    purgeCapability?: boolean;
}
export interface RetentionInput {
    retentionPolicy?: string;
    exportCapability?: boolean;
    purgeCapability?: boolean;
}
export declare function createRetentionPosture(input: RetentionInput): RetentionPosture;
export interface NetworkSecretPosture extends PostureBase {
    category: "network_secret";
    networkBoundary?: string;
    secretStorage?: string;
    secretRotation?: boolean;
}
export interface NetworkSecretInput {
    networkBoundary?: string;
    secretStorage?: string;
    secretRotation?: boolean;
}
export declare function createNetworkSecretPosture(input: NetworkSecretInput): NetworkSecretPosture;
export interface CompliancePostureSummary {
    declared: number;
    partial: number;
    missing: number;
    overallStatus: PostureStatus;
}
export declare function computeCompliancePostureSummary(postures: Record<string, Pick<PostureBase, "status">>): CompliancePostureSummary;
//# sourceMappingURL=compliance-posture.d.mts.map