# Integration Test Plan for Spec-Doc Generation Workflow

This document defines **integration tests for `app-builder.spec-doc.v1` behaviors that should not rely solely on end-to-end black-box tests**.

## Classification and Parity Policy

- `system` (harness): in-process suites using test harness with deterministic copilot prompt doubles and controlled feedback responses.
- `e2e-blackbox`: suites that call a separately launched production server process over network HTTP only.
- Harness/system coverage is required for deterministic depth, but it is not a substitute for required black-box production parity gates.

### Required Commands

- Launch production server: `pnpm --filter @composable-workflow/workflow-server start`
- Workflow-server black-box suite: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox`
- Harness/system suite: `pnpm --filter @composable-workflow/workflow-server test:system`

Use this alongside:
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-server/docs/behaviors.md`
- `packages/workflow-server/docs/integration-tests.md`

---

## 1) Purpose

E2E tests validate user-visible API behavior across full system boundaries, but the spec-doc generation workflow has integration concerns that require:
- deterministic copilot prompt responses (schema-validated structured output),
- deterministic full-sweep consistency-stage coverage before child-result planning,
- controlled question queue ordering and mutation verification,
- precise FSM transition guard evaluation,
- schema validation failure injection at exact state boundaries,
- loop counter boundary testing,
- custom prompt classification routing verification,
- feedback response validation permutations,
- recovery of interrupted multi-step queue processing.

These are integration concerns and should be tested with controlled test doubles and direct state/event access.

---

## 2) What Qualifies as Integration-Only (or Integration-Primary)

A behavior is integration-primary when one or more is true:
1. Requires deterministic copilot prompt responses (not real AI model output).
2. Requires precise FSM guard evaluation at state boundaries.
3. Requires schema validation failure injection for specific states.
4. Requires verification of internal queue state (ordering, insertion, immutability).
5. Requires loop counter boundary testing.
6. Requires broad combinatorial coverage of custom prompt classification → routing paths.
7. Requires fault injection around copilot prompt delegation or feedback child launch.

---

## 3) Integration Test Harness Requirements

## 3.1 Copilot Prompt Test Double
- Deterministic `app-builder.copilot.prompt.v1` stub that returns configured `structuredOutput` per call.
- Supports per-state schema-valid and schema-invalid response injection.
- Supports failure injection (child workflow failure simulation).
- Records all calls with template ID, `outputSchema`, `stageId` when applicable, child state (`ExecutePromptLayer` vs `PlanResolution`), and interpolation variables for assertion.

## 3.2 Feedback Response Controller
- Programmatic feedback response submission (bypass CLI/manual interaction).
- Supports valid responses, invalid `selectedOptionIds`, multi-select on single-select questions, and cancellation.
- Supports concurrent response submission for idempotency testing.

## 3.3 Queue State Inspector
- Direct access to question queue ordering, inserted items, and mutation history.
- Ability to assert queue item positions after clarification insertion.

## 3.4 Observability Capture
- Test sink recording all:
  - emitted workflow events (state entries, transitions, question generation, responses),
  - prompt template IDs used per copilot delegation,
  - schema validation outcomes,
  - delegated child planning-step events after the prompt-layer sweep.

---

## 4) Integration Test Catalog

## ITX-SD-001: Schema validation failure modes per FSM state
**Why not E2E-only:** requires injecting schema-invalid structured output for each specific state.

**Setup**
- Configure copilot prompt stub to return:
  - non-JSON output (for `B-SD-SCHEMA-002`),
  - valid JSON that does not match state schema (for `B-SD-SCHEMA-003`),
  - for each of: `IntegrateIntoSpec`, every scoped `LogicalConsistencyCheckCreateFollowUpQuestions` child stage schema, `ClassifyCustomPrompt`, `ExpandQuestionWithClarification`.

**Assertions**
- Non-JSON output fails the run with parse error details.
- Schema-mismatched JSON fails the run with schema-validation error including expected schema identifier.
- For scoped consistency layers, the error identifies the concrete stage schema rather than only the broad child aggregate contract.
- No partial state mutation persists after schema failure.
- Failed state is identifiable from error context.

**Related behaviors:** `B-SD-SCHEMA-001`, `B-SD-SCHEMA-002`, `B-SD-SCHEMA-003`.

## ITX-SD-002: Question queue ordering determinism and stability
**Why not E2E-only:** requires direct queue state inspection and retry/recovery simulation.

**Setup**
- Configure consistency check to return multiple follow-up questions with known `questionId` values.
- Run workflow through queue processing.
- Simulate retry/recovery at queue mid-point.

