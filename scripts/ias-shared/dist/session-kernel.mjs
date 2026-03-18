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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** All valid session states. */
export const SESSION_STATES = [
    "planning",
    "executing",
    "validating",
    "repairing",
    "waiting_for_input",
    "waiting_for_approval",
    "completed",
    "blocked",
    "canceled",
];
/** States where mutable work can be happening. */
const ACTIVE_STATES = new Set([
    "planning",
    "executing",
    "validating",
    "repairing",
]);
/** States where the session is paused for human response. */
const WAITING_STATES = new Set([
    "waiting_for_input",
    "waiting_for_approval",
]);
/**
 * States where autonomous progress has stopped.
 * - `completed` and `canceled` are truly terminal (no outbound transitions).
 * - `blocked` can transition to `executing` via explicit human recovery,
 *   but is inactive from the perspective of autonomous progress and routing.
 */
const INACTIVE_STATES = new Set([
    "completed",
    "blocked",
    "canceled",
]);
// ---------------------------------------------------------------------------
// Transition matrix
// ---------------------------------------------------------------------------
/**
 * For each state, the set of states it can transition to.
 *
 * From the contracts doc:
 *   start → planning
 *   planning → executing
 *   executing → validating
 *   validating → repairing | waiting_for_input | waiting_for_approval | blocked | completed
 *   repairing → executing
 *   waiting_for_input → executing
 *   waiting_for_approval → executing
 *   executing → blocked | completed
 *   blocked → executing  (explicit resume/recovery)
 *   any active → canceled
 */
const TRANSITION_MATRIX = {
    planning: new Set(["executing", "canceled"]),
    executing: new Set(["validating", "blocked", "completed", "canceled"]),
    validating: new Set([
        "executing", // proceed → continue execution
        "repairing", // repairable failure
        "waiting_for_input",
        "waiting_for_approval",
        "blocked", // hard_stop or repeated repair failure
        "completed", // all validators pass, work is done
        "canceled",
    ]),
    repairing: new Set(["executing", "canceled"]),
    waiting_for_input: new Set(["executing", "canceled"]),
    waiting_for_approval: new Set(["executing", "canceled"]),
    completed: new Set(), // terminal — no outbound transitions
    blocked: new Set(["executing"]), // explicit resume/recovery only
    canceled: new Set(), // terminal — no outbound transitions
};
// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------
/**
 * Create a new session checkpoint in the `planning` state.
 */
export function createSession(opts) {
    const now = new Date().toISOString();
    return {
        sessionId: opts.sessionId,
        repoId: opts.repoId,
        runRef: opts.runRef,
        state: "planning",
        createdAt: now,
        updatedAt: now,
        repairAttempts: 0,
        maxRepairAttempts: opts.maxRepairAttempts ?? 3,
        transitionLog: [],
    };
}
// ---------------------------------------------------------------------------
// Transition validation and execution
// ---------------------------------------------------------------------------
/**
 * Check whether a transition from `from` to `to` is valid according to
 * the deterministic transition matrix.
 */
export function isValidSessionTransition(from, to) {
    const allowed = TRANSITION_MATRIX[from];
    if (!allowed)
        return false;
    return allowed.has(to);
}
/**
 * Attempt a state transition on a checkpoint. Returns a new checkpoint with
 * the updated state, or throws if the transition is invalid.
 *
 * This function is pure — it does not mutate the input checkpoint.
 */
