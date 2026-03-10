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

## B-SD-TRANS-003: LogicalConsistencyCheckCreateFollowUpQuestions routes from the child aggregate result
**Given** run is in `LogicalConsistencyCheckCreateFollowUpQuestions`
**When** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` completes with a valid aggregate result
**Then** parent routing waits for the delegated child's full-sweep `PlanResolution` output rather than any prefix of per-stage results
**Then** the parent transitions to `IntegrateIntoSpec` when `actionableItems` is non-empty and `followUpQuestions` is empty
**And** if the child aggregate contains both non-empty `actionableItems` and non-empty `followUpQuestions`, the parent transitions to `NumberedOptionsHumanRequest`, enqueues the follow-up questions, and stashes the actionable items in workflow state for later delivery to `IntegrateIntoSpec` after queue exhaustion
**And** the parent transitions to `NumberedOptionsHumanRequest` when `actionableItems` is empty
**And** `followUpQuestions` from the child result populate the question queue whenever present (non-empty), regardless of whether `actionableItems` is also non-empty
**And** stashed `actionableItems` from a mixed aggregate are delivered alongside collected answers to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"` after queue exhaustion
**And** if child output has empty `actionableItems` and empty `followUpQuestions`, workflow logic synthesizes one completion-confirmation question with an explicit "spec is done" option
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
**Then** the workflow logs or reuses the research answer
**And** transitions to `NumberedOptionsHumanRequest`
**And** resumes at the deferred source question rather than skipping it permanently
**And** if the same source question asks the same normalized research question again, the workflow reuses the cached research note instead of delegating duplicate research

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

## B-SD-TRANS-011: Empty child result synthesizes completion-confirmation question
**Given** `LogicalConsistencyCheckCreateFollowUpQuestions` child output has empty `actionableItems` and empty `followUpQuestions`
**When** workflow prepares queue payload before routing to `NumberedOptionsHumanRequest`
**Then** workflow logic synthesizes exactly one `completion-confirmation` question
**And** the synthesized question includes an explicit "spec is done" choice
**And** `blockingIssues` is empty

## B-SD-CHILD-001: Delegated child completes a full prompt-layer sweep before final planning
**Given** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` is executing prompt layers in order
**When** one or more earlier prompt layers return `actionableItems`
**Then** later configured prompt layers still execute in that same child run
**And** every configured prompt layer executes exactly once before final planning
**And** the child does not return the parent-facing aggregate result until the planning step completes

## B-SD-CHILD-001A: Delegated child executes one prompt layer per self-loop state entry and then plans once
**Given** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` uses explicit workflow states
**When** child execution begins
**Then** `start` initializes child state data and transitions to `ExecutePromptLayer`
**And** each entry to `ExecutePromptLayer` executes exactly one configured prompt layer
**And** if additional prompt layers remain, `ExecutePromptLayer` transitions to itself with the next `stageIndex`
**And** after the final prompt layer completes, the child transitions to `PlanResolution`
**And** `PlanResolution` executes exactly once and transitions to `Done`

## B-SD-CHILD-001B: PlanResolution is the sole author of the final child aggregate
**Given** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` has completed the prompt-layer sweep
**When** `PlanResolution` runs
**Then** it delegates to `app-builder.copilot.prompt.v1` with `consistency-check-output.schema.json`
**And** it uses the full-sweep aggregate as its planning input
**And** the parent consumes only the schema-validated `PlanResolution` output rather than any per-stage output directly

## B-SD-CHILD-002: Delegated child deduplicates cross-stage ids and logs
**Given** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` executes multiple prompt layers
**When** duplicate `itemId` or duplicate `questionId` values appear across executed layer outputs
**Then** the first occurrence is kept in the aggregate and the later duplicate is silently dropped
**And** a warn-level `consistency.duplicate-skipped` log event is emitted for each dropped duplicate
**And** the log event identifies the `stageId` that produced the duplicate, the duplicate id value, and the `stageId` that originally produced the kept entry
**And** the child run continues executing remaining configured prompt layers and proceeds to `PlanResolution`
**And** the deduplicated aggregate is available for the planning step

