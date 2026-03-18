/**
 * Decision Loop Integration
 *
 * Integrates the three-tier attention model with the runner execution flow.
 * Provides hooks for checking blockers, recording assumptions, and managing
 * checkpoint thresholds during job execution.
 *
 * @typedef {import('./decision-files.mjs').PendingBlocker} PendingBlocker
 * @typedef {import('./decision-files.mjs').Assumption} Assumption
 */

import {
  getUnansweredBlockers,
  readPendingBlockers,
  writePendingBlocker,
  updateBlockerAnswer,
  getPendingAssumptions,
  writeAssumption,
  checkAssumptionThreshold,
  generateBlockerId,
  generateAssumptionId,
} from "./decision-files.mjs";

import { promptBlockerInTerminal, displayBlockerSummary } from "./blocker-prompt.mjs";

// ============================================================================
// Pre-execution blocker check
// ============================================================================

/**
 * Check for unanswered blockers before starting job execution.
 * Returns true if execution can proceed, false if blocked.
 *
 * @param {string} runDir - The run directory
 * @param {Object} [options]
 * @param {Object} [options.ui] - CLI UI instance
 * @param {boolean} [options.interactive] - Whether to prompt interactively
 * @returns {Promise<{ canProceed: boolean, blockers: PendingBlocker[], answered: number }>}
 */
export async function checkBlockersBeforeExecution(runDir, options = {}) {
  const { ui, interactive = true } = options;

  const blockers = await getUnansweredBlockers(runDir);

  if (blockers.length === 0) {
    return { canProceed: true, blockers: [], answered: 0 };
  }

  // Display blocker summary
  displayBlockerSummary(blockers, ui);

  if (!interactive) {
    if (ui?.warn) {
      ui.warn(`${blockers.length} unanswered blocker(s). Use 'ias runner resume' after answering.`);
    } else {
      console.log(`⚠️  ${blockers.length} unanswered blocker(s). Use 'ias runner resume' after answering.`);
    }
    return { canProceed: false, blockers, answered: 0 };
  }

  // Interactive mode: prompt for each blocker
  let answered = 0;
  for (const blocker of blockers) {
    const result = await promptBlockerInTerminal(runDir, blocker, { ui, interactive: true });
    if (result.action === "answered") {
      answered++;
    } else if (result.action === "quit") {
      // User quit - return current state
      const remaining = await getUnansweredBlockers(runDir);
      return { canProceed: remaining.length === 0, blockers: remaining, answered };
    }
  }

  // Re-check after prompting
  const remaining = await getUnansweredBlockers(runDir);
  return { canProceed: remaining.length === 0, blockers: remaining, answered };
}

// ============================================================================
// Mid-execution callbacks
// ============================================================================

/**
 * Callback factory for handling blockers during execution.
 * Returns a function that can be called when a blocker arises.
 *
 * @param {string} runDir
 * @param {Object} [options]
 * @param {Object} [options.ui]
 * @param {boolean} [options.interactive]
 * @returns {(params: Omit<PendingBlocker, 'id' | 'status' | 'createdAt'>) => Promise<{ blockerId: string, action: string, answer?: string }>}
 */
export function createBlockerHandler(runDir, options = {}) {
  const { ui, interactive = true } = options;

  return async (blockerInput) => {
    return promptBlockerInTerminal(runDir, blockerInput, { ui, interactive });
  };
}

/**
 * Callback factory for recording assumptions during execution.
 * Returns a function that can be called when an assumption is made.
 *
 * @param {string} runDir
 * @param {Object} [options]
 * @param {Object} [options.ui]
 * @param {function} [options.onThresholdReached] - Called when assumption count reaches threshold
 * @returns {(params: Omit<Assumption, 'id' | 'status' | 'createdAt'>) => Promise<{ assumptionId: string, thresholdExceeded: boolean }>}
 */
