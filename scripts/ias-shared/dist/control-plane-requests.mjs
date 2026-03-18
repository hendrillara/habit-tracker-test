export function makeClaimNextJobRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        workerId: p.workerId,
    };
    if (p.leaseMs !== undefined)
        out.leaseMs = p.leaseMs;
    return out;
}
export function makeHeartbeatJobRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        jobId: p.jobId,
        workerId: p.workerId,
    };
    if (p.leaseMs !== undefined)
        out.leaseMs = p.leaseMs;
    if (p.message !== undefined)
        out.message = p.message;
    if (p.claimGeneration !== undefined)
        out.claimGeneration = p.claimGeneration;
    return out;
}
export function makeCompleteJobRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        jobId: p.jobId,
        workerId: p.workerId,
        outcome: p.outcome,
    };
    if (p.runId !== undefined)
        out.runId = p.runId;
    if (p.message !== undefined)
        out.message = p.message;
    if (p.outcomeReason !== undefined)
        out.outcomeReason = p.outcomeReason;
    if (p.evidence !== undefined)
        out.evidence = p.evidence;
    if (p.claimGeneration !== undefined)
        out.claimGeneration = p.claimGeneration;
    return out;
}
export function makeCompleteJobAndEnqueueChildrenRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        jobId: p.jobId,
        workerId: p.workerId,
        claimGeneration: p.claimGeneration,
        idempotencyKey: p.idempotencyKey,
        outcome: p.outcome,
    };
    if (p.runId !== undefined)
        out.runId = p.runId;
    if (p.message !== undefined)
        out.message = p.message;
    if (p.outcomeReason !== undefined)
        out.outcomeReason = p.outcomeReason;
    if (p.evidence !== undefined)
        out.evidence = p.evidence;
    if (p.children !== undefined)
        out.children = p.children;
    return out;
}
export function makeListJobEventsForJobRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        jobId: p.jobId,
    };
    if (p.limit !== undefined)
        out.limit = p.limit;
    return out;
}
export function makeResolveWorkspaceRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    return { slug: p.slug };
}
export function makeUpsertWorkerHeartbeatRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        displayName: p.displayName,
        status: p.status,
        capabilities: p.capabilities,
    };
    if (p.machineFingerprint !== undefined)
        out.machineFingerprint = p.machineFingerprint;
    // Inventory fields (optional — older workers omit these)
    if (p.agentVersion !== undefined)
        out.agentVersion = p.agentVersion;
    if (p.platform !== undefined)
        out.platform = p.platform;
    if (p.arch !== undefined)
        out.arch = p.arch;
    if (p.nodeVersion !== undefined)
        out.nodeVersion = p.nodeVersion;
    if (p.configuredRepoIds !== undefined)
        out.configuredRepoIds = p.configuredRepoIds;
    if (p.effectivePolicyVersion !== undefined)
        out.effectivePolicyVersion = p.effectivePolicyVersion;
    return out;
}
export function makeUpsertRepoRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = { workspaceId: p.workspaceId, remoteUrlHash: p.remoteUrlHash, status: p.status };
    if (p.label !== undefined)
        out.label = p.label;
    return out;
}
export function makeResolveRepoByRemoteUrlHashRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    return { workspaceId: p.workspaceId, remoteUrlHash: p.remoteUrlHash };
}
export function makeGetRepoRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    return { workspaceId: p.workspaceId, repoId: p.repoId };
}
export function makeUpsertRunRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = { workspaceId: p.workspaceId, repoId: p.repoId, runRef: p.runRef, status: p.status };
    if (p.currentMilestone !== undefined)
        out.currentMilestone = p.currentMilestone;
    if (p.runStatePath !== undefined)
        out.runStatePath = p.runStatePath;
    if (p.blockedByDecisionRequestId !== undefined)
        out.blockedByDecisionRequestId = p.blockedByDecisionRequestId;
    return out;
}
export function makeGetUploadDownloadUrlRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    return { workspaceId: p.workspaceId, uploadId: p.uploadId };
}
export function makeListJobsRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = { workspaceId: p.workspaceId };
    if (p.status !== undefined)
        out.status = p.status;
    return out;
}
export function makeEnqueueJobRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = {
        workspaceId: p.workspaceId,
        repoId: p.repoId,
        kind: p.kind,
        prompt: p.prompt,
        requirements: p.requirements,
    };
    if (p.role !== undefined)
        out.role = p.role;
    if (p.runId !== undefined)
        out.runId = p.runId;
    if (p.priority !== undefined)
        out.priority = p.priority;
    return out;
}
export function makeAddUncertaintyResolutionRequest(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const out = { workspaceId: p.workspaceId, uncertaintyId: p.uncertaintyId, mode: p.mode, value: p.value };
    if (p.commitSha !== undefined)
        out.commitSha = p.commitSha;
    if (p.confidence !== undefined)
        out.confidence = p.confidence;
    if (p.createdByJobId !== undefined)
        out.createdByJobId = p.createdByJobId;
    return out;
}
//# sourceMappingURL=control-plane-requests.mjs.map