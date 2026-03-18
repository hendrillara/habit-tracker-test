/**
 * Three-tier attention model: Local file utilities
 *
 * Manages blockers-pending.md and assumptions.md files in the run directory.
 * These files serve as the local durable store for decisions and assumptions
 * during agent execution.
 *
 * @typedef {'low' | 'medium' | 'high'} Confidence
 * @typedef {'low' | 'medium' | 'high' | 'critical'} Impact
 * @typedef {'easy' | 'moderate' | 'hard' | 'irreversible'} Reversibility
 * @typedef {'blocker' | 'checkpoint' | 'audit'} DecisionTier
 * @typedef {'pending' | 'answered' | 'applied' | 'skipped'} BlockerStatus
 * @typedef {'pending' | 'approved' | 'changed' | 'escalated'} AssumptionStatus
 *
 * @typedef {Object} PendingBlocker
 * @property {string} id
 * @property {string} prompt
 * @property {string[]} [options]
 * @property {Confidence} [confidence]
 * @property {Impact} [impact]
 * @property {Reversibility} [reversibility]
 * @property {string} [kind]
 * @property {string} [whyBlocking]
 * @property {BlockerStatus} status
 * @property {string} [answer]
 * @property {string} [answeredAt]
 * @property {string} createdAt
 *
 * @typedef {Object} Assumption
 * @property {string} id
 * @property {string} prompt
 * @property {string} assumedValue
 * @property {string} [reasoning]
 * @property {Confidence} [confidence]
 * @property {Impact} [impact]
 * @property {Reversibility} [reversibility]
 * @property {string} [kind]
 * @property {AssumptionStatus} status
 * @property {string} [override]
 * @property {string} [overrideReason]
 * @property {string} [reviewedAt]
 * @property {string} createdAt
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// File paths
// ============================================================================

function blockersPath(runDir) {
  return path.join(runDir, "blockers-pending.md");
}

function assumptionsPath(runDir) {
  return path.join(runDir, "assumptions.md");
}

// ============================================================================
// Parsing utilities
// ============================================================================

/**
 * @param {string} content
 * @returns {{ frontmatter: Record<string, string>, body: string }}
 */
function parseMarkdownFrontmatter(content) {
  const lines = content.split("\n");
  /** @type {Record<string, string>} */
  const frontmatter = {};
  let inFrontmatter = false;
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        bodyStartIndex = i + 1;
        break;
      }
    }
    if (inFrontmatter) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();
  return { frontmatter, body };
}

/**
 * @param {string} section
 * @returns {PendingBlocker | null}
 */
