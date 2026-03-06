# WEB-11 - Integration Suite: Stream, Transport, and Contract Conformance

## Depends On
- `WEB-09`
- `WEB-03`
- `WEB-04`

## Objective
Implement deterministic integration coverage for stream ordering/reconnect semantics, transport contract conformance, and spec-lock contract drift gates.

## Fixed Implementation Decisions
- Contract conformance includes runtime + static lock tests.
- Stream tests explicitly exercise duplicate/out-of-order overlap windows.

## Interface/Schema Contracts
- Shared transport/event contracts from `@composable-workflow/workflow-api-types`.
- Stream and transport semantics from web spec Sections 5, 6.5-6.10, and 9.3.

## Implementation Tasks
- [x] Add stream integration tests for ordered patching, reconnect/dedup, unsupported variants, backoff constants, wire framing, and non-regression.
- [x] Add transport conformance tests for DTO imports, signatures, endpoint/query serialization, and shared error mapping.
- [x] Add spec-lock drift tests for server/web endpoint matrix and DTO authority constraints.
- [x] Add integration tests for event/log defaults-max ordering semantics and event free-text matching domain behavior.
- [x] Add spec-lock tests for shared API-types required export set and contract evolution-order enforcement.

## Required Artifacts
- `apps/workflow-web/test/integration/stream/*.spec.ts`
- `apps/workflow-web/test/integration/transport/*.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/*.spec.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-005.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-006.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-008.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-009.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-010.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-027.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-036.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-037.spec.ts`
- `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-038.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-039.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-040.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-041.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-043.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.unsupported-eventType-filter.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.defaults-and-ordering.spec.ts`
- `apps/workflow-web/test/integration/transport/itx.web.transport.event-text-filter-semantics.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.api-types-exports.spec.ts`
- `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.contract-evolution-order.spec.ts`

## Acceptance Criteria
- Every assigned ITX case has a deterministic integration test file.
- Transport/stream invariants fail clearly on contract drift/regression.
- Contract lock tests gate server-web shared endpoint/DTO parity.
- Defaults/max bounds and ordering semantics for events/logs are asserted in transport integration scope.
- Shared export-set and evolution-order lock tests fail on contract-process drift.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.ITX-WEB-006.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| ITX-WEB-005 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-005.spec.ts` | SSE ordered incremental patching behavior is deterministic. |
| ITX-WEB-006 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-006.spec.ts` | Reconnect cursor resume, dedup, and strict resume boundary are enforced. |
| ITX-WEB-008 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-008.spec.ts` | Unsupported stream variants fail visibly in dev/test. |
| ITX-WEB-009 | `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-009.spec.ts` | Shared DTO import/signature conformance is enforced. |
| ITX-WEB-010 | `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-010.spec.ts` | Absolute endpoint path and query key serialization contract is enforced. |
| ITX-WEB-023 | `apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts` | Web/server endpoint matrix drift is a hard failure. |
| ITX-WEB-027 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-027.spec.ts` | Exponential reconnect backoff behavior is deterministic. |
| ITX-WEB-036 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-036.spec.ts` | SSE wire-frame contract handling is enforced. |
| ITX-WEB-037 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-037.spec.ts` | Duplicate/out-of-order non-regression behavior is enforced. |
| ITX-WEB-038 | `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-038.spec.ts` | Run-feedback pagination/default ordering contract is enforced. |
| ITX-WEB-039 | `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-039.spec.ts` | Event/log query semantics and key preservation are enforced. |
| ITX-WEB-040 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-040.spec.ts` | Reconnect constants and stale threshold timing contract is enforced. |
| ITX-WEB-041 | `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-041.spec.ts` | Shared error-envelope and feedback-conflict rendering is enforced. |
| ITX-WEB-043 | `apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-043.spec.ts` | Field-level shared DTO authority conformance is enforced. |
