# SDB-31 - Enrich answersJson with Question and Option Context

## Depends On
- `SDB-30`

## Objective
When building the `{{answersJson}}` interpolation variable for the `IntegrateIntoSpec` prompt, enrich each normalized answer with the original question prompt text and selected option labels from the question queue so the LLM receives actionable context instead of opaque IDs.

## Motivation
Currently `answersJson` serializes raw `NormalizedAnswer` objects:

```json
[
  { "questionId": "q-1", "selectedOptionIds": [2], "answeredAt": "2026-03-02T12:00:00Z" }
]
```

The LLM has no way to know what `q-1` asked or what option `2` meant. On the second pass of `IntegrateIntoSpec`, this makes the answers useless for the model.

After this change, each answer in `answersJson` will include the question text and selected option labels:

```json
[
  {
    "questionId": "q-1",
    "questionPrompt": "How should authentication be handled?",
    "selectedOptionIds": [2],
    "selectedOptions": [{ "id": 2, "label": "OAuth2 with PKCE" }],
    "answeredAt": "2026-03-02T12:00:00Z"
  }
]
```

## Fixed Implementation Decisions
- Enrichment is a prompt-assembly concern only — the persisted `NormalizedAnswer` records and `IntegrateIntoSpecInput.answers` contract remain unchanged.
- The enrichment function is a private helper inside `integrate-into-spec.ts`; it does not alter the `NormalizedAnswer` type or the `spec-integration-input.schema.json` schema.
- Question context is sourced from `stateData.queue` (`QuestionQueueItem[]`), which contains `prompt` and `options` from the consistency-check follow-up questions.
- If a queue item cannot be found for a given `questionId` (edge case), `questionPrompt` is `null` and `selectedOptions` is `[]`.
- If a `selectedOptionId` does not match any option in the queue item, the entry is `{ id, label: null }`.

## Interface/Schema Contracts
- `NormalizedAnswer` type — unchanged.
- `spec-integration-input.schema.json` — unchanged (schema validates persisted contract, not prompt-assembly shape).
- `IntegrateIntoSpecInput` type — unchanged.
- `QuestionQueueItem` — read-only usage (extends `NumberedQuestionItem` with `answered: boolean`).
- New enriched shape (prompt-only, not persisted):
  ```ts
  interface EnrichedPromptAnswer {
    questionId: string;
    questionPrompt: string | null;
    selectedOptionIds: number[];
    selectedOptions: Array<{ id: number; label: string | null }>;
    text?: string;
    answeredAt: string;
  }
  ```

## File Plan (Exact)
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
  - Add `enrichAnswersWithContext(answers, queue)` private helper.
  - Update `answersJson` variable construction from `JSON.stringify(integrationInput.answers ?? [])` to `JSON.stringify(enrichAnswersWithContext(integrationInput.answers ?? [], stateData.queue))`.
  - Add `NormalizedAnswer` and `QuestionQueueItem` imports from `../contracts.js`.
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`
  - Update `stateDataWithAnswers()` helper to include matching `queue` entries so enrichment can be verified.
  - Update SD-INT-002 assertions to verify `questionPrompt` and `selectedOptions` appear in prompt.
  - Update `SD-QF` assertions for `consistency-action-items-with-feedback` to verify enrichment of answers field.
  - Add test for missing queue item graceful fallback (`questionPrompt: null`, `selectedOptions: []`).
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
  - Update second pass and mixed-aggregate pass test cases to supply queue items and assert enriched `answersJson` shape in prompt.

## Implementation Tasks
- [x] **integrate-into-spec.ts**: Add `enrichAnswersWithContext()` private helper that joins answers with queue context.
- [x] **integrate-into-spec.ts**: Replace `JSON.stringify(integrationInput.answers ?? [])` with enriched serialization.
- [x] **integrate-into-spec.ts**: Add `NormalizedAnswer` and `QuestionQueueItem` to imports.
- [x] **integrate-into-spec.test.ts**: Update `stateDataWithAnswers()` to include queue items.
- [x] **integrate-into-spec.test.ts**: Update SD-INT-002 test assertions for enriched prompt content.
- [x] **integrate-into-spec.test.ts**: Update SD-QF combined-source test assertions.
- [x] **integrate-into-spec.test.ts**: Add test for missing queue item fallback.
- [x] **itx.spec-doc.ITX-SD-007.spec.ts**: Update second pass test to verify enriched answers.
- [x] **itx.spec-doc.ITX-SD-007.spec.ts**: Update mixed-aggregate pass test to verify enriched answers.
- [x] Verify all existing unit and integration tests pass after changes.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/integrate-into-spec.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/integrate-into-spec.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md` (section 6.5, 7.2.1 — already updated)
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md` (`B-SD-INPUT-006` — already added)
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md` (`ITX-SD-007` — already updated)

## Acceptance Criteria
- `answersJson` in the `IntegrateIntoSpec` prompt contains `questionPrompt` and `selectedOptions` for each answer when answers are non-empty.
- First pass and immediate-action pass still produce `answersJson === "[]"`.
- Persisted `NormalizedAnswer` records are unchanged — enrichment is prompt-assembly only.
- `spec-integration-input.schema.json` is unchanged.
- Missing queue item for a given `questionId` produces `{ questionPrompt: null, selectedOptions: [] }` without error.
- All existing unit tests in `integrate-into-spec.test.ts` pass (updated assertions).
- All existing integration tests in `itx.spec-doc.ITX-SD-007.spec.ts` pass (updated assertions).

## Verification
```bash
pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/integrate-into-spec.test.ts
pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts
```

## One-to-One Requirement Mapping

| Requirement | Primary artifact |
|---|---|
| B-SD-INPUT-006 enrichment function | `integrate-into-spec.ts` `enrichAnswersWithContext()` |
| B-SD-INPUT-006 prompt wiring | `integrate-into-spec.ts` `answersJson` variable |
| B-SD-INPUT-006 import additions | `integrate-into-spec.ts` imports |
| ITX-SD-007 enriched second pass | `itx.spec-doc.ITX-SD-007.spec.ts` second pass test |
| ITX-SD-007 enriched mixed-aggregate | `itx.spec-doc.ITX-SD-007.spec.ts` mixed-aggregate test |
| SD-INT-002 enriched prompt assertions | `integrate-into-spec.test.ts` SD-INT-002 |
| SD-QF enriched combined assertions | `integrate-into-spec.test.ts` SD-QF |
| Missing queue item fallback | `integrate-into-spec.test.ts` fallback test |

## Spec/Behavior Links
- Spec section 6.5: contract note on enriched `answersJson` shape
- Spec section 7.2.1: `{{answersJson}}` variable description updated
- `B-SD-INPUT-006`: new behavior for prompt answer enrichment
- `ITX-SD-007`: updated assertions for enriched answers in prompt
