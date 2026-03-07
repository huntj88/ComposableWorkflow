# SDB-17 - Delegated Child Coverage and Production-Parity Deltas

## Depends On
- `SDB-09`
- `SDB-10`
- `SDB-11`
- `SDB-14`
- `SDB-16`
- `SDB-16A`

## Objective
Close the remaining deterministic integration and production-parity gaps introduced by delegated child routing, immediate-action integration, child contract enforcement, deferred revisit feedback attempts, and the new immediate-action golden path.

This task stays scoped to the currently shipped delegated-child architecture established by `SDB-16A`. Explicit child-FSM self-loop runtime states are deferred to `SDB-18`.

## Implementation Tasks
- [x] Extend `ITX-SD-007` to cover `source: "consistency-action-items"`.
- [x] Extend `ITX-SD-012` to assert child/stage observability metadata and short-circuit visibility.
- [x] Add `ITX-SD-015` for deferred revisit feedback-attempt/idempotency behavior.
- [x] Add `ITX-SD-016` for delegated child contract enforcement and short-circuit behavior.
- [x] Add black-box `GS-SD-004` coverage for the immediate-action child-result path.
- [x] Refresh shared coverage-matrix references so new `ITX-SD-*` / `GS-SD-*` assets remain traceable.

## Required Artifacts
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-015.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-004-immediate-action.spec.ts`
- `packages/workflow-server/docs/testing/coverage-matrix.md`

## Acceptance Criteria
- Integration suite covers `ITX-SD-015` and `ITX-SD-016` with deterministic harness fixtures.
- `ITX-SD-007`, `ITX-SD-012`, and `ITX-SD-013` reflect delegated child semantics rather than legacy fixed-routing assumptions.
- Black-box `GS-SD-004` proves `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → IntegrateIntoSpec` parity for the immediate-action path.
- `ITX-SD-016` explicitly covers both duplicate-id failure and mixed-result failure paths for the delegated child contract.
- `ITX-SD-012` explicitly covers child-workflow start/complete events and prompt-layer `stageId` observability.
- `ITX-SD-017`-style explicit child runtime-state progression is not required here and remains owned by `SDB-18`.
- Coverage in this task remains valid against the current scoped-prompt baseline even when prompt-layer progression is still implemented inside one child handler.
- Coverage metadata references all newly added `ITX-SD-*` / `GS-SD-*` assets.

## Spec/Behavior Links
- Integration plan: `ITX-SD-007`, `ITX-SD-012`, `ITX-SD-013`, `ITX-SD-015`, `ITX-SD-016`.
- Behaviors: `B-SD-INPUT-004`, `B-SD-HFB-005`, `B-SD-CHILD-001`, `B-SD-CHILD-002`, `B-SD-CHILD-003`, `B-SD-OBS-003`.
- Golden scenarios: `GS-SD-004`.

## Fixed Implementation Decisions
- Integration coverage remains harness-driven and deterministic.
- Black-box parity stays HTTP-only and runs against an externally started production server.
- Immediate-action parity must verify the absence of `NumberedOptionsHumanRequest` for that pass, not merely successful completion.
- Deferred revisit idempotency assertions inspect child-launch metadata rather than inferring behavior from terminal output alone.
- Current parity work treats the child as an implementation-owned delegating loop; no explicit child `ExecutePromptLayer -> ExecutePromptLayer` runtime transition assertions are introduced in this task.

## Follow-On Task Boundary
- `SDB-18` owns the future refactor to explicit child workflow states and any test/docs updates that require observing child self-loop runtime progression.

## Interface/Schema Contracts
- `ITX-SD-015` must assert `spec-doc:feedback:{runId}:{questionId}:pass-{consistencyCheckPasses}:attempt-{feedbackAttempt}` idempotency-key evolution across defer/revisit cycles.
- `ITX-SD-016` must inject child-layer outputs that trigger duplicate-id and mixed-result contract violations.
- `GS-SD-004` uses only public run/events/children APIs and public terminal payloads.
- `ITX-SD-012` assertions must tolerate the current baseline where later prompt layers may be observable by ordered execution events or by their absence after short-circuiting.
- Targeted verification commands must run exact spec files rather than broad suite patterns.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-015.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-004-immediate-action.spec.ts`

### Modify
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/helpers.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/index.ts`
- `packages/workflow-server/test/e2e/blackbox/index.spec.ts`
- `packages/workflow-server/docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts test/integration/spec-doc/itx.spec-doc.ITX-SD-015.spec.ts test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: delegated child routing, observability, immediate-action integration, and defer/revisit idempotency pass deterministically.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/e2e/blackbox/spec-doc/gs-sd-004-immediate-action.spec.ts`
  - Expected: immediate-action black-box parity passes against the production server.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-DELTA-ITX-007-ImmediateActionInput | `test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts` | integration input normalization covers `source: "consistency-action-items"`. |
| SD-DELTA-ITX-012-ChildStageObservability | `test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts` | child/stage observability and short-circuit visibility are asserted. |
| SD-DELTA-ITX-013-ChildRoutingVariants | `test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts` | routing assertions cover actionable, follow-up, and empty child aggregate variants. |
| SD-DELTA-ITX-015-DeferredRevisitIdempotency | `test/integration/spec-doc/itx.spec-doc.ITX-SD-015.spec.ts` | deferred revisits launch fresh feedback requests with incremented attempt ids. |
| SD-DELTA-ITX-016-ChildContractEnforcement | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | duplicate-id and mixed-result child failures are integration-tested. |
| SD-DELTA-E2E-004-ImmediateActionParity | `test/e2e/blackbox/spec-doc/gs-sd-004-immediate-action.spec.ts` | public black-box flow proves immediate-action routing parity without entering feedback for that pass. |
