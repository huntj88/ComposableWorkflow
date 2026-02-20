# T03 - Dynamic Package Loader and Workflow Registry

## Depends On
- `T00`, `T01`, `T02`

## Objective
Implement runtime package discovery/loading, manifest validation, registry population, collision handling, and persisted metadata snapshots.

## Implementation Tasks
- [ ] Implement source resolvers for configured package references (`path|pnpm|bundle`).
- [ ] Validate manifest schema before registration.
- [ ] Register workflows by `workflowType` with single active version semantics.
- [ ] Add collision policy:
  - reject by default
  - explicit override mode for controlled environments
- [ ] Persist definition metadata snapshot to `workflow_definitions`.
- [ ] Add startup diagnostics logs for loaded/rejected packages.
- [ ] Integration tests for valid load, invalid schema, and collision handling.

## Required Artifacts
- `packages/workflow-server/src/loader/*`
- `packages/workflow-server/src/registry/*`
- `packages/workflow-server/test/integration/loader/*`

## Acceptance Criteria
- Server starts with valid packages and exposes registered workflow types.
- Invalid manifests are rejected with explicit errors and no partial registration.
- Collision behavior matches configuration and is observable via logs.

## Spec/Behavior Links
- Spec: sections 5.1, 7.1.
- Behaviors: `B-LOAD-001`, `B-LOAD-002`, `B-LOAD-003`, `B-LOAD-004`.

## Fixed Implementation Decisions
- Manifest validation library: `zod`.
- Default collision policy: `reject`.
- Override policy key: `WORKFLOW_TYPE_COLLISION_POLICY=override`.
- Package resolution precedence: `path` -> `pnpm` workspace -> `bundle`.

## Interface/Schema Contracts
- Loader config schema:
  - `{ source: "path"|"pnpm"|"bundle", value: string }[]`
- Registry contract:
  - `register(registration): void`
  - `getByType(workflowType): WorkflowRegistration | undefined`
  - `list(): WorkflowRegistration[]`
- Collision error envelope:
  - `{ code: "WORKFLOW_TYPE_COLLISION", workflowType, existingPackage, incomingPackage }`

## File Plan (Exact)
### Create
- `packages/workflow-server/src/loader/manifest-schema.ts`
- `packages/workflow-server/src/loader/source-resolvers.ts`
- `packages/workflow-server/src/loader/load-packages.ts`
- `packages/workflow-server/src/registry/workflow-registry.ts`
- `packages/workflow-server/src/registry/errors.ts`
- `packages/workflow-server/test/integration/loader/load-valid-package.spec.ts`
- `packages/workflow-server/test/integration/loader/reject-invalid-manifest.spec.ts`
- `packages/workflow-server/test/integration/loader/reject-collision.spec.ts`

### Modify
- `packages/workflow-server/src/config.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- loader`
  - Expected: valid package loads; malformed manifest rejected; duplicate type rejected unless override enabled.
- Command: `pnpm --filter workflow-server start:test`
  - Expected: startup logs include loaded/rejected package diagnostics.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-LOAD-001 | `load-valid-package.spec.ts` | Valid path package registers and is startable by type. |
| Behavior-B-LOAD-002 | `manifest-schema.ts`, `reject-invalid-manifest.spec.ts` | Invalid manifests fail validation with explicit error. |
| Behavior-B-LOAD-003 | `workflow-registry.ts`, `reject-collision.spec.ts` | Duplicate `workflowType` rejected by default. |
| Behavior-B-LOAD-004 | `workflow-registry.ts` | `workflowVersion` stored as metadata only. |
