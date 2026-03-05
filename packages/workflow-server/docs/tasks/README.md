# Composable Workflow Implementation Task Suite

This folder contains the end-to-end implementation plan for:
- `docs/typescript-server-workflow-spec.md`
- `docs/behaviors.md`
- `docs/integration-tests.md`

## How to Execute This Plan

1. Execute task documents in numeric order (`T00` -> `T30`).
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
- `T19` -> `T18`
- `T20` -> `T19`
- `T21` -> `T06`, `T20`
- `T22` -> `T02`, `T04`, `T05`, `T07`
- `T23` -> `T11`, `T13`, `T22`
- `T24` -> `T05`, `T10`, `T22`, `T23`
- `T25` -> `T24`, `T22`, `T23`
- `T26` -> `T13`, `T24`, `T25`
- `T27` -> `T24`, `T25`
- `T28` -> `T12`, `T22`, `T23`, `T25`
- `T29` -> `T23`, `T24`, `T27`
- `T30` -> `T24`, `T27`

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
- `T19` [19-production-server-parity-e2e.md](./19-production-server-parity-e2e.md)
- `T20` [20-immediate-start-running-alignment.md](./20-immediate-start-running-alignment.md)
- `T21` [21-recovery-progress-aware-reconcile.md](./21-recovery-progress-aware-reconcile.md)
- `T22` [22-server-human-feedback-runtime.md](./22-server-human-feedback-runtime.md)
- `T23` [23-feedback-api-cli-and-coverage.md](./23-feedback-api-cli-and-coverage.md)
- `T24` [24-shared-api-contract-package.md](./24-shared-api-contract-package.md)
- `T25` [25-run-scoped-feedback-endpoint.md](./25-run-scoped-feedback-endpoint.md)
- `T26` [26-integration-feedback-pagination-contract-conformance.md](./26-integration-feedback-pagination-contract-conformance.md)
- `T27` [27-contract-lock-drift-verification.md](./27-contract-lock-drift-verification.md)
- `T28` [28-golden-scenarios-human-feedback.md](./28-golden-scenarios-human-feedback.md)
- `T29` [29-error-envelope-contract-lock-conformance.md](./29-error-envelope-contract-lock-conformance.md)
- `T30` [30-graph-contract-lock-overlay-conformance.md](./30-graph-contract-lock-overlay-conformance.md)

## Phase Alignment (Spec Section 15)

| Phase | Primary Task Owners | Notes |
|---|---|---|
| Phase 1 (MVP core) | `T00`-`T09`, `T12` | Core runtime/server APIs, required persistence model, child composition, command policy, and baseline observability. |
| Phase 2 (operator UX) | `T10`, `T11` | Live SSE stream and initial user-facing CLI commands. |
| Phase 3 (drift remediation) | `T18` | Post-delivery spec-to-implementation drift correction and contract alignment across runtime, API, observability, and CLI surfaces. |
| Phase 4 (prod parity hardening) | `T19` | Introduce persistent production launcher and enforce black-box E2E parity guarantees with shared composition root. |
| Phase 5 (immediate-start lifecycle alignment) | `T20` | Align start path/runtime/API semantics to immediate execution with no operational `pending` queue state. |
| Phase 6 (recovery progress gating) | `T21` | Enforce repeat-recovery gating on observed post-boundary progression and skip duplicate reconcile side effects. |
| Phase 7 (human feedback runtime) | `T22` | Deliver server-owned default human feedback workflow contract, event semantics, and transactional projection. |
| Phase 8 (feedback API and operator UX) | `T23` | Deliver strict feedback API validation/conflict semantics, CLI feedback commands, and expanded integration/E2E coverage. |
| Phase 9 (shared contracts and feedback endpoint) | `T24`, `T25` | Shared API contract package (`workflow-api-types`) and run-scoped feedback requests endpoint. |
| Phase 10 (contract verification and golden scenarios) | `T26`, `T27`, `T28` | Integration suite for feedback pagination/contract conformance, contract lock drift verification, and golden scenarios for human feedback E2E. |
| Phase 11 (error envelope contract lock alignment) | `T29` | Implement Section 8.0/8.10 shared error-envelope and conflict-contract lock verification with runtime conformance checks. |
| Phase 12 (graph contract lock alignment) | `T30` | Implement Section 10 graph identity/overlay contract lock verification and deterministic overlay reference conformance tests. |
| Phase 13 (future optimization) | _future task(s)_ | Snapshots/replay optimizations and advanced retry/cancellation policies beyond baseline. |
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
| 2) Dynamic load + start by workflow type | `T03`, `T04`, `T05`, `T20` |
| 3) Parent launches child and awaits typed result | `T07` |
| 4) API exposes run state, children, linear history | `T05`, `T07` |
| 5) API exposes definition + runtime graph data | `T05` |
| 6) Logging/telemetry via instrumentation hooks | `T09` |
| 7) Workflow-invoked command execution + policy + observability | `T08`, `T09` |
| 8) User CLI in `apps/workflow-cli` via server APIs | `T11`, `T16` |
| 9) Cooperative + parent-propagated cancellation | `T06`, `T07` |
| 10) Pause/resume/recovery lifecycle + endpoints | `T06` |
| 11) Required lifecycle checkpoint events emitted | `T06`, `T15`, `T16` |
| 12) Server-owned human feedback default workflow contract | `T22`, `T23` |
| 13) Shared transport DTOs from `workflow-api-types` | `T24` |
| 14) API endpoints with consistent `/api/v1` path prefixes | all `B-API-*` task owners |
| 15) API contract updates versioned via `workflow-api-types` | `T24` |
| 16) Run-scoped feedback discovery endpoint | `T25` |
| 17) Every Section 8 endpoint has matching shared contract | `T24`, `T26` |
| 18) Endpoint contract lock matches web spec | `T27` |
| 19) CI fails on contract drift | `T27` |
| 20) Feedback requests endpoint enforces run-scoped filtering | `T25`, `T26` |
| 21) Section 10 graph contracts stay aligned with web graph requirements and shared exports | `T30` |

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