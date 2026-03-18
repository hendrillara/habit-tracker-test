/**
 * Execution handler factories for work + pr_review jobs.
 *
 * Extracted from run.mjs (LUC-57) so they can be registered in both
 * the runner's cp-run-loop and the worker's control-plane loop.
 *
 * @module execution-handlers
 */
import path from "node:path";
import { JOB_KIND_OPERATION_MAP } from "../../ias-worker/dist/claim-dispatch-loop.mjs";

// Imports from separate runner modules
import { normalizeJobRole } from "./next-jobs.mjs";
import { capChangedPathsForEvidence } from "./evidence.mjs";
import { findPrUrlForHeadBranch } from "./pr-evidence.mjs";
import { buildOutcomeReasonFromOutput, isLikelyFalseReadOnlyBlockForWriteJob, normalizeJobOutputStatus } from "./job-output.mjs";

async function resolveRunnerApi(runnerApi) {
  return runnerApi ?? (await import("../run.mjs"));
}

// ---------------------------------------------------------------------------
// resolveRunDirForControlPlaneJob
// ---------------------------------------------------------------------------

async function resolveRunDirForControlPlaneJob(repoRoot, cpSession, job) {
  const runRefFromJob = job?.runRef ? String(job.runRef) : null;
  if (runRefFromJob) {
    const runDir = path.join(repoRoot, "docs/ias/runs", runRefFromJob);
    return { run: null, runRef: runRefFromJob, runDir };
  }

  const runId = job?.runId ? String(job.runId) : null;
  if (!runId) return { run: null, runRef: null, runDir: null };

  if (!cpSession.cp.getRun) return { run: null, runRef: null, runDir: null };
  const run = await cpSession.cp.getRun({ workspaceId: cpSession.workspaceId, runId });
  const runRef = run?.runRef ? String(run.runRef) : null;
  if (!runRef) return { run: null, runRef: null, runDir: null };

  const runDir = path.join(repoRoot, "docs/ias/runs", runRef);
  return { run, runRef, runDir };
}

export { resolveRunDirForControlPlaneJob };

// ---------------------------------------------------------------------------
// enqueueControlPlaneWorkJob / enqueueControlPlanePrReviewJob
// ---------------------------------------------------------------------------

async function enqueueControlPlaneWorkJob(cpSession, args) {
  const roleInput = String(args.role ?? "").trim();
  const role = normalizeJobRole(roleInput);
  const prompt = String(args.prompt ?? "").trim();
  if (!role) throw new Error(`invalid role for next job: ${roleInput || "missing"}`);
  if (!prompt) throw new Error("missing prompt for next job");

  await cpSession.cp.enqueueJob({
    workspaceId: cpSession.workspaceId,
    repoId: args.repoId,
    runId: args.runId,
    kind: "work",
    role,
    prompt,
    requirements: {
      executionMode: "hybrid",
      modelPolicy: "require_5_2",
      writeRequired: Boolean(args.writeRequired),
      networkRequired: Boolean(args.networkRequired),
    },
    priority: typeof args.priority === "number" && Number.isFinite(args.priority) ? args.priority : 50,
  });
}

async function enqueueControlPlanePrReviewJob(cpSession, args) {
  const roleInput = String(args.role ?? "").trim();
  const role = normalizeJobRole(roleInput);
  const prompt = String(args.prompt ?? "").trim();
  if (!role) throw new Error(`invalid role for next job: ${roleInput || "missing"}`);
  if (!prompt) throw new Error("missing prompt for next job");

  await cpSession.cp.enqueueJob({
    workspaceId: cpSession.workspaceId,
    repoId: args.repoId,
    runId: args.runId,
    kind: "pr_review",
    role,
    prompt,
    requirements: {
      executionMode: "hybrid",
      modelPolicy: "require_5_2",
      writeRequired: false,
      networkRequired: Boolean(args.networkRequired),
    },
    priority: typeof args.priority === "number" && Number.isFinite(args.priority) ? args.priority : 50,
  });
}