**Assertions**
- Queue order matches deterministic `questionId` ordering.
- Queue order is identical after retry/recovery.
- No question reordering or duplication after recovery.

**Related behaviors:** `B-SD-QUEUE-001`, `B-SD-TRANS-004`.

## ITX-SD-003: Custom prompt classification routing matrix
**Why not E2E-only:** requires combinatorial coverage of classification outcomes across queue states.

**Setup**
- Configure copilot prompt stub to return `clarifying-question`, `unrelated-question`, and `custom-answer` intent for different responses.
- Exercise all classification paths with queue items remaining and queue exhausted.

**Assertions**
- `clarifying-question` and `unrelated-question` route to `ExpandQuestionWithClarification` then back to `NumberedOptionsHumanRequest`.
- `custom-answer` buffers response and routes to `NumberedOptionsHumanRequest`.
- Custom text classification takes precedence over direct queue self-loop evaluation.
- Buffered custom-answers are present in accumulated answers at queue exhaustion.
- Question intents defer the source question unless it already has a valid answer.
- Deferred question intent paths preserve revisit precedence over older unresolved queue items.
- Classification uses schema-validated `structuredOutput.intent` as sole routing authority.

**Related behaviors:** `B-SD-TRANS-005`, `B-SD-TRANS-008`, `B-SD-TRANS-009`, `B-SD-TRANS-013`, `B-SD-QUEUE-005`.

## ITX-SD-005: Clarification insertion ordering correctness
**Why not E2E-only:** requires direct queue position inspection after insertion.

**Setup**
- Configure queue with items [Q1, Q2, Q3].
- During Q1 processing, user provides clarifying question.
- `ExpandQuestionWithClarification` generates Q1-follow-up.

**Assertions**
- Q1-follow-up is inserted immediately after Q1 (becomes next item).
- Queue order after insertion is [Q1 (answered or deferred), Q1-follow-up, Q2, Q3].
- Q1-follow-up has a new `questionId` distinct from Q1.
- Q1-follow-up conforms to server-owned base `numbered-question-item.schema.json`.
- Q1-follow-up has `kind: "issue-resolution"`.
- Original Q1 text/options are unchanged (immutability).
- If Q1 was deferred rather than answered, it is revisited after the Q1-follow-up chain completes.

**Related behaviors:** `B-SD-QUEUE-002`, `B-SD-QUEUE-003`, `B-SD-TRANS-010`, `B-SD-TRANS-013`, `B-SD-SCHEMA-005`.

## ITX-SD-004: Research-only clarification resolution
**Why not E2E-only:** requires direct inspection of deferred-question state and absence of inserted follow-up items.

**Setup**
- Configure queue with items [Q1, Q2].
- During Q1 processing, user provides clarifying or unrelated research text without answering Q1.
- `ExpandQuestionWithClarification` returns a research summary and no `followUpQuestion`.

**Assertions**
- No new queue item is inserted.
- A research log/observability entry is recorded.
- Workflow transitions back to `NumberedOptionsHumanRequest`.
- Q1 remains pending and is revisited before advancing permanently to Q2.
- `structuredOutput.researchOutcome === "resolved-with-research"` is the sole branch selector.
- Research-only outcomes are persisted in `researchNotes[]` rather than normalized integration answers.

**Related behaviors:** `B-SD-TRANS-010`, `B-SD-TRANS-014`.

## ITX-SD-006: Completion confirmation validation permutations
**Why not E2E-only:** requires combinatorial coverage of valid/invalid completion responses.

**Setup**
- Configure delegated child output to return empty `actionableItems` and empty `followUpQuestions` so workflow logic synthesizes a completion-confirmation question.
- Submit responses with: exactly one option (valid), zero options, multiple options, non-existent option IDs.

**Assertions**
- Exactly one valid option transitions to `Done`.
- Zero options returns `400` and keeps feedback `awaiting_response`.
- Multiple options returns `400` and keeps feedback `awaiting_response`.
- Non-existent option IDs return `400`.
- No transition to `Done` occurs for invalid submissions.

**Related behaviors:** `B-SD-HFB-002`, `B-SD-HFB-003`, `B-SD-TRANS-007`.

## ITX-SD-007: IntegrateIntoSpec input normalization across passes
**Why not E2E-only:** requires direct inspection of constructed input contract across multiple passes.

**Setup**
- Run workflow through:
  - initial pass,
  - subsequent feedback-driven pass,
  - immediate-action pass triggered by delegated child output with non-empty `actionableItems`.
- Inspect `IntegrateIntoSpecInput` for each invocation.

