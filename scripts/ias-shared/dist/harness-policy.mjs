/**
 * harness-policy.mts — Layered harness policy model.
 *
 * Pure module (no side effects, type-only imports from sibling modules).
 * Defines how governance baselines are published, assigned,
 * and resolved across enterprise → team → repo layers.
 *
 * See domains/02-harness-and-policy/ for domain requirements.
 */
import { BaselineError } from "./baseline-errors.mjs";
// ---------------------------------------------------------------------------
// Policy Layers (ordered: enterprise is highest precedence)
// ---------------------------------------------------------------------------
export const POLICY_LAYERS = ["enterprise", "team", "repo"];
const _layerSet = new Set(POLICY_LAYERS);
export function isValidPolicyLayer(s) {
    return _layerSet.has(s);
}
/** Precedence index — lower number = higher precedence. */
export function layerPrecedence(layer) {
    return POLICY_LAYERS.indexOf(layer);
}
// ---------------------------------------------------------------------------
// Baseline States
// ---------------------------------------------------------------------------
export const BASELINE_STATES = ["draft", "published", "applied", "superseded"];
const VALID_TRANSITIONS = {
    draft: ["published"],
    published: ["applied", "superseded"],
    applied: ["superseded"],
    superseded: [],
};
export function isValidBaselineTransition(from, to) {
    return VALID_TRANSITIONS[from].includes(to);
}
// ---------------------------------------------------------------------------
// Baseline Publication and Assignment (LUC-26)
// ---------------------------------------------------------------------------
/**
 * Transition a draft profile to published state.
 * Enforces: profile must be in `draft` state and have a non-empty name.
 */
export function publishBaseline(profile) {
    if (profile.state !== "draft") {
        throw new BaselineError(`Cannot publish baseline: current state is "${profile.state}", expected "draft"`, "INVALID_STATE_TRANSITION");
    }
    if (!profile.name.trim()) {
        throw new BaselineError("Cannot publish baseline: profile name is empty", "EMPTY_PROFILE_NAME");
    }
    return { ...profile, state: "published", updatedAt: new Date().toISOString() };
}
/**
 * Transition a published profile to applied state.
 * Enforces: profile must be in `published` state.
 */
export function applyBaseline(profile) {
    if (profile.state !== "published") {
        throw new BaselineError(`Cannot apply baseline: current state is "${profile.state}", expected "published"`, "INVALID_STATE_TRANSITION");
    }
    return { ...profile, state: "applied", updatedAt: new Date().toISOString() };
}
export function assignBaseline(input) {
    if (input.profile.state === "draft") {
        throw new BaselineError("Cannot assign baseline: profile is still in draft state", "DRAFT_ASSIGNMENT_BLOCKED");
    }
    if (input.profile.state === "superseded") {
        throw new BaselineError("Cannot assign baseline: profile has been superseded", "SUPERSEDED_ASSIGNMENT_BLOCKED");
    }
    if (!input.targetId.trim()) {
        throw new BaselineError("Cannot assign baseline: targetId is empty", "EMPTY_TARGET_ID");
    }
    return {
        profileId: input.profile.id,
        layer: input.profile.layer,
        targetId: input.targetId,
        assignedBy: input.assignedBy,
        assignedAt: input.assignedAt ?? new Date().toISOString(),
    };
}
/**
 * Resolve effective policy by merging layers.
 * Higher-precedence layers (enterprise) set defaults;
 * lower layers (team, repo) override via shallow merge.
 *
 * Note: this MVP merge does NOT enforce the tighten-only constraint.
 * Use `classifyLayerChange` (LUC-27) to detect weakening separately.
 */
