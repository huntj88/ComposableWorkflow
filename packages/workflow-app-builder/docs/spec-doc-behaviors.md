# Spec-Doc Generation Workflow E2E Behaviors

This document defines **testable end-to-end behaviors** for the `app-builder.spec-doc.v1` workflow.

It is intended to be used as:
- an executable acceptance checklist for spec-doc generation,
- a source for integration/E2E test implementation,
- a contract between `workflow-app-builder`, `workflow-lib`, `workflow-server`, and `app-builder.copilot.prompt.v1`.

Primary source: `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`.
System-level behavior catalog: `packages/workflow-server/docs/behaviors.md`.

---

## 1) Test Conventions

## 1.1 Environment Baseline
- Server running with Postgres (`postgresql://workflow:workflow@localhost:5432/workflow`).
- `workflow-app-builder` package loaded with `app-builder.spec-doc.v1` registered.
- `app-builder.copilot.prompt.v1` available (real or deterministic test double).
- `server.human-feedback.v1` available (server-owned).
- Test fixtures include:
  - minimal valid `SpecDocGenerationInput`,
  - input with constraints and `targetPath`,
  - input that triggers multi-loop clarification,
  - input that triggers immediate completion confirmation.

## 1.2 Assertion Types
Each behavior should validate all relevant dimensions:
1. **API contract** (run summary, events, child linkage).
2. **FSM correctness** (state transitions match guards, no phantom transitions).
3. **Schema validation** (`structuredOutput` validated against state-specific schemas).
4. **Event stream** (event type, ordering, sequence monotonicity, parent/child linkage).
5. **Observability** (events emitted for state entries, question generation, responses, integration passes).

## 1.3 Behavior ID Scheme
- `B-SD-*` prefix for all spec-doc generation behaviors.
- References to system-level behaviors use `B-*` IDs from `packages/workflow-server/docs/behaviors.md`.

---

## 2) FSM State Transition Behaviors

## B-SD-TRANS-001: Workflow start routes to IntegrateIntoSpec
**Given** valid `SpecDocGenerationInput` with `request` field
**When** `app-builder.spec-doc.v1` run starts
**Then** initial state is `IntegrateIntoSpec`
**And** `workflow.started` and `state.entered` for `IntegrateIntoSpec` appear in events
**And** `IntegrateIntoSpecInput` has `source: "workflow-input"` with workflow input fields

## B-SD-TRANS-002: IntegrateIntoSpec transitions to LogicalConsistencyCheckCreateFollowUpQuestions
**Given** run is in `IntegrateIntoSpec` and integration pass completes
**When** `app-builder.copilot.prompt.v1` returns valid `spec-integration-output.schema.json` output
**Then** `transition.completed` to `LogicalConsistencyCheckCreateFollowUpQuestions` appears
**And** `state.entered` for `LogicalConsistencyCheckCreateFollowUpQuestions` appears
**And** `specPath` from integration output is carried forward in workflow state

## B-SD-TRANS-003: LogicalConsistencyCheckCreateFollowUpQuestions always transitions to NumberedOptionsHumanRequest
**Given** run is in `LogicalConsistencyCheckCreateFollowUpQuestions`
**When** consistency check completes with `consistency-check-output.schema.json` output
**Then** transition is always to `NumberedOptionsHumanRequest` (fixed workflow logic, not model-selected)
**And** `followUpQuestions` from output populate the question queue when present
**And** if output `followUpQuestions` is empty, workflow logic synthesizes one completion-confirmation question with an explicit "spec is done" option
**And** `LogicalConsistencyCheckCreateFollowUpQuestions` never transitions directly to `Done`

## B-SD-TRANS-004: NumberedOptionsHumanRequest self-loops for remaining queued questions
**Given** question queue has multiple items and current response has no custom prompt text
**When** user responds to current question with valid `selectedOptionIds`
**Then** response is recorded as normalized answer in state data
**And** run transitions to `NumberedOptionsHumanRequest` (self-loop) for the next queue item
**And** clarification-loop counter increments

