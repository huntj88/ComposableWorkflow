# Agent Policy

## Mandatory Pre-Commit Enforcement
- Pre-commit hooks are mandatory for this repository.
- Skipping hooks is not allowed (`--no-verify`, `HUSKY=0`, or equivalent bypasses are prohibited).

## Server Execution Policy for Agents
- Agents must not start application servers automatically.
- If a task requires a running server, agents must:
  1. Check whether the server is already running.
  2. If not running, prompt the user to start it.
  3. Continue only after the user confirms server availability.
- Agents may run non-server start commands (build, lint, test, migrations, diagnostics) as needed.
