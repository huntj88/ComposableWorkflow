# Composable Workflow Implementation Task Suite

This folder contains the end-to-end implementation plan for:
- `docs/typescript-server-workflow-spec.md`
- `docs/behaviors.md`
- `docs/integration-tests.md`

## How to Execute This Plan

1. Execute task documents in numeric order (`T00` -> `T17`).
2. Do not start a task until all `Depends On` items are complete.
3. If a task is split across PRs, keep all acceptance criteria in the same task document.
4. Treat optional scopes as gated and explicitly documented.

## Dependency Graph (Acyclic)

- `T00` -> none
- `T01` -> `T00`
- `T02` -> `T00`
- `T03` -> `T00`, `T01`, `T02`
- `T04` -> `T01`, `T02`, `T03`
- `T05` -> `T04`
- `T06` -> `T04`, `T05`
- `T07` -> `T04`, `T05`
- `T08` -> `T04`, `T05`
- `T09` -> `T04`
- `T10` -> `T03`, `T05`
- `T11` -> `T05`
- `T12` -> `T01`
- `T13` -> `T05`, `T09`, `T12`
- `T14` -> `T06`, `T07`, `T08`, `T13`
- `T15` -> `T06`, `T08`, `T09`, `T13`
- `T16` -> `T06`, `T07`, `T08`, `T11`, `T12`
- `T17` -> `T10`, `T14`, `T15`, `T16`
- `T18` -> `T17`

## Task Index

- `T00` [00-monorepo-foundation.md](./00-monorepo-foundation.md)
- `T01` [01-workflow-lib-core.md](./01-workflow-lib-core.md)
- `T02` [02-postgres-persistence.md](./02-postgres-persistence.md)
- `T03` [03-package-loader-registry.md](./03-package-loader-registry.md)
- `T04` [04-orchestration-engine.md](./04-orchestration-engine.md)
- `T05` [05-api-surface-read-write.md](./05-api-surface-read-write.md)
- `T06` [06-lifecycle-controls-recovery.md](./06-lifecycle-controls-recovery.md)
- `T07` [07-child-workflow-composition.md](./07-child-workflow-composition.md)
- `T08` [08-command-runner-policy.md](./08-command-runner-policy.md)
- `T09` [09-observability-instrumentation.md](./09-observability-instrumentation.md)
- `T10` [10-live-event-stream-sse.md](./10-live-event-stream-sse.md)
- `T11` [11-workflow-cli.md](./11-workflow-cli.md)
- `T12` [12-reference-workflow-packages.md](./12-reference-workflow-packages.md)
- `T13` [13-integration-harness.md](./13-integration-harness.md)
- `T14` [14-integration-suite-atomicity-concurrency.md](./14-integration-suite-atomicity-concurrency.md)
- `T15` [15-integration-suite-lifecycle-command-observability.md](./15-integration-suite-lifecycle-command-observability.md)
- `T16` [16-e2e-suite-golden-scenarios.md](./16-e2e-suite-golden-scenarios.md)
- `T17` [17-ci-quality-gates.md](./17-ci-quality-gates.md)
- `T18` [18-spec-drift-corrections.md](./18-spec-drift-corrections.md)

## Phase Alignment (Spec Section 15)

| Phase | Primary Task Owners | Notes |
|---|---|---|
| Phase 1 (MVP core) | `T00`-`T09`, `T12` | Core runtime/server APIs, required persistence model, child composition, command policy, and baseline observability. |
| Phase 2 (operator UX) | `T10`, `T11` | Live SSE stream and initial user-facing CLI commands. |
| Phase 3 (drift remediation) | `T18` | Post-delivery spec-to-implementation drift correction and contract alignment across runtime, API, observability, and CLI surfaces. |
| Phase 4 (future optimization) | _future task(s)_ | Snapshots/replay optimizations and advanced retry/cancellation policies beyond baseline. |
| Cross-phase verification/gates | `T13`-`T17` | Integration harness, integration suites, E2E suite, and CI quality gates validating all required behaviors. |

## Coverage Expectations

- Every `B-*` behavior in `docs/behaviors.md` must be owned by at least one E2E test.
- Every integration-primary item in `docs/integration-tests.md` section 5.1 must be owned by at least one integration test.
- Shared coverage (`docs/integration-tests.md` section 5.2) must have both E2E and integration presence.
- No task may add a dependency on a numerically later task.

## Spec Acceptance Criteria Ownership (Section 16)

| Spec Acceptance Criterion | Primary Task Owner(s) |
|---|---|
| 1) Package decoupling from server internals | `T01`, `T12` |
| 2) Dynamic load + start by workflow type | `T03`, `T04`, `T05` |
| 3) Parent launches child and awaits typed result | `T07` |
| 4) API exposes run state, children, linear history | `T05`, `T07` |
| 5) API exposes definition + runtime graph data | `T05` |
| 6) Logging/telemetry via instrumentation hooks | `T09` |
| 7) Workflow-invoked command execution + policy + observability | `T08`, `T09` |
| 8) User CLI in `apps/workflow-cli` via server APIs | `T11`, `T16` |
| 9) Cooperative + parent-propagated cancellation | `T06`, `T07` |
| 10) Pause/resume/recovery lifecycle + endpoints | `T06` |
| 11) Required lifecycle checkpoint events emitted | `T06`, `T15`, `T16` |

## Task Document Contract (Mandatory Sections)

Every task file `T00+` must include all sections below:
- `Fixed Implementation Decisions`
- `Interface/Schema Contracts`
- `File Plan (Exact)` with explicit `Create` and `Modify` lists
- `Verification` with runnable commands and expected assertions
- `One-to-One Requirement Mapping` table

Rules:
- Do not use wildcard requirement mapping (`B-*`, `ITX-*`) in the mapping table.
- Every mapped requirement must point to exactly one primary implementation artifact or test file.
- Verification commands must be executable from repo root.
- Optional scopes must state feature gate conditions explicitly.