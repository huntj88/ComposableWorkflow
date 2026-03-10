# SDB-30 - Remove Redundant Prompt Directives

## Depends On
- `SDB-27`

## Objective
Remove prompt directives that duplicate validation already performed by later workflow stages. This reduces token cost and eliminates false contract surface in prompt templates.

## Motivation
Several prompt directives restate concerns that are enforced by downstream stages or FSM routing, not by the prompt itself:

### IntegrateIntoSpec (`spec-doc.integrate.v1`)

| Old # | Directive | Covered by |
|-------|-----------|------------|
| 1 | Preserve prior accepted decisions unless explicitly overridden by newer answers | `consistency-scope-objective`, `consistency-contradictions-completeness` |
| 3 | Keep the spec concrete, testable, and implementation-ready | All scoped consistency stages collectively |
| 5 | Acceptance criteria must be testable and unambiguous | `consistency-acceptance-criteria` |
| 6 | When actionableItems are present (source: {{source}}), treat them as ordered concrete edit directives | Actionable items are already structured data; ordering is preserved by runtime, not prompt instruction |

Removing directive 6 also removes the `{{source}}` interpolation variable from the template body, so `source` is dropped from `requiredVars`. The runtime still computes and passes `source` in the interpolation variables (harmless no-op), and `IntegrateIntoSpecInput.source` remains unchanged in the contract.

### ExpandQuestionWithClarification (`spec-doc.expand-clarification.v1`)

| Rule | Clause removed | Covered by |
|------|---------------|------------|
| 6 | "while the skipped source question is revisited later" | FSM deferral/revisit routing (`B-SD-TRANS-013`, `B-SD-TRANS-015`) |

The source-question deferral and revisit behaviour is an FSM routing concern, not a prompt concern. The prompt only needs to generate a good follow-up question; the FSM handles when the original question is re-asked.

### ConsistencyResolution (`spec-doc.consistency-resolution.v1`)

| Rule | Clause removed | Covered by |
|------|---------------|------------|
| 5 | "When this occurs, the parent resolves all human questions first via `NumberedOptionsHumanRequest`, then delivers both the stashed actionable items and collected answers together to `IntegrateIntoSpec` in a single integration pass." | Parent FSM routing (`B-SD-TRANS-003`, `B-SD-INPUT-005`, `B-SD-CHILD-004`) |

The second sentence of rule 5 describes parent FSM routing behaviour that the model cannot control. The first sentence ("It is valid for the final aggregate to include both non-empty `actionableItems` and non-empty `followUpQuestions`.") is retained as genuine model guidance — it tells the model that mixed output is allowed.

## Implementation Tasks
- [x] **prompt-templates.ts**: Remove directives 1, 3, 5, 6 from `INTEGRATE_BODY`. Renumber remaining directives (old 2→1, old 4→2, old 7→3, old 8→4). Remove `'source'` from `requiredVars` for the integrate template.
- [x] **prompt-templates.ts**: Trim `EXPAND_CLARIFICATION_BODY` rule 6 to remove the "while the skipped source question is revisited later" clause (FSM routing concern).
- [x] **prompt-templates.ts**: Trim `CONSISTENCY_RESOLUTION_BODY` rule 5 to remove the second sentence describing parent FSM routing (questions-first stash/deliver behaviour).
- [x] **spec-doc-generation-workflow.md**: Update section 7.2.1 prompt text and Required runtime interpolation variables to match. Remove `{{source}}` from the variable list. Update section 7.2.2 resolution rule 5 and section 7.2.4 rule 6 to match.
- [x] **spec-doc-behaviors.md**: Update `B-SD-INPUT-003` to clarify that prior-decision preservation is enforced via consistency-check stages rather than the integrate prompt directive.
- [x] **spec-doc-integration-tests.md**: Update `ITX-SD-007` assertion about prior-decision preservation to reference consistency-stage validation.
- [x] **prompt-templates.test.ts**: Remove assertions for `source` in `requiredVars`, `{{source}}` in body, and `ordered concrete edit directives` in body.
- [x] Verify all existing unit and integration tests pass after changes.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md` (section 7.2.1)
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md` (`B-SD-INPUT-003`)
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md` (`ITX-SD-007`)
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`

## Acceptance Criteria
- `INTEGRATE_BODY` contains exactly 4 directives (old 2, 4, 7, 8 renumbered to 1–4).
- `{{source}}` does not appear in the integrate template body.
- `source` is not in `requiredVars` for the integrate template.
- `IntegrateIntoSpecInput.source` field and runtime source-resolution logic are unchanged.
- `EXPAND_CLARIFICATION_BODY` rule 6 does not mention source-question deferral/revisit.
- `CONSISTENCY_RESOLUTION_BODY` rule 5 states mixed output is valid but does not describe parent FSM routing.
- Spec doc section 7.2.1, 7.2.2, and 7.2.4 prompt text matches the trimmed implementation templates.
- `B-SD-INPUT-003` references consistency-stage enforcement.
- `ITX-SD-007` assertions reference consistency-stage validation for prior-decision preservation.
- All existing unit and integration tests pass.

## Spec/Behavior Links
- Spec: section 7.2.1 (`IntegrateIntoSpec` prompt template), section 7.2.2 (`ConsistencyResolution` prompt template), section 7.2.4 (`ExpandQuestionWithClarification` prompt template).
- Behaviors: `B-SD-INPUT-003` (prior-decision preservation), `B-SD-DONE-002` (completion criteria), `B-SD-TRANS-003`/`B-SD-CHILD-004` (mixed-aggregate parent routing), `B-SD-TRANS-013`/`B-SD-TRANS-015` (deferral/revisit routing).
- No routing, schema, or contract changes.
