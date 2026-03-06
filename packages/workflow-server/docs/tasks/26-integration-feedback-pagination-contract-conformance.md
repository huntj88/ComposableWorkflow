# T26 - Integration Suite: Feedback Pagination and Contract Conformance

## Depends On
- `T13`
- `T24`
- `T25`

## Objective
Implement integration tests for run-scoped feedback discovery pagination/filter behavior (`ITX-030`) and endpoint handler type conformance against `workflow-api-types` (`ITX-031`). These are integration-primary because they require controlled insertion during pagination (ITX-030) and compile-time/structural type conformance assertions (ITX-031).

## Fixed Implementation Decisions
- ITX-030 uses the integration harness with real Postgres to test pagination stability under concurrent feedback creation.
- ITX-031 uses compile-time and structural type assertions (not runtime API calls) to verify handler boundary type conformance.
- ITX-031 verification may use TypeScript `satisfies` or explicit type assignability checks in test files.

## Interface/Schema Contracts
- ITX-030 tests the `GET /api/v1/workflows/runs/{runId}/feedback-requests` endpoint contract as defined in B-API-009.
- ITX-031 verifies that all Section 4 endpoint handler/service boundaries import and type-conform to `@composable-workflow/workflow-api-types` exports.

## Implementation Tasks
- [x] Implement ITX-030: Run-scoped feedback discovery pagination and filter behavior.
  - Create parent workflow with multiple feedback child runs in mixed statuses (`awaiting_response`, `responded`, `cancelled`).
  - Page through endpoint with varying `status`, `limit`, and `cursor` parameters.
  - Create feedback requests under a different parent run to verify scoping.
  - Assert: only run-lineage feedback requests returned; status filter works; sort order correct; cursor stable; no cross-run leakage.
- [x] Implement ITX-031: Endpoint handler type conformance against `workflow-api-types`.
  - For each Section 4 endpoint, verify server route handler/service boundaries import and type-conform to transport contracts from `@composable-workflow/workflow-api-types`.
  - Check that `apps/workflow-cli` and `apps/workflow-web` consume shared contracts without local DTO redefinition.
  - Assert: all endpoints have matching shared contracts; build/typecheck fails on drift; SSE frames align to `WorkflowStreamFrame`.
- [x] Update coverage matrix with new entries.

## Required Artifacts
- `packages/workflow-server/test/integration/human-feedback/run-scoped-pagination.spec.ts`
- `packages/workflow-server/test/integration/contract/type-conformance.spec.ts`

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/human-feedback/run-scoped-pagination.spec.ts`
- `packages/workflow-server/test/integration/contract/type-conformance.spec.ts`

### Modify
- `docs/testing/coverage-matrix.md`

## Acceptance Criteria
- ITX-030: Pagination is stable under concurrent insertion; run-scoping prevents cross-run leakage; status/limit/cursor filters work correctly; sort order is `requested_at DESC`, tie-break `feedback_run_id ASC`.
- ITX-031: All Section 4 endpoints have matching shared transport contracts; server/CLI/web type-conform to `workflow-api-types`; build/typecheck fails on missing or drifted exports.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test:system -- run-scoped-pagination`
  - Expected: ITX-030 pagination and filter tests pass.
- Command: `pnpm --filter @composable-workflow/workflow-server test:system -- type-conformance`
  - Expected: ITX-031 type conformance assertions pass.

## Spec/Behavior Links
- Spec: sections 6.9, 6.9.2, 4.
- Behaviors: `B-API-009`, `B-CONTRACT-001`, `B-CONTRACT-002`, `B-CONTRACT-003`.
- Integration: `ITX-030`, `ITX-031`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| ITX-030 | `test/integration/human-feedback/run-scoped-pagination.spec.ts` | Run-scoped pagination stable; status filter correct; cross-run isolation enforced; sort order verified. |
| ITX-031 | `test/integration/contract/type-conformance.spec.ts` | All Section 4 endpoint handlers type-conform to `workflow-api-types` exports; no local DTO redefinitions; build fails on drift. |