## B-SD-TRANS-005: NumberedOptionsHumanRequest routes to ClassifyCustomPrompt on custom text
**Given** user response includes custom prompt `text` field
**When** response is received regardless of remaining queue items
**Then** run transitions to `ClassifyCustomPrompt` before evaluating queue continuation
**And** custom text classification takes precedence over direct queue self-loop

## B-SD-TRANS-006: NumberedOptionsHumanRequest routes to IntegrateIntoSpec on queue exhaustion with updates
**Given** question queue is exhausted and collected responses require spec updates
**When** no completion-confirmation was selected
**Then** run transitions to `IntegrateIntoSpec`
**And** `IntegrateIntoSpecInput` has `source: "numbered-options-feedback"` with accumulated `answers`

## B-SD-TRANS-007: NumberedOptionsHumanRequest routes to Done on completion confirmation
**Given** question queue is exhausted
**When** user selects completion-confirmation option with exactly one `selectedOptionId`
**Then** run transitions to `Done`
**And** terminal output satisfies `spec-doc-generation-output.schema.json`
**And** `status === "completed"`, `specPath` ends with `.md`, `summary.unresolvedQuestions === 0`

## B-SD-TRANS-008: ClassifyCustomPrompt routes to ExpandQuestionWithClarification on question intents
**Given** run is in `ClassifyCustomPrompt`
**When** `app-builder.copilot.prompt.v1` classifies intent as `clarifying-question` or `unrelated-question`
**Then** run transitions to `ExpandQuestionWithClarification`
**And** `structuredOutput.intent` is the single source of truth

## B-SD-TRANS-009: ClassifyCustomPrompt routes to NumberedOptionsHumanRequest on custom-answer
**Given** run is in `ClassifyCustomPrompt`
**When** `app-builder.copilot.prompt.v1` classifies intent as `custom-answer`
**Then** custom answer is buffered with current answer set
**And** run transitions to `NumberedOptionsHumanRequest` to continue queue processing

## B-SD-TRANS-010: ExpandQuestionWithClarification routes to NumberedOptionsHumanRequest
**Given** run is in `ExpandQuestionWithClarification`
**When** research is completed via `app-builder.copilot.prompt.v1`
**Then** either a new queue item with new `questionId` is inserted as immediate next question
**Or** a research-only answer is logged with no new queue item
**And** run transitions to `NumberedOptionsHumanRequest`
**And** `structuredOutput.researchOutcome` is the single source of truth for whether a follow-up question exists

## B-SD-TRANS-013: Research detours defer and revisit the source question
**Given** user custom text is classified as `clarifying-question` or `unrelated-question`
**When** the workflow leaves `NumberedOptionsHumanRequest` for `ExpandQuestionWithClarification`
**Then** the source numbered question is deferred unless it already has a valid answer
**And** any generated follow-up question is asked next
**And** the deferred source question is revisited after the inserted follow-up chain completes

## B-SD-TRANS-014: Research-only resolution resumes the deferred question
**Given** run is in `ExpandQuestionWithClarification`
**When** research finds no remaining ambiguity and generates no follow-up question
**Then** the workflow logs the research answer
**And** transitions to `NumberedOptionsHumanRequest`
**And** resumes at the deferred source question rather than skipping it permanently

## B-SD-TRANS-015: Deferred questions block terminal queue exhaustion
**Given** run re-enters `NumberedOptionsHumanRequest` with `queueIndex >= queue.length`
**When** one or more deferred source questions remain
**Then** the handler must revisit the most recently deferred source question
**And** must not transition to `Done` or `IntegrateIntoSpec` until the deferred-question stack is empty

## B-SD-TRANS-012: NumberedOptionsHumanRequest handles re-entry with exhausted queue
**Given** run re-enters `NumberedOptionsHumanRequest` from `ClassifyCustomPrompt` (custom-answer) or `ExpandQuestionWithClarification`
**When** `queueIndex >= queue.length` and no deferred source questions remain
**Then** handler does not fail
**And** if any answered item is completion-confirmation with done option selected, run transitions to `Done`
**And** otherwise run transitions to `IntegrateIntoSpec` with accumulated normalized answers

