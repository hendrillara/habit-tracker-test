# CLI Output Contract (IAS)

This document defines the output/UX contract for IAS command-line surfaces:

- Global CLI: `ias` (Node)
- Bootstrapped repo CLI: `./scripts/ias` (bash)

## Defaults

- Default output is **human-readable**.
- Machine-readable output is **opt-in** via `--json` (and must be ANSI-free).
- Interactive UX (prompts, spinners, watch views) is **TTY-only** and must be **opt-in** for “dynamic” views.
- We never print secrets/tokens by default.

## Output format

### `--json`

When supported by a command, `--json` switches output to a **single JSON object** on stdout (with no extra human lines).

Errors in `--json` mode must be emitted as JSON on stderr:

```json
{ "ok": false, "error": "..." }
```

Notes:

- Long-running commands that stream/log continuously may explicitly reject `--json` to keep behavior deterministic.
- `--json` disables interactive UX (no prompts, no spinners).

### `IAS_FORMAT`

Node CLIs support `IAS_FORMAT`:

- `IAS_FORMAT=human` (default)
- `IAS_FORMAT=json`

`--json` takes precedence over `IAS_FORMAT`.

## Color

### `--color`

Node CLIs support:

- `--color=auto` (default)
- `--color=always`
- `--color=never`

### `NO_COLOR`

If `NO_COLOR` is set (to any value), color is disabled.

Bootstrapped bash scripts also respect `NO_COLOR`.

## Non-TTY behavior

When stdin or stdout is not a TTY:

- Never prompt.
- Never start spinners/watch/dynamic UI unless explicitly requested and safe.
- Prefer stable, grep-friendly single-shot output.

Important command-specific behavior:

- `ias setup`:
  - Non-interactive mode is available via `--non-interactive` (and required for CI).
- `ias auth login`:
  - Requires a TTY (fails fast in non-TTY contexts to avoid hanging).
- `ias status --watch`:
  - Requires a TTY and is opt-in.

## Exit codes (convention)

- `0`: success
- `1`: usage/validation error or generic failure
- `2`: “needs attention” / check failed / unsupported in current environment (e.g. non-TTY requirement)

## Migration notes (HUM-116)

As of **January 1, 2026** (HUM-116 CLI UX refresh):

- `ias doctor` now defaults to **human output**; use `ias doctor --json` for JSON.
- `ias setup` now defaults to **human output**; use `ias setup --json` for JSON-only, non-interactive-safe output.
- `ias status` now defaults to **human output**; use `--json` for machine output.
- `ias status --watch` is available (opt-in, TTY-only).
- `ias auth login` fails fast in non-TTY contexts (prevents CI deadlocks).

