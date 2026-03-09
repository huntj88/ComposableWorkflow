# SDB-24 - Cross-Stage Duplicate Dedup-and-Log

## Depends On
- `SDB-22`
- `SDB-23`

## Objective
Replace the fatal-error behavior for duplicate `itemId` or `questionId` values across executed child prompt layers with a dedup-and-log strategy: keep the first occurrence, silently drop later duplicates, and emit a warn-level `consistency.duplicate-skipped` observability event for each dropped entry. This matches the existing dedup-and-skip pattern already used for `blockingIssues` ids in `pushUniqueBlockingIssues`.

## Motivation
LLM prompt layers can independently identify the same spec concern and produce byte-identical follow-up questions or actionable items with the same id. Under the previous fatal-error contract, this non-deterministic but benign duplication crashed the child run and propagated failure to the parent. The new behavior treats cross-stage id collisions as expected LLM output overlap, deduplicates deterministically, and provides observability for monitoring duplication frequency.

## Implementation Tasks
- [x] Change `mergeStageOutput` in `consistency-follow-up-child.ts` to skip (not throw) on duplicate `itemId` or `questionId`, matching the existing `pushUniqueBlockingIssues` pattern.
- [x] Emit a warn-level `consistency.duplicate-skipped` log event from `mergeStageOutput` for each skipped duplicate, including `stageId` (producing), duplicate id value, id type (`questionId` or `itemId`), and originating `stageId`.
- [x] Add `consistency.duplicate-skipped` to the `OBS_TYPES` constant and add an `emitDuplicateSkipped` observability helper in `observability.ts`.
- [x] Update `validateConsistencyCheckOutputContract` to use dedup-and-continue (collecting violations as warnings) instead of appending fatal violations for duplicate `itemId`/`questionId` — or remove the post-hoc duplicate check entirely since `mergeStageOutput` now guarantees uniqueness.
- [x] Update unit tests in `consistency-follow-up-child.test.ts`: change "fails on duplicate" assertions to "skips duplicate and continues" assertions; add assertions for the emitted warn-level log.
- [x] Update integration test `itx.spec-doc.ITX-SD-016.spec.ts`: change "fails the parent state when executed layers emit duplicate" assertions to "deduplicates and logs, child completes, parent routes normally" assertions.
- [x] Track originating `stageId` per seen id in `mergeStageOutput` state so the log event can report which stage originally contributed the kept entry.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`

## Acceptance Criteria
- When a later child prompt layer emits a `questionId` or `itemId` already seen from an earlier layer, the later occurrence is dropped and the aggregate retains only the first.
- A warn-level `consistency.duplicate-skipped` log event is emitted for each dropped duplicate, identifying the producing `stageId`, the originating `stageId`, the duplicate id value, and the id type.
- The child run does not fail on cross-stage duplicate ids; it continues executing remaining configured prompt layers and proceeds to `PlanResolution`.
- The deduplicated aggregate is available for the planning step and produces a valid parent-facing result.
- Parent routing after child completion is unaffected: non-empty `actionableItems` route to `IntegrateIntoSpec`, otherwise to `NumberedOptionsHumanRequest`.
- Existing `pushUniqueBlockingIssues` dedup-and-skip behavior for blocking-issue ids remains unchanged.
- Stage-local mixed `actionableItems`/`followUpQuestions` within a single layer still fails the child run (B-SD-CHILD-003 unchanged).
- Unit tests assert skip-and-continue rather than throw-on-duplicate.
- Integration tests assert the child completes successfully with deduplicated output and observable warn-level logs rather than failing.

## Spec/Behavior Links
- Spec: sections 5.3, 6.2.1 (rule 13), 9, 10.2 (AC-7).
- Behaviors: `B-SD-CHILD-002`, `B-SD-OBS-001`.
- Integration tests: `ITX-SD-016`.

## Fixed Implementation Decisions
- Dedup strategy is first-wins: the first occurrence by stage execution order is always kept.
- The warn-level log uses the `consistency.duplicate-skipped` event type, not an error or info level.
- Originating-stage tracking uses a `Map<string, string>` (id → stageId) alongside the existing `Set<string>` for seen ids. This is internal to `mergeStageOutput` state data and does not appear in the child output contract.
- `validateConsistencyCheckOutputContract` in the parent no longer needs to check for duplicate `itemId`/`questionId` because `mergeStageOutput` guarantees uniqueness before `PlanResolution` runs. The duplicate-check loop in that function is removed.
- No changes to the `ConsistencyCheckOutput` or `ConsistencyStageOutput` exported type shapes. `ConsistencyFollowUpChildStateData` gains two internal tracking fields (`seenFollowUpQuestionOrigins`, `seenActionableItemOrigins`) required for state persistence across `ExecutePromptLayer` self-loop transitions; these are internal bookkeeping and do not appear in the parent-facing child output contract.

## Interface/Schema Contracts
- No schema changes. `ConsistencyCheckOutput` and `ConsistencyStageOutput` shapes are unchanged.
- `ConsistencyFollowUpChildStateData` gains two internal tracking fields for originating-stage maps: `seenFollowUpQuestionOrigins: Array<[string, string]>` and `seenActionableItemOrigins: Array<[string, string]>` (serializable as tuples for state persistence). These are internal bookkeeping and not part of the parent-facing contract.
- `OBS_TYPES` gains `duplicateSkipped: 'consistency.duplicate-skipped'`.
- The `emitDuplicateSkipped` helper accepts `ctx`, `stageId` (producing), `originStageId`, `duplicateId`, and `idType` (`'questionId' | 'itemId'`).

## File Plan (Exact)
### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/consistency-follow-up-child.ts`
  - `mergeStageOutput`: replace `throw` with `continue` + log emit for duplicate `itemId` and `questionId`.
  - Add originating-stage tracking (`Map`-backed) in the merge loop.
  - `ConsistencyFollowUpChildStateData`: add `seenFollowUpQuestionOrigins` and `seenActionableItemOrigins` fields.
  - `createInitialConsistencyFollowUpChildStateData`: initialize the new fields as empty arrays.
  - `validateConsistencyCheckOutputContract`: remove the duplicate `itemId`/`questionId` violation loops (uniqueness is now guaranteed upstream).
