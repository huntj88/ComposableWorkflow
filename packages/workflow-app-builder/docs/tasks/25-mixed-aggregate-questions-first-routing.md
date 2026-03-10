# SDB-25 - Mixed-Aggregate Questions-First Routing

## Depends On
- `SDB-15`
- `SDB-20`
- `SDB-22`

## Objective
Replace the parent routing rule that prioritized `IntegrateIntoSpec` for mixed aggregates with a questions-first model: when the delegated child returns both non-empty `actionableItems` and non-empty `followUpQuestions`, the parent routes to `NumberedOptionsHumanRequest` first, stashes the actionable items in workflow state, resolves follow-up questions, and then delivers both the stashed actionable items and collected answers to `IntegrateIntoSpec` using the new `source: "consistency-action-items-with-feedback"`.

## Supersedes
- `SDB-20` routing precedence rule: "aggregate `actionableItems` always force `IntegrateIntoSpec` routing for that pass" is replaced by "aggregate `followUpQuestions` always force `NumberedOptionsHumanRequest` routing regardless of whether `actionableItems` is also non-empty".

## Motivation
Routing mixed aggregates directly to `IntegrateIntoSpec` discarded human-decision questions that the child explicitly surfaced. The questions-first model resolves all human decisions before integration, producing higher-quality spec edits because the integration pass has both the actionable edit directives and the resolved human decisions in a single operation.

## Implementation Tasks
- [x] Add `"consistency-action-items-with-feedback"` to the `IntegrateIntoSpecInput.source` union type in `contracts.ts`.
- [x] Add `stashedActionableItems` field to `SpecDocWorkflowStateData` for persisting actionable items across `NumberedOptionsHumanRequest` processing.
- [x] Update parent routing in `logical-consistency-check.ts`: when aggregate `followUpQuestions` is non-empty and `actionableItems` is also non-empty, stash `actionableItems` in workflow state and transition to `NumberedOptionsHumanRequest`.
- [x] Update queue-exhaustion routing in `numbered-options-human-request.ts`: when stashed actionable items exist, transition to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"`, including both stashed items and collected answers.
- [x] Update re-entry with exhausted queue in `numbered-options-human-request.ts`: apply the same stash-aware source logic.
- [x] Add `source: "consistency-action-items-with-feedback"` handling to `integrate-into-spec.ts`: accept both `actionableItems` and `answers` together, apply actionable items as ordered edit directives while integrating answer-provided context.
- [x] Update `spec-integration-input.schema.json`: add new source to enum, express conditional requirements (`answers` and `actionableItems` both required when source is `consistency-action-items-with-feedback`).
- [x] Update prompt template interpolation variable comment for `{{actionableItemsJson}}` to include both source types (already done in spec doc).
- [x] Clear `stashedActionableItems` from workflow state after delivery to `IntegrateIntoSpec`.
- [x] Add unit tests for mixed-aggregate parent routing in `logical-consistency-check.test.ts`.
- [x] Add unit tests for stash-aware queue-exhaustion routing in `numbered-options-human-request.test.ts`.
- [x] Add unit tests for combined source mode in `integrate-into-spec.test.ts`.
- [x] Update `PlanResolution` prompt rule 5 in `spec-doc.consistency-resolution.v1` template: replace "some work can proceed immediately" with guidance that the parent resolves human questions first and then applies both actionable items and answered decisions together in a single integration pass.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/docs/schemas/spec-doc/spec-integration-input.schema.json`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`

