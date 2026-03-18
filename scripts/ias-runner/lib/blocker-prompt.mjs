/**
 * Three-tier attention model: Terminal prompting for blockers
 *
 * Provides interactive terminal prompts when blockers arise during execution.
 * Always writes to file first for durability, then prompts in terminal if TTY available.
 *
 * @typedef {import('./decision-files.mjs').PendingBlocker} PendingBlocker
 *
 * @typedef {Object} BlockerPromptResult
 * @property {string} blockerId
 * @property {'answered' | 'skipped' | 'quit'} action
 * @property {string} [answer]
 * @property {string} [selectedOption]
 *
 * @typedef {Object} PromptBlockerOptions
 * @property {boolean} [interactive] - If false, skip interactive prompting (for non-TTY environments)
 * @property {Object} [ui] - Custom UI renderer (for integration with CLI UI system)
 * @property {function(string, string=): void} [ui.header]
 * @property {function(string): void} [ui.info]
 * @property {function(string): void} [ui.warn]
 * @property {function(string): void} [ui.error]
 * @property {function(string): void} [ui.success]
 */

import * as readline from "node:readline";
import * as process from "node:process";
import {
  writePendingBlocker,
  updateBlockerAnswer,
  generateBlockerId,
} from "./decision-files.mjs";

// ============================================================================
// Terminal utilities
// ============================================================================

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

// ============================================================================
// Blocker prompting
// ============================================================================

/**
 * Create and persist a new blocker, then optionally prompt for answer in terminal.
 *
 * Flow:
 * 1. Generate blocker ID
 * 2. Write blocker to file (durability first)
 * 3. If TTY available, prompt user for answer
 * 4. If answer provided, update file and return
 * 5. If user quits or non-TTY, return without answer
 *
 * @param {string} runDir
 * @param {Omit<PendingBlocker, 'id' | 'status' | 'createdAt'>} blockerInput
 * @param {PromptBlockerOptions} [options]
 * @returns {Promise<BlockerPromptResult>}
 */