async function enqueueControlPlaneScreenshotJob(cpSession, args) {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) throw new Error("missing prompt for screenshot job");
  // Validate that the prompt is a parseable screenshot payload before enqueuing.
  // Import parseScreenshotPrompt inline via dynamic import to avoid circular deps.
  // The actual validation happens at the worker side; here we do a quick sanity check.
  let parsed = null;
  try {
    parsed = JSON.parse(prompt);
  } catch {
    throw new Error("screenshot job prompt must be valid JSON");
  }
  if (!parsed || parsed.type !== "screenshot" || parsed.version !== 1 || !parsed.url) {
    throw new Error("screenshot job prompt must be { type: 'screenshot', version: 1, url: '<url>', ... }");
  }

  await cpSession.cp.enqueueJob({
    workspaceId: cpSession.workspaceId,
    repoId: args.repoId,
    runId: args.runId,
    kind: "screenshot",
    prompt,
    requirements: {
      executionMode: "hybrid",
      modelPolicy: "require_5_2",
      writeRequired: true,   // screenshot writes PNG files to disk
      networkRequired: false, // screenshots target localhost — make configurable if remote URLs needed later
    },
    priority: typeof args.priority === "number" && Number.isFinite(args.priority) ? args.priority : 50,
  });
}

// ---------------------------------------------------------------------------
// executeClaimedControlPlaneWorkJob
// ---------------------------------------------------------------------------