## Acceptance Criteria
- When the delegated child aggregate contains both non-empty `actionableItems` and non-empty `followUpQuestions`, the parent transitions to `NumberedOptionsHumanRequest` instead of `IntegrateIntoSpec`.
- Actionable items are stashed in workflow state data and are not discarded or modified during `NumberedOptionsHumanRequest` processing.
- After queue exhaustion with stashed actionable items present, the parent transitions to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"`.
- The `IntegrateIntoSpecInput` for a mixed-aggregate pass includes both `actionableItems` (unchanged, in child-provided order) and `answers` (normalized records from queue processing).
- `IntegrateIntoSpec` applies actionable items as ordered edit directives while also integrating the human-provided answers in the same pass.
- Re-entry with exhausted queue correctly uses `source: "consistency-action-items-with-feedback"` when stashed items are present, and `source: "numbered-options-feedback"` when no stashed items exist.
- Stashed actionable items are cleared from workflow state after delivery to `IntegrateIntoSpec`.
- Existing `source: "workflow-input"`, `source: "numbered-options-feedback"`, and `source: "consistency-action-items"` paths continue to behave unchanged.
- `spec-integration-input.schema.json` requires both `actionableItems` and `answers` when `source === "consistency-action-items-with-feedback"`.
- Unit tests cover all four `IntegrateIntoSpec` source modes.
- Unit tests cover parent routing for the mixed-aggregate case with stash verification.
- Unit tests cover queue-exhaustion routing with and without stashed items.

## Spec/Behavior Links
- Spec: sections 2 (constraints), 5.3 (contract rules), 6.1 (PlantUML), 6.2 (state semantics), 6.3 (transition guards), 6.4 (execution model), 6.5 (input contract), 7.1 (schema usage), 7.2.1 (prompt template), 10.1 (invariants), 10.2 (AC-2A, AC-8, AC-10, AC-11).
- Behaviors: `B-SD-TRANS-003`, `B-SD-TRANS-006`, `B-SD-CHILD-004`, `B-SD-INPUT-004`, `B-SD-INPUT-005`.
- Integration tests: `ITX-SD-007`, `ITX-SD-013`, `ITX-SD-016`.

## Fixed Implementation Decisions
- Stashed actionable items are stored in `SpecDocWorkflowStateData` as a serializable array, not as a transient in-memory reference.
- Stashed items are immutable during `NumberedOptionsHumanRequest` processing — no reordering, filtering, or modification.
- `source` selection is explicit based on stash presence, not inferred from ad-hoc field presence.
- The prompt template receives both `{{answersJson}}` and `{{actionableItemsJson}}` when `source === "consistency-action-items-with-feedback"`.
- Clearing stashed items after delivery prevents them from leaking into subsequent consistency passes.
- The three existing routing cases from `LogicalConsistencyCheckCreateFollowUpQuestions` remain two outbound transitions (`→ IntegrateIntoSpec` and `→ NumberedOptionsHumanRequest`); the mixed-aggregate case uses the `→ NumberedOptionsHumanRequest` transition.

## Interface/Schema Contracts
- `IntegrateIntoSpecInput.source` union: `"workflow-input" | "numbered-options-feedback" | "consistency-action-items" | "consistency-action-items-with-feedback"`.
- `actionableItems` is required when `source === "consistency-action-items"` or `source === "consistency-action-items-with-feedback"`.
- `answers` is required when `source === "consistency-action-items-with-feedback"`.
- `SpecDocWorkflowStateData` gains `stashedActionableItems?: SpecActionableItem[]` for cross-state persistence during `NumberedOptionsHumanRequest` processing.
- `spec-integration-input.schema.json` must express conditional requirements for the new source value so runtime validation and task expectations cannot drift.
- Output contract remains `spec-integration-output.schema.json` (unchanged).

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
  - Add `"consistency-action-items-with-feedback"` to `IntegrateIntoSpecInput.source` union.
  - Add `stashedActionableItems?: SpecActionableItem[]` to `SpecDocWorkflowStateData`.
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
  - Change mixed-aggregate routing from `IntegrateIntoSpec` to `NumberedOptionsHumanRequest`.
  - Stash `actionableItems` in state data when both arrays are non-empty.
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
  - Update queue-exhaustion transition to check for stashed actionable items and use correct `source`.
  - Update re-entry with exhausted queue to apply the same stash-aware source logic.
  - Include stashed items in `IntegrateIntoSpecInput` construction.
  - Clear stashed items from state after delivery.
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
  - Add `source: "consistency-action-items-with-feedback"` input construction handling.
  - Forward both `actionableItems` and `answers` to prompt interpolation.
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
  - Update `{{actionableItemsJson}}` comment to reference both source types.
  - Update `PlanResolution` prompt rule 5 in `spec-doc.consistency-resolution.v1` template constant: replace temporal "some work can proceed immediately" wording with guidance that the parent resolves questions first and applies both together.
