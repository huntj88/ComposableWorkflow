# T05 - API Surface: Start, Query, Tree, Events, Logs, Definitions

## Depends On
- `T04`

## Objective
Implement REST API endpoints and response contracts required for run control, runtime introspection, and graph metadata.

## Implementation Tasks
- [ ] Implement endpoints:
  - `POST /api/v1/workflows/start`
  - `GET /api/v1/workflows/runs/{runId}`
  - `GET /api/v1/workflows/runs/{runId}/tree`
  - `GET /api/v1/workflows/runs/{runId}/events`
  - `GET /api/v1/workflows/runs/{runId}/logs`
  - `GET /api/v1/workflows/runs`
  - `GET /api/v1/workflows/definitions/{workflowType}`
- [ ] Validate request/response schemas and consistent error envelopes.
- [ ] Implement cursor pagination contract for events endpoint.
- [ ] Implement filtering (`eventType`, `since`, `until`, lifecycle/workflowType list filters).
- [ ] Build run tree projection with depth and include-completed flags.
- [ ] Define dynamic overlay read model contract (active node, traversed/pending/failed edges, child linkage, timestamp/log references) derivable from run + events APIs for UI consumers.
- [ ] Add unit tests for schema validation, cursor encode/decode helpers, and read-model projection utilities.
- [ ] Integration tests for payload semantics and pagination stability.

## Required Artifacts
- `packages/workflow-server/src/api/*`
- `packages/workflow-server/src/read-models/*`
- `packages/workflow-server/test/integration/api/*`

## Acceptance Criteria
- Endpoint contracts match spec payload shape and semantics.
- Event pagination remains stable under concurrent append conditions.
- Run summary/tree/definition outputs are sufficient for future UI graph rendering.
- Unit tests cover API schema and projection helper logic that does not require live service wiring.

## Spec/Behavior Links
- Spec: section 8, section 10.
- Behaviors: `B-API-001..006`, `B-START-001`, `B-START-002`, `B-START-004`, `B-CHILD-003`, `B-API-005`.
- Integration: `ITX-015`, `ITX-016`.

## Fixed Implementation Decisions
- HTTP framework: `fastify`.
- API validation: `zod` schemas with generated OpenAPI from route definitions.
- Cursor format: opaque base64url encoding of `{runId, sequence}`.
- Error envelope standard:
  - `{ code: string, message: string, details?: object, requestId: string }`.

## Interface/Schema Contracts
- Start request schema:
  - `{ workflowType: string, input: unknown, idempotencyKey?: string, metadata?: Record<string, unknown> }`.
- Run summary schema:
  - `{ runId, workflowType, workflowVersion, lifecycle, currentState, currentTransitionContext?, parentRunId?, childrenSummary, startedAt, endedAt?, counters }`.
- Events response schema:
  - `{ items: WorkflowEvent[], nextCursor?: string }` ordered ascending by `sequence`.
- Definitions schema:
  - `{ workflowType, workflowVersion, states, transitions, childLaunchAnnotations, metadata }`.
- Dynamic overlay schema (derived/read model):
  - `{ runId, activeNode, traversedEdges, pendingEdges, failedEdges, childGraphLinks, transitionTimeline }`.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/api/server.ts`
- `packages/workflow-server/src/api/routes/workflows.ts`
- `packages/workflow-server/src/api/routes/runs.ts`
- `packages/workflow-server/src/api/routes/events.ts`
- `packages/workflow-server/src/api/routes/definitions.ts`
- `packages/workflow-server/src/api/schemas.ts`
- `packages/workflow-server/src/read-models/run-tree-projection.ts`
- `packages/workflow-server/src/read-models/event-pagination.ts`
- `packages/workflow-server/test/integration/api/start-and-summary.spec.ts`
- `packages/workflow-server/test/integration/api/events-pagination.spec.ts`

### Modify
- `packages/workflow-server/src/bootstrap.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- api`
  - Expected: route contracts, validation failures, and pagination behavior pass.
- Command: `pnpm --filter workflow-server test -- ITX-015|ITX-016`
  - Expected: metadata normalization and cursor stability verified.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-API-001 | `start-and-summary.spec.ts` | Run summary reflects latest authoritative state. |
| Behavior-B-API-002 | `events-pagination.spec.ts` | Filtering + cursor pagination stable and ordered. |
| Behavior-B-API-005 | `routes/definitions.ts` | Static graph metadata is complete and normalized. |
| Integration-ITX-016 | `event-pagination.ts` | No duplicate/omitted events under concurrent inserts. |
