import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import fs from "node:fs/promises";
import { getAuthEntry } from "./auth-store.mjs";
import { assertOkControlPlaneResponse, ControlPlaneHttpError } from "./control-plane-errors.mjs";
import { makeClaimNextJobRequest, makeCompleteJobRequest, makeEnqueueJobRequest, makeHeartbeatJobRequest, makeListJobsRequest, makeResolveWorkspaceRequest, makeUpsertWorkerHeartbeatRequest, } from "../../ias-shared/dist/control-plane-requests.mjs";
import { parseClaimNextJobResponse, parseCompleteJobResponse, parseEnqueueJobResponse, parseListJobsResponse, parseResolveWorkspaceResponse, parseUpsertWorkerHeartbeatResponse, } from "../../ias-shared/dist/control-plane-responses.mjs";
import { fetchJson, HttpNetworkError, HttpTimeoutError } from "./http.mjs";
function normalizeConvexId(value) {
    const s = String(value ?? "").trim();
    if (!s)
        return null;
    const m = s.match(/^[a-zA-Z_][a-zA-Z0-9_]*\/(?<id>.+)$/);
    return (m?.groups?.id ? String(m.groups.id) : s).trim();
}
function machineFingerprint(cfg) {
    const configured = cfg?.worker?.machineFingerprint ? String(cfg.worker.machineFingerprint).trim() : "";
    const basis = configured || `${os.hostname()}|${process.env.USER || "unknown"}`;
    return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}