- `packages/workflow-app-builder/src/workflows/spec-doc/observability.ts`
  - Add `duplicateSkipped` to `OBS_TYPES`.
  - Add `emitDuplicateSkipped` function.
- `packages/workflow-app-builder/test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Change "fails on duplicate actionable itemId" test to assert skip-and-continue with warn log.
  - Change "fails on duplicate follow-up questionId" test to assert skip-and-continue with warn log.
  - Add assertion that the aggregate contains only the first occurrence.
- `packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Change "fails the parent state when executed layers emit duplicate follow-up question IDs" to assert child completes, parent routes normally, and warn-level log is present.
  - Change "fails the parent state when a later layer duplicates an earlier actionable item ID" to assert child completes, parent routes normally, and warn-level log is present.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/workflows/spec-doc/consistency-follow-up-child.test.ts`
  - Expected: duplicate ids across stages are skipped (not thrown), aggregate contains only first occurrence, warn-level log emitted.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder exec vitest run test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts`
  - Expected: child completes successfully with deduplicated output, parent routes normally, `consistency.duplicate-skipped` warn-level event present in log stream.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-DEDUP-001-SkipDuplicateQuestionId | `src/workflows/spec-doc/consistency-follow-up-child.ts` (`mergeStageOutput`) | duplicate `questionId` is dropped; aggregate contains only first occurrence. |
| SD-DEDUP-002-SkipDuplicateItemId | `src/workflows/spec-doc/consistency-follow-up-child.ts` (`mergeStageOutput`) | duplicate `itemId` is dropped; aggregate contains only first occurrence. |
| SD-DEDUP-003-WarnLogEmitted | `src/workflows/spec-doc/observability.ts` (`emitDuplicateSkipped`) | warn-level `consistency.duplicate-skipped` log emitted with producing `stageId`, originating `stageId`, duplicate id, and id type. |
| SD-DEDUP-004-OriginTracking | `src/workflows/spec-doc/consistency-follow-up-child.ts` (`mergeStageOutput`) | log event identifies which stage originally contributed the kept entry. |
| SD-DEDUP-005-ChildContinues | `src/workflows/spec-doc/consistency-follow-up-child.ts` (`mergeStageOutput`) | child run proceeds through remaining stages and `PlanResolution` after dedup. |
| SD-DEDUP-006-ParentUnaffected | `src/workflows/spec-doc/states/logical-consistency-check.ts` | parent routing after child completion is unchanged by dedup. |
| SD-DEDUP-007-RemovePostHocDupCheck | `src/workflows/spec-doc/consistency-follow-up-child.ts` (`validateConsistencyCheckOutputContract`) | duplicate id loops removed; function no longer reports id-uniqueness violations. |
| SD-DEDUP-008-UnitTestSkipAssertions | `test/workflows/spec-doc/consistency-follow-up-child.test.ts` | unit tests assert skip-and-continue, not throw. |
| SD-DEDUP-009-IntegrationTestDedupAssertions | `test/integration/spec-doc/itx.spec-doc.ITX-SD-016.spec.ts` | integration tests assert child completes with deduplicated output and warn log. |
