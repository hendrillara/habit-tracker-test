#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { findPrUrlForHeadBranch } from "./src/pr-evidence.mjs";
import { buildOutcomeReasonFromOutput, isLikelyFalseReadOnlyBlockForWriteJob, normalizeJobOutputStatus } from "./src/job-output.mjs";
import { formatRecoverySummary, hasRecoveryActions, recoverRunnerArtifacts } from "./src/crash-recovery.mjs";
import { normalizeJobRole, processNextJobs } from "./src/next-jobs.mjs";
import { buildJobPrompt } from "./src/job-prompt.mjs";
import { acquireRepoLock, releaseRepoLock, resolveGitDir } from "../ias-shared/dist/locks.mjs";
import { capChangedPathsForEvidence } from "./src/evidence.mjs";
import { gitAddArgsForAutoCommit, gitLogArgsForJobCommit, withJobCommitTrailer } from "./src/git-autocommit.mjs";
import { createUi, parseCommonCliOptions } from "../ias-shared/dist/cli-ui.mjs";
import { runClaimDispatchLoop, JOB_KIND_OPERATION_MAP } from "../ias-worker/dist/claim-dispatch-loop.mjs";
import { cmdResume } from "./commands/resume.mjs";
import { cmdReviewAssumptions } from "./commands/review-assumptions.mjs";
import { validateCheckpointsForMerge, formatAssumptionsForPr } from "./lib/decision-loop.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// IAS repo root (deployable layout): <root>/scripts/ias-runner/run.mjs
// Workspace layout (this repo): apps/ias-agent-framework/scripts/ias-runner/run.mjs
const DEFAULT_IAS_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

let UI = null;

const cachedGitDirByRepo = new Map();
async function resolveGitDirCached(repoRoot) {
  if (!cachedGitDirByRepo.has(repoRoot)) {
    cachedGitDirByRepo.set(repoRoot, await resolveGitDir(repoRoot));
  }
  return cachedGitDirByRepo.get(repoRoot);
}

let activeRepoLockCleanup = null;
async function releaseActiveRepoLock() {
  const fn = activeRepoLockCleanup;
  activeRepoLockCleanup = null;
  if (!fn) return;
  await fn();
}

let codexSdk = null;
async function loadCodexSdk() {
  if (codexSdk) return codexSdk;
  try {
    codexSdk = await import("@openai/codex-sdk");
    return codexSdk;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Throw instead of die() so the error can bubble up to control plane reporting.
    // Using die() would exit the process immediately, leaving claimed jobs stuck in "running".
    throw new Error(
      `failed to load @openai/codex-sdk (${message}). Install it from the IAS repo root with: (cd scripts/ias-runner && npm install)`,
    );
  }
}

