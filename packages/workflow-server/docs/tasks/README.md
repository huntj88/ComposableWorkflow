# Workflow Server Implementation Tasks

Spec: [typescript-server-workflow-spec.md](../typescript-server-workflow-spec.md)
Behaviors: [behaviors.md](../behaviors.md)
Integration tests: [integration-tests.md](../integration-tests.md)

## How to Execute This Plan

1. Execute task documents in numeric order.
2. Do not start a task until all `Depends On` items are complete.
3. If a task is split across PRs, keep all acceptance criteria in the same task document.
4. Treat optional scopes as gated and explicitly documented.

## Dependency Graph (Acyclic)

> Tasks marked ↗ have been moved to their owning package. Follow cross-links.

- `TC-00` ↗ [docs/tasks](../../../../docs/tasks/00-monorepo-foundation.md) -> none
- `WL-00` ↗ [workflow-lib/docs/tasks](../../../workflow-lib/docs/tasks/00-workflow-lib-core.md) -> `TC-00`
- `WS-00` -> `TC-00`
- `WS-01` -> `TC-00`, `WL-00`↗, `WS-00`
- `WS-02` -> `WL-00`↗, `WS-00`, `WS-01`
- `WS-03` -> `WS-02`
- `WS-04` -> `WS-02`, `WS-03`
- `WS-05` -> `WS-02`, `WS-03`
- `WS-06` -> `WS-02`, `WS-03`
- `WS-07` -> `WS-02`
- `WS-08` -> `WS-01`, `WS-03`
- `CLI-00` ↗ [workflow-cli/docs/tasks](../../../../apps/workflow-cli/docs/tasks/00-workflow-cli.md) -> `WS-03`
- `REF-00` ↗ [workflow-package-reference/docs/tasks](../../../workflow-package-reference/docs/tasks/00-reference-workflow-packages.md) -> `WL-00`↗
- `WS-09` -> `WS-03`, `WS-07`, `REF-00`↗
- `WS-10` -> `WS-04`, `WS-05`, `WS-06`, `WS-09`
- `WS-11` -> `WS-04`, `WS-06`, `WS-07`, `WS-09`
- `WS-12` -> `WS-04`, `WS-05`, `WS-06`, `CLI-00`↗, `REF-00`↗
- `TC-01` ↗ [docs/tasks](../../../../docs/tasks/01-ci-quality-gates.md) -> `WS-08`, `WS-10`, `WS-11`, `WS-12`
- `WS-13` -> `TC-01`↗
- `WS-14` -> `WS-13`
- `WS-15` -> `WS-14`
- `WS-16` -> `WS-04`, `WS-15`
- `WS-17` -> `WS-00`, `WS-02`, `WS-03`, `WS-05`
- `WS-18` -> `CLI-00`↗, `WS-09`, `WS-17`
- `API-00` ↗ [workflow-api-types/docs/tasks](../../../workflow-api-types/docs/tasks/00-shared-api-contract-package.md) -> `WS-03`, `WS-08`, `WS-17`, `WS-18`
- `WS-19` -> `API-00`↗, `WS-17`, `WS-18`
- `WS-20` -> `WS-09`, `API-00`↗, `WS-19`
- `WS-21` -> `API-00`↗, `WS-19`
- `WS-22` -> `REF-00`↗, `WS-17`, `WS-18`, `WS-19`
- `WS-23` -> `WS-18`, `API-00`↗, `WS-21`
- `WS-24` -> `API-00`↗, `WS-21`
- `WS-25` -> `API-00`↗, `WS-15`, `WS-21`

## Server Task Index

Tasks owned by `workflow-server`:

- `WS-00` [00-postgres-persistence.md](00-postgres-persistence.md)
- `WS-01` [01-package-loader-registry.md](01-package-loader-registry.md)
- `WS-02` [02-orchestration-engine.md](02-orchestration-engine.md)
- `WS-03` [03-api-surface-read-write.md](03-api-surface-read-write.md)
- `WS-04` [04-lifecycle-controls-recovery.md](04-lifecycle-controls-recovery.md)
- `WS-05` [05-child-workflow-composition.md](05-child-workflow-composition.md)
- `WS-06` [06-command-runner-policy.md](06-command-runner-policy.md)
- `WS-07` [07-observability-instrumentation.md](07-observability-instrumentation.md)
- `WS-08` [08-live-event-stream-sse.md](08-live-event-stream-sse.md)
- `WS-09` [09-integration-harness.md](09-integration-harness.md)
- `WS-10` [10-integration-suite-atomicity-concurrency.md](10-integration-suite-atomicity-concurrency.md)
- `WS-11` [11-integration-suite-lifecycle-command-observability.md](11-integration-suite-lifecycle-command-observability.md)
- `WS-12` [12-e2e-suite-golden-scenarios.md](12-e2e-suite-golden-scenarios.md)
- `WS-13` [13-spec-drift-corrections.md](13-spec-drift-corrections.md)
- `WS-14` [14-production-server-parity-e2e.md](14-production-server-parity-e2e.md)
- `WS-15` [15-immediate-start-running-alignment.md](15-immediate-start-running-alignment.md)
- `WS-16` [16-recovery-progress-aware-reconcile.md](16-recovery-progress-aware-reconcile.md)
- `WS-17` [17-server-human-feedback-runtime.md](17-server-human-feedback-runtime.md)
- `WS-18` [18-feedback-api-cli-and-coverage.md](18-feedback-api-cli-and-coverage.md)
- `WS-19` [19-run-scoped-feedback-endpoint.md](19-run-scoped-feedback-endpoint.md)
- `WS-20` [20-integration-feedback-pagination-contract-conformance.md](20-integration-feedback-pagination-contract-conformance.md)
- `WS-21` [21-contract-lock-drift-verification.md](21-contract-lock-drift-verification.md)
- `WS-22` [22-golden-scenarios-human-feedback.md](22-golden-scenarios-human-feedback.md)
- `WS-23` [23-error-envelope-contract-lock-conformance.md](23-error-envelope-contract-lock-conformance.md)
- `WS-24` [24-graph-contract-lock-overlay-conformance.md](24-graph-contract-lock-overlay-conformance.md)
- `WS-25` [25-definitions-list-and-start-contract-conformance.md](25-definitions-list-and-start-contract-conformance.md)