## B-SD-TRANS-011: Empty follow-up output synthesizes completion-confirmation question
**Given** `LogicalConsistencyCheckCreateFollowUpQuestions` output has empty `followUpQuestions`
**When** workflow prepares queue payload before routing to `NumberedOptionsHumanRequest`
**Then** workflow logic synthesizes exactly one `completion-confirmation` question
**And** the synthesized question includes an explicit "spec is done" choice
**And** `blockingIssues` is empty

---

## 3) Human Feedback Integration Behaviors

## B-SD-HFB-001: One feedback child run per queue item
**Given** `NumberedOptionsHumanRequest` state with a question queue
**When** processing each queue item
**Then** exactly one `server.human-feedback.v1` child run is launched per queue item (no batching)
**And** `HumanFeedbackRequestInput.questionId` matches the queue item's stable `questionId`
**And** `human_feedback_requests.question_id` projection stores the same value
**And** the idempotency key includes the consistency-check pass number (`spec-doc:feedback:{runId}:{questionId}:pass-{consistencyCheckPasses}`) to prevent cached responses from prior passes being replayed for structurally identical questions in later passes

## B-SD-HFB-002: Invalid selectedOptionIds do not record an answer
**Given** a pending feedback request with defined option IDs `[1, 2, 3]`
**When** response includes `selectedOptionIds` not in `[1, 2, 3]`
**Then** feedback API returns `400` and feedback status remains `awaiting_response`
**And** no answer is recorded in workflow state data
**And** question remains pending until valid response

## B-SD-HFB-003: Completion confirmation requires exactly one selected option
**Given** a completion-confirmation question
**When** response includes zero or multiple `selectedOptionIds`
**Then** feedback API returns `400` validation error
**And** feedback status remains `awaiting_response`
**And** no transition to `Done` occurs

## B-SD-HFB-004: Feedback child run uses server-owned contract only
**Given** `workflow-app-builder` workflow requesting feedback
**When** feedback child is launched
**Then** launch uses only the `server.human-feedback.v1` contract (`workflowType` + input/output shape)
**And** `workflow-app-builder` does not depend on internal feedback implementation modules

---

## 4) Schema Validation Behaviors

## B-SD-SCHEMA-001: Each state validates structuredOutput against its required schema
**Given** a copilot prompt call returns `structuredOutput`
**When** output is parsed for the current state
**Then** `IntegrateIntoSpec` validates against `spec-integration-output.schema.json`
**And** `LogicalConsistencyCheckCreateFollowUpQuestions` validates against `consistency-check-output.schema.json`
**And** `ClassifyCustomPrompt` validates against `custom-prompt-classification-output.schema.json`
**And** `ExpandQuestionWithClarification` validates against `clarification-follow-up-output.schema.json`
**And** `Done` terminal payload validates against `spec-doc-generation-output.schema.json`

## B-SD-SCHEMA-002: Non-JSON structuredOutput triggers retry then fails
**Given** `app-builder.copilot.prompt.v1` returns output that is not valid JSON
**When** output is parsed
**Then** copilot ACP execution is retried up to 3 total attempts (1 initial + 2 retries)
**And** each retry emits a warn-level log with the parse error from the previous attempt
**And** if all attempts produce non-JSON output, run transitions to terminal `failed` with parse error details

## B-SD-SCHEMA-003: Schema-valid JSON with wrong structure triggers retry then fails
**Given** `app-builder.copilot.prompt.v1` returns valid JSON that does not satisfy the state's required schema
**When** schema validation executes via Ajv2020 against the provided `outputSchema`
**Then** copilot ACP execution is retried up to 3 total attempts (1 initial + 2 retries)
**And** each retry emits a warn-level log with the schema-validation error from the previous attempt
**And** if all attempts fail schema validation, run transitions to terminal `failed` with schema-validation error details
**And** error includes the expected schema identifier and actual validation errors

