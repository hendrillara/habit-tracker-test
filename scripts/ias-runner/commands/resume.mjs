/**
 * ias runner resume
 *
 * Resumes execution after blockers have been answered.
 * Checks for pending blockers, optionally prompts for answers,
 * then continues with run-once if all blockers are resolved.
 *
 * Usage:
 *   ias runner resume --latest|--run <YYYYMMDD-slug> [--no-prompt]
 */

import { checkBlockersBeforeExecution, getUnansweredBlockers } from "../lib/decision-loop.mjs";

/**
 * @param {string} runDir - The run directory
 * @param {Object} flags - Command flags
 * @param {boolean} [flags.no_prompt] - Skip interactive prompting
 * @param {Object} options
 * @param {Object} options.ui - CLI UI instance
 * @param {function} options.runOnce - Function to execute run-once
 * @returns {Promise<{ status: string, blockersRemaining: number }>}
 */
export async function cmdResume(runDir, flags, options) {
  const { ui, runOnce } = options;
  const interactive = !flags.no_prompt;

  ui?.header?.("Resume", "Checking for blockers...");

  // Check for pending blockers
  const blockers = await getUnansweredBlockers(runDir);

  if (blockers.length === 0) {
    ui?.success?.("No pending blockers. Ready to continue.");

    if (runOnce) {
      ui?.info?.("Starting execution...");
      return await runOnce();
    }

    return { status: "ready", blockersRemaining: 0 };
  }

  ui?.info?.(`Found ${blockers.length} pending blocker(s)`);

  // Try to resolve blockers
  const result = await checkBlockersBeforeExecution(runDir, { ui, interactive });

  if (result.canProceed) {
    ui?.success?.(`All blockers resolved (${result.answered} answered)`);

    if (runOnce) {
      ui?.info?.("Starting execution...");
      return await runOnce();
    }

    return { status: "ready", blockersRemaining: 0 };
  }

  // Still have blockers
  ui?.warn?.(
    `${result.blockers.length} blocker(s) still pending. Answer them in blockers-pending.md and run 'ias runner resume' again.`
  );

  return {
    status: "blocked",
    blockersRemaining: result.blockers.length,
  };
}

export default cmdResume;