## Tasks in Other Packages

- `TC-00` [00-monorepo-foundation.md](../../../../docs/tasks/00-monorepo-foundation.md) — cross-cutting
- `WL-00` [00-workflow-lib-core.md](../../../workflow-lib/docs/tasks/00-workflow-lib-core.md) — `workflow-lib`
- `CLI-00` [00-workflow-cli.md](../../../../apps/workflow-cli/docs/tasks/00-workflow-cli.md) — `workflow-cli`
- `REF-00` [00-reference-workflow-packages.md](../../../workflow-package-reference/docs/tasks/00-reference-workflow-packages.md) — `workflow-package-reference`
- `TC-01` [01-ci-quality-gates.md](../../../../docs/tasks/01-ci-quality-gates.md) — cross-cutting
- `API-00` [00-shared-api-contract-package.md](../../../workflow-api-types/docs/tasks/00-shared-api-contract-package.md) — `workflow-api-types`

## Phase Alignment

| Phase | Primary Task Owners | Notes |
|---|---|---|
| Phase 1 (MVP core) | `TC-00`↗-`WS-07`, `REF-00`↗ | Core runtime/server APIs, required persistence model, child composition, command policy, and baseline observability. |
| Phase 2 (operator UX) | `WS-08`, `CLI-00`↗ | Live SSE stream and initial user-facing CLI commands. |
| Phase 3 (drift remediation) | `WS-13` | Post-delivery spec-to-implementation drift correction and contract alignment across runtime, API, observability, and CLI surfaces. |
| Phase 4 (prod parity hardening) | `WS-14` | Introduce persistent production launcher and enforce black-box E2E parity guarantees with shared composition root. |
| Phase 5 (immediate-start lifecycle alignment) | `WS-15` | Align start path/runtime/API semantics to immediate execution with no operational `pending` queue state. |
| Phase 6 (recovery progress gating) | `WS-16` | Enforce repeat-recovery gating on observed post-boundary progression and skip duplicate reconcile side effects. |
| Phase 7 (human feedback runtime) | `WS-17` | Deliver server-owned default human feedback workflow contract, event semantics, and transactional projection. |
| Phase 8 (feedback API and operator UX) | `WS-18` | Deliver strict feedback API validation/conflict semantics, CLI feedback commands, and expanded integration/E2E coverage. |
| Phase 9 (shared contracts and feedback endpoint) | `API-00`↗, `WS-19` | Shared API contract package (`workflow-api-types`) and run-scoped feedback requests endpoint. |
| Phase 10 (contract verification and golden scenarios) | `WS-20`, `WS-21`, `WS-22` | Integration suite for feedback pagination/contract conformance, contract lock drift verification, and golden scenarios for human feedback E2E. |
| Phase 11 (error envelope contract lock alignment) | `WS-23` | Error-envelope and conflict-contract lock verification with runtime conformance checks. |
| Phase 12 (graph contract lock alignment) | `WS-24` | Graph identity/overlay contract lock verification and deterministic overlay reference conformance tests. |
| Phase 13 (definitions/start contract conformance) | `WS-25` | Implement list-definitions endpoint conformance and strict start response/error semantics aligned across specs/contracts. |
| Phase 14 (future optimization) | _future task(s)_ | Snapshots/replay optimizations and advanced retry/cancellation policies beyond baseline. |
| Cross-phase verification/gates | `WS-09`-`TC-01`↗ | Integration harness, integration suites, E2E suite, and CI quality gates validating all required behaviors. |

## Coverage Expectations

- Every `B-*` behavior in [behaviors.md](../behaviors.md) must be owned by at least one E2E test.
- Every integration-primary item in [integration-tests.md](../integration-tests.md) section 5.1 must be owned by at least one integration test.
- Shared coverage ([integration-tests.md](../integration-tests.md) section 5.2) must have both E2E and integration presence.
- No task may add a dependency on a numerically later task.
