/**
 * posture-manifest.mts — Product-level posture contract.
 *
 * Declares what IAS actually provides for each compliance-facing
 * posture category. Missing posture is explicit, not implied.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 * Ticket: LUC-36
 */
import { createModelVendorPosture, createRetentionPosture, createNetworkSecretPosture, } from "./compliance-posture.mjs";
// ---------------------------------------------------------------------------
// Default Manifest
// ---------------------------------------------------------------------------
/**
 * Returns the honest current-state manifest for IAS.
 *
 * Cross-Ticket Resolution 3.1: The `model` field is omitted from
 * model_vendor details so that `createModelVendorPosture` correctly
 * returns `partial` status. Passing both `vendor` and `model` as
 * truthy strings would produce `declared` status, which overstates
 * the product's actual posture.
 */
export function createDefaultPostureManifest() {
    return {
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        entries: {
            model_vendor: {
                category: "model_vendor",
                available: true,
                summary: "Model and vendor are operator-configured. IAS does not enforce data-processing region constraints.",
                details: {
                    vendor: "operator-configured",
                },
                gaps: [
                    "Model selection is operator-configured at runtime, not declared in manifest",
                    "Data-processing region is vendor-dependent, not governed by IAS",
                ],
            },
            retention: {
                category: "retention",
                available: false,
                summary: "IAS does not own data retention, export, or purge. Evidence durability is determined by storage type.",
                details: {},
                gaps: [
                    "No product-level retention policy",
                    "No export mechanism",
                    "No purge capability",
                ],
            },
            network_secret: {
                category: "network_secret",
                available: true,
                summary: "Network boundary is sandbox-enforced. Secrets remain local. IAS does not manage secret storage or rotation.",
                details: {
                    networkBoundary: "sandbox-enforced",
                    secretStorage: "local-operator-managed",
                },
                gaps: ["Secret rotation is not managed by IAS"],
            },
        },
    };
}
/**
 * Bridges the manifest to the compliance-posture pipeline.
 *
 * Error handling (aligned with cross-ticket resolution):
 * - Missing required entries (model_vendor, retention, network_secret) throw.
 * - Unknown categories in the manifest are silently ignored.
 */
export function resolvePostureFromManifest(manifest) {
    const mv = manifest.entries.model_vendor;
    const rt = manifest.entries.retention;
    const ns = manifest.entries.network_secret;
    if (!mv)
        throw new Error("Manifest missing model_vendor entry");
    if (!rt)
        throw new Error("Manifest missing retention entry");
    if (!ns)
        throw new Error("Manifest missing network_secret entry");
    return {
        modelVendor: createModelVendorPosture(mv.available ? mv.details : {}),
        retention: createRetentionPosture(rt.available ? rt.details : {}),
        networkSecret: createNetworkSecretPosture(ns.available ? ns.details : {}),
    };
}
// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------
const CATEGORY_LABELS = {
    model_vendor: "Model/Vendor",
    retention: "Retention/Export",
    network_secret: "Network/Secret",
};
export function describePostureManifest(manifest) {
    const lines = [];
    for (const category of [
        "model_vendor",
        "retention",
        "network_secret",
    ]) {
        const entry = manifest.entries[category];
        if (!entry) {
            lines.push(`${CATEGORY_LABELS[category]}: Not declared`);
            continue;
        }
        let line = `${CATEGORY_LABELS[category]}: ${entry.summary}`;
        if (!entry.available) {
            line += " [Not available]";
        }
        else if (entry.gaps.length > 0) {
            line += ` [Gaps: ${entry.gaps.join("; ")}]`;
        }
        lines.push(line);
    }
    return lines;
}
//# sourceMappingURL=posture-manifest.mjs.map