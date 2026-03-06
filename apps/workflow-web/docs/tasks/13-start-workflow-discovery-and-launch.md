# WEB-13 - Start Workflow Discovery and Launch

## Depends On
- `WEB-01`
- `WEB-03`
- `WEB-07`

## Objective
Implement the `/runs` start-workflow experience: reachable entry action, definitions-backed workflow-type selection, JSON-gated request composition, shared-contract submission, scoped error handling with form-state preservation, and keyboard-complete interaction flow.

## Fixed Implementation Decisions
- The start workflow surface is launched from `/runs`; it does not require a separate route.
- Workflow type options are sourced from `GET /api/v1/workflows/definitions` rather than manual free-text as the primary path.
- Input validation is limited to syntactic JSON correctness; workflow-specific schema validation remains server/runtime-owned.

## Interface/Schema Contracts
- `ListDefinitionsResponse`, `DefinitionSummary`
- `StartWorkflowRequest`, `StartWorkflowResponse`
- `ErrorEnvelope`

## Implementation Tasks
- [x] Add definitions-list query support and start-workflow mutation support to the web transport-bound UI layer.
- [x] Render a start-workflow trigger on `/runs` and a start surface with workflow type, JSON input, optional `idempotencyKey`, and optional `metadata`.
- [x] Enforce syntactic JSON validity and required-field gating before submit.
- [x] Submit using shared DTO field names only and navigate to `#/runs/:runId` on both `201` and idempotent `200` success responses.
- [x] Render `404` (`WORKFLOW_TYPE_NOT_FOUND`), `400`, and transport failures inside the start surface while preserving user-entered values.
- [x] Preserve keyboard-only completion and visible focus semantics throughout open, field entry, error handling, and submit.

## Required Artifacts
- `apps/workflow-web/src/routes/runs/RunsPage.tsx`
- `apps/workflow-web/src/routes/runs/components/StartWorkflowDialog.tsx`
- `apps/workflow-web/src/routes/runs/hooks/useDefinitionsCatalog.ts`
- `apps/workflow-web/src/routes/runs/hooks/useStartWorkflow.ts`
- `apps/workflow-web/src/transport/workflowApiClient.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/runs/components/StartWorkflowDialog.tsx`
- `apps/workflow-web/src/routes/runs/hooks/useDefinitionsCatalog.ts`
- `apps/workflow-web/src/routes/runs/hooks/useStartWorkflow.ts`

### Modify
- `apps/workflow-web/src/routes/runs/RunsPage.tsx`
- `apps/workflow-web/src/transport/workflowApiClient.ts`
- `apps/workflow-web/src/transport/index.ts`

## Acceptance Criteria
- `/runs` exposes a start-workflow action without requiring prior workflow-type knowledge.
- Workflow-type choices are populated from `ListDefinitionsResponse`.
- Submit stays disabled until a workflow type is selected and the input editor contains syntactically valid JSON.
- Request/response handling uses `StartWorkflowRequest` / `StartWorkflowResponse` without local DTO duplication.
- Successful `201` and idempotent `200` both navigate to `#/runs/:runId`.
- `404`, `400`, and transport failures are scoped to the start surface and preserve all form fields.
- Keyboard-only users can open, complete, and submit the flow with visible focus indicators.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/start/itx.web.start.ITX-WEB-044.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/start/itx.web.start.ITX-WEB-045.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-057 | `apps/workflow-web/src/routes/runs/components/StartWorkflowDialog.tsx` | Start action, definitions-backed selection, and shared list-definition contract usage are implemented on `/runs`. |
| B-WEB-058 | `apps/workflow-web/src/routes/runs/hooks/useStartWorkflow.ts` | Validation gating, shared-contract submit, and success navigation semantics are enforced. |
| B-WEB-059 | `apps/workflow-web/src/routes/runs/components/StartWorkflowDialog.tsx` | `404`/`400`/transport failure handling is scoped and preserves form state. |
| B-WEB-060 | `apps/workflow-web/src/routes/runs/RunsPage.tsx` | Keyboard-only users can complete the start-workflow flow with visible focus indicators. |
