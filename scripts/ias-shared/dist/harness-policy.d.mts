/**
 * harness-policy.mts — Layered harness policy model.
 *
 * Pure module (no side effects, type-only imports from sibling modules).
 * Defines how governance baselines are published, assigned,
 * and resolved across enterprise → team → repo layers.
 *
 * See domains/02-harness-and-policy/ for domain requirements.
 */
import type { ValidatorKind } from "./validators.mts";
export declare const POLICY_LAYERS: readonly ["enterprise", "team", "repo"];
export type PolicyLayer = (typeof POLICY_LAYERS)[number];
export declare function isValidPolicyLayer(s: string): s is PolicyLayer;
/** Precedence index — lower number = higher precedence. */
export declare function layerPrecedence(layer: PolicyLayer): number;
export declare const BASELINE_STATES: readonly ["draft", "published", "applied", "superseded"];
export type BaselineState = (typeof BASELINE_STATES)[number];
export declare function isValidBaselineTransition(from: BaselineState, to: BaselineState): boolean;
export interface HarnessProfile {
    id: string;
    name: string;
    description: string;
    layer: PolicyLayer;
    state: BaselineState;
    /** Validator IDs attached at this layer. */
    validatorIds: readonly string[];
    /** Arbitrary policy rules (key-value). */
    rules: Readonly<Record<string, unknown>>;
    createdAt: string;
    updatedAt: string;
}
export interface PolicyBundle {
    profileId: string;
    layer: PolicyLayer;
    rules: Readonly<Record<string, unknown>>;
}
export interface BaselineAssignment {
    profileId: string;
    layer: PolicyLayer;
    /** Target scope identifier (org ID, team ID, or repo ID). */
    targetId: string;
    assignedAt: string;
    assignedBy: string;
}
/**
 * Transition a draft profile to published state.
 * Enforces: profile must be in `draft` state and have a non-empty name.
 */
export declare function publishBaseline(profile: HarnessProfile): HarnessProfile;
/**
 * Transition a published profile to applied state.
 * Enforces: profile must be in `published` state.
 */
export declare function applyBaseline(profile: HarnessProfile): HarnessProfile;
/**
 * Create a scope assignment for a published or applied profile.
 * Enforces: profile must NOT be in `draft` or `superseded` state.
 */
export interface AssignBaselineInput {
    profile: HarnessProfile;
    targetId: string;
    assignedBy: string;
    /** Optional timestamp (defaults to new Date().toISOString()). */
    assignedAt?: string;
}
export declare function assignBaseline(input: AssignBaselineInput): BaselineAssignment;
export interface LayerInput {
    layer: PolicyLayer;
    rules: Readonly<Record<string, unknown>>;
}
/**
 * Resolve effective policy by merging layers.
 * Higher-precedence layers (enterprise) set defaults;
 * lower layers (team, repo) override via shallow merge.
 *
 * Note: this MVP merge does NOT enforce the tighten-only constraint.
 * Use `classifyLayerChange` (LUC-27) to detect weakening separately.
 */
export declare function resolveEffectivePolicy(layers: readonly LayerInput[]): Record<string, unknown>;
/** How to interpret "stricter" for a given rule key. */
export type StrictnessDirection = "lower-is-stricter" | "higher-is-stricter" | "true-is-stricter";
export interface RuleClassificationConfig {
    direction: StrictnessDirection;
}
export type ChangeClassification = "specialization" | "weakening" | "equivalent" | "unclassified";
export interface LayerChangeResult {
    key: string;
    classification: ChangeClassification;
    higherValue: unknown;
    lowerValue: unknown;
}
export interface LayerChangeInput {
    key: string;
    higherValue: unknown;
    lowerValue: unknown;
}
/** A weakening violation detected during strict policy resolution. */
export interface WeakeningViolation {
    key: string;
    strongerLayer: PolicyLayer;
    strongerValue: unknown;
    weakerLayer: PolicyLayer;
    weakerValue: unknown;
    /** If an active exception covers this violation, its ID is recorded here. */
    exceptionId?: string;
}
/** Active validator descriptor for policy inspection. */
export interface ActiveValidator {
    validatorId: string;
    name: string;
    kind: ValidatorKind;
    ownerLayer: PolicyLayer;
}
/** The unified effective policy result shared by all consumers. */
export interface EffectivePolicyResult {
    /** Effective rule values after enforcement. Weakening is blocked unless covered by an exception. */
    effective: Record<string, unknown>;
    /** Per-key provenance: which layer set each effective value. */
    provenance: Record<string, RuleProvenance>;
    /** Legal specialization and equivalent changes (informational). */
    specializations: LayerChangeResult[];
    /** Unclassified changes (fail-open, applied but recorded for audit). */
    unclassified: LayerChangeResult[];
    /** Weakening violations (blocked unless covered by active exception). */
    violations: WeakeningViolation[];
    /** Active validators and which layer owns them. */
    activeValidators: ActiveValidator[];
    /** True when any violation lacks a covering exception. */
    hasUnresolvedWeakening: boolean;
}
export interface StrictResolutionInput {
    layers: readonly LayerInput[];
    classificationRules: Readonly<Record<string, RuleClassificationConfig>>;
    /** Active exceptions that may cover weakening violations. */
    activeExceptions?: readonly {
        ruleKey: string;
        id: string;
    }[];
}
export interface EffectivePolicyBuildInput extends StrictResolutionInput {
    validators?: readonly ActiveValidator[];
}
export declare function classifyLayerChange(change: LayerChangeInput, classificationRules: Readonly<Record<string, RuleClassificationConfig>>): LayerChangeResult;
export interface RuleProvenance {
    layer: PolicyLayer;
    value: unknown;
}
export interface PolicyInspection {
    effective: Record<string, unknown>;
    provenance: Record<string, RuleProvenance>;
}
export declare function inspectEffectivePolicy(layers: readonly LayerInput[]): PolicyInspection;
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
export declare function resolveEffectivePolicyStrict(input: StrictResolutionInput): Omit<EffectivePolicyResult, "activeValidators">;
/**
 * Build a complete EffectivePolicyResult for all consumers.
 *
 * This is the single entry point that operator, runtime, and evidence
 * consumers should use. It guarantees they all reference the same result.
 */
export declare function buildEffectivePolicyResult(input: EffectivePolicyBuildInput): EffectivePolicyResult;
//# sourceMappingURL=harness-policy.d.mts.map