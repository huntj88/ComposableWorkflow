# SDB-28 - Schema-Level Pros/Cons Enforcement

## Depends On
- `SDB-27`

## Objective
Move the `Pros:` / `Cons:` description validation from code-level contract checks into JSON Schema `pattern` constraints so that violations are caught during `app-builder.copilot.prompt.v1` in-session retry rather than failing the workflow after the copilot-prompt child has already completed.

## Motivation
Workflow run `wr_01KKAVQFW81FX9C2R0DB34KSEV` failed at the second `LogicalConsistencyCheckCreateFollowUpQuestions` pass because the `constraints-assumptions-consistency` stage's child workflow produced follow-up questions where every option for Q1 and Q2 was missing `Pros:` and `Cons:` content in the `description` field.

The existing `validateProsConsDescriptions()` code-level validator in `consistency-follow-up-child.ts` caught the violation, but the JSON Schema had no corresponding constraint. Because `app-builder.copilot.prompt.v1` validates structured output against the `outputSchema` during its in-session retry loop (`MAX_SCHEMA_RETRIES = 2`), the retry never triggered — the schema passed, and the violation was only detected afterwards in the workflow state handler, where no retry is possible.

By encoding the `Pros:` / `Cons:` requirement as a schema-level `pattern` constraint, the copilot-prompt child's existing retry loop catches violations and re-prompts the model, giving it up to 2 additional attempts to produce conforming output before the workflow fails.

## Implementation Tasks
- [x] **`numbered-question-item.schema.json`**: Add `required: ["description"]` and `pattern: "(?=.*Pros:)(?=.*Cons:)"` on option items within the `allOf` block. This propagates to all 6 scoped consistency output schemas and the aggregate `consistency-check-output.schema.json` via `$ref` and `bundleSchemaForExport`.
- [x] **`clarification-follow-up-output.schema.json`**: Change `followUpQuestion` from a simple `$ref` to `allOf` with the server base schema plus the same Pros/Cons `pattern` constraint on option descriptions. This schema references the server-owned base schema directly (not the app-builder extension), so the constraint must be applied inline.
- [x] **`prompt-templates.ts`**: Add explicit Pros/Cons instruction to `createScopedConsistencyBody` stage rules, `CONSISTENCY_RESOLUTION_BODY` (rule 8), and `EXPAND_CLARIFICATION_BODY` (rule 7). This gives the model first-attempt guidance in addition to schema enforcement.
- [x] **`logical-consistency-check.test.ts`**: Update assertion from `'Child aggregate contract validation failed'` to `'Output schema validation failed'` — violations are now caught at schema level, not contract level.
- [x] **`expand-question-with-clarification.test.ts`**: Update assertion from `'Pros/Cons validation failed'` to `'Output schema validation failed'` — same schema-level enforcement shift.
- [x] **Spec doc** (`spec-doc-generation-workflow.md`): Add schema ownership note for Pros/Cons pattern, update common prompt rules with dual-enforcement note, add Pros/Cons rules to PlanResolution and ExpandClarification prompt text, add validation behavior note.
- [x] **Behaviors doc** (`spec-doc-behaviors.md`): Expand `B-SD-SCHEMA-006` with 3 new `**And**` clauses (schema-level pattern enforcement, copilot-prompt retry integration, prompt restatement). Update coverage matrix entry.
- [x] **Integration tests doc** (`spec-doc-integration-tests.md`): Expand `ITX-SD-001` to cover Pros/Cons pattern violations as a schema failure mode. Expand `ITX-SD-011` to note schema-level enforcement via pattern constraint and copilot-prompt retry interaction.

## Required Artifacts
- `packages/workflow-app-builder/docs/schemas/spec-doc/numbered-question-item.schema.json`
- `packages/workflow-app-builder/docs/schemas/spec-doc/clarification-follow-up-output.schema.json`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/expand-question-with-clarification.test.ts`
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`

## Acceptance Criteria
- `numbered-question-item.schema.json` option items require `description` and enforce `(?=.*Pros:)(?=.*Cons:)` via `pattern`.
- `clarification-follow-up-output.schema.json` applies the same Pros/Cons `pattern` constraint on follow-up question option descriptions.
- All 3 prompt templates that produce numbered questions include explicit Pros/Cons instructions.
- Schema violations for missing Pros/Cons content trigger `app-builder.copilot.prompt.v1` in-session retry (up to `MAX_SCHEMA_RETRIES` additional attempts) instead of failing the parent workflow immediately.
- `validateProsConsDescriptions()` remains as defense-in-depth but is no longer the primary enforcement path.
- All existing unit and integration tests pass: `pnpm --filter workflow-app-builder exec vitest run` (546 tests) and `pnpm --filter workflow-server exec vitest run` (176 tests).
- Spec doc, behaviors doc, and integration tests doc are updated to reflect schema-level Pros/Cons enforcement.
