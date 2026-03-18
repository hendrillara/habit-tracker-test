export declare function makeClaimNextJobRequest(payload: any): any;
export declare function makeHeartbeatJobRequest(payload: any): any;
export declare function makeCompleteJobRequest(payload: any): any;
export declare function makeCompleteJobAndEnqueueChildrenRequest(payload: any): any;
export declare function makeListJobEventsForJobRequest(payload: any): any;
export declare function makeResolveWorkspaceRequest(payload: any): {
    slug: any;
};
export declare function makeUpsertWorkerHeartbeatRequest(payload: any): any;
export declare function makeUpsertRepoRequest(payload: any): any;
export declare function makeResolveRepoByRemoteUrlHashRequest(payload: any): {
    workspaceId: any;
    remoteUrlHash: any;
};
export declare function makeGetRepoRequest(payload: any): {
    workspaceId: any;
    repoId: any;
};
export declare function makeUpsertRunRequest(payload: any): any;
export declare function makeGetUploadDownloadUrlRequest(payload: any): {
    workspaceId: any;
    uploadId: any;
};
export declare function makeListJobsRequest(payload: any): any;
export declare function makeEnqueueJobRequest(payload: any): any;
export declare function makeAddUncertaintyResolutionRequest(payload: any): any;
//# sourceMappingURL=control-plane-requests.d.mts.map