# Workflow Web SPA Implementation Task Suite

This folder contains the ordered implementation plan for:
- `apps/workflow-web/docs/workflow-web-spec.md`
- `apps/workflow-web/docs/workflow-web-behaviors.md`
- `apps/workflow-web/docs/workflow-web-integration-tests.md`

## How to Execute This Plan

1. Execute tasks in numeric order (`WEB-00` -> `WEB-18`).
2. Do not start a task until all `Depends On` tasks are complete.
3. Keep each task's acceptance criteria complete before closing it.
4. Treat each task's requirement mapping as mandatory scope.

## Dependency Graph (Acyclic)

- `WEB-00` -> none
- `WEB-01` -> `WEB-00`
- `WEB-02` -> `WEB-00`, `WEB-01`
- `WEB-03` -> `WEB-00`
- `WEB-04` -> `WEB-02`, `WEB-03`
- `WEB-05` -> `WEB-02`, `WEB-03`, `WEB-04`
- `WEB-06` -> `WEB-02`, `WEB-03`, `WEB-04`
- `WEB-07` -> `WEB-01`, `WEB-02`
- `WEB-08` -> `WEB-02`, `WEB-03`
- `WEB-09` -> `WEB-00`, `WEB-03`, `WEB-04`, `WEB-05`, `WEB-06`, `WEB-07`, `WEB-08`
- `WEB-10` -> `WEB-09`, `WEB-01`, `WEB-02`, `WEB-03`, `WEB-04`, `WEB-05`, `WEB-06`, `WEB-07`
- `WEB-11` -> `WEB-09`, `WEB-03`, `WEB-04`, `WEB-08`
- `WEB-12` -> `WEB-10`, `WEB-11`
- `WEB-13` -> `WEB-01`, `WEB-03`, `WEB-07`
- `WEB-14` -> `WEB-02`, `WEB-03`, `WEB-07`, `WEB-08`
- `WEB-15` -> `WEB-02`, `WEB-03`, `WEB-04`, `WEB-06`, `WEB-08`
- `WEB-16` -> `WEB-05`, `WEB-06`
- `WEB-17` -> `WEB-09`, `WEB-13`, `WEB-14`, `WEB-15`, `WEB-16`
- `WEB-18` -> `WEB-12`, `WEB-17`

No dependency points to a numerically later prerequisite.

## Task Index

- `WEB-00` [00-foundation-contracts-and-stack.md](./00-foundation-contracts-and-stack.md)
- `WEB-01` [01-routing-shell-and-runs-list.md](./01-routing-shell-and-runs-list.md)
- `WEB-02` [02-run-dashboard-snapshots-panels-actions.md](./02-run-dashboard-snapshots-panels-actions.md)
- `WEB-03` [03-typed-transport-contracts-and-errors.md](./03-typed-transport-contracts-and-errors.md)
- `WEB-04` [04-stream-adapter-ordering-reconnect-health.md](./04-stream-adapter-ordering-reconnect-health.md)
- `WEB-05` [05-human-feedback-discovery-and-submission.md](./05-human-feedback-discovery-and-submission.md)
- `WEB-06` [06-events-logs-filters-and-realtime-behavior.md](./06-events-logs-filters-and-realtime-behavior.md)
- `WEB-07` [07-layout-tokens-theme-and-accessibility.md](./07-layout-tokens-theme-and-accessibility.md)
- `WEB-08` [08-fsm-graph-projection-layout-overlay-and-performance.md](./08-fsm-graph-projection-layout-overlay-and-performance.md)
- `WEB-09` [09-web-integration-harness-and-fixtures.md](./09-web-integration-harness-and-fixtures.md)
- `WEB-10` [10-integration-suite-routes-dashboard-feedback-a11y.md](./10-integration-suite-routes-dashboard-feedback-a11y.md)
- `WEB-11` [11-integration-suite-stream-transport-graph-contracts.md](./11-integration-suite-stream-transport-graph-contracts.md)
- `WEB-12` [12-e2e-smoke-coverage-ledger-and-ci-gates.md](./12-e2e-smoke-coverage-ledger-and-ci-gates.md)
- `WEB-13` [13-start-workflow-discovery-and-launch.md](./13-start-workflow-discovery-and-launch.md)
- `WEB-14` [14-child-fsm-drill-down-and-graph-relationships.md](./14-child-fsm-drill-down-and-graph-relationships.md)
- `WEB-15` [15-transition-history-and-cross-panel-coordination.md](./15-transition-history-and-cross-panel-coordination.md)
- `WEB-16` [16-feedback-single-select-and-logs-windowing.md](./16-feedback-single-select-and-logs-windowing.md)
- `WEB-17` [17-integration-suite-start-drilldown-history-logs.md](./17-integration-suite-start-drilldown-history-logs.md)
- `WEB-18` [18-e2e-coverage-ledger-and-ci-gates-spec-delta.md](./18-e2e-coverage-ledger-and-ci-gates-spec-delta.md)

## Additional Spec Rule Ownership (Non-Behavior IDs)

