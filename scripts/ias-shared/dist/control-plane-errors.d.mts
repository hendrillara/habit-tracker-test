export declare class ControlPlaneHttpError extends Error {
    status: number;
    code: string;
    responseBody: unknown;
    constructor({ status, code, message, responseBody }: {
        status: number;
        code: string;
        message: string;
        responseBody: unknown;
    });
}
export declare function errorCodeFromControlPlaneBody(body: unknown): string;
export declare function assertOkControlPlaneResponse({ status, body }: {
    status: number;
    body: unknown;
}): void;
//# sourceMappingURL=control-plane-errors.d.mts.map