## B-SD-CHILD-003: Delegated child rejects stage-local mixed actionable and follow-up output
**Given** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` receives a schema-valid layer output
**When** that single layer output contains both non-empty `actionableItems` and non-empty `followUpQuestions`
**Then** the child run fails explicitly before returning an aggregate result
**And** the parent workflow does not branch from the invalid mixed result

## B-SD-CHILD-004: Delegated child preserves mixed aggregate outcomes across executed stages
**Given** delegated child workflow `app-builder.spec-doc.consistency-follow-up.v1` executes one or more stages that emit `followUpQuestions`
**When** a later executed stage emits one or more `actionableItems`
**Then** the full-sweep planning result may contain both non-empty `actionableItems` and non-empty `followUpQuestions`
**And** remaining later prompt layers still execute before `PlanResolution`
**And** the parent transitions to `NumberedOptionsHumanRequest` to resolve the follow-up questions first, stashing actionable items for later delivery to `IntegrateIntoSpec`

---

## 3) Human Feedback Integration Behaviors

## B-SD-HFB-001: One feedback child run per queue item
**Given** `NumberedOptionsHumanRequest` state with a question queue
**When** processing each queue item
**Then** exactly one `server.human-feedback.v1` child run is launched per queue item (no batching)
**And** `HumanFeedbackRequestInput.questionId` matches the queue item's stable `questionId`
**And** `human_feedback_requests.question_id` projection stores the same value
**And** the idempotency key includes both the consistency-check pass number and the per-question feedback attempt number (`spec-doc:feedback:{runId}:{questionId}:pass-{consistencyCheckPasses}:attempt-{feedbackAttempt}`) to prevent cached responses from prior passes or deferred re-asks being replayed for structurally identical questions

## B-SD-HFB-005: Deferred revisits create a fresh feedback request
**Given** a numbered question was deferred because custom text was classified as `clarifying-question` or `unrelated-question`
**When** the workflow later revisits that same `questionId`
**Then** the per-question feedback attempt counter has incremented
**And** the revisit launches a fresh `server.human-feedback.v1` child run instead of replaying the previous responded child
**And** the user is asked again even when the consistency-check pass number is unchanged

## B-SD-HFB-002: Invalid selectedOptionIds do not record an answer
**Given** a pending feedback request with defined option IDs `[1, 2, 3]`
**When** response includes `selectedOptionIds` not in `[1, 2, 3]`
**Then** feedback API returns `400` and feedback status remains `awaiting_response`
**And** no answer is recorded in workflow state data
**And** question remains pending until valid response

## B-SD-HFB-003: Completion confirmation allows text-only responses but never multi-select
**Given** a completion-confirmation question
**When** response includes non-empty `text` and zero `selectedOptionIds`
**Then** the response is accepted as a non-terminal answer and no transition to `Done` occurs
**When** response includes multiple `selectedOptionIds`
**Then** feedback API returns `400` validation error
**And** feedback status remains `awaiting_response`

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
**And** each executed child prompt layer for `LogicalConsistencyCheckCreateFollowUpQuestions` validates against its matching stage-specific `consistency-*-output.schema.json`
**And** the final `PlanResolution` child aggregate validates against `consistency-check-output.schema.json` before the parent consumes it
**And** `ClassifyCustomPrompt` validates against `custom-prompt-classification-output.schema.json`
**And** `ExpandQuestionWithClarification` validates against `clarification-follow-up-output.schema.json`
**And** `Done` terminal payload validates against `spec-doc-generation-output.schema.json`

## B-SD-SCHEMA-001A: Scoped consistency stage schemas exclude unrelated checklist fields
**Given** a configured prompt layer in `CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS`
**When** its `outputSchema` is selected for copilot delegation
**Then** the schema exposes only that layer's owned `readinessChecklist` keys
**And** unrelated checklist fields from other consistency layers are not required or accepted for that stage
**And** shared issue, actionable-item, and follow-up-question definitions are still reused across all stage schemas

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
**Given** a stage-specific consistency output or final child aggregate with `followUpQuestions`
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
**And** the `Pros:` / `Cons:` requirement is enforced at the JSON Schema level via a `pattern` constraint in `numbered-question-item.schema.json` and `clarification-follow-up-output.schema.json`
**And** `app-builder.copilot.prompt.v1`'s in-session schema retry loop catches violations before the output reaches workflow-level contract validation
**And** prompt templates restate the `Pros:` / `Cons:` requirement as explicit model guidance to maximize first-attempt compliance

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
**And** each scoped consistency template is paired with its matching narrow stage schema rather than the broad aggregate child schema
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
**Given** delegated child output for `LogicalConsistencyCheckCreateFollowUpQuestions` has empty `actionableItems` and multiple `followUpQuestions`
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
  - latest delegated child result contains zero actionable items requiring immediate integration
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

## B-SD-INPUT-004: Immediate-action passes use consistency-action-items source
**Given** delegated child output from `LogicalConsistencyCheckCreateFollowUpQuestions` contains one or more `actionableItems` and zero `followUpQuestions`
**When** `IntegrateIntoSpec` input is constructed for the next pass
**Then** `source === "consistency-action-items"`
**And** `actionableItems` are passed unchanged and in child-provided order
**And** `specPath` points to the existing working draft from the prior integration pass

## B-SD-INPUT-005: Mixed-aggregate passes use consistency-action-items-with-feedback source
**Given** delegated child output from `LogicalConsistencyCheckCreateFollowUpQuestions` contained both `actionableItems` and `followUpQuestions`
**And** the follow-up questions have been answered via `NumberedOptionsHumanRequest`
**When** `IntegrateIntoSpec` input is constructed after queue exhaustion
**Then** `source === "consistency-action-items-with-feedback"`
**And** `actionableItems` are the stashed items from the consistency pass, passed unchanged and in child-provided order
**And** `answers` contains the normalized answer records collected during `NumberedOptionsHumanRequest`
**And** `specPath` points to the existing working draft from the prior integration pass

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
- delegated child workflow started/completed for `LogicalConsistencyCheckCreateFollowUpQuestions`,
- each consistency/follow-up prompt layer started/completed,
- child `PlanResolution` started/completed,
- question generated (numbered-options follow-up/confirmation),
- immediate actionable item generated,
- cross-stage duplicate `itemId` or `questionId` skipped during child stage-output merging (warn-level `consistency.duplicate-skipped`),
- user response received,
- spec integration pass completed,
- consistency-check outcome,
- custom prompt classification result,
- clarification follow-up generated,
- research-only clarification result logged,
- terminal completion or failure.

All events include `runId`, `workflowType`, `state`, and sequence ordering. Child-workflow events also include `childWorkflowType` and `stageId` when applicable.

## B-SD-OBS-002: Prompt template IDs are traceable in observability events
**Given** any copilot prompt delegation from this workflow
**When** the call is made
**Then** prompt template ID (e.g., `spec-doc.integrate.v1`) is included in observability events
**And** template IDs are stable and versioned for traceability

## B-SD-OBS-003: Child workflow observability includes child and stage metadata
**Given** `LogicalConsistencyCheckCreateFollowUpQuestions` launches delegated child workflow execution
**When** child-workflow or prompt-layer observability events are emitted
**Then** each child event includes `childWorkflowType`
**And** each prompt-layer event includes `stageId` when applicable
**And** prompt-layer events preserve execution order
**And** every configured prompt layer is externally observable once per pass before `PlanResolution`
**And** exactly one `PlanResolution` delegation is externally observable after each full prompt-layer sweep
**And** `PlanResolution` observability includes the child workflow type and prompt template metadata

---

## 11) End-to-End Golden Scenarios

## GS-SD-001: Happy path — single loop to completion
1. Start `app-builder.spec-doc.v1` with valid input.
2. `IntegrateIntoSpec` produces initial draft.
3. Delegated child workflow for `LogicalConsistencyCheckCreateFollowUpQuestions` returns empty `actionableItems` and empty `followUpQuestions`; workflow logic synthesizes completion-confirmation question.
4. User selects completion-confirmation option with exactly one selected option.
5. Run transitions to `Done`.

Must assert:
- Event stream shows `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → NumberedOptionsHumanRequest → Done`.
- One feedback child run launched.
- Terminal output satisfies contract.

## GS-SD-002: Multi-loop clarification to completion
1. Start workflow.
2. First delegated child run for `LogicalConsistencyCheckCreateFollowUpQuestions` returns empty `actionableItems` and multiple `followUpQuestions`.
3. User answers questions across multiple self-loops.
4. Queue exhaustion routes to `IntegrateIntoSpec` for second pass.
5. Second delegated child run returns empty `actionableItems` and empty `followUpQuestions`; workflow logic synthesizes completion-confirmation.
6. User confirms completion.

Must assert:
- Multiple feedback child runs (one per question).
- `IntegrateIntoSpec` called twice with different `source` values.
- All normalized answers present in second integration input.

## GS-SD-004: Immediate-action child result completes full sweep before returning to integration
1. Start workflow.
2. `IntegrateIntoSpec` produces initial draft.
3. Delegated child workflow for `LogicalConsistencyCheckCreateFollowUpQuestions` executes all configured prompt layers, then `PlanResolution` returns one or more `actionableItems` and zero `followUpQuestions`.
4. Parent transitions directly to `IntegrateIntoSpec` with `source: "consistency-action-items"`.
5. No `NumberedOptionsHumanRequest` state is entered for that pass.

Must assert:
- Event stream shows `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → IntegrateIntoSpec` for that pass, with child observability covering all configured prompt layers before `PlanResolution` completes.
- The delegated child emits exactly one `PlanResolution` step after the full-sweep prompt-layer coverage for that pass.
- Child `actionableItems` are forwarded unchanged and in order.
- No feedback child run launches for that pass.

## GS-SD-004A: Mixed-aggregate child result asks questions first then integrates both
1. Start workflow.
2. `IntegrateIntoSpec` produces initial draft.
3. Delegated child workflow for `LogicalConsistencyCheckCreateFollowUpQuestions` executes all configured prompt layers, then `PlanResolution` returns both non-empty `actionableItems` and non-empty `followUpQuestions`.
4. Parent transitions to `NumberedOptionsHumanRequest` and enqueues the follow-up questions. Actionable items are stashed in workflow state.
5. User answers all follow-up questions.
6. After queue exhaustion, parent transitions to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"` carrying both the stashed actionable items and the collected answers.

