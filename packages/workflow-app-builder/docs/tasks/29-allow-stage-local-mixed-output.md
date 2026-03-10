# SDB-29 - Allow Stage-Local Mixed Actionable and Follow-Up Output

## Depends On
- `SDB-28`

## Objective
Remove the mutual exclusivity constraint between `actionableItems` and `followUpQuestions` within a single `ConsistencyStageOutput`. A scoped prompt layer may now emit both non-empty `actionableItems` and non-empty `followUpQuestions` in the same stage output as long as they address different gaps discovered during that stage's analysis.

## Motivation
The previous constraint forced each scoped prompt layer to classify every surfaced gap as exclusively actionable or exclusively requiring human input. In practice a single stage's concern area may contain some gaps that are immediately fixable (actionable items) alongside other gaps that require a human decision (follow-up questions). Splitting the output into one array or the other either discarded a valid finding or forced an artificial re-run to surface the remaining category. Removing the constraint allows the model to report all discovered gaps in a single pass, reducing unnecessary re-execution and improving coverage accuracy.

## Implementation Tasks
- [x] **`consistency-follow-up-child.ts`**: Remove the mutual-exclusivity check from `validateConsistencyStageOutputContract`. The function should no longer push `'actionableItems and followUpQuestions must be mutually exclusive'` when both arrays are non-empty.
- [x] **`prompt-templates.ts`**: Update `createScopedConsistencyBody` stage rules to replace the mutual-exclusivity instruction with guidance that both arrays may be emitted for different gaps. Specifically:
  - Remove: `\`actionableItems\` and \`followUpQuestions\` are mutually exclusive per stage: if one is non-empty, the other must be empty.`
  - Replace with: `A stage may emit both \`actionableItems\` and \`followUpQuestions\` when they address different gaps. Each item must clearly address a distinct finding.`
- [x] **`consistency-follow-up-child.test.ts`**: Replace the test `'rejects mixed actionable and follow-up output within one stage'` with a test that verifies mixed stage output is accepted without violations. Add a test confirming both arrays from a single stage are collected into the full-sweep coverage aggregate.
- [x] **`logical-consistency-check.test.ts`**: Verify that stage-local mixed output no longer triggers a child failure and that both arrays flow through to `PlanResolution`.
- [x] **Integration test `itx.spec-doc.ITX-SD-016.spec.ts`**: Update the mixed-stage-output test case from expecting a failure to expecting acceptance. Verify both arrays are aggregated and reach `PlanResolution`.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`

## Acceptance Criteria
- `validateConsistencyStageOutputContract` returns no violations when a single stage output contains both non-empty `actionableItems` and non-empty `followUpQuestions`.
- The scoped consistency prompt templates no longer instruct the model to keep `actionableItems` and `followUpQuestions` mutually exclusive.
- Stage outputs with both arrays non-empty are collected into the full-sweep coverage aggregate and forwarded to `PlanResolution`.
- Cross-stage dedup-and-log behavior (`SDB-24`) still applies to `itemId` and `questionId` regardless of whether they originate from single-stage or multi-stage mixed output.
- The aggregate `ConsistencyCheckOutput` contract is unchanged: it already supports both arrays being non-empty.
- Parent routing logic is unchanged: it continues to operate only on the `PlanResolution` aggregate result.
- All existing unit and integration tests pass after updating the affected assertions: `pnpm --filter workflow-app-builder exec vitest run` and `pnpm --filter workflow-server exec vitest run`.

## Spec/Behavior Links
- Spec: sections 2, 5.3, 6.2.1, 7.2.2 (common prompt rules), 10.2 (AC-9, AC-10).
- Behaviors: `B-SD-CHILD-003`, `B-SD-CHILD-004`.
- Integration tests: `ITX-SD-016`.

## Fixed Implementation Decisions
- The change is scoped to removing the stage-local mutual-exclusivity enforcement and updating prompts/tests accordingly.
- No new parent states, transitions, or schema files are introduced.
- `PlanResolution` behavior is unchanged; it already handles aggregates with both arrays non-empty.
- Cross-stage dedup-and-log remains unchanged.

## Supersession Notes
- This task supersedes the stage-local mutual-exclusivity rule established in `SDB-16` (`SD-CHILD-004-MixedResultFailure`), refined in `SDB-20` (`SD-MIX-002-StageLocalMixedFailure`), and carried into `SDB-25`/`SDB-26`.
- `SDB-20`'s wording that "stage-local prompt contracts remain mutually exclusive" is historical after this task completes.
- `SDB-16`'s `SD-CHILD-004-MixedResultFailure` requirement mapping row is superseded.

## Interface/Schema Contracts
- `ConsistencyStageOutput` now permits both `actionableItems` and `followUpQuestions` to be non-empty simultaneously.
- `ConsistencyCheckOutput` aggregate contract is unchanged.
- Stage-specific `consistency-*-output.schema.json` files require no schema changes (they already allow both arrays).

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`

## Verification
- Command: `pnpm --filter workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: mixed stage output accepted; both arrays collected into aggregate.
- Command: `pnpm --filter workflow-app-builder exec vitest run test/workflows/spec-doc/logical-consistency-check.test.ts`
  - Expected: stage-local mixed output does not trigger child failure.
- Command: `pnpm --filter workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: mixed-stage test case passes with aggregation and PlanResolution.
- Command: `pnpm --filter workflow-app-builder exec vitest run`
  - Expected: all tests pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-STAGE-MIX-001-RemoveExclusivityCheck | `src/workflows/spec-doc/consistency-follow-up-child.ts` | `validateConsistencyStageOutputContract` returns no violations for mixed stage output. |
| SD-STAGE-MIX-002-UpdatePromptGuidance | `src/workflows/spec-doc/prompt-templates.ts` | Scoped consistency body no longer contains mutual-exclusivity instruction; replaced with different-gaps guidance. |
| SD-STAGE-MIX-003-UnitTestAcceptsMixed | `test/workflows/spec-doc/consistency-follow-up-child.test.ts` | Unit test verifies mixed stage output is valid and both arrays are aggregated. |
| SD-STAGE-MIX-004-ParentTestNoFailure | `test/workflows/spec-doc/logical-consistency-check.test.ts` | Parent routing test confirms mixed stage output does not fail the child run. |
| SD-STAGE-MIX-005-IntegrationAcceptsMixed | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | Integration test for mixed-stage output expects success and verifies flow to PlanResolution. |
