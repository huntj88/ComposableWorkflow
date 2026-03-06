# SDB-14 - Post-Spec-Update Integration Coverage for Clarification Research

## Depends On
- `SDB-09`
- `SDB-10`
- `SDB-11`
- `SDB-13`

## Objective
Add integration and scenario coverage for the clarification-research changes introduced after the original integration suite task was completed, without rewriting the completed task history.

## Implementation Tasks
- [ ] Add coverage for the research-only clarification path documented as `ITX-SD-004`.
- [ ] Expand custom-routing integration coverage so `ITX-SD-003` includes `unrelated-question` alongside existing intents.
- [ ] Add coverage that deferred source questions block terminal exhaustion until revisited.
- [ ] Add coverage that research-result observability is emitted on research-only outcomes.
- [ ] Update the production black-box `GS-SD-003` scenario for the revised clarification round-trip behavior.

## Required Artifacts
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`

## Acceptance Criteria
- `ITX-SD-004` exists as a deterministic integration test.
- `ITX-SD-003` covers all three classification intents.
- Integration coverage proves deferred questions prevent `Done`/`IntegrateIntoSpec` routing until the deferred stack is empty.
- Research-only clarification runs emit the expected observability signal.
- Production black-box `GS-SD-003` coverage reflects the research-first clarification flow.

## Spec/Behavior Links
- Integration plan: `ITX-SD-003`, `ITX-SD-004`, `ITX-SD-005`, `ITX-SD-012`, `ITX-SD-014`.
- Behaviors: `B-SD-TRANS-010`, `B-SD-TRANS-013`, `B-SD-TRANS-014`, `B-SD-TRANS-015`, `B-SD-OBS-001`.
- Golden scenarios: `GS-SD-003`.

## Fixed Implementation Decisions
- The completed `SDB-10` suite remains historical; this task owns only post-spec-update deltas.
- New or expanded integration tests must continue using deterministic doubles only.
- Research-only path assertions must inspect both workflow transitions and emitted observability artifacts.

## Interface/Schema Contracts
- Integration fixtures must be able to stub `researchOutcome = resolved-with-research` and `researchOutcome = needs-follow-up-question`.
- Integration harness must expose deferred-question state or equivalent externally observable transitions needed to assert revisit precedence.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts`

### Modify
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts`
  - Expected: all three intents route correctly with precedence over direct queue continuation.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts`
  - Expected: research-only clarification logs research results and revisits the deferred source question.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts`
  - Expected: done invariants hold only after the deferred-question stack is empty.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts`
  - Expected: the production black-box round-trip scenario covers research-first clarification flow and deferred-question revisit behavior.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-DELTA-ITX-003-ThreeIntentRouting | `test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts` | integration routing matrix covers `clarifying-question`, `unrelated-question`, and `custom-answer`. |
| SD-DELTA-ITX-004-ResearchOnlyResolution | `test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts` | research-only outcomes log results and revisit the deferred source question. |
| SD-DELTA-ITX-005-DeferredInsertionOrdering | `test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts` | inserted follow-ups stay immediate-next while deferred source questions are revisited later. |
| SD-DELTA-ITX-012-ResearchObservability | `test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts` | research-result observability is emitted alongside prompt-template traceability. |
| SD-DELTA-ITX-014-DeferredBlocksDone | `test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts` | terminal completion is blocked until deferred-question revisit is complete. |
| SD-DELTA-E2E-003-ResearchFirstRoundTrip | `test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts` | production black-box coverage exercises research-first clarification flow and the deferred-question revisit sequence. |