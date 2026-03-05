# Workflow Web SPA Implementation Task Suite

This folder contains the ordered implementation plan for:
- `apps/workflow-web/docs/workflow-web-spec.md`
- `apps/workflow-web/docs/workflow-web-behaviors.md`
- `apps/workflow-web/docs/workflow-web-integration-tests.md`

## How to Execute This Plan

1. Execute tasks in numeric order (`TWEB00` -> `TWEB12`).
2. Do not start a task until all `Depends On` tasks are complete.
3. Keep each task's acceptance criteria complete before closing it.
4. Treat each task's requirement mapping as mandatory scope.

## Dependency Graph (Acyclic)

- `TWEB00` -> none
- `TWEB01` -> `TWEB00`
- `TWEB02` -> `TWEB00`, `TWEB01`
- `TWEB03` -> `TWEB00`
- `TWEB04` -> `TWEB02`, `TWEB03`
- `TWEB05` -> `TWEB02`, `TWEB03`, `TWEB04`
- `TWEB06` -> `TWEB02`, `TWEB03`, `TWEB04`
- `TWEB07` -> `TWEB01`, `TWEB02`
- `TWEB08` -> `TWEB02`, `TWEB03`
- `TWEB09` -> `TWEB00`, `TWEB03`, `TWEB04`, `TWEB05`, `TWEB06`, `TWEB07`, `TWEB08`
- `TWEB10` -> `TWEB09`, `TWEB01`, `TWEB02`, `TWEB03`, `TWEB04`, `TWEB05`, `TWEB06`, `TWEB07`
- `TWEB11` -> `TWEB09`, `TWEB03`, `TWEB04`, `TWEB08`
- `TWEB12` -> `TWEB10`, `TWEB11`

No dependency points to a numerically later prerequisite.

## Task Index

- `TWEB00` [00-foundation-contracts-and-stack.md](./00-foundation-contracts-and-stack.md)
- `TWEB01` [01-routing-shell-and-runs-list.md](./01-routing-shell-and-runs-list.md)
- `TWEB02` [02-run-dashboard-snapshots-panels-actions.md](./02-run-dashboard-snapshots-panels-actions.md)
- `TWEB03` [03-typed-transport-contracts-and-errors.md](./03-typed-transport-contracts-and-errors.md)
- `TWEB04` [04-stream-adapter-ordering-reconnect-health.md](./04-stream-adapter-ordering-reconnect-health.md)
- `TWEB05` [05-human-feedback-discovery-and-submission.md](./05-human-feedback-discovery-and-submission.md)
- `TWEB06` [06-events-logs-filters-and-realtime-behavior.md](./06-events-logs-filters-and-realtime-behavior.md)
- `TWEB07` [07-layout-tokens-theme-and-accessibility.md](./07-layout-tokens-theme-and-accessibility.md)
- `TWEB08` [08-fsm-graph-projection-layout-overlay-and-performance.md](./08-fsm-graph-projection-layout-overlay-and-performance.md)
- `TWEB09` [09-web-integration-harness-and-fixtures.md](./09-web-integration-harness-and-fixtures.md)
- `TWEB10` [10-integration-suite-routes-dashboard-feedback-a11y.md](./10-integration-suite-routes-dashboard-feedback-a11y.md)
- `TWEB11` [11-integration-suite-stream-transport-graph-contracts.md](./11-integration-suite-stream-transport-graph-contracts.md)
- `TWEB12` [12-e2e-smoke-coverage-ledger-and-ci-gates.md](./12-e2e-smoke-coverage-ledger-and-ci-gates.md)

## Additional Spec Rule Ownership (Non-Behavior IDs)

- Definitions route implementation (`#/definitions/:workflowType`) and definition metadata page composition -> `TWEB01`, `TWEB08`.
- Event/log default + max pagination and deterministic ordering semantics from spec Section 6.7 -> `TWEB03`, `TWEB06`, `TWEB11`.
- Event free-text matching domain semantics (case-insensitive substring across normative fields) -> `TWEB06`, `TWEB10`.
- Stream query `eventType` unsupported-value request error surfacing (spec Section 5.3) -> `TWEB04`, `TWEB11`.
- Cross-spec contract evolution order gate (`workflow-api-types` -> server -> web) from spec Section 6.4 -> `TWEB03`, `TWEB11`, `TWEB12`.
- Shared contract package export availability validation (spec acceptance criterion 31) -> `TWEB03`, `TWEB11`.

## Behavior Coverage Ownership (`B-WEB-*`)

- `TWEB00`: `B-WEB-001`
- `TWEB01`: `B-WEB-002`, `B-WEB-003`, `B-WEB-004`
- `TWEB02`: `B-WEB-005`, `B-WEB-006`, `B-WEB-007`, `B-WEB-008`, `B-WEB-036`, `B-WEB-037`
- `TWEB03`: `B-WEB-009`, `B-WEB-010`, `B-WEB-011`, `B-WEB-012`, `B-WEB-013`, `B-WEB-014`, `B-WEB-054`, `B-WEB-056`
- `TWEB04`: `B-WEB-015`, `B-WEB-016`, `B-WEB-017`, `B-WEB-018`, `B-WEB-019`, `B-WEB-039`, `B-WEB-049`, `B-WEB-050`, `B-WEB-053`
- `TWEB05`: `B-WEB-020`, `B-WEB-021`, `B-WEB-022`, `B-WEB-023`, `B-WEB-038`, `B-WEB-051`
- `TWEB06`: `B-WEB-024`, `B-WEB-025`, `B-WEB-026`, `B-WEB-040`, `B-WEB-045`, `B-WEB-052`
- `TWEB07`: `B-WEB-027`, `B-WEB-028`, `B-WEB-029`, `B-WEB-046`, `B-WEB-047`, `B-WEB-048`, `B-WEB-055`
- `TWEB08`: `B-WEB-030`, `B-WEB-031`, `B-WEB-032`, `B-WEB-033`, `B-WEB-034`, `B-WEB-035`, `B-WEB-041`, `B-WEB-042`, `B-WEB-043`, `B-WEB-044`

## Integration Coverage Ownership (`ITX-WEB-*`)

- `TWEB10`: `ITX-WEB-001`, `ITX-WEB-002`, `ITX-WEB-003`, `ITX-WEB-004`, `ITX-WEB-007`, `ITX-WEB-011`, `ITX-WEB-012`, `ITX-WEB-013`, `ITX-WEB-014`, `ITX-WEB-015`, `ITX-WEB-016`, `ITX-WEB-024`, `ITX-WEB-025`, `ITX-WEB-026`, `ITX-WEB-028`, `ITX-WEB-033`, `ITX-WEB-035`, `ITX-WEB-042`
- `TWEB11`: `ITX-WEB-005`, `ITX-WEB-006`, `ITX-WEB-008`, `ITX-WEB-009`, `ITX-WEB-010`, `ITX-WEB-017`, `ITX-WEB-018`, `ITX-WEB-019`, `ITX-WEB-020`, `ITX-WEB-021`, `ITX-WEB-022`, `ITX-WEB-023`, `ITX-WEB-027`, `ITX-WEB-029`, `ITX-WEB-030`, `ITX-WEB-031`, `ITX-WEB-032`, `ITX-WEB-034`, `ITX-WEB-036`, `ITX-WEB-037`, `ITX-WEB-038`, `ITX-WEB-039`, `ITX-WEB-040`, `ITX-WEB-041`, `ITX-WEB-043`

All integration test IDs from `ITX-WEB-001` through `ITX-WEB-043` are assigned.

## Task Document Contract (Mandatory Sections)

Every `TWEB` task includes:
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