**Assertions**
- First pass: `source === "workflow-input"`, `answers` absent/empty, fields from `SpecDocGenerationInput`.
- Second pass: `source === "numbered-options-feedback"`, `answers` contains normalized records, `specPath` references prior draft.
- Immediate-action pass: `source === "consistency-action-items"`, `actionableItems` are forwarded unchanged and in child-provided order, and `specPath` references the prior draft.
- All normalized answer records include `questionId`, `selectedOptionIds`, optional `text`, `answeredAt`.
- Prior decisions preserved unless explicitly overridden by newer answers.

**Related behaviors:** `B-SD-INPUT-001`, `B-SD-INPUT-002`, `B-SD-INPUT-003`, `B-SD-INPUT-004`, `B-SD-TRANS-006`.

## ITX-SD-008: Recovery of interrupted question queue processing
**Why not E2E-only:** requires synthetic crash/restart during queue mid-processing.

**Setup**
- Start workflow, reach `NumberedOptionsHumanRequest` with multi-item queue.
- Simulate crash after answering first question but before launching feedback for second.
- Recover and resume.

**Assertions**
- Recovery restores queue state with first answer recorded and remaining questions pending.
- No duplicate feedback child runs for already-answered questions.
- Queue ordering is preserved after recovery.
- Loop counter is accurate post-recovery.
- Workflow completes correctly after recovery.

**Related behaviors:** `B-SD-HFB-001`, `B-SD-QUEUE-001`, `B-SD-QUEUE-004`, system-level `B-LIFE-007`.

## ITX-SD-009: Copilot prompt failure propagation per FSM state
**Why not E2E-only:** requires failure injection at each specific state's copilot delegation.

**Setup**
- Configure copilot prompt stub to fail at each state:
  - `IntegrateIntoSpec`,
  - `LogicalConsistencyCheckCreateFollowUpQuestions`,
  - `ClassifyCustomPrompt`,
  - `ExpandQuestionWithClarification`.

**Assertions**
- Parent run fails with error context identifying the FSM state where failure occurred.
- `child.failed` event linked in parent stream.
- No partial/corrupted state persists after copilot failure.
- Error payload includes sufficient diagnostic information (state, template ID, error details).

**Related behaviors:** `B-SD-FAIL-001`, `B-SD-COPILOT-001`, `B-SD-COPILOT-002`.

## ITX-SD-010: Question immutability enforcement
**Why not E2E-only:** requires direct state inspection to verify question text/options are unchanged.

**Setup**
- Issue a question, receive a question intent classification that produces a follow-up.
- Verify original question after `ExpandQuestionWithClarification` creates a follow-up.

**Assertions**
- Original question `prompt`, `options`, and `questionId` are unchanged.
- Follow-up question has a distinct `questionId`.
- No mutation events or state changes on the original question record.

**Related behaviors:** `B-SD-QUEUE-002`.

## ITX-SD-011: Numbered question item schema compliance for generated questions
**Why not E2E-only:** requires direct schema validation of all generated question items across states.

**Setup**
- Run workflow through consistency check and clarification expansion.
- Collect all generated question items.

**Assertions**
- All consistency-check questions conform to `numbered-question-item.schema.json`.
- Option IDs are unique contiguous integers starting at `1` per question.
- Each option includes `description` with pros/cons content.
- Each consistency-check question has `kind: "issue-resolution"`.
- Stage-specific consistency schemas and the final planned child aggregate both preserve the same numbered-question item contract.
- Completion-confirmation question is synthesized in workflow logic when delegated child output has empty `actionableItems` and empty `followUpQuestions`.
- Clarification follow-up questions conform to server-owned base schema plus `kind: "issue-resolution"`.

**Related behaviors:** `B-SD-SCHEMA-004`, `B-SD-SCHEMA-005`, `B-SD-SCHEMA-006`.

## ITX-SD-012: Prompt template ID traceability and research observability
**Why not E2E-only:** requires direct inspection of observability events for template metadata and research-only log payloads.

**Setup**
- Run workflow through multiple states with copilot delegation.
- Capture all observability events.

**Assertions**
- Each copilot delegation event includes the prompt template ID (e.g., `spec-doc.integrate.v1`, `spec-doc.consistency-scope-objective.v1`, `spec-doc.consistency-resolution.v1`, `spec-doc.classify-custom-prompt.v1`, `spec-doc.expand-clarification.v1`).
- Template IDs are stable and match documented identifiers from section 7.2 of the workflow spec.
- Each scoped consistency template is paired with its matching narrow `consistency-*-output.schema.json` file, and no scoped layer delegates with the broad aggregate `consistency-check-output.schema.json` as its prompt-layer `outputSchema`.
- The delegated child planning step delegates exactly once with `spec-doc.consistency-resolution.v1` and `consistency-check-output.schema.json` after the final prompt-layer event.
- Template ID is present in both event payloads and structured log records.
- Research-only clarification outcomes emit `spec-doc.research.logged` with the same prompt-template traceability as the originating clarification delegation.
- Delegated child-workflow events for `LogicalConsistencyCheckCreateFollowUpQuestions` include `childWorkflowType`.
- Prompt-layer events include `stageId` and preserve execution order.
- Every configured prompt layer is externally observable exactly once per pass before the delegated child planning step completes.

