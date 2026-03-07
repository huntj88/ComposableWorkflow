# SDB-20 - Mixed Aggregate Consistency Prioritization

## Depends On
- `SDB-17`
- `SDB-18`
- `SDB-19`

## Objective
Implement the delegated-child follow-on behavior where single-stage mixed outputs remain invalid, but the merged child aggregate may retain earlier `followUpQuestions` when a later executed stage emits `actionableItems`, and the parent must prioritize `IntegrateIntoSpec` for that pass.

## Implementation Tasks
- [ ] Update delegated-child aggregate merge logic so earlier-stage `followUpQuestions` are preserved when a later executed stage emits `actionableItems`.
- [ ] Keep stage-local contract enforcement unchanged: a single `ConsistencyStageOutput` must still fail if it contains both non-empty `actionableItems` and non-empty `followUpQuestions`.
- [ ] Update parent `LogicalConsistencyCheckCreateFollowUpQuestions` routing so aggregate `actionableItems` always take precedence over queue construction.
- [ ] Ensure `NumberedOptionsHumanRequest` is not entered for a pass where aggregate `actionableItems` is non-empty, even if aggregate `followUpQuestions` is also non-empty.
- [ ] Add regression coverage for mixed aggregate child results in unit/state tests.
- [ ] Extend integration coverage so valid mixed aggregates route to `IntegrateIntoSpec` while stage-local mixed outputs still fail.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`

## Acceptance Criteria
- A single stage output that contains both non-empty `actionableItems` and non-empty `followUpQuestions` still fails explicitly.
- A merged child aggregate that contains earlier-stage `followUpQuestions` plus later-stage `actionableItems` is valid and does not fail solely for being mixed.
- When aggregate `actionableItems` is non-empty, the parent transitions to `IntegrateIntoSpec` and does not enter `NumberedOptionsHumanRequest` for that pass.
- Earlier aggregated `followUpQuestions` are preserved in the child aggregate for diagnostics and later-pass regeneration; they are not used to build the queue during the same pass as actionable-item routing.
- Later prompt layers remain skipped once an executed stage emits non-empty `actionableItems`.
- Unit and integration tests cover both valid mixed-aggregate routing and invalid stage-local mixed output failure.

## Spec/Behavior Links
- Spec: sections 2, 5.3, 6.2, 6.2.1, 6.3, 6.4, 7.1, 10.1, 10.2.
- Behaviors: `B-SD-TRANS-003`, `B-SD-CHILD-001`, `B-SD-CHILD-003`, `B-SD-CHILD-004`.
- Integration tests: `ITX-SD-013`, `ITX-SD-016`.

## Fixed Implementation Decisions
- Mixed-result handling changes only aggregate semantics; stage-local prompt contracts remain mutually exclusive.
- Parent routing precedence is fixed: `actionableItems` first, `followUpQuestions` second, completion confirmation last.
- Preserved mixed-aggregate `followUpQuestions` are diagnostic/current-pass byproducts only; queue generation waits for a later pass with zero `actionableItems`.
- This task does not add new parent states or new outbound transitions.

## Interface/Schema Contracts
- `ConsistencyStageOutput` remains the per-layer contract with mutually exclusive `actionableItems` and `followUpQuestions`.
- `ConsistencyCheckOutput` becomes the aggregate child contract that may contain both arrays after multi-stage merging.
- `LogicalConsistencyCheckCreateFollowUpQuestions` must branch only from the aggregate child contract, with `actionableItems.length > 0` taking routing priority.
- `numbered-question-item.schema.json` remains authoritative for queue materialization, but only when aggregate `actionableItems` is empty.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: stage-local mixed output still fails, while mixed aggregate outputs across executed stages are preserved.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/logical-consistency-check.test.ts`
  - Expected: parent routes to `IntegrateIntoSpec` whenever aggregate `actionableItems` is non-empty, including valid mixed aggregates.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
  - Expected: child aggregate routing variants include the mixed aggregate case and queue suppression for that pass.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: integration coverage distinguishes stage-local mixed failures from valid mixed-aggregate prioritization.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-MIX-001-AggregateMergePreservesPriorQuestions | `src/workflows/spec-doc/consistency-follow-up-child.ts` | earlier `followUpQuestions` survive aggregate merge when a later executed stage emits `actionableItems`. |
| SD-MIX-002-StageLocalMixedFailure | `src/workflows/spec-doc/consistency-follow-up-child.ts` | a single stage output with both arrays non-empty still fails explicitly. |
| SD-MIX-003-ParentRoutingPriority | `src/workflows/spec-doc/states/logical-consistency-check.ts` | aggregate `actionableItems` always force `IntegrateIntoSpec` routing for that pass. |
| SD-MIX-004-UnitRegressionCoverage | `test/workflows/spec-doc/logical-consistency-check.test.ts` | unit tests cover valid mixed aggregate routing without queue entry. |
| SD-MIX-005-IntegrationRoutingCoverage | `test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts` | integration tests cover mixed aggregate parent routing and queue suppression. |
| SD-MIX-006-IntegrationContractCoverage | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | integration tests distinguish stage-local mixed failure from valid mixed aggregate preservation. |