async function executeClaimedControlPlaneWorkJob({ repoRoot, runDir, cpSession, claim, job, leaseMs, configPath, runnerApi }) {
  const {
    cmdRunOnce,
    initRunner,
    loadControlPlaneOps,
    fileExists,
    realpathOrResolved,
    readJson,
    gitRev,
    gitPorcelain,
    gitDiffNames,
    resolveBaseBranchName,
    normalizeClaimGeneration,
    isClaimGenerationMismatch,
    completeClaimedJob,
    startClaimedJobHeartbeatTimer,
    cloneJson,
    truncateForGitSubject,
    outcomeReasonV1,
    extractPrUrlFromText,
    extractGitBaseBranchFromText,
    extractChainChunk,
    workPromptRequestsPrReview,
    execFileCapture,
  } = runnerApi;
  const claimGeneration = normalizeClaimGeneration(claim?.claimGeneration);
  let lostLease = false;
  const complete = async (payload) => {
    try {
      await completeClaimedJob(cpSession, claim, claimGeneration, payload);
      return true;
    } catch (error) {
      if (isClaimGenerationMismatch(error)) {
        lostLease = true;
        return false;
      }
      throw error;
    }
  };

  // When called from the worker's dispatch loop, repoRoot is already validated.
  // Only check repoRootForJob when running in the runner's standalone context
  // (where configPath points to the runner's own config with repo mappings).
  if (configPath) {
    try {
      const { repoRootForJob } = await loadControlPlaneOps();
      const mappedRoot = repoRootForJob(cpSession.cfg, job);
      if (!mappedRoot) {
        await complete({
          outcome: "blocked",
          outcomeReason: outcomeReasonV1({
            category: "blocked",
            code: "missing_repo_mapping",
            retryable: true,
            recommendedDelayMs: 60_000,
            summary: "No local repo mapping found for this repo",
            details: { repoId: String(job?.repoId ?? "") },
          }),
          message: `no repo mapping for repoId=${job.repoId}. Add it to ${configPath}`,
        });
        return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
      }
      const mappedResolved = await realpathOrResolved(mappedRoot);
      const runnerResolved = await realpathOrResolved(repoRoot);
      if (mappedResolved !== runnerResolved) {
        await complete({
          outcome: "blocked",
          outcomeReason: outcomeReasonV1({
            category: "blocked",
            code: "repo_mapping_mismatch",
            retryable: true,
            summary: "Job repo mapping does not match runner working directory",
            details: {
              mappedRoot: String(mappedRoot),
              mappedResolved,
              runnerRoot: String(repoRoot),
              runnerResolved,
            },
          }),
          message: `job repo is mapped to ${mappedRoot} but runner is running in ${repoRoot}`,
        });
        return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
      }
    } catch {
      // loadControlPlaneOps failed — skip mapping check (worker context)
    }
  }

  const p = await initRunner(repoRoot, runDir);
  if (await fileExists(p.stopPath)) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "runner_stop_requested",
        retryable: true,
        summary: "Runner stop requested (STOP file present)",
        details: { stopFile: path.relative(repoRoot, p.stopPath) },
      }),
      message: `runner stop requested (STOP file present): ${path.relative(repoRoot, p.stopPath)}`,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  const cfgFromDisk = await readJson(p.configPath);
  const prCfg = cfgFromDisk?.git?.pr ?? {};
  const reviewCfg = prCfg?.review ?? {};
  const reviewRole = String(reviewCfg?.role ?? "reviewer").trim() || "reviewer";
  const isPrFix = typeof job?.prompt === "string" && job.prompt.includes("IAS_PR_FIX:");
  const requestedPrReview = workPromptRequestsPrReview(job?.prompt);

  const beforeSha = await gitRev(repoRoot, "HEAD");

  // The control-plane encodes execution constraints as `job.requirements.*`.
  // In practice, `modelPolicy=require_5_2` implies a network-backed model call for work jobs,
  // so treat network as required even if the upstream job record didn't set it.
  const effectiveNetworkRequired =
    Boolean(job?.requirements?.networkRequired) ||
    (job?.kind === "work" && job?.requirements?.modelPolicy === "require_5_2");

  const mode = {
    write: Boolean(job?.requirements?.writeRequired),
    networkAccessEnabled: effectiveNetworkRequired,
    webSearchEnabled: false,
  };

  const claimedJob = {
    id: claim.jobId,
    role: String(job?.role ?? ""),
    prompt: String(job?.prompt ?? ""),
    attempt: Number(job?.attempt ?? 0),
    mode,
  };

  const stopHeartbeat = startClaimedJobHeartbeatTimer({
    cpSession,
    claim,
    claimGeneration,
    leaseMs,
    message: "runner: executing job",
    onClaimGenerationMismatch: () => {
      lostLease = true;
    },
  });

  let runRes;
  let repoLockTimedOut = false;
  const repoLockWaitStartedAt = Date.now();
  const maxRepoLockWaitMs = 2 * 60_000;
  try {
    while (true) {
      if (lostLease) return { ok: false, outcome: "lost_lease" };
      runRes = await cmdRunOnce(repoRoot, runDir, {
        job: claimedJob,
        cfgMutator: (cfg) => {
          // Control-plane work jobs must not enqueue local PR review loop jobs; those are separate CP jobs.
          const next = cloneJson(cfg);
          if (next?.retry) next.retry = { ...next.retry, enabled: false };
          // Control-plane jobs should have a longer maxTurnMs than the default runner config (30 minutes),
          // since they often include multi-step execution and we do not retry locally.
          const minTurnMs = 2 * 60 * 60_000;
          const currentMax = Number(next?.maxTurnMs ?? 0);
          if (!Number.isFinite(currentMax) || currentMax < minTurnMs) next.maxTurnMs = minTurnMs;
          if (next?.git?.pr?.review) next.git.pr.review = { ...next.git.pr.review, auto: false, loop: { enabled: false } };
          if (next?.git?.pr?.merge) next.git.pr.merge = { ...next.git.pr.merge, auto: false };
          return next;
        },
        repoLockBehavior: "requeue",
        // nextJob.kind comes from processNextJobs's payload construction (next-jobs.mjs), not directly from the raw entry.
        onNextJob: async (nextJob) => {
          if (nextJob.kind === "screenshot") {
            await enqueueControlPlaneScreenshotJob(cpSession, {
              repoId: job.repoId,
              runId: job.runId,
              prompt: nextJob.prompt,
              priority: 50,
            });
          } else {
            await enqueueControlPlaneWorkJob(cpSession, {
              repoId: job.repoId,
              runId: job.runId,
              role: nextJob.role,
              prompt: nextJob.prompt,
              writeRequired: Boolean(nextJob.write),
              networkRequired: Boolean(nextJob.network),
              priority: 50,
            });
          }
        },
      });

      // If the repo is locked locally (e.g., by the runtime running create_run),
      // wait and retry within the same control-plane lease instead of blocking the job.
      if (runRes?.status === "repo_lock_busy") {
        const waitedMs = Date.now() - repoLockWaitStartedAt;
        if (waitedMs >= maxRepoLockWaitMs) {
          repoLockTimedOut = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }

      break;
    }
  } finally {
    stopHeartbeat();
  }
  if (lostLease) return { ok: false, outcome: "lost_lease", localJobId: runRes?.jobId ?? claimedJob.id };
  if (repoLockTimedOut || runRes?.status === "repo_lock_busy") {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "repo_lock_busy",
        retryable: true,
        recommendedDelayMs: 30_000,
        summary: "Repo is locked",
        details: { repoRoot },
      }),
      message: `repo is locked: ${repoRoot}`,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked", localJobId: runRes?.jobId ?? null };
  }
  const afterSha = await gitRev(repoRoot, "HEAD");
  const dirty = (await gitPorcelain(repoRoot)).trim().length > 0;

  if (!runRes || (runRes.status !== "ok" && runRes.status !== "failed")) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "runner_unexpected_state",
        retryable: true,
        summary: "Runner ended in unexpected state",
        details: { state: truncateForGitSubject(JSON.stringify(runRes ?? null), 220) },
      }),
      message: `runner ended in unexpected state: ${JSON.stringify(runRes)}`,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  if (runRes.status === "failed") {
    const summary = `runner job failed (local jobId=${runRes.jobId ?? "unknown"})`;
    await complete({
      outcome: "failed",
      outcomeReason: outcomeReasonV1({
        category: "failed",
        code: "runner_failed",
        retryable: true,
        summary,
        details: { localJobId: runRes.jobId ?? null },
      }),
      message: summary,
    });
    return { ok: true, outcome: lostLease ? "lost_lease" : "failed", localJobId: runRes.jobId ?? null };
  }

  const outputStatus = normalizeJobOutputStatus(runRes.result);
  if (outputStatus === "needs_human" || outputStatus === "blocked") {
    if (isLikelyFalseReadOnlyBlockForWriteJob(runRes.result, mode)) {
      const reported = truncateForGitSubject(
        String(runRes?.result?.blockedReason ?? runRes?.result?.summary ?? "agent reported read-only constraints"),
        220,
      );
      const summary = "Write-enabled job incorrectly reported read-only without a concrete write failure";
      await complete({
        outcome: "failed",
        outcomeReason: outcomeReasonV1({
          category: "failed",
          code: "write_mode_false_read_only_block",
          retryable: true,
          summary,
          details: {
            ...(runRes?.jobId ? { localJobId: String(runRes.jobId) } : {}),
            reported,
          },
        }),
        message: `${summary}: ${reported}`,
      });
      return { ok: true, outcome: lostLease ? "lost_lease" : "failed", localJobId: runRes.jobId ?? null };
    }

    const outcomeReason = buildOutcomeReasonFromOutput(outputStatus, runRes.result);
    const summaryText = String(outcomeReason.summary ?? "");
    const blockedText = String(runRes?.result?.blockedReason ?? "");
    const playwrightHint = /playwright|screenshot/i.test(summaryText + " " + blockedText)
      ? " (Hint: if this job requires UI screenshots, retry using kind=screenshot in next_jobs instead of running Playwright inside the sandbox)"
      : "";
    await complete({
      outcome: "blocked",
      outcomeReason: playwrightHint
        ? { ...outcomeReason, summary: summaryText + playwrightHint }
        : outcomeReason,
      message: outcomeReason.summary + playwrightHint,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked", localJobId: runRes.jobId ?? null };
  }

  if (outputStatus === "failed") {
    const outcomeReason = buildOutcomeReasonFromOutput(outputStatus, runRes.result);
    await complete({
      outcome: "failed",
      outcomeReason,
      message: outcomeReason.summary,
    });
    return { ok: true, outcome: lostLease ? "lost_lease" : "failed", localJobId: runRes.jobId ?? null };
  }

  if (afterSha === beforeSha) {
    if (dirty) {
      await complete({
        outcome: "blocked",
        outcomeReason: outcomeReasonV1({
          category: "blocked",
          code: "dirty_without_commit",
          retryable: true,
          summary: "Runner finished without creating a commit but left uncommitted changes",
        }),
        message: "runner finished without creating a commit but left uncommitted changes; enable git auto-commit or commit manually",
      });
      return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
    }

    const completed = await complete({
      outcome: "done",
      message: "runner finished (no new commits)",
    });
    if (!completed) return { ok: false, outcome: "lost_lease", localJobId: runRes.jobId ?? null };

    return { ok: true, outcome: "done", commitSha: null, localJobId: runRes.jobId ?? null };
  }

  const changedPaths = await gitDiffNames(repoRoot, beforeSha, afterSha);
  const changedPathsEvidence = capChangedPathsForEvidence(changedPaths);
  const headRes = await execFileCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
  const headBranch = headRes.code === 0 ? (headRes.stdout || "").trim() : "";
  const prUrlFromPrompt = extractPrUrlFromText(job.prompt);
  const prUrl = prUrlFromPrompt ?? (headBranch ? await findPrUrlForHeadBranch(repoRoot, headBranch) : null);
  const completed = await complete({
    outcome: "done",
    ...(changedPathsEvidence.message ? { message: changedPathsEvidence.message } : {}),
    evidence: { commitSha: afterSha, prUrl: prUrl ?? undefined, changedPaths: changedPathsEvidence.changedPaths },
  });
  if (!completed) return { ok: false, outcome: "lost_lease", localJobId: runRes.jobId ?? null };

  if (headBranch && prUrl && (isPrFix || requestedPrReview)) {
    const runName = path.basename(runDir);
    const baseBranchFromPrompt = extractGitBaseBranchFromText(job.prompt);
    const prMode = String(prCfg?.mode ?? "single");
    const prefix = String(cfgFromDisk?.git?.branch?.prefix ?? "ias/");
    const baseConfigured = prCfg?.base ?? cfgFromDisk?.git?.branch?.base;
    let baseBranch = baseBranchFromPrompt ?? (await resolveBaseBranchName(repoRoot, baseConfigured, { preferRemote: true }));
    if (prMode === "chain") {
      const chunk = extractChainChunk(headBranch);
      if (chunk && chunk > 1) baseBranch = `${prefix}${runName}-c${String(chunk - 1).padStart(3, "0")}`;
    }

    const reviewPrompt = [
      `IAS_PR_REVIEW:${headBranch}`,
      "",
      `Review the current PR-shaped diff for run \`${runName}\`.`,
      "",
      `- Head branch: \`${headBranch}\``,
      baseBranch ? `- Base branch: \`${baseBranch}\`` : null,
      `- PR: ${prUrl}`,
      "",
      "Instructions:",
      "- Do not modify code. Be read-only.",
      "- Review via local git diff: `git diff " + (baseBranch || "main") + "...HEAD` and skim affected files.",
      "- Be pragmatic: only block on material issues; do not nitpick.",
      "- Classify issues as P0/P1/P2 (see docs/ias/process/review-protocol.md).",
      "- Output JSON; set `review.decision` to approve|request_changes|comment and fill review.p0/p1/p2/notes.",
    ]
      .filter(Boolean)
      .join("\n");

    await enqueueControlPlanePrReviewJob(cpSession, {
      repoId: job.repoId,
      runId: job.runId,
      role: reviewRole,
      prompt: reviewPrompt,
      networkRequired: false,
      priority: isPrFix ? 45 : 60,
    });
  }

  return { ok: true, outcome: "done", commitSha: afterSha, changedPaths, localJobId: runRes.jobId ?? null };
}

// ---------------------------------------------------------------------------
// executeClaimedControlPlanePrReviewJob
// ---------------------------------------------------------------------------

async function executeClaimedControlPlanePrReviewJob({ repoRoot, runDir, cpSession, claim, job, leaseMs, configPath, runnerApi }) {
  const {
    cmdRunOnce,
    initRunner,
    loadControlPlaneOps,
    fileExists,
    realpathOrResolved,
    readJson,
    gitRev,
    gitPorcelain,
    gitDiffNamesBestEffort,
    normalizeClaimGeneration,
    isClaimGenerationMismatch,
    completeClaimedJob,
    startClaimedJobHeartbeatTimer,
    cloneJson,
    truncateForGitSubject,
    outcomeReasonV1,
    prReviewLoopConfig,
    readRunnerState,
    updateRunnerState,
    extractPrReviewHeadBranch,
    extractPrUrlFromText,
    extractGitBaseBranchFromText,
  } = runnerApi;
  const claimGeneration = normalizeClaimGeneration(claim?.claimGeneration);
  let lostLease = false;
  const complete = async (payload) => {
    try {
      await completeClaimedJob(cpSession, claim, claimGeneration, payload);
      return true;
    } catch (error) {
      if (isClaimGenerationMismatch(error)) {
        lostLease = true;
        return false;
      }
      throw error;
    }
  };

  // When called from the worker's dispatch loop, repoRoot is already validated.
  // Only check repoRootForJob when running in the runner's standalone context.
  if (configPath) {
    try {
      const { repoRootForJob } = await loadControlPlaneOps();
      const mappedRoot = repoRootForJob(cpSession.cfg, job);
      if (!mappedRoot) {
        await complete({
          outcome: "blocked",
          outcomeReason: outcomeReasonV1({
            category: "blocked",
            code: "missing_repo_mapping",
            retryable: true,
            recommendedDelayMs: 60_000,
            summary: "No local repo mapping found for this repo",
            details: { repoId: String(job?.repoId ?? "") },
          }),
          message: `no repo mapping for repoId=${job.repoId}. Add it to ${configPath}`,
        });
        return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
      }
      const mappedResolved = await realpathOrResolved(mappedRoot);
      const runnerResolved = await realpathOrResolved(repoRoot);
      if (mappedResolved !== runnerResolved) {
        await complete({
          outcome: "blocked",
          outcomeReason: outcomeReasonV1({
            category: "blocked",
            code: "repo_mapping_mismatch",
            retryable: true,
            summary: "Job repo mapping does not match runner working directory",
            details: {
              mappedRoot: String(mappedRoot),
              mappedResolved,
              runnerRoot: String(repoRoot),
              runnerResolved,
            },
          }),
          message: `job repo is mapped to ${mappedRoot} but runner is running in ${repoRoot}`,
        });
        return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
      }
    } catch {
      // loadControlPlaneOps failed — skip mapping check (worker context)
    }
  }

  const headBranch = extractPrReviewHeadBranch(job);
  if (!headBranch) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "missing_pr_head_branch",
        retryable: true,
        summary: "pr_review prompt is missing IAS_PR_REVIEW:<headBranch> marker",
      }),
      message: "pr_review jobs must include a `IAS_PR_REVIEW:<headBranch>` marker in the prompt",
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  const p = await initRunner(repoRoot, runDir);
  if (await fileExists(p.stopPath)) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "runner_stop_requested",
        retryable: true,
        summary: "Runner stop requested (STOP file present)",
        details: { stopFile: path.relative(repoRoot, p.stopPath) },
      }),
      message: `runner stop requested (STOP file present): ${path.relative(repoRoot, p.stopPath)}`,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  const beforeSha = await gitRev(repoRoot, "HEAD");

  const mode = {
    write: false,
    networkAccessEnabled: Boolean(job?.requirements?.networkRequired),
    webSearchEnabled: false,
  };

  const claimedJob = {
    id: claim.jobId,
    role: String(job?.role ?? ""),
    prompt: String(job?.prompt ?? ""),
    attempt: Number(job?.attempt ?? 0),
    git: { branch: headBranch },
    mode,
  };

  const cfgFromDisk = await readJson(p.configPath);
  const stopHeartbeat = startClaimedJobHeartbeatTimer({
    cpSession,
    claim,
    claimGeneration,
    leaseMs,
    message: "runner: executing pr_review",
    onClaimGenerationMismatch: () => {
      lostLease = true;
    },
  });

  let runRes;
  let repoLockTimedOut = false;
  const repoLockWaitStartedAt = Date.now();
  const maxRepoLockWaitMs = 2 * 60_000;
  try {
    while (true) {
      if (lostLease) return { ok: false, outcome: "lost_lease" };
      runRes = await cmdRunOnce(repoRoot, runDir, {
        job: claimedJob,
        cfgMutator: (cfg) => {
          // Control-plane review jobs must not enqueue local follow-ups; those are separate CP jobs.
          const next = cloneJson(cfg);
          if (next?.retry) next.retry = { ...next.retry, enabled: false };
          if (next?.git?.pr?.review) next.git.pr.review = { ...next.git.pr.review, auto: false, loop: { enabled: false } };
          if (next?.git?.pr?.merge) next.git.pr.merge = { ...next.git.pr.merge, auto: false };
          return next;
        },
        repoLockBehavior: "requeue",
        // nextJob.kind comes from processNextJobs's payload construction (next-jobs.mjs), not directly from the raw entry.
        onNextJob: async (nextJob) => {
          if (nextJob.kind === "screenshot") {
            await enqueueControlPlaneScreenshotJob(cpSession, {
              repoId: job.repoId,
              runId: job.runId,
              prompt: nextJob.prompt,
              priority: 50,
            });
          } else {
            await enqueueControlPlaneWorkJob(cpSession, {
              repoId: job.repoId,
              runId: job.runId,
              role: nextJob.role,
              prompt: nextJob.prompt,
              writeRequired: Boolean(nextJob.write),
              networkRequired: Boolean(nextJob.network),
              priority: 50,
            });
          }
        },
      });

      if (runRes?.status === "repo_lock_busy") {
        const waitedMs = Date.now() - repoLockWaitStartedAt;
        if (waitedMs >= maxRepoLockWaitMs) {
          repoLockTimedOut = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }

      break;
    }
  } finally {
    stopHeartbeat();
  }
  if (lostLease) return { ok: false, outcome: "lost_lease", localJobId: runRes?.jobId ?? claimedJob.id };
  if (repoLockTimedOut || runRes?.status === "repo_lock_busy") {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "repo_lock_busy",
        retryable: true,
        recommendedDelayMs: 30_000,
        summary: "Repo is locked",
        details: { repoRoot },
      }),
      message: `repo is locked: ${repoRoot}`,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked", localJobId: runRes?.jobId ?? null };
  }

  const afterSha = await gitRev(repoRoot, "HEAD");
  const dirty = (await gitPorcelain(repoRoot)).trim().length > 0;

  if (!runRes || (runRes.status !== "ok" && runRes.status !== "failed")) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "runner_unexpected_state",
        retryable: true,
        summary: "Runner ended in unexpected state",
        details: { state: truncateForGitSubject(JSON.stringify(runRes ?? null), 220) },
      }),
      message: `runner ended in unexpected state: ${JSON.stringify(runRes)}`,
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  if (runRes.status === "failed") {
    const summary = `runner job failed (local jobId=${runRes.jobId ?? "unknown"})`;
    await complete({
      outcome: "failed",
      outcomeReason: outcomeReasonV1({
        category: "failed",
        code: "runner_failed",
        retryable: true,
        summary,
        details: { localJobId: runRes.jobId ?? null },
      }),
      message: summary,
    });
    return { ok: true, outcome: lostLease ? "lost_lease" : "failed", localJobId: runRes.jobId ?? null };
  }

  if (afterSha !== beforeSha) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "pr_review_not_read_only",
        retryable: false,
        summary: "pr_review must be read-only; runner created a commit",
      }),
      message: "pr_review must be read-only; runner created a commit",
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }
  if (dirty) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "pr_review_not_read_only",
        retryable: false,
        summary: "pr_review must be read-only; runner left uncommitted changes",
      }),
      message: "pr_review must be read-only; runner left uncommitted changes",
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  const prUrl =
    extractPrUrlFromText(job.prompt) ?? (mode.networkAccessEnabled ? await findPrUrlForHeadBranch(repoRoot, headBranch) : null);
  if (!prUrl) {
    await complete({
      outcome: "blocked",
      outcomeReason: outcomeReasonV1({
        category: "blocked",
        code: "missing_pr_url",
        retryable: true,
        summary: "pr_review requires a PR URL (in prompt or via network resolution)",
      }),
      message:
        "pr_review requires a PR URL (include it in the prompt, or enable networkRequired so the runner can resolve it via GitHub)",
    });
    return { ok: false, outcome: lostLease ? "lost_lease" : "blocked" };
  }

  const baseBranch = extractGitBaseBranchFromText(job.prompt);
  const changedPaths =
    baseBranch && baseBranch !== headBranch ? await gitDiffNamesBestEffort(repoRoot, baseBranch, "HEAD") : [];

  const completed = await complete({
    outcome: "done",
    evidence: { prUrl, changedPaths },
  });
  if (!completed) return { ok: false, outcome: "lost_lease", localJobId: runRes.jobId ?? null };

  // Best-effort CP follow-up: if the review requested changes, enqueue a bounded fix job.
  const review = runRes?.result?.review;
  const decision = review && typeof review === "object" ? String(review.decision ?? "").trim() : "";
  if (decision === "request_changes") {
    const loop = prReviewLoopConfig(cfgFromDisk);
    if (loop.enabled && loop.maxCycles > 0) {
      const supported = new Set(["orchestrator", "implementer", "reviewer", "researcher", "pm", "ux", "test-runner"]);
      const fixRole = String(loop.fixRole ?? "implementer").trim();
      if (supported.has(fixRole)) {
        const st = await readRunnerState(repoRoot, runDir);
        const prReviews = typeof st.prReviews === "object" && st.prReviews ? st.prReviews : {};
        const prev = typeof prReviews[headBranch] === "object" && prReviews[headBranch] ? prReviews[headBranch] : {};
        const prevCycles = Number(prev?.cycles ?? 0);
        const cycles = Number.isFinite(prevCycles) && prevCycles >= 0 ? Math.floor(prevCycles) + 1 : 1;

        await updateRunnerState(repoRoot, runDir, (s) => {
          const nextPrReviews = typeof s.prReviews === "object" && s.prReviews ? { ...s.prReviews } : {};
          const cur =
            typeof nextPrReviews[headBranch] === "object" && nextPrReviews[headBranch]
              ? { ...nextPrReviews[headBranch] }
              : {};
          nextPrReviews[headBranch] = {
            ...cur,
            cycles,
            lastDecision: decision || null,
            lastReviewJobId: claim.jobId,
            updatedAt: new Date().toISOString(),
          };
          return { ...s, prReviews: nextPrReviews };
        });

        if (cycles <= loop.maxCycles) {
          const p0 = Array.isArray(review.p0) ? review.p0 : [];
          const p1 = Array.isArray(review.p1) ? review.p1 : [];
          const p2 = Array.isArray(review.p2) ? review.p2 : [];
          const notes = String(review.notes ?? "").trim();

          const marker = `IAS_PR_FIX:${headBranch}:${cycles}`;
          const runName = path.basename(runDir);
          const fixLines = [];
          const addList = (title, items) => {
            const list = (items ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
            fixLines.push(`## ${title}`);
            if (list.length === 0) {
              fixLines.push("- (none)");
              return;
            }
            for (const it of list) fixLines.push(`- ${it}`);
          };
          addList("P0 (must fix)", p0);
          addList("P1 (should fix)", p1);
          addList("P2 (can defer)", p2);

          const prompt = [
            marker,
            "",
            `Apply the requested changes from PR review job \`${claim.jobId}\` for run \`${runName}\`.`,
            "",
            `- Branch to fix: \`${headBranch}\``,
            baseBranch ? `- Base branch (for diff context): \`${baseBranch}\`` : null,
            `- PR: ${prUrl}`,
            "",
            "Boundaries:",
            "- Fix ONLY the listed items (P0/P1 first). Do not expand scope.",
            "- Keep diffs small and reviewable.",
            "- Update `docs/ias/runs/.../run-state.md` with what you changed and what remains.",
            "",
            "Requested changes:",
            ...fixLines,
            notes ? "" : null,
            notes ? "Reviewer notes:" : null,
            notes ? notes : null,
          ]
            .filter((x) => x !== null)
            .join("\n");

          await enqueueControlPlaneWorkJob(cpSession, {
            repoId: job.repoId,
            runId: job.runId,
            role: fixRole,
            prompt,
            writeRequired: true,
            networkRequired: false,
            priority: 40,
          });
        }
      }
    }
  }

  return { ok: true, outcome: "done", prUrl, changedPaths, localJobId: runRes.jobId ?? null };
}