**Related behaviors:** `B-SD-OBS-002`, `B-SD-OBS-003`, `B-SD-COPILOT-003`, `B-SD-CHILD-001`, `B-SD-CHILD-001B`.

## ITX-SD-013: LogicalConsistencyCheckCreateFollowUpQuestions routes from the child aggregate result
**Why not E2E-only:** requires verification of deterministic parent routing across child-result variations.

**Setup**
- Configure delegated child result variants with:
  - non-empty `actionableItems` and empty `followUpQuestions`,
  - non-empty `actionableItems` and non-empty `followUpQuestions`,
  - empty `actionableItems` and non-empty `followUpQuestions`,
  - empty `actionableItems` and empty `followUpQuestions`.

**Assertions**
- Transition is to `IntegrateIntoSpec` when child output has non-empty `actionableItems`.
- Transition is still to `IntegrateIntoSpec` when child output has both non-empty `actionableItems` and non-empty `followUpQuestions`.
- Mixed aggregate follow-up questions are not enqueued for that pass.
- Transition is to `NumberedOptionsHumanRequest` when child output has empty `actionableItems`.
- No direct transition to `Done` or any other state.
- If child output has empty `actionableItems` and empty `followUpQuestions`, workflow logic synthesizes one completion-confirmation question with explicit "spec is done" option.

**Related behaviors:** `B-SD-TRANS-003`, `B-SD-TRANS-011`, `B-SD-CHILD-004`, `B-SD-DONE-001`.

## ITX-SD-015: Deferred revisit feedback attempts and idempotency keys
**Why not E2E-only:** requires direct inspection of child-launch metadata across defer/revisit cycles.

**Setup**
- Configure a numbered question to be deferred by custom text classified as `clarifying-question` or `unrelated-question`.
- Revisit the same source `questionId` after the research detour completes.
- Capture feedback child-launch metadata for both the original ask and the revisit.

**Assertions**
- The revisit launches a fresh `server.human-feedback.v1` child run for the same `questionId`.
- The per-question feedback attempt counter increments before the revisit launch.
- The revisit idempotency key differs from the original ask by incrementing the `attempt-{feedbackAttempt}` component while preserving run, pass, and `questionId` identity.
- The revisit does not replay the previously responded child result.

**Related behaviors:** `B-SD-HFB-001`, `B-SD-HFB-005`, `B-SD-TRANS-013`, `B-SD-TRANS-015`.

## ITX-SD-016: Delegated child contract enforcement, full-sweep coverage, and resolution-planning behavior
**Why not E2E-only:** requires controlled multi-layer child outputs, explicit contract-violation injection, and direct verification of post-sweep planning.

**Setup**
- Configure delegated child workflow layers to exercise:
  - early non-empty `actionableItems` followed by later configured layers,
  - duplicate `itemId` or `questionId` across executed layers,
  - mixed non-empty `actionableItems` and `followUpQuestions` in one layer,
  - earlier-stage `followUpQuestions` followed by later-stage `actionableItems` in the final planning result.

**Assertions**
- When an early layer emits non-empty `actionableItems`, later configured layers still execute and `PlanResolution` remains the only child step that authors the final aggregate result.
- Duplicate ids across executed layers fail the child run before any parent transition is chosen.
- Mixed actionable/question output within a single stage fails the child run before any parent transition is chosen.
- A final aggregate that contains earlier-stage `followUpQuestions` plus later-stage `actionableItems` does not fail solely for being mixed.
- When that valid mixed aggregate occurs, the parent prioritizes `IntegrateIntoSpec` and does not enter `NumberedOptionsHumanRequest` for that pass.
- Failure diagnostics identify the child contract violation and relevant stage context.
- Resolution-planning input reflects the full-sweep stage coverage rather than only a prefix of stages.

**Related behaviors:** `B-SD-CHILD-001`, `B-SD-CHILD-001B`, `B-SD-CHILD-002`, `B-SD-CHILD-003`, `B-SD-CHILD-004`, `B-SD-FAIL-001`.

