function asRecord(value) {
    if (!value || typeof value !== "object")
        return null;
    if (Array.isArray(value))
        return null;
    return value;
}
export function parseClaimNextJobResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid claim-next response: expected object");
    if (rec.ok !== true)
        throw new Error(`claim-next response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const jobId = rec.jobId === null ? null : rec.jobId !== undefined ? String(rec.jobId) : undefined;
    const job = rec.job === null ? null : rec.job !== undefined ? asRecord(rec.job) : undefined;
    const reason = rec.reason === undefined ? undefined : rec.reason === null ? null : String(rec.reason);
    if (jobId === undefined)
        throw new Error("invalid claim-next response: missing jobId");
    if (job === undefined)
        throw new Error("invalid claim-next response: missing job");
    if (jobId === null) {
        if (job !== null)
            throw new Error("invalid claim-next response: job must be null when jobId is null");
        return { jobId: null, job: null, ...(reason !== undefined ? { reason } : {}) };
    }
    if (!job)
        throw new Error("invalid claim-next response: job must be object when jobId is set");
    const requiredJobFields = ["_id", "kind", "role", "prompt", "requirements", "repoId"];
    for (const key of requiredJobFields) {
        if (!(key in job))
            throw new Error(`invalid claim-next response: job missing ${key}`);
    }
    const requirements = asRecord(job.requirements);
    if (!requirements)
        throw new Error("invalid claim-next response: job.requirements must be object");
    return {
        jobId,
        job: {
            ...job,
            requirements,
        },
        ...(rec.claimGeneration !== undefined ? { claimGeneration: Number(rec.claimGeneration) } : {}),
    };
}
export function parseCompleteJobResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid complete-job response: expected object");
    if (rec.ok !== true)
        throw new Error(`complete-job response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const result = asRecord(rec.result);
    if (!result)
        throw new Error("invalid complete-job response: missing result object");
    return { ok: true, result };
}
export function parseCompleteJobAndEnqueueChildrenResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid complete-and-enqueue response: expected object");
    if (rec.ok !== true)
        throw new Error(`complete-and-enqueue response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const result = asRecord(rec.result);
    if (!result)
        throw new Error("invalid complete-and-enqueue response: missing result object");
    if (typeof result.idempotent !== "boolean")
        throw new Error("invalid complete-and-enqueue response: result.idempotent must be boolean");
    if (!Array.isArray(result.spawnedJobIds))
        throw new Error("invalid complete-and-enqueue response: result.spawnedJobIds must be an array");
    const idempotent = result.idempotent;
    const spawnedJobIds = result.spawnedJobIds.map(String);
    return { ok: true, idempotent, spawnedJobIds };
}
export function parseResolveWorkspaceResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid resolve-workspace response: expected object");
    if (rec.ok !== true)
        throw new Error(`resolve-workspace response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const workspaceId = rec.workspaceId === null ? null : rec.workspaceId !== undefined ? String(rec.workspaceId) : undefined;
    const workspace = rec.workspace === null ? null : rec.workspace !== undefined ? rec.workspace : undefined;
    if (workspaceId === undefined)
        throw new Error("invalid resolve-workspace response: missing workspaceId");
    if (workspace === undefined)
        throw new Error("invalid resolve-workspace response: missing workspace");
    return { workspaceId, workspace };
}
export function parseUpsertWorkerHeartbeatResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid agent heartbeat response: expected object");
    if (rec.ok !== true)
        throw new Error(`agent heartbeat response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const workerId = rec.workerId ? String(rec.workerId) : null;
    if (!workerId)
        throw new Error("invalid agent heartbeat response: missing workerId");
    return { workerId };
}
export function parseUpsertRepoResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid upsert repo response: expected object");
    if (rec.ok !== true)
        throw new Error(`upsert repo response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const repoId = rec.repoId ? String(rec.repoId) : null;
    if (!repoId)
        throw new Error("invalid upsert repo response: missing repoId");
    return { repoId };
}
export function parseResolveRepoByRemoteUrlHashResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid resolve repo response: expected object");
    if (rec.ok !== true)
        throw new Error(`resolve repo response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const repoId = rec.repoId === null ? null : rec.repoId !== undefined ? String(rec.repoId) : undefined;
    const repo = rec.repo === null ? null : rec.repo !== undefined ? rec.repo : undefined;
    if (repoId === undefined)
        throw new Error("invalid resolve repo response: missing repoId");
    if (repo === undefined)
        throw new Error("invalid resolve repo response: missing repo");
    return { repoId, repo };
}
export function parseGetRepoResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid get repo response: expected object");
    if (rec.ok !== true)
        throw new Error(`get repo response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    if (!("repo" in rec))
        throw new Error("invalid get repo response: missing repo");
    return { repo: rec.repo ?? null };
}
export function parseUpsertRunResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid upsert run response: expected object");
    if (rec.ok !== true)
        throw new Error(`upsert run response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const runId = rec.runId ? String(rec.runId) : null;
    if (!runId)
        throw new Error("invalid upsert run response: missing runId");
    return { runId };
}
export function parseGetUploadDownloadUrlResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid get upload download url response: expected object");
    if (rec.ok !== true)
        throw new Error(`get upload download url response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const downloadUrl = rec.downloadUrl ? String(rec.downloadUrl) : null;
    if (!downloadUrl)
        throw new Error("invalid get upload download url response: missing downloadUrl");
    return {
        downloadUrl,
        fileName: rec.fileName === undefined ? undefined : String(rec.fileName),
        contentType: rec.contentType === undefined ? undefined : rec.contentType === null ? null : String(rec.contentType),
        sizeBytes: rec.sizeBytes === undefined ? undefined : Number(rec.sizeBytes),
    };
}
export function parseListJobsResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid list jobs response: expected object");
    if (rec.ok !== true)
        throw new Error(`list jobs response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    if (!Array.isArray(rec.jobs))
        throw new Error("invalid list jobs response: jobs must be an array");
    return { jobs: rec.jobs };
}
export function parseEnqueueJobResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid enqueue job response: expected object");
    if (rec.ok !== true)
        throw new Error(`enqueue job response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const jobId = rec.jobId ? String(rec.jobId) : null;
    if (!jobId)
        throw new Error("invalid enqueue job response: missing jobId");
    return { jobId };
}
export function parseAddUncertaintyResolutionResponse(value) {
    const rec = asRecord(value);
    if (!rec)
        throw new Error("invalid add uncertainty resolution response: expected object");
    if (rec.ok !== true)
        throw new Error(`add uncertainty resolution response not ok: ${rec.error ? String(rec.error) : "unknown error"}`);
    const resolutionId = rec.resolutionId ? String(rec.resolutionId) : null;
    if (!resolutionId)
        throw new Error("invalid add uncertainty resolution response: missing resolutionId");
    return { resolutionId };
}
//# sourceMappingURL=control-plane-responses.mjs.map