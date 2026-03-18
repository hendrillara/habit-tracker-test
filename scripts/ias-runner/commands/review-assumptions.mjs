/**
 * ias runner review-assumptions
 *
 * Interactive review of assumptions made during execution.
 * Allows approving, changing, or escalating each assumption.
 *
 * Usage:
 *   ias runner review-assumptions --latest|--run <YYYYMMDD-slug>
 */

import * as readline from "node:readline";
import * as process from "node:process";

import {
  getPendingAssumptions,
  updateAssumptionStatus,
  checkAssumptionThreshold,
} from "../lib/decision-files.mjs";

/**
 * @returns {boolean}
 */
function isTTY() {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Display a single assumption for review.
 * @param {import('../lib/decision-files.mjs').Assumption} assumption
 * @param {number} index
 * @param {number} total
 */
function displayAssumption(assumption, index, total) {
  console.log("");
  console.log("═".repeat(60));
  console.log(`📋 ASSUMPTION ${index + 1}/${total}`);
  console.log("═".repeat(60));
  console.log("");

  // Classification badges
  const badges = [];
  if (assumption.impact) badges.push(`impact: ${assumption.impact}`);
  if (assumption.confidence) badges.push(`confidence: ${assumption.confidence}`);
  if (assumption.reversibility) badges.push(`reversibility: ${assumption.reversibility}`);
  if (assumption.kind) badges.push(`kind: ${assumption.kind}`);
  if (badges.length > 0) {
    console.log(`[${badges.join(" | ")}]`);
    console.log("");
  }

  console.log("Context:");
  console.log(assumption.prompt);
  console.log("");
  console.log("Assumed Value:");
  console.log(`  → ${assumption.assumedValue}`);
  console.log("");

  if (assumption.reasoning) {
    console.log("Reasoning:");
    console.log(`  ${assumption.reasoning}`);
    console.log("");
  }
}

/**
 * @param {string} runDir - The run directory
 * @param {Object} flags - Command flags
 * @param {Object} options
 * @param {Object} options.ui - CLI UI instance
 * @returns {Promise<{ reviewed: number, approved: number, changed: number, escalated: number, skipped: number }>}
 */
export async function cmdReviewAssumptions(runDir, flags, options) {
  const { ui } = options;

  ui?.header?.("Review Assumptions", "Interactive assumption review");

  const pending = await getPendingAssumptions(runDir);

  if (pending.length === 0) {
    ui?.success?.("No pending assumptions to review.");
    return { reviewed: 0, approved: 0, changed: 0, escalated: 0, skipped: 0 };
  }

  const thresholdStatus = await checkAssumptionThreshold(runDir);
  ui?.info?.(`${pending.length} assumption(s) pending review`);

  if (thresholdStatus.highImpactCount > 0) {
    ui?.warn?.(`${thresholdStatus.highImpactCount} high/critical impact assumption(s) need attention`);
  }

  if (!isTTY()) {
    ui?.info?.("Non-interactive mode: listing assumptions");
    console.log("");
    for (const assumption of pending) {
      displayAssumption(assumption, pending.indexOf(assumption), pending.length);
    }
    ui?.info?.("Edit assumptions.md directly to review, or use an interactive terminal.");
    return { reviewed: 0, approved: 0, changed: 0, escalated: 0, skipped: pending.length };
  }

  console.log("");
  console.log("Actions:");
  console.log("  [a] Approve - assumption is correct");
  console.log("  [c] Change - provide corrected value");
  console.log("  [e] Escalate - create decision request for human review");
  console.log("  [s] Skip - leave for later");
  console.log("  [q] Quit - stop reviewing");
  console.log("  [A] Approve All - approve all remaining");
  console.log("");

  const stats = { reviewed: 0, approved: 0, changed: 0, escalated: 0, skipped: 0 };

  for (let i = 0; i < pending.length; i++) {
    const assumption = pending[i];
    displayAssumption(assumption, i, pending.length);

    try {
      const answer = await prompt("Action [a/c/e/s/q/A]: ");
      const action = answer.trim().toLowerCase();

      if (action === "q" || action === "quit") {
        ui?.info?.("Review paused. Run again to continue.");
        stats.skipped += pending.length - i;
        break;
      }

      if (action === "a" || action === "approve") {
        await updateAssumptionStatus(runDir, assumption.id, "approved");
        ui?.success?.("✓ Approved");
        stats.approved++;
        stats.reviewed++;
        continue;
      }

      if (action === "A" || action.startsWith("approve all")) {
        // Approve all remaining
        for (let j = i; j < pending.length; j++) {
          await updateAssumptionStatus(runDir, pending[j].id, "approved");
        }
        ui?.success?.(`✓ Approved ${pending.length - i} assumption(s)`);
        stats.approved += pending.length - i;
        stats.reviewed += pending.length - i;
        break;
      }

      if (action === "c" || action === "change") {
        const newValue = await prompt("Enter corrected value: ");
        const reason = await prompt("Reason for change (optional): ");
        await updateAssumptionStatus(
          runDir,
          assumption.id,
          "changed",
          newValue.trim(),
          reason.trim() || undefined
        );
        ui?.success?.("✓ Changed");
        stats.changed++;
        stats.reviewed++;
        continue;
      }

      if (action === "e" || action === "escalate") {
        const reason = await prompt("Reason for escalation: ");
        await updateAssumptionStatus(
          runDir,
          assumption.id,
          "escalated",
          undefined,
          reason.trim() || "Escalated during review"
        );
        ui?.warn?.("⚡ Escalated - will create decision request");
        stats.escalated++;
        stats.reviewed++;
        continue;
      }

      if (action === "s" || action === "skip" || action === "") {
        ui?.info?.("↷ Skipped");
        stats.skipped++;
        continue;
      }

      ui?.warn?.(`Unknown action: ${action}. Skipping.`);
      stats.skipped++;
    } catch (error) {
      // Handle Ctrl+C
      ui?.info?.("\nReview interrupted.");
      stats.skipped += pending.length - i;
      break;
    }
  }

  console.log("");
  ui?.header?.("Review Summary");
  console.log(`  Approved:  ${stats.approved}`);
  console.log(`  Changed:   ${stats.changed}`);
  console.log(`  Escalated: ${stats.escalated}`);
  console.log(`  Skipped:   ${stats.skipped}`);
  console.log("");

  // Check if any high-impact still pending
  const remaining = await getPendingAssumptions(runDir);
  const highImpactRemaining = remaining.filter(
    (a) => a.impact === "high" || a.impact === "critical"
  );

  if (highImpactRemaining.length > 0) {
    ui?.warn?.(
      `${highImpactRemaining.length} high/critical impact assumption(s) still pending - review before merge`
    );
  } else if (remaining.length > 0) {
    ui?.info?.(`${remaining.length} assumption(s) still pending`);
  } else {
    ui?.success?.("All assumptions reviewed!");
  }

  return stats;
}

export default cmdReviewAssumptions;
