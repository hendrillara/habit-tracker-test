/**
 * Validator taxonomy — deterministic rule evaluation for the IAS framework.
 *
 * Validators observe execution context and produce feedback envelopes.
 * They never mutate state or call LLMs. The four kinds form a hierarchy:
 *
 *   hard_stop  → blocks execution, no override
 *   repairable → blocks execution, provides a repair hint
 *   policy     → logs compliance signal, does not block
 *   evidence   → captures audit evidence, does not block
 *
 * This module is the canonical source for the validator taxonomy.
 */
import type { RepoCapabilityState } from "./capability-states.mts";
export type ValidatorKind = "hard_stop" | "repairable" | "policy" | "evidence";
export type ValidatorFeedback = {
    kind: "hard_stop";
    validatorId: string;
    passed: boolean;
    message: string;
    blockReason?: string;
} | {
    kind: "repairable";
    validatorId: string;
    passed: boolean;
    message: string;
    repairHint?: string;
} | {
    kind: "policy";
    validatorId: string;
    passed: boolean;
    message: string;
} | {
    kind: "evidence";
    validatorId: string;
    passed: boolean;
    message: string;
    evidenceRef?: string;
};
export interface ValidatorContext {
    repoRoot: string;
    jobKind?: string;
    sessionId?: string;
    capabilityState?: RepoCapabilityState;
}
export interface ValidatorDefinition {
    id: string;
    name: string;
    kind: ValidatorKind;
    description: string;
    evaluate: (context: ValidatorContext) => ValidatorFeedback | Promise<ValidatorFeedback>;
}
export interface ValidatorRegistry {
    register(validator: ValidatorDefinition): void;
    evaluate(context: ValidatorContext): Promise<ValidatorFeedback[]>;
    getById(id: string): ValidatorDefinition | undefined;
    list(): ValidatorDefinition[];
}
export declare function createValidatorRegistry(): ValidatorRegistry;
/** True when any feedback in the set is a blocking failure (hard_stop or repairable). */
export declare function hasBlockingFailure(feedback: ValidatorFeedback[]): boolean;
/** Filter feedback to only hard-stop failures. */
export declare function getHardStops(feedback: ValidatorFeedback[]): ValidatorFeedback[];
/** Filter feedback to only repairable failures. */
export declare function getRepairableFailures(feedback: ValidatorFeedback[]): ValidatorFeedback[];
//# sourceMappingURL=validators.d.mts.map