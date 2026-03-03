# TSD00 - Spec-Doc Foundation Contracts and Schema Gates

## Depends On
- none

## Objective
Establish all shared contracts and schema-validation guardrails required by `app-builder.spec-doc.v1` before FSM behavior implementation begins.

## Implementation Tasks
- [x] Define shared TypeScript contracts for workflow input/output, normalized answers, queue items, and integration input.
- [x] Wire canonical schema loading/lookup for all required spec-doc schemas.
- [x] Implement reusable JSON parse + schema validation utilities with deterministic error payloads.
- [x] Add schema/contract unit tests for valid and invalid fixtures.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/schemas.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/schema-validation.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/contracts.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/schema-validation.test.ts`

## Acceptance Criteria
- All required schemas from spec section 7.1 are loadable via one central map.
- Non-JSON and schema-invalid outputs produce deterministic validation errors with schema identifiers.
- Shared contracts are consumed by downstream state handlers (no state-local redefinitions).

## Spec/Behavior Links
- Spec: sections 5.1, 5.2, 6.5, 7.1.
- Behaviors: `B-SD-SCHEMA-001`, `B-SD-SCHEMA-002`, `B-SD-SCHEMA-003`, `B-SD-SCHEMA-004`, `B-SD-SCHEMA-005`.

## Fixed Implementation Decisions
- Schema validation failures are terminal and include schema ID + validator diagnostics.
- Contract types live in a shared module under `spec-doc` and are imported by all states.
- State handlers branch only from validated `structuredOutput` payloads.

## Interface/Schema Contracts
- `SpecDocGenerationInput` and `SpecDocGenerationOutput` are first-class exported types.
- `IntegrateIntoSpecInput` matches spec section 6.5 exactly.
- Validator result shape:
  - success: `{ ok: true, value }`
  - failure: `{ ok: false, error: { kind, schemaId, details } }`.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/contracts.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/schemas.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/schema-validation.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/contracts.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/schema-validation.test.ts`

### Modify
- `packages/workflow-app-builder/src/index.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- schema-validation`
  - Expected: non-JSON and schema-invalid cases fail with deterministic diagnostics.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- contracts`
  - Expected: shared contracts serialize/validate against required schema fixtures.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-Contract-001-WorkflowIOTypes | `src/workflows/spec-doc/contracts.ts` | workflow input/output types match spec sections 5.1 and 5.2. |
| SD-Contract-002-IntegrateInputShape | `src/workflows/spec-doc/contracts.ts` | `IntegrateIntoSpecInput` includes required source/answers/specPath semantics. |
| SD-Schema-001-Registry | `src/workflows/spec-doc/schemas.ts` | all section 7.1 schema IDs resolve via central registry. |
| SD-Schema-002-ParseFailureTerminal | `src/workflows/spec-doc/schema-validation.ts` | non-JSON returns parse-failure payload with stage context. |
| SD-Schema-003-ValidationFailureTerminal | `src/workflows/spec-doc/schema-validation.ts` | schema mismatch returns validation errors with expected schema identifier. |