## B-SD-SCHEMA-004: Numbered question items conform to schema
**Given** `consistency-check-output.schema.json` output with `followUpQuestions`
**When** questions are validated
**Then** each item conforms to `numbered-question-item.schema.json`
**And** each consistency-check question has `kind: "issue-resolution"`
**And** each question has a stable `questionId`, `prompt`, `options` with unique contiguous integer IDs starting at `1`
**And** completion-confirmation questions are synthesized by workflow logic (not required in consistency-check output)

## B-SD-SCHEMA-005: Clarification follow-up conforms to server-owned base schema
**Given** `ExpandQuestionWithClarification` produces a follow-up question
**When** question is validated
**Then** it conforms to server-owned `packages/workflow-server/docs/schemas/human-input/numbered-question-item.schema.json`
**And** workflow logic assigns `kind: "issue-resolution"` before queue insertion

## B-SD-SCHEMA-006: Numbered options include decision-support descriptions
**Given** any generated numbered question item for consistency-check or clarification follow-up
**When** options are validated for usability requirements
**Then** each option includes `description` text containing concise `Pros:` and `Cons:` guidance

---

## 5) Copilot Prompt Delegation Behaviors

## B-SD-COPILOT-001: All states delegate prompt execution to app-builder.copilot.prompt.v1
**Given** any state that requires AI-generated output
**When** the state handler executes
**Then** it delegates to `app-builder.copilot.prompt.v1` with appropriate `outputSchema`
**And** workflow does not re-implement Copilot ACP protocol details

## B-SD-COPILOT-002: Copilot prompt failure propagates with stage context
**Given** `app-builder.copilot.prompt.v1` child workflow fails
**When** failure is received by parent state
**Then** parent run fails with propagated error including the FSM state where failure occurred
**And** `child.failed` event appears with linked run metadata

## B-SD-COPILOT-003: Prompt template includes outputSchema for every delegation
**Given** any copilot prompt call from this workflow
**When** the call is constructed
**Then** `outputSchema` corresponding to the current state is always provided
**And** branching uses only schema-validated `structuredOutput` (not unstructured text)

## B-SD-COPILOT-004: Schema validation with auto-retry on copilot output
**Given** `app-builder.copilot.prompt.v1` returns `structuredOutput` with an `outputSchema` provided
**When** the output is received
**Then** `structuredOutput` is validated against the `outputSchema` using Ajv2020 before acceptance
**And** if validation fails (invalid JSON or schema mismatch), the entire copilot ACP execution is retried
**And** maximum total attempts is 3 (1 initial + 2 retries)
**And** each retry attempt emits a warn-level log with the validation error from the previous attempt
**And** if all attempts are exhausted, run fails with aggregated schema-validation error details

## B-SD-COPILOT-005: Default copilot prompt timeout is 20 minutes
**Given** `app-builder.copilot.prompt.v1` is invoked without explicit `timeoutMs`
**When** the copilot ACP execution runs
**Then** default timeout is 1,200,000 ms (20 minutes)
**And** timeout is configurable via `copilotPromptOptions.timeoutMs` in `SpecDocGenerationInput`
**And** copilot internal log output directory is configurable via `copilotPromptOptions.logDir` in `SpecDocGenerationInput`

---

## 6) Question Queue Processing Behaviors

## B-SD-QUEUE-001: Queue ordering is deterministic and stable
**Given** `LogicalConsistencyCheckCreateFollowUpQuestions` produces multiple follow-up questions
**When** questions enter the queue
**Then** ordering is deterministic by `questionId`
**And** ordering is stable across retries/recovery

## B-SD-QUEUE-002: Asked questions are immutable
**Given** a question has been issued to the user
**When** clarification is needed
**Then** a new question with a new `questionId` is appended
**And** the original question text/options are never mutated

## B-SD-QUEUE-003: Clarification follow-up inserts as immediate next queue item
**Given** `ExpandQuestionWithClarification` produces a follow-up question
**When** the question is inserted into the queue
**Then** it becomes the immediate next item (ahead of older unresolved items)
**And** no context switching to unrelated questions occurs before the clarification is resolved

