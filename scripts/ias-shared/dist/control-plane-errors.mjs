export class ControlPlaneHttpError extends Error {
    status;
    code;
    responseBody;
    constructor({ status, code, message, responseBody }) {
        super(message);
        this.name = "ControlPlaneHttpError";
        this.status = status;
        this.code = code;
        this.responseBody = responseBody;
    }
}
function asRecord(value) {
    if (!value || typeof value !== "object")
        return null;
    if (Array.isArray(value))
        return null;
    return value;
}
export function errorCodeFromControlPlaneBody(body) {
    const rec = asRecord(body);
    if (!rec)
        return null;
    const err = rec.error;
    if (err === undefined || err === null)
        return null;
    const code = String(err).trim();
    return code || null;
}
export function assertOkControlPlaneResponse({ status, body }) {
    const rec = asRecord(body);
    const okFlag = rec ? rec.ok : undefined;
    if (okFlag === true)
        return;
    const code = errorCodeFromControlPlaneBody(body) ?? (Number.isFinite(status) ? `HTTP_${status}` : "HTTP_ERROR");
    const message = errorCodeFromControlPlaneBody(body) ?? (Number.isFinite(status) ? `HTTP ${status}` : "HTTP error");
    throw new ControlPlaneHttpError({ status, code, message, responseBody: body });
}
//# sourceMappingURL=control-plane-errors.mjs.map