// ---------------------------------------------------------------------------
// Factory functions: buildWorkHandler / buildPrReviewHandler
// ---------------------------------------------------------------------------

/**
 * Build a JobHandler for "work" jobs.
 *
 * @param {object} deps
 * @param {object} deps.session - CP session { cp, workspaceId, workerId, cfg }
 * @param {string} deps.configPath - Path to agent config file
 * @param {number} deps.leaseMs - Lease duration in ms
 * @param {number} deps.maxMessageLen - Max message length for CP
 * @param {object} [deps.runnerApi] - Shared runner helper surface injected by run.mjs
 * @returns {{ requiredOperation: string, handle: (ctx) => Promise<void> }}
 */
export function buildWorkHandler(deps) {
  return {
    requiredOperation: JOB_KIND_OPERATION_MAP.work,
    async handle(ctx) {
      const runnerApi = await resolveRunnerApi(deps.runnerApi);
      const { completeClaimedJob, fileExists } = runnerApi;
      const repoRoot = ctx.repoRoot;
      const resolved = await resolveRunDirForControlPlaneJob(repoRoot, deps.session, ctx.job);
      if (!resolved.runDir || !resolved.runRef) {
        await completeClaimedJob(deps.session, ctx.claim, ctx.claimGeneration, {
          outcome: "blocked",
          message: "work jobs must include a valid runId that resolves to a local docs/ias/runs/<runRef> directory",
        });
        return;
      }
      if (!(await fileExists(resolved.runDir))) {
        await completeClaimedJob(deps.session, ctx.claim, ctx.claimGeneration, {
          outcome: "blocked",
          message: `run directory not found locally: ${resolved.runDir}`,
        });
        return;
      }
      await executeClaimedControlPlaneWorkJob({
        repoRoot,
        runDir: resolved.runDir,
        cpSession: deps.session,
        claim: ctx.claim,
        job: ctx.job,
        leaseMs: deps.leaseMs,
        configPath: deps.configPath,
        runnerApi,
      });
    },
  };
}

