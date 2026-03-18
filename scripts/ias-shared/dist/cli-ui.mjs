const ANSI_RE = /\u001b\[[0-9;]*m|\u001b\]8;;.*?\u0007|\u001b\]8;;\u0007/g;
export function stripAnsi(text) {
    return String(text ?? "").replaceAll(ANSI_RE, "");
}
function normalizeColorMode(value) {
    const s = String(value ?? "").trim().toLowerCase();
    if (!s)
        return null;
    if (s === "auto")
        return "auto";
    if (s === "always" || s === "true" || s === "1" || s === "yes" || s === "on")
        return "always";
    if (s === "never" || s === "false" || s === "0" || s === "no" || s === "off")
        return "never";
    return null;
}
function normalizeFormat(value) {
    const s = String(value ?? "").trim().toLowerCase();
    if (!s)
        return null;
    if (s === "human" || s === "text")
        return "human";
    if (s === "json")
        return "json";
    return null;
}
function hasTruthyEnv(env, key) {
    const v = env[key];
    if (v === undefined)
        return false;
    const s = String(v).trim().toLowerCase();
    if (!s)
        return true;
    return ["1", "true", "yes", "y", "on"].includes(s);
}
function isProbablyCi(env) {
    return hasTruthyEnv(env, "CI");
}
function resolveFormat({ jsonFlag, env, }) {
    const envFormat = normalizeFormat(env.IAS_FORMAT);
    if (jsonFlag === true)
        return "json";
    if (jsonFlag === false)
        return "human";
    if (envFormat)
        return envFormat;
    return "human";
}
function resolveColorEnabled({ format, mode, env, stdoutIsTTY, }) {
    if (format === "json")
        return false;
    if (env.NO_COLOR !== undefined)
        return false;
    if (mode === "never")
        return false;
    if (mode === "always")
        return true;
    if (!stdoutIsTTY)
        return false;
    const term = String(env.TERM ?? "").trim().toLowerCase();
    if (term === "dumb")
        return false;
    return true;
}
function resolveInteractive({ format, env, stdinIsTTY, stdoutIsTTY, }) {
    if (format !== "human")
        return false;
    if (!stdinIsTTY || !stdoutIsTTY)
        return false;
    if (isProbablyCi(env))
        return false;
    return true;
}
export function parseCommonCliOptions(argv, env = process.env) {
    const nextArgv = [];
    let jsonFlag = null;
    let colorMode = null;
    let verbosity = "normal";
    const looksLikeBool = (v) => {
        const s = String(v ?? "").trim().toLowerCase();
        return ["1", "0", "true", "false", "yes", "no", "y", "n", "on", "off"].includes(s);
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--") {
            nextArgv.push(...argv.slice(i));
            break;
        }
        if (a === "--quiet") {
            verbosity = verbosity === "verbose" ? "verbose" : "quiet";
            continue;
        }
        if (a === "--verbose") {
            verbosity = "verbose";
            continue;
        }
        const isJson = a === "--json" || a.startsWith("--json=");
        if (isJson) {
            if (a.includes("=")) {
                const v = a.slice(a.indexOf("=") + 1);
                jsonFlag = String(v).trim().toLowerCase() !== "false";
            }
            else {
                const v = argv[i + 1];
                if (v && !v.startsWith("-") && looksLikeBool(v)) {
                    jsonFlag = String(v).trim().toLowerCase() !== "false";
                    i++;
                }
                else {
                    jsonFlag = true;
                }
            }
            continue;
        }
        if (a === "--no-color" || a === "--no-colour") {
            colorMode = "never";
            continue;
        }
        const isColor = a === "--color" || a === "--colour" || a.startsWith("--color=") || a.startsWith("--colour=");
        if (isColor) {
            if (a.includes("=")) {
                const v = a.slice(a.indexOf("=") + 1);
                colorMode = normalizeColorMode(v) ?? colorMode;
            }
            else {
                const v = argv[i + 1];
                const parsed = v && !v.startsWith("-") ? normalizeColorMode(v) : null;
                if (parsed)
                    i++;
                colorMode = parsed ?? "always";
            }
            continue;
        }
        nextArgv.push(a);
    }
    const format = resolveFormat({ jsonFlag, env });
    const effectiveColorMode = colorMode ?? "auto";
    return { argv: nextArgv, format, colorMode: effectiveColorMode, verbosity };
}
function style(code, text, enabled) {
    if (!enabled)
        return text;
    return `\u001b[${code}m${text}\u001b[0m`;
}
function supportsHyperlinks(env, stdoutIsTTY) {
    if (!stdoutIsTTY)
        return false;
    if (env.NO_HYPERLINK !== undefined)
        return false;
    if (isProbablyCi(env))
        return false;
    const term = String(env.TERM ?? "").trim().toLowerCase();
    if (term === "dumb")
        return false;
    // Conservative default: enable in interactive terminals.
    return true;
}
function formatLink({ url, label, enableHyperlink, }) {
    if (!enableHyperlink)
        return label === url ? url : `${label} (${url})`;
    // OSC 8 hyperlink
    return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}