- `packages/workflow-app-builder/docs/schemas/spec-doc/spec-integration-input.schema.json`
  - Add `"consistency-action-items-with-feedback"` to source enum.
  - Add conditional requirement: both `actionableItems` and `answers` required for new source.
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
  - Add test: mixed aggregate routes to `NumberedOptionsHumanRequest` with stashed items.
  - Update existing test: actionable-items-only still routes to `IntegrateIntoSpec`.
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`
  - Add test: queue exhaustion with stashed items uses `"consistency-action-items-with-feedback"`.
  - Add test: queue exhaustion without stashed items uses `"numbered-options-feedback"`.
  - Add test: re-entry with exhausted queue applies stash-aware source logic.
  - Add test: stashed items cleared after delivery.
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`
  - Add test: `source: "consistency-action-items-with-feedback"` accepts both `actionableItems` and `answers`.
  - Verify all four source modes pass with correct contract construction.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/logical-consistency-check.test.ts`
  - Expected: mixed aggregate routes to `NumberedOptionsHumanRequest` with stashed items; actionable-items-only routes to `IntegrateIntoSpec`.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/numbered-options-human-request.test.ts`
  - Expected: queue exhaustion uses correct source based on stash presence; stashed items cleared after delivery.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/integrate-into-spec.test.ts`
  - Expected: all four `IntegrateIntoSpec` source modes pass with correct contract construction.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-QF-001-MixedAggregateRoutesToQuestions | `src/workflows/spec-doc/states/logical-consistency-check.ts` | mixed aggregate transitions to `NumberedOptionsHumanRequest`, not `IntegrateIntoSpec`. |
| SD-QF-002-ActionableItemsStashed | `src/workflows/spec-doc/states/logical-consistency-check.ts` | `stashedActionableItems` populated in state data when mixed aggregate is routed. |
| SD-QF-003-QueueExhaustionWithStash | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | queue exhaustion with stashed items uses `source: "consistency-action-items-with-feedback"`. |
| SD-QF-004-QueueExhaustionWithoutStash | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | queue exhaustion without stashed items uses `source: "numbered-options-feedback"`. |
| SD-QF-005-ReEntryStashAware | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | re-entry with exhausted queue applies stash-aware source logic. |
| SD-QF-006-StashCleared | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | `stashedActionableItems` cleared from state after delivery to `IntegrateIntoSpec`. |
| SD-QF-007-CombinedSourceHandling | `src/workflows/spec-doc/states/integrate-into-spec.ts` | `source: "consistency-action-items-with-feedback"` forwards both `actionableItems` and `answers` to prompt. |
| SD-QF-008-SourceUnionExtended | `src/workflows/spec-doc/contracts.ts` | `IntegrateIntoSpecInput.source` union includes all four values. |
| SD-QF-009-SchemaConditionalRequirements | `docs/schemas/spec-doc/spec-integration-input.schema.json` | both `actionableItems` and `answers` required for new source value. |
| SD-QF-010-ExistingSourceModesUnchanged | `test/workflows/spec-doc/integrate-into-spec.test.ts` | `workflow-input`, `numbered-options-feedback`, and `consistency-action-items` paths pass unchanged. |
| SD-QF-011-FourModeUnitCoverage | `test/workflows/spec-doc/integrate-into-spec.test.ts` | all four source modes covered with correct contract assertions. |
| SD-QF-012-MixedAggregateRoutingUnitCoverage | `test/workflows/spec-doc/logical-consistency-check.test.ts` | unit test covers mixed aggregate routing with stash verification. |
| SD-QF-013-StashAwareExhaustionUnitCoverage | `test/workflows/spec-doc/numbered-options-human-request.test.ts` | unit tests cover queue exhaustion routing with and without stashed items. |
| SD-QF-014-PlanResolutionPromptUpdate | `src/workflows/spec-doc/prompt-templates.ts` | `PlanResolution` rule 5 no longer says "some work can proceed immediately"; updated to describe questions-first-then-integrate-together model. |