## B-SD-QUEUE-004: Normalized answers accumulate across queue processing
**Given** multiple questions are answered across self-loop iterations
**When** queue is exhausted and transition to `IntegrateIntoSpec` occurs
**Then** all normalized answer records are available as `IntegrateIntoSpecInput.answers`
**And** each record includes `questionId`, `selectedOptionIds`, optional `text`, and `answeredAt`

## B-SD-QUEUE-005: Custom-answer text is buffered and carried into integration
**Given** `ClassifyCustomPrompt` classifies custom text as `custom-answer`
**When** queue is eventually exhausted
**Then** custom-answer text is included in accumulated answers for `IntegrateIntoSpec`
**And** buffered custom-answer is associated with the question it was provided for

---

## 7) Completion and Terminal State Behaviors

## B-SD-DONE-001: Done is reachable only from NumberedOptionsHumanRequest
**Given** any FSM execution path
**When** `Done` state is reached
**Then** the preceding state was `NumberedOptionsHumanRequest`
**And** no other state transitions directly to `Done`

## B-SD-DONE-002: Completion criteria are fully satisfied at Done
**Given** run transitions to `Done`
**When** terminal output is constructed
**Then** all completion criteria are met:
  - scope/objective section present
  - non-goals present
  - constraints/assumptions explicit
  - interfaces/contracts defined where needed
  - acceptance criteria testable
  - no unresolved blocking questions remain
  - user explicitly confirmed completion

## B-SD-DONE-003: Terminal output satisfies output contract
**Given** run reaches `Done`
**When** output is emitted
**Then** `status === "completed"`
**And** `specPath` ends with `.md`
**And** `summary.unresolvedQuestions === 0`
**And** `artifacts.integrationPasses` and `artifacts.consistencyCheckPasses` are accurate

---

## 8) Failure Behaviors

## B-SD-FAIL-001: Copilot prompt failure propagates with stage context
**Given** any delegated `app-builder.copilot.prompt.v1` call fails
**When** failure is handled
**Then** parent run fails with error context identifying the FSM state
**And** child failure events are linked in parent event stream

## B-SD-FAIL-002: Human feedback cancellation follows server lifecycle rules
**Given** a pending feedback request is cancelled (directly or via parent propagation)
**When** cancellation completes
**Then** run transitions to `failed` or `cancelled` according to server lifecycle rules
**And** `human-feedback.cancelled` event is emitted with linkage metadata

---

## 9) IntegrateIntoSpec Input Normalization Behaviors

## B-SD-INPUT-001: Initial pass uses workflow-input source
**Given** the first execution of `IntegrateIntoSpec`
**When** input is constructed
**Then** `source === "workflow-input"`
**And** `request`, `targetPath`, `constraints` come from `SpecDocGenerationInput`
**And** `answers` is absent or empty

## B-SD-INPUT-002: Subsequent passes use numbered-options-feedback source
**Given** `IntegrateIntoSpec` is re-entered after queue exhaustion
**When** input is constructed
**Then** `source === "numbered-options-feedback"`
**And** `answers` contains normalized answer records from the completed queue
**And** `specPath` points to the existing working draft from prior passes

## B-SD-INPUT-003: Prior accepted decisions are preserved unless overridden
**Given** an existing spec draft from a previous integration pass
**When** `IntegrateIntoSpec` runs with new answers
**Then** prior decisions remain unless explicitly overridden by newer answers
**And** updated spec reflects cumulative accepted decisions

---

## 10) Observability Behaviors

## B-SD-OBS-001: Events emitted for all major FSM operations
Per run, events must be emitted for:
- entering each FSM state (`state.entered`),
- question generated (numbered-options follow-up/confirmation),
- user response received,
- spec integration pass completed,
- consistency-check outcome,
- custom prompt classification result,
- clarification follow-up generated,
- terminal completion or failure.

All events include `runId`, `workflowType`, `state`, and sequence ordering.

