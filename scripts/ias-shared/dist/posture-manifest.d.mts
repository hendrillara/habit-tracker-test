/**
 * posture-manifest.mts — Product-level posture contract.
 *
 * Declares what IAS actually provides for each compliance-facing
 * posture category. Missing posture is explicit, not implied.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 * Ticket: LUC-36
 */
import type { PostureCategory } from "./compliance-posture.mts";
import { type ModelVendorPosture, type RetentionPosture, type NetworkSecretPosture } from "./compliance-posture.mjs";
export interface PostureManifestEntry {
    category: PostureCategory;
    available: boolean;
    summary: string;
    details: Record<string, unknown>;
    gaps: readonly string[];
}
export interface PostureManifest {
    version: string;
    generatedAt: string;
    entries: Record<PostureCategory, PostureManifestEntry>;
}
/**
 * Returns the honest current-state manifest for IAS.
 *
 * Cross-Ticket Resolution 3.1: The `model` field is omitted from
 * model_vendor details so that `createModelVendorPosture` correctly
 * returns `partial` status. Passing both `vendor` and `model` as
 * truthy strings would produce `declared` status, which overstates
 * the product's actual posture.
 */
export declare function createDefaultPostureManifest(): PostureManifest;
export interface ResolvedPostures {
    modelVendor: ModelVendorPosture;
    retention: RetentionPosture;
    networkSecret: NetworkSecretPosture;
}
/**
 * Bridges the manifest to the compliance-posture pipeline.
 *
 * Error handling (aligned with cross-ticket resolution):
 * - Missing required entries (model_vendor, retention, network_secret) throw.
 * - Unknown categories in the manifest are silently ignored.
 */
export declare function resolvePostureFromManifest(manifest: PostureManifest): ResolvedPostures;
export declare function describePostureManifest(manifest: PostureManifest): string[];
//# sourceMappingURL=posture-manifest.d.mts.map