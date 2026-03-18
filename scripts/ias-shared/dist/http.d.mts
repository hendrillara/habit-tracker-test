export declare class HttpTimeoutError extends Error {
    url: string;
    timeoutMs: number;
    constructor({ url, timeoutMs }: {
        url: string;
        timeoutMs: number;
    });
}
export declare class HttpNetworkError extends Error {
    url: string;
    constructor({ url, message }: {
        url: string;
        message: string;
    });
}
export declare function fetchWithTimeout({ url, method, headers, body, timeoutMs, }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeoutMs?: number;
}): Promise<Response>;
export declare function fetchJson({ url, method, headers, body, timeoutMs, }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeoutMs?: number;
}): Promise<{
    ok: boolean;
    status: number;
    json: any;
    text: string;
}>;
//# sourceMappingURL=http.d.mts.map