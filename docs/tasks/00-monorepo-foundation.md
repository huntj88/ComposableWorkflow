# T00 - Monorepo Foundation

## Depends On
- none

## Objective
Create the baseline workspace, package boundaries, toolchain, and local runtime prerequisites so all downstream tasks can be implemented without restructuring.

## Implementation Tasks
- [ ] Create folder layout:
  - `packages/workflow-lib`
  - `packages/workflow-server`
  - `packages/workflow-package-reference`
  - `apps/workflow-cli`
  - `packages/*/src`, `packages/*/test`
- [ ] Configure workspace package manager (`pnpm-workspace.yaml`) and root scripts.
- [ ] Add root TypeScript configs:
  - base `tsconfig.base.json`
  - per-package `tsconfig.json`
- [ ] Add lint/format/test conventions and shared scripts.
- [ ] Add local Postgres bootstrap:
  - `docker-compose.yml` with Postgres 16
  - `.env.example` including `DATABASE_URL`
- [ ] Add deterministic dev bootstrap docs (`README.md`) with one-command setup.

## Required Artifacts
- Root workspace configs and scripts.
- Package scaffolds with `package.json` and build/test entrypoints.
- Developer setup docs for Linux/macOS runners.

## Acceptance Criteria
- `pnpm install` and workspace build run successfully.
- Postgres container can be started locally and is reachable via `DATABASE_URL`.
- No task downstream requires repository restructuring.

## Spec/Behavior Links
- Spec: sections 5, 7.3, 15 (phase baseline).

## Fixed Implementation Decisions
- Package manager: `pnpm` workspaces.
- Language/toolchain: TypeScript 5.x + Node.js 22 LTS.
- Test runner baseline: `vitest` for unit/integration, dedicated e2e scripts later.
- Container runtime baseline: Docker Compose v2.

## Interface/Schema Contracts
- Root scripts contract:
  - `pnpm build` runs all package builds.
  - `pnpm test` runs all non-e2e tests.
  - `pnpm lint` runs workspace lint.
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
- Command: `docker compose up -d postgres && docker compose ps`
  - Expected: `postgres` service is healthy/running.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Spec-5-MonorepoLayout | `pnpm-workspace.yaml`, package folders | Workspace package discovery succeeds. |
| Spec-7.3-PostgresLocal | `docker-compose.yml`, `.env.example` | Postgres reachable from `DATABASE_URL`. |
| Spec-15-Phase1-Baseline | root scripts + tsconfig | Phase-1 bootstrap commands run cleanly. |
