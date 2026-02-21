# T19 - Production Server Entrypoint and Test/Prod Parity Guarantees

## Depends On
- `T18`

## Objective
Introduce a persistent production server entrypoint and enforce architectural parity so test and production execution paths share the same runtime code, producing identical workflow outcomes for identical inputs/events.

## Implementation Tasks
- [ ] Add a persistent production launcher for `workflow-server` that binds `WORKFLOW_SERVER_PORT`, handles shutdown signals, and logs startup/shutdown lifecycle.
- [ ] Refactor server composition to a single shared composition root used by both production launcher and test harness.
- [ ] Eliminate duplicated runtime behavior paths between harness and production:
  - no duplicated orchestration wiring,
  - no duplicated repository/event pipeline wiring,
  - no duplicated API route registration wiring.
- [ ] Introduce a black-box E2E suite that executes against the launched production server process over HTTP.
- [ ] Keep existing harness-based suites for fast deterministic coverage, but classify them as integration/system-level unless they run against launched production server.
- [ ] Add parity assertions proving same workflow fixtures produce equivalent final outcomes between harness and production execution modes.
- [ ] If any behavior cannot be guaranteed equivalent under current architecture, perform refactors so E2E required gates run against the production launcher path.

## Required Artifacts
- `packages/workflow-server/src/**`
- `packages/workflow-server/test/e2e/**`
- `apps/workflow-cli/test/e2e/**`
- `package.json`
- `docs/testing/coverage-matrix.md`
- `docs/integration-tests.md`

## Acceptance Criteria
- A documented and runnable command starts a long-lived production server process locally.
- Production launcher and test harness both instantiate server/runtime via the same composition root entrypoint.
- For shared workflow fixtures, final run lifecycle/state and persisted event sequences are equivalent between harness mode and launched-production mode.
- CI includes at least one mandatory black-box E2E job against launched production server process.
- Task/docs naming clearly distinguishes harness-driven tests from production-server E2E tests.
- No known duplicated runtime wiring remains that could drift between test and production behavior.

## Spec/Behavior Links
- Spec: sections 4, 5, 6, 14, 16.
- Behaviors: `B-START-*`, `B-API-*`, `B-EVT-*`, `B-CLI-*`.

## Fixed Implementation Decisions
- Single composition root is required for runtime parity; production/test wrappers must be thin adapters only.
- Black-box E2E tests must target an externally launched server process over network HTTP.
- Harness tests remain allowed for speed/determinism but are not substitutes for required black-box E2E gates.
- Any unresolved parity ambiguity is resolved in favor of production-launcher behavior.

## Interface/Schema Contracts
- Server process contract:
  - `pnpm --filter @composable-workflow/workflow-server start` launches persistent server.
  - `WORKFLOW_SERVER_PORT` controls bind port, default `3000`.
  - graceful shutdown on `SIGINT`/`SIGTERM` closes HTTP server and DB pool.
- Composition contract:
  - shared bootstrap factory returns `{ server, orchestrator, registry, db, shutdown }` (or equivalent) for both production and harness adapters.
- Test classification contract:
  - `test:e2e:blackbox` targets launched production server only.
  - harness suites use explicit `integration`/`system` naming unless black-box by execution mode.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/main.ts`
- `packages/workflow-server/test/e2e-blackbox/server-smoke.spec.ts`
- `packages/workflow-server/test/e2e-blackbox/workflow-parity.spec.ts`

### Modify
- `packages/workflow-server/package.json`
- `packages/workflow-server/src/bootstrap.ts`
- `packages/workflow-server/src/index.ts`
- `packages/workflow-server/test/harness/create-harness.ts`
- `apps/workflow-cli/package.json`
- `docs/integration-tests.md`
- `docs/testing/coverage-matrix.md`
- `.github/workflows/ci.yml`

## Verification
- Command: `DATABASE_URL=postgresql://workflow:workflow@localhost:5432/workflow WORKFLOW_SERVER_PORT=3000 pnpm --filter @composable-workflow/workflow-server start`
  - Expected: process stays alive, exposes HTTP API, exits gracefully on signal.
- Command: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox`
  - Expected: black-box tests pass against launched production server path.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- parity`
  - Expected: parity assertions confirm equivalent outcomes between harness and production modes.
- Command: `pnpm --filter @composable-workflow/workflow-server test`
  - Expected: existing suites continue passing without behavior regressions.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Parity-001-ProdPersistentServer | `src/main.ts`, `package.json` | server starts and remains running until signal. |
| Parity-002-SingleCompositionRoot | `src/bootstrap.ts`, `test/harness/create-harness.ts` | production and harness both use shared composition root. |
| Parity-003-BlackBoxE2EMandatory | `test/e2e-blackbox/server-smoke.spec.ts`, `.github/workflows/ci.yml` | CI runs black-box E2E against launched production server. |
| Parity-004-OutcomeEquivalence | `test/e2e-blackbox/workflow-parity.spec.ts` | same fixtures yield equivalent terminal outcomes/events across modes. |
| Parity-005-TestClassificationClarity | `docs/integration-tests.md`, `docs/testing/coverage-matrix.md` | harness vs black-box scopes are explicitly distinguished. |
