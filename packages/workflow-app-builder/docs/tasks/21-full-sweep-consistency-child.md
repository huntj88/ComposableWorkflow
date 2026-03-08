# SDB-21 - Full-Sweep Consistency Child Execution

## Depends On
- `SDB-18`
- `SDB-20`

## Objective
Replace the delegated-child actionable-item short-circuit policy with a full-sweep execution policy so every configured `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` entry runs once per consistency-check pass before the child produces its parent-facing result.

## Implementation Tasks
- [ ] Update delegated-child runtime progression so `ExecutePromptLayer` always advances through the full configured layer list.
- [ ] Preserve duplicate-id enforcement and stage-local mixed-output rejection while removing actionable-item early exit.
- [ ] Update child state data to retain full-sweep coverage data across all executed stages.
- [ ] Emit observability proving every configured stage executed once per pass.
- [ ] Add unit and integration regressions that fail if early actionable items suppress later stages.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`

## Acceptance Criteria
- Every configured `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS` entry executes exactly once per delegated-child pass, even when an earlier stage emits non-empty `actionableItems`.
- Duplicate `itemId` and `questionId` detection still spans all executed stage outputs and fails before a parent route is chosen.
- Stage-local mixed `actionableItems` plus `followUpQuestions` output remains invalid.
- Child observability exposes a complete ordered stage sequence for every pass.
- Unit and integration tests prove later stages still run after earlier actionable output.

## Spec/Behavior Links
- Spec: sections 2, 5.3, 6.1, 6.2.1, 7.1, 7.2.2.1, 9, 10.2.
- Behaviors: `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-CHILD-002`, `B-SD-CHILD-003`, `B-SD-OBS-003`.
- Integration tests: `ITX-SD-012`, `ITX-SD-016`, `ITX-SD-017`.

## Fixed Implementation Decisions
- Full-sweep execution applies to every consistency-check pass; there is no stage-level actionable-item stop condition.
- The parent contract remains `ConsistencyCheckOutput`; this task changes child execution policy, not parent routing semantics.
- Existing stage-specific schemas remain narrow and stage-owned.
- This task does not yet define how the final aggregate is authored after the sweep; it only guarantees complete stage coverage.

## Interface/Schema Contracts
- `ConsistencyStageOutput` remains the per-layer contract executed by `ExecutePromptLayer`.
- Duplicate-id enforcement spans all stage outputs captured in the same child pass.
- Observability must expose `stageId` for each full-sweep layer execution in deterministic order.
- The child must preserve enough state to support a later planning step over all executed stage outputs.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: actionable output from an early stage no longer suppresses later stage execution.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: integration coverage proves full-sweep execution and preserved contract failures.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
  - Expected: child state progression covers all configured stages before terminal completion.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-FSWEEP-001-AllStagesRun | `src/workflows/spec-doc/consistency-follow-up-child.ts` | every configured stage executes once per pass regardless of earlier actionable output. |
| SD-FSWEEP-002-DuplicateGuardPreserved | `src/workflows/spec-doc/consistency-follow-up-child.ts` | duplicate ids still fail after the full sweep rather than being silently merged. |
| SD-FSWEEP-003-ObsSequence | `src/workflows/spec-doc/observability.ts` | observability records the complete ordered stage sequence for each pass. |
| SD-FSWEEP-004-UnitCoverage | `test/workflows/spec-doc/consistency-follow-up-child.test.ts` | unit tests prove later stages still execute after earlier actionable output. |
| SD-FSWEEP-005-IntegrationCoverage | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | integration tests cover full-sweep execution plus preserved contract failures. |
| SD-FSWEEP-006-StateProgressionCoverage | `test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts` | integration tests prove self-loop progression spans all configured stages. |
