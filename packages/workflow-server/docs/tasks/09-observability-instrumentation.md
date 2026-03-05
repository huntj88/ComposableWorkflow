# T09 - Observability: Logging, Metrics, Tracing

## Depends On
- `T04`

## Objective
Implement server-injected instrumentation for workflow events, metrics, and trace trees with guaranteed field coverage and failure isolation.

## Implementation Tasks
- [x] Implement instrumentation sink adapters:
  - structured logger
  - metrics provider
  - OpenTelemetry-compatible tracer/exporter
- [x] Wire workflow-lib hooks from server runtime (`onEvent`, `onMetric`, `onTrace`).
- [x] Define required log/metric fields and cardinality constraints.
- [x] Implement trace hierarchy:
  - root span per run
  - transition spans
  - command spans
  - child workflow spans with context propagation
- [x] Implement telemetry failure isolation policy (no run corruption on sink failures).
- [x] Add unit tests for instrumentation adapter mapping, required field projection, and telemetry failure-isolation wrappers.
- [x] Integration tests for hook ordering, delayed/failing sink behavior, and trace parentage.

## Required Artifacts
- `packages/workflow-server/src/observability/*`
- `packages/workflow-server/test/integration/observability/*`

## Acceptance Criteria
- Required fields are present for lifecycle, transition, command, and child events.
- Metrics emit expected dimensions without unbounded high-cardinality tags.
- Trace trees preserve parent/child relationships for nested workflows.
- Unit tests validate adapter behavior and failure isolation independent of external sink integrations.

## Spec/Behavior Links
- Spec: sections 6.5, 9.
- Behaviors: `B-OBS-001`, `B-OBS-002`, `B-OBS-003`.
- Integration: `ITX-013`, `ITX-014`.

## Fixed Implementation Decisions
- Logging library: `pino` JSON logs.
- Metrics library: OpenTelemetry metrics API with OTLP exporter.
- Tracing library: OpenTelemetry tracing with W3C context propagation.
- Telemetry failure policy: swallow and record local warning metric/log; never fail workflow state transitions.

## Interface/Schema Contracts
- Required log fields:
  - `runId`, `workflowType`, `eventId`, `sequence`, `timestamp`, `severity`, `message`.
  - command-event logs additionally include `command`, `args`, `stdin`, `stdout`, `stderr`, `exitCode`, `durationMs`, `timeoutMs`, `truncated`, `redactedFields`.
- Required metric dimensions:
  - `workflowType`, `lifecycle`, `transition`, `command`, `outcome`.
- Trace hierarchy contract:
  - root span per run, child transition spans, command spans, child-run spans linked with parent context.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/observability/logger.ts`
- `packages/workflow-server/src/observability/metrics.ts`
- `packages/workflow-server/src/observability/tracing.ts`
- `packages/workflow-server/src/observability/instrumentation-adapter.ts`
- `packages/workflow-server/test/integration/observability/hook-ordering.spec.ts`
- `packages/workflow-server/test/integration/observability/failure-isolation.spec.ts`
- `packages/workflow-server/test/integration/observability/trace-tree.spec.ts`

### Modify
- `packages/workflow-server/src/bootstrap.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- observability`
  - Expected: hook ordering, required fields, and trace lineage tests pass.
- Command: `pnpm --filter workflow-server test -- ITX-013|ITX-014`
  - Expected: sink backpressure/failures do not corrupt run state; trace tree integrity preserved.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-OBS-001 | `instrumentation-adapter.ts` | Required log hooks invoked at major lifecycle/transition points. |
| Behavior-B-OBS-002 | `metrics.ts` | Required metrics emitted with expected dimensions. |
| Behavior-B-OBS-003 | `tracing.ts`, `trace-tree.spec.ts` | Span hierarchy represents workflow/child/command nesting. |
| Integration-ITX-013 | `failure-isolation.spec.ts` | Slow/failing sinks isolated from run-state mutation path. |
