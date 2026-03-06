# WS-25 - Definitions List Endpoint and Start Contract Conformance

## Depends On
- `API-00`
- `WS-03`
- `WS-15`
- `WS-21`

## Objective
Complete the remaining implementation gaps for server/runtime conformance in server spec Section 4:
- `GET /api/v1/workflows/definitions` (`ListDefinitionsResponse` / `DefinitionSummary`),
- start-workflow conformance coverage hardening (`201` create, `200` idempotent match, `404 WORKFLOW_TYPE_NOT_FOUND`, `400 ErrorEnvelope`).

This task ensures implementation and tests match:
- `packages/workflow-server/docs/typescript-server-workflow-spec.md` Section 4.1 and 4.2,
- `apps/workflow-web/docs/workflow-web-spec.md` Section 6.2 and 6.3.1,
- `packages/workflow-api-types/docs/workflow-api-types-spec.md` Section 2.

## Already Implemented Baseline
- `POST /api/v1/workflows/start` route already enforces shared request/response schemas and `201|200|400|404` response contracts.
- Start route already maps unknown workflow types to `404` with `ErrorEnvelope.code = WORKFLOW_TYPE_NOT_FOUND`.
- Existing tests already cover unknown-workflow `404`, create-success `201`, and idempotent dedupe behavior.

## Fixed Implementation Decisions
- Definitions listing endpoint must be implemented as a first-class route (`GET /api/v1/workflows/definitions`) and return data sorted by `workflowType ASC`.
- Response payload must validate against `listDefinitionsResponseSchema` from `@composable-workflow/workflow-api-types`.
- Start test coverage should be tightened only where assertions are still implicit (status + envelope field semantics).
- No local duplicate DTOs for covered endpoint contracts are allowed in server code.

## Interface/Schema Contracts
- `GET /api/v1/workflows/definitions`
  - response: `ListDefinitionsResponse` (`items: DefinitionSummary[]`)
  - ordering: `workflowType ASC`.
- `POST /api/v1/workflows/start`
  - request: `StartWorkflowRequest`
  - success: `201|200` with `StartWorkflowResponse`
  - failure: `404 WORKFLOW_TYPE_NOT_FOUND` (`ErrorEnvelope`), `400` (`ErrorEnvelope`).

## Implementation Tasks
- [ ] Add server route handler for `GET /api/v1/workflows/definitions` and register it in API composition.
- [ ] Source definitions from registered + persisted definitions as implemented policy dictates and normalize to `DefinitionSummary`.
- [ ] Enforce deterministic ordering by `workflowType ASC`.
- [ ] Validate route response with `listDefinitionsResponseSchema` from `@composable-workflow/workflow-api-types`.
- [ ] Add integration test for ITX-035 list-definitions ordering + contract conformance.
- [ ] Extend Section 4 endpoint handler type-conformance assertions to include `GET /api/v1/workflows/definitions` and shared list-definition contracts.
- [ ] Tighten existing start endpoint tests to explicitly assert `200` idempotent status and required `ErrorEnvelope` fields for covered failures.
- [ ] Update coverage matrix ownership for `B-API-011` and `ITX-035`.

## Required Artifacts
- `packages/workflow-server/src/api/routes/definitions.ts`
- `packages/workflow-server/src/api/schemas.ts`
- `packages/workflow-server/test/integration/api/definitions-list-conformance.spec.ts`
- `packages/workflow-server/test/integration/contract/type-conformance.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/start.spec.ts` (or equivalent start-behavior suite)

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/api/definitions-list-conformance.spec.ts`

### Modify
- `packages/workflow-server/src/api/routes/definitions.ts`
- `packages/workflow-server/src/api/schemas.ts`
- `packages/workflow-server/test/integration/contract/type-conformance.spec.ts`
- `packages/workflow-server/test/integration/api/start-and-summary.spec.ts` (tighten explicit status/envelope assertions)
- `packages/workflow-server/test/e2e/behaviors/start.spec.ts` (or equivalent)
- `packages/workflow-server/docs/testing/coverage-matrix.md`
- `packages/workflow-server/docs/integration-tests.md` (if ITX-035 wording changes)
- `packages/workflow-server/docs/behaviors.md` (if B-API-011 wording changes)

## Acceptance Criteria
- `GET /api/v1/workflows/definitions` exists and returns `ListDefinitionsResponse` with deterministic `workflowType ASC` ordering.
- Endpoint payloads conform to shared `DefinitionSummary`/`ListDefinitionsResponse` contracts.
- Existing start tests explicitly assert `200` idempotent status and required `ErrorEnvelope` fields for covered failures.
- Type-conformance coverage includes the list-definitions endpoint in Section 4 endpoint lock assertions.
- Coverage matrix maps `B-API-011` and `ITX-035` to this task.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/api/definitions-list-conformance.spec.ts`
  - Expected: passes when definitions list payload/order conform to shared contracts.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/contract/type-conformance.spec.ts`
  - Expected: passes when Section 4 endpoint handler type-conformance includes list-definitions shared contracts.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/api/start-and-summary.spec.ts`
  - Expected: passes with explicit start status/error-envelope assertions for covered cases.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/e2e/behaviors/start.spec.ts`
  - Expected: passes when start status/error semantics match server spec Section 4.2.

## Spec/Behavior Links
- Server spec: Section 4.1, 4.2.
- API-types spec: Section 2.
- Web spec: Section 6.2, 6.3.1.
- Behaviors: `B-START-001`, `B-START-002`, `B-START-003`, `B-API-011`.
- Integration: `ITX-004`, `ITX-035`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-API-011 | `test/integration/api/definitions-list-conformance.spec.ts` | Definitions list endpoint returns shared contract payload with deterministic ordering and required fields. |
| B-START-001 | `test/integration/api/start-and-summary.spec.ts` | Start create-success path keeps explicit `201` + `StartWorkflowResponse` conformance assertions. |
| B-START-002 | `test/integration/api/start-and-summary.spec.ts` | Unknown workflow type path keeps explicit `404` + required `ErrorEnvelope` fields assertions. |
| ITX-035 | `test/integration/api/definitions-list-conformance.spec.ts` | Contract-shape + ordering conformance for list-definitions endpoint are enforced in integration scope. |
| B-START-003 | `test/e2e/behaviors/start.spec.ts` | Idempotent duplicate start returns `200` with same run identity and no duplicate execution checkpoint. |
