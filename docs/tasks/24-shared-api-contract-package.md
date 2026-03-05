# T24 - Shared API Contract Package (`workflow-api-types`)

## Depends On
- `T05`
- `T10`
- `T22`
- `T23`

## Objective
Create `packages/workflow-api-types` as the canonical shared transport contract package consumed by `workflow-server`, `workflow-cli`, and `workflow-web`. Extract all Section 8 endpoint request/response/query/event types into this package and wire all three consumers to import from `@composable-workflow/workflow-api-types`, eliminating local DTO redefinitions for covered endpoints.

## Fixed Implementation Decisions
- Package is TypeScript-only, zero runtime dependencies, exports only types and zod schemas.
- Minimum export set matches spec Section 6.9 exactly: `StartWorkflowRequest`, `StartWorkflowResponse`, `ListRunsResponse`, `RunSummaryResponse`, `RunTreeResponse`, `RunTreeNode`, `RunEventsResponse`, `WorkflowEventDto`, `EventCursor`, `GetRunLogsQuery`, `RunLogsResponse`, `WorkflowLogEntryDto`, `WorkflowDefinitionResponse`, `CancelRunResponse`, `SubmitHumanFeedbackResponseRequest`, `SubmitHumanFeedbackResponseResponse`, `HumanFeedbackRequestStatusResponse`, `ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse`, `RunFeedbackRequestSummary`, `WorkflowStreamEvent`, `WorkflowStreamFrame`.
- Breaking changes to any exported contract require semver-major version bump.
- Coordinated updates to endpoint path, payload shape, or event frame schema must land in: (1) `packages/workflow-api-types`, (2) `docs/typescript-server-workflow-spec.md`, (3) `apps/workflow-web/docs/workflow-web-spec.md`.
- `zod` schemas already defined in `workflow-server` for matching contracts are moved (not duplicated) to `workflow-api-types` and re-exported from server as needed.

## Interface/Schema Contracts
- All exported types/schemas must match the endpoint contracts documented in spec Sections 6.9, 6.9.1, and 8.
- SSE stream frame types (`WorkflowStreamFrame`, `WorkflowStreamEvent`) must be the single source of truth for both server emission and client parsing.
- `EventCursor` is an opaque string type used by events pagination and stream resume surfaces.

## Implementation Tasks
- [ ] Create `packages/workflow-api-types` workspace package with `package.json`, `tsconfig.json`, and `src/index.ts`.
- [ ] Define and export all minimum-set transport types/schemas from spec Section 6.9.
- [ ] Move applicable zod schemas from `workflow-server` API schemas into `workflow-api-types` (re-export from server to avoid breakage).
- [ ] Wire `packages/workflow-server` to import transport contracts from `@composable-workflow/workflow-api-types` in route handler/service boundaries.
- [ ] Wire `apps/workflow-cli` to import transport contracts from `@composable-workflow/workflow-api-types` for covered endpoints.
- [ ] Wire `apps/workflow-web` to declare dependency on `@composable-workflow/workflow-api-types` (stub consumer if web app is not yet implemented).
- [ ] Remove all local transport DTO redefinitions in consumers for covered endpoints.
- [ ] Verify build/typecheck pipelines for all three consumers fail on missing or drifted shared contract exports.
- [ ] Add `workflow-api-types` to `pnpm-workspace.yaml` packages list.

## Required Artifacts
- `packages/workflow-api-types/package.json`
- `packages/workflow-api-types/tsconfig.json`
- `packages/workflow-api-types/src/index.ts`
- `packages/workflow-api-types/src/endpoints/` (per-endpoint type modules)
- `packages/workflow-api-types/src/stream.ts` (SSE frame types)

## File Plan (Exact)
### Create
- `packages/workflow-api-types/package.json`
- `packages/workflow-api-types/tsconfig.json`
- `packages/workflow-api-types/src/index.ts`
- `packages/workflow-api-types/src/endpoints/start.ts`
- `packages/workflow-api-types/src/endpoints/runs.ts`
- `packages/workflow-api-types/src/endpoints/events.ts`
- `packages/workflow-api-types/src/endpoints/logs.ts`
- `packages/workflow-api-types/src/endpoints/tree.ts`
- `packages/workflow-api-types/src/endpoints/definitions.ts`
- `packages/workflow-api-types/src/endpoints/lifecycle.ts`
- `packages/workflow-api-types/src/endpoints/human-feedback.ts`
- `packages/workflow-api-types/src/stream.ts`

### Modify
- `pnpm-workspace.yaml`
- `packages/workflow-server/package.json` (add `@composable-workflow/workflow-api-types` dependency)
- `packages/workflow-server/src/api/schemas/*.ts` (replace local schemas with re-exports from `workflow-api-types`)
- `packages/workflow-server/src/api/routes/*.ts` (import transport types from `workflow-api-types`)
- `apps/workflow-cli/package.json` (add `@composable-workflow/workflow-api-types` dependency)
- `apps/workflow-cli/src/http/client.ts` (import shared types)
- `apps/workflow-web/package.json` (add `@composable-workflow/workflow-api-types` dependency)

## Acceptance Criteria
- `packages/workflow-api-types` builds and exports all minimum-set types from spec Section 6.9.
- `workflow-server` route handler/service boundaries reference types from `@composable-workflow/workflow-api-types`.
- `workflow-cli` compiles against shared contracts without local transport DTO declarations for covered endpoints.
- `workflow-web` declares dependency and compiles (or stubs compile) against shared contracts.
- No local transport DTO redefinitions exist in consumers for endpoints covered by Sections 6.9.1 and 8.
- Build/typecheck pipelines fail on missing or drifted shared contract exports.
- SSE stream frame emission and parsing align to `WorkflowStreamFrame` / `WorkflowStreamEvent` exports.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-api-types build`
  - Expected: clean build with all exported types.
- Command: `pnpm --filter @composable-workflow/workflow-server build`
  - Expected: server compiles with shared contract imports, no local DTO redefinitions.
- Command: `pnpm --filter @composable-workflow/workflow-cli build`
  - Expected: CLI compiles with shared contract imports.
- Command: `pnpm build`
  - Expected: all workspace packages build successfully.
- Command: `pnpm typecheck`
  - Expected: no type errors across workspace.

## Spec/Behavior Links
- Spec: sections 5, 6.9, 6.9.1, 6.9.2, 8.
- Behaviors: `B-CONTRACT-001`, `B-CONTRACT-002`, `B-CONTRACT-003`, `B-CONTRACT-005`, `B-CONTRACT-006`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-CONTRACT-001 | `packages/workflow-api-types/src/index.ts` + `packages/workflow-server/src/api/routes/*.ts` | Server handler/service boundaries import types from `@composable-workflow/workflow-api-types`; no local DTO redefinitions for covered endpoints. |
| B-CONTRACT-002 | `apps/workflow-cli/src/http/client.ts` + `apps/workflow-web/package.json` | CLI and web consume shared contracts; typecheck fails on missing exports. |
| B-CONTRACT-003 | `packages/workflow-api-types/src/stream.ts` | SSE stream frames use `WorkflowStreamFrame` contract from shared package; no local mirror interfaces. |
| B-CONTRACT-005 | `packages/workflow-api-types/package.json` | Incompatible transport contract changes require semver-major version bump. |
| B-CONTRACT-006 | Coordinated update policy | Changes to endpoint path/payload/event frame land in `workflow-api-types`, spec doc, and web spec doc. |