function parseBlockerSection(section) {
  const { frontmatter, body } = parseMarkdownFrontmatter(section);

  const id = frontmatter["id"];
  if (!id) return null;

  // Extract prompt from body (first paragraph after ## Prompt or the whole body)
  let prompt = body;
  const promptMatch = body.match(/## Prompt\n\n([\s\S]*?)(?=\n## |$)/);
  if (promptMatch) {
    prompt = promptMatch[1].trim();
  }

  // Extract options if present
  /** @type {string[] | undefined} */
  let options;
  const optionsMatch = body.match(/## Options\n\n([\s\S]*?)(?=\n## |$)/);
  if (optionsMatch) {
    options = optionsMatch[1]
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
  }

  // Extract answer if present
  /** @type {string | undefined} */
  let answer;
  const answerMatch = body.match(/## Answer\n\n([\s\S]*?)(?=\n## |$)/);
  if (answerMatch) {
    answer = answerMatch[1].trim();
  }

  return {
    id,
    prompt,
    options: options && options.length > 0 ? options : undefined,
    confidence: /** @type {Confidence | undefined} */ (frontmatter["confidence"]),
    impact: /** @type {Impact | undefined} */ (frontmatter["impact"]),
    reversibility: /** @type {Reversibility | undefined} */ (frontmatter["reversibility"]),
    kind: frontmatter["kind"],
    whyBlocking: frontmatter["why_blocking"],
    status: /** @type {BlockerStatus} */ (frontmatter["status"]) || "pending",
    answer,
    answeredAt: frontmatter["answered_at"],
    createdAt: frontmatter["created_at"] || new Date().toISOString(),
  };
}

/**
 * @param {string} section
 * @returns {Assumption | null}
 */
function parseAssumptionSection(section) {
  const { frontmatter, body } = parseMarkdownFrontmatter(section);

  const id = frontmatter["id"];
  if (!id) return null;

  // Extract prompt from body
  let prompt = body;
  const promptMatch = body.match(/## Context\n\n([\s\S]*?)(?=\n## |$)/);
  if (promptMatch) {
    prompt = promptMatch[1].trim();
  }

  // Extract assumed value
  let assumedValue = frontmatter["assumed_value"] || "";
  const assumedMatch = body.match(/## Assumed Value\n\n([\s\S]*?)(?=\n## |$)/);
  if (assumedMatch) {
    assumedValue = assumedMatch[1].trim();
  }

  // Extract reasoning
  /** @type {string | undefined} */
  let reasoning;
  const reasoningMatch = body.match(/## Reasoning\n\n([\s\S]*?)(?=\n## |$)/);
  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
  }

  // Extract override if present
  /** @type {string | undefined} */
  let override;
  /** @type {string | undefined} */
  let overrideReason;
  const overrideMatch = body.match(/## Override\n\n([\s\S]*?)(?=\n## |$)/);
  if (overrideMatch) {
    override = overrideMatch[1].trim();
  }
  const overrideReasonMatch = body.match(/## Override Reason\n\n([\s\S]*?)(?=\n## |$)/);
  if (overrideReasonMatch) {
    overrideReason = overrideReasonMatch[1].trim();
  }

  return {
    id,
    prompt,
    assumedValue,
    reasoning,
    confidence: /** @type {Confidence | undefined} */ (frontmatter["confidence"]),
    impact: /** @type {Impact | undefined} */ (frontmatter["impact"]),
    reversibility: /** @type {Reversibility | undefined} */ (frontmatter["reversibility"]),
    kind: frontmatter["kind"],
    status: /** @type {AssumptionStatus} */ (frontmatter["status"]) || "pending",
    override,
    overrideReason,
    reviewedAt: frontmatter["reviewed_at"],
    createdAt: frontmatter["created_at"] || new Date().toISOString(),
  };
}

// ============================================================================
// Serialization utilities
// ============================================================================

/**
 * @param {PendingBlocker} blocker
 * @returns {string}
 */
function serializeBlocker(blocker) {
  const lines = [];
  lines.push("---");
  lines.push(`id: ${blocker.id}`);
  lines.push(`status: ${blocker.status}`);
  if (blocker.confidence) lines.push(`confidence: ${blocker.confidence}`);
  if (blocker.impact) lines.push(`impact: ${blocker.impact}`);
  if (blocker.reversibility) lines.push(`reversibility: ${blocker.reversibility}`);
  if (blocker.kind) lines.push(`kind: ${blocker.kind}`);
  if (blocker.whyBlocking) lines.push(`why_blocking: ${blocker.whyBlocking}`);
  lines.push(`created_at: ${blocker.createdAt}`);
  if (blocker.answeredAt) lines.push(`answered_at: ${blocker.answeredAt}`);
  lines.push("---");
  lines.push("");
  lines.push("## Prompt");
  lines.push("");
  lines.push(blocker.prompt);
  lines.push("");

  if (blocker.options && blocker.options.length > 0) {
    lines.push("## Options");
    lines.push("");
    for (const opt of blocker.options) {
      lines.push(`- ${opt}`);
    }
    lines.push("");
  }

  if (blocker.answer) {
    lines.push("## Answer");
    lines.push("");
    lines.push(blocker.answer);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * @param {Assumption} assumption
 * @returns {string}
 */
function serializeAssumption(assumption) {
  const lines = [];
  lines.push("---");
  lines.push(`id: ${assumption.id}`);
  lines.push(`status: ${assumption.status}`);
  if (assumption.confidence) lines.push(`confidence: ${assumption.confidence}`);
  if (assumption.impact) lines.push(`impact: ${assumption.impact}`);
  if (assumption.reversibility) lines.push(`reversibility: ${assumption.reversibility}`);
  if (assumption.kind) lines.push(`kind: ${assumption.kind}`);
  lines.push(`created_at: ${assumption.createdAt}`);
  if (assumption.reviewedAt) lines.push(`reviewed_at: ${assumption.reviewedAt}`);
  lines.push("---");
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(assumption.prompt);
  lines.push("");
  lines.push("## Assumed Value");
  lines.push("");
  lines.push(assumption.assumedValue);
  lines.push("");

  if (assumption.reasoning) {
    lines.push("## Reasoning");
    lines.push("");
    lines.push(assumption.reasoning);
    lines.push("");
  }

  if (assumption.override) {
    lines.push("## Override");
    lines.push("");
    lines.push(assumption.override);
    lines.push("");
  }

  if (assumption.overrideReason) {
    lines.push("## Override Reason");
    lines.push("");
    lines.push(assumption.overrideReason);
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// File operations - Blockers
// ============================================================================

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} runDir
 * @returns {Promise<PendingBlocker[]>}
 */
export async function readPendingBlockers(runDir) {
  const filePath = blockersPath(runDir);
  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await fs.readFile(filePath, "utf8");
  /** @type {PendingBlocker[]} */
  const blockers = [];

  // Split by blocker separator (# Blocker: <id>)
  const sections = content.split(/(?=# Blocker: )/);
  for (const section of sections) {
    if (!section.trim() || !section.startsWith("# Blocker:")) continue;

    // Remove the header line and parse the rest
    const lines = section.split("\n");
    const headerLine = lines[0];
    const idMatch = headerLine.match(/# Blocker: (.+)/);
    if (!idMatch) continue;

    const restContent = lines.slice(1).join("\n").trim();
    const blocker = parseBlockerSection(restContent);
    if (blocker) {
      blocker.id = idMatch[1].trim();
      blockers.push(blocker);
    }
  }

  return blockers;
}

/**
 * @param {string} runDir
 * @param {PendingBlocker} blocker
 * @returns {Promise<void>}
 */
export async function writePendingBlocker(runDir, blocker) {
  const filePath = blockersPath(runDir);
  const existing = await readPendingBlockers(runDir);

  // Check if blocker with same ID already exists
  const existingIndex = existing.findIndex((b) => b.id === blocker.id);
  if (existingIndex >= 0) {
    existing[existingIndex] = blocker;
  } else {
    existing.push(blocker);
  }

  // Serialize all blockers
  const content = buildBlockersFile(existing);
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * @param {string} runDir
 * @param {string} blockerId
 * @param {string} answer
 * @param {BlockerStatus} [status]
 * @returns {Promise<PendingBlocker | null>}
 */
export async function updateBlockerAnswer(runDir, blockerId, answer, status = "answered") {
  const blockers = await readPendingBlockers(runDir);
  const blocker = blockers.find((b) => b.id === blockerId);
  if (!blocker) return null;

  blocker.answer = answer;
  blocker.status = status;
  blocker.answeredAt = new Date().toISOString();

  await writePendingBlocker(runDir, blocker);
  return blocker;
}

/**
 * @param {string} runDir
 * @returns {Promise<PendingBlocker[]>}
 */
export async function getUnansweredBlockers(runDir) {
  const blockers = await readPendingBlockers(runDir);
  return blockers.filter((b) => b.status === "pending");
}

/**
 * @param {PendingBlocker[]} blockers
 * @returns {string}
 */
function buildBlockersFile(blockers) {
  const lines = [];
  lines.push("# Pending Blockers");
  lines.push("");
  lines.push("> Agent execution is blocked until these questions are answered.");
  lines.push("> Edit this file directly or use `ias runner resume` after answering.");
  lines.push("");

  for (const blocker of blockers) {
    lines.push(`# Blocker: ${blocker.id}`);
    lines.push("");
    lines.push(serializeBlocker(blocker));
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// File operations - Assumptions
// ============================================================================

/**
 * @param {string} runDir
 * @returns {Promise<Assumption[]>}
 */
export async function readAssumptions(runDir) {
  const filePath = assumptionsPath(runDir);
  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await fs.readFile(filePath, "utf8");
  /** @type {Assumption[]} */
  const assumptions = [];

  // Split by assumption separator (# Assumption: <id>)
  const sections = content.split(/(?=# Assumption: )/);
  for (const section of sections) {
    if (!section.trim() || !section.startsWith("# Assumption:")) continue;

    // Remove the header line and parse the rest
    const lines = section.split("\n");
    const headerLine = lines[0];
    const idMatch = headerLine.match(/# Assumption: (.+)/);
    if (!idMatch) continue;

    const restContent = lines.slice(1).join("\n").trim();
    const assumption = parseAssumptionSection(restContent);
    if (assumption) {
      assumption.id = idMatch[1].trim();
      assumptions.push(assumption);
    }
  }

  return assumptions;
}

/**
 * @param {string} runDir
 * @param {Assumption} assumption
 * @returns {Promise<void>}
 */
export async function writeAssumption(runDir, assumption) {
  const filePath = assumptionsPath(runDir);
  const existing = await readAssumptions(runDir);

  // Check if assumption with same ID already exists
  const existingIndex = existing.findIndex((a) => a.id === assumption.id);
  if (existingIndex >= 0) {
    existing[existingIndex] = assumption;
  } else {
    existing.push(assumption);
  }

  // Serialize all assumptions
  const content = buildAssumptionsFile(existing);
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * @param {string} runDir
 * @param {string} assumptionId
 * @param {AssumptionStatus} status
 * @param {string} [override]
 * @param {string} [overrideReason]
 * @returns {Promise<Assumption | null>}
 */
export async function updateAssumptionStatus(runDir, assumptionId, status, override, overrideReason) {
  const assumptions = await readAssumptions(runDir);
  const assumption = assumptions.find((a) => a.id === assumptionId);
  if (!assumption) return null;

  assumption.status = status;
  assumption.reviewedAt = new Date().toISOString();
  if (override !== undefined) assumption.override = override;
  if (overrideReason !== undefined) assumption.overrideReason = overrideReason;

  await writeAssumption(runDir, assumption);
  return assumption;
}

/**
 * @param {string} runDir
 * @returns {Promise<Assumption[]>}
 */
export async function getPendingAssumptions(runDir) {
  const assumptions = await readAssumptions(runDir);
  return assumptions.filter((a) => a.status === "pending");
}

/**
 * @param {string} runDir
 * @returns {Promise<Assumption[]>}
 */
export async function getHighImpactPendingAssumptions(runDir) {
  const pending = await getPendingAssumptions(runDir);
  return pending.filter((a) => a.impact === "high" || a.impact === "critical");
}

/**
 * @param {Assumption[]} assumptions
 * @returns {string}
 */
function buildAssumptionsFile(assumptions) {
  const lines = [];
  lines.push("# Assumptions");
  lines.push("");
  lines.push("> These are assumptions the agent made during execution.");
  lines.push("> Review before merge. Use `ias runner review-assumptions` for interactive review.");
  lines.push("");

  const pending = assumptions.filter((a) => a.status === "pending");
  const reviewed = assumptions.filter((a) => a.status !== "pending");

  if (pending.length > 0) {
    lines.push("## Pending Review");
    lines.push("");
    for (const assumption of pending) {
      lines.push(`# Assumption: ${assumption.id}`);
      lines.push("");
      lines.push(serializeAssumption(assumption));
      lines.push("");
    }
  }

  if (reviewed.length > 0) {
    lines.push("## Reviewed");
    lines.push("");
    for (const assumption of reviewed) {
      lines.push(`# Assumption: ${assumption.id}`);
      lines.push("");
      lines.push(serializeAssumption(assumption));
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ============================================================================
// ID generation
// ============================================================================

/**
 * @returns {string}
 */
export function generateBlockerId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `blk-${timestamp}-${random}`;
}

/**
 * @returns {string}
 */
export function generateAssumptionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `asm-${timestamp}-${random}`;
}

// ============================================================================
// Threshold checking
// ============================================================================

const ASSUMPTION_WARNING_THRESHOLD = 5;

/**
 * @param {string} runDir
 * @returns {Promise<{ count: number, threshold: number, exceeded: boolean, highImpactCount: number }>}
 */
export async function checkAssumptionThreshold(runDir) {
  const pending = await getPendingAssumptions(runDir);
  const highImpact = pending.filter((a) => a.impact === "high" || a.impact === "critical");

  return {
    count: pending.length,
    threshold: ASSUMPTION_WARNING_THRESHOLD,
    exceeded: pending.length >= ASSUMPTION_WARNING_THRESHOLD,
    highImpactCount: highImpact.length,
  };
}