export function transitionSession(checkpoint, to, reason) {
    if (!isValidSessionTransition(checkpoint.state, to)) {
        throw new Error(`Invalid session transition: ${checkpoint.state} → ${to}` +
            (reason ? ` (reason: ${reason})` : ""));
    }
    const now = new Date().toISOString();
    const logEntry = {
        from: checkpoint.state,
        to,
        at: now,
        ...(reason ? { reason } : {}),
    };
    const next = {
        ...checkpoint,
        state: to,
        updatedAt: now,
        stateReason: reason,
        transitionLog: [...checkpoint.transitionLog, logEntry],
    };
    // Clear waitingFor when leaving a waiting state
    if (WAITING_STATES.has(checkpoint.state) && !WAITING_STATES.has(to)) {
        next.waitingFor = undefined;
    }
    // Reset repair counter when recovering from blocked (fresh repair budget for the new cycle)
    if (checkpoint.state === "blocked" && to === "executing") {
        next.repairAttempts = 0;
    }
    return next;
}
// ---------------------------------------------------------------------------
// Compatible work routing
// ---------------------------------------------------------------------------
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
export function routeCompatibleWork(activeSession, incoming) {
    // Rule 1: No active session
    if (!activeSession)
        return "join";
    // Rule 4: Terminal state — session is done, new work can start
    if (INACTIVE_STATES.has(activeSession.state))
        return "join";
    // Rule 7: Different repo — always reject
    if (activeSession.repoId !== incoming.repoId)
        return "reject";
    // Rules 2 & 3: Waiting states
    if (WAITING_STATES.has(activeSession.state)) {
        return incoming.isAwaitedResponse ? "join" : "queue";
    }
    // Rules 5 & 6: Active states, same repo
    if (ACTIVE_STATES.has(activeSession.state)) {
        return activeSession.runRef === incoming.runRef ? "join" : "queue";
    }
    // Fallback (should not be reachable with correct state categorization)
    return "queue";
}
// ---------------------------------------------------------------------------
// Validator outcome application
// ---------------------------------------------------------------------------
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
export function applyValidatorOutcome(checkpoint, gateOutcome, options) {
    if (checkpoint.state !== "validating") {
        throw new Error(`applyValidatorOutcome requires state 'validating', got '${checkpoint.state}'`);
    }
    // Store feedback if provided
    let updated = { ...checkpoint };
    if (options?.feedback) {
        updated = { ...updated, lastValidationFeedback: options.feedback };
    }
    // --- abort → blocked ---
    if (gateOutcome === "abort") {
        return transitionSession(updated, "blocked", "Validator hard_stop — execution blocked");
    }
    // --- repair → repairing or blocked ---
    if (gateOutcome === "repair") {
        if (updated.repairAttempts >= updated.maxRepairAttempts) {
            return transitionSession(updated, "blocked", `Repair bound exceeded (${updated.maxRepairAttempts} attempts)`);
        }
        const repairing = transitionSession(updated, "repairing", "Repairable validator failure — attempting repair");
        return { ...repairing, repairAttempts: repairing.repairAttempts + 1 };
    }
    // --- proceed ---
    // Check if human gate is needed first
    if (options?.needsInput) {
        const now = new Date().toISOString();
        const waiting = transitionSession(updated, "waiting_for_input", "Validator passed but human input required");
        return {
            ...waiting,
            waitingFor: {
                kind: "input",
                description: options.inputDescription ?? "Input required",
                requestedAt: now,
            },
        };
    }
    if (options?.needsApproval) {
        const now = new Date().toISOString();
        const waiting = transitionSession(updated, "waiting_for_approval", "Validator passed but human approval required");
        return {
            ...waiting,
            waitingFor: {
                kind: "approval",
                description: options.approvalDescription ?? "Approval required",
                requestedAt: now,
            },
        };
    }
    // Pure proceed → completed (validation cycle done)
    return transitionSession(updated, "completed", "All validators passed");
}
// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
/**
 * Serialize a session checkpoint to JSON for persistence.
 */
export function serializeCheckpoint(checkpoint) {
    return JSON.stringify(checkpoint);
}
/**
 * Deserialize a session checkpoint from JSON.
 * Throws on invalid JSON or missing required fields.
 */
export function deserializeCheckpoint(json) {
    const parsed = JSON.parse(json);
    // Validate required fields
    const required = [
        "sessionId",
        "repoId",
        "runRef",
        "state",
        "createdAt",
        "updatedAt",
        "repairAttempts",
        "maxRepairAttempts",
        "transitionLog",
    ];
    for (const field of required) {
        if (parsed[field] === undefined || parsed[field] === null) {
            throw new Error(`Invalid checkpoint: missing required field '${field}'`);
        }
    }
    // Validate state is a known session state
    if (!SESSION_STATES.includes(parsed.state)) {
        throw new Error(`Invalid checkpoint: unknown state '${parsed.state}'`);
    }
    // Validate field types to catch corrupted/tampered data early
    if (typeof parsed.sessionId !== "string")
        throw new Error("Invalid checkpoint: sessionId must be a string");
    if (typeof parsed.repoId !== "string")
        throw new Error("Invalid checkpoint: repoId must be a string");
    if (typeof parsed.runRef !== "string")
        throw new Error("Invalid checkpoint: runRef must be a string");
    if (typeof parsed.repairAttempts !== "number" || parsed.repairAttempts < 0) {
        throw new Error("Invalid checkpoint: repairAttempts must be a non-negative number");
    }
    if (typeof parsed.maxRepairAttempts !== "number" || parsed.maxRepairAttempts < 1) {
        throw new Error("Invalid checkpoint: maxRepairAttempts must be a positive number");
    }
    if (!Array.isArray(parsed.transitionLog)) {
        throw new Error("Invalid checkpoint: transitionLog must be an array");
    }
    if (!parsed.transitionLog.every((e) => typeof e?.from === "string" && typeof e?.to === "string" && typeof e?.at === "string")) {
        throw new Error("Invalid checkpoint: transitionLog entries must have from, to, at as strings");
    }
    if (parsed.repairAttempts > parsed.maxRepairAttempts) {
        throw new Error(`Invalid checkpoint: repairAttempts (${parsed.repairAttempts}) exceeds maxRepairAttempts (${parsed.maxRepairAttempts})`);
    }
    return parsed;
}
// ---------------------------------------------------------------------------
// State category helpers (exported for consumer use)
// ---------------------------------------------------------------------------
/** True if the state is an active (mutable work happening) state. */
export function isActiveState(state) {
    return ACTIVE_STATES.has(state);
}
/** True if the state is a waiting (paused for human) state. */
export function isWaitingState(state) {
    return WAITING_STATES.has(state);
}
/**
 * True if autonomous progress has stopped. Includes truly terminal states
 * (`completed`, `canceled`) and `blocked` (recoverable via explicit human action).
 */
export function isInactiveState(state) {
    return INACTIVE_STATES.has(state);
}
//# sourceMappingURL=session-kernel.mjs.map