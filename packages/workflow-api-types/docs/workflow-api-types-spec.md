# Workflow API Types Spec (`workflow-api-types`)

> Canonical specification for `packages/workflow-api-types` — the shared HTTP/SSE API schemas and TypeScript types consumed by server and all clients.
>
> Cross-cutting architecture: [architecture.md](../../../docs/architecture.md)
> Server endpoints: [typescript-server-workflow-spec.md](../../workflow-server/docs/typescript-server-workflow-spec.md)
> Web client: [workflow-web-spec.md](../../../apps/workflow-web/docs/workflow-web-spec.md)

---

## 1) Package Purpose and Governance

`workflow-api-types` is the canonical source for transport-layer contracts used by server and clients (`workflow-cli`, `workflow-web`).

Baseline package requirements:
- `packages/workflow-api-types` must exist as a first-class workspace package before server endpoint implementation is considered complete.
- `workflow-server`, `workflow-web`, and `workflow-cli` must consume exported transport contracts from `@composable-workflow/workflow-api-types` for covered endpoints/events.
- Build/typecheck pipelines for those three consumers must fail on missing or drifted shared contract exports.

Minimum export set:
- `StartWorkflowRequest`, `StartWorkflowResponse`
- `ListRunsResponse`
- `RunSummaryResponse`
- `RunTreeResponse`, `RunTreeNode`
- `RunEventsResponse`, `WorkflowEventDto`, `EventCursor`
- `GetRunLogsQuery`, `RunLogsResponse`, `WorkflowLogEntryDto`
- `WorkflowDefinitionResponse` (graph metadata)
- `CancelRunResponse`
- `SubmitHumanFeedbackResponseRequest`, `SubmitHumanFeedbackResponseResponse`, `SubmitHumanFeedbackResponseConflict`
- `HumanFeedbackRequestStatusResponse`
- `ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse`, `RunFeedbackRequestSummary`
- `EventCursor` (opaque cursor string contract used by events pagination/stream resume surfaces)
- `WorkflowStreamEvent` / `WorkflowStreamFrame`
- `ErrorEnvelope`

Contract governance:
- Any server API contract change must land in `workflow-api-types` first.
- `workflow-server` route schemas must conform to `workflow-api-types` exports.
- `workflow-web` and `workflow-cli` must compile against `workflow-api-types` without local DTO duplication for covered endpoints.
- Breaking contract changes require semver-major version bump for `workflow-api-types`.
- The canonical transport contract identifiers for server endpoints are locked by this spec and must remain synchronized with `apps/workflow-web/docs/workflow-web-spec.md`.
- Web-visible endpoint paths and DTO/event mappings are additionally locked by Section 2 (must match web spec Section 6.2 exactly).

Implementation requirements:
- `workflow-server` must import endpoint request/response/query/event contracts from `@composable-workflow/workflow-api-types` in handler/service boundaries (no local redefinition of covered transport DTOs).
- `apps/workflow-web` and `apps/workflow-cli` must consume the same exported contracts for covered endpoints and stream frames.
- `apps/workflow-web` transport adapters (including SSE adapters) must deserialize and expose stream payloads as `WorkflowStreamFrame` from `@composable-workflow/workflow-api-types` rather than local mirror interfaces.
- Any change to endpoint path, payload shape, or event frame schema requires coordinated updates in:
  1) `packages/workflow-api-types`,
  2) `packages/workflow-server/docs/typescript-server-workflow-spec.md`,
  3) `apps/workflow-web/docs/workflow-web-spec.md`,
  before implementation is considered complete.

---

## 2) Web SPA Endpoint Contract Lock

The following web-visible endpoints are normative and must remain aligned with `apps/workflow-web/docs/workflow-web-spec.md` Section 6.2:

| Capability | Method + Path | Shared Contract(s) |
| --- | --- | --- |
| List runs | `GET /api/v1/workflows/runs?lifecycle=running&workflowType=...` | `ListRunsResponse` |
| Run summary | `GET /api/v1/workflows/runs/{runId}` | `RunSummaryResponse` |
| Run tree | `GET /api/v1/workflows/runs/{runId}/tree` | `RunTreeResponse` |
| Event history | `GET /api/v1/workflows/runs/{runId}/events` | `RunEventsResponse` |
| Logs | `GET /api/v1/workflows/runs/{runId}/logs` | `GetRunLogsQuery`, `RunLogsResponse` |
| Definition metadata | `GET /api/v1/workflows/definitions/{workflowType}` | `WorkflowDefinitionResponse` |
| Cancel run | `POST /api/v1/workflows/runs/{runId}/cancel` | `CancelRunResponse` |
| Live stream | `GET /api/v1/workflows/runs/{runId}/stream` (SSE) | `WorkflowStreamFrame` |
| Feedback requests by run | `GET /api/v1/workflows/runs/{runId}/feedback-requests` | `ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse` |
| Submit feedback response | `POST /api/v1/human-feedback/requests/{feedbackRunId}/respond` | `SubmitHumanFeedbackResponseRequest`, `SubmitHumanFeedbackResponseResponse` |
| Feedback request status | `GET /api/v1/human-feedback/requests/{feedbackRunId}` | `HumanFeedbackRequestStatusResponse` |

