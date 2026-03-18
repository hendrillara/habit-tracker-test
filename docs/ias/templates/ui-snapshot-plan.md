# UI snapshot plan

Use this when the work is user-facing and screenshots are required.

## Target

- type: web | ios | android | other
- entrypoint:
  - TODO (URL, route, screen, or app state)

## Viewports / devices

- Desktop (web): 1440x900
- Mobile (web): 390x844
- iOS simulator device (if applicable): TODO
- Android emulator device (if applicable): TODO

## Screens to capture (ordered)

1) TODO

For each screen define:

- state (logged out / logged in / seeded user)
- required data setup
- success + error/empty variant (if relevant)

## How to capture (commands)

Document the exact terminal commands for this repo (agents can execute them).

Examples (repo-agnostic, no Playwright dependency required):

- Web (Playwright via `npx`):
  - `npx -y playwright@latest install chromium`
  - `npx -y playwright@latest screenshot http://localhost:3000/login docs/ias/runs/YYYYMMDD-<run>/screenshots/login-mobile.png --viewport-size=390,844 --full-page`
  - `npx -y playwright@latest screenshot http://localhost:3000/login docs/ias/runs/YYYYMMDD-<run>/screenshots/login-desktop.png --viewport-size=1440,900 --full-page`

If the flow requires auth, prefer making auth reproducible (seeded user + scripted login) rather than relying on a manual browser session.

## Notes

- TODO

## Commit policy (optional)

Default: keep screenshots local (the run scaffolding creates a `.gitignore` inside `screenshots/`).

If humans need to review without running the app, force-add selected screenshots:

- `git add -f docs/ias/runs/YYYYMMDD-<run>/screenshots/*.png`
