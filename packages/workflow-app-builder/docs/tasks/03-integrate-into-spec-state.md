# TSD03 - IntegrateIntoSpec State Implementation

## Depends On
- `TSD02`

## Objective
Implement `IntegrateIntoSpec` state execution including initial-pass and feedback-pass normalization, schema-validated output handling, and spec path carry-forward.

## Implementation Tasks
- [x] Build `IntegrateIntoSpecInput` from workflow input on first pass and normalized answers on later passes.
- [x] Delegate prompt execution using template `spec-doc.integrate.v1` and required output schema.
- [x] Validate output against `spec-integration-output.schema.json`.
- [x] Persist all required output fields from `spec-integration-output.schema.json`: `specPath`, `changeSummary`, `resolvedQuestionIds`, and `remainingQuestionIds`.
- [x] Increment integration pass artifact counters.
- [x] Pass `inputSchema = spec-integration-input.schema.json` to copilot delegation alongside `outputSchema`.
- [x] Forward `copilotPromptOptions` from workflow input to the copilot delegation call.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`

## Acceptance Criteria
- First pass uses `source: "workflow-input"` and carries request/targetPath/constraints.
- Subsequent pass uses `source: "numbered-options-feedback"`, includes normalized answers, and references prior `specPath`.
- Persisted `specPath` comes from schema-validated `structuredOutput.specPath` and points to a markdown artifact (`*.md`).
- `remainingQuestionIds` and `resolvedQuestionIds` from integration output are persisted in state data for consumption by downstream states (e.g., `LogicalConsistencyCheckCreateFollowUpQuestions` uses `remainingQuestionIds` for template interpolation).
- `inputSchema = spec-integration-input.schema.json` is provided in the copilot delegation call per spec section 7.1.
- Output schema failures hard-fail run with state context.

## Spec/Behavior Links
- Spec: sections 6.2 (IntegrateIntoSpec), 6.5, 7.1, 7.2.1.
- Behaviors: `B-SD-TRANS-001`, `B-SD-TRANS-002`, `B-SD-INPUT-001`, `B-SD-INPUT-002`, `B-SD-INPUT-003`, `B-SD-SCHEMA-001`.

## Fixed Implementation Decisions
- Source mode is computed from presence/absence of prior queue answers in persisted state.
- Prior accepted decisions are preserved through prompt context by always supplying current `specPath`.
- `targetPath` remains optional pass-through input context; file-path authority for each pass is `structuredOutput.specPath` from validated output.
- Integration pass count increments only on schema-valid successful delegation.

## Interface/Schema Contracts
- Delegation contract:
  - `templateId = spec-doc.integrate.v1`
  - `inputSchema = spec-integration-input.schema.json`
  - `outputSchema = spec-integration-output.schema.json`.
- State output stores `{ specPath, changeSummary, resolvedQuestionIds, remainingQuestionIds, integrationPasses }`, where `specPath` must satisfy markdown file rule.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- integrate-into-spec`
  - Expected: first/second pass input normalization and `specPath` carry-forward are correct.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- ITX-SD-007`
  - Expected: cross-pass normalization contract is validated in integration scope.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-INT-001-FirstPassSource | `src/workflows/spec-doc/states/integrate-into-spec.ts` | first execution emits `source: workflow-input` with base request fields. |
| SD-INT-002-FeedbackPassSource | `src/workflows/spec-doc/states/integrate-into-spec.ts` | re-entry uses `source: numbered-options-feedback` with normalized answers. |
| SD-INT-003-SpecPathCarryForward | `src/workflows/spec-doc/state-data.ts` | subsequent passes receive prior `specPath`. |
| SD-INT-004-IntegrationSchemaGate | `src/workflows/spec-doc/states/integrate-into-spec.ts` | output must satisfy `spec-integration-output.schema.json` or fail terminally. |
| SD-INT-005-RemainingQuestionIdsPersistence | `src/workflows/spec-doc/state-data.ts` | `remainingQuestionIds` from integration output are persisted for downstream consumption. |
| SD-INT-006-InputSchemaProvided | `src/workflows/spec-doc/states/integrate-into-spec.ts` | delegation call includes `inputSchema = spec-integration-input.schema.json`. |