Run-scoping rule (normative):
- `GET /api/v1/workflows/runs/{runId}/feedback-requests` must return only feedback requests associated with the specified run lineage and must not degrade to global/unscoped listing behavior.

---

## 3) Shared Contract Consumption Enforcement

Normative enforcement requirements:
- Server route/handler/service boundaries for all server endpoints must reference transport request/query/response/event types from `@composable-workflow/workflow-api-types`.
- `workflow-server`, `workflow-web`, and `workflow-cli` must not declare local transport DTO interfaces/types for endpoints covered by Sections 2 and server spec Section 3.
- Any serializer/parser used for covered endpoint query fields must preserve shared contract field names and value semantics.
- Stream frame parsing and emission must remain aligned to `WorkflowStreamFrame` and `WorkflowStreamEvent` exports from `workflow-api-types`.
- SSE `data` payloads for `GET /api/v1/workflows/runs/{runId}/stream` must serialize to the `WorkflowStreamFrame` contract; client adapters must parse that payload shape directly.

Verification gate (required in CI and local validation before merge):
1. `packages/workflow-api-types` typecheck/build succeeds.
2. `workflow-server` typecheck/tests succeed with shared contract imports.
3. `apps/workflow-web` and `apps/workflow-cli` typecheck succeeds with shared contract imports.
4. Contract lock table in Section 2 and web spec endpoint matrix (`apps/workflow-web/docs/workflow-web-spec.md` Section 6.2) match exactly on method, path, and contract names.

---

## 4) Error Envelope Contract (Normative)

For covered API failures, shared transport errors use:

```ts
interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}
```

Rules:
- `400`/`404` failures for covered endpoints return `ErrorEnvelope`.
- `details` is endpoint-specific and must remain JSON-serializable.
- `requestId` is required for cross-system diagnostics and support correlation.
- Endpoint-specific conflict contracts may be used where explicitly defined (for example feedback submit `409`).

---

## 5) Data Contracts for Flowchart Rendering

To support UI, API must provide both static and dynamic graph inputs.

### 5.1 Static Graph Schema
`GET /api/v1/workflows/definitions/{workflowType}` (`WorkflowDefinitionResponse`) must provide a deterministic definition graph payload with:
- definition identity: `workflowType` + `workflowVersion|definitionVersion`,
- `initialState` that resolves to a declared state identifier,
- states with stable identifiers (unique within the definition), display labels/metadata, and optional role hints,
- transitions with `fromState`, `toState`, optional display label/metadata, and optional child-launch annotations,
- stable transition ordering for a given definition version.

Normative invariants:
- State identifiers are immutable for a published definition version.
- Transition identity is derived from `(fromState,toState,ordinalWithinPair)` where `ordinalWithinPair` uses server-provided transition order.
- Child-launch annotations must include enough metadata for UI to render launch affordances without additional definition fetches.
- Schema shape and field names are exported from `packages/workflow-api-types`; server/web/cli must consume those shared exports.

### 5.2 Dynamic Overlay Schema
For a run instance, overlay data is composed from shared transport contracts:
- `RunSummaryResponse.currentState` (initial active node),
- `RunEventsResponse` history (ordered traversal/failure context),
- `WorkflowStreamFrame` live updates.

Required alignment rules:
- Runtime state/transition references in events must resolve against the static definition identifiers from Section 5.1.
- Server-emitted event payloads for `state.entered`, `transition.completed`, and `transition.failed` must include identifiers sufficient for deterministic node/edge overlay updates.
- Unknown state/transition references are contract violations and must be surfaced by consumers (not silently ignored).
- Stream/event ordering guarantees (`sequence` + cursor resume semantics) must preserve deterministic overlay reconstruction after reconnect.

### 5.3 Cross-Spec Graph Contract Lock
- Section 5 invariants are locked to `apps/workflow-web/docs/workflow-web-spec.md` Sections 6.6 and 8.5.
- Endpoint contract lock in Section 2 guarantees path + DTO alignment; this section additionally locks graph identity semantics used by the web renderer.
- Any change to graph identity fields, transition ordering semantics, or overlay event-reference semantics requires coordinated updates in:
  1) `packages/workflow-api-types`,
  2) [server spec](../../workflow-server/docs/typescript-server-workflow-spec.md),
  3) web spec Sections 6.6 and 8.5.

---

## Related Specs

- [Architecture overview](../../../docs/architecture.md)
- [Workflow-lib spec](../../workflow-lib/docs/workflow-lib-spec.md) — runtime contracts and event types
- [Server spec](../../workflow-server/docs/typescript-server-workflow-spec.md) — endpoint implementation, persistence, lifecycle
- [CLI spec](../../../apps/workflow-cli/docs/workflow-cli-spec.md) — operator CLI consuming these contracts
- [Web spec](../../../apps/workflow-web/docs/workflow-web-spec.md) — SPA consuming these contracts