## ITX-SD-017: Delegated child explicit-state self-loop progression
**Why not E2E-only:** requires inspection of child-workflow runtime state transitions or harness-visible child-state progression.

**Setup**
- Use the delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` with at least three configured prompt layers.
- Provide stage outputs that exercise:
  - one or more self-loop iterations with empty `actionableItems`,
  - termination at the last stage with `followUpQuestions`,
  - non-empty `actionableItems` before the last stage while still requiring the remaining stages and `PlanResolution` to run.

**Assertions**
- Child workflow transitions `start -> ExecutePromptLayer` exactly once at the beginning of a run.
- Each `ExecutePromptLayer` state entry executes exactly one configured prompt layer.
- When more stages remain, `ExecutePromptLayer` transitions to itself with incremented `stageIndex`.
- When the final stage completes, child transitions from `ExecutePromptLayer` to `PlanResolution`.
- `PlanResolution` executes exactly once and transitions to `Done` with the final aggregate result.

**Related behaviors:** `B-SD-CHILD-001A`, `B-SD-CHILD-001B`, `B-SD-OBS-003`.

## ITX-SD-014: Done state invariants hold across all paths
**Why not E2E-only:** requires exhaustive path verification for terminal state reachability.

**Setup**
- Exercise all paths to `Done`:
  - single-loop completion confirmation,
  - multi-loop with feedback then completion confirmation,
  - path through custom prompt classification then completion.

**Assertions**
- `Done` is reached only from `NumberedOptionsHumanRequest` in all tested paths.
- Terminal output satisfies: `status === "completed"`, `specPath` ends with `.md`, `summary.unresolvedQuestions === 0`.
- `artifacts.integrationPasses` and `artifacts.consistencyCheckPasses` are accurate per path.
- Deferred source questions block both `Done` and `IntegrateIntoSpec` routing until the deferred stack is empty.

**Related behaviors:** `B-SD-DONE-001`, `B-SD-DONE-002`, `B-SD-DONE-003`.

---

## 5) Integration vs E2E Ownership Matrix

## 5.1 Integration-Primary
- ITX-SD-001, 002, 004, 005, 007, 008, 010, 011, 012, 013, 014, 015, 016, 017.

## 5.2 Shared Coverage (Integration + E2E)
- ITX-SD-003, 006, 009.

## 5.3 E2E/System-Owned Coverage (Intentional)
- `B-SD-TRANS-001` and `B-SD-TRANS-002` are primarily covered by golden-path E2E (`GS-SD-001`, `GS-SD-002`) and server run-start/transition behavior suites.
- `B-SD-HFB-004` is primarily covered by server boundary/contract tests plus E2E child-launch contract assertions.
- `B-SD-OBS-001` is shared: end-to-end scenarios prove production parity while ITX-SD-004/012 cover deterministic research-only observability details.
- `B-SD-FAIL-002` is primarily covered by server lifecycle/cancellation integration tests and spec-doc E2E cancellation scenarios.

Guideline:
- Keep one happy-path proof in E2E.
- Put exhaustive edge matrix, schema failure, queue manipulation, and recovery coverage in integration.

---

## 6) Recommended Test Structure

- `packages/workflow-app-builder/test/integration/...`
  - FSM transitions, schema validation, queue processing, loop accounting.
- `packages/workflow-app-builder/test/workflows/...`
  - Workflow-level unit/integration tests for individual state handlers.
- `packages/workflow-server/test/integration/...`
  - Feedback API integration with spec-doc workflow, recovery behavior.

Naming convention:
- `itx.<domain>.<behavior-id>.spec.ts`
- Example: `itx.spec-doc.ITX-SD-005.spec.ts`

---

## 7) Exit Criteria for Spec-Doc Integration Suite

Integration suite is complete when:
1. All integration-primary tests pass deterministically in CI with copilot prompt test doubles.
2. Schema validation failure tests cover all FSM states that delegate to copilot prompt.
3. Question queue manipulation tests verify ordering, insertion, immutability, and recovery.
4. Loop counter boundary tests are exact and reproducible.
5. Custom prompt classification routing covers all three intents with queue in various states.
6. Every integration-primary test maps to one or more `B-SD-*` behavior IDs from `spec-doc-behaviors.md`.

---

## 8) Implementation Notes

- Use deterministic copilot prompt doubles — never depend on real AI model output for integration tests.
- Prefer barrier/latch synchronization over arbitrary delays for recovery tests.
- Fail fast on missing required event fields or unexpected state transitions.
- Capture full diagnostics on failure: FSM state timeline, question queue snapshot, event stream, and copilot call log.
- Keep integration tests hermetic: no dependency on external services beyond test-local Postgres container.