Must assert:
- Event stream shows `IntegrateIntoSpec → LogicalConsistencyCheckCreateFollowUpQuestions → NumberedOptionsHumanRequest → IntegrateIntoSpec` for that pass.
- The delegated child emits exactly one `PlanResolution` step after the full-sweep prompt-layer coverage.
- Feedback child runs are launched for each follow-up question.
- Stashed `actionableItems` are forwarded unchanged and in order to `IntegrateIntoSpec`.
- Collected `answers` from `NumberedOptionsHumanRequest` are included in the integration input.
- `source === "consistency-action-items-with-feedback"` on the integration input.

## GS-SD-003: Research-first custom prompt round trip
1. Start workflow and reach `NumberedOptionsHumanRequest`.
2. User provides custom prompt text with response.
3. `ClassifyCustomPrompt` classifies as `custom-answer`.
4. Answer is buffered; queue processing continues.
5. On another question, user provides research-style clarification text.
6. `ClassifyCustomPrompt` classifies as a question intent (`clarifying-question` or `unrelated-question`).
7. `ExpandQuestionWithClarification` performs research first and resolves without emitting a follow-up question.
8. The source numbered question is revisited before older queued items.
9. Workflow completes after the deferred question is answered.

Must assert:
- At least one question intent plus `custom-answer` are exercised.
- Custom-answer buffered and carried to `IntegrateIntoSpec`.
- Research-only clarification emits observability for the research result.
- No new follow-up question is inserted when research resolves the detour.
- The deferred source question is revisited before older queued items.

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