let controlPlaneOps = null;
async function loadControlPlaneOps() {
  if (controlPlaneOps) return controlPlaneOps;
  try {
    controlPlaneOps = await import("./src/control-plane-ops.mjs");
    return controlPlaneOps;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to load control-plane ops (${message})`);
  }
}

const RUN_DIR_RE = /^20\d{6}-[a-z0-9]+(-[a-z0-9]+)*$/;

function usage() {
  console.log(`Usage:
  node scripts/ias-runner/run.mjs init --latest|--run <YYYYMMDD-slug>
  node scripts/ias-runner/run.mjs check --latest|--run <YYYYMMDD-slug>
  node scripts/ias-runner/run.mjs status --latest|--run <YYYYMMDD-slug> [--watch]
  node scripts/ias-runner/run.mjs stop --latest|--run <YYYYMMDD-slug>
  node scripts/ias-runner/run.mjs print-prompt --latest|--run <YYYYMMDD-slug> --job <job-id>
  node scripts/ias-runner/run.mjs resume --latest|--run <YYYYMMDD-slug> [--no-prompt]
  node scripts/ias-runner/run.mjs review-assumptions --latest|--run <YYYYMMDD-slug>

Output options:
  --json                       ANSI-free, machine-readable output where supported (also disables prompts)
  --color <auto|always|never>  Colorize output (default: auto; NO_COLOR disables)
  --quiet                      Reduce non-essential output
  --verbose                    More detail for troubleshooting

  # Control plane (HTTP/OpenAPI) integration
  node scripts/ias-runner/run.mjs cp-worker-heartbeat [--cp-config <file>] [--status online|offline|draining]
  node scripts/ias-runner/run.mjs cp-list-jobs [--cp-config <file>] [--status pending|running|done|failed|blocked|canceled]
  node scripts/ias-runner/run.mjs cp-openapi-url [--cp-config <file>]
  node scripts/ias-runner/run.mjs cp-run-once --latest|--run <YYYYMMDD-slug> [--cp-config <file>] [--lease-ms <ms>]
  node scripts/ias-runner/run.mjs cp-run-loop [--cp-config <file>] [--idle-ms 2000] [--lease-ms <ms>] [--stop-when-idle]

Roles:
  orchestrator | implementer | reviewer | researcher | pm | ux | test-runner

Notes:
  - Runner transient state is stored under: .git/ias/runs/<run>/runner/
  - SDK backend uses the local Codex CLI auth state (SSO) by default.
`);
}

function die(message, exitCode = 1) {
  if (UI?.format === "json") {
    UI.jsonError(String(message ?? "error"), { exitCode });
  } else if (UI) {
    UI.error(String(message ?? "error"));
  } else {
    console.error(`error: ${message}`);
  }
  process.exit(exitCode);
}

function requireKebab(value) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
    die(`expected kebab-case value, got: ${value}`);
  }
}

function todayIso() {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn(`[runner] fileExists check failed (${filePath}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return false;
  }
}

async function realpathOrResolved(rawPath) {
  const resolved = path.resolve(String(rawPath ?? ""));
  try {
    return await fs.realpath(resolved);
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn(`[runner] realpath failed (${resolved}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return resolved;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readUtf8IfExists(filePath) {
  if (!(await fileExists(filePath))) return null;
  return await fs.readFile(filePath, "utf8");
}

async function listDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e) {
    if (e?.code === "ENOENT") return [];
    console.warn(`[runner] failed to list directories (${dirPath}): ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function findLatestRunDir(repoRoot) {
  const runsRoot = path.join(repoRoot, "docs/ias/runs");
  const names = (await listDirs(runsRoot)).filter((d) => RUN_DIR_RE.test(d)).sort();
  if (names.length === 0) return null;

  const gitDir = await resolveGitDirCached(repoRoot);

  let bestName = null;
  let bestMtimeMs = -Infinity;

  for (const name of names) {
    const runDir = path.join(runsRoot, name);
    const candidates = [
      path.join(gitDir, "ias", "runs", name, "runner", "state.json"),
      path.join(runDir, "run-state.md"),
      runDir,
    ];

    let mtimeMs = NaN;
    for (const candidate of candidates) {
      try {
        const st = await fs.stat(candidate);
        mtimeMs = st.mtimeMs;
        break;
      } catch (e) {
        if (e?.code !== "ENOENT") {
          console.warn(`[runner] stat failed for run dir candidate (${candidate}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (!Number.isFinite(mtimeMs)) continue;
    if (mtimeMs > bestMtimeMs) {
      bestMtimeMs = mtimeMs;
      bestName = name;
    }
  }

  if (!bestName) return null;
  return path.join(runsRoot, bestName);
}

async function resolveRunDir(repoRoot, flags) {
  if (flags.run) {
    const runDir = path.join(repoRoot, "docs/ias/runs", flags.run);
    if (!(await fileExists(runDir))) die(`run not found: ${runDir}`);
    return runDir;
  }
  if (flags.latest) {
    const latest = await findLatestRunDir(repoRoot);
    if (!latest) die("no runs found under docs/ias/runs (run: ./scripts/ias new-run <slug>)");
    return latest;
  }
  die("missing run selector: --latest or --run <YYYYMMDD-slug>");
}

function parseArgs(args) {
  const rest = args.slice();
  const cmd = rest.shift() || "";
  const flags = {};
  const positionals = [];

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) {
      positionals.push(a);
      continue;
    }
    const key = a.slice(2);
    if (
      key === "latest" ||
      key === "network" ||
      key === "web-search" ||
      key === "write" ||
      key === "stop-when-idle" ||
      key === "reset-attempts" ||
      key === "watch"
    ) {
      flags[key.replaceAll("-", "_")] = true;
      continue;
    }
    const v = rest[i + 1];
    if (!v || v.startsWith("--")) die(`missing value for --${key}`);
    flags[key.replaceAll("-", "_")] = v;
    i++;
  }

  return { cmd, flags, positionals };
}

async function isGitRepo(repoRoot) {
  return await fileExists(path.join(repoRoot, ".git"));
}

function defaultWorkerConfigPath() {
  return path.join(os.homedir(), ".ias", "worker.json");
}

function normalizeClaimGeneration(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function isClaimGenerationMismatch(error) {
  const code = String(error?.code ?? "").trim();
  return code === "CLAIM_GENERATION_MISMATCH" || code === "LEASE_MISMATCH";
}

function claimedCompletionBase(cpSession, claim, claimGeneration) {
  return {
    workspaceId: cpSession.workspaceId,
    jobId: claim.jobId,
    workerId: cpSession.workerId,
    claimGeneration: normalizeClaimGeneration(claimGeneration),
  };
}

async function completeClaimedJob(cpSession, claim, claimGeneration, payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  await cpSession.cp.completeJob({
    ...body,
    ...claimedCompletionBase(cpSession, claim, claimGeneration),
  });
}

function repoLockOwnerForProcess() {
  const user = process.env.USER || process.env.LOGNAME || "unknown";
  return `${user}@${os.hostname()}:ias-runner:${process.pid}`;
}

function convexSiteBaseUrlFromDeploymentUrl(convexDeploymentUrl) {
  const raw = String(convexDeploymentUrl ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\b/i.test(raw)) return raw;
  if (raw.includes(".convex.site")) return raw;
  if (raw.includes(".convex.cloud")) return raw.replace(/\.convex\.cloud\b/, ".convex.site");
  return null;
}

async function gitRev(repoRoot, rev) {
  const res = await execFileCapture("git", ["rev-parse", rev], { cwd: repoRoot });
  if (res.code !== 0) die(`git rev-parse failed: ${(res.stderr || res.stdout || "").trim()}`);
  return res.stdout.trim();
}

async function gitPorcelain(repoRoot) {
  const res = await execFileCapture("git", ["status", "--porcelain"], { cwd: repoRoot });
  if (res.code !== 0) die(`git status failed: ${(res.stderr || res.stdout || "").trim()}`);
  return res.stdout;
}

async function gitDiffNames(repoRoot, a, b) {
  const res = await execFileCapture("git", ["diff", "--name-only", `${a}..${b}`], { cwd: repoRoot });
  if (res.code !== 0) die(`git diff failed: ${(res.stderr || res.stdout || "").trim()}`);
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function gitDiffNamesBestEffort(repoRoot, a, b) {
  const res = await execFileCapture("git", ["diff", "--name-only", `${a}..${b}`], { cwd: repoRoot });
  if (res.code !== 0) return [];
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readRunStateText(repoRoot, runDir) {
  const runName = path.basename(runDir);
  const p = path.join(repoRoot, "docs/ias/runs", runName, "run-state.md");
  try {
    return await fs.readFile(p, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn(`[runner] failed to read run state (${p}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  }
}

function parseCurrentMilestoneId(runStateText) {
  const text = String(runStateText ?? "");
  const m = text.match(/^\s*-\s*current_milestone:\s*([^\n]+)\s*$/m) ?? text.match(/^\s*current_milestone:\s*([^\n]+)\s*$/m);
  if (!m) return null;
  const raw = String(m[1] ?? "").trim();
  const mm = raw.match(/\bM(\d+)\b/i);
  if (!mm) return null;
  return `m${mm[1]}`;
}

async function computeDesiredBranchName(repoRoot, runDir, cfg) {
  const gitCfg = cfg?.git ?? {};
  const branchCfg = gitCfg?.branch ?? {};
  const runName = path.basename(runDir);
  const prefix = String(branchCfg?.prefix ?? "ias/");

  // Manual override wins.
  if (branchCfg?.name) return String(branchCfg.name);

  const prCfg = gitCfg?.pr ?? {};
  const mode = String(prCfg?.mode ?? "single"); // single | milestone | chain
  if (mode === "chain") {
    const chunk = await readPrChainChunk(repoRoot, runDir);
    const suffix = `c${String(chunk).padStart(3, "0")}`;
    return `${prefix}${runName}-${suffix}`;
  }
  if (mode !== "milestone") return `${prefix}${runName}`;

  const runState = await readRunStateText(repoRoot, runDir);
  const milestone = parseCurrentMilestoneId(runState);
  if (!milestone) return `${prefix}${runName}`;
  return `${prefix}${runName}-${milestone}`;
}

async function readPrChainChunk(repoRoot, runDir) {
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  try {
    const st = await readJson(p.statePath);
    const raw = Number(st?.prChain?.chunk ?? st?.git?.prChain?.chunk ?? 1);
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  } catch (e) {
    throw new Error(`[runner] corrupt or unreadable PR chain state (${p.statePath}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function bumpPrChainCounter(repoRoot, runDir, rotateAfterWriteJobs) {
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  const st = await readJson(p.statePath);
  const prChain = typeof st.prChain === "object" && st.prChain ? { ...st.prChain } : {};
  const chunk = Number.isFinite(Number(prChain.chunk)) && Number(prChain.chunk) >= 1 ? Math.floor(Number(prChain.chunk)) : 1;
  const count = Number.isFinite(Number(prChain.writeJobs)) && Number(prChain.writeJobs) >= 0 ? Math.floor(Number(prChain.writeJobs)) : 0;
  const nextCount = count + 1;
  let nextChunk = chunk;
  let rotated = false;
  if (Number.isFinite(rotateAfterWriteJobs) && rotateAfterWriteJobs >= 1 && nextCount >= rotateAfterWriteJobs) {
    nextChunk = chunk + 1;
    rotated = true;
  }
  prChain.chunk = nextChunk;
  prChain.writeJobs = rotated ? 0 : nextCount;
  prChain.updatedAt = new Date().toISOString();
  await writeJson(p.statePath, { ...st, prChain });
  return { chunk, nextChunk, rotated };
}

async function ensureMinimalIas(repoRoot) {
  const required = [
    "docs/ias/project-context.md",
    "docs/ias/gaps.md",
    "docs/ias/context/base-goal.md",
    "scripts/ias",
  ].map((p) => path.join(repoRoot, p));
  for (const p of required) {
    if (!(await fileExists(p))) die(`missing required IAS file: ${p}`);
  }
}

async function runnerPaths(repoRoot, runRef) {
  const gitDir = await resolveGitDirCached(repoRoot);
  const base = path.join(gitDir, "ias", "runs", runRef, "runner");
  return {
    base,
    configPath: path.join(base, "config.json"),
    statePath: path.join(base, "state.json"),
    stopPath: path.join(base, "STOP"),
    lockPath: path.join(base, "lock.json"),
    jobs: path.join(base, "jobs"),
  };
}

function truncateText(text, maxBytes) {
  if (maxBytes <= 0) return { text: "", truncated: false, byteLength: 0 };
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= maxBytes) return { text, truncated: false, byteLength: buf.byteLength };
  const slice = buf.subarray(0, maxBytes);
  return {
    text: slice.toString("utf8"),
    truncated: true,
    byteLength: buf.byteLength,
  };
}

function truncateForGitSubject(text, maxLen = 72) {
  const raw = String(text ?? "").replaceAll(/\s+/g, " ").trim();
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

async function runStartupRecovery(repoRoot, contextLabel) {
  const report = await recoverRunnerArtifacts(repoRoot);
  if (!hasRecoveryActions(report)) return;
  for (const line of formatRecoverySummary(report, contextLabel)) {
    console.warn(line);
  }
}

function outcomeReasonV1(payload = {}) {
  const p = payload && typeof payload === "object" ? /** @type {any} */ (payload) : {};
  const codeStr = String(p.code ?? "").trim();
  if (!codeStr) return null;
  const cat = String(p.category ?? "").trim();
  if (!["done", "failed", "blocked", "canceled"].includes(cat)) return null;

  const out = { version: 1, category: cat, code: codeStr, retryable: Boolean(p.retryable) };
  const delay = p.recommendedDelayMs === undefined ? undefined : Number(p.recommendedDelayMs);
  if (delay !== undefined && Number.isFinite(delay) && delay >= 0) out.recommendedDelayMs = Math.floor(delay);
  if (p.summary !== undefined) out.summary = p.summary === null ? null : String(p.summary);
  if (p.details && typeof p.details === "object" && !Array.isArray(p.details)) out.details = p.details;
  return out;
}

function parseCsvEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqueOrdered(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function cloneJson(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function expandModelAliases(model) {
  const s = String(model ?? "").trim();
  if (!s) return [];
  const out = [s];
  // Some environments reject `-max` / `-codex-max` model variants; include non-max fallbacks.
  if (s.endsWith("-codex-max")) {
    out.push(s.replace(/-codex-max$/, ""));
    out.push(s.replace(/-max$/, ""));
  } else if (s.endsWith("-max")) {
    out.push(s.replace(/-max$/, ""));
  }
  return out.filter(Boolean);
}

function modelCandidates(cfg) {
  const primary = String(process.env.IAS_MODEL ?? cfg?.model ?? "gpt-5.2").trim();
  const cfgFallbacks = Array.isArray(cfg?.modelFallbacks) ? cfg.modelFallbacks : [];
  const envFallbacks = parseCsvEnv("IAS_MODEL_FALLBACKS");
  const hardFallbacks = ["gpt-5.1"];
  const expanded = [primary, ...envFallbacks, ...cfgFallbacks, ...hardFallbacks].flatMap(expandModelAliases);
  return uniqueOrdered(expanded);
}

function isLikelyModelErrorText(text) {
  const s = String(text ?? "");
  return (
    /model/i.test(s) &&
    /(does not exist|not found|unknown|invalid|unsupported|not supported|not\\s+.*supported|access|permission)/i.test(s)
  );
}

async function initRunner(repoRoot, runDir) {
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  await ensureDir(p.jobs);

  if (!(await fileExists(p.configPath))) {
    const cfg = {
      model: "gpt-5.2",
      modelFallbacks: ["gpt-5.1"],
      idleSleepMs: 5000,
      maxTurnMs: 1800000,
      retry: {
        enabled: true,
        maxAttempts: 3,
        backoffMs: 15000,
      },
      defaults: {
        approvalPolicy: "never",
      },
      git: {
        enabled: true,
        commitCadence: "job",
        autoCommit: true,
        autoCommitExcludePaths: ["node_modules", ".npm-cache", ".playwright-browsers", "playwright-report", "test-results"],
        autoPush: true,
        pushMode: "always",
        branch: {
          ensure: true,
          base: "main",
          prefix: "ias/",
        },
        pr: {
          auto: true,
          draft: true,
          base: "main",
          mode: "chain",
          chain: {
            rotateAfterWriteJobs: 5,
          },
          review: {
            auto: true,
            role: "reviewer",
            loop: {
              enabled: true,
              maxCycles: 3,
              fixRole: "implementer",
            },
          },
          merge: {
            auto: true,
            method: "merge",
            waitForChecks: true,
            deleteBranch: false,
            requireApprovedReview: true
          },
        },
        verifyCommands: [],
      },
      reentry: {
        maxFileBytes: 24000,
        maxTotalBytes: 120000,
      },
      checks: {
        runStateRequiredAfterWriteJob: true,
        runStateSkewMs: 2000
      }
    };
    await fs.writeFile(p.configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  }

  if (!(await fileExists(p.statePath))) {
    const state = {
      lastUpdated: new Date().toISOString(),
      lastThreadId: null,
      lastJobId: null,
    };
    await fs.writeFile(p.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  return p;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function writeJson(filePath, obj) {
  await fs.writeFile(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

async function runInShell(repoRoot, command) {
  return await execFileCapture("/bin/zsh", ["-lc", command], { cwd: repoRoot });
}

async function gitOrNull(repoRoot, args) {
  const r = await execFileCapture("git", args, { cwd: repoRoot });
  if (r.code !== 0) return null;
  return r;
}

async function gitCurrentBranch(repoRoot) {
  const r = await gitOrNull(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const b = (r?.stdout ?? "").trim();
  return b.length > 0 ? b : null;
}

async function hasJobCommit(repoRoot, jobId) {
  const args = gitLogArgsForJobCommit(jobId);
  const r = await gitOrNull(repoRoot, args);
  if (!r) return false;
  return String(r.stdout || "").trim().length > 0;
}

async function gitWorkingTreeDirty(repoRoot) {
  const r = await gitOrNull(repoRoot, ["status", "--porcelain"]);
  if (!r) return false;
  return (r.stdout || "").trim().length > 0;
}

function runnerInstallPaths(repoRoot) {
  const runnerDir = path.join(repoRoot, "scripts", "ias-runner");
  return {
    runnerDir,
    packageJsonPath: path.join(runnerDir, "package.json"),
    codexSdkPath: path.join(runnerDir, "node_modules", "@openai", "codex-sdk", "package.json"),
    pidPath: path.join(runnerDir, ".runner.pid"),
  };
}

function startRunnerPidLifecycle(repoRoot) {
  const { pidPath } = runnerInstallPaths(repoRoot);
  fsSync.mkdirSync(path.dirname(pidPath), { recursive: true });
  const pidText = `${process.pid}\n`;
  const tmpPidPath = `${pidPath}.tmp`;
  fsSync.writeFileSync(tmpPidPath, pidText, "utf8");
  fsSync.renameSync(tmpPidPath, pidPath);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      fsSync.unlinkSync(pidPath);
    } catch (e) {
      // ignore missing/stale pid file — log other errors
      if (e?.code !== "ENOENT") {
        console.warn(`[runner] failed to remove pid file (${pidPath}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  const onSigterm = () => {
    cleanup();
    process.exit(143);
  };
  const onSigint = () => {
    cleanup();
    process.exit(130);
  };

  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);
  process.once("exit", cleanup);

  return () => {
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("SIGINT", onSigint);
    process.removeListener("exit", cleanup);
    cleanup();
  };
}

async function assertControlPlaneHealth(configPath) {
  const cfgText = await fs.readFile(configPath, "utf8");
  const cfg = JSON.parse(cfgText.replace(/^\uFEFF/, ""));
  const site = convexSiteBaseUrlFromDeploymentUrl(cfg?.controlPlane?.convexDeploymentUrl);
  if (!site) throw new Error("Control plane health check failed: missing/invalid controlPlane.convexDeploymentUrl");
  const url = `${site}/control-plane/health`;

  let res = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
  } catch (e) {
    throw new Error(`Control plane unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res?.ok) throw new Error(`Control plane health check failed (${res?.status ?? "unknown"})`);
}

async function validateRunnerStartup(repoRoot, configPath) {
  const install = runnerInstallPaths(repoRoot);
  if (!(await fileExists(install.packageJsonPath))) {
    throw new Error("Not a bootstrapped IAS repo (missing scripts/ias-runner/package.json)");
  }
  if (!(await fileExists(install.codexSdkPath))) {
    throw new Error("Runner dependencies missing (@openai/codex-sdk). Run: cd scripts/ias-runner && npm ci");
  }

  const cfgText = await fs.readFile(configPath, "utf8");
  const cfg = JSON.parse(cfgText.replace(/^\uFEFF/, ""));
  if (cfg?.execution?.cli?.enabled === false) {
    console.warn("execution.cli.enabled is false; runner will continue in control-plane mode");
  }

  if (await gitWorkingTreeDirty(repoRoot)) {
    console.warn("Git working tree has uncommitted changes");
  }

  await assertControlPlaneHealth(configPath);
}

async function gitRefExists(repoRoot, ref) {
  const r = await gitOrNull(repoRoot, ["show-ref", "--verify", "--quiet", ref]);
  return Boolean(r);
}

async function originRemotePresent(repoRoot) {
  const r = await gitOrNull(repoRoot, ["remote", "get-url", "origin"]);
  return Boolean(r && String(r.stdout || "").trim().length > 0);
}

async function detectOriginDefaultBranch(repoRoot) {
  const r =
    (await gitOrNull(repoRoot, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])) ??
    (await gitOrNull(repoRoot, ["rev-parse", "--abbrev-ref", "origin/HEAD"]));
  if (!r) return null;
  const raw = String(r.stdout || "").trim();
  if (!raw) return null;
  if (raw.startsWith("origin/")) return raw.slice("origin/".length);
  return raw;
}

async function resolveBaseBranchName(repoRoot, configuredBase, opts = {}) {
  const preferRemote = Boolean(opts?.preferRemote ?? false);
  const base = typeof configuredBase === "string" ? configuredBase.trim() : "";
  const hasOrigin = await originRemotePresent(repoRoot);
  if (base) {
    if (hasOrigin) {
      const remote = await gitRefExists(repoRoot, `refs/remotes/origin/${base}`);
      if (remote) return base;
      if (!preferRemote) {
        const local = await gitRefExists(repoRoot, `refs/heads/${base}`);
        if (local) return base;
      }
    } else {
      const local = await gitRefExists(repoRoot, `refs/heads/${base}`);
      if (local) return base;
    }
  }
  const detected = await detectOriginDefaultBranch(repoRoot);
  if (detected) return detected;
  // Last resort: allow local-only base if it exists.
  if (base && (await gitRefExists(repoRoot, `refs/heads/${base}`))) return base;
  return base || "main";
}

async function resolveBaseGitRef(repoRoot, baseBranchName) {
  const base = String(baseBranchName || "").trim();
  if (!base) return "main";
  if (await gitRefExists(repoRoot, `refs/heads/${base}`)) return base;
  if (await gitRefExists(repoRoot, `refs/remotes/origin/${base}`)) return `origin/${base}`;
  return base;
}

async function ensureRunBranch(repoRoot, runDir, cfg) {
  const gitCfg = cfg?.git ?? {};
  const enabled = Boolean(gitCfg?.enabled ?? true);
  if (!enabled) return;

  const branchCfg = gitCfg?.branch ?? {};
  const ensure = Boolean(branchCfg?.ensure ?? true);
  if (!ensure) return;

  const baseBranch = await resolveBaseBranchName(repoRoot, branchCfg?.base, { preferRemote: true });
  const runName = path.basename(runDir);
  const prefix = String(branchCfg?.prefix ?? "ias/");
  const desired = await computeDesiredBranchName(repoRoot, runDir, cfg);

  const current = await gitCurrentBranch(repoRoot);
  if (!current) return;
  if (current === desired) return;

  // Avoid switching branches with a dirty working tree.
  if (await gitWorkingTreeDirty(repoRoot)) return;

  // Only auto-switch when we're on the base branch/detached, or already on a run branch for this run.
  const runPrefix = `${prefix}${runName}`;
  const sameRun = current.startsWith(runPrefix) && desired.startsWith(runPrefix);
  if (current !== baseBranch && current !== "HEAD" && !sameRun) return;

  // If branch exists, switch; otherwise create it from baseBranch.
  const exists = await gitOrNull(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${desired}`]);
  if (exists) {
    const switchResult = await execFileCapture("git", ["switch", desired], { cwd: repoRoot });
    if (switchResult.code !== 0) {
      throw new Error(`git switch to ${desired} failed: ${(switchResult.stderr || '').trim()}`);
    }
    return;
  }

  // Create from current run branch when rotating within the same run; otherwise create from baseBranch.
  const createFrom = sameRun ? current : await resolveBaseGitRef(repoRoot, baseBranch);
  const createResult = await execFileCapture("git", ["switch", "-c", desired, createFrom], { cwd: repoRoot });
  if (createResult.code !== 0) {
    throw new Error(`git switch -c ${desired} from ${createFrom} failed: ${(createResult.stderr || '').trim()}`);
  }
}

function jobBranchOverride(job) {
  const raw = job?.git?.branch ?? job?.gitBranch ?? job?.branch;
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length > 0 ? v : null;
}

async function ensureBranchForJob(repoRoot, runDir, cfg, job) {
  const override = jobBranchOverride(job) ?? extractPrFixHeadBranch(job) ?? extractPrReviewHeadBranch(job);
  if (!override) {
    await ensureRunBranch(repoRoot, runDir, cfg);
    return;
  }

  const gitCfg = cfg?.git ?? {};
  const enabled = Boolean(gitCfg?.enabled ?? true);
  if (!enabled) return;

  const branchCfg = gitCfg?.branch ?? {};
  const ensure = Boolean(branchCfg?.ensure ?? true);
  if (!ensure) return;

  const baseBranch = await resolveBaseBranchName(repoRoot, branchCfg?.base, { preferRemote: true });
  const runName = path.basename(runDir);
  const prefix = String(branchCfg?.prefix ?? "ias/");
  const current = await gitCurrentBranch(repoRoot);
  if (!current) return;
  if (current === override) return;

  const runPrefix = `${prefix}${runName}`;
  // Safety: only auto-switch to a run branch for THIS run (avoid clobbering unrelated branches).
  if (!override.startsWith(runPrefix)) return;

  const sameRun = current.startsWith(runPrefix) && override.startsWith(runPrefix);
  if (current !== baseBranch && current !== "HEAD" && !sameRun) return;

  // If we must switch branches for this job, prefer stashing rather than silently running on the wrong branch.
  let stashed = false;
  try {
    if (await gitWorkingTreeDirty(repoRoot)) {
      const msg = `ias-runner:auto-stash before switching to ${override}`;
      const stash = await execFileCapture("git", ["stash", "push", "-u", "-m", msg], { cwd: repoRoot });
      if (stash.code !== 0) return;
      stashed = true;
    }

    const exists = await gitOrNull(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${override}`]);
    if (exists) {
      await execFileCapture("git", ["switch", override], { cwd: repoRoot });
      return;
    }

    const createFrom = sameRun ? current : await resolveBaseGitRef(repoRoot, baseBranch);
    await execFileCapture("git", ["switch", "-c", override, createFrom], { cwd: repoRoot });
  } finally {
    if (stashed) {
      const pop = await execFileCapture("git", ["stash", "pop"], { cwd: repoRoot });
      if (pop.code !== 0) throw new Error(`git stash pop failed: ${(pop.stderr || pop.stdout || "").trim()}`);
    }
  }
}

async function readRunnerState(repoRoot, runDir) {
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  try {
    return await readJson(p.statePath);
  } catch (e) {
    if (e?.code === "ENOENT") return {};
    throw new Error(`Failed to read runner state (${p.statePath}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function writeRunnerState(repoRoot, runDir, next) {
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  await writeJson(p.statePath, next);
}

async function updateRunnerState(repoRoot, runDir, updater) {
  const st = await readRunnerState(repoRoot, runDir);
  const next = updater(st ?? {}) ?? st ?? {};
  await writeRunnerState(repoRoot, runDir, next);
  return next;
}

function prReviewLoopConfig(cfg) {
  const prCfg = cfg?.git?.pr ?? {};
  const reviewCfg = prCfg?.review ?? {};
  const loopCfg = reviewCfg?.loop ?? {};
  const enabled = Boolean(loopCfg?.enabled ?? true);
  const maxCycles = Number(loopCfg?.maxCycles ?? 3);
  const fixRole = String(loopCfg?.fixRole ?? "implementer");
  return {
    enabled,
    maxCycles: Number.isFinite(maxCycles) && maxCycles >= 0 ? Math.floor(maxCycles) : 3,
    fixRole,
  };
}

function prMergeConfig(cfg) {
  const prCfg = cfg?.git?.pr ?? {};
  const mergeCfg = prCfg?.merge ?? {};
  const auto = Boolean(mergeCfg?.auto ?? false);
  const rawMethod = String(mergeCfg?.method ?? "merge").toLowerCase(); // merge | squash | rebase
  const method = rawMethod === "squash" || rawMethod === "rebase" || rawMethod === "merge" ? rawMethod : "merge";
  const waitForChecks = Boolean(mergeCfg?.waitForChecks ?? true);
  const deleteBranch = Boolean(mergeCfg?.deleteBranch ?? false);
  const requireApprovedReview = Boolean(mergeCfg?.requireApprovedReview ?? true);
  return { auto, method, waitForChecks, deleteBranch, requireApprovedReview };
}

function extractPrReviewHeadBranch(job) {
  const prompt = typeof job?.prompt === "string" ? job.prompt : "";
  // Support both formats:
  // - actual newlines (preferred)
  // - legacy literal "\\n" sequences in queued prompts
  const m = prompt.match(/(?:^|\n|\\n)\s*IAS_PR_REVIEW:([^\s\\]+)\s*(?:$|\n|\\n)/);
  return m ? String(m[1]).trim() : null;
}

function extractPrFixHeadBranch(job) {
  const prompt = typeof job?.prompt === "string" ? job.prompt : "";
  // Support both formats:
  // - actual newlines (preferred)
  // - legacy literal "\\n" sequences in queued prompts
  const m = prompt.match(/(?:^|\n|\\n)\s*IAS_PR_FIX:([^\s:]+):/);
  return m ? String(m[1]).trim() : null;
}

function extractGitBaseBranchFromText(text) {
  const raw = String(text ?? "");
  const m =
    raw.match(/(?:^|\n)\s*-\s*Base branch:\s*`([^`]+)`/i) ??
    raw.match(/(?:^|\n)\s*Base branch:\s*`([^`]+)`/i) ??
    raw.match(/(?:^|\n)\s*Base branch:\s*([^\s]+)\s*$/im);
  return m ? String(m[1]).trim() : null;
}

function extractPrUrlFromText(text) {
  const raw = String(text ?? "");
  const urls = raw.match(/https?:\/\/[^\s)]+/g);
  if (!urls) return null;
  for (const u of urls) {
    const url = String(u).trim().replace(/[),.;]+$/, "");
    if (url.includes("/pull/")) return url;
  }
  return null;
}

function workPromptRequestsPrReview(text) {
  const raw = String(text ?? "");
  const m = raw.match(/(?:^|\n|\\n)\s*IAS_REQUEST_PR_REVIEW(?::\s*(true|false|1|0))?\s*(?:$|\n|\\n)/i);
  if (!m) return false;
  const v = String(m[1] ?? "true").trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  return true;
}

function extractChainChunk(headBranch) {
  const m = String(headBranch ?? "").match(/-c(\d{3})$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

async function gitAutoCommitAndPush(repoRoot, runDir, job, result, cfg, jobId) {
  const gitCfg = cfg?.git ?? {};
  const enabled = Boolean(gitCfg?.enabled ?? true);
  if (!enabled) return;

  // Ensure git ops happen on the branch intended for this job (especially for PR fix/review jobs).
  // If this fails, abort to prevent commits landing on the wrong branch.
  try {
    await ensureBranchForJob(repoRoot, runDir, cfg, job);
  } catch (e) {
    throw new Error(`[runner] branch switch failed, aborting commit to prevent wrong-branch push: ${e instanceof Error ? e.message : String(e)}`);
  }

  const autoCommit = Boolean(gitCfg?.autoCommit ?? true);
  const autoPush = Boolean(gitCfg?.autoPush ?? true);
  const pushMode = String(gitCfg?.pushMode ?? "always"); // always | on-green | never
  const cadence = String(gitCfg?.commitCadence ?? "job"); // job | milestone (future)

  if (cadence !== "job") return;

  // Only commit/push after write-capable jobs (role policy or explicit write flag).
  const writeRole =
    job?.role === "orchestrator" ||
    job?.role === "implementer" ||
    job?.role === "test-runner";
  const writeFlag = Boolean(job?.mode?.write);
  const shouldTrack = writeRole || writeFlag;
  if (!shouldTrack) return;

  const hadChanges = await gitWorkingTreeDirty(repoRoot);
  if (!hadChanges) return;
  const attemptNumber = Math.max(1, Math.floor(Number(job?.attempt ?? 0)) + 1);
  const alreadyHasCommit = await hasJobCommit(repoRoot, jobId);
  if (alreadyHasCommit) {
    console.log(`job marker already present (IAS-Job-Id: ${jobId}); skipping duplicate commit`);
  }

  if (autoCommit && !alreadyHasCommit) {
    await execFileCapture("git", gitAddArgsForAutoCommit({ excludePaths: gitCfg?.autoCommitExcludePaths }), { cwd: repoRoot });
    const staged = await execFileCapture("git", ["diff", "--cached", "--quiet"], { cwd: repoRoot });
    if (staged.code === 0) {
      // No staged changes.
    } else {
      const summary = truncateForGitSubject(result?.summary ?? job?.prompt ?? jobId, 72);
      const subject = `ias(${job?.role ?? "job"}): ${summary}`;
      const commitMessage = withJobCommitTrailer(subject, jobId, attemptNumber);
      await execFileCapture("git", ["commit", "-m", commitMessage], { cwd: repoRoot });
    }
  }

  // Respect job requirements: if network is not allowed, never push or create PRs.
  if (!Boolean(job?.mode?.networkAccessEnabled)) return;

  if (!autoPush || pushMode === "never") return;

  if (pushMode === "on-green") {
    const verify = Array.isArray(gitCfg?.verifyCommands) ? gitCfg.verifyCommands : [];
    for (const cmd of verify) {
      if (typeof cmd !== "string" || cmd.trim().length === 0) continue;
      const r = await runInShell(repoRoot, cmd);
      if (r.code !== 0) return;
    }
  }

  // Best-effort push; do not fail the whole job if push isn't configured.
  const origin = await gitOrNull(repoRoot, ["remote", "get-url", "origin"]);
  if (!origin) return;
  const pushResult = await execFileCapture("git", ["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  if (pushResult.code !== 0) {
    console.warn(`[runner] git push failed (code=${pushResult.code}): ${(pushResult.stderr || pushResult.stdout || "").trim().slice(0, 200)}`);
    return;
  }

  const prCfg = gitCfg?.pr ?? {};
  const autoPr = Boolean(prCfg?.auto ?? false);
  if (!autoPr) return;

  const headBranch = jobBranchOverride(job) ?? extractPrReviewHeadBranch(job) ?? (await gitCurrentBranch(repoRoot)) ?? "";
  if (!headBranch || headBranch === "HEAD") return;
  const prMode = String(prCfg?.mode ?? "single"); // single | milestone | chain
  const runName = path.basename(runDir);
  const prefix = String(gitCfg?.branch?.prefix ?? "ias/");
  let baseBranch = await resolveBaseBranchName(repoRoot, prCfg?.base ?? gitCfg?.branch?.base, { preferRemote: true });
  if (prMode === "chain") {
    const m = headBranch.match(/-c(\d{3})$/i);
    const chunk = m ? Number.parseInt(m[1], 10) : 1;
    if (Number.isFinite(chunk) && chunk > 1) {
      baseBranch = `${prefix}${runName}-c${String(chunk - 1).padStart(3, "0")}`;
    }
  }
  const draft = Boolean(prCfg?.draft ?? true);

  const pr = await ensurePr(repoRoot, runDir, { headBranch, baseBranch, draft, job });
  if (!pr) return;

  await updateRunnerState(repoRoot, runDir, (st) => {
    const prs = typeof st.prs === "object" && st.prs ? { ...st.prs } : {};
    prs[headBranch] = {
      url: pr.url ?? null,
      number: pr.number ?? null,
      state: pr.state ?? null,
      baseBranch,
      updatedAt: new Date().toISOString(),
    };
    return { ...st, prs };
  });

  const reviewCfg = prCfg?.review ?? {};
  const autoReview = Boolean(reviewCfg?.auto ?? false);
  if (!autoReview) return;

  // Default to reviewing code-delivering jobs (docs-only roles can still trigger reviews via orchestrator).
  const reviewable = job?.role === "implementer" || job?.role === "test-runner" || job?.role === "orchestrator";
  if (!reviewable) return;

  // Local runner queue was removed; CP callers enqueue follow-up review jobs explicitly.

  // PR chain mode: rotate to a fresh branch periodically so PRs remain small.
  if (prMode === "chain" && (job?.role === "implementer" || job?.role === "test-runner" || job?.role === "orchestrator")) {
    // Only advance the chain when we're working on the current chain branch, not when we're fixing older chunks.
    const desiredNow = await computeDesiredBranchName(repoRoot, runDir, cfg);
    if (headBranch !== desiredNow) return;

    const chainCfg = prCfg?.chain ?? {};
    const rotateAfterWriteJobs = Number(chainCfg?.rotateAfterWriteJobs ?? 5);
    const bumped = await bumpPrChainCounter(repoRoot, runDir, rotateAfterWriteJobs);
    if (bumped.rotated) {
      const nextBranch = `${prefix}${runName}-c${String(bumped.nextChunk).padStart(3, "0")}`;
      const exists = await gitOrNull(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${nextBranch}`]);
      if (exists) {
        await execFileCapture("git", ["switch", nextBranch], { cwd: repoRoot });
      } else {
        await execFileCapture("git", ["switch", "-c", nextBranch, "HEAD"], { cwd: repoRoot });
      }
    }
  }
}

async function ensurePr(repoRoot, runDir, { headBranch, baseBranch, draft, job, blockOnHighImpactAssumptions = false }) {
  const ghOk = await execFileCapture("gh", ["--version"], { cwd: repoRoot });
  if (ghOk.code !== 0) return null;
  const authOk = await execFileCapture("gh", ["auth", "status"], { cwd: repoRoot });
  if (authOk.code !== 0) return null;

  const existing = await execFileCapture(
    "gh",
    ["pr", "list", "--head", headBranch, "--state", "all", "--limit", "1", "--json", "number,url,state"],
    { cwd: repoRoot },
  );
  if (existing.code === 0) {
    try {
      const parsed = JSON.parse(existing.stdout || "[]");
      const pr = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
      if (pr) return { url: pr?.url ?? null, number: pr?.number ?? null, state: pr?.state ?? null };
      // No PR found: fall through to create.
    } catch (e) {
      console.warn(`[runner] failed to parse gh pr list output: ${e instanceof Error ? e.message : String(e)}`);
      // Fall through to create.
    }
  }

  // Validate checkpoints before PR creation
  let checkpointValidation = null;
  let assumptionsSection = "";
  try {
    checkpointValidation = await validateCheckpointsForMerge(runDir, { blockOnHighImpact: blockOnHighImpactAssumptions });
    if (!checkpointValidation.valid && blockOnHighImpactAssumptions) {
      console.log(`pr: blocked by checkpoint validation - ${checkpointValidation.message}`);
      return { blocked: true, reason: checkpointValidation.message };
    }
    if (checkpointValidation.pending > 0) {
      assumptionsSection = await formatAssumptionsForPr(runDir);
      console.log(`pr: ${checkpointValidation.pending} assumption(s) will be included in PR description`);
    }
  } catch (e) {
    // Non-fatal: continue without assumptions section if decision-loop files don't exist
    console.log(`pr: checkpoint validation skipped (${e?.message ?? "unknown error"})`);
  }

  const runName = path.basename(runDir);
  const milestone = parseCurrentMilestoneId(await readRunStateText(repoRoot, runDir));
  const chunkMatch = String(headBranch).match(/-c(\d{3})$/i);
  const chunkLabel = chunkMatch ? `C${chunkMatch[1]}` : null;
  const tags = [milestone ? milestone.toUpperCase() : null, chunkLabel].filter(Boolean).join(" ");
  const title = truncateForGitSubject(`IAS: ${runName}${tags ? ` ${tags}` : ""}`, 80);
  const bodyParts = [
    `Run: \`${runName}\``,
    "",
    `Run state: \`docs/ias/runs/${runName}/run-state.md\``,
    "",
    `Branch: \`${headBranch}\``,
    "",
    `Latest role: \`${job?.role ?? "unknown"}\``,
    "",
    "This PR is generated by the IAS runner. It will receive additional commits as queued jobs complete.",
  ];

  // Add assumptions section if present
  if (assumptionsSection) {
    bodyParts.push("");
    bodyParts.push("---");
    bodyParts.push("");
    bodyParts.push(assumptionsSection);
  }

  const body = bodyParts.join("\n");
  const args = ["pr", "create", "--title", title, "--body", body, "--base", baseBranch, "--head", headBranch];
  if (draft) args.push("--draft");

  const created = await execFileCapture("gh", args, { cwd: repoRoot });
  if (created.code !== 0) {
    const err = String(created.stderr || created.stdout || "").trim();
    if (err) console.log(`pr: create failed (head=${headBranch} base=${baseBranch}): ${truncateForGitSubject(err, 140)}`);
    return null;
  }
  const urlMatch = String(created.stdout || "").match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : null;
  return { url, number: null, state: "OPEN" };
}

async function persistReviewReport(repoRoot, runDir, job, result, jobId) {
  if (job?.role !== "reviewer") return;
  const review = result?.review;
  if (!review || typeof review !== "object") return;

  const runName = path.basename(runDir);
  const outDir = path.join(repoRoot, "docs/ias/runs", runName, "reviews");
  await ensureDir(outDir);

  const headBranch = (await gitCurrentBranch(repoRoot)) ?? "";
  const decision = String(review.decision ?? "").trim();
  const p0 = Array.isArray(review.p0) ? review.p0 : [];
  const p1 = Array.isArray(review.p1) ? review.p1 : [];
  const p2 = Array.isArray(review.p2) ? review.p2 : [];
  const notes = String(review.notes ?? "").trim();

  const lines = [];
  lines.push(`# Review: ${jobId}`);
  lines.push("");
  lines.push(`- run: \`${runName}\``);
  if (headBranch && headBranch !== "HEAD") lines.push(`- branch: \`${headBranch}\``);
  if (decision) lines.push(`- decision: \`${decision}\``);
  lines.push(`- timestamp_utc: ${new Date().toISOString()}`);
  lines.push("");

  const section = (title, items) => {
    lines.push(`## ${title}`);
    if (!items || items.length === 0) {
      lines.push("");
      lines.push("- (none)");
      lines.push("");
      return;
    }
    lines.push("");
    for (const it of items) {
      const s = String(it ?? "").trim();
      if (!s) continue;
      lines.push(`- ${s}`);
    }
    lines.push("");
  };

  section("P0 (must fix)", p0);
  section("P1 (should fix)", p1);
  section("P2 (can defer)", p2);
  if (notes) {
    lines.push("## Notes");
    lines.push("");
    lines.push(notes);
    lines.push("");
  }

  const outPath = path.join(outDir, `${jobId}.md`);
  await fs.writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
}

async function maybeSubmitGitHubPrReviewFromReviewJob(repoRoot, runDir, cfg, job, result, jobId) {
  const gitCfg = cfg?.git ?? {};
  if (!gitCfg.enabled) return;
  if (job?.role !== "reviewer") return;

  const headBranch = extractPrReviewHeadBranch(job);
  if (!headBranch) return;

  const review = result?.review;
  if (!review || typeof review !== "object") return;

  const decision = String(review.decision ?? "").trim();
  if (!decision) return;

  const prList = await execFileCapture(
    "gh",
    ["pr", "list", "--head", headBranch, "--state", "open", "--limit", "1", "--json", "number,url,isDraft"],
    { cwd: repoRoot },
  );
  if (prList.code !== 0) return;

  let pr = null;
  try {
    const parsed = JSON.parse(prList.stdout || "[]");
    pr = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
  } catch (e) {
    console.warn(`[runner] failed to parse gh pr list output: ${e instanceof Error ? e.message : String(e)}`);
    pr = null;
  }
  if (!pr || !pr.number) return;

  // Draft PRs don't accept formal approvals. Mark ready before posting an approval (and potential auto-merge).
  if (pr.isDraft && decision === "approve") {
    await execFileCapture("gh", ["pr", "ready", String(pr.number)], { cwd: repoRoot });
  }

  const p0 = Array.isArray(review.p0) ? review.p0 : [];
  const p1 = Array.isArray(review.p1) ? review.p1 : [];
  const p2 = Array.isArray(review.p2) ? review.p2 : [];
  const notes = String(review.notes ?? "").trim();

  const runName = path.basename(runDir);
  const reportPath = path.join(repoRoot, "docs/ias/runs", runName, "reviews", `${jobId}.md`);
  const reportRel = path.relative(repoRoot, reportPath);

  const lines = [];
  lines.push(`IAS PR review (${jobId})`);
  lines.push("");
  lines.push(`- run: \`${runName}\``);
  lines.push(`- branch: \`${headBranch}\``);
  lines.push(`- decision: \`${decision}\``);
  if (reportRel) lines.push(`- report: \`${reportRel}\``);
  if (typeof pr.url === "string" && pr.url.trim()) lines.push(`- pr: ${pr.url.trim()}`);
  lines.push("");

  const section = (title, items) => {
    lines.push(`## ${title}`);
    const list = (items ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
    if (list.length === 0) {
      lines.push("- (none)");
      lines.push("");
      return;
    }
    for (const it of list) lines.push(`- ${it}`);
    lines.push("");
  };

  section("P0 (must fix)", p0);
  section("P1 (should fix)", p1);
  section("P2 (can defer)", p2);
  if (notes) {
    lines.push("## Notes");
    lines.push("");
    lines.push(notes);
    lines.push("");
  }

  const bodyDir = path.join((await runnerPaths(repoRoot, runName)).jobs, ".tmp");
  await ensureDir(bodyDir);
  const bodyPath = path.join(bodyDir, `gh-pr-review-${jobId}.md`);
  await fs.writeFile(bodyPath, `${lines.join("\n")}\n`, "utf8");

  const desiredFlag =
    decision === "approve" ? "--approve" : decision === "request_changes" ? "--request-changes" : "--comment";

  const runReview = async (flag) =>
    await execFileCapture("gh", ["pr", "review", String(pr.number), flag, "--body-file", bodyPath], { cwd: repoRoot });

  let reviewed = await runReview(desiredFlag);
  if (reviewed.code !== 0 && desiredFlag !== "--comment") {
    const errText = String(reviewed.stderr || reviewed.stdout || "").trim();
    // GitHub forbids approving/requesting changes on your own PR; fall back to a comment to keep the loop non-blocking.
    if (/\byour own pull request\b/i.test(errText)) {
      reviewed = await runReview("--comment");
    }
  }

  if (reviewed.code !== 0) {
    const err = String(reviewed.stderr || reviewed.stdout || "").trim();
    console.log(
      `pr: review failed (job=${jobId} pr=${pr.number} head=${headBranch} code=${reviewed.code}): ${truncateForGitSubject(
        err || "(no output)",
        160,
      )}`,
    );
  }
}

async function maybeAutoMergePrFromReview(repoRoot, runDir, cfg, job, result, jobId) {
  const merge = prMergeConfig(cfg);
  if (!merge.auto) return;
  if (job?.role !== "reviewer") return;

  const headBranch = extractPrReviewHeadBranch(job);
  if (!headBranch) return;

  const review = result?.review;
  if (!review || typeof review !== "object") return;
  const decision = String(review.decision ?? "").trim();
  if (merge.requireApprovedReview && decision !== "approve") return;

  // Resolve desired base branch name (prefer remote / origin/HEAD).
  const gitCfg = cfg?.git ?? {};
  const prMode = String(gitCfg?.pr?.mode ?? "single");
  if (prMode === "chain" && merge.method !== "merge") {
    console.log(`pr: auto-merge skipped (chain mode requires method=merge; got ${merge.method})`);
    return;
  }
  const desiredBase = await resolveBaseBranchName(repoRoot, gitCfg?.pr?.base ?? gitCfg?.branch?.base, {
    preferRemote: true,
  });

  const prList = await execFileCapture(
    "gh",
    ["pr", "list", "--head", headBranch, "--state", "open", "--limit", "1", "--json", "number,url,state,isDraft,baseRefName"],
    { cwd: repoRoot },
  );
  if (prList.code !== 0) return;

  let pr = null;
  try {
    const parsed = JSON.parse(prList.stdout || "[]");
    pr = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
  } catch (e) {
    console.warn(`[runner] failed to parse gh pr list output: ${e instanceof Error ? e.message : String(e)}`);
    pr = null;
  }
  if (!pr || !pr.number) return;
  if (String(pr.state || "").toUpperCase() !== "OPEN") return;

  console.log(`pr: merge attempt (job=${jobId} pr=${pr.number} head=${headBranch})`);

  // Chain mode safety: only merge in order (do not merge chunk N unless chunk N-1 is merged).
  const chunk = prMode === "chain" ? extractChainChunk(headBranch) : null;
  const runName = path.basename(runDir);
  const prefix = String(gitCfg?.branch?.prefix ?? "ias/");
  if (prMode === "chain" && chunk && chunk > 1) {
    const prevBranch = `${prefix}${runName}-c${String(chunk - 1).padStart(3, "0")}`;
    const prevMerged = await execFileCapture(
      "gh",
      ["pr", "list", "--head", prevBranch, "--state", "merged", "--limit", "1", "--json", "number"],
      { cwd: repoRoot },
    );
    if (prevMerged.code !== 0) return;
    try {
      const parsed = JSON.parse(prevMerged.stdout || "[]");
      const prev = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
      if (!prev) return;
    } catch (e) {
      console.warn(`[runner] failed to parse gh pr list output for chain merge check: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }

  // Ensure the PR targets the repo default base so the merge lands in the right place.
  if (desiredBase && typeof pr.baseRefName === "string" && pr.baseRefName !== desiredBase) {
    await execFileCapture("gh", ["pr", "edit", String(pr.number), "--base", desiredBase], { cwd: repoRoot });
  }

  // Draft PRs cannot merge; mark ready.
  if (pr.isDraft) {
    const ready = await execFileCapture("gh", ["pr", "ready", String(pr.number)], { cwd: repoRoot });
    if (ready.code !== 0) {
      const err = String(ready.stderr || ready.stdout || "").trim();
      if (err) console.log(`pr: ready failed (pr=${pr.number} head=${headBranch}): ${truncateForGitSubject(err, 160)}`);
      return;
    }
  }

  const methodFlag = merge.method === "squash" ? "--squash" : merge.method === "rebase" ? "--rebase" : "--merge";
  const runMerge = async (withAuto) => {
    const args = ["pr", "merge", String(pr.number), methodFlag];
    if (withAuto) args.push("--auto");
    if (merge.deleteBranch) args.push("--delete-branch");
    return await execFileCapture("gh", args, { cwd: repoRoot });
  };

  let merged = await runMerge(Boolean(merge.waitForChecks));
  if (merged.code !== 0 && merge.waitForChecks) {
    const err = String(merged.stderr || merged.stdout || "").trim();
    // Some repos disallow GitHub auto-merge; fall back to a direct merge attempt.
    if (/\bauto-merge\b/i.test(err) && /\bnot enabled\b/i.test(err)) {
      merged = await runMerge(false);
    }
  }

  if (merged.code !== 0) {
    const err = String(merged.stderr || merged.stdout || "").trim();
    if (err) console.log(`pr: merge failed (pr=${pr.number} head=${headBranch}): ${truncateForGitSubject(err, 160)}`);
  }
}

async function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
    if (code === "EPERM") return true; // Process exists but we lack permission
    if (code !== "ESRCH") {
      console.warn(`[runner] pid check failed (pid=${pid}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return false;
  }
}

async function acquireLock(lockPath) {
  const payload = `${JSON.stringify(
    {
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;

  try {
    await fs.writeFile(lockPath, payload, { flag: "wx" });
    return { action: "created" };
  } catch (e) {
    if (e?.code !== "EEXIST") {
      console.warn(`[runner] lock creation failed (${lockPath}): ${e instanceof Error ? e.message : String(e)}`);
    }
    // continue below — lock file likely already exists
  }

  // Lock exists: refuse if still alive, otherwise overwrite.
  try {
    const existing = await readJson(lockPath);
    if (existing?.pid && (await pidAlive(existing.pid))) {
      if (existing.pid === process.pid) {
        return { action: "already-held" };
      }
      die(`runner already active (pid ${existing.pid}); remove ${lockPath} if you are sure it's stale`);
    }
  } catch (e) {
    console.warn(`[runner] failed to parse lock file (${lockPath}), treating as stale: ${e instanceof Error ? e.message : String(e)}`);
  }

  await fs.writeFile(lockPath, payload, "utf8");
  return { action: "overwrote" };
}

async function releaseLock(lockPath) {
  try {
    await fs.rm(lockPath, { force: true });
  } catch (e) {
    console.warn(`[runner] failed to release lock (${lockPath}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function readLockInfo(lockPath) {
  if (!(await fileExists(lockPath))) return null;
  try {
    const lock = await readJson(lockPath);
    const alive = lock?.pid ? await pidAlive(lock.pid) : false;
    return { ...lock, alive };
  } catch (e) {
    console.warn(`[runner] failed to read lock info (${lockPath}): ${e instanceof Error ? e.message : String(e)}`);
    return { alive: false };
  }
}

async function writeJobOutcome(repoRoot, runDir, jobId, status, resultOrError, extraMeta = {}) {
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  const jobDir = path.join(p.jobs, jobId);
  await ensureDir(jobDir);

  const finishedAt = new Date();
  const meta = {
    jobId,
    status,
    finishedAt: finishedAt.toISOString(),
    finishedAtMs: finishedAt.getTime(),
    ...extraMeta,
  };
  await writeJson(path.join(jobDir, "result-meta.json"), meta);

  if (status === "ok") {
    await writeJson(path.join(jobDir, "result.json"), resultOrError);
  } else {
    await fs.writeFile(path.join(jobDir, "error.txt"), String(resultOrError), "utf8");
  }
}

function rolePolicy(role, mode) {
  const isWrite = Boolean(mode?.write);
  const base = {
    sandboxMode: isWrite ? "workspace-write" : "read-only",
    networkAccessEnabled: Boolean(mode?.networkAccessEnabled),
    webSearchEnabled: Boolean(mode?.webSearchEnabled),
    approvalPolicy: "never",
  };

  if (role === "implementer" || role === "orchestrator" || role === "test-runner") {
    return { ...base, sandboxMode: "workspace-write" };
  }
  if (role === "reviewer") {
    // Reviewer should be read-only in intent, but still needs a writable workspace TMPDIR for `git diff` in sandboxes.
    return { ...base, sandboxMode: "workspace-write" };
  }
  if (role === "researcher") {
    return { ...base, sandboxMode: "read-only", networkAccessEnabled: true, webSearchEnabled: true };
  }
  return base;
}

function jobRequiresRepoLock(job) {
  const role = String(job?.role ?? "");
  const writeRole = role === "orchestrator" || role === "implementer" || role === "test-runner";
  const writeFlag = Boolean(job?.mode?.write);
  return writeRole || writeFlag;
}

function repoLockTtlMs(cfg) {
  const maxTurnMs = Number(cfg?.maxTurnMs ?? 0);
  const base = 10 * 60_000;
  if (!Number.isFinite(maxTurnMs) || maxTurnMs <= 0) return base;
  return Math.max(base, maxTurnMs + 5 * 60_000);
}

function jobOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ok", "needs_human", "blocked", "failed"] },
      summary: { type: "string" },
      decisionRequestId: { anyOf: [{ type: "null" }, { type: "string" }] },
      blockedReason: { anyOf: [{ type: "null" }, { type: "string" }] },
      review: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              decision: { type: "string", enum: ["approve", "request_changes", "comment"] },
              p0: { type: "array", items: { type: "string" } },
              p1: { type: "array", items: { type: "string" } },
              p2: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
            },
            required: ["decision", "p0", "p1", "p2", "notes"],
          },
        ],
      },
      decisions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            merge_blocker: { type: "boolean" },
          },
          required: ["slug", "title", "merge_blocker"],
        },
      },
      gaps: { type: "array", items: { type: "string" } },
      next_jobs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            role: { type: "string" },
            kind: { type: "string", enum: ["work", "screenshot"] },
            prompt: { type: "string" },
            write: { type: "boolean" },
            network: { type: "boolean" },
            web_search: { type: "boolean" },
          },
          required: ["role", "prompt", "write", "network", "web_search"],
        },
      },
      recommended_commands: { type: "array", items: { type: "string" } },
    },
    required: ["status", "summary", "decisionRequestId", "blockedReason", "review", "decisions", "gaps", "next_jobs", "recommended_commands"],
  };
}

async function buildReentryPacket(repoRoot, runDir) {
  const cfgPath = (await runnerPaths(repoRoot, path.basename(runDir))).configPath;
  const cfg = (await fileExists(cfgPath)) ? await readJson(cfgPath) : {};
  const maxFileBytes = Number(cfg?.reentry?.maxFileBytes ?? 24000);
  const maxTotalBytes = Number(cfg?.reentry?.maxTotalBytes ?? 120000);

  const parts = [];
  let totalBytes = 0;
  let packetFull = false;

  const addFile = async (label, relPath) => {
    if (packetFull) return;
    const abs = path.join(repoRoot, relPath);
    const contents = await readUtf8IfExists(abs);
    if (!contents) return;

    const header = `## ${label}\n\nPath: ${relPath}\n\n`;
    const t = truncateText(contents, maxFileBytes);
    const body = t.truncated
      ? `${t.text}\n\n[TRUNCATED: ${t.byteLength} bytes total, capped at ${maxFileBytes} bytes]`
      : t.text;

    const chunk = `${header}${body}`.trim();
    const chunkBytes = Buffer.from(chunk, "utf8").byteLength;
    if (maxTotalBytes > 0 && totalBytes + chunkBytes > maxTotalBytes) {
      if (totalBytes === 0) {
        parts.push(
          truncateText(chunk, maxTotalBytes).text +
            `\n\n[TRUNCATED: re-entry packet capped at ${maxTotalBytes} bytes]`,
        );
      } else {
        parts.push(`[TRUNCATED: re-entry packet capped at ${maxTotalBytes} bytes]`);
      }
      totalBytes = maxTotalBytes;
      packetFull = true;
      return;
    }

    totalBytes += chunkBytes;
    parts.push(chunk);
  };

  await addFile("Project context", "docs/ias/project-context.md");
  await addFile("Base goal", "docs/ias/context/base-goal.md");
  await addFile("Inputs", "docs/ias/context/inputs.md");

  const runName = path.basename(runDir);
  await addFile("Run log", `docs/ias/runs/${runName}.md`);
  await addFile("Implementation plan", `docs/ias/runs/${runName}/implementation-plan.md`);
  await addFile("Run state", `docs/ias/runs/${runName}/run-state.md`);
  await addFile("Acceptance criteria", `docs/ias/runs/${runName}/acceptance-criteria.md`);
  await addFile("World model", `docs/ias/runs/${runName}/world-model.md`);
  await addFile("Constraints taxonomy", `docs/ias/runs/${runName}/constraints-taxonomy.md`);
  await addFile("Run plan", `docs/ias/runs/${runName}/run-plan.md`);

  await addFile("Gaps", "docs/ias/gaps.md");

  return parts.join("\n\n---\n\n");
}

function execFileCapture(command, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

// Windows Git Bash detection - find bash executable for cross-platform compatibility
let _cachedBashPath = null;
function findBashExecutable() {
  if (_cachedBashPath !== null) return _cachedBashPath;

  // On non-Windows, just use "bash"
  if (process.platform !== "win32") {
    _cachedBashPath = "bash";
    return _cachedBashPath;
  }

  // On Windows, try common Git Bash locations
  const locations = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
  ];

  for (const loc of locations) {
    if (fsSync.existsSync(loc)) {
      _cachedBashPath = loc;
      return _cachedBashPath;
    }
  }

  // Fallback: hope "bash" is in PATH (e.g., WSL, or user added Git Bash to PATH)
  _cachedBashPath = "bash";
  return _cachedBashPath;
}

async function gitTopLevel(cwd) {
  const r = await execFileCapture("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (r.code !== 0) return null;
  const top = (r.stdout || "").trim();
  return top.length > 0 ? top : null;
}

function normalizeDecisionSlug(slug) {
  const raw = String(slug ?? "").trim();
  const base = raw.split(/[\\/]/).pop() || "";
  const noExt = base.endsWith(".md") ? base.slice(0, -3) : base;
  const m = noExt.match(/^(\d{8})-(\d{4})-(.+)$/);
  return m ? m[3] : noExt;
}

async function findExistingDecisionBasename(repoRoot, slug) {
  const decisionsDir = path.join(repoRoot, "docs/ias/decisions");
  let entries;
  try {
    entries = await fs.readdir(decisionsDir, { withFileTypes: true });
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn(`[runner] failed to read decisions directory (${decisionsDir}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  }

  const suffix = `-${slug}.md`;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.startsWith("20")) continue;
    if (!e.name.endsWith(suffix)) continue;
    if (!/^\d{8}-\d{4}-/.test(e.name)) continue;
    return e.name;
  }
  return null;
}

async function createDecisionsAndGaps(repoRoot, result) {
  const decisions = result.decisions ?? [];
  const gaps = result.gaps ?? [];

  for (const d of decisions) {
    const slug = normalizeDecisionSlug(d.slug);
    requireKebab(slug);
    const existing = await findExistingDecisionBasename(repoRoot, slug);
    if (existing) {
      // Keep decision creation idempotent across repeated jobs: re-add the gap line if needed.
      const gapText = `${d.title} (decision: docs/ias/decisions/${existing})`;
      const r = await execFileCapture(findBashExecutable(), ["scripts/ias", "add-gap", gapText], { cwd: repoRoot });
      if (r.code !== 0) {
        throw new Error(`failed to record gap for existing decision (${slug}): ${r.stderr || r.stdout}`);
      }
      continue;
    }

    const args = ["scripts/ias", "new-decision", slug, d.title];
    if (d.merge_blocker) args.push("--merge-blocker");
    const r = await execFileCapture(findBashExecutable(), args, { cwd: repoRoot });
    if (r.code !== 0) {
      throw new Error(`failed to create decision (${slug}): ${r.stderr || r.stdout}`);
    }
  }

  if (gaps.length > 0) {
    for (const g of gaps) {
      if (typeof g !== "string" || g.trim().length === 0) continue;
      const r = await execFileCapture(findBashExecutable(), ["scripts/ias", "add-gap", g.trim()], { cwd: repoRoot });
      if (r.code !== 0) {
        throw new Error(`failed to record gap: ${r.stderr || r.stdout}`);
      }
    }
  }
}

async function runJobWithSdk(repoRoot, runDir, job, cfg, jobDir) {
  const { Codex } = await loadCodexSdk();
  const policy = rolePolicy(job.role, job.mode);
  const reentry = await buildReentryPacket(repoRoot, runDir);
  const prompt = buildJobPrompt(job, reentry);

  await ensureDir(jobDir);
  await fs.writeFile(path.join(jobDir, "prompt.txt"), prompt, "utf8");

  const models = modelCandidates(cfg);
  let lastErr = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: repoRoot,
      model,
      sandboxMode: policy.sandboxMode,
      approvalPolicy: policy.approvalPolicy,
      networkAccessEnabled: policy.networkAccessEnabled,
      webSearchEnabled: policy.webSearchEnabled,
    });

    const eventsPath = path.join(jobDir, "events.jsonl");
    const eventsHandle = await fs.open(eventsPath, "w");

    let finalResponse = "";
    let usage = null;
    const items = [];
    let threadId = null;

    try {
      const { events } = await thread.runStreamed(prompt, { outputSchema: jobOutputSchema() });
      console.log(`job: stream started id=${job.id} model=${model}`);
      const startedAt = Date.now();
      let lastHeartbeatAtMs = startedAt;
      for await (const ev of events) {
        await eventsHandle.write(`${JSON.stringify(ev)}\n`);

        if (Date.now() - startedAt > cfg.maxTurnMs) {
          throw new Error(`turn exceeded maxTurnMs=${cfg.maxTurnMs}`);
        }
        if (Date.now() - lastHeartbeatAtMs > 15000) {
          const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
          console.log(`job: running id=${job.id} elapsed=${elapsedSec}s items=${items.length}`);
          lastHeartbeatAtMs = Date.now();
        }

        if (ev.type === "thread.started") {
          const maybe = ev.thread_id || ev.threadId;
          if (maybe) {
            threadId = maybe;
            await writeJson(path.join(jobDir, "thread.json"), { thread_id: maybe });
          }
        }
        if (ev.type === "item.completed" && ev.item) {
          items.push(ev.item);
          if (ev.item.type === "agent_message" && typeof ev.item.text === "string") {
            finalResponse = ev.item.text;
          }
        }
        if (ev.type === "turn.completed" && ev.usage) {
          usage = ev.usage;
        }
        if (ev.type === "turn.failed") {
          throw new Error(`turn failed: ${JSON.stringify(ev)}`);
        }
        if (ev.type === "error") {
          const msg =
            (typeof ev.error?.message === "string" && ev.error.message.trim().length > 0
              ? ev.error.message
              : null) ??
            (typeof ev.message === "string" && ev.message.trim().length > 0 ? ev.message : null) ??
            "";

          // Codex SDK may emit transient reconnect notifications as `error` events.
          // Treat these as non-fatal and continue streaming.
          if (/^reconnecting\b/i.test(msg) || /\bretry(ing)?\b/i.test(msg)) {
            continue;
          }

          throw new Error(`stream error: ${msg || JSON.stringify(ev)}`);
        }
      }

      await eventsHandle.close();
      await writeJson(path.join(jobDir, "items.json"), items);
      if (usage) await writeJson(path.join(jobDir, "usage.json"), usage);
      await fs.writeFile(path.join(jobDir, "final-response.txt"), finalResponse, "utf8");

      let parsed;
      try {
        parsed = JSON.parse(finalResponse);
      } catch (e) {
        throw new Error(`final response is not valid JSON: ${finalResponse.slice(0, 2000)}`);
      }

      return { parsed, threadId };
    } catch (e) {
      await eventsHandle.close();
      const msg = e instanceof Error ? e.stack || e.message : String(e);
      lastErr = e;
      const isModelErr = isLikelyModelErrorText(msg) || isLikelyModelErrorText(String(e?.cause ?? "")) || isLikelyModelErrorText(String(e));
      if (isModelErr && i < models.length - 1) {
        console.log(`job: model failed (id=${job.id} model=${model}): ${truncateForGitSubject(msg, 140)}`);
        console.log(`job: retrying with model=${models[i + 1]}`);
        continue;
      }
      throw e;
    }
  }

  throw lastErr ?? new Error("failed to run job: no model candidates");
}

async function cmdInit(repoRoot, runDir) {
  await ensureMinimalIas(repoRoot);
  await initRunner(repoRoot, runDir);
  const rel = path.relative(repoRoot, (await runnerPaths(repoRoot, path.basename(runDir))).base);
  if (UI?.format === "json") {
    UI.json({ ok: true, run: path.basename(runDir), runnerDir: rel });
    return;
  }
  UI?.success(`Initialized runner in ${rel}`);
}

async function buildStatusSnapshot(repoRoot, runDir) {
  const p = await initRunner(repoRoot, runDir);
  const jobDirEntries = await fs.readdir(p.jobs, { withFileTypes: true }).catch(() => []);
  const jobCount = jobDirEntries.filter((entry) => entry.isDirectory()).length;
  const lock = await readLockInfo(p.lockPath);
  const stopRequested = await fileExists(p.stopPath);
  return {
    ok: true,
    run: path.basename(runDir),
    lock,
    stopRequested,
    jobs: { completed: jobCount },
    runner: { base: path.relative(repoRoot, p.base) },
  };
}

function clearScreen() {
  process.stdout.write("\u001b[2J\u001b[H");
}

async function cmdStatus(repoRoot, runDir, flags) {
  const jsonMode = UI?.format === "json";
  const watch = Boolean(flags.watch);
  if (jsonMode) {
    UI?.json(await buildStatusSnapshot(repoRoot, runDir));
    return;
  }

  if (watch && !UI?.interactive) die("--watch requires a TTY");

  const renderOnce = async () => {
    const s = await buildStatusSnapshot(repoRoot, runDir);
    if (watch) clearScreen();
    UI?.header("IAS runner", `status (${s.run})`);
    UI?.table(
      [
        { key: "metric", header: "Metric" },
        { key: "value", header: "Value", align: "right" },
      ],
      [
        { metric: "completed jobs", value: s.jobs.completed },
        { metric: "stop requested", value: s.stopRequested ? "yes" : "no" },
      ],
    );
    if (s.lock) {
      const detail = `pid=${s.lock.pid ?? "?"} alive=${String(Boolean(s.lock.alive))} action=${s.lock.action ?? "?"}`;
      UI?.info(`Lock: ${detail}`);
    } else {
      UI?.info("Lock: none");
    }
    UI?.info(`Runner dir: ${s.runner.base}`);
  };

  if (!watch) {
    await renderOnce();
    return;
  }

  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopped) {
    await renderOnce();
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function cmdStop(repoRoot, runDir) {
  const p = await initRunner(repoRoot, runDir);
  await fs.writeFile(p.stopPath, `stop requested at ${new Date().toISOString()}\n`, "utf8");
  const rel = path.relative(repoRoot, p.stopPath);
  if (UI?.format === "json") {
    UI.json({ ok: true, stopFile: rel });
    return;
  }
  UI?.success(`Stop file written: ${rel}`);
}

async function cmdPrintPrompt(repoRoot, runDir, flags) {
  const jobId = flags.job;
  if (!jobId) die("missing --job <job-id>");
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  const startPath = path.join(p.jobs, String(jobId), "job-start.json");
  if (!(await fileExists(startPath))) die(`job not found in runner history: ${jobId}`);
  const start = await readJson(startPath);
  const job = start?.job;
  if (!job || typeof job !== "object") die(`job-start.json is missing job payload: ${startPath}`);
  const reentry = await buildReentryPacket(repoRoot, runDir);
  const prompt = buildJobPrompt(job, reentry);
  process.stdout.write(prompt);
  if (!prompt.endsWith("\n")) process.stdout.write("\n");
}

function startCpWorkerHeartbeat(cpSession, intervalMs = 15_000) {
  let stopped = false;
  const send = async () => {
    if (stopped) return;
    if (!cpSession?.cp || typeof cpSession.cp.upsertWorkerHeartbeat !== "function") return;
    try {
      await cpSession.cp.upsertWorkerHeartbeat({ workspaceId: cpSession.workspaceId, status: "online" });
    } catch (e) {
      console.warn(`[runner] heartbeat failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  void send();
  const timer = setInterval(() => void send(), intervalMs);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function startClaimedJobHeartbeatTimer({
  cpSession,
  claim,
  claimGeneration,
  leaseMs,
  message,
  onClaimGenerationMismatch,
}) {
  const heartbeatLeaseMs =
    typeof leaseMs === "number" && Number.isFinite(leaseMs) && leaseMs > 0 ? Math.floor(leaseMs) : 120_000;
  const intervalMs = 20_000;
  let stopped = false;
  let timer = null;
  const sendHeartbeat = async () => {
    if (stopped) return;
    try {
      await cpSession.cp.heartbeatJob({
        ...claimedCompletionBase(cpSession, claim, claimGeneration),
        leaseMs: heartbeatLeaseMs,
        message,
      });
    } catch (error) {
      if (isClaimGenerationMismatch(error)) {
        if (typeof onClaimGenerationMismatch === "function") onClaimGenerationMismatch(error);
        stopped = true;
        if (timer) clearInterval(timer);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[runner] heartbeat failed (will retry): ${msg}`);
    }
  };

  void sendHeartbeat();
  timer = setInterval(() => void sendHeartbeat(), intervalMs);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function cmdCpWorkerHeartbeat(repoRoot, flags) {
  const status = flags.status ? String(flags.status) : "online";
  if (!["online", "offline", "draining"].includes(status)) {
    die("invalid --status <online|offline|draining>");
  }
  const configPath = flags.cp_config ? String(flags.cp_config) : defaultWorkerConfigPath();
  const { openControlPlaneSession } = await loadControlPlaneOps();
  const res = await openControlPlaneSession({ configPath, status });
  console.log(JSON.stringify({ ok: true, workspaceId: res.workspaceId, workerId: res.workerId }, null, 2));
}

async function cmdCpListJobs(repoRoot, flags) {
  const configPath = flags.cp_config ? String(flags.cp_config) : defaultWorkerConfigPath();
  const status = flags.status ? String(flags.status) : undefined;
  const { openControlPlaneSession } = await loadControlPlaneOps();
  const res = await openControlPlaneSession({ configPath, status: "online" });
  const jobs = await res.cp.listJobs({ workspaceId: res.workspaceId, status });
  console.log(JSON.stringify({ ok: true, jobs }, null, 2));
}

async function cmdCpOpenapiUrl(repoRoot, flags) {
  const configPath = flags.cp_config ? String(flags.cp_config) : defaultWorkerConfigPath();
  const cfgText = await fs.readFile(configPath, "utf8");
  const cfg = JSON.parse(cfgText);
  const site = convexSiteBaseUrlFromDeploymentUrl(cfg?.controlPlane?.convexDeploymentUrl);
  if (!site) die("unable to derive Convex site URL; set controlPlane.convexDeploymentUrl to https://<deployment>.convex.cloud");
  console.log(
    JSON.stringify(
      {
        ok: true,
        convexSiteBaseUrl: site,
        healthUrl: `${site}/control-plane/health`,
        openapiUrl: `${site}/control-plane/openapi.json`,
      },
      null,
      2,
    ),
  );
}

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
      writeRequired: true,
      networkRequired: false, // screenshots target localhost — make configurable if remote URLs needed later
    },
    priority: typeof args.priority === "number" && Number.isFinite(args.priority) ? args.priority : 50,
  });
}

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

async function executeClaimedControlPlaneWorkJob({ repoRoot, runDir, cpSession, claim, job, leaseMs, configPath }) {
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
    await complete({
      outcome: "blocked",
      outcomeReason,
      message: outcomeReason.summary,
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

async function executeClaimedControlPlanePrReviewJob({ repoRoot, runDir, cpSession, claim, job, leaseMs, configPath }) {
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

async function cmdCpRunOnce(repoRoot, runDir, flags) {
  const configPath = flags.cp_config ? String(flags.cp_config) : defaultWorkerConfigPath();
  const leaseMsRaw = flags.lease_ms ? Number(flags.lease_ms) : undefined;
  const leaseMs = leaseMsRaw === undefined ? undefined : Number.isFinite(leaseMsRaw) ? leaseMsRaw : die("invalid --lease-ms <ms>");

  await runStartupRecovery(repoRoot, "cp-run-once");

  const { openControlPlaneSession } = await loadControlPlaneOps();
  const cpSession = await openControlPlaneSession({ configPath, status: "online" });

  const stopWorkerHeartbeat = startCpWorkerHeartbeat(cpSession);

  const claim = await cpSession.cp.claimNextJob({
    workspaceId: cpSession.workspaceId,
    workerId: cpSession.workerId,
    leaseMs,
  });

  if (!claim?.jobId || !claim?.job) {
    stopWorkerHeartbeat();
    console.log(JSON.stringify({ ok: true, claimed: false, jobId: null, job: null }, null, 2));
    return;
  }

  const claimGeneration = normalizeClaimGeneration(claim?.claimGeneration);
  const job = claim.job;
  if (job.kind !== "work" && job.kind !== "pr_review") {
    await completeClaimedJob(cpSession, claim, claimGeneration, {
      outcome: "blocked",
      message: `runner only supports kind=work|pr_review (got ${job.kind}); use scripts/ias-worker for cli jobs`,
    });
    stopWorkerHeartbeat();
    console.log(JSON.stringify({ ok: false, claimed: true, jobId: claim.jobId, outcome: "blocked" }, null, 2));
    return;
  }

  const resolved = await resolveRunDirForControlPlaneJob(repoRoot, cpSession, job);
  if (!resolved.runDir || !resolved.runRef) {
    await completeClaimedJob(cpSession, claim, claimGeneration, {
      outcome: "blocked",
      message: "work jobs must include a valid runId that resolves to a local docs/ias/runs/<runRef> directory",
    });
    stopWorkerHeartbeat();
    console.log(JSON.stringify({ ok: false, claimed: true, jobId: claim.jobId, outcome: "blocked" }, null, 2));
    return;
  }
  if (path.basename(runDir) !== resolved.runRef) {
    await completeClaimedJob(cpSession, claim, claimGeneration, {
      outcome: "blocked",
      message: `job targets runRef=${resolved.runRef} but runner invoked with ${path.basename(runDir)}; use cp-run-loop or pass the matching --run`,
    });
    stopWorkerHeartbeat();
    console.log(JSON.stringify({ ok: false, claimed: true, jobId: claim.jobId, outcome: "blocked" }, null, 2));
    return;
  }
  if (!(await fileExists(resolved.runDir))) {
    await completeClaimedJob(cpSession, claim, claimGeneration, {
      outcome: "blocked",
      message: `run directory not found locally: ${resolved.runDir}`,
    });
    stopWorkerHeartbeat();
    console.log(JSON.stringify({ ok: false, claimed: true, jobId: claim.jobId, outcome: "blocked" }, null, 2));
    return;
  }

  const out =
    job.kind === "work"
      ? await executeClaimedControlPlaneWorkJob({
          repoRoot,
          runDir,
          cpSession,
          claim,
          job,
          leaseMs,
          configPath,
        })
      : await executeClaimedControlPlanePrReviewJob({
          repoRoot,
          runDir,
          cpSession,
          claim,
          job,
          leaseMs,
          configPath,
        });

  stopWorkerHeartbeat();
  console.log(JSON.stringify({ ok: true, claimed: true, jobId: claim.jobId, ...out }, null, 2));
}

async function cmdCpRunLoop(repoRoot, flags) {
  const configPath = flags.cp_config ? String(flags.cp_config) : defaultWorkerConfigPath();
  const idleMsRaw = flags.idle_ms ? Number(flags.idle_ms) : 2000;
  if (!Number.isFinite(idleMsRaw) || idleMsRaw < 0) die("invalid --idle-ms <ms>");
  const idleMs = idleMsRaw;

  const leaseMsRaw = flags.lease_ms ? Number(flags.lease_ms) : undefined;
  let leaseMs = undefined;
  if (leaseMsRaw !== undefined) {
    if (!Number.isFinite(leaseMsRaw)) die("invalid --lease-ms <ms>");
    leaseMs = leaseMsRaw;
  }

  await validateRunnerStartup(repoRoot, configPath);
  await runStartupRecovery(repoRoot, "cp-run-loop");
  const stopPidLifecycle = startRunnerPidLifecycle(repoRoot);
  const { openControlPlaneSession } = await loadControlPlaneOps();
  const cpSession = await openControlPlaneSession({ configPath, status: "online" });
  const stopWorkerHeartbeat = startCpWorkerHeartbeat(cpSession);
  // ---------------------------------------------------------------------------
  // Register handlers for the unified claim-dispatch loop (LUC-9).
  // Uses the shared execution-handlers module (LUC-57).
  // ---------------------------------------------------------------------------
  const { buildWorkHandler, buildPrReviewHandler } = await import("./src/execution-handlers.mjs");

  const runnerHandlers = new Map();

  const executionDeps = {
    session: cpSession,
    configPath,
    leaseMs,
    maxMessageLen: 500,
    runnerApi: {
      cmdRunOnce,
      initRunner,
      loadControlPlaneOps,
      fileExists,
      realpathOrResolved,
      readJson,
      gitRev,
      gitPorcelain,
      gitDiffNames,
      gitDiffNamesBestEffort,
      resolveBaseBranchName,
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
      extractChainChunk,
      workPromptRequestsPrReview,
      execFileCapture,
    },
  };

  runnerHandlers.set("work", buildWorkHandler(executionDeps));
  runnerHandlers.set("pr_review", buildPrReviewHandler(executionDeps));

  // Build a synthetic resolved map so the shared loop can resolve repoRoot.
  // The runner operates on a single repoRoot; map all repo IDs to it via a
  // Proxy that returns repoRoot for any key.
  const resolvedForRunner = {
    repoRootByRepoId: new Proxy(new Map(), {
      get(target, prop) {
        if (prop === "get") return () => repoRoot;
        if (prop === "has") return () => true;
        return Reflect.get(target, prop);
      },
    }),
    mappingByRepoId: new Map(),
    reposAllowed: [],
  };

  try {
    await runClaimDispatchLoop({
      session: cpSession,
      cfg: {},
      resolved: resolvedForRunner,
      handlers: runnerHandlers,
      intervalMs: idleMs,
      leaseMs,
      stopWhenIdle: Boolean(flags.stop_when_idle),
      // The runner cannot determine managed status from local inspection alone
      // (verification requires control-plane data — see LUC-7 / repo.mts).
      // Return null to skip local gating; the control plane gates jobs before
      // dispatching them to runners.
      resolveCapabilityState: () => null,
      logPrefix: "[runner]",
    });
  } finally {
    stopWorkerHeartbeat();
    stopPidLifecycle();
  }
}

async function cmdRunOnce(repoRoot, runDir, opts = {}) {
  await ensureMinimalIas(repoRoot);
  await initRunner(repoRoot, runDir);
  const p = await runnerPaths(repoRoot, path.basename(runDir));
  const requestedJob = opts?.job && typeof opts.job === "object" ? cloneJson(opts.job) : null;
  if (!requestedJob) return { status: "idle" };
  const job = requestedJob;
  const jobIdRaw = String(job?.id ?? "").trim();
  const jobId = jobIdRaw || `job-${Date.now()}`;
  job.id = jobId;

  if (await fileExists(p.stopPath)) return { status: "stop", jobId };

  const lock = await acquireLock(p.lockPath);
  const ownsLock = lock.action !== "already-held";
  const cleanup = async () => {
    await releaseActiveRepoLock();
    if (!ownsLock) return;
    await releaseLock(p.lockPath);
  };
  if (ownsLock) {
    process.once("SIGINT", () => cleanup().finally(() => process.exit(130)));
    process.once("SIGTERM", () => cleanup().finally(() => process.exit(143)));
  }
  const jobDir = path.join(p.jobs, jobId);

  const cfgFromDisk = await readJson(p.configPath);
  const cfg =
    typeof opts.cfgMutator === "function"
      ? (opts.cfgMutator(cfgFromDisk) ?? cfgFromDisk)
      : cfgFromDisk;

  if (jobRequiresRepoLock(job) && !opts.skipRepoLock) {
    const owner = repoLockOwnerForProcess();
    const lockRes = await acquireRepoLock(repoRoot, { ttlMs: repoLockTtlMs(cfg), owner });

    if (!lockRes.ok) {
      const behavior = String(opts.repoLockBehavior ?? "requeue");
      const msg = `repo is locked: ${repoRoot}`;
      if (behavior === "requeue") {
        await cleanup();
        return { status: "repo_lock_busy", jobId };
      }

      await writeJobOutcome(repoRoot, runDir, jobId, "failed", msg);
      await cleanup();
      return { status: "repo_lock_busy", jobId };
    }

    activeRepoLockCleanup = async () => {
      const rel = await releaseRepoLock(repoRoot, { owner }).catch(() => null);
      if (rel && rel.ok && rel.released) return;
    };
  }

  // Ensure we're on the correct branch for this job (run branch or per-job override).
  try {
    await ensureBranchForJob(repoRoot, runDir, cfg, job);
  } catch (e) {
    // Branch overrides must be honored; otherwise we risk committing fixes to the wrong PR branch.
    if (jobBranchOverride(job) || extractPrFixHeadBranch(job) || extractPrReviewHeadBranch(job)) throw e;
    console.warn(`[runner] branch switch failed, continuing on current branch: ${e instanceof Error ? e.message : String(e)}`);
  }
  const startedAt = new Date().toISOString();
  const runName = path.basename(runDir);
  const runStatePath = path.join(repoRoot, "docs/ias/runs", runName, "run-state.md");
  const runStateMtimeMsAtStart = (await (async () => {
    try {
      return (await fs.stat(runStatePath)).mtimeMs;
    } catch (e) {
      if (e?.code !== "ENOENT") {
        console.warn(`[runner] failed to stat run-state at start (${runStatePath}): ${e instanceof Error ? e.message : String(e)}`);
      }
      return null;
    }
  })()) ?? null;
  await ensureDir(jobDir);
  await writeJson(path.join(jobDir, "job-start.json"), {
    startedAt,
    job,
    runState: {
      path: path.relative(repoRoot, runStatePath),
      mtimeMsAtStart: runStateMtimeMsAtStart,
    },
  });

  try {
    const { parsed: result, threadId } = await runJobWithSdk(repoRoot, runDir, job, cfg, jobDir);
    await createDecisionsAndGaps(repoRoot, result);

    const onNextJob = typeof opts.onNextJob === "function" ? opts.onNextJob : null;
    const warn = (message) => {
      if (UI?.format === "json") return;
      if (UI?.warn) UI.warn(message);
      else console.log(message);
    };

    await processNextJobs(result.next_jobs ?? [], {
      dispatch: async (nextJob) => {
        if (onNextJob) {
          await onNextJob(nextJob);
        } else {
          warn(`next_job skipped (local queue removed): role=${String(nextJob?.role ?? "unknown")}`);
        }
      },
      onWarn: warn,
    });

    // Capture run-state mtime at the end of the job so `check` remains stable even if humans
    // edit run-state later (mtime-based checks would otherwise become non-deterministic).
    const runStateMtimeMsAtEnd = (await (async () => {
      try {
        return (await fs.stat(runStatePath)).mtimeMs;
      } catch (e) {
        if (e?.code !== "ENOENT") {
          console.warn(`[runner] failed to stat run-state at end (${runStatePath}): ${e instanceof Error ? e.message : String(e)}`);
        }
        return null;
      }
    })()) ?? null;
    await writeJson(path.join(jobDir, "run-state-observation.json"), {
      runStatePath: path.relative(repoRoot, runStatePath),
      mtimeMsAtStart: runStateMtimeMsAtStart,
      mtimeMsAtEnd: runStateMtimeMsAtEnd,
      observedAt: new Date().toISOString(),
    });

    await writeJobOutcome(repoRoot, runDir, jobId, "ok", result);
    await writeJson(p.statePath, {
      ...(await readJson(p.statePath)),
      lastUpdated: new Date().toISOString(),
      lastJobId: jobId,
      lastThreadId: threadId ?? null,
    });

    try {
      await persistReviewReport(repoRoot, runDir, job, result, jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`review: persist failed (job=${jobId}): ${truncateForGitSubject(msg, 160)}`);
    }

    // Best-effort: post the IAS review as a GitHub PR review so branch protections can pass.
    try {
      await maybeSubmitGitHubPrReviewFromReviewJob(repoRoot, runDir, cfg, job, result, jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`review: gh submit failed (job=${jobId}): ${truncateForGitSubject(msg, 160)}`);
    }

    try {
      await gitAutoCommitAndPush(repoRoot, runDir, job, result, cfg, jobId);
    } catch (e) {
      console.warn(`[runner] git auto-commit/push failed (job=${jobId}): ${e instanceof Error ? e.message : String(e)}`);
    }

    await cleanup();
    return { status: "ok", jobId, result };
  } catch (e) {
    const errorText = e instanceof Error ? e.stack || e.message : String(e);
    await writeJobOutcome(repoRoot, runDir, jobId, "failed", errorText);
    await cleanup();
    return { status: "failed", jobId };
  }
}

async function cmdCheck(repoRoot, runDir) {
  await ensureMinimalIas(repoRoot);
  const p = await initRunner(repoRoot, runDir);
  const cfg = await readJson(p.configPath);
  const jsonMode = UI?.format === "json";

  const runName = path.basename(runDir);
  const runStatePath = path.join(repoRoot, "docs/ias/runs", runName, "run-state.md");
  if (!(await fileExists(runStatePath))) die(`missing run-state: ${runStatePath}`);

  const skewMs = Number(cfg?.checks?.runStateSkewMs ?? 2000);
  const enforce = Boolean(cfg?.checks?.runStateRequiredAfterWriteJob ?? true);

  const jobsRoot = p.jobs;
  if (!(await fileExists(jobsRoot))) {
    if (jsonMode) UI?.json({ ok: true, run: runName, status: "no_jobs" });
    else UI?.success("No runner jobs yet");
    return;
  }

  const jobDirents = await fs.readdir(jobsRoot, { withFileTypes: true });
  const jobDirs = jobDirents
    .filter((d) => d.isDirectory())
    .map((d) => path.join(jobsRoot, d.name))
    .sort();

  const violations = [];
  for (const jobDir of jobDirs) {
    const metaPath = path.join(jobDir, "result-meta.json");
    const startPath = path.join(jobDir, "job-start.json");
    if (!(await fileExists(metaPath)) || !(await fileExists(startPath))) continue;

    const meta = await readJson(metaPath);
    if (meta.status !== "ok") continue;

    const start = await readJson(startPath);
    const startedAtMs = Number(Date.parse(start?.startedAt ?? ""));
    const role = start?.job?.role;
    const mode = start?.job?.mode ?? {};
    const writeRole = role === "orchestrator" || role === "implementer" || role === "test-runner";
    const writeFlag = Boolean(mode?.write);
    const requiresRunState = enforce && (writeRole || writeFlag);
    if (!requiresRunState) continue;

    const finishedAtMs = Number(meta.finishedAtMs ?? Date.parse(meta.finishedAt));
    if (!Number.isFinite(finishedAtMs)) continue;
    if (!Number.isFinite(startedAtMs)) continue;

    const obsPath = path.join(jobDir, "run-state-observation.json");
    const observed = (await fileExists(obsPath)) ? await readJson(obsPath) : null;
    const observedMtimeMs = Number(observed?.mtimeMsAtEnd ?? NaN);
    const observedStartMtimeMs = Number(observed?.mtimeMsAtStart ?? NaN);

    const hasObservation = Number.isFinite(observedMtimeMs);
    // Prefer the captured mtime at job end; fall back to current mtime for legacy jobs.
    const effectiveMtimeMs = hasObservation ? observedMtimeMs : (await fs.stat(runStatePath)).mtimeMs;

    // For legacy jobs (no observation file), we can only assert that run-state was updated
    // at some point after the job started. This keeps `check` stable across manual edits.
    const withinJob = hasObservation
      ? effectiveMtimeMs + skewMs >= startedAtMs && effectiveMtimeMs - skewMs <= finishedAtMs
      : effectiveMtimeMs + skewMs >= startedAtMs;
    const changedDuringJob =
      Number.isFinite(observedMtimeMs) && Number.isFinite(observedStartMtimeMs)
        ? Math.abs(observedMtimeMs - observedStartMtimeMs) > 0
        : true;
    if (!withinJob) {
      violations.push({
        job: path.basename(jobDir),
        finishedAt: meta.finishedAt,
        startedAt: start?.startedAt,
        runStateMtimeMs: effectiveMtimeMs,
        runStateObserved: hasObservation,
      });
      continue;
    }
    if (!changedDuringJob) {
      violations.push({
        job: path.basename(jobDir),
        finishedAt: meta.finishedAt,
        startedAt: start?.startedAt,
        runStateMtimeMs: effectiveMtimeMs,
        runStateObserved: true,
      });
    }
  }

  if (violations.length > 0) {
    if (jsonMode) {
      UI?.json({
        ok: false,
        run: runName,
        error: "run-state.md was not updated during write job(s)",
        violations,
        fix: `update docs/ias/runs/${path.basename(runDir)}/run-state.md in a follow-up orchestrator job, then re-run: node scripts/ias-runner/run.mjs check --latest`,
      });
    } else {
      UI?.error("run-state.md was not updated during write job(s)");
      for (const v of violations) {
        process.stderr.write(`- job=${v.job} startedAt=${v.startedAt} finishedAt=${v.finishedAt}\n`);
      }
      process.stderr.write(
        `Fix: update docs/ias/runs/${path.basename(runDir)}/run-state.md in a follow-up orchestrator job, then re-run: node scripts/ias-runner/run.mjs check --latest\n`,
      );
    }
    process.exitCode = 2;
    return;
  }

  if (jsonMode) UI?.json({ ok: true, run: runName, status: "ok" });
  else UI?.success("Runner checks passed");
}

// ---------------------------------------------------------------------------
// Exports for execution-handlers.mjs (LUC-57).
// ---------------------------------------------------------------------------
export {
  cmdRunOnce,
  initRunner,
  runnerPaths,
  ensureMinimalIas,
  loadCodexSdk,
  loadControlPlaneOps,
  resolveGitDirCached,
  fileExists,
  realpathOrResolved,
  readJson,
  writeJson,
  ensureDir,
  gitRev,
  gitPorcelain,
  gitDiffNames,
  gitDiffNamesBestEffort,
  resolveBaseBranchName,
  normalizeClaimGeneration,
  isClaimGenerationMismatch,
  claimedCompletionBase,
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
  extractChainChunk,
  workPromptRequestsPrReview,
  defaultWorkerConfigPath,
  execFileCapture,
};

async function main() {
  const rawArgs = process.argv.slice(2);
  UI = createUi({
    argv: rawArgs,
    env: process.env,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  });
  const { argv } = parseCommonCliOptions(rawArgs, process.env);
  const { cmd, flags } = parseArgs(argv);
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    usage();
    return;
  }

  const repoRootCandidate = process.env.IAS_REPO_ROOT ? path.resolve(String(process.env.IAS_REPO_ROOT)) : DEFAULT_IAS_ROOT;
  const gitRoot = await gitTopLevel(repoRootCandidate);
  if (!gitRoot) die(`must run inside a git repository (repoRoot=${repoRootCandidate})`);
  const repoRoot = gitRoot;

  if (cmd === "cp-worker-heartbeat") return await cmdCpWorkerHeartbeat(repoRoot, flags);
  if (cmd === "cp-list-jobs") return await cmdCpListJobs(repoRoot, flags);
  if (cmd === "cp-openapi-url") return await cmdCpOpenapiUrl(repoRoot, flags);
  if (cmd === "cp-run-loop") return await cmdCpRunLoop(repoRoot, flags);

  const runDir = await resolveRunDir(repoRoot, flags);
  if (cmd === "init") return await cmdInit(repoRoot, runDir);
  if (cmd === "check") return await cmdCheck(repoRoot, runDir);
  if (cmd === "status") return await cmdStatus(repoRoot, runDir, flags);
  if (cmd === "stop") return await cmdStop(repoRoot, runDir);
  if (cmd === "print-prompt") return await cmdPrintPrompt(repoRoot, runDir, flags);
  if (cmd === "cp-run-once") return await cmdCpRunOnce(repoRoot, runDir, flags);
  if (cmd === "resume")
    return await cmdResume(runDir, flags, {
      ui: UI,
      runOnce: () => cmdCpRunOnce(repoRoot, runDir, flags),
    });
  if (cmd === "review-assumptions") return await cmdReviewAssumptions(runDir, flags, { ui: UI });

  usage();
  die(`unknown command: ${cmd}`);
}

const __isDirectlyRun = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
);
if (__isDirectlyRun) {
  try {
    await main();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    die(msg);
  }
}
