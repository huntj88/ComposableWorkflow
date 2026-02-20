# T17 - CI Quality Gates, Coverage Accounting, and Delivery Controls

## Depends On
- `T10`, `T14`, `T15`, `T16`

## Objective
Operationalize deterministic quality gates so implementation completeness is provable and regressions are blocked.

## Implementation Tasks
- [ ] Define CI stages and order:
  1) build + typecheck
  2) unit tests
  3) integration tests
  4) E2E tests
  5) SSE stream tests (`T10`)
- [ ] Add hermetic test environment setup:
  - test-local Postgres container
  - seeded reference workflows
  - deterministic clock/fault injection toggles for integration suites
- [ ] Add behavior coverage ledger:
  - map each `B-*` and `GS-*` to test IDs
  - map each `ITX-*` to test IDs
- [ ] Add flake controls:
  - retry policy only for known transient infra failures
  - quarantine process for flaky tests with owner and deadline
- [ ] Add artifact capture on failure:
  - event timeline dumps
  - logs/metrics/traces snapshots
  - fault injection trace metadata
- [ ] Add release gate requiring all integration-primary tests to pass deterministically.

## Required Artifacts
- `.github/workflows/*` (or equivalent CI pipeline config)
- `docs/testing/coverage-matrix.md`
- `docs/testing/ci-triage.md`

## Acceptance Criteria
- CI enforces full suite order and blocks merges on failing critical suites.
- Coverage ledger proves no behavior/ITX IDs are unowned.
- Integration suite reproducibility requirements from `integration-tests.md` are met.

## Spec/Behavior Links
- Spec: sections 14, 15, 16.
- Integration plan: sections 5, 7.

## Fixed Implementation Decisions
- CI platform: GitHub Actions.
- Mandatory gates on pull requests: build, unit, integration, e2e.
- Optional gates: none in current baseline scope.
- Fail-fast policy: build/typecheck failure stops downstream jobs.

## Interface/Schema Contracts
- CI job contracts:
  - `build`: `pnpm -r build`
  - `unit`: `pnpm -r test -- --runInBand=false`
  - `integration`: `pnpm --filter workflow-server test -- ITX-`
  - `e2e`: `pnpm --filter workflow-server test:e2e && pnpm --filter workflow-cli test:e2e`
- Coverage ledger schema (`docs/testing/coverage-matrix.md`):
  - columns: `RequirementID`, `Suite`, `PlannedTestFile`, `OwnerTask`, `Status`, `FeatureGate`.

## File Plan (Exact)
### Create
- `.github/workflows/ci.yml`
- `.github/workflows/optional-features.yml`
- `docs/testing/coverage-matrix.md`
- `docs/testing/ci-triage.md`

### Modify
- `package.json`

## Verification
- Command: `act -W .github/workflows/ci.yml` (or push to CI)
  - Expected: jobs execute in stage order and fail on gate violations.
- Command: `grep -E "ITX-|B-|GS-" docs/testing/coverage-matrix.md | wc -l`
  - Expected: all required IDs from behaviors/integration plans are represented.
- Command: `grep -E "^\| (B-|GS-|ITX-)" docs/testing/coverage-matrix.md | wc -l`
  - Expected: one row per requirement ID; no wildcard rows.

## One-to-One Requirement Mapping
| Requirement ID | CI/Artifact | Expected Assertion |
|---|---|---|
| Integration-ExitCriteria-1 | `ci.yml` integration job | All integration-primary tests pass deterministically. |
| Integration-ExitCriteria-2 | `ci-triage.md` | Flake policy disallows timing-sleep-based race tests. |
| Spec-16-AcceptanceCriteria | `coverage-matrix.md` | Every required behavior and scenario has owned tests. |
