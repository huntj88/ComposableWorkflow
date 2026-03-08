# SDB-23 - Two-Pass Child Coverage and Parity

## Depends On
- `SDB-14`
- `SDB-21`
- `SDB-22`

## Objective
Bring workflow tests, observability, and parity coverage in line with the two-pass delegated-child design so documentation, harness integration tests, and golden-path expectations all reflect full-sweep coverage plus `PlanResolution`.

## Implementation Tasks
- [x] Update integration suites that previously assumed actionable-item short-circuiting.
- [x] Add deterministic assertions for full-stage execution counts and single planning-step invocation.
- [x] Update golden scenarios and observability coverage for the full-sweep child behavior.
- [x] Extend parent-routing integration coverage for final mixed aggregates produced by `PlanResolution`.
- [x] Refresh task-suite documentation and supersession notes for the new delegated-child behavior.

## Required Artifacts
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.GS-SD-004.spec.ts`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`
- `packages/workflow-app-builder/docs/tasks/README.md`

## Acceptance Criteria
- Integration tests no longer expect delegated-child actionable-item short-circuiting.
- Integration observability tests assert all configured stages execute once and the planning template executes once afterward.
- Golden scenario coverage for immediate-action routing reflects full child coverage before parent reintegration.
- Parent-routing tests still prove `actionableItems` take precedence over `followUpQuestions` in final mixed aggregates.
- Task-suite documentation clearly marks the old short-circuit assumption as superseded.

## Spec/Behavior Links
- Spec: sections 6.1, 6.2, 6.2.1, 7.1, 7.2.2.2, 9, 10.2.
- Behaviors: `B-SD-TRANS-003`, `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-CHILD-001B`, `B-SD-CHILD-004`, `B-SD-OBS-003`.
- Integration tests: `ITX-SD-012`, `ITX-SD-013`, `ITX-SD-016`, `ITX-SD-017`.
- Golden scenarios: `GS-SD-004`.

## Fixed Implementation Decisions
- Parity artifacts must reflect the two-pass child design exactly; docs and tests must not describe the previous short-circuit model as current behavior.
- Mixed aggregate parent-routing precedence remains unchanged.
- Existing integration test IDs stay stable where practical; semantics are updated in place rather than renumbered.
- This task may update documentation artifacts in addition to executable tests.

## Interface/Schema Contracts
- No new parent output contract is introduced; coverage/parity updates continue to assert `ConsistencyCheckOutput`.
- Observability assertions must include both stage-level template IDs and the planning-step template ID.
- Golden scenarios must treat all configured stage executions as part of a single child pass before parent routing.
- Task-suite documentation must mark `SDB-21` and `SDB-22` as the canonical delegated-child execution model.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.GS-SD-004.spec.ts`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`
- `packages/workflow-app-builder/docs/tasks/README.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
  - Expected: observability assertions require a full stage sweep plus one planning-step delegation.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
  - Expected: parent routing still prioritizes final `actionableItems` over final `followUpQuestions`.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: integration coverage proves full-sweep execution and mixed-final-aggregate handling.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
  - Expected: state-progression coverage includes `PlanResolution` before `Done`.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.GS-SD-004.spec.ts`
  - Expected: golden scenario coverage reflects immediate-action routing only after full child coverage completes.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-PARITY-001-ObsParity | `test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts` | observability coverage proves all stages plus the planning step execute in order. |
| SD-PARITY-002-RoutingParity | `test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts` | parent routing still prioritizes final actionable items over follow-up questions. |
| SD-PARITY-003-FullSweepIntegration | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | integration coverage proves full-sweep execution replaced short-circuiting. |
| SD-PARITY-004-StateProgressionIntegration | `test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts` | integration coverage proves `PlanResolution` occurs exactly once after stage execution. |
| SD-PARITY-005-GoldenScenario | `test/integration/spec-doc/itx.spec-doc.GS-SD-004.spec.ts` | golden scenario coverage reflects full child coverage before reintegration. |
| SD-PARITY-006-TaskSuiteDocs | `docs/tasks/README.md` | task-suite documentation marks the new two-pass child model as canonical. |
