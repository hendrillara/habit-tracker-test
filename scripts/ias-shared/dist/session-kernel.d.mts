/**
 * Session kernel — resumable governed session state machine.
 *
 * The session kernel manages the lifecycle of governed mutable work against
 * a managed repo. It is the orchestration layer between the claim-dispatch
 * loop (LUC-9) and per-job execution (runner's cmdRunOnce).
 *
 * Responsibilities:
 *   - Deterministic state machine (see SESSION_STATES for the exhaustive list)
 *   - Compatible work routing (join/queue/reject)
 *   - Validator-outcome-driven state transitions
 *   - Pause/resume serialization via checkpoints
 *   - Repair loop with bounded retry
 *
 * This module is shared between the local agent runtime (framework) and
 * the thin control plane (Console). It contains NO execution logic, NO
 * control-plane calls — only pure state machine + routing + serialization.
 *
 * See docs/target-state/domains/04-governed-execution/contracts.md for the
 * canonical contract.
 */
import type { ValidatorFeedback } from "./validators.mts";
export type SessionState = "planning" | "executing" | "validating" | "repairing" | "waiting_for_input" | "waiting_for_approval" | "completed" | "blocked" | "canceled";
export interface SessionCheckpoint {
    sessionId: string;
    repoId: string;
    runRef: string;
    state: SessionState;
    createdAt: string;
    updatedAt: string;
    /** Human-readable reason for the current state. */
    stateReason?: string;
    /** Number of repair attempts in the current repair cycle. */
    repairAttempts: number;
    /** Maximum allowed repair attempts before escalating to blocked. */
    maxRepairAttempts: number;
    /** What the session is waiting for (only set in waiting_* states). */
    waitingFor?: {
        kind: "input" | "approval";
        description: string;
        requestedAt: string;
    };
    /** Validator feedback from the last validation pass. */
    lastValidationFeedback?: ValidatorFeedback[];
    /** History of state transitions for auditability. */
    transitionLog: Array<{
        from: SessionState;
        to: SessionState;
        at: string;
        reason?: string;
    }>;
}
export type CompatibilityDecision = "join" | "queue" | "reject";
export interface CompatibilityContext {
    /** The incoming work request's repo ID. */
    repoId: string;
    /** The incoming work request's run reference. */
    runRef?: string;
    /** Whether the incoming work is the exact awaited response (approval/input). */
    isAwaitedResponse?: boolean;
}
/** All valid session states. */
export declare const SESSION_STATES: readonly SessionState[];
/**
 * Create a new session checkpoint in the `planning` state.
 */
export declare function createSession(opts: {
    sessionId: string;
    repoId: string;
    runRef: string;
    maxRepairAttempts?: number;
}): SessionCheckpoint;
/**
 * Check whether a transition from `from` to `to` is valid according to
 * the deterministic transition matrix.
 */
export declare function isValidSessionTransition(from: SessionState, to: SessionState): boolean;
/**
 * Attempt a state transition on a checkpoint. Returns a new checkpoint with
 * the updated state, or throws if the transition is invalid.
 *
 * This function is pure — it does not mutate the input checkpoint.
 */
export declare function transitionSession(checkpoint: SessionCheckpoint, to: SessionState, reason?: string): SessionCheckpoint;
/**
 * Route incoming work against the active session. Pure function.
 *
 * Decision table (7 rules):
 *   1. No active session → join (create one)
 *   2. Waiting state + incoming IS the awaited response → join
 *   3. Waiting state + incoming is NOT the awaited response → queue
 *   4. Terminal state → join (new session)
 *   5. Active state + same repo + same runRef → join
 *   6. Active state + same repo + different runRef → queue
 *   7. Different repo → reject
 */
export declare function routeCompatibleWork(activeSession: SessionCheckpoint | null, incoming: CompatibilityContext): CompatibilityDecision;
/**
 * Apply a validator gate outcome to the session, returning the new checkpoint.
 *
 * Must be called when the session is in the `validating` state.
 *
 * Logic:
 *   - proceed → transition to `completed` (validation passed, work is done
 *     for this cycle; the caller can transition to `executing` if more work
 *     remains)
 *   - proceed + needsInput → waiting_for_input
 *   - proceed + needsApproval → waiting_for_approval
 *   - repair + repairAttempts < max → repairing (increment repairAttempts)
 *   - repair + repairAttempts >= max → blocked (repair bound exceeded)
 *   - abort → blocked (hard_stop)
 */
export declare function applyValidatorOutcome(checkpoint: SessionCheckpoint, gateOutcome: "proceed" | "repair" | "abort", options?: {
    needsInput?: boolean;
    needsApproval?: boolean;
    approvalDescription?: string;
    inputDescription?: string;
    feedback?: ValidatorFeedback[];
}): SessionCheckpoint;
/**
 * Serialize a session checkpoint to JSON for persistence.
 */
export declare function serializeCheckpoint(checkpoint: SessionCheckpoint): string;
/**
 * Deserialize a session checkpoint from JSON.
 * Throws on invalid JSON or missing required fields.
 */
export declare function deserializeCheckpoint(json: string): SessionCheckpoint;
/** True if the state is an active (mutable work happening) state. */
export declare function isActiveState(state: SessionState): boolean;
/** True if the state is a waiting (paused for human) state. */
export declare function isWaitingState(state: SessionState): boolean;
/**
 * True if autonomous progress has stopped. Includes truly terminal states
 * (`completed`, `canceled`) and `blocked` (recoverable via explicit human action).
 */
export declare function isInactiveState(state: SessionState): boolean;
//# sourceMappingURL=session-kernel.d.mts.map