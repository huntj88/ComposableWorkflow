# SDB-27 - Prompt Template Trimming

## Depends On
- `SDB-24`
- `SDB-25`

## Objective
Reduce token cost and improve signal density across all hardcoded prompt templates in `prompt-templates.ts` by removing schema-redundant instructions, eliminating input-context echo blocks, deduplicating quality prose, and tightening the scoped-consistency stage rules. The spec doc prompt templates (section 7.2) are updated in parallel to stay aligned.

## Motivation
Current prompts contain significant bloat:
- **Schema-redundant instructions**: Structural rules already enforced by JSON schema validation (unique contiguous IDs, `kind` values, mutual exclusivity) are restated in prompt text, burning tokens without adding model guidance.
- **Input context echo blocks**: Every prompt has an "Input context" section that labels interpolation variables the model already sees inline after interpolation — pure overhead.
- **Duplicated quality prose**: `INTEGRATE_BODY` has a "You must" list and a "Spec quality requirements" list with overlapping concerns.
- **Repeated stage rules**: The 6 scoped consistency stages each emit the full stage-rules block (via `createScopedConsistencyBody`), including ~15 lines of identical text per invocation.

These reductions cut per-call token spend without changing model-observable behavior, because schema validation catches structural violations regardless of prompt wording.

## Implementation Tasks
- [x] **IntegrateIntoSpec prompt** (`spec-doc.integrate.v1`): Merge the 5-item "You must" list and the 5-item "Spec quality requirements" list into a single concise directive block. Remove the "Input context" label block (the interpolated values speak for themselves).
- [x] **Scoped consistency prompts** (6 templates via `createScopedConsistencyBody`): Remove schema-enforceable rules from the "Stage rules" block: unique contiguous IDs, `kind` value, per-option `description` format — these are schema-validated. Keep only model-behavioral guidance (mutual exclusivity intent, deterministic ordering, focus-area scoping). Remove the "Input context" label block.
- [x] **PlanResolution prompt** (`spec-doc.consistency-resolution.v1`): Remove the "Input context" label block. Remove rule about duplicate IDs (runtime dedup handles this per SDB-24). Tighten remaining rules to essential model guidance.
- [x] **ClassifyCustomPrompt prompt** (`spec-doc.classify-custom-prompt.v1`): Remove the "Input context" label block. Consolidate classification policy to essential distinctions only.
- [x] **ExpandQuestionWithClarification prompt** (`spec-doc.expand-clarification.v1`): Remove the "Input context" label block. Consolidate rules to essential research-first guidance.
- [x] Update spec doc section 7.2 prompt text blocks to match trimmed implementation templates.
- [x] Update `prompt-templates.test.ts` snapshot/content assertions to match trimmed bodies.
- [x] Verify all existing integration and unit tests still pass (prompt shrinkage must not break schema validation or routing behavior).

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md` (section 7.2 prompt text blocks)
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`

## Acceptance Criteria
- No prompt template contains an "Input context" label block that merely echoes `{{var}}` names already visible after interpolation.
- `INTEGRATE_BODY` has a single merged directive block instead of two overlapping lists.
- Scoped consistency stage rules do not restate schema-enforceable constraints (contiguous IDs, `kind` values, `description` format requirements).
- `PlanResolution` prompt does not restate duplicate-ID prevention (handled by SDB-24 runtime dedup).
- Spec doc section 7.2 prompt text matches the trimmed implementation templates.
- All existing unit and integration tests pass without modification (beyond prompt-content assertions in `prompt-templates.test.ts`).
- No change to `outputSchema`, `inputSchema`, `requiredVars`, `TEMPLATE_IDS`, or `PromptTemplate` interface.

## Spec/Behavior Links
- Spec: section 7.2 (prompt templates 7.2.1–7.2.4).
- Behaviors: `B-SD-COPILOT-003` (prompt includes `outputSchema`), `B-SD-OBS-002` (template IDs traceable).
- No behavioral or routing changes; this is a prompt-text-only reduction.

