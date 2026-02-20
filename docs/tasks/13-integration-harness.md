# T13 - Integration Test Harness and Determinism Controls

## Depends On
- `T05`, `T09`, `T12`

## Objective
Build integration harness infrastructure required to deterministically test race conditions, crash windows, and instrumentation contracts.

## Implementation Tasks
- [ ] Implement in-process server+engine harness with dependency injection overrides.
- [ ] Add swappable adapters for:
  - persistence
  - lock provider
  - command runner
  - instrumentation sink
  - clock/time source
  - id/sequence allocator
- [ ] Add deterministic controls:
  - fake clock
  - barriers/latches
  - fault injection points around orchestration and persistence boundaries
- [ ] Add capture sink for events/logs/metrics/traces with query helpers.
- [ ] Add Postgres testcontainer setup and lifecycle management.
- [ ] Add baseline diagnostics capture on failure:
  - lifecycle timeline
  - event stream
  - injected fault points

## Required Artifacts
- `packages/workflow-server/test/harness/*`
- `packages/workflow-lib/test/integration/harness/*`

## Acceptance Criteria
- Harness can deterministically reproduce race/fault windows without sleep-based timing.
- Test suites can assert internals and observability artifacts directly.

## Spec/Behavior Links
- Integration plan: sections 3 and 8.

## Fixed Implementation Decisions
- Test container library: `testcontainers` for Postgres.
- Deterministic synchronization primitives: `async-mutex` barriers + explicit latch utility.
- Fault injection mechanism: named checkpoints with one-shot or persistent fault policies.

## Interface/Schema Contracts
- Harness factory contract:
  - `createIntegrationHarness(options): { server, db, controls, sinks, shutdown }`.
- Controls contract:
  - `clock.setNow(date)`
  - `barrier.wait(name)` / `barrier.release(name)`
  - `fault.inject(name, mode)`.
- Sink capture contract:
  - query helpers for events/logs/metrics/traces by `runId` and `eventType`.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/harness/create-harness.ts`
- `packages/workflow-server/test/harness/fake-clock.ts`
- `packages/workflow-server/test/harness/barrier.ts`
- `packages/workflow-server/test/harness/fault-injector.ts`
- `packages/workflow-server/test/harness/capture-sink.ts`
- `packages/workflow-server/test/harness/postgres-container.ts`

### Modify
- `packages/workflow-server/test/setup.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- harness`
  - Expected: harness starts server, injects controls, and captures observability artifacts deterministically.
- Command: `pnpm --filter workflow-server test -- ITX-001`
  - Expected: fault checkpoint can deterministically reproduce critical crash window.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Integration-3.1-RuntimeHarness | `create-harness.ts` | In-process server+engine with DI overrides works. |
| Integration-3.3-DeterminismControls | `fake-clock.ts`, `barrier.ts`, `fault-injector.ts` | Time/scheduling/fault control deterministic. |
| Integration-3.4-ObservabilityCapture | `capture-sink.ts` | Events/logs/metrics/traces are fully capturable per test. |
