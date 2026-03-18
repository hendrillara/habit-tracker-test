# Verification (tests/build/lint/typecheck)

IAS quality gates include “no broken builds” and meaningful tests for core logic. This requires a pragmatic verification strategy that differs for greenfield vs brownfield.

## Brownfield

Default to the repo’s existing verification commands and CI expectations.

- Prefer the smallest relevant command first (unit tests), then broaden (typecheck/lint/build).
- Do not invent a second parallel toolchain unless explicitly required.

## Greenfield

If verification scripts don’t exist yet, add a minimal baseline early:

- build
- lint
- typecheck
- test (core logic)

For default web/mobile stacks, see `docs/ias/process/greenfield-recipes.md`.

## Operational rule

The Test Runner role executes verification; the Implementer owns adding/fixing tests.

