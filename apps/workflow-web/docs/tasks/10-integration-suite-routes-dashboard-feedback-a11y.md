# TWEB10 - Integration Suite: Routes, Dashboard, Feedback, Filters, Accessibility

## Depends On
- `TWEB09`
- `TWEB01`
- `TWEB02`
- `TWEB03`
- `TWEB04`
- `TWEB05`
- `TWEB06`
- `TWEB07`

## Objective
Implement deterministic integration coverage for route semantics, dashboard boot/isolation behavior, feedback and filtering behavior, metadata completeness, keyboard/accessibility rules, and panel interaction coupling scenarios.

## Fixed Implementation Decisions
- Integration tests are route-level and transport-mocked.
- Assertions are deterministic and semantic; no visual snapshot coupling.
- One exact test file is created per ITX ID.

## Interface/Schema Contracts
- Shared transport DTO contracts from `@composable-workflow/workflow-api-types`.
- Route semantics from `workflow-web-spec.md` Sections 4 and 5.

## Implementation Tasks
- [ ] Add integration tests for route canonical behavior and dashboard boot wiring.
- [ ] Add panel failure isolation/not-found/action/metadata tests.
- [ ] Add feedback discovery/submit/detail tests and filter independence tests.
- [ ] Add layout/token/keyboard/accessibility announcement/focus tests.
- [ ] Add causal navigation and auto-follow/jump-to-latest behavior tests.
- [ ] Add definitions-route integration test validating deep-link render and metadata panel behavior.
- [ ] Execute targeted test files individually (one command per exact spec file) for deterministic triage.

## Required Artifacts
- `apps/workflow-web/test/integration/routes/*.spec.ts`
- `apps/workflow-web/test/integration/feedback/*.spec.ts`
- `apps/workflow-web/test/integration/accessibility/*.spec.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-002.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-003.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-004.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-007.spec.ts`
- `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-011.spec.ts`
- `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts`
- `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts`
- `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-014.spec.ts`
- `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-015.spec.ts`
- `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-016.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-024.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-025.spec.ts`
- `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-026.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-028.spec.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-033.spec.ts`
- `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-035.spec.ts`
- `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-042.spec.ts`
- `apps/workflow-web/test/integration/routes/itx.web.routes.definitions-view.spec.ts`

## Acceptance Criteria
- Every assigned ITX case has deterministic automated coverage.
- Tests assert behavior with transport mocks and explicit timer control where required.
- All route/dashboard/feedback/filter/a11y interaction invariants are covered.
- Definitions route deep-link and metadata rendering behavior is covered in integration scope.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/accessibility/itx.web.a11y.ITX-WEB-042.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| ITX-WEB-001 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts` | HashRouter canonical route behavior and history-state semantics are deterministic. |
| ITX-WEB-002 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-002.spec.ts` | Dashboard boot sequence and panel wiring calls are asserted. |
| ITX-WEB-003 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-003.spec.ts` | Panel failure isolation and retry behavior are panel-scoped. |
| ITX-WEB-004 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-004.spec.ts` | Run-summary `404` not-found behavior is verified. |
| ITX-WEB-007 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-007.spec.ts` | Stream health transitions preserve in-progress draft input. |
| ITX-WEB-011 | `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-011.spec.ts` | Run-scoped feedback discovery/filtering behavior is enforced. |
| ITX-WEB-012 | `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts` | Submit `400`/`409` and success semantics are deterministic. |
| ITX-WEB-013 | `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts` | Event/log filter independence and explicit link mode are validated. |
| ITX-WEB-014 | `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-014.spec.ts` | Layout architecture and responsive order are asserted. |
| ITX-WEB-015 | `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-015.spec.ts` | Lifecycle and stream-health token consistency is validated. |
| ITX-WEB-016 | `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-016.spec.ts` | Keyboard-only interaction path coverage is deterministic. |
| ITX-WEB-024 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-024.spec.ts` | Run refresh/cancel action semantics are validated. |
| ITX-WEB-025 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-025.spec.ts` | Summary/timeline metadata completeness is validated. |
| ITX-WEB-026 | `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-026.spec.ts` | Feedback detail expansion and option-validation surfacing are validated. |
| ITX-WEB-028 | `apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-028.spec.ts` | Causal navigation chain and cross-panel correlation are validated. |
| ITX-WEB-033 | `apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-033.spec.ts` | Auto-follow/scroll/jump-to-latest behavior is deterministic. |
| ITX-WEB-035 | `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-035.spec.ts` | Critical status announcements and panel-scoped loading/empty states are asserted. |
| ITX-WEB-042 | `apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-042.spec.ts` | Live-region levels and focus-return targets are validated. |
