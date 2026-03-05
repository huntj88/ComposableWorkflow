# TWEB00 - Foundation, Stack, and Contract Baseline

## Depends On
- none

## Objective
Establish the Workflow Web SPA foundation in `apps/workflow-web` with the required stack, strict TypeScript posture, shared contract package wiring, and baseline project conventions needed by all subsequent tasks.

## Fixed Implementation Decisions
- Use Vite + React + TypeScript strict mode as the only app foundation.
- Keep implementation scope in `apps/workflow-web` (plus required shared/spec references only).
- Treat `@composable-workflow/workflow-api-types` as the authoritative source for covered transport DTOs.

## Interface/Schema Contracts
- Contract package: `@composable-workflow/workflow-api-types`.
- Required stack libraries: `react-router-dom`, `@tanstack/react-query`, `zustand`, `@mui/material`, `reactflow`, `recharts`.

## Implementation Tasks
- [x] Confirm package dependencies and strict TS config satisfy baseline spec constraints.
- [x] Establish app-shell providers and shared app bootstrap boundaries.
- [x] Add shared typing utilities and lint/type gates for transport contract usage.

## Required Artifacts
- `apps/workflow-web/package.json`
- `apps/workflow-web/tsconfig.json`
- `apps/workflow-web/src/main.tsx`
- `apps/workflow-web/src/app/providers.tsx`

## File Plan (Exact)
### Modify
- `apps/workflow-web/package.json`
- `apps/workflow-web/tsconfig.json`
- `apps/workflow-web/src/main.tsx`
- `apps/workflow-web/src/app/providers.tsx`

## Acceptance Criteria
- App builds as Vite React SPA with TS strict mode enabled.
- Required libraries are declared and used by app runtime composition.
- Shared API type package is resolvable by web package builds/tests.

## Verification
- `pnpm --filter @composable-workflow/workflow-web run typecheck`
- `pnpm --filter @composable-workflow/workflow-web run build`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-001 | `apps/workflow-web/package.json` | Required stack and strict TypeScript SPA foundation are present. |
