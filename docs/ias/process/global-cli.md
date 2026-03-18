# IAS Global CLI (`ias`) — Internal Distribution (Private npm)

This is the internal, globally-installable CLI for IAS.

It is **private IP** and must be published **only** as a **private** package (never public).

Decision record (distribution): `apps/ias-agent-framework/docs/ias/decisions/20251230-0001-github-packages-distribution.md`.

## Install (local dev from this repo)

If you have this monorepo checked out, you can use `npm link` instead of installing from a package:

```bash
cd apps/ias-agent-framework
npm install
npm link

ias version
ias --help
```

## Install (GitHub Packages)

### Prerequisites

- You must be a member of the **LucentiveLabs** GitHub org
- You need a GitHub **classic** Personal Access Token (PAT) with `read:packages` scope

### Step 1: Create a GitHub PAT (if you don't have one)

GitHub Packages requires a **classic** PAT — fine-grained tokens don't support packages yet.

1. Open [GitHub → New token (classic)](https://github.com/settings/tokens/new?scopes=read:packages&description=IAS%20CLI%20(read%20packages)) (pre-selects the right scope)
2. Set an expiration (90 days recommended)
3. Click **Generate token**
4. **Copy the token immediately** — it's only shown once

> **Tip:** Store the token securely (e.g., password manager). You'll need it if you set up another machine.

### Step 2: Configure npm

```bash
# Point the @lucentivelabs scope to GitHub Packages
npm config set @lucentivelabs:registry https://npm.pkg.github.com

# Authenticate with your PAT
npm config set //npm.pkg.github.com/:_authToken "<YOUR_GITHUB_PAT>"
```

This writes to your global `~/.npmrc`. You only need to do this once per machine.

### Step 3: Install globally

```bash
npm i -g @lucentivelabs/ias
```

### Verify

```bash
ias version
ias --help
```

## Output formatting (flags + non-TTY)

See `docs/ias/process/cli-output.md`.

Quick reference:

- `--json` (ANSI-free, machine output where supported; disables prompts)
- `--color=auto|always|never` (overrides; `NO_COLOR` disables)
- `IAS_FORMAT=json` (Node CLIs; env override)

### Troubleshooting

If you get a 401 or 403 error:
- Verify your PAT has `read:packages` scope (check [GitHub → Tokens](https://github.com/settings/tokens))
- Verify you're a member of the `LucentiveLabs` org
- Ensure your token hasn't expired

## Common workflows

### Bootstrap IAS into a repo

```bash
ias bootstrap /path/to/target-repo --pr --pr-base main
```

### Install IAS into a repo (CLI-first)

`ias install` is a convenience wrapper around `ias bootstrap` with safer defaults and a post-install verification step.

```bash
ias install /path/to/repo
```

Optional PR-based install:

```bash
ias install /path/to/repo --pr --pr-base main --push true
```

### Connect IAS Console to a local repo checkout

Run the guided setup (recommended; no manual JSON editing):

```bash
ias setup
```

This will prompt for (with defaults where possible):

- `controlPlane.convexDeploymentUrl` (auto-detected from `NEXT_PUBLIC_CONVEX_URL` / `.env.local` when available)
- `controlPlane.consoleAppUrl` (defaults to `http://localhost:3000`)

Auth options (HTTP-only control plane):

- Developer machines (recommended): device login (`ias auth login`)
  - Stores a device token in `~/.ias/auth.json`
  - Writes `controlPlane.workspaceSlug` back into `~/.ias/worker.json` (legacy filename) after browser approval
- Automation/CI (recommended): service token
  - Set `controlPlane.httpServiceToken` in `~/.ias/worker.json` (or pass an explicit `--path`)
  - Token should be a Console service token (`IAS_CONTROL_PLANE_SERVICE_TOKEN`) or a workspace-scoped service principal token

There is no supported Convex client mode (`convexAdminKey`, `convexAuthToken`) in the framework runtime.

Link a local repo checkout (updates `~/.ias/worker.json`):

```bash
ias repo link /path/to/repo
```

If IAS is not installed in that repo yet, `ias repo link` will suggest `ias install ...`. If you want to install immediately, pass `--install true` (otherwise linking is a no-op beyond updating `~/.ias/worker.json`).

Note: if your Git remote uses a GitHub SSH host alias (e.g. `github.com-yourname`), IAS normalizes it to `github.com` so it matches repos synced from the GitHub App.

Start the local agent runtime (foreground):

```bash
ias start
```

Quick “is it connected?” check (no background runtime):

```bash
ias ping
```

Start the runtime as a background daemon (optional):

```bash
ias start --daemon
```

- **macOS:** Uses launchd (auto-starts on login)
- **Windows:** Uses detached process with PID file (manual restart after reboot)

Check daemon status and logs:

```bash
ias status
ias logs --lines 200
```

Stop the daemon:

```bash
ias stop
```

### Quick troubleshooting

```bash
ias doctor
```

## Windows support

IAS fully supports Windows with Git for Windows installed.

### Requirements

- **Git for Windows** must be installed (provides Git Bash)
- Download: https://git-scm.com/download/win

### Command types

| Entry point | Type | Windows support |
|-------------|------|-----------------|
| `ias` (Node.js CLI) | Node.js | ✅ Native |
| `scripts/ias` | Bash script | ✅ Via Git Bash |

The Node.js CLI (`ias setup`, `ias start`, etc.) works natively on Windows.

The bash script (`scripts/ias preflight`, `scripts/ias new-run`, etc.) runs through a `.cmd` wrapper that automatically invokes Git Bash:

```
scripts/ias preflight     →  scripts/ias.cmd  →  Git Bash  →  scripts/ias
```

This is transparent — just run `scripts/ias` commands normally.

### Windows daemon mode

The daemon (`ias start --daemon`) works differently on Windows vs macOS:

| Platform | Method | Auto-start on login |
|----------|--------|---------------------|
| macOS | launchd | ✅ Yes (automatic) |
| Windows | Detached process + PID file | ✅ Yes (via `autostart` command) |

Windows daemon commands:

```bash
ias start --daemon          # Start background runtime
ias status                  # Check if running (reads PID file)
ias logs                    # View log output
ias stop                    # Stop the runtime (SIGTERM → SIGKILL)
ias autostart               # Check autostart status
ias autostart --enable      # Enable auto-start on Windows login
ias autostart --disable     # Disable auto-start
```

The `autostart` command manages a startup script in the Windows Startup folder (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`). When enabled, the IAS runtime daemon will start automatically when you log in to Windows.

### File locations (Windows)

| File | Location |
|------|----------|
| Runtime config | `%USERPROFILE%\.ias\worker.json` |
| Auth tokens | `%USERPROFILE%\.ias\auth.json` |
| PID file | `%USERPROFILE%\.ias\worker.pid` |
| Logs | `%LOCALAPPDATA%\IAS\logs\` |

### Security (file permissions)

Sensitive files (auth tokens, config) are protected using Windows ACLs:
- Inherited permissions from parent directories are removed
- Only the current user has access (Full Control)

This is equivalent to Unix `chmod 600` for files and `chmod 700` for directories.

### If Git Bash is not found

You'll see:
```
Error: Git Bash not found. Please install Git for Windows.
```

Install Git for Windows from https://git-scm.com/download/win

## Manual E2E smoke (framework repo)

For a real end-to-end validation (Console ↔ control plane ↔ runtime ↔ git), use the smoke harness:

- `apps/ias-agent-framework/scripts/control-plane-e2e-smoke/run.mjs`
