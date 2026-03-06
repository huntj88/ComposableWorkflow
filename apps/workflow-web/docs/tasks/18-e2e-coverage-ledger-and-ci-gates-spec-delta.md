# WEB-18 - E2E, Coverage Ledger, and CI Gates for Spec Delta

## Depends On
- `WEB-12`
- `WEB-17`

## Objective
Close the staged web-spec delta by extending representative browser E2E coverage, widening ownership ledgers to the new behavior/test ranges, and updating CI gates so the new start-workflow, transition-history, feedback, and logs semantics remain enforced.

## Fixed Implementation Decisions
- Integration remains primary for high-permutation behavior; E2E stays representative happy-path coverage.
- Coverage tracking remains explicit by requirement ID and must fail CI on missing ownership.
- CI must run exact targeted checks for the newly added integration cases rather than broad substring selectors.

## Interface/Schema Contracts
- Coverage sources: `workflow-web-spec.md`, `workflow-web-behaviors.md`, `workflow-web-integration-tests.md`
- CI/ledger scope expands to `B-WEB-001..068` and `ITX-WEB-001..052`

## Implementation Tasks
- [ ] Extend the ownership ledger so all new `B-WEB-057..068` and `ITX-WEB-044..052` entries are explicitly tracked.
- [ ] Add representative E2E happy-path coverage for start workflow and transition-history observability flows.
- [ ] Update CI to run exact new integration files and the new representative E2E specs.
- [ ] Fail CI when coverage-ledger ownership for the expanded requirement ranges is missing or stale.

## Required Artifacts
- `apps/workflow-web/test/e2e/*.spec.ts`
- `.github/workflows/ci.yml`
- `packages/workflow-server/docs/testing/coverage-matrix.md`

## File Plan (Exact)
### Create
- `apps/workflow-web/test/e2e/web-start-workflow-happy-path.spec.ts`
- `apps/workflow-web/test/e2e/web-transition-history-happy-path.spec.ts`

### Modify
- `.github/workflows/ci.yml`
- `packages/workflow-server/docs/testing/coverage-matrix.md`

## Acceptance Criteria
- Coverage ledgers explicitly cover `B-WEB-001..068` and `ITX-WEB-001..052`.
- CI runs exact-file checks for the new integration specs and the new representative E2E specs.
- Representative browser coverage exists for start workflow and transition-history happy paths.
- Missing ownership or stale gate configuration for the new ranges fails CI.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/start/itx.web.start.ITX-WEB-044.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/history/itx.web.history.ITX-WEB-050.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web run test:e2e -- --grep "start workflow"`
- `pnpm --filter @composable-workflow/workflow-web run test:e2e -- --grep "transition history"`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| WEB-18-GATE-001 | `packages/workflow-server/docs/testing/coverage-matrix.md` | Coverage ledger contains complete ownership entries for `B-WEB-001..068` and `ITX-WEB-001..052`. |
| WEB-18-GATE-002 | `.github/workflows/ci.yml` | CI runs exact targeted checks for the new start, history, feedback, and logs integration specs. |
| WEB-18-GATE-003 | `apps/workflow-web/test/e2e/web-start-workflow-happy-path.spec.ts` | Representative start-workflow browser happy-path coverage is present and gated. |
| WEB-18-GATE-004 | `apps/workflow-web/test/e2e/web-transition-history-happy-path.spec.ts` | Representative transition-history browser happy-path coverage is present and gated. |