function padRight(s, w) {
    const t = String(s ?? "");
    const len = stripAnsi(t).length;
    if (len >= w)
        return t;
    return t + " ".repeat(w - len);
}
function padLeft(s, w) {
    const t = String(s ?? "");
    const len = stripAnsi(t).length;
    if (len >= w)
        return t;
    return " ".repeat(w - len) + t;
}
function renderTable(columns, rows) {
    const oneLine = (v) => String(v ?? "").replaceAll(/\r?\n+/g, " ").trim();
    const widths = columns.map((c) => stripAnsi(String(c.header)).length);
    for (const row of rows) {
        for (let i = 0; i < columns.length; i++) {
            const key = columns[i].key;
            const v = row?.[key] === undefined || row?.[key] === null ? "" : oneLine(row[key]);
            widths[i] = Math.max(widths[i], stripAnsi(v).length);
        }
    }
    const header = columns
        .map((c, i) => (c.align === "right" ? padLeft(c.header, widths[i]) : padRight(c.header, widths[i])))
        .join("  ");
    const sep = columns.map((_, i) => "-".repeat(Math.max(1, widths[i]))).join("  ");
    const body = rows.map((row) => columns
        .map((c, i) => {
        const v = row?.[c.key] === undefined || row?.[c.key] === null ? "" : oneLine(row[c.key]);
        return c.align === "right" ? padLeft(v, widths[i]) : padRight(v, widths[i]);
    })
        .join("  "));
    return [header, sep, ...body].join("\n");
}
function renderChecklist(items, colorEnabled) {
    const oneLine = (v) => String(v ?? "").replaceAll(/\r?\n+/g, " ").trim();
    const icon = (kind) => {
        if (kind === "success")
            return style("32", "OK", colorEnabled);
        if (kind === "warn")
            return style("33", "WARN", colorEnabled);
        if (kind === "error")
            return style("31", "FAIL", colorEnabled);
        if (kind === "info")
            return style("36", "INFO", colorEnabled);
        return style("2", "TODO", colorEnabled);
    };
    return items
        .map((it) => {
        const detail = it.detail ? ` — ${oneLine(it.detail)}` : "";
        return `- ${icon(it.kind)} ${it.label}${detail}`;
    })
        .join("\n");
}
function createSpinner({ stream, enabled, initialText, }) {
    if (!enabled) {
        return {
            start: () => { },
            update: () => { },
            stop: (finalText) => {
                if (finalText)
                    stream.write(`${finalText}\n`);
            },
        };
    }
    const frames = ["-", "\\", "|", "/"];
    let timer = null;
    let frameIndex = 0;
    let current = initialText;
    const render = () => {
        const f = frames[frameIndex++ % frames.length];
        stream.write(`\r${f} ${current}`);
    };
    return {
        start: () => {
            if (timer)
                return;
            render();
            timer = setInterval(render, 80);
            timer.unref?.();
        },
        update: (text) => {
            current = text;
            render();
        },
        stop: (finalText) => {
            if (timer)
                clearInterval(timer);
            timer = null;
            stream.write("\r");
            stream.write(" ".repeat(Math.max(0, stripAnsi(current).length + 2)));
            stream.write("\r");
            if (finalText)
                stream.write(`${finalText}\n`);
        },
    };
}
export function createUi({ argv, env = process.env, stdinIsTTY, stdoutIsTTY, stdout = process.stdout, stderr = process.stderr, }) {
    const { format, colorMode, verbosity } = parseCommonCliOptions(argv, env);
    const colorEnabled = resolveColorEnabled({ format, mode: colorMode, env, stdoutIsTTY });
    const interactive = resolveInteractive({ format, env, stdinIsTTY, stdoutIsTTY });
    const accent = (t) => style("36", t, colorEnabled);
    const dim = (t) => style("2", t, colorEnabled);
    const prefix = () => `${accent("IAS")}${dim(" ›")}`;
    const line = (kind, message) => {
        if (verbosity === "quiet" && (kind === "info" || kind === "success"))
            return;
        const tag = kind === "success"
            ? style("32", "OK", colorEnabled)
            : kind === "warn"
                ? style("33", "WARN", colorEnabled)
                : kind === "error"
                    ? style("31", "FAIL", colorEnabled)
                    : style("36", "INFO", colorEnabled);
        stdout.write(`${prefix()} ${tag} ${message}\n`);
    };
    const link = (url, label) => formatLink({
        url: String(url ?? "").trim(),
        label: String(label ?? "").trim() || String(url ?? "").trim(),
        enableHyperlink: supportsHyperlinks(env, stdoutIsTTY),
    });
    return {
        format,
        colorEnabled,
        interactive,
        verbosity,
        header: (title, subtitle) => {
            const line1 = `${accent(String(title ?? "").trim() || "IAS")}${subtitle ? dim(` — ${subtitle}`) : ""}`;
            stdout.write(`${line1}\n`);
        },
        section: (title) => {
            stdout.write(`\n${dim(String(title ?? "").trim())}\n`);
        },
        line,
        info: (m) => line("info", m),
        success: (m) => line("success", m),
        warn: (m) => line("warn", m),
        error: (m) => {
            const tag = style("31", "FAIL", colorEnabled);
            stderr.write(`${prefix()} ${tag} ${m}\n`);
        },
        checklist: (items) => {
            stdout.write(renderChecklist(items, colorEnabled) + "\n");
        },
        table: (columns, rows) => {
            stdout.write(renderTable(columns, rows) + "\n");
        },
        link,
        spinner: (initialText) => createSpinner({ stream: stdout, enabled: interactive, initialText }),
        json: (value) => {
            stdout.write(JSON.stringify(value ?? null, null, 2) + "\n");
        },
        jsonError: (message, extras) => {
            stderr.write(JSON.stringify({ ok: false, error: String(message ?? "error"), ...(extras ?? {}) }, null, 2) + "\n");
        },
    };
}
//# sourceMappingURL=cli-ui.mjs.map