## B-SD-OBS-002: Prompt template IDs are traceable in observability events
**Given** any copilot prompt delegation from this workflow
**When** the call is made
**Then** prompt template ID (e.g., `spec-doc.integrate.v1`) is included in observability events
**And** template IDs are stable and versioned for traceability

---

## 11) End-to-End Golden Scenarios

## GS-SD-001: Happy path — single loop to completion
1. Start `app-builder.spec-doc.v1` with valid input.
2. `IntegrateIntoSpec` produces initial draft.
3. `LogicalConsistencyCheckCreateFollowUpQuestions` finds no blocking issues and returns empty follow-up questions; workflow logic synthesizes completion-confirmation question.
4. User selects completion-confirmation option with exactly one selected option.
5. Run transitions to `Done`.

Must assert:
- Event stream shows `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → NumberedOptionsHumanRequest → Done`.
- One feedback child run launched.
- Terminal output satisfies contract.

## GS-SD-002: Multi-loop clarification to completion
1. Start workflow.
2. First consistency check finds blocking issues; generates multiple questions.
3. User answers questions across multiple self-loops.
4. Queue exhaustion routes to `IntegrateIntoSpec` for second pass.
5. Second consistency check returns no follow-up questions; workflow logic synthesizes completion-confirmation.
6. User confirms completion.

Must assert:
- Multiple feedback child runs (one per question).
- `IntegrateIntoSpec` called twice with different `source` values.
- All normalized answers present in second integration input.

## GS-SD-003: Custom prompt classification round trip
1. Start workflow and reach `NumberedOptionsHumanRequest`.
2. User provides custom prompt text with response.
3. `ClassifyCustomPrompt` classifies as `custom-answer`.
4. Answer is buffered; queue processing continues.
5. On another question, user provides clarifying question text.
6. `ClassifyCustomPrompt` classifies as `clarifying-question`.
7. `ExpandQuestionWithClarification` inserts follow-up as immediate next.
8. Follow-up is asked and answered; workflow completes.

Must assert:
- At least one question intent plus `custom-answer` are exercised.
- Custom-answer buffered and carried to `IntegrateIntoSpec`.
- Clarification follow-up inserted ahead of remaining queue items.
- New question has new `questionId` and conforms to schema.

## GS-SD-005: Copilot prompt workflow failure propagation
1. Start workflow.
2. `app-builder.copilot.prompt.v1` child fails during `IntegrateIntoSpec`.
3. Parent run fails with stage context.

Must assert:
- `child.failed` event linked in parent stream.
- Error context includes FSM state (`IntegrateIntoSpec`).
- No partial spec state persisted as completed.

---

## 12) Coverage Matrix (Spec Section → Behaviors)

1. FSM state semantics (section 6.2) → `B-SD-TRANS-001..011`.
2. Transition rules and guards (section 6.3) → `B-SD-TRANS-001..011`, `B-SD-DONE-001`.
3. NumberedOptionsHumanRequest implementation (section 6.4) → `B-SD-HFB-001..004`, `B-SD-QUEUE-001..005`, `B-SD-TRANS-004..007`.
4. IntegrateIntoSpec input contract (section 6.5) → `B-SD-INPUT-001..003`.
5. Schema validation (section 7.1) → `B-SD-SCHEMA-001..006`.
6. Copilot prompt delegation (section 7) → `B-SD-COPILOT-001..005`.
7. Human feedback boundary (section 8) → `B-SD-HFB-004`.
8. Observability (section 9) → `B-SD-OBS-001..002`.
9. Completion criteria (section 10) → `B-SD-DONE-001..003`.
10. Failure/exit conditions (section 11) → `B-SD-LOOP-001..002`, `B-SD-FAIL-001..002`.

---

## 13) Exit Criteria

Spec-doc generation behaviors are considered complete when:
- All `B-SD-*` behaviors pass in CI with deterministic test doubles for copilot prompt.
- Golden scenarios `GS-SD-001` through `GS-SD-005` pass reliably.
- Schema validation failures produce actionable error diagnostics.
- Human feedback integration exercises server-owned `server.human-feedback.v1` contract without transport coupling.
