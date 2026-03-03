# TSD10 - Integration Suite for Spec-Doc Workflow (`ITX-SD-001..014`)

## Depends On
- `TSD03`
- `TSD04`
- `TSD05`
- `TSD06`
- `TSD07`
- `TSD08`
- `TSD09`

## Objective
Implement deterministic integration coverage for all integration-primary and shared items in `spec-doc-integration-tests.md`, including recovery/ordering/failure matrices.

## Implementation Tasks
- [ ] Implement `ITX-SD-001..014` test files with behavior-ID tagging.
- [ ] Cover all schema failure injections across delegated states.
- [ ] Cover queue ordering, insertion, immutability, and recovery behavior.
- [ ] Cover loop boundary, completion cardinality permutations, custom routing matrix, and copilot failure propagation.
- [ ] Cover prompt template ID traceability and fixed consistency-check routing.

## Required Artifacts
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-001.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-002.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-006.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-008.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-009.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-010.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-011.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts`

## Acceptance Criteria
- Every `ITX-SD-*` ID from the integration plan exists as a deterministic test.
- Each test maps to one or more explicit `B-SD-*` behaviors.
- Integration suite is deterministic with no real AI model dependency.

## Spec/Behavior Links
- Integration plan: section 4 (`ITX-SD-001..014`), section 5 ownership matrix.
- Behaviors: all IDs referenced by `ITX-SD-001..014`.

## Fixed Implementation Decisions
- Integration suite runs against deterministic harness doubles only.
- Recovery tests use barriers/latches, not sleep-based timing.
- Behavior IDs are embedded in test metadata for traceability.

## Interface/Schema Contracts
- Test naming convention: `itx.<domain>.<behavior-id>.spec.ts`.
- Each test exposes deterministic setup fixtures for workflow input and delegated outputs.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-001.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-002.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-006.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-008.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-009.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-010.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-011.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts`

### Modify
- `packages/workflow-app-builder/test/integration/index.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- test/integration/spec-doc`
  - Expected: all `ITX-SD-001..014` scenarios pass deterministically.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- ITX-SD-001|ITX-SD-004|ITX-SD-008|ITX-SD-012|ITX-SD-014`
  - Expected: targeted schema/loop/recovery/traceability/invariant cases pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-ITX-001-SchemaFailureModes | `test/integration/spec-doc/itx.spec-doc.ITX-SD-001.spec.ts` | per-state non-JSON and schema mismatch failures are terminal with diagnostics. |
| SD-ITX-002-QueueOrderingStability | `test/integration/spec-doc/itx.spec-doc.ITX-SD-002.spec.ts` | queue order remains deterministic through retry/recovery. |
| SD-ITX-003-CustomRoutingMatrix | `test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts` | both intents route correctly with precedence over direct self-loop. |
| SD-ITX-004-LoopBoundary | `test/integration/spec-doc/itx.spec-doc.ITX-SD-004.spec.ts` | max and max+1 loop boundaries enforce pass/fail semantics correctly. |
| SD-ITX-005-ImmediateClarificationInsert | `test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts` | clarification follow-up becomes immediate next question and original remains immutable. |
| SD-ITX-006-CompletionValidationPermutations | `test/integration/spec-doc/itx.spec-doc.ITX-SD-006.spec.ts` | exactly-one completion selection required; invalid variants remain pending. |
| SD-ITX-007-IntegrateInputNormalization | `test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts` | first/second integration inputs satisfy source/answers/specPath contract. |
| SD-ITX-008-RecoveryQueueResume | `test/integration/spec-doc/itx.spec-doc.ITX-SD-008.spec.ts` | interrupted queue processing resumes without duplicates and preserves ordering. |
| SD-ITX-009-CopilotFailureByState | `test/integration/spec-doc/itx.spec-doc.ITX-SD-009.spec.ts` | parent failures include state/template context for each delegation state. |
| SD-ITX-010-QuestionImmutability | `test/integration/spec-doc/itx.spec-doc.ITX-SD-010.spec.ts` | issued questions are never mutated when follow-ups are generated. |
| SD-ITX-011-GeneratedQuestionSchema | `test/integration/spec-doc/itx.spec-doc.ITX-SD-011.spec.ts` | all generated questions satisfy schema and option usability requirements. |
| SD-ITX-012-TemplateIDTraceability | `test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts` | delegation events/logs include stable template IDs. |
| SD-ITX-013-ConsistencyFixedRouting | `test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts` | consistency check always routes to `NumberedOptionsHumanRequest`. |
| SD-ITX-014-DoneInvariantPaths | `test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts` | done invariants hold across all reachable completion paths. |
