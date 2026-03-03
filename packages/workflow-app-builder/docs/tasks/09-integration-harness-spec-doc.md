# TSD09 - Spec-Doc Integration Harness Components

## Depends On
- `TSD02`
- `TSD05`
- `TSD06`
- `TSD08`

## Objective
Build deterministic harness components required by the integration plan: copilot double, feedback controller, queue inspector, and observability capture sink.

## Implementation Tasks
- [x] Implement deterministic `app-builder.copilot.prompt.v1` test double with per-state response/failure injection.
- [x] Implement feedback response controller for valid/invalid/concurrent submission permutations.
- [x] Implement queue state inspector with ordering/insertion/immutability introspection.
- [x] Implement observability capture sink with event/template/schema outcome assertions.

## Required Artifacts
- `packages/workflow-app-builder/test/integration/harness/spec-doc/copilot-double.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/feedback-controller.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/queue-inspector.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/observability-sink.ts`

## Acceptance Criteria
- Harness can deterministically configure state-by-state child outputs and failures.
- Queue inspector can assert immediate-next insertions and no mutation history.
- Capture sink can assert template IDs and schema-validation outcomes.

## Spec/Behavior Links
- Integration plan: section 3 (3.1, 3.2, 3.3, 3.4).
- Behaviors: supports validation of `B-SD-COPILOT-*`, `B-SD-QUEUE-*`, `B-SD-OBS-*`.

## Fixed Implementation Decisions
- Harness utilities are package-local test helpers (not exported runtime API).
- Copilot double records all call metadata including template ID + output schema.
- Feedback controller supports race testing through barrier/latch controls.

## Interface/Schema Contracts
- Copilot double contract includes staged output map keyed by FSM state.
- Queue inspector snapshots include `{ questionId, prompt, options, issuedAt, index }`.
- Observability sink exposes assertion helpers for event sequence and payload fields.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/test/integration/harness/spec-doc/copilot-double.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/feedback-controller.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/queue-inspector.ts`
- `packages/workflow-app-builder/test/integration/harness/spec-doc/observability-sink.ts`

### Modify
- `packages/workflow-app-builder/test/integration/harness/index.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- test/integration/harness/spec-doc`
  - Expected: deterministic double/controller/inspector/sink helper tests pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-HAR-001-CopilotDoubleStateInjection | `test/integration/harness/spec-doc/copilot-double.ts` | per-state schema-valid/invalid/failure responses are configurable. |
| SD-HAR-002-FeedbackControllerPermutations | `test/integration/harness/spec-doc/feedback-controller.ts` | valid/invalid/multi-submit/concurrent response paths are controllable. |
| SD-HAR-003-QueueInspectorDeterminism | `test/integration/harness/spec-doc/queue-inspector.ts` | queue ordering/insertion/immutability can be asserted directly. |
| SD-HAR-004-ObservabilityCapture | `test/integration/harness/spec-doc/observability-sink.ts` | emitted events, template IDs, and schema outcomes are capturable and assertable. |
