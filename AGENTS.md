# Agent Policy

This is a greenfield project with no users. Backwards compatibility is not a focus, refactor as needed to keep implementation simple. NO legacy fallback, even if server is out of date.

## Reuse Preference
- Avoid changes that reduce existing reuse across shared schemas, contracts, or utilities unless explicitly requested.
- When simplifying outputs or logic, prefer preserving shared abstractions and references over duplicating equivalent inline structures.

## Mandatory Pre-Commit Enforcement
- Pre-commit hooks are mandatory for this repository.
- Skipping hooks is not allowed (`--no-verify`, `HUSKY=0`, or equivalent bypasses are prohibited).

## Server Execution Policy for Agents
- Agents must not start application servers automatically.
- If a task requires a running server, agents must:
  1. Assume the server is already running.
  2. If not running, prompt the user to start it. Continue only after the user confirms server availability.
- Agents may run non-server start commands (build, lint, test, migrations, diagnostics) as needed.

## Targeted Test Execution Policy
- When asked to run targeted tests, agents must run exact spec files, not broad suite selectors.
- Prefer package-scoped direct Vitest invocation:
  - `pnpm --filter <package> exec vitest run <exact-test-file>`
- Do not use patterns that can expand to unrelated tests (for example: `pnpm --filter <package> test -- <substring>`).
- If multiple targeted tests are requested, run each exact file explicitly, one command per file.
- After targeted runs, report each command and whether it passed/failed.
