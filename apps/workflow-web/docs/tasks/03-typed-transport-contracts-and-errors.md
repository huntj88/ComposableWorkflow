# TWEB03 - Typed Transport Contracts, Endpoint Semantics, and Error Contracts

## Depends On
- `TWEB00`

## Objective
Implement the web transport layer with strict shared DTO authority, absolute `/api/v1` endpoint correctness, query-key/serialization conformance, and panel-scoped error handling aligned to shared error contracts.

## Fixed Implementation Decisions
- Covered transport signatures use shared API types directly.
- URL construction is absolute and `/api/v1`-prefixed.
- Covered `400/404` failures parse/render `ErrorEnvelope`; feedback `409` uses `SubmitHumanFeedbackResponseConflict`.

## Interface/Schema Contracts
- `@composable-workflow/workflow-api-types` exports in web spec Section 6.1/6.5/6.10.
- Endpoint matrix in web spec Section 6.2.
- Error contracts in web spec Section 6.8.

## Implementation Tasks
- [ ] Implement typed transport operations for every Section 6.2 endpoint, including run summary/tree/events/logs/definition/cancel/feedback/submit/status.
- [ ] Enforce logs/events/feedback query key, default limit, max limit, and ordering semantics from spec Section 6.7.
- [ ] Enforce logs bounds semantics (`since` inclusive, `until` exclusive) and AND-combination behavior for provided filters.
- [ ] Enforce events query defaults/max limits and append-order expectations by `sequence ASC`.
- [ ] Remove/avoid local duplicate DTO definitions for covered surfaces.
- [ ] Add transport/spec lock checks for endpoint and shared contract drift.
- [ ] Add shared-contract export lock test ensuring web-consumed Section 6.1 symbols exist in `workflow-api-types`.
- [ ] Add cross-spec contract evolution-order guard (`workflow-api-types` -> server -> web docs/usages).
- [ ] Implement panel-scoped error parsing/rendering with request IDs.

## Required Artifacts
- `apps/workflow-web/src/transport/workflowApiClient.ts`
- `apps/workflow-web/src/transport/errors.ts`
- `apps/workflow-web/test/integration/spec-lock/*.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.api-types-exports.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.contract-evolution-order.spec.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/transport/workflowApiClient.ts`
- `apps/workflow-web/src/transport/errors.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.api-types-exports.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.contract-evolution-order.spec.ts`

### Modify
- `apps/workflow-web/src/transport/index.ts`

## Acceptance Criteria
- Covered request/query/response/event types come from shared package exports.
- Transport signatures avoid `any`/`unknown` where shared types exist.
- Endpoint and query serialization rules match spec exactly.
- Logs/events/feedback default/max limit and ordering rules match Section 6.7 exactly.
- Shared package export lock fails when required Section 6.1 contract symbols are missing.
- Contract evolution order violations fail spec-lock checks.
- Error envelope/conflict payload handling is panel-scoped and contract-conformant.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/transport/itx.web.transport.ITX-WEB-009.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/transport/itx.web.transport.ITX-WEB-010.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/spec-lock/itx.web.spec-lock.api-types-exports.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/spec-lock/itx.web.spec-lock.contract-evolution-order.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-009 | `apps/workflow-web/src/transport/workflowApiClient.ts` | Covered DTOs are sourced from shared package with no local duplicates. |
| B-WEB-010 | `apps/workflow-web/src/transport/workflowApiClient.ts` | All covered endpoints use absolute `/api/v1` paths. |
| B-WEB-011 | `apps/workflow-web/src/transport/workflowApiClient.ts` | Exported signatures remain strictly typed against shared contracts. |
| B-WEB-012 | `apps/workflow-web/src/transport/workflowApiClient.ts` | Logs query serialization preserves exact key names and semantics. |
| B-WEB-013 | `apps/workflow-web/src/transport/workflowApiClient.ts` | Dashboard feedback discovery uses run-scoped endpoint only. |
| B-WEB-014 | `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts` | Web/server endpoint matrix drift fails CI. |
| B-WEB-054 | `apps/workflow-web/src/transport/errors.ts` | Shared error-envelope/conflict contracts are parsed/rendered consistently. |
| B-WEB-056 | `apps/workflow-web/src/transport/workflowApiClient.ts` | Field-level DTO semantics derive from shared exports with no ad-hoc remapping. |
