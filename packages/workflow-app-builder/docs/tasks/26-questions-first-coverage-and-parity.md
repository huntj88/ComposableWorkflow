# SDB-26 - Questions-First Routing Coverage and Parity

## Depends On
- `SDB-23`
- `SDB-25`

## Objective
Align integration tests, golden scenarios, and behavior coverage to the questions-first mixed-aggregate routing model introduced in `SDB-25`. Add the new golden scenario `GS-SD-004A`, update existing integration tests `ITX-SD-007`, `ITX-SD-013`, and `ITX-SD-016` for mixed-aggregate assertions, and ensure `B-SD-INPUT-005` coverage across the harness and black-box parity suites.

## Motivation
`SDB-25` changes the core parent routing for mixed aggregates, but its scope is limited to unit-level implementation and state-handler tests. Integration tests and golden-scenario parity suites must be updated to exercise the full end-to-end questions-first flow: child result → stash → `NumberedOptionsHumanRequest` → queue exhaustion → `IntegrateIntoSpec` with combined input.

## Implementation Tasks
- [ ] Update `itx.spec-doc.ITX-SD-007.spec.ts`: add a mixed-aggregate pass to the multi-pass setup and assert `source === "consistency-action-items-with-feedback"` with both stashed `actionableItems` and collected `answers` in the constructed `IntegrateIntoSpecInput`.
- [ ] Update `itx.spec-doc.ITX-SD-013.spec.ts`: add a mixed-aggregate child-result variant; assert transition is to `NumberedOptionsHumanRequest` with stashed items; assert post-queue-exhaustion transition to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"`.
- [ ] Update `itx.spec-doc.ITX-SD-016.spec.ts`: update mixed-aggregate assertion to reflect questions-first routing; assert stashed actionable items and `source: "consistency-action-items-with-feedback"` after queue exhaustion.
- [ ] Implement harness parity test for `GS-SD-004A`: mixed-aggregate child result → `NumberedOptionsHumanRequest` → answer all questions → `IntegrateIntoSpec` with combined input.
- [ ] Update shared coverage note in test suite to reference both `GS-SD-004` and `GS-SD-004A`.
- [ ] Verify `B-SD-INPUT-005` is exercised by at least one integration-primary test (`ITX-SD-007` or `ITX-SD-013`).
- [ ] Verify `GS-SD-004A` passes in both deterministic harness and (when available) black-box parity modes.