1. FSM state semantics (section 6.2) → `B-SD-TRANS-001..015`.
2. Transition rules and guards (section 6.3) → `B-SD-TRANS-001..015`, `B-SD-DONE-001`.
3. NumberedOptionsHumanRequest implementation (section 6.4) → `B-SD-HFB-001..005`, `B-SD-QUEUE-001..005`, `B-SD-TRANS-004..007`, `B-SD-TRANS-012..015`.
4. IntegrateIntoSpec input contract (section 6.5) → `B-SD-INPUT-001..005`.
5. Schema validation (section 7.1) → `B-SD-SCHEMA-001..006`.
   - `B-SD-SCHEMA-006` covers schema-level `Pros:` / `Cons:` pattern enforcement and copilot-prompt in-session retry integration.
6. Copilot prompt delegation (section 7) → `B-SD-COPILOT-001..005`, `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-CHILD-001B`, `B-SD-CHILD-002..004`.
   - `B-SD-CHILD-002` covers cross-stage deduplication with observability; duplicates are dropped and logged, not fatal.
7. Human feedback boundary (section 8) → `B-SD-HFB-004`.
8. Observability (section 9) → `B-SD-OBS-001..003`.
9. Completion criteria (section 10) → `B-SD-DONE-001..003`.
10. Failure/exit conditions (section 11) → `B-SD-FAIL-001..002`.

---

## 13) Exit Criteria

Spec-doc generation behaviors are considered complete when:
- All `B-SD-*` behaviors pass in CI with deterministic test doubles for copilot prompt.
- Golden scenarios `GS-SD-001` through `GS-SD-005` (including `GS-SD-004A`) pass reliably.
- Schema validation failures produce actionable error diagnostics.
- Human feedback integration exercises server-owned `server.human-feedback.v1` contract without transport coupling.