function reposAllowedFromConfig(cfg) {
    const mappings = Array.isArray(cfg?.repos?.mappings) ? cfg.repos.mappings : [];
    const ids = mappings
        .map((m) => (m && typeof m === "object" && m.repoId ? normalizeConvexId(m.repoId) : null))
        .filter(Boolean);
    // Safety default: claim nothing unless an explicit repo allowlist exists.
    return ids;
}
function normalizeClaimGeneration(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
function parseClaimNextJobResponseWithGeneration(value) {
    const parsed = parseClaimNextJobResponse(value);
    return {
        ...parsed,
        claimGeneration: normalizeClaimGeneration(value?.claimGeneration),
    };
}
function makeHeartbeatJobRequestWithGeneration(payload) {
    const out = makeHeartbeatJobRequest(payload);
    const claimGeneration = payload?.claimGeneration;
    if (claimGeneration !== undefined)
        out.claimGeneration = normalizeClaimGeneration(claimGeneration);
    return out;
}
function makeCompleteJobRequestWithGeneration(payload) {
    const out = makeCompleteJobRequest(payload);
    const claimGeneration = payload?.claimGeneration;
    if (claimGeneration !== undefined)
        out.claimGeneration = normalizeClaimGeneration(claimGeneration);
    return out;
}
function makeCompleteJobAndEnqueueChildrenRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const base = makeCompleteJobRequestWithGeneration(p);
    const out = { ...base };
    if (p.idempotencyKey !== undefined)
        out.idempotencyKey = String(p.idempotencyKey);
    if (Array.isArray(p.children))
        out.children = p.children;
    return out;
}
function parseCompleteJobAndEnqueueChildrenResponse(value) {
    const parsed = parseCompleteJobResponse(value);
    const result = parsed?.result && typeof parsed.result === "object" ? parsed.result : {};
    const childIdsRaw = Array.isArray(result.spawnedJobIds) ? result.spawnedJobIds : [];
    const childJobIds = childIdsRaw.map((id) => normalizeConvexId(id) ?? String(id)).filter(Boolean);
    return { ...parsed, childJobIds };
}
export function repoRootForJob(cfg, job) {
    const repoId = normalizeConvexId(job.repoId);
    if (!repoId)
        return null;
    const mappings = Array.isArray(cfg?.repos?.mappings) ? cfg.repos.mappings : [];
    for (const m of mappings) {
        if (!m || typeof m !== "object")
            continue;
        const mappedId = m.repoId ? normalizeConvexId(m.repoId) : null;
        if (mappedId && mappedId === repoId)
            return path.resolve(String(m.localPath));
    }
    return null;
}
export async function loadWorkerConfig(configPath) {
    const text = await fs.readFile(configPath, "utf8");
    return JSON.parse(text);
}
function convexSiteBaseUrlFromDeploymentUrl(convexDeploymentUrl) {
    const raw = String(convexDeploymentUrl ?? "").trim().replace(/\/+$/, "");
    if (!raw)
        return null;
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\b/i.test(raw))
        return raw;
    if (raw.includes(".convex.site"))
        return raw;
    if (raw.includes(".convex.cloud"))
        return raw.replace(/\.convex\.cloud\b/, ".convex.site");
    return null;
}
async function hasHttpControlPlane(cfg) {
    const token = cfg?.controlPlane?.httpServiceToken ? String(cfg.controlPlane.httpServiceToken).trim() : "";
    if (token && token !== "TODO")
        return true;
    const dep = String(cfg?.controlPlane?.convexDeploymentUrl ?? "").trim();
    const slug = String(cfg?.controlPlane?.workspaceSlug ?? "").trim();
    if (!dep || dep === "TODO" || !slug || slug === "TODO")
        return false;
    const entry = await getAuthEntry({ convexDeploymentUrl: dep, workspaceSlug: slug });
    return Boolean(entry?.token);
}
async function resolveHttpBearerToken(cfg) {
    const token = cfg?.controlPlane?.httpServiceToken ? String(cfg.controlPlane.httpServiceToken).trim() : "";
    if (token && token !== "TODO")
        return token;
    const dep = String(cfg?.controlPlane?.convexDeploymentUrl ?? "").trim();
    const slug = String(cfg?.controlPlane?.workspaceSlug ?? "").trim();
    if (!dep || dep === "TODO" || !slug || slug === "TODO") {
        throw new Error("missing controlPlane.convexDeploymentUrl and/or controlPlane.workspaceSlug");
    }
    const entry = await getAuthEntry({ convexDeploymentUrl: dep, workspaceSlug: slug });
    const stored = entry?.token ? String(entry.token).trim() : "";
    if (!stored) {
        throw new Error("missing control-plane auth token. Run: node scripts/ias-worker/run.mjs auth-login (or set controlPlane.httpServiceToken)");
    }
    return stored;
}
function requireWorkspaceSlug(cfg) {
    const slug = String(cfg?.controlPlane?.workspaceSlug ?? "").trim();
    if (!slug || slug === "TODO")
        throw new Error("missing controlPlane.workspaceSlug");
    return slug;
}
function requireSiteBaseUrl(cfg) {
    const site = convexSiteBaseUrlFromDeploymentUrl(cfg?.controlPlane?.convexDeploymentUrl);
    if (!site)
        throw new Error("missing/invalid controlPlane.convexDeploymentUrl (expected https://<deployment>.convex.cloud)");
    return site;
}
async function resolveWorkspaceIdForConfig(cfg, workspaceSlug) {
    const serviceToken = cfg?.controlPlane?.httpServiceToken ? String(cfg.controlPlane.httpServiceToken).trim() : "";
    if (serviceToken && serviceToken !== "TODO") {
        const out = await postJson(cfg, "/control-plane/v1/workspaces/resolve", makeResolveWorkspaceRequest({ slug: workspaceSlug }));
        const parsed = parseResolveWorkspaceResponse(out);
        const workspaceId = parsed.workspaceId ? normalizeConvexId(parsed.workspaceId) : null;
        if (!workspaceId)
            throw new Error(`workspace not found for slug: ${workspaceSlug}`);
        return workspaceId;
    }
    const dep = String(cfg?.controlPlane?.convexDeploymentUrl ?? "").trim();
    const entry = await getAuthEntry({ convexDeploymentUrl: dep, workspaceSlug });
    const workspaceId = entry?.workspaceId ? normalizeConvexId(entry.workspaceId) : null;
    if (!workspaceId) {
        throw new Error("missing stored workspaceId for this login. Re-run: node scripts/ias-worker/run.mjs auth-login (or set controlPlane.httpServiceToken)");
    }
    return workspaceId;
}
async function postJson(cfg, routePath, payload) {
    const site = requireSiteBaseUrl(cfg);
    const token = await resolveHttpBearerToken(cfg);
    const url = `${site}${routePath.startsWith("/") ? "" : "/"}${routePath}`;
    try {
        const res = await fetchJson({
            url,
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            body: payload ?? {},
            timeoutMs: 15_000,
        });
        if (!res.ok) {
            const code = res.json?.error ? String(res.json.error) : `HTTP_${res.status}`;
            throw new ControlPlaneHttpError({
                status: res.status,
                code,
                message: `control-plane HTTP ${res.status}: ${code}`,
                responseBody: res.json,
            });
        }
        assertOkControlPlaneResponse({ status: res.status, body: res.json });
        return res.json;
    }
    catch (e) {
        if (e instanceof HttpTimeoutError) {
            throw new ControlPlaneHttpError({ status: 0, code: "TIMEOUT", message: "control-plane HTTP request timed out", responseBody: null });
        }
        if (e instanceof HttpNetworkError) {
            throw new ControlPlaneHttpError({ status: 0, code: "NETWORK_ERROR", message: "control-plane HTTP network error", responseBody: null });
        }
        throw e;
    }
}
function createHttpControlPlaneClient(cfg) {
    return {
        async resolveWorkspaceIdBySlug(slug) {
            const out = await postJson(cfg, "/control-plane/v1/workspaces/resolve", makeResolveWorkspaceRequest({ slug }));
            const parsed = parseResolveWorkspaceResponse(out);
            const workspaceId = parsed.workspaceId ? normalizeConvexId(parsed.workspaceId) : null;
            if (!workspaceId)
                throw new Error(`workspace not found for slug: ${slug}`);
            return workspaceId;
        },
        async upsertWorkerHeartbeat(payload) {
            const out = await postJson(cfg, "/control-plane/v1/workers/heartbeat", makeUpsertWorkerHeartbeatRequest(payload));
            const parsed = parseUpsertWorkerHeartbeatResponse(out);
            return normalizeConvexId(parsed.workerId) ?? parsed.workerId ?? null;
        },
        async listJobs(payload) {
            const out = await postJson(cfg, "/control-plane/v1/jobs/list", makeListJobsRequest(payload));
            return parseListJobsResponse(out);
        },
        async enqueueJob(payload) {
            const out = await postJson(cfg, "/control-plane/v1/jobs/enqueue", makeEnqueueJobRequest(payload));
            return parseEnqueueJobResponse(out);
        },
        async claimNextJob(payload) {
            const out = await postJson(cfg, "/control-plane/v1/jobs/claim-next", makeClaimNextJobRequest(payload));
            return parseClaimNextJobResponseWithGeneration(out);
        },
        async heartbeatJob(payload) {
            return await postJson(cfg, "/control-plane/v1/jobs/heartbeat", makeHeartbeatJobRequestWithGeneration(payload));
        },
        async completeJob(payload) {
            const out = await postJson(cfg, "/control-plane/v1/jobs/complete", makeCompleteJobRequestWithGeneration(payload));
            return parseCompleteJobResponse(out);
        },
        async completeJobAndEnqueueChildren(payload) {
            const out = await postJson(cfg, "/control-plane/v1/jobs/complete-and-enqueue-children", makeCompleteJobAndEnqueueChildrenRequest(payload));
            return parseCompleteJobAndEnqueueChildrenResponse(out);
        },
    };
}
export async function openControlPlaneSession({ configPath, status = "online" }) {
    const cfg = await loadWorkerConfig(configPath);
    const displayName = String(cfg?.worker?.displayName ?? os.hostname());
    const fingerprint = machineFingerprint(cfg);
    const supportedEgressModesRaw = cfg?.capabilities?.supportedEgressModes;
    const supportedEgressModes = Array.isArray(supportedEgressModesRaw) ? supportedEgressModesRaw.map((m) => String(m)) : ["open"];
    const capabilities = {
        // Unified runtime: one local agent advertises all execution capabilities.
        executionModes: Array.isArray(cfg?.capabilities?.executionModes) ? cfg.capabilities.executionModes : ["cli", "hybrid"],
        models: Array.isArray(cfg?.capabilities?.models) ? cfg.capabilities.models : ["gpt-5.2"],
        canWrite: Boolean(cfg?.capabilities?.canWrite),
        canUseNetwork: Boolean(cfg?.capabilities?.canUseNetwork),
        reposAllowed: reposAllowedFromConfig(cfg),
        supportedEgressModes,
        enforcedAllowlistHash: cfg?.capabilities?.enforcedAllowlistHash ?? null,
        supportsRunTests: cfg?.capabilities?.supportsRunTests === undefined ? true : Boolean(cfg?.capabilities?.supportsRunTests),
        openaiAuthMode: cfg?.capabilities?.openaiAuthMode ?? "codex_cli_sso_supervised",
    };
    if (!(await hasHttpControlPlane(cfg))) {
        throw new Error("missing control-plane auth token. Run: node scripts/ias-worker/run.mjs auth-login (or set controlPlane.httpServiceToken)");
    }
    const httpCp = createHttpControlPlaneClient(cfg);
    const workspaceSlug = requireWorkspaceSlug(cfg);
    const workspaceId = await resolveWorkspaceIdForConfig(cfg, workspaceSlug);
    const upsertWorkerHeartbeat = async (nextStatus) => {
        return await httpCp.upsertWorkerHeartbeat({
            workspaceId,
            displayName,
            machineFingerprint: fingerprint,
            status: nextStatus,
            capabilities,
        });
    };
    const workerId = await upsertWorkerHeartbeat(status);
    if (!workerId)
        throw new Error("failed to upsert worker heartbeat");
    const cp = {
        mode: "http",
        upsertWorkerHeartbeat: async ({ workspaceId: wsId, status: nextStatus }) => {
            if (wsId !== workspaceId)
                throw new Error("workspace mismatch");
            return await upsertWorkerHeartbeat(nextStatus ?? "online");
        },
        listJobs: async ({ workspaceId, status }) => {
            const out = await httpCp.listJobs({ workspaceId, status });
            return out?.jobs ?? [];
        },
        enqueueJob: async (payload) => {
            const out = await httpCp.enqueueJob(payload);
            return out?.jobId ?? null;
        },
        claimNextJob: async (payload) => {
            return await httpCp.claimNextJob(payload);
        },
        heartbeatJob: async (payload) => {
            await httpCp.heartbeatJob(payload);
        },
        completeJob: async (payload) => {
            await httpCp.completeJob(payload);
        },
        completeJobAndEnqueueChildren: async (payload) => {
            return await httpCp.completeJobAndEnqueueChildren(payload);
        },
    };
    return { cfg, cp, workspaceId, workerId, displayName };
}
//# sourceMappingURL=control-plane-ops.mjs.map