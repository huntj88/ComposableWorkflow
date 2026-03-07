# SDB-16 - Delegated Consistency/Follow-Up Child Workflow

## Depends On
- `SDB-04`
- `SDB-08`
- `SDB-15`

## Objective
Replace the current single-pass consistency-check behavior with the delegated child workflow contract from the spec, including layered prompt execution, contract enforcement, parent routing from the child aggregate result, and child/stage observability.

## Implementation Tasks
- [x] Implement internal child workflow `app-builder.spec-doc.consistency-follow-up.v1` with ordered prompt-layer execution.
- [x] Add `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` support and stage metadata propagation.
- [x] Aggregate executed-layer outputs, including `blockingIssues`, `actionableItems`, `followUpQuestions`, and readiness-checklist logical-AND merging.
- [x] Enforce child input rules: `specPath` comes from the latest integration pass, `remainingQuestionIds` comes from latest integration metadata, and `loopCount` is forwarded unchanged to every executed layer.
- [x] Fail explicitly on duplicate `itemId` / `questionId`, mixed actionable/question output, and other child contract violations.
- [x] Short-circuit later prompt layers when any executed layer returns non-empty `actionableItems`.
- [x] Update parent `LogicalConsistencyCheckCreateFollowUpQuestions` to route to `IntegrateIntoSpec` for non-empty `actionableItems`, otherwise to `NumberedOptionsHumanRequest`.
- [x] Emit delegated child workflow and per-stage observability with `childWorkflowType` and `stageId` metadata.
- [x] Extend unit/state tests for parent routing and child contract enforcement.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/observability.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/contracts.test.ts`

## Acceptance Criteria
- Parent routing from `LogicalConsistencyCheckCreateFollowUpQuestions` is driven only by the child aggregate result.
- Non-empty `actionableItems` transition directly to `IntegrateIntoSpec` with no question queue entry for that pass.
- Empty `actionableItems` and non-empty `followUpQuestions` transition to `NumberedOptionsHumanRequest` unchanged and in order.
- Empty `actionableItems` and empty `followUpQuestions` synthesize exactly one completion-confirmation queue item.
- `blockingIssues` are aggregated in executed-stage order and de-duplicated by `blockingIssues[].id`.
- `readinessChecklist` aggregation is field-wise logical AND across executed stages.
- `remainingQuestionIds` passed into the child is sourced from the latest persisted integration metadata rather than recomputed ad hoc in the child.
- Later layers do not execute after an actionable-item short-circuit.
- Duplicate ids and mixed actionable/question results fail before parent branching.
- Child/stage observability includes `childWorkflowType` and `stageId` where applicable.

## Spec/Behavior Links
- Spec: sections 5.3, 6.2, 6.2.1, 6.3, 7.1 (`LogicalConsistencyCheckCreateFollowUpQuestions`), 7.2.2, 7.2.2.1, 9, 10.1, 10.2.
- Behaviors: `B-SD-TRANS-003`, `B-SD-TRANS-011`, `B-SD-CHILD-001`, `B-SD-CHILD-002`, `B-SD-CHILD-003`, `B-SD-OBS-003`, `B-SD-SCHEMA-001`.

## Fixed Implementation Decisions
- The delegated child remains implementation-owned and is not user-configurable in MVP.
- Prompt layers execute strictly in array order and may only be extended by appending new entries.
- Parent workflow logic must not inspect raw per-layer model text.
- Child contract violations are hard failures, not warnings or silent deduplications.
- Queue synthesis remains parent-owned only for the completion-confirmation fallback after an empty child result.

## Interface/Schema Contracts
- Child input contract: `ConsistencyFollowUpChildInput`.
- Child output contract: `ConsistencyCheckOutput` aggregate with mutually exclusive `actionableItems` / `followUpQuestions`.
- Each executed prompt layer uses `consistency-check-output.schema.json`.
- The child must stop on the first executed stage with non-empty `actionableItems`; only executed stages participate in aggregate merging and duplicate-id detection.
- Observability payloads include `{ childWorkflowType, stageId }` when emitted from child execution.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/observability.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/contracts.test.ts`

### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/logical-consistency-check.test.ts`
  - Expected: parent routing and completion synthesis follow the child aggregate contract.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: duplicate-id, mixed-result, short-circuit, and stage-aggregation semantics pass.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/observability.test.ts`
  - Expected: child and stage observability metadata is emitted with correct ordering.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-CHILD-001-LayeredExecution | `src/workflows/spec-doc/consistency-follow-up-child.ts` | prompt layers execute in ordered sequence with shared child input and stage metadata. |
| SD-CHILD-002-ShortCircuitOnActionableItems | `src/workflows/spec-doc/consistency-follow-up-child.ts` | later layers are skipped after first non-empty `actionableItems` result. |
| SD-CHILD-002A-BlockingIssueAggregation | `src/workflows/spec-doc/consistency-follow-up-child.ts` | `blockingIssues` aggregate in order and de-duplicate by id across executed stages. |
| SD-CHILD-002B-ReadinessChecklistAndMerge | `src/workflows/spec-doc/consistency-follow-up-child.ts` | readiness checklist fields merge with logical-AND semantics across executed stages. |
| SD-CHILD-003-DuplicateIdFailure | `src/workflows/spec-doc/consistency-follow-up-child.ts` | duplicate `itemId` / `questionId` values fail the child run before parent routing. |
| SD-CHILD-004-MixedResultFailure | `src/workflows/spec-doc/consistency-follow-up-child.ts` | mixed actionable/question output fails explicitly. |
| SD-CHILD-005-ParentRoutingFromAggregate | `src/workflows/spec-doc/states/logical-consistency-check.ts` | parent transition target is selected only from the child aggregate result. |
| SD-CHILD-006-ChildStageObservability | `src/workflows/spec-doc/observability.ts` | child/stage events include `childWorkflowType` and `stageId` with correct ordering. |