export async function promptBlockerInTerminal(runDir, blockerInput, options = {}) {
  const interactive = options.interactive ?? isTTY();
  const ui = options.ui;

  // Generate ID and create blocker
  const blockerId = generateBlockerId();
  /** @type {PendingBlocker} */
  const blocker = {
    ...blockerInput,
    id: blockerId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  // Write to file first (durability)
  await writePendingBlocker(runDir, blocker);

  // Display blocker info
  console.log("");
  if (ui?.header) {
    ui.header("🛑 BLOCKER", `Decision required (${blockerId})`);
  } else {
    console.log("═".repeat(60));
    console.log("🛑 BLOCKER: Decision required");
    console.log("═".repeat(60));
  }
  console.log("");

  // Show classification info
  /** @type {string[]} */
  const classInfo = [];
  if (blocker.impact) classInfo.push(`impact: ${blocker.impact}`);
  if (blocker.confidence) classInfo.push(`confidence: ${blocker.confidence}`);
  if (blocker.reversibility) classInfo.push(`reversibility: ${blocker.reversibility}`);
  if (blocker.kind) classInfo.push(`kind: ${blocker.kind}`);
  if (classInfo.length > 0) {
    console.log(`[${classInfo.join(" | ")}]`);
    console.log("");
  }

  // Show the question
  console.log("Question:");
  console.log(blocker.prompt);
  console.log("");

  // Show options if available
  if (blocker.options && blocker.options.length > 0) {
    console.log("Options:");
    blocker.options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });
    console.log("");
  }

  // Show why blocking if available
  if (blocker.whyBlocking) {
    console.log(`Why blocking: ${blocker.whyBlocking}`);
    console.log("");
  }

  // If non-interactive, inform user and return
  if (!interactive) {
    const msg = `Blocker saved to: ${runDir}/blockers-pending.md`;
    if (ui?.info) {
      ui.info(msg);
      ui.info("Edit the file or run `ias runner resume` after answering.");
    } else {
      console.log(msg);
      console.log("Edit the file or run `ias runner resume` after answering.");
    }
    console.log("");
    return { blockerId, action: "quit" };
  }

  // Interactive prompting
  console.log("Actions:");
  console.log("  - Type your answer and press Enter");
  if (blocker.options && blocker.options.length > 0) {
    console.log("  - Or type a number (1-" + blocker.options.length + ") to select an option");
  }
  console.log("  - Type 'skip' to skip this blocker (not recommended)");
  console.log("  - Type 'quit' or press Ctrl+C to save and exit");
  console.log("");

  try {
    const answer = await prompt("Your answer: ");
    const trimmedAnswer = answer.trim();

    if (!trimmedAnswer || trimmedAnswer.toLowerCase() === "quit") {
      if (ui?.info) {
        ui.info("Blocker saved. Resume later with `ias runner resume`.");
      } else {
        console.log("Blocker saved. Resume later with `ias runner resume`.");
      }
      return { blockerId, action: "quit" };
    }

    if (trimmedAnswer.toLowerCase() === "skip") {
      await updateBlockerAnswer(runDir, blockerId, "(skipped by user)", "skipped");
      if (ui?.warn) {
        ui.warn("Blocker skipped. Proceeding without answer.");
      } else {
        console.log("⚠️  Blocker skipped. Proceeding without answer.");
      }
      return { blockerId, action: "skipped" };
    }

    // Check if user selected an option by number
    let finalAnswer = trimmedAnswer;
    /** @type {string | undefined} */
    let selectedOption;
    if (blocker.options && blocker.options.length > 0) {
      const num = parseInt(trimmedAnswer, 10);
      if (!isNaN(num) && num >= 1 && num <= blocker.options.length) {
        selectedOption = blocker.options[num - 1];
        finalAnswer = selectedOption;
      }
    }

    // Update blocker with answer
    await updateBlockerAnswer(runDir, blockerId, finalAnswer, "answered");

    if (ui?.success) {
      ui.success("Answer recorded. Continuing execution.");
    } else {
      console.log("✅ Answer recorded. Continuing execution.");
    }
    console.log("");

    return { blockerId, action: "answered", answer: finalAnswer, selectedOption };
  } catch (error) {
    // Handle Ctrl+C or other interrupts
    if (ui?.info) {
      ui.info("Interrupted. Blocker saved for later.");
    } else {
      console.log("\nInterrupted. Blocker saved for later.");
    }
    return { blockerId, action: "quit" };
  }
}

/**
 * Display a summary of pending blockers without prompting.
 * @param {PendingBlocker[]} blockers
 * @param {PromptBlockerOptions['ui']} [ui]
 */
export function displayBlockerSummary(blockers, ui) {
  if (blockers.length === 0) {
    if (ui?.info) {
      ui.info("No pending blockers.");
    } else {
      console.log("No pending blockers.");
    }
    return;
  }

  if (ui?.header) {
    ui.header("Pending Blockers", `${blockers.length} awaiting response`);
  } else {
    console.log("");
    console.log(`🛑 ${blockers.length} PENDING BLOCKER${blockers.length > 1 ? "S" : ""}`);
    console.log("─".repeat(40));
  }

  for (const blocker of blockers) {
    console.log(`  • [${blocker.id}] ${truncate(blocker.prompt, 60)}`);
    /** @type {string[]} */
    const meta = [];
    if (blocker.impact) meta.push(`impact: ${blocker.impact}`);
    if (blocker.confidence) meta.push(`confidence: ${blocker.confidence}`);
    if (meta.length > 0) {
      console.log(`    ${meta.join(" | ")}`);
    }
  }
  console.log("");
}

/**
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(text, maxLength) {
  const oneLine = text.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return oneLine.slice(0, maxLength - 3) + "...";
}