## Fixed Implementation Decisions
- Template IDs, `requiredVars`, `outputSchemaId`, and `inputSchemaId` remain unchanged per template.
- `interpolate()` function and `PromptTemplate` interface are unchanged.
- The prompt trimming preserves all model-behavioral guidance (what to do) and removes only structural enforcement text (how the output must be shaped) that schema validation already covers.
- `createScopedConsistencyBody` factory is preserved but its generated text is shorter.
- Input context label removal means interpolated values appear directly in the prompt body without a preceding descriptive label block. The `{{var}}` placeholders remain in the body text where they provide semantic context inline.

## Interface/Schema Contracts
- No schema changes. All `outputSchema` and `inputSchema` references remain identical.
- No changes to `TEMPLATE_IDS`, `PromptTemplateId`, or `PROMPT_TEMPLATES` record keys.
- `requiredVars` arrays remain unchanged per template.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
  - `INTEGRATE_BODY`: Merge "You must" and "Spec quality requirements" into one block; remove "Input context" label section.
  - `createScopedConsistencyBody`: Remove schema-enforceable stage rules (contiguous IDs, `kind`, `description` format); remove "Input context" label section; keep mutual-exclusivity intent and focus-area scoping.
  - `CONSISTENCY_RESOLUTION_BODY`: Remove "Input context" label section; remove duplicate-ID rule (runtime-enforced per SDB-24); preserve questions-first model semantics (per SDB-25) when trimming rule 5.
  - `CLASSIFY_CUSTOM_PROMPT_BODY`: Remove "Input context" label section; tighten classification policy.
  - `EXPAND_CLARIFICATION_BODY`: Remove "Input context" label section; tighten rules.
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
  - Section 7.2.1: Update `IntegrateIntoSpec` prompt text to match trimmed `INTEGRATE_BODY`.
  - Section 7.2.2: Update scoped consistency prompt description to reflect trimmed stage rules.
  - Section 7.2.2.2: Update `PlanResolution` prompt text to match trimmed `CONSISTENCY_RESOLUTION_BODY`.
  - Section 7.2.3: Update `ClassifyCustomPrompt` prompt text to match trimmed `CLASSIFY_CUSTOM_PROMPT_BODY`.
  - Section 7.2.4: Update `ExpandQuestionWithClarification` prompt text to match trimmed `EXPAND_CLARIFICATION_BODY`.
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`
  - Update any prompt-body content assertions or snapshots to match trimmed text.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/prompt-templates.test.ts`
  - Expected: all template catalog, interpolation, and body-content tests pass with trimmed prompts.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/`
  - Expected: all spec-doc unit tests pass (no routing or schema changes).
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/`
  - Expected: all integration tests pass (prompt trimming doesn't affect schema validation or routing).

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-TRIM-001-IntegrateBodyMerged | `src/workflows/spec-doc/prompt-templates.ts` (`INTEGRATE_BODY`) | single directive block replaces two overlapping lists. |
| SD-TRIM-002-InputContextRemoved | `src/workflows/spec-doc/prompt-templates.ts` (all bodies) | no prompt body contains an "Input context:" label block. |
| SD-TRIM-003-ScopedStageRulesTrimmed | `src/workflows/spec-doc/prompt-templates.ts` (`createScopedConsistencyBody`) | stage rules block does not restate contiguous-ID, `kind`, or `description` format requirements. |
| SD-TRIM-004-ResolutionDedupRuleRemoved | `src/workflows/spec-doc/prompt-templates.ts` (`CONSISTENCY_RESOLUTION_BODY`) | no rule about inventing duplicate IDs (handled by SDB-24 runtime). |
| SD-TRIM-005-SpecDocPromptsAligned | `docs/spec-doc-generation-workflow.md` (section 7.2) | spec doc prompt text matches trimmed implementation templates. |
| SD-TRIM-006-TestAssertionsUpdated | `test/workflows/spec-doc/prompt-templates.test.ts` | prompt-body assertions match trimmed text; all tests pass. |
| SD-TRIM-007-NoSchemaChanges | `src/workflows/spec-doc/prompt-templates.ts` | `outputSchemaId`, `inputSchemaId`, `requiredVars`, `TEMPLATE_IDS` unchanged. |
| SD-TRIM-008-ExistingTestsPass | `test/workflows/spec-doc/`, `test/integration/spec-doc/` | all existing tests pass without modification beyond prompt-content assertions. |
