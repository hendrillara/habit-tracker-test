export class HttpTimeoutError extends Error {
    url;
    timeoutMs;
    constructor({ url, timeoutMs }) {
        super(`request timed out after ${timeoutMs}ms`);
        this.name = "HttpTimeoutError";
        this.url = url;
        this.timeoutMs = timeoutMs;
    }
}
export class HttpNetworkError extends Error {
    url;
    constructor({ url, message }) {
        super(message);
        this.name = "HttpNetworkError";
        this.url = url;
    }
}
export async function fetchWithTimeout({ url, method = "GET", headers = {}, body, timeoutMs = 15_000, }) {
    const controller = new AbortController();
    const effectiveTimeout = Math.max(1, Number(timeoutMs) || 15_000);
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
    try {
        return await fetch(String(url), {
            method,
            headers,
            ...(body === undefined ? {} : { body }),
            signal: controller.signal,
        });
    }
    catch (e) {
        if (e && typeof e === "object" && "name" in e && e.name === "AbortError") {
            throw new HttpTimeoutError({ url: String(url), timeoutMs: effectiveTimeout });
        }
        const msg = e instanceof Error ? e.message : String(e);
        throw new HttpNetworkError({ url: String(url), message: msg || "network error" });
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function fetchJson({ url, method = "POST", headers = {}, body, timeoutMs = 15_000, }) {
    const controller = new AbortController();
    const effectiveTimeout = Math.max(1, Number(timeoutMs) || 15_000);
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
    try {
        const res = await fetch(String(url), {
            method,
            headers,
            ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
            signal: controller.signal,
        });
        const text = await res.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        }
        catch {
            json = null;
        }
        return { ok: res.ok, status: res.status, json, text };
    }
    catch (e) {
        if (e && typeof e === "object" && "name" in e && e.name === "AbortError") {
            throw new HttpTimeoutError({ url: String(url), timeoutMs: effectiveTimeout });
        }
        const msg = e instanceof Error ? e.message : String(e);
        throw new HttpNetworkError({ url: String(url), message: msg || "network error" });
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=http.mjs.map