export function resolveEffectivePolicy(layers) {
    const sorted = [...layers].sort((a, b) => layerPrecedence(a.layer) - layerPrecedence(b.layer));
    const effective = {};
    for (const { rules } of sorted) {
        Object.assign(effective, rules);
    }
    return effective;
}
export function classifyLayerChange(change, classificationRules) {
    const config = classificationRules[change.key];
    if (!config) {
        return { ...change, classification: "unclassified" };
    }
    const { higherValue, lowerValue } = change;
    if (higherValue === lowerValue) {
        return { ...change, classification: "equivalent" };
    }
    let isStricter;
    switch (config.direction) {
        case "lower-is-stricter":
            if (typeof lowerValue !== "number" || typeof higherValue !== "number") {
                return { ...change, classification: "unclassified" };
            }
            isStricter = lowerValue < higherValue;
            break;
        case "higher-is-stricter":
            if (typeof lowerValue !== "number" || typeof higherValue !== "number") {
                return { ...change, classification: "unclassified" };
            }
            isStricter = lowerValue > higherValue;
            break;
        case "true-is-stricter":
            isStricter = lowerValue === true && higherValue !== true;
            break;
        default: {
            const _exhaustive = config.direction;
            throw new Error(`Unknown strictness direction: "${_exhaustive}"`);
        }
    }
    return { ...change, classification: isStricter ? "specialization" : "weakening" };
}
export function inspectEffectivePolicy(layers) {
    const sorted = [...layers].sort((a, b) => layerPrecedence(a.layer) - layerPrecedence(b.layer));
    const effective = {};
    const provenance = {};
    for (const { layer, rules } of sorted) {
        for (const [key, value] of Object.entries(rules)) {
            effective[key] = value;
            provenance[key] = { layer, value };
        }
    }
    return { effective, provenance };
}
// ---------------------------------------------------------------------------
// Strict Policy Resolution (LUC-27)
// ---------------------------------------------------------------------------
/**
 * Resolve effective policy with enforcement.
 *
 * Unlike `resolveEffectivePolicy` (which blindly merges), this function:
 * 1. Classifies every layer override as specialization, weakening, equivalent, or unclassified.
 * 2. Blocks weakening unless covered by an active exception.
 * 3. Records all violations for audit and operator visibility.
 *
 * Unclassified overrides (keys not in classificationRules) are applied (fail-open)
 * to avoid blocking on incomplete rule metadata. They are recorded in the
 * separate `unclassified` array, not in `specializations`.
 */
export function resolveEffectivePolicyStrict(input) {
    const { layers, classificationRules, activeExceptions = [] } = input;
    const sorted = [...layers].sort((a, b) => layerPrecedence(a.layer) - layerPrecedence(b.layer));
    const effective = {};
    const provenance = {};
    const specializations = [];
    const unclassified = [];
    const violations = [];
    // Track which layer originally set each key (for violation reporting).
    const keyOriginLayer = {};
    for (const { layer, rules } of sorted) {
        for (const [key, value] of Object.entries(rules)) {
            if (!(key in effective)) {
                // First layer to define this key — no conflict possible.
                effective[key] = value;
                provenance[key] = { layer, value };
                keyOriginLayer[key] = layer;
                continue;
            }
            // Key already set by a higher-precedence layer.
            const strongerLayer = keyOriginLayer[key];
            const strongerValue = effective[key];
            const change = { key, higherValue: strongerValue, lowerValue: value };
            const result = classifyLayerChange(change, classificationRules);
            switch (result.classification) {
                case "specialization":
                case "equivalent":
                    // Legal override — apply.
                    effective[key] = value;
                    provenance[key] = { layer, value };
                    keyOriginLayer[key] = layer;
                    specializations.push(result);
                    break;
                case "weakening": {
                    // Check for active exception.
                    const exception = activeExceptions.find((e) => e.ruleKey === key);
                    const violation = {
                        key,
                        strongerLayer,
                        strongerValue,
                        weakerLayer: layer,
                        weakerValue: value,
                        exceptionId: exception?.id,
                    };
                    violations.push(violation);
                    if (exception) {
                        // Exception covers this weakening — apply the override.
                        effective[key] = value;
                        provenance[key] = { layer, value };
                        keyOriginLayer[key] = layer;
                    }
                    // else: higher-layer value stays (weakening blocked).
                    break;
                }
                case "unclassified":
                    // Fail-open for unknown rules — apply but record separately.
                    effective[key] = value;
                    provenance[key] = { layer, value };
                    keyOriginLayer[key] = layer;
                    unclassified.push(result);
                    break;
            }
        }
    }
    return {
        effective,
        provenance,
        specializations,
        unclassified,
        violations,
        hasUnresolvedWeakening: violations.some((v) => !v.exceptionId),
    };
}
/**
 * Build a complete EffectivePolicyResult for all consumers.
 *
 * This is the single entry point that operator, runtime, and evidence
 * consumers should use. It guarantees they all reference the same result.
 */
export function buildEffectivePolicyResult(input) {
    const { validators = [], ...resolutionInput } = input;
    const resolved = resolveEffectivePolicyStrict(resolutionInput);
    return {
        ...resolved,
        activeValidators: [...validators],
    };
}
//# sourceMappingURL=harness-policy.mjs.map