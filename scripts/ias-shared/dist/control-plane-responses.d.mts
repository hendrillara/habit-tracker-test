export declare function parseClaimNextJobResponse(value: unknown): {
    reason?: string;
    jobId: any;
    job: any;
} | {
    claimGeneration?: number;
    jobId: string;
    job: any;
};
export declare function parseCompleteJobResponse(value: unknown): {
    ok: boolean;
    result: Record<string, unknown>;
};
export declare function parseCompleteJobAndEnqueueChildrenResponse(value: unknown): {
    ok: boolean;
    idempotent: boolean;
    spawnedJobIds: string[];
};
export declare function parseResolveWorkspaceResponse(value: unknown): {
    workspaceId: string;
    workspace: any;
};
export declare function parseUpsertWorkerHeartbeatResponse(value: unknown): {
    workerId: string;
};
export declare function parseUpsertRepoResponse(value: unknown): {
    repoId: string;
};
export declare function parseResolveRepoByRemoteUrlHashResponse(value: unknown): {
    repoId: string;
    repo: any;
};
export declare function parseGetRepoResponse(value: unknown): {
    repo: any;
};
export declare function parseUpsertRunResponse(value: unknown): {
    runId: string;
};
export declare function parseGetUploadDownloadUrlResponse(value: unknown): {
    downloadUrl: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
};
export declare function parseListJobsResponse(value: unknown): {
    jobs: any;
};
export declare function parseEnqueueJobResponse(value: unknown): {
    jobId: string;
};
export declare function parseAddUncertaintyResolutionResponse(value: unknown): {
    resolutionId: string;
};
//# sourceMappingURL=control-plane-responses.d.mts.map