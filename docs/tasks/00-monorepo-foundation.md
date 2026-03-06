# T00 - Monorepo Foundation

## Depends On
- none

## Objective
Create the baseline workspace, package boundaries, toolchain, and local runtime prerequisites so all downstream tasks can be implemented without restructuring.

## Implementation Tasks
- [x] Create folder layout:
  - `packages/workflow-lib`
  - `packages/workflow-server`
  - `packages/workflow-package-reference`
  - `apps/workflow-cli`
  - `packages/*/src`, `packages/*/test`
- [x] Configure workspace package manager (`pnpm-workspace.yaml`) and root scripts.
- [x] Add root TypeScript configs:
  - base `tsconfig.base.json`
  - per-package `tsconfig.json`
- [x] Add lint/format/test conventions and shared scripts.
- [x] Configure workspace quality tooling:
  - ESLint + Prettier root configuration
  - Husky pre-commit hook that runs `pnpm lint`, `pnpm test`, and `pnpm format:check`
  - pre-commit bypass is disallowed by repository policy
- [x] Add local Postgres bootstrap:
  - `docker-compose.yml` with Postgres 16
  - `.env.example` including `DATABASE_URL`
- [x] Add deterministic dev bootstrap docs (`README.md`) with one-command setup.

## Required Artifacts
- Root workspace configs and scripts.
- Package scaffolds with `package.json` and build/test entrypoints.
- Developer setup docs for Linux/macOS runners.
- Root lint/format/hook configs (`eslint`, `prettier`, `.husky/pre-commit`).

## Acceptance Criteria
- `pnpm install` and workspace build run successfully.
- Husky pre-commit is installed and blocks commits unless lint, unit tests, and formatting checks pass.
- Postgres container can be started locally and is reachable via `DATABASE_URL`.
- No task downstream requires repository restructuring.

## Spec/Behavior Links
- Spec: sections 5, 7.3, 15 (phase baseline).

## Fixed Implementation Decisions
- Package manager: `pnpm` workspaces.
- Language/toolchain: TypeScript 5.x + Node.js 22 LTS.
- Test runner baseline: `vitest` for unit/integration, dedicated e2e scripts later.
- Pre-commit baseline: `husky` with mandatory `lint`, `test`, and `format:check` gates.
- Lint/format baseline: `eslint` + `prettier` at workspace root.
- Container runtime baseline: Docker Compose v2.

## Interface/Schema Contracts
- Root scripts contract:
  - `pnpm build` runs all package builds.
  - `pnpm test` runs all non-e2e tests.
  - `pnpm lint` runs workspace lint.
  - `pnpm format:check` validates workspace formatting with Prettier.
- Environment contract:
  - `.env.example` must include `DATABASE_URL` and server port defaults.

## File Plan (Exact)
### Create
- `pnpm-workspace.yaml`
- `package.json`
- `tsconfig.base.json`
- `docker-compose.yml`
- `.env.example`
- `packages/workflow-lib/package.json`
- `packages/workflow-server/package.json`
- `packages/workflow-package-reference/package.json`
- `apps/workflow-cli/package.json`

### Modify
- `README.md`

## Verification
- Command: `pnpm install && pnpm -r build`
  - Expected: all workspaces install and compile without missing workspace config errors.
- Command: `pnpm lint && pnpm test && pnpm format:check`
  - Expected: lint, unit/integration tests, and formatting checks all pass locally and in pre-commit.
- Command: `docker compose up -d postgres && docker compose ps`
  - Expected: `postgres` service is healthy/running.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Spec-5-MonorepoLayout | `pnpm-workspace.yaml`, package folders | Workspace package discovery succeeds. |
| Spec-5-PreCommitQualityGates | Husky + ESLint + Prettier root config | Commits are blocked when lint/unit/format checks fail. |
| Spec-7.3-PostgresLocal | `docker-compose.yml`, `.env.example` | Postgres reachable from `DATABASE_URL`. |
| Spec-15-Phase1-Baseline | root scripts + tsconfig | Phase-1 bootstrap commands run cleanly. |