## Required Artifacts
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts`

## Acceptance Criteria
- `ITX-SD-007` exercises a mixed-aggregate pass and asserts all four `IntegrateIntoSpecInput` source modes including `"consistency-action-items-with-feedback"`.
- `ITX-SD-013` exercises a mixed-aggregate child-result variant and asserts questions-first parent routing with stash, followed by post-queue-exhaustion `IntegrateIntoSpec` transition with correct source.
- `ITX-SD-016` exercises a mixed-aggregate final planning result and asserts questions-first routing with stashed actionable items for later delivery.
- `GS-SD-004A` harness parity test passes end-to-end: child returns both arrays → questions asked → answers collected → integration includes both stashed items and answers.
- `GS-SD-004A` assertions match:
  - Event stream shows `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → NumberedOptionsHumanRequest → IntegrateIntoSpec` for that pass.
  - Feedback child runs launched for each follow-up question.
  - Stashed `actionableItems` forwarded unchanged and in order.
  - Collected `answers` included in integration input.
  - `source === "consistency-action-items-with-feedback"` on integration input.
- Shared coverage note references both `GS-SD-004` and `GS-SD-004A`.
- All updated integration tests pass deterministically in CI with copilot prompt test doubles.

## Spec/Behavior Links
- Spec: sections 6.3, 6.4, 6.5, 7.1, 10.2 (AC-2A, AC-8, AC-10).
- Behaviors: `B-SD-TRANS-003`, `B-SD-CHILD-004`, `B-SD-INPUT-005`.
- Integration tests: `ITX-SD-007`, `ITX-SD-013`, `ITX-SD-016`.
- Golden scenarios: `GS-SD-004A`.

## Fixed Implementation Decisions
- Integration test doubles configure deterministic child results with known `actionableItems` and `followUpQuestions` arrays for the mixed-aggregate variant.
- Feedback response controller provides programmatic answers for all enqueued follow-up questions to drive queue exhaustion.
- `GS-SD-004A` parity test file is named `gs.spec-doc.GS-SD-004A.spec.ts` following existing naming conventions.
- Mixed-aggregate parity is shared between deterministic harness coverage in `packages/workflow-app-builder/test/integration/spec-doc/` and black-box parity in the workflow-server suite.

## Interface/Schema Contracts
- No new runtime schema or contract changes in this task (all contract changes are delivered in `SDB-25`).
- Test doubles must produce `ConsistencyCheckOutput` instances with both non-empty `actionableItems` and non-empty `followUpQuestions` for mixed-aggregate test variants.
- Assertions validate `IntegrateIntoSpecInput` contract conformance including `source`, `actionableItems`, and `answers` field presence.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
  - Add mixed-aggregate pass to multi-pass setup.
  - Add assertions for `source === "consistency-action-items-with-feedback"` with both `actionableItems` and `answers`.
  - Add `B-SD-INPUT-005` to related behaviors comment.
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
  - Add mixed-aggregate child-result variant to configured test doubles.
  - Add assertions: transition to `NumberedOptionsHumanRequest` with stash, post-exhaustion to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"`.
  - Add `B-SD-INPUT-005` to related behaviors comment.
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Update mixed-aggregate assertion from IntegrateIntoSpec-priority to questions-first routing.
  - Assert stashed items and correct source after queue exhaustion.

### Create
- `packages/workflow-app-builder/test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts`
  - Full golden scenario: mixed-aggregate child result → NumberedOptionsHumanRequest → answer all → IntegrateIntoSpec with combined input.
  - Assertions per `GS-SD-004A` in behaviors doc.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
  - Expected: all four input normalization passes asserted correctly including mixed-aggregate pass.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
  - Expected: mixed-aggregate variant routes to `NumberedOptionsHumanRequest` with stash; post-exhaustion routes to `IntegrateIntoSpec` with correct source.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: mixed-aggregate assertion reflects questions-first routing with stash and correct source.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts`
  - Expected: golden scenario passes end-to-end with all `GS-SD-004A` assertions satisfied.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-QFC-001-ITX007MixedAggregatePass | `test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts` | mixed-aggregate pass asserts `source === "consistency-action-items-with-feedback"` with both `actionableItems` and `answers`. |
| SD-QFC-002-ITX013MixedAggregateRouting | `test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts` | mixed-aggregate child result routes to `NumberedOptionsHumanRequest` with stash; post-exhaustion routes correctly. |
| SD-QFC-003-ITX016MixedAggregateUpdate | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | mixed-aggregate assertion reflects questions-first routing with stashed items. |
| SD-QFC-004-GS004AEventStream | `test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts` | event stream shows `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → NumberedOptionsHumanRequest → IntegrateIntoSpec`. |
| SD-QFC-005-GS004AFeedbackRuns | `test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts` | feedback child runs launched for each follow-up question. |
| SD-QFC-006-GS004AStashedItems | `test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts` | stashed `actionableItems` forwarded unchanged and in order to `IntegrateIntoSpec`. |
| SD-QFC-007-GS004ACollectedAnswers | `test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts` | collected `answers` from `NumberedOptionsHumanRequest` included in integration input. |
| SD-QFC-008-GS004ACorrectSource | `test/integration/spec-doc/gs.spec-doc.GS-SD-004A.spec.ts` | `source === "consistency-action-items-with-feedback"` on integration input. |
| SD-QFC-009-BSDINPUT005Coverage | `test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts` or `itx.spec-doc.ITX-SD-013.spec.ts` | `B-SD-INPUT-005` exercised by at least one integration-primary test. |
