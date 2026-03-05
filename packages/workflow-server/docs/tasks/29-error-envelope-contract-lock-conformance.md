# T29 - Error Envelope Contract Lock Conformance

## Depends On
- `T23`
- `T24`
- `T27`

## Objective
Implement CI-verifiable conformance for shared transport error contracts introduced/clarified in server spec Section 8.0 and Section 8.10, including cross-spec lock checks against `apps/workflow-web/docs/workflow-web-spec.md` Section 6.8 and runtime contract assertions for `ErrorEnvelope` and `SubmitHumanFeedbackResponseConflict` handling.

## Fixed Implementation Decisions
- Error contract drift validation is implemented as static integration tests that compare server spec error-contract sections and web spec error-contract sections.
- Shared error contract lock is enforced as a three-way alignment gate across server spec, web spec, and `@composable-workflow/workflow-api-types` exports.
- Covered `400`/`404` API failures are treated as `ErrorEnvelope` contract obligations for endpoints within task scope.
- Feedback submit `409` responses are treated as strict `SubmitHumanFeedbackResponseConflict` contract obligations.
- Unknown/malformed error-envelope payloads in covered scenarios are explicit contract violations and must fail tests (never silently tolerated).

## Interface/Schema Contracts
- Server spec error contract source: `docs/typescript-server-workflow-spec.md` Sections 8.0 and 8.10.
- Web spec error contract source: `apps/workflow-web/docs/workflow-web-spec.md` Section 6.8.
- Shared error contracts: `ErrorEnvelope`, `SubmitHumanFeedbackResponseConflict` from `@composable-workflow/workflow-api-types`.
- Contract assertions:
  - covered `400`/`404` failures return `ErrorEnvelope` with required `code`, `message`, and `requestId`,
  - endpoint-specific conflict behavior for feedback submit `409` uses `SubmitHumanFeedbackResponseConflict`,
  - `details` remains JSON-serializable,
  - server/web/shared contract artifacts remain synchronized on error envelope semantics.

## Implementation Tasks
- [x] Add error-contract lock drift test for server spec Sections 8.0/8.10 vs web spec Section 6.8.
- [x] Extend lock drift test to assert three-way alignment across server spec, web spec, and `@composable-workflow/workflow-api-types` error contract exports.
- [x] Add integration test coverage for covered `400`/`404` failures asserting `ErrorEnvelope` required fields.
- [x] Add integration test coverage for feedback submit `409` asserting `SubmitHumanFeedbackResponseConflict` shape and terminal metadata fields.
- [x] Add negative-path coverage for malformed/missing required error-contract fields and assert explicit contract violation handling.
- [x] Update coverage ledger ownership to map requirement IDs to this task.

## Required Artifacts
- `packages/workflow-server/test/integration/contract/error-envelope-contract-lock-drift.spec.ts`
- `packages/workflow-server/test/integration/api/error-envelope-conformance.spec.ts`

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/contract/error-envelope-contract-lock-drift.spec.ts`
- `packages/workflow-server/test/integration/api/error-envelope-conformance.spec.ts`

### Modify
- `docs/testing/coverage-matrix.md`
- `docs/integration-tests.md` (add ITX catalog entry for error-envelope contract conformance)
- `docs/behaviors.md` (only if wording for `B-API-007` / `B-CONTRACT-006` requires strictness alignment)

## Acceptance Criteria
- A drift test fails when server error-contract sections and web error-contract section diverge on `ErrorEnvelope` or feedback-conflict semantics.
- A drift test fails when error-contract semantics drift across any of the three lock artifacts: server spec, web spec, or `@composable-workflow/workflow-api-types` exports.
- Integration tests validate covered `400`/`404` responses return `ErrorEnvelope` with required fields.
- Integration tests validate feedback submit `409` responses conform to `SubmitHumanFeedbackResponseConflict` and include terminal status/timestamp semantics.
- Unknown or malformed required error-envelope fields are surfaced as contract violations and fail tests.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/contract/error-envelope-contract-lock-drift.spec.ts`
  - Expected: passes when server spec, web spec, and shared error-contract exports are aligned; fails on drift.
- Command: `pnpm --filter @composable-workflow/workflow-server exec vitest run test/integration/api/error-envelope-conformance.spec.ts`
  - Expected: passes when covered failure responses conform to shared error contracts and strict conflict semantics.

## Spec/Behavior Links
- Spec: Sections 8.0, 8.10.
- Behaviors: `B-API-007`, `B-CONTRACT-006`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-API-007 | `test/integration/api/error-envelope-conformance.spec.ts` | Covered `400`/`404` responses conform to `ErrorEnvelope`; feedback submit `409` conforms to `SubmitHumanFeedbackResponseConflict`. |
| B-CONTRACT-006 | `test/integration/contract/error-envelope-contract-lock-drift.spec.ts` | Error-contract changes stay coordinated across shared exports, server spec, and web spec; drift fails CI. |