- Definitions route implementation (`#/definitions/:workflowType`) and definition metadata page composition -> `WEB-01`, `WEB-08`.
- Event/log default + max pagination and deterministic ordering semantics from spec Section 6.7 -> `WEB-03`, `WEB-06`, `WEB-11`.
- Event free-text matching domain semantics (case-insensitive substring across normative fields) -> `WEB-06`, `WEB-10`.
- Stream query `eventType` unsupported-value request error surfacing (spec Section 5.3) -> `WEB-04`, `WEB-11`.
- Cross-spec contract evolution order gate (`workflow-api-types` -> server -> web) from spec Section 6.4 -> `WEB-03`, `WEB-11`, `WEB-12`.
- Shared contract package export availability validation (spec acceptance criterion 31) -> `WEB-03`, `WEB-11`.
- Start workflow discovery, definitions-backed type selection, and `POST /api/v1/workflows/start` success/error semantics -> `WEB-13`, `WEB-17`, `WEB-18`.
- Child-FSM drill-down target resolution, breadcrumb navigation, browser-history semantics, and iteration selection from `child.started` events -> `WEB-14`, `WEB-17`, `WEB-18`.
- Transition History derivation from transition-relevant event types plus nested child-history recursion and cross-panel selection sync -> `WEB-15`, `WEB-17`.
- Feedback single-select emission guarantees and logs windowing/filter-reset semantics -> `WEB-16`, `WEB-17`.
- Coverage-ledger expansion for `B-WEB-001..068` and `ITX-WEB-001..052` -> `WEB-18`.

## Behavior Coverage Ownership (`B-WEB-*`)

- `WEB-00`: `B-WEB-001`
- `WEB-01`: `B-WEB-002`, `B-WEB-003`, `B-WEB-004`
- `WEB-02`: `B-WEB-005`, `B-WEB-006`, `B-WEB-007`, `B-WEB-008`, `B-WEB-036`, `B-WEB-037`
- `WEB-03`: `B-WEB-009`, `B-WEB-010`, `B-WEB-011`, `B-WEB-012`, `B-WEB-013`, `B-WEB-014`, `B-WEB-054`, `B-WEB-056`
- `WEB-04`: `B-WEB-015`, `B-WEB-016`, `B-WEB-017`, `B-WEB-018`, `B-WEB-019`, `B-WEB-039`, `B-WEB-049`, `B-WEB-050`, `B-WEB-053`
- `WEB-05`: `B-WEB-020`, `B-WEB-021`, `B-WEB-022`, `B-WEB-023`, `B-WEB-038`, `B-WEB-051`
- `WEB-06`: `B-WEB-024`, `B-WEB-025`, `B-WEB-026`, `B-WEB-040`, `B-WEB-045`, `B-WEB-052`
- `WEB-07`: `B-WEB-027`, `B-WEB-028`, `B-WEB-029`, `B-WEB-046`, `B-WEB-047`, `B-WEB-048`, `B-WEB-055`
- `WEB-08`: `B-WEB-030`, `B-WEB-031`, `B-WEB-032`, `B-WEB-033`, `B-WEB-034`, `B-WEB-035`, `B-WEB-041`, `B-WEB-042`, `B-WEB-043`, `B-WEB-044`
- `WEB-13`: `B-WEB-057`, `B-WEB-058`, `B-WEB-059`, `B-WEB-060`
- `WEB-14`: `B-WEB-061`, `B-WEB-062`, `B-WEB-063`
- `WEB-15`: `B-WEB-064`, `B-WEB-065`, `B-WEB-066`
- `WEB-16`: `B-WEB-067`, `B-WEB-068`

## Integration Coverage Ownership (`ITX-WEB-*`)

- `WEB-10`: `ITX-WEB-001`, `ITX-WEB-002`, `ITX-WEB-003`, `ITX-WEB-004`, `ITX-WEB-007`, `ITX-WEB-011`, `ITX-WEB-012`, `ITX-WEB-013`, `ITX-WEB-014`, `ITX-WEB-015`, `ITX-WEB-016`, `ITX-WEB-024`, `ITX-WEB-025`, `ITX-WEB-026`, `ITX-WEB-028`, `ITX-WEB-033`, `ITX-WEB-035`, `ITX-WEB-042`
- `WEB-11`: `ITX-WEB-005`, `ITX-WEB-006`, `ITX-WEB-008`, `ITX-WEB-009`, `ITX-WEB-010`, `ITX-WEB-017`, `ITX-WEB-018`, `ITX-WEB-019`, `ITX-WEB-020`, `ITX-WEB-021`, `ITX-WEB-022`, `ITX-WEB-023`, `ITX-WEB-027`, `ITX-WEB-029`, `ITX-WEB-030`, `ITX-WEB-031`, `ITX-WEB-032`, `ITX-WEB-034`, `ITX-WEB-036`, `ITX-WEB-037`, `ITX-WEB-038`, `ITX-WEB-039`, `ITX-WEB-040`, `ITX-WEB-041`, `ITX-WEB-043`
- `WEB-17`: `ITX-WEB-044`, `ITX-WEB-045`, `ITX-WEB-046`, `ITX-WEB-047`, `ITX-WEB-048`, `ITX-WEB-049`, `ITX-WEB-050`, `ITX-WEB-051`, `ITX-WEB-052`

All integration test IDs from `ITX-WEB-001` through `ITX-WEB-052` are assigned.

## Task Document Contract (Mandatory Sections)

Every `WEB-*` task includes:
- `Fixed Implementation Decisions`
- `Interface/Schema Contracts`
- `Implementation Tasks`
- `Required Artifacts`
- `File Plan (Exact)`
- `Acceptance Criteria`
- `Verification`
- `One-to-One Requirement Mapping`

Rules:
- Do not use wildcard requirement IDs in mappings.
- Each mapped requirement points to one primary artifact.
- Verification commands are executable from repository root.
