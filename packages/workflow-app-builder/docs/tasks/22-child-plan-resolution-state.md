# SDB-22 - Child PlanResolution State

## Depends On
- `SDB-21`

## Objective
Add an explicit delegated-child `PlanResolution` state that consumes the full-sweep coverage aggregate, delegates one planning prompt, and authors the only final `ConsistencyCheckOutput` consumed by the parent.

## Implementation Tasks
- [x] Add `PlanResolution` to the delegated-child state machine and transition metadata.
- [x] Introduce the `spec-doc.consistency-resolution.v1` prompt template and wire it to `consistency-check-output.schema.json`.
- [x] Build deterministic planning input from the full-sweep aggregate for the planning prompt.
- [x] Ensure the parent consumes only the schema-validated `PlanResolution` output.
- [x] Extend unit and integration coverage for planning-step invocation, mixed final aggregates, and observability.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`

## Acceptance Criteria
- The delegated child transitions `start -> ExecutePromptLayer -> PlanResolution -> Done`.
- `PlanResolution` delegates exactly one copilot prompt per child pass using `spec-doc.consistency-resolution.v1`.
- `PlanResolution` uses the full-sweep coverage aggregate as input and produces the final `ConsistencyCheckOutput` under `consistency-check-output.schema.json`.
- Parent routing semantics remain unchanged: non-empty final `actionableItems` route to `IntegrateIntoSpec`, otherwise to `NumberedOptionsHumanRequest`.
- The final child aggregate may validly contain both `actionableItems` and `followUpQuestions`.
- Observability exposes planning-step start/completion and template traceability.

## Spec/Behavior Links
- Spec: sections 2, 5.3, 6.1, 6.2.1, 6.3, 7.1, 7.2.2.2, 9, 10.1, 10.2.
- Behaviors: `B-SD-TRANS-003`, `B-SD-CHILD-001B`, `B-SD-CHILD-004`, `B-SD-COPILOT-001`, `B-SD-COPILOT-003`, `B-SD-OBS-002`, `B-SD-OBS-003`.
- Integration tests: `ITX-SD-012`, `ITX-SD-013`, `ITX-SD-016`, `ITX-SD-017`.

## Fixed Implementation Decisions
- `PlanResolution` is the only child state allowed to author the final parent-facing aggregate result.
- The planning prompt reuses `consistency-check-output.schema.json`; no new final-output schema is introduced.
- Stage outputs remain narrow, stage-owned contracts; the planning step consolidates them rather than widening stage schemas.
- Mixed final aggregates are allowed only after planning; stage-local mixed outputs remain invalid.

## Interface/Schema Contracts
- `spec-doc.consistency-resolution.v1` must emit `ConsistencyCheckOutput` under `consistency-check-output.schema.json`.
- Planning input must include deterministic ordered stage coverage data, not raw unstructured model text alone.
- `LogicalConsistencyCheckCreateFollowUpQuestions` must branch only from the schema-validated `PlanResolution` output.
- Prompt observability must distinguish `ExecutePromptLayer` delegations from the `PlanResolution` delegation.

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/prompt-templates.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: planning state executes exactly once and authors the final child aggregate.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/logical-consistency-check.test.ts`
  - Expected: parent consumes only the planning-state output for routing decisions.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
  - Expected: observability includes `spec-doc.consistency-resolution.v1` after the full sweep.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: mixed final aggregates are valid only after planning and still route parent integration-first.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts`
  - Expected: child state progression includes `PlanResolution` before `Done`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-PLAN-001-StateAdded | `src/workflows/spec-doc/consistency-follow-up-child.ts` | child progression includes `PlanResolution` before `Done`. |
| SD-PLAN-002-ResolutionTemplate | `src/workflows/spec-doc/prompt-templates.ts` | the child planning step delegates `spec-doc.consistency-resolution.v1` with the aggregate schema. |
| SD-PLAN-003-ParentConsumesPlannedOutput | `src/workflows/spec-doc/states/logical-consistency-check.ts` | parent routing uses only the schema-validated planning output. |
| SD-PLAN-004-ObservabilityTrace | `src/workflows/spec-doc/observability.ts` | observability distinguishes planning-step delegation from per-stage sweep delegations. |
| SD-PLAN-005-UnitCoverage | `test/workflows/spec-doc/logical-consistency-check.test.ts` | unit tests prove planned output alone drives parent branching. |
| SD-PLAN-006-IntegrationTraceability | `test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts` | integration tests prove planning-step template traceability and ordering. |
| SD-PLAN-007-IntegrationStateProgression | `test/integration/spec-doc/itx.spec-doc.ITX-SD-017.spec.ts` | integration tests prove `PlanResolution` occurs exactly once after the final stage. |
