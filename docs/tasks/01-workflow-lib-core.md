# T01 - Workflow Library Core Contracts and Runtime

## Depends On
- `T00`

## Objective
Implement `packages/workflow-lib` as the server-agnostic runtime contract and execution primitive layer.

## Implementation Tasks
- [ ] Define and export core types exactly matching spec:
  - `WorkflowPackageManifest`, `WorkflowRegistration`
  - `WorkflowLifecycle`, `WorkflowContext`, `WorkflowDefinition`, `WorkflowFactory`
  - `WorkflowEvent` + `WorkflowEventType`
  - child workflow and command request/result contracts
- [ ] Implement deterministic event emitter utility:
  - per-run sequence allocator interface
  - ISO timestamp source via injected clock
  - append-only event construction helpers
- [ ] Implement runtime guardrails:
  - transition validation helper
  - lifecycle compatibility checks for child launch and control actions
  - uncaught state handler errors emit failure event and force terminal `failed`
  - no implicit runtime/server retry helper for state/action failures (FSM-owned retry design)
- [ ] Define instrumentation interface and invocation points:
  - `onEvent`, `onMetric`, `onTrace`
- [ ] Add unit tests for:
  - event shape correctness
  - monotonic sequence behavior
  - transition validity and failure signaling

## Required Artifacts
- `packages/workflow-lib/src/contracts/*`
- `packages/workflow-lib/src/runtime/*`
- `packages/workflow-lib/test/unit/*`

## Acceptance Criteria
- Library has no dependency on server persistence, transport, or framework code.
- Runtime emits all required event types and contract fields.
- Unit tests verify deterministic event construction and transition validation.

## Spec/Behavior Links
- Spec: sections 6, 6.3, 6.4, 6.5, 6.6.
- Behaviors: global event invariants in section 1.3.

## Fixed Implementation Decisions
- Export surface uses barrel files from `src/index.ts` and `src/contracts/index.ts`.
- Time source and sequence allocation are injected interfaces (no hidden globals).
- Runtime event builder is pure and side-effect-free; persistence happens in server layer only.

## Interface/Schema Contracts
- Required interfaces:
  - `Clock { now(): Date }`
  - `SequenceAllocator { next(runId: string): Promise<number> | number }`
  - `EventFactory { create(input): WorkflowEvent }`
- Event contract invariants:
  - `eventId` unique, `timestamp` ISO8601 string, `sequence` strictly increasing per `runId`.
  - `runId`, `workflowType`, `eventType` always populated.

## File Plan (Exact)
### Create
- `packages/workflow-lib/src/index.ts`
- `packages/workflow-lib/src/contracts/workflow-contracts.ts`
- `packages/workflow-lib/src/contracts/workflow-events.ts`
- `packages/workflow-lib/src/contracts/instrumentation.ts`
- `packages/workflow-lib/src/runtime/event-factory.ts`
- `packages/workflow-lib/src/runtime/transition-guards.ts`
- `packages/workflow-lib/src/runtime/lifecycle-guards.ts`
- `packages/workflow-lib/test/unit/event-factory.spec.ts`
- `packages/workflow-lib/test/unit/transition-guards.spec.ts`

### Modify
- `packages/workflow-lib/package.json`
- `packages/workflow-lib/tsconfig.json`

## Verification
- Command: `pnpm --filter workflow-lib test`
  - Expected: unit tests pass for event shape, monotonic sequence behavior, transition guard failures.
- Command: `pnpm --filter workflow-lib build`
  - Expected: public export surface compiles with no server dependency imports.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Spec-6.1-ManifestContracts | `workflow-contracts.ts` | Types compile with manifest fields exactly as spec. |
| Spec-6.4-EventTypes | `workflow-events.ts` | All required event literals are exported. |
| Spec-6.5-InstrumentationHooks | `instrumentation.ts` | `onEvent/onMetric/onTrace` interfaces available. |
| Behavior-GlobalEventInvariants | `event-factory.spec.ts` | Required event fields + ISO timestamp invariants enforced. |
