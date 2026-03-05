# T30 - Graph Contract Lock and Overlay Conformance

## Depends On
- `T24`
- `T27`

## Objective
Implement CI-verifiable graph contract alignment and runtime overlay conformance for the new Section 10 requirements in `docs/typescript-server-workflow-spec.md`, including cross-spec lock checks against `apps/workflow-web/docs/workflow-web-spec.md`, shared-contract lock checks against `packages/workflow-api-types`, and deterministic runtime reference validation for graph overlays.

## Fixed Implementation Decisions
- Graph contract drift validation is implemented as static integration tests that compare server spec Section 10 and web spec Sections 6.6 and 8.5.
- Runtime overlay conformance is validated by integration tests that assert event/stream references resolve to static definition identifiers.
- Runtime overlay conformance includes `RunSummaryResponse.currentState` and event/stream references resolving to static definition identifiers from the same definition payload.
- Unknown state/transition references are treated as explicit contract violations and must fail tests (never silently ignored).
- Transition ordering identity semantics are validated using deterministic definitions per `workflowType` + definition version.
- Cross-spec graph lock is enforced as a three-way contract alignment gate across server spec Section 10, web spec Sections 6.6/8.5, and `@composable-workflow/workflow-api-types` graph contract surfaces.
- Coverage ownership for `B-API-010`, `B-CONTRACT-007`, and `ITX-033` is assigned to this task.

## Interface/Schema Contracts
- Server spec graph contract source: `docs/typescript-server-workflow-spec.md` Section 10.
- Web spec graph contract source: `apps/workflow-web/docs/workflow-web-spec.md` Sections 6.6 and 8.5.
- Static graph contract surface: `WorkflowDefinitionResponse` from `@composable-workflow/workflow-api-types`.
- Dynamic overlay contract surfaces: `RunEventsResponse` and `WorkflowStreamFrame` from `@composable-workflow/workflow-api-types`.
- Contract assertions:
  - `initialState` resolves to a declared state identifier and state identifiers are unique/stable within a definition version,
  - state identifiers are stable/immutable within a definition version,
  - transition identity derivation uses `(fromState,toState,ordinalWithinPair)`,
  - `RunSummaryResponse.currentState` and runtime event references are resolvable against static definition metadata from the same definition payload,
  - runtime event references are resolvable against static definition metadata,
  - `sequence` + cursor resume semantics preserve deterministic reconstruction.

## Implementation Tasks
- [x] Add graph contract lock drift test for server spec Section 10 vs web spec Sections 6.6 and 8.5.
- [x] Extend graph contract lock drift test to assert three-way alignment across server spec Section 10, web spec Sections 6.6/8.5, and graph contract identifiers exported by `@composable-workflow/workflow-api-types`.
- [x] Add static graph validity assertions for `initialState` resolvability and state identifier uniqueness/stability expectations in lock coverage.
- [x] Add overlay reference conformance test asserting `state.entered`, `transition.completed`, and `transition.failed` references resolve to static definition IDs.
- [x] Add overlay reference conformance assertion that `RunSummaryResponse.currentState` resolves to a definition state identifier from the same definition payload.
- [x] Add negative test coverage for unknown state/transition references and assert explicit contract violation handling.
- [x] Verify deterministic reconstruction behavior across paged events and stream resume cursors.
- [x] Update coverage ledger ownership to map new requirement IDs to this task.

## Required Artifacts
- `packages/workflow-server/test/integration/contract/graph-contract-lock-drift.spec.ts`
- `packages/workflow-server/test/integration/api/graph-overlay-reference-conformance.spec.ts`

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/contract/graph-contract-lock-drift.spec.ts`
- `packages/workflow-server/test/integration/api/graph-overlay-reference-conformance.spec.ts`

### Modify
- `docs/testing/coverage-matrix.md`
- `docs/behaviors.md` (only if assertion language needs strictness alignment for `B-API-010` / `B-CONTRACT-007`)
- `docs/integration-tests.md` (only if ITX catalog wording requires alignment with final implementation scope)

## Acceptance Criteria
- A drift test fails when server spec Section 10 and web spec Sections 6.6/8.5 diverge on graph identity/overlay contract semantics.
- A drift test fails when graph identity/overlay semantics drift across any of the three lock artifacts: server spec Section 10, web spec Sections 6.6/8.5, or `@composable-workflow/workflow-api-types` graph contract surfaces.
- Static graph lock assertions fail when `initialState` does not resolve to a declared state identifier or state identifiers are not unique/stable for a definition version.
- Integration tests validate runtime overlay references always resolve to static definition identifiers.
- Integration tests validate `RunSummaryResponse.currentState` and runtime overlay references resolve to static definition identifiers from the same definition payload.
- Unknown runtime state/transition references are surfaced as contract violations and fail deterministic tests.
- Cursor/sequence replay assertions prove deterministic overlay reconstruction across reconnect/resume boundaries.
- Coverage matrix rows for `B-API-010`, `B-CONTRACT-007`, and `ITX-033` reference this task as owner.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/contract/graph-contract-lock-drift.spec.ts`
  - Expected: passes when Section 10, web graph-spec sections, and shared graph contract exports are aligned; fails on drift.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/api/graph-overlay-reference-conformance.spec.ts`
  - Expected: passes when runtime event/stream references resolve to static definition graph identifiers and replay semantics are deterministic.

## Spec/Behavior Links
- Spec: sections 10.1, 10.2, 10.3, 14, 16 (criterion 21).
- Behaviors: `B-API-010`, `B-CONTRACT-007`.
- Integration: `ITX-033`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-API-010 | `test/integration/api/graph-overlay-reference-conformance.spec.ts` | Runtime overlay references in events/stream resolve to static graph identifiers; deterministic reconstruction preserved via sequence/cursor semantics. |
| B-CONTRACT-007 | `test/integration/contract/graph-contract-lock-drift.spec.ts` | Server spec Section 10 and web spec Sections 6.6/8.5 remain aligned on graph identity and overlay semantics; drift fails CI. |
| ITX-033 | `test/integration/contract/graph-contract-lock-drift.spec.ts` | Static graph contract lock plus runtime overlay-reference conformance requirements are enforced in integration scope. |
