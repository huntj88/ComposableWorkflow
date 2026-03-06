# SDB-08 - Observability and Prompt Traceability

## Depends On
- `SDB-02`
- `SDB-03`
- `SDB-04`
- `SDB-05`
- `SDB-06`
- `SDB-07`

## Objective
Emit required run/state/question/prompt observability events with stable ordering and prompt-template traceability metadata.

## Implementation Tasks
- [x] Emit `state.entered` for every state entry with run/workflow/state/sequence fields.
- [x] Emit events for question generation, response receipt, integration pass completion, consistency outcomes, classification outcomes, clarification generation, terminal state.
- [x] Include prompt template IDs for each copilot delegation event.
- [x] Preserve shared runtime event naming/shape for common events (`workflow.started`, `state.entered`, `transition.completed`, `child.failed`, cancellation linkage events), and add spec-doc-specific payload fields through event payload extension only.
- [x] Add event-ordering assertions and template traceability tests.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/observability.test.ts`
- `packages/workflow-server/test/integration/workflows/spec-doc-observability.spec.ts`

## Acceptance Criteria
- Event stream includes all major operations listed in behavior section 10.
- Template IDs are stable/versioned and present on delegation events/logs.
- Event sequence ordering is monotonic for each run.

## Spec/Behavior Links
- Spec: section 9, implementation note in section 7.2.
- Behaviors: `B-SD-OBS-001`, `B-SD-OBS-002`, `B-SD-COPILOT-003`.

## Fixed Implementation Decisions
- Prompt template IDs are emitted as explicit event payload fields, not inferred from prompt text.
- Sequence monotonicity relies on runtime event index plus run-local ordering assertions.
- Observability helpers are shared across state handlers.
- Event naming remains aligned with shared runtime contracts; this task does not introduce parallel/duplicate event taxonomies.

## Interface/Schema Contracts
- Event payload minimum: `{ runId, workflowType, state, sequence }`.
- Delegation event payload extends with `{ promptTemplateId, outputSchemaId }`.
- Required observable events include entry, transition completion, child failure linkage, question generation/response, integration pass completion, consistency outcome, classification outcome, clarification generation, and terminal completion/failure.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/observability.test.ts`
- `packages/workflow-server/test/integration/workflows/spec-doc-observability.spec.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/classify-custom-prompt.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/expand-question-with-clarification.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/done.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- observability`
  - Expected: state and operation events are emitted with required fields and ordering.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- spec-doc-observability`
  - Expected: template IDs are present in integration event payloads/log records.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-OBS-001-StateEntryEvents | `src/workflows/spec-doc/observability.ts` | every FSM entry emits `state.entered` with required fields. |
| SD-OBS-002-OperationalEvents | `src/workflows/spec-doc/observability.ts` | generation/response/pass/classification/terminal operations are all emitted. |
| SD-OBS-003-TemplateTraceability | `src/workflows/spec-doc/observability.ts` | prompt delegation events include stable template IDs. |
| SD-OBS-004-MonotonicOrdering | `test/workflows/spec-doc/observability.test.ts` | sequence values remain monotonic per run. |
