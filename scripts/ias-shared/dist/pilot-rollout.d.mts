/**
 * pilot-rollout.mts — Pilot rollout model and expansion checkpoint rules.
 *
 * Pure module. Defines pilot lifecycle phases, expansion gates, and
 * evaluation criteria for pilot-to-scale progression.
 *
 * See domains/08-enterprise-governance-and-rollout/ for domain requirements.
 */
export declare const PILOT_PHASES: readonly ["scoping", "active", "expanding", "completed"];
export type PilotPhase = (typeof PILOT_PHASES)[number];
export declare function isValidPilotTransition(from: PilotPhase, to: PilotPhase): boolean;
export declare function transitionPilotPhase(scope: PilotScope, to: PilotPhase): PilotScope;
export interface PilotScope {
    id: string;
    name: string;
    phase: PilotPhase;
    repoIds: readonly string[];
    teamIds?: readonly string[];
    baselineId?: string;
    createdAt: string;
    updatedAt: string;
}
export declare function createPilotScope(input: Omit<PilotScope, "phase" | "createdAt" | "updatedAt">): PilotScope;
export interface CheckpointCriterion {
    name: string;
    threshold: number;
    actual: number;
}
export interface ExpansionCheckpointInput {
    name: string;
    criteria: readonly CheckpointCriterion[];
}
export interface ExpansionCheckpointResult {
    name: string;
    passed: boolean;
    failedCriteria: readonly CheckpointCriterion[];
    evaluatedAt: string;
}
export declare function evaluateExpansionCheckpoint(input: ExpansionCheckpointInput): ExpansionCheckpointResult;
//# sourceMappingURL=pilot-rollout.d.mts.map