export function createAssumptionHandler(runDir, options = {}) {
  const { ui, onThresholdReached } = options;

  return async (assumptionInput) => {
    const assumptionId = generateAssumptionId();
    /** @type {Assumption} */
    const assumption = {
      ...assumptionInput,
      id: assumptionId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await writeAssumption(runDir, assumption);

    // Check threshold
    const thresholdStatus = await checkAssumptionThreshold(runDir);

    if (thresholdStatus.exceeded) {
      if (ui?.warn) {
        ui.warn(
          `Assumption threshold reached: ${thresholdStatus.count}/${thresholdStatus.threshold} pending assumptions`
        );
      } else {
        console.log(
          `⚠️  Assumption threshold reached: ${thresholdStatus.count}/${thresholdStatus.threshold} pending assumptions`
        );
      }

      if (thresholdStatus.highImpactCount > 0) {
        if (ui?.warn) {
          ui.warn(`${thresholdStatus.highImpactCount} high/critical impact assumption(s) need review before merge`);
        } else {
          console.log(
            `⚠️  ${thresholdStatus.highImpactCount} high/critical impact assumption(s) need review before merge`
          );
        }
      }

      if (onThresholdReached) {
        await onThresholdReached(thresholdStatus);
      }
    }

    return { assumptionId, thresholdExceeded: thresholdStatus.exceeded };
  };
}

// ============================================================================
// Checkpoint validation
// ============================================================================

/**
 * Validate assumptions before PR creation or merge.
 * Returns whether validation passes and details about any blockers.
 *
 * @param {string} runDir
 * @param {Object} [options]
 * @param {boolean} [options.blockOnHighImpact] - Block if high/critical impact assumptions pending
 * @returns {Promise<{ valid: boolean, pending: number, highImpact: number, message: string }>}
 */
export async function validateCheckpointsForMerge(runDir, options = {}) {
  const { blockOnHighImpact = true } = options;

  const pending = await getPendingAssumptions(runDir);
  const highImpact = pending.filter((a) => a.impact === "high" || a.impact === "critical");

  if (blockOnHighImpact && highImpact.length > 0) {
    return {
      valid: false,
      pending: pending.length,
      highImpact: highImpact.length,
      message: `${highImpact.length} high/critical impact assumption(s) require review before merge`,
    };
  }

  if (pending.length > 0) {
    return {
      valid: true, // Can proceed but with warning
      pending: pending.length,
      highImpact: highImpact.length,
      message: `${pending.length} assumption(s) pending review (will be included in PR description)`,
    };
  }

  return {
    valid: true,
    pending: 0,
    highImpact: 0,
    message: "All assumptions reviewed",
  };
}

/**
 * Format assumptions for PR description.
 *
 * @param {string} runDir
 * @returns {Promise<string>}
 */
export async function formatAssumptionsForPr(runDir) {
  const pending = await getPendingAssumptions(runDir);

  if (pending.length === 0) {
    return "";
  }

  const lines = [
    "## Assumptions Made During Implementation",
    "",
    "> The following assumptions were made during agent execution and should be reviewed before merge.",
    "",
  ];

  for (const assumption of pending) {
    const impactBadge = assumption.impact ? `[${assumption.impact.toUpperCase()}]` : "";
    const confidenceBadge = assumption.confidence ? `(${assumption.confidence} confidence)` : "";

    lines.push(`### ${impactBadge} ${assumption.prompt.split("\n")[0]}`);
    if (confidenceBadge) lines.push(`*${confidenceBadge}*`);
    lines.push("");
    lines.push(`**Assumed:** ${assumption.assumedValue}`);
    if (assumption.reasoning) {
      lines.push("");
      lines.push(`**Reasoning:** ${assumption.reasoning}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Exports for runner integration
// ============================================================================

export {
  getUnansweredBlockers,
  readPendingBlockers,
  getPendingAssumptions,
  checkAssumptionThreshold,
};
