# TWEB12 - E2E Happy Paths, Coverage Ledger, and CI Quality Gates

## Depends On
- `TWEB10`
- `TWEB11`

## Objective
Close the plan with representative browser E2E happy paths, deterministic integration gate execution in CI, and a full behavior/integration ownership ledger that proves no spec coverage gaps remain.

## Fixed Implementation Decisions
- E2E remains representative happy-path coverage; race/contract/mismatch permutations remain integration-primary.
- CI gates fail on any behavior/ITX ownership gap or spec-lock drift.
- Coverage tracking is explicit by behavior ID and ITX ID.

## Interface/Schema Contracts
- Coverage sources: `workflow-web-spec.md`, `workflow-web-behaviors.md`, `workflow-web-integration-tests.md`.
- CI executes targeted integration specs and representative E2E specs.

## Implementation Tasks
- [x] Implement representative E2E flows for `/runs`, `/runs/:runId`, feedback submit success, and graph observability happy path.
- [x] Add CI jobs for integration suites, typecheck/build gates, and spec-lock drift checks.
- [x] Add coverage ledger mapping `B-WEB-001..056` and `ITX-WEB-001..043` to test ownership.
- [x] Enforce failure on missing ownership entries.
- [x] Add CI gate for definitions-route integration test and stream unsupported-eventType request-error test.
- [x] Add CI gate for spec-lock checks covering API-types export set and contract evolution-order constraints.

## Required Artifacts
- `apps/workflow-web/test/e2e/*.spec.ts`
- `.github/workflows/*` (or workspace CI equivalent)
- `docs/testing/coverage-matrix.md`

## File Plan (Exact)
### Create
- `apps/workflow-web/test/e2e/web-runs-dashboard-happy-path.spec.ts`
- `apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts`

### Modify
- `docs/testing/coverage-matrix.md`
- `.github/workflows/ci.yml`

## Acceptance Criteria
- Representative E2E happy-path scenarios pass.
- CI gates include web type/build/integration/spec-lock checks.
- Coverage ledger shows complete ownership for all `B-WEB-*` and `ITX-WEB-*` IDs.
- CI includes explicit checks for definitions route, free-text semantics, defaults/max ordering semantics, and evolution-order lock.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration`
- `pnpm --filter @composable-workflow/workflow-web run test:e2e`
- `pnpm --filter @composable-workflow/workflow-web run typecheck && pnpm --filter @composable-workflow/workflow-web run build`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.routes.definitions-view.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.unsupported-eventType-filter.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/spec-lock/itx.web.spec-lock.api-types-exports.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/spec-lock/itx.web.spec-lock.contract-evolution-order.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| TWEB12-GATE-001 | `docs/testing/coverage-matrix.md` | Coverage ledger contains complete ownership entries for `B-WEB-001..056` and `ITX-WEB-001..043`; missing ownership fails CI. |
| TWEB12-GATE-002 | `.github/workflows/ci.yml` | CI runs targeted definitions-route and unsupported-`eventType` stream integration checks defined by TWEB12 verification commands. |
| TWEB12-GATE-003 | `.github/workflows/ci.yml` | CI runs spec-lock checks for API-types export-set and contract-evolution-order conformance. |
| TWEB12-GATE-004 | `.github/workflows/ci.yml` | CI includes integration checks that cover free-text/filter-link semantics and defaults/max ordering semantics through targeted integration jobs. |
| TWEB12-GATE-005 | `apps/workflow-web/test/e2e/web-runs-dashboard-happy-path.spec.ts` | Representative `/runs` + `/runs/:runId` dashboard happy-path E2E coverage is present and gated in CI. |
| TWEB12-GATE-006 | `apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts` | Representative feedback submit success and terminal status-update E2E coverage is present and gated in CI. |
