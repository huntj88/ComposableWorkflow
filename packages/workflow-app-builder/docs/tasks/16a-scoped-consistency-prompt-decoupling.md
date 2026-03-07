# SDB-16A - Scoped Consistency Prompt Decoupling

## Depends On
- `SDB-16`

## Objective
Capture and validate the out-of-band refactor that replaced the former single combined delegated consistency prompt with a decoupled scoped prompt-layer catalog, while preserving the current delegated-child execution model.

This task establishes the current shipped baseline that later uncompleted tasks build on. It does not require explicit child runtime self-loop states.

## Implementation Tasks
- [x] Replace the former combined consistency prompt template with scoped consistency prompt templates covering objective, non-goals, constraints, interfaces, acceptance criteria, and contradictions/completeness.
- [x] Update `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` so each stage references its own scoped template and owned `readinessChecklist` keys.
- [x] Narrow readiness-checklist aggregation so each stage only merges the fields it owns.
- [x] Remove remaining runtime and test references to the retired combined consistency template ID.
- [x] Update parent observability/template traceability to use the first scoped consistency template as the delegated-child entry marker.
- [x] Refresh unit and integration coverage so the current delegated-child baseline matches the scoped prompt architecture.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/copilot-delegation.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/observability.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/helpers.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/harness.test.ts`

## Acceptance Criteria
- The combined prompt template `spec-doc.consistency-check.v1` no longer exists in the workflow prompt catalog.
- The delegated child executes the scoped prompt-layer list as the baseline architecture for consistency/follow-up generation.
- Each configured prompt layer declares non-empty owned `checklistKeys` and only those fields participate in that stage's readiness-checklist merge.
- Parent observability and template-traceability assertions use the first scoped consistency template instead of the removed combined template.
- Current delegated-child runtime semantics remain unchanged: prompt layers still execute within the existing child implementation and do not yet require explicit self-loop workflow states.

## Spec/Behavior Links
- Spec: sections 6.2.1, 7.2.2, 7.2.2.1.
- Behaviors: `B-SD-COPILOT-003`, `B-SD-CHILD-001`, `B-SD-OBS-003`.

## Fixed Implementation Decisions
- Scoped consistency prompts are the canonical delegated-child baseline going forward.
- This task changes prompt/template architecture only; explicit child self-loop runtime states remain future work.
- The first scoped consistency template is used as the parent-level observability anchor for delegated consistency checking.
- `SDB-18` owns the later refactor from this baseline into explicit child runtime self-loop state progression.

## Interface/Schema Contracts
- All scoped consistency templates continue to use `consistency-check-output.schema.json`.
- `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` entries must include `{ stageId, templateId, checklistKeys }`.
- The aggregate child output contract remains `ConsistencyCheckOutput` with mutually exclusive `actionableItems` and `followUpQuestions`.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/prompt-templates.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/copilot-delegation.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/observability.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/helpers.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/harness.test.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/prompt-templates.test.ts test/workflows/spec-doc/copilot-delegation.test.ts test/workflows/spec-doc/observability.test.ts test/workflows/spec-doc/consistency-follow-up-child.test.ts test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts test/integration/harness/spec-doc/harness.test.ts`
  - Expected: scoped prompt templates, delegated-child traceability, and harness alignment pass against the decoupled prompt baseline.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-SCOPED-001-ScopedPromptCatalog | `src/workflows/spec-doc/prompt-templates.ts` | combined consistency prompt is replaced by the scoped consistency template set. |
| SD-SCOPED-002-LayerChecklistOwnership | `src/workflows/spec-doc/consistency-follow-up-child.ts` | each configured prompt layer declares owned checklist keys and merges only those keys. |
| SD-SCOPED-003-ParentTraceabilityAnchor | `src/workflows/spec-doc/states/logical-consistency-check.ts` | parent delegation/consistency observability uses the first scoped consistency template. |
| SD-SCOPED-004-TestHarnessAlignment | `test/integration/spec-doc/helpers.ts` | harness behavior and failure messages align with the scoped prompt baseline. |