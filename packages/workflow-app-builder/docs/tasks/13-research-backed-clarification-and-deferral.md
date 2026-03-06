# SDB-13 - Research-Backed Clarification and Deferred Question Revisit

## Depends On
- `SDB-05`
- `SDB-06`
- `SDB-08`
- `SDB-12`

## Objective
Implement the post-spec-update clarification model where question-like custom prompts trigger repository/spec research first, may resolve without emitting a new human follow-up, and defer the source numbered question until the research detour completes.

## Implementation Tasks
- [ ] Extend custom prompt classification to support `unrelated-question` in addition to existing intents.
- [ ] Normalize question-intent payloads into `customQuestionText` for handoff into clarification research.
- [ ] Extend clarification output handling to require `researchOutcome` and `researchSummary`, with optional `followUpQuestion`.
- [ ] Persist research-only outcomes separately from normalized answers as `researchNotes[]` entries with `sourceQuestionId`, `intent`, `questionText`, `researchSummary`, and `recordedAt`.
- [ ] Add deferred-question stack handling so deferred source questions are revisited before older unresolved items or terminal queue exhaustion, while reusing an existing deferred entry instead of pushing duplicates.
- [ ] Update the clarification prompt template contract so research runs receive `request`, optional `specPath`, normalized `customQuestionText`, intent, and workspace-context access instructions before deciding whether to emit a follow-up.
- [ ] Emit observability for research-only outcomes.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/classify-custom-prompt.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/expand-question-with-clarification.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/classify-custom-prompt.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/expand-question-with-clarification.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`

## Acceptance Criteria
- Classification supports `clarifying-question`, `unrelated-question`, and `custom-answer` with schema-validated routing.
- `ExpandQuestionWithClarification` branches only from `structuredOutput.researchOutcome`.
- Research-only outcomes create `researchNotes[]` entries with `sourceQuestionId`, `intent`, `questionText`, `researchSummary`, and `recordedAt`, and do not auto-populate `IntegrateIntoSpec.answers`.
- Deferred source questions are revisited before terminal queue exhaustion is evaluated and are not duplicated on the deferred-question stack.
- Generated follow-up questions remain immediate-next, deterministic, and immutable relative to the source question.
- The clarification prompt template includes `request`, optional `specPath`, `customQuestionText`, and `intent`, and instructs research against available workspace/spec context before deciding whether a follow-up is needed.

## Spec/Behavior Links
- Spec: sections 6.2, 6.3, 6.4, 7.1, 7.2.3, 7.2.4, 9.
- Behaviors: `B-SD-TRANS-008`, `B-SD-TRANS-010`, `B-SD-TRANS-013`, `B-SD-TRANS-014`, `B-SD-TRANS-015`, `B-SD-OBS-001`.

## Fixed Implementation Decisions
- `structuredOutput.intent` remains the only routing authority for `ClassifyCustomPrompt`.
- For question intents, `structuredOutput.customQuestionText` is the normalized payload passed into clarification research.
- `structuredOutput.researchOutcome` remains the only routing authority for `ExpandQuestionWithClarification`.
- Deferred source questions are tracked with a LIFO revisit stack.
- A source question already present on the deferred stack is not pushed again; repeated research detours reuse the existing deferred entry.
- `researchNotes[]` is audit/observability data, not direct integration input.

## Interface/Schema Contracts
- Classification schema: `custom-prompt-classification-output.schema.json` with `intent`, `customQuestionText`, and `customAnswerText` constraints.
- Clarification schema: `clarification-follow-up-output.schema.json` with required `researchOutcome` + `researchSummary` and optional `followUpQuestion`.
- When `researchOutcome === "needs-follow-up-question"`, `followUpQuestion` must satisfy base numbered-question schema and receive workflow-assigned `kind: "issue-resolution"`.
- `researchNotes[]` entries must persist `sourceQuestionId`, `intent`, `questionText`, `researchSummary`, and `recordedAt` as audit/observability data separate from normalized answers.
- The `spec-doc.expand-clarification.v1` prompt must interpolate `request`, optional `specPath`, `sourceQuestionId`, `sourceQuestionPrompt`, `sourceOptionsJson`, `customQuestionText`, and `intent`, and must instruct repository/spec research before any follow-up-question generation.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/docs/schemas/spec-doc/custom-prompt-classification-output.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/clarification-follow-up-output.schema.json`
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/classify-custom-prompt.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/expand-question-with-clarification.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/classify-custom-prompt.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/expand-question-with-clarification.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/classify-custom-prompt.test.ts`
  - Expected: all three intents validate and route correctly.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/expand-question-with-clarification.test.ts`
  - Expected: research-only and follow-up-generating outcomes both validate and route correctly.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/numbered-options-human-request.test.ts`
  - Expected: deferred-question stack blocks terminal exhaustion and revisits deferred questions first.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-RES-001-UnrelatedIntentClassification | `src/workflows/spec-doc/states/classify-custom-prompt.ts` | `unrelated-question` routes through validated intent handling only. |
| SD-RES-002-CustomQuestionNormalization | `src/workflows/spec-doc/contracts.ts` | question intents expose `customQuestionText` for downstream research. |
| SD-RES-003-ResearchOutcomeBranching | `src/workflows/spec-doc/states/expand-question-with-clarification.ts` | clarification routing branches only from `researchOutcome`. |
| SD-RES-004-ResearchNotesPersistence | `src/workflows/spec-doc/state-data.ts` | research-only outcomes are stored separately from normalized answers with the full `researchNotes[]` audit fields. |
| SD-RES-005-DeferredQuestionPrecedence | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | deferred source questions are revisited before terminal exhaustion and are not duplicated on the stack. |
| SD-RES-006-ClarificationPromptResearchContext | `src/workflows/spec-doc/prompt-templates.ts` | the clarification prompt receives request/spec/question context and instructs research before deciding on a follow-up. |
| SD-RES-007-ResearchObservability | `src/workflows/spec-doc/observability.ts` | research result logged events are emitted with workflow context. |