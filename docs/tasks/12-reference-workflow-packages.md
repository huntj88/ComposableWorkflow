# T12 - Reference Workflow Packages for Validation

## Depends On
- `T01`

## Objective
Create workflow packages used by integration and E2E suites to validate behavior families with deterministic outcomes.

## Implementation Tasks
- [ ] Implement at least one package exposing:
  - simple success workflow
  - deterministic failure workflow
  - parent workflow that launches child
  - workflow step invoking `ctx.runCommand(...)`
  - deterministic long-running workflow with safe-point checkpoints for pause/resume/recovery tests
- [ ] Add metadata-rich definitions (states, transitions, display fields) for graph endpoint assertions.
- [ ] Include deterministic inputs for idempotency and race tests.
- [ ] Add package-level tests for expected progression paths.

## Required Artifacts
- `packages/workflow-package-reference/src/*`
- `packages/workflow-package-reference/test/*`

## Acceptance Criteria
- Package can be loaded dynamically by server.
- Workflows provide stable test fixtures for all critical behavior families.

## Spec/Behavior Links
- Spec: sections 5, 6, 14.
- Behaviors: section 1.1 baseline assumptions for E2E.

## Fixed Implementation Decisions
- Provide a single package `workflow-package-reference` containing 4 workflows required by baseline.
- Deterministic fixture inputs stored as JSON files and reused by integration/E2E.
- Reference package exports one manifest entrypoint only: `src/manifest.ts`.

## Interface/Schema Contracts
- Required reference workflow types:
  - `reference.success.v1`
  - `reference.failure.v1`
  - `reference.parent-child.v1`
  - `reference.command.v1`
  - `reference.long-running.v1`
- Deterministic input files contract:
  - `fixtures/input/*.json` with stable IDs for idempotency/race tests.

## File Plan (Exact)
### Create
- `packages/workflow-package-reference/src/manifest.ts`
- `packages/workflow-package-reference/src/workflows/success.ts`
- `packages/workflow-package-reference/src/workflows/failure.ts`
- `packages/workflow-package-reference/src/workflows/parent-child.ts`
- `packages/workflow-package-reference/src/workflows/command.ts`
- `packages/workflow-package-reference/src/workflows/long-running.ts`
- `packages/workflow-package-reference/fixtures/input/success.json`
- `packages/workflow-package-reference/fixtures/input/failure.json`
- `packages/workflow-package-reference/test/workflows/reference-workflows.spec.ts`

### Modify
- `packages/workflow-package-reference/package.json`

## Verification
- Command: `pnpm --filter workflow-package-reference test`
  - Expected: each reference workflow has deterministic progression in package-level tests.
- Command: `pnpm --filter workflow-server test -- loader`
  - Expected: reference manifest loads and all workflow types register.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behaviors-1.1-SuccessWorkflowFixture | `workflows/success.ts` | Happy-path workflow available for E2E. |
| Behaviors-1.1-FailureWorkflowFixture | `workflows/failure.ts` | Deterministic failing workflow available. |
| Behaviors-1.1-ParentChildFixture | `workflows/parent-child.ts` | Parent-child launch fixture available. |
| Behaviors-1.1-RunCommandFixture | `workflows/command.ts` | `ctx.runCommand` fixture available. |
| Behaviors-GS-003-GS-005-LongRunningFixture | `workflows/long-running.ts` | Pause/resume/recovery scenarios have deterministic safe-point fixture. |
