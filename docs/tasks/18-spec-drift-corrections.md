# T18 - Spec Drift Corrections and Contract Alignment

## Depends On
- `T17`

## Objective
Close implementation drift between `docs/typescript-server-workflow-spec.md` and current runtime/API/CLI behavior, with explicit contract alignment and regression coverage.

## Implementation Tasks
- [x] Implement runtime workflow log emission from `ctx.log(...)` so custom workflow logs are persisted and observable.
- [x] Populate run summary `currentTransitionContext` from persisted transition/event state instead of always returning `null`.
- [x] Expand definition inspection output to provide generator-friendly metadata:
  - include static `states` and `transitions` in DB-fallback path when available,
  - populate `childLaunchAnnotations` for known launch points (or persisted metadata source).
- [x] Align event API contract with workflow event shape requirements:
  - include typed fields (`workflowType`, `parentRunId`, `state`, `transition`, `child`, `command`) in response schema and mapping.
- [x] Align CLI operator surface with spec responsibilities by adding run-tree inspection support.
- [x] Expand observability metrics to include required counters/gauges/histograms:
  - run counts by workflow type/lifecycle,
  - transition counts/failures,
  - command invocation counts/failures/timeouts,
  - child launch counts/failures,
  - duration metrics and active run gauge.
- [x] Normalize log payload field naming (`level`/`severity`) so logs API returns authored level consistently.
- [x] Add/adjust tests in server integration/e2e and CLI suites for each corrected drift item.

## Required Artifacts
- `packages/workflow-server/src/orchestrator/transition-runner.ts`
- `packages/workflow-server/src/api/routes/runs.ts`
- `packages/workflow-server/src/api/routes/definitions.ts`
- `packages/workflow-server/src/api/schemas.ts`
- `packages/workflow-server/src/observability/instrumentation-adapter.ts`
- `packages/workflow-server/test/integration/**`
- `packages/workflow-server/test/e2e/**`
- `apps/workflow-cli/src/commands/*`
- `apps/workflow-cli/src/http/client.ts`
- `apps/workflow-cli/test/**`

## Acceptance Criteria
- Spec-defined workflow log behavior (`log` event emission + API visibility) is implemented and verified.
- Run summary includes non-null transition context when an in-flight transition context exists.
- Definition endpoint returns complete graph-friendly metadata consistent with loaded definition data.
- Events API payload shape includes required typed fields without breaking pagination/cursor guarantees.
- CLI supports run tree inspection workflow and validates response rendering in tests.
- Metrics set covers all required counters/failures/duration and active-run signals.
- Logs endpoint returns consistent level semantics for command and custom log events.

## Spec/Behavior Links
- Spec: sections 4.3, 6.4, 8.2, 8.3, 8.8, 9.1, 9.2, 10.1, 10.2, 16.
- Behaviors: `B-API-*`, `B-EVT-*`, `B-OBS-*`, `B-CLI-*`.

## Fixed Implementation Decisions
- Drift remediation is additive and backward-compatible for existing clients wherever possible.
- Event API and CLI updates must preserve cursor/reconnect semantics.
- Required metric families are emitted from centralized instrumentation adapter paths.
- Transition context source-of-truth remains persisted event/run state; no in-memory-only projection.

## Interface/Schema Contracts
- Events API contract extension:
  - `GET /api/v1/workflows/runs/{runId}/events` items include existing fields plus derived typed fields:
    - `workflowType`, `parentRunId`, `state`, `transition`, `child`, `command`.
- Run summary contract:
  - `currentTransitionContext` is `null` only when no active transition context is present.
- CLI command contract extension:
  - `workflow runs tree --run-id <id> [--depth <n>] [--include-completed-children <bool>] [--json]`.
- Log payload normalization contract:
  - persisted log level key is canonicalized and logs API emits deterministic `level` value.

## File Plan (Exact)
### Create
- `apps/workflow-cli/src/commands/runs-tree.ts`
- `apps/workflow-cli/test/contract/runs-tree.spec.ts`
- `packages/workflow-server/test/integration/api/events-contract-shape.spec.ts`
- `packages/workflow-server/test/integration/api/run-summary-transition-context.spec.ts`
- `packages/workflow-server/test/integration/api/definition-graph-metadata.spec.ts`
- `packages/workflow-server/test/integration/observability/required-metrics.spec.ts`

### Modify
- `packages/workflow-server/src/orchestrator/transition-runner.ts`
- `packages/workflow-server/src/api/routes/runs.ts`
- `packages/workflow-server/src/api/routes/definitions.ts`
- `packages/workflow-server/src/api/schemas.ts`
- `packages/workflow-server/src/observability/instrumentation-adapter.ts`
- `apps/workflow-cli/src/index.ts`
- `apps/workflow-cli/src/http/client.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- events-contract-shape`
  - Expected: events API returns required typed event fields with stable ordering/cursor behavior.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- run-summary-transition-context`
  - Expected: `currentTransitionContext` is populated when transition context exists.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- required-metrics`
  - Expected: required metric families are emitted for run/transition/command/child/lifecycle signals.
- Command: `pnpm --filter @composable-workflow/workflow-cli test -- runs-tree`
  - Expected: CLI run tree command parses options, calls API correctly, and renders output.
- Command: `pnpm --filter @composable-workflow/workflow-server test && pnpm --filter @composable-workflow/workflow-cli test`
  - Expected: no regressions in existing suites.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Spec-4.3-WorkflowCustomLogs | `transition-runner.ts`, `runs.ts` | `ctx.log(...)` emits persisted `log` events retrievable from logs API. |
| Spec-8.2-RunSummaryTransitionContext | `runs.ts`, `schemas.ts` | run summary includes transition context when active. |
| Spec-8.8-DefinitionGraphMetadata | `definitions.ts`, `schemas.ts` | definition endpoint returns complete graph metadata fields. |
| Spec-6.4-WorkflowEventContract | `events.ts`, `schemas.ts` | events endpoint exposes required typed workflow event fields. |
| Spec-6.7-CLIInspectionScope | `runs-tree.ts`, `index.ts`, `client.ts` | CLI provides run tree inspection command and validates output. |
| Spec-9.2-RequiredMetricsSet | `instrumentation-adapter.ts` | required counters/failures/durations/gauges are emitted. |
| Spec-9.1-LogFieldConsistency | `transition-runner.ts`, `runs.ts` | logs API level fields are deterministic and consistent. |
