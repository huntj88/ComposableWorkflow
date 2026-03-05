# TWEB01 - Routing Shell and `/runs` List Experience

## Depends On
- `TWEB00`

## Objective
Implement canonical `HashRouter` routes and route-level shells for `/runs`, `/runs/:runId`, and `/definitions/:workflowType`, including run listing/filtering, run-selection navigation semantics, and definitions metadata route rendering with history fidelity.

## Fixed Implementation Decisions
- Router implementation uses `HashRouter` only.
- Canonical routes are `#/runs`, `#/runs/:runId`, `#/definitions/:workflowType`.
- Run-row and execution-tree navigation both target `#/runs/:runId`.

## Interface/Schema Contracts
- `ListRunsResponse` from `@composable-workflow/workflow-api-types`.
- Route parameter contracts for `runId` and `workflowType`.

## Implementation Tasks
- [x] Define route tree and app shell with canonical hash routes.
- [x] Implement `/runs` table/list with lifecycle/workflowType filters.
- [x] Wire row activation (mouse + keyboard) to run route navigation.
- [x] Implement `/definitions/:workflowType` route with definition metadata + graph container shell.
- [x] Ensure deep-link entry to definitions route resolves without prior run-route state.
- [x] Preserve deep-link and back/forward contexts for run navigation.

## Required Artifacts
- `apps/workflow-web/src/app/router.tsx`
- `apps/workflow-web/src/routes/runs/RunsPage.tsx`
- `apps/workflow-web/src/routes/runs/useRunsFilters.ts`
- `apps/workflow-web/src/routes/definitions/DefinitionsPage.tsx`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/runs/RunsPage.tsx`
- `apps/workflow-web/src/routes/runs/useRunsFilters.ts`
- `apps/workflow-web/src/routes/definitions/DefinitionsPage.tsx`

### Modify
- `apps/workflow-web/src/app/router.tsx`

## Acceptance Criteria
- Route handling uses `HashRouter` canonical forms.
- `/runs` renders server-backed data with lifecycle and workflowType filters.
- `/definitions/:workflowType` renders definition metadata view and route-stable graph shell.
- Row activation navigates to `#/runs/:runId` and history back/forward is preserved.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.routes.ITX-WEB-002.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.routes.definitions-view.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-002 | `apps/workflow-web/src/app/router.tsx` | App uses `HashRouter` and canonical route forms. |
| B-WEB-003 | `apps/workflow-web/src/app/router.tsx` | Run selection navigation + back/forward context semantics are preserved. |
| B-WEB-004 | `apps/workflow-web/src/routes/runs/RunsPage.tsx` | `/runs` supports required filters and run-row navigation. |
