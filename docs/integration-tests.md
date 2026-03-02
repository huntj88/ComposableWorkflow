# Integration Test Plan for Non-E2E Behaviors

This document defines **integration tests for behaviors that should not rely solely on end-to-end black-box tests**.

## Classification and Parity Policy

- `system` (harness): in-process suites using `test/harness/create-harness.ts` for deterministic controls and fault injection.
- `e2e-blackbox`: suites that call a separately launched production server process over network HTTP only.
- Harness/system coverage is required for deterministic depth, but it is not a substitute for required black-box production parity gates.

### Required Commands

- Launch production server: `pnpm --filter @composable-workflow/workflow-server start`
- Workflow-server black-box suite: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox`
- Workflow-CLI black-box suite: `pnpm --filter @composable-workflow/workflow-cli test:e2e:blackbox`
- Harness/system suite: `pnpm --filter @composable-workflow/workflow-server test:system`

Use this alongside:
- `docs/typescript-server-workflow-spec.md`
- `docs/behaviors.md`

---

## 1) Purpose

E2E tests validate user-visible API behavior across full system boundaries, but some guarantees require:
- deterministic fault injection,
- direct validation of internal sequencing/atomicity,
- simulation of rare race conditions,
- strict verification of instrumentation hook contracts,
- lifecycle transitions around crash/recovery internals.

These are integration concerns and should be tested with controlled test doubles/stubs and direct datastore/runtime access.

---

## 2) What Qualifies as Integration-Only (or Integration-Primary)

A behavior is integration-primary when one or more is true:
1. Requires forcing infrastructure failures at exact boundaries (before/after DB append, during lock acquisition).
2. Requires deterministic control of time, retries, or scheduler ordering.
3. Requires direct assertions on internals not part of public API contract (runner lock ownership, hook invocation ordering, policy evaluator decisions).
4. Requires synthetic crash/restart checkpoints difficult to make stable in full E2E.
5. Requires broad combinatorial coverage that would make E2E slow/flaky.

---

## 3) Integration Test Harness Requirements

## 3.1 Runtime Harness
- In-process workflow engine + server orchestration layer instantiated with test DI.
- Swappable implementations for:
  - persistence adapter,
  - lock provider,
  - command runner,
  - instrumentation sink,
  - clock/time source,
  - id generator/sequence allocator.

## 3.2 Persistence Strategy
- Prefer real Postgres in ephemeral container for transactional semantics.
- Optionally add storage contract tests that run against both Postgres and in-memory adapters.

## 3.3 Determinism Controls
- Fake clock for timestamp and timeout tests.
- Barrier/latch primitives to pause execution between critical steps.
- Fault injection points in orchestration and persistence layers.

## 3.4 Observability Capture
- Test sink recording all:
  - emitted workflow events,
  - log records,
  - metrics writes,
  - trace span trees.

---

## 4) Integration Test Catalog

## ITX-001: Event append atomicity around transition acknowledgment
**Why not E2E-only:** difficult to reliably prove crash windows.

**Setup**
- Inject fault between transition business logic success and outward acknowledgment.

**Assertions**
- Critical transition events are durably appended before acknowledgment boundary (or equivalent durable ordering contract).
- On restart/retry, no duplicate transition completion is produced for same logical step.

**Related behaviors:** `B-DATA-001`, `B-TRANS-001`.

## ITX-002: Per-run sequence monotonicity under concurrent writers
**Why not E2E-only:** requires high-contention synthetic scheduling.

**Setup**
- Simulate concurrent event emission paths for same `runId`.

**Assertions**
- Sequence is strictly monotonic and gap-free under configured semantics.
- Ordering remains stable under retries.

**Related behaviors:** `B-TRANS-003`, global event invariants.

## ITX-003: Single active runner lock per run
**Why not E2E-only:** lock races are hard to deterministically force via API-only tests.

**Setup**
- Start two runner attempts for same `runId` concurrently.

**Assertions**
- Exactly one runner acquires execution lease.
- Loser path exits safely without mutating run state.
- Lock release/reacquire works after completion/failure.

**Related behaviors:** section 7.2 concurrency model, `B-LIFE-007`.

## ITX-004: Idempotency key dedupe transaction race
**Why not E2E-only:** race window is narrow and flaky in black-box mode.

**Setup**
- Fire same idempotency request concurrently across threads/processes.

**Assertions**
- Exactly one logical run created.
- Others return same run identity or documented idempotent response.
- No duplicate `workflow.started` for same dedupe key.

**Related behaviors:** `B-START-003`.

## ITX-005: Pause safe-point enforcement inside transition boundary
**Why not E2E-only:** must inspect internal checkpoint timing.

**Setup**
- Inject pause request while handler is mid-step and at safe-point boundaries.

**Assertions**
- Lifecycle enters `pausing` immediately.
- Terminalization to `paused` occurs only at safe points.
- No illegal partial transition commit.

**Related behaviors:** `B-LIFE-001`, `B-LIFE-005`.

## ITX-006: Resume path re-enters running exactly once
**Why not E2E-only:** duplicate resume race needs deterministic scheduling.

**Setup**
- Issue duplicate resume requests and concurrent worker wakeups.

**Assertions**
- Single logical transition to `resuming` then `running`.
- `workflow.resumed` emitted exactly once.

**Related behaviors:** `B-LIFE-003`, `B-LIFE-004`.

## ITX-007: Recovery reconciler idempotence with partial progress
**Why not E2E-only:** requires direct control over crash markers.

**Setup**
- Seed interrupted runs in multiple transitional states.
- Crash injector after reconciler processes subset.

**Assertions**
- Re-running reconcile produces no duplicate recovery side effects when no post-recovery transition progress occurred.
- Re-running reconcile is allowed to recover again when transition progress occurred after the latest recovery boundary.
- Final states converge consistently.
- Locking prevents concurrent reconcile corruption.

**Related behaviors:** `B-LIFE-007`, `B-LIFE-008`, `GS-005`.

## ITX-008: Parent-propagated cancellation traversal correctness
**Why not E2E-only:** deep trees + timing races are expensive and flaky E2E.

**Setup**
- Create multi-level parent/child tree with mixed active/terminal descendants.

**Assertions**
- Cancellation request reaches active descendants exactly once.
- Terminal descendants are skipped safely.
- No new child launches after cancellation intent is recorded.
- Cancellation lifecycle emits `workflow.cancelling` then terminal `workflow.cancelled`.

**Related behaviors:** `B-CHILD-004`, `B-LIFE-006`.

## ITX-009: Child launch rejection in forbidden lifecycles
**Why not E2E-only:** requires precise lifecycle interleavings.

**Setup**
- Force lifecycle to `pausing|paused|resuming|cancelling|recovering`, then invoke launch child path.

**Assertions**
- Launch rejected with deterministic runtime error.
- No child run row/event created.
- No `workflow_run_children` lineage row created.

**Related behaviors:** `B-LIFE-005`.

## ITX-010: Command policy enforcement engine
**Why not E2E-only:** policy matrix coverage is too broad for E2E cost.

**Setup**
- Run command requests across allowlist/denylist, cwd restrictions, env restrictions, timeout caps.

**Assertions**
- Disallowed requests fail before process spawn.
- Allowed requests honor normalized policy and caps.
- Policy decision metadata reaches log/event payload.

**Related behaviors:** `B-CMD-004`.

## ITX-011: Command output truncation/redaction contract
**Why not E2E-only:** requires precise payload boundary assertions.

**Setup**
- Emit oversized/stdin-stdout-stderr payloads with sensitive fields.

**Assertions**
- Output is truncated at configured limits.
- Redacted fields are masked deterministically.
- `truncated` and `redactedFields` markers are populated.

**Related behaviors:** `B-CMD-004`, `B-OBS-001`.

## ITX-012: Non-zero exit handling permutations
**Why not E2E-only:** matrix across exit code + `allowNonZeroExit` + FSM-defined retry policy.

**Setup**
- Simulated command exits with known codes under both flag settings.

**Assertions**
- Correct command event type emitted (`completed` vs `failed`).
- Workflow continuation/failure matches policy.

**Related behaviors:** `B-CMD-002`.

## ITX-013: Instrumentation hook ordering and backpressure behavior
**Why not E2E-only:** requires direct control of slow/failing sinks.

**Setup**
- Inject instrumentation sink that delays or fails intermittently.

**Assertions**
- Event emission ordering contract preserved.
- Defined failure-isolation behavior honored (e.g., telemetry failure does not corrupt run state).
- FSM-defined retry/dead-letter behavior (if configured) is observed.

**Related behaviors:** `B-OBS-001..003`.

## ITX-014: Trace tree integrity for parent/child/command nesting
**Why not E2E-only:** span parentage is easier to assert with direct exporter capture.

**Setup**
- Execute workflow with transitions, command, child workflow.

**Assertions**
- Exactly one root span per run.
- Transition/command spans nested under correct parent.
- Child run span linkage preserves context propagation.

**Related behaviors:** `B-OBS-003`, `B-CHILD-001`, `B-CMD-001`.

## ITX-015: Definition graph metadata normalization
**Why not E2E-only:** requires direct comparison against workflow factory metadata extraction.

**Setup**
- Register workflows with varying optional metadata and transition descriptors.

**Assertions**
- API/static schema output normalizes missing optional fields correctly.
- No phantom states/edges.
- Child-launch annotations map to expected states/edges.

**Related behaviors:** `B-API-005`.

## ITX-016: Cursor pagination stability for events query
**Why not E2E-only:** requires controlled insertion between pages.

**Setup**
- Page through event stream while appending additional events.

**Assertions**
- Cursor contract avoids duplicates or omissions under documented semantics.
- Filters (`eventType`, `since`, `until`) compose predictably.

**Related behaviors:** `B-API-002`.

## ITX-017: Snapshot consistency with event-derived state (if snapshots enabled)
**Why not E2E-only:** requires direct storage-level verification.

**Setup**
- Enable snapshots; run workflows through multiple transitions/failures/recovery.

**Assertions**
- Snapshot state equals replay-derived state.
- Snapshot lag/rebuild behavior stays within documented bounds.

**Related behaviors:** `B-DATA-002`.

## ITX-018: Child-linkage write is transactional and idempotent
**Why not E2E-only:** requires precise validation of transaction boundaries and duplicate-suppression semantics.

**Setup**
- Force child launch with injected retry/recovery windows around linkage writes.

**Assertions**
- `workflow_run_children` linkage row is written in the same transaction boundary as child launch persistence and linkage event append.
- Duplicate retries/recovery attempts do not create duplicate linkage rows.
- Linkage relation stays consistent with emitted lineage events.

**Related behaviors:** `B-DATA-003`, `B-CHILD-001`.

## ITX-019: Startup reconcile admission gate blocks new execution until ready
**Why not E2E-only:** startup race windows are timing-sensitive and need deterministic control of boot sequencing.

**Setup**
- Seed unfinished runs and hold reconcile progress with harness barriers while issuing new start requests.

**Assertions**
- Server startup reconciliation runs before accepting new execution work.
- Start requests are deferred/rejected according to startup policy until reconcile gate clears.
- No run execution begins before reconcile completion boundary.

**Related behaviors:** `B-LIFE-008`, `GS-005`.

## ITX-020: Feedback response first-wins idempotency under concurrent submission
**Why not E2E-only:** race window between concurrent response submissions is narrow and flaky in black-box mode.

**Setup**
- Launch feedback child run and hold at `awaiting_response`.
- Fire concurrent response submissions from multiple threads/processes.

**Assertions**
- Exactly one response is accepted and produces `human-feedback.received` event.
- Remaining submissions return `409` with terminal status metadata.
- `human_feedback_requests` projection terminates to `responded` exactly once.
- No duplicate `human-feedback.received` events for same `feedbackRunId`.

**Related behaviors:** `B-HFB-003`, `B-API-007`.

## ITX-021: Feedback projection write transactionality with event append
**Why not E2E-only:** requires precise validation of transaction boundaries between event append and projection write.

**Setup**
- Inject fault between feedback event append and projection write.
- Verify recovery/retry behavior.

**Assertions**
- `human_feedback_requests` projection row is written in the same transaction boundary as the corresponding feedback event append.
- Duplicate retries/recovery do not create divergent projection rows from canonical event history.
- `question_id` remains stable for the lifecycle of its feedback run.
- `request_event_id` unique constraint prevents duplicate projection writes.

**Related behaviors:** `B-DATA-004`, `B-HFB-001`.

## ITX-022: Invalid feedback option validation permutations
**Why not E2E-only:** combinatorial coverage across option ID validation, missing questionId, and schema conformance is too broad for E2E cost.

**Setup**
- Issue feedback responses with: non-existent `selectedOptionIds`, missing `questionId`, malformed schema, valid option IDs.

**Assertions**
- Invalid `selectedOptionIds` returns `400` and keeps feedback status `awaiting_response`.
- Missing `questionId` returns `400`.
- Response conforming to `numbered-options-response-input.schema.json` is validated before acceptance.
- No `human-feedback.received` event emitted for rejected submissions.
- Valid submissions after prior rejections still succeed.

**Related behaviors:** `B-HFB-004`, `B-API-007`.

## ITX-023: Feedback wait safe-point semantics during pause/cancel
**Why not E2E-only:** requires precise lifecycle interleavings at the feedback wait boundary.

**Setup**
- Start parent workflow waiting on feedback child.
- Inject pause or cancel request while parent is blocked at feedback wait.

**Assertions**
- Human-feedback waits are treated as safe points for lifecycle transitions.
- Pause/cancel during feedback wait does not lose pending feedback correlation state.
- Feedback child run follows parent cancellation propagation policy when cancelled.
- `human-feedback.cancelled` emitted if feedback is cancelled via propagation.
- `human_feedback_requests` projection reflects correct terminal status.

**Related behaviors:** `B-HFB-006`, `B-LIFE-001`, `B-LIFE-006`.

## ITX-024: Recovery reconcile for interrupted feedback-waiting runs
**Why not E2E-only:** requires direct control over crash markers and feedback run state seeding.

**Setup**
- Seed interrupted feedback runs in `awaiting_response` state with partially written events.
- Crash injector after reconciler processes subset.

**Assertions**
- Recovery restores waiting feedback runs to consistent state without duplicate question issuance.
- First-response-wins idempotency is preserved after recovery.
- Re-running reconcile produces no duplicate feedback side effects.
- Reconciled feedback runs accept responses correctly post-recovery.

**Related behaviors:** `B-HFB-007`, `B-LIFE-007`, `GS-005`.

## ITX-025: Feedback child launch rejection in forbidden lifecycles
**Why not E2E-only:** requires precise lifecycle interleavings identical to ITX-009 but specific to feedback child type.

**Setup**
- Force parent lifecycle to `pausing|paused|resuming|cancelling|recovering`, then attempt to launch `server.human-feedback.v1` child.

**Assertions**
- Launch rejected with deterministic runtime error.
- No feedback child run row/event created.
- No `human_feedback_requests` projection row created.
- No `workflow_run_children` lineage row created.

**Related behaviors:** `B-LIFE-005`, `B-HFB-001`.

## ITX-026: Completion-confirmation response requires exactly one selected option
**Why not E2E-only:** validation permutations around completion-confirmation question type and terminalization side effects are better covered with deterministic in-process checks.

**Setup**
- Launch completion-confirmation feedback request and hold at `awaiting_response`.
- Submit responses with zero, one, and multiple `selectedOptionIds`.

**Assertions**
- Zero or multiple selections return `400` and keep status `awaiting_response`.
- Exactly one valid selection is accepted and produces `human-feedback.received`.
- Rejected permutations do not emit `human-feedback.received`.

**Related behaviors:** `B-HFB-011`, `B-API-007`.

## ITX-027: Numbered-options request numbering contract enforcement
**Why not E2E-only:** request-shape contract validation across authored queues and workflow-generated prompts is combinatorial and easier to isolate in harness tests.

**Setup**
- Attempt feedback request issuance with valid numbering and invalid numbering (duplicates, gaps, non-1 start).

**Assertions**
- Only unique contiguous numbering starting at `1` is accepted.
- Invalid numbering is rejected before pending feedback request creation.
- No feedback run/events/projection rows are created for rejected numbering.

**Related behaviors:** `B-HFB-009`, `B-HFB-001`.

## ITX-028: Question immutability and clarification queue ordering
**Why not E2E-only:** verifying no mutation of prior issued question payloads plus immediate-next follow-up insertion requires direct queue/projection inspection.

**Setup**
- Issue a numbered question, then trigger clarification path.

**Assertions**
- Original question payload remains immutable after issuance.
- Clarification creates a new question with a new `questionId`.
- Clarification question is inserted as the immediate next queue item.

**Related behaviors:** `B-HFB-010`.

## ITX-029: Response text length semantics (no protocol max)
**Why not E2E-only:** requires controlled validation-path assertions across large payload handling and optional local limit enforcement.

**Setup**
- Submit large but schema-valid `response.text` payloads.
- Run with and without configured implementation-specific operational text limits.

**Assertions**
- Without local text limit, request is not rejected solely by text length.
- With local limit enabled, endpoint returns `400` with validation details.
- Rejections do not terminalize pending feedback requests.

**Related behaviors:** `B-HFB-012`, `B-API-007`.

## 5) Integration vs E2E Ownership Matrix

## 5.1 Integration-Primary
- ITX-001, 002, 003, 004, 005, 006, 007, 010, 011, 013, 014, 016, 017, 018, 019, 020, 021, 024, 027, 028, 029.

## 5.2 Shared Coverage (Integration + E2E)
- ITX-008, 009, 012, 015, 022, 023, 025, 026.

Guideline:
- Keep one happy-path proof in E2E.
- Put exhaustive edge matrix and race/fault coverage in integration.

---

## 6) Recommended Test Structure

- `packages/workflow-lib/test/integration/...`
  - runtime transitions, child orchestration, command policies, hook contracts.
- `packages/workflow-server/test/integration/...`
  - loader/registry, API adapter + persistence behavior, reconcile/locking, human feedback API + projection.
- `packages/workflow-server/test/harness/...`
  - fake clock, fault injector, barrier primitives, sink capture.

Naming convention:
- `itx.<domain>.<behavior-id>.spec.ts`
- Example: `itx.lifecycle.ITX-007.spec.ts`

---

## 7) Exit Criteria for Integration Suite

Integration suite is complete when:
1. All integration-primary tests pass deterministically in CI.
2. Fault injection tests are reproducible (no flaky timing sleeps as primary mechanism).
3. Coverage includes at least one failing-path assertion per critical domain:
   - persistence atomicity,
   - lifecycle controls,
   - reconciliation,
   - command policy/redaction,
   - instrumentation isolation,
   - human feedback response idempotency, projection transactionality, and option validation.
4. Every integration-primary test maps to one or more `docs/behaviors.md` behavior IDs.

---

## 8) Implementation Notes

- Prefer barrier/latch synchronization over arbitrary delays.
- Fail fast on missing required event/log fields.
- Capture full diagnostics on failure: run timeline, event stream, lifecycle transitions, and injected fault points.
- Keep integration tests hermetic: no dependency on external network services beyond test-local Postgres container.
