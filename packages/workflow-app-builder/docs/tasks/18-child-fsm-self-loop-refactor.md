# SDB-18 - Child FSM Self-Loop Refactor

## Depends On
- `SDB-16`
- `SDB-16A`
- `SDB-17`

## Objective
Refactor `app-builder.spec-doc.consistency-follow-up.v1` from a single `start`-handler loop into an explicit child FSM that executes one prompt layer per `ExecutePromptLayer` state entry and self-loops until completion.

This task also becomes the canonical follow-on for any legacy task text that still described a single combined consistency prompt or parent-owned prompt sequencing.
It starts from the scoped-prompt baseline established in `SDB-16A`, not from the retired combined-prompt architecture.
It also owns the schema-binding cleanup that keeps each focused prompt layer on a narrow stage-specific output schema while preserving the broad aggregate child result contract for parent routing.

## Implementation Tasks
- [x] Introduce persisted child state data carrying `stageIndex`, aggregate output, and duplicate-detection sets.
- [x] Introduce stage-specific consistency output schemas and bind each `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` entry to its matching narrow `outputSchema`.
- [x] Refactor child workflow definition so `start` initializes state and transitions to `ExecutePromptLayer`.
- [x] Implement `ExecutePromptLayer` as a real child workflow state that executes exactly one configured prompt layer per entry.
- [x] Validate each `ExecutePromptLayer` result against the stage-specific schema, then merge it into the aggregate `ConsistencyCheckOutput` state.
- [x] Add self-loop transition from `ExecutePromptLayer` to itself when more stages remain and no actionable items were emitted.
- [x] Add terminal `Done` child state that completes with the aggregate result.
- [x] Preserve current contract enforcement, short-circuit semantics, and parent routing behavior.
- [x] Extend observability and integration coverage to assert explicit child-state progression.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/docs/schemas/spec-doc/consistency-scope-objective-output.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/consistency-non-goals-output.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/consistency-constraints-assumptions-output.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/consistency-interfaces-contracts-output.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/consistency-acceptance-criteria-output.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/consistency-contradictions-completeness-output.schema.json`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`

## Acceptance Criteria
- Child workflow has explicit runtime states `start`, `ExecutePromptLayer`, and `Done`.
- `start` performs initialization only and transitions immediately to `ExecutePromptLayer`.
- Each `ExecutePromptLayer` entry executes exactly one scoped consistency prompt layer.
- Each scoped consistency prompt layer delegates with its own narrow stage-specific output schema instead of the broad aggregate child schema.
- `ExecutePromptLayer` transitions to itself when more stages remain and the current aggregate has no actionable items.
- `ExecutePromptLayer` transitions to `Done` when actionable items short-circuit or the last stage completes.
- The broad `consistency-check-output.schema.json` contract is used only for the merged child result returned to the parent.
- Parent workflow behavior remains unchanged: parent still routes only from the child aggregate result.
- Scoped prompt/template behavior introduced by `SDB-16A` remains unchanged except for how child runtime state progression is modeled.

## Spec/Behavior Links
- Spec: sections 6.2.1, 7.2.2, 7.2.2.1.
- Behaviors: `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-CHILD-002`, `B-SD-CHILD-003`, `B-SD-OBS-003`.

## Fixed Implementation Decisions
- The self-looping child FSM remains implementation-owned and not runtime-configurable.
- Prompt-layer ordering remains append-only through `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS`.
- Each prompt-layer entry owns its own narrow `outputSchema`; the broad aggregate child schema is not passed directly to focused prompt layers.
- Terminal child states do not perform parent business routing; they only complete the child run.
- Completed tasks are not retroactively rewritten here; this task supersedes older task-language where the delegated child architecture has evolved.
- This task refactors runtime control flow only; it does not reintroduce any combined consistency prompt.

## Supersedes / Clarifies
- Supersedes legacy assumptions that a single combined consistency prompt is the authoritative delegated-child model.
- Supersedes legacy assumptions that every scoped prompt layer should still emit the full aggregate child schema surface.
- Clarifies that parent workflow semantics stay unchanged while child-owned prompt-layer execution becomes explicit runtime state progression.

## Interface/Schema Contracts
- Each `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` entry must declare `{ stageId, templateId, outputSchema, checklistKeys }`.
- Each stage-specific `consistency-*-output.schema.json` file must expose only that stage's owned `checklistKeys` in `readinessChecklist` while reusing shared issue/actionable-item/question definitions.
- `consistency-check-output.schema.json` remains the aggregate child-result schema returned from `Done` and consumed by the parent.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: explicit child state progression, narrow stage-schema binding, self-loop behavior, and contract enforcement pass.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
  - Expected: child runtime state progression, per-stage schema pairing, and aggregate-result validation are externally observable and deterministic.
