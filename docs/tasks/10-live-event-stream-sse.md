# T10 - Live Event Stream (SSE)

## Depends On
- `T03`, `T05`

## Objective
Implement near-real-time run event streaming via SSE.

## Implementation Tasks
- [ ] Implement live stream endpoint (`SSE`) with ordered event delivery.
- [ ] Implement reconnect/no-loss semantics using cursor strategy.
- [ ] Add unit tests for stream cursor encode/decode and SSE frame serialization helpers.
- [ ] Add API contract docs and integration tests for stream ordering and reconnect behavior.

## Required Artifacts
- `packages/workflow-server/src/stream/*`
- `packages/workflow-server/test/integration/stream/*`

## Acceptance Criteria
- Stream endpoint delivers ordered events and predictable reconnection behavior.
- Unit tests cover cursor and frame helper behavior for deterministic edge-case handling.

## Spec/Behavior Links
- Spec: section 8.9.
- Behaviors: `B-API-006`.

## Fixed Implementation Decisions
- Live stream transport: Server-Sent Events (SSE).
- Reconnect cursor format: same opaque base64url cursor as events endpoint.
- Hot reload is intentionally out of scope.

## Interface/Schema Contracts
- SSE event frame payload:
	- `event: workflow-event`, `id: <cursor>`, `data: <WorkflowEvent JSON>`.
- Stream query params:
	- `cursor?: string`, `eventType?: string`.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/stream/sse-route.ts`
- `packages/workflow-server/src/stream/stream-cursor.ts`
- `packages/workflow-server/test/integration/stream/sse-ordering-reconnect.spec.ts`

### Modify
- `packages/workflow-server/src/api/routes/runs.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- stream`
	- Expected: ordered SSE delivery and reconnect no-loss semantics pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-API-006 | `sse-route.ts`, `sse-ordering-reconnect.spec.ts` | Near-real-time ordered stream with reconnect cursor semantics. |