/**
 * Build a JobHandler for "pr_review" jobs.
 *
 * @param {object} deps - Same shape as buildWorkHandler deps
 * @returns {{ requiredOperation: string, handle: (ctx) => Promise<void> }}
 */
export function buildPrReviewHandler(deps) {
  return {
    requiredOperation: JOB_KIND_OPERATION_MAP.pr_review,
    async handle(ctx) {
      const runnerApi = await resolveRunnerApi(deps.runnerApi);
      const { completeClaimedJob, fileExists } = runnerApi;
      const repoRoot = ctx.repoRoot;
      const resolved = await resolveRunDirForControlPlaneJob(repoRoot, deps.session, ctx.job);
      if (!resolved.runDir || !resolved.runRef) {
        await completeClaimedJob(deps.session, ctx.claim, ctx.claimGeneration, {
          outcome: "blocked",
          message: "pr_review jobs must include a valid runId that resolves to a local docs/ias/runs/<runRef> directory",
        });
        return;
      }
      if (!(await fileExists(resolved.runDir))) {
        await completeClaimedJob(deps.session, ctx.claim, ctx.claimGeneration, {
          outcome: "blocked",
          message: `run directory not found locally: ${resolved.runDir}`,
        });
        return;
      }
      await executeClaimedControlPlanePrReviewJob({
        repoRoot,
        runDir: resolved.runDir,
        cpSession: deps.session,
        claim: ctx.claim,
        job: ctx.job,
        leaseMs: deps.leaseMs,
        configPath: deps.configPath,
        runnerApi,
      });
    },
  };
}
