# Spec-Doc Workflow Implementation Task Suite

This folder contains the ordered implementation plan for:
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`

## How to Execute This Plan

1. Execute tasks in dependency order, including alphanumeric follow-ons (`SDB-00` ... `SDB-16` -> `SDB-16A` -> `SDB-17` -> `SDB-18` -> `SDB-19`).
2. Do not start a task until every `Depends On` task is complete.
3. Keep all acceptance criteria in each task file satisfied before closing that task.
4. Treat each task’s `One-to-One Requirement Mapping` as mandatory scope.

## Execution Preconditions

- `server.human-feedback.v1` is available as a server-owned workflow contract before running integration/E2E suites for this plan.
- `app-builder.copilot.prompt.v1` is available in real runtime or deterministic test-double mode, depending on suite type.
- For black-box parity suites, run against a separately launched production server process using the commands defined in `spec-doc-integration-tests.md`.

## Dependency Graph (Acyclic)

- `SDB-00` -> none
- `SDB-01` -> `SDB-00`
- `SDB-02` -> `SDB-00`, `SDB-01`
- `SDB-03` -> `SDB-02`
- `SDB-04` -> `SDB-02`, `SDB-03`
- `SDB-05` -> `SDB-02`, `SDB-04`
- `SDB-06` -> `SDB-02`, `SDB-05`
- `SDB-07` -> `SDB-03`, `SDB-04`, `SDB-05`, `SDB-06`
- `SDB-08` -> `SDB-02`, `SDB-03`, `SDB-04`, `SDB-05`, `SDB-06`, `SDB-07`
- `SDB-09` -> `SDB-02`, `SDB-05`, `SDB-06`, `SDB-08`
- `SDB-10` -> `SDB-03`, `SDB-04`, `SDB-05`, `SDB-06`, `SDB-07`, `SDB-08`, `SDB-09`
- `SDB-11` -> `SDB-10`
- `SDB-12` -> `SDB-05`, `SDB-06`
- `SDB-13` -> `SDB-05`, `SDB-06`, `SDB-08`, `SDB-12`
- `SDB-14` -> `SDB-09`, `SDB-10`, `SDB-11`, `SDB-13`
- `SDB-15` -> `SDB-03`
- `SDB-16` -> `SDB-04`, `SDB-08`, `SDB-15`
- `SDB-16A` -> `SDB-16`
- `SDB-17` -> `SDB-09`, `SDB-10`, `SDB-11`, `SDB-14`, `SDB-16`, `SDB-16A`
- `SDB-18` -> `SDB-16`, `SDB-16A`, `SDB-17`
- `SDB-19` -> `SDB-16`, `SDB-16A`, `SDB-18`

No dependency points to a numerically later prerequisite outside this graph.

Delegated-child evolution chain:
- `SDB-16` -> delegated child baseline
- `SDB-16A` -> scoped prompt baseline replaces the former combined consistency prompt
- `SDB-17` -> parity and coverage on the scoped-prompt baseline
- `SDB-18` -> explicit child runtime states plus stage-specific schema ownership
- `SDB-19` -> supersession addendum for interpreting older completed task wording

## Task Index

- `SDB-00` [00-spec-doc-foundation-contracts.md](./00-spec-doc-foundation-contracts.md)
- `SDB-01` [01-prompt-template-delegation.md](./01-prompt-template-delegation.md)
- `SDB-02` [02-fsm-runtime-state-model.md](./02-fsm-runtime-state-model.md)
- `SDB-03` [03-integrate-into-spec-state.md](./03-integrate-into-spec-state.md)
- `SDB-04` [04-consistency-check-and-queue-synthesis.md](./04-consistency-check-and-queue-synthesis.md)
- `SDB-05` [05-numbered-options-human-request.md](./05-numbered-options-human-request.md)
- `SDB-06` [06-custom-prompt-routing-and-clarification.md](./06-custom-prompt-routing-and-clarification.md)
- `SDB-07` [07-terminal-output-loop-failures.md](./07-terminal-output-loop-failures.md)
- `SDB-08` [08-observability-and-traceability.md](./08-observability-and-traceability.md)
- `SDB-09` [09-integration-harness-spec-doc.md](./09-integration-harness-spec-doc.md)
- `SDB-10` [10-integration-suite-spec-doc.md](./10-integration-suite-spec-doc.md)
- `SDB-11` [11-e2e-golden-scenarios-spec-doc.md](./11-e2e-golden-scenarios-spec-doc.md)
- `SDB-12` [12-custom-answer-queue-exhaustion-routing.md](./12-custom-answer-queue-exhaustion-routing.md)
- `SDB-13` [13-research-backed-clarification-and-deferral.md](./13-research-backed-clarification-and-deferral.md)
- `SDB-14` [14-post-spec-update-integration-coverage.md](./14-post-spec-update-integration-coverage.md)
- `SDB-15` [15-consistency-action-items-integration.md](./15-consistency-action-items-integration.md)
- `SDB-16` [16-delegated-consistency-follow-up-child.md](./16-delegated-consistency-follow-up-child.md)
- `SDB-16A` [16a-scoped-consistency-prompt-decoupling.md](./16a-scoped-consistency-prompt-decoupling.md) — scoped-prompt baseline
- `SDB-17` [17-delegated-child-coverage-and-parity.md](./17-delegated-child-coverage-and-parity.md)
- `SDB-18` [18-child-fsm-self-loop-refactor.md](./18-child-fsm-self-loop-refactor.md) — explicit child FSM and stage-specific schema ownership
- `SDB-19` [19-task-suite-supersession-notes.md](./19-task-suite-supersession-notes.md) — supersession addendum for delegated-child evolution

## Full Coverage Ownership

### Behavior Coverage (`B-SD-*`)
- FSM transitions (`B-SD-TRANS-001..015`) -> `SDB-02`, `SDB-03`, `SDB-04`, `SDB-05`, `SDB-06`, `SDB-07`
- Human feedback integration (`B-SD-HFB-001..005`) -> `SDB-05`, `SDB-13`, `SDB-17`
- Schema validation (`B-SD-SCHEMA-001..006`) -> `SDB-00`, `SDB-03`, `SDB-04`, `SDB-06`, `SDB-10`
- Copilot delegation + child contract enforcement (`B-SD-COPILOT-001..005`, `B-SD-CHILD-001..003`) -> `SDB-01`, `SDB-07`, `SDB-08`, `SDB-16`, `SDB-16A`, `SDB-17`
- Queue processing (`B-SD-QUEUE-001..005`) -> `SDB-04`, `SDB-05`, `SDB-06`, `SDB-10`
- Done/terminal (`B-SD-DONE-001..003`) -> `SDB-02`, `SDB-07`, `SDB-10`, `SDB-11`
- Loop/failure (`B-SD-TRANS-012..015`, `B-SD-FAIL-001`) -> `SDB-07`, `SDB-10`, `SDB-11`
- Feedback cancellation lifecycle (`B-SD-FAIL-002`) -> `SDB-11`
- Integrate input normalization (`B-SD-INPUT-001..004`) -> `SDB-03`, `SDB-15`, `SDB-17`
- Observability (`B-SD-OBS-001..003`) -> `SDB-08`, `SDB-16`, `SDB-16A`, `SDB-17`, `SDB-18`, `SDB-19`, `SDB-11`
- Post-spec-update clarification research + delegated-child deltas -> `SDB-13`, `SDB-14`, `SDB-15`, `SDB-16`, `SDB-16A`, `SDB-17`
- Scoped consistency prompt decoupling baseline -> `SDB-16A`
- Explicit child self-loop delivery -> `SDB-18`
- Task-suite supersession notes for delegated-child evolution -> `SDB-19`

Delegated-child supersession guide:
- `SDB-16` should be read as the original delegated-child delivery, not as the final word on prompt decomposition or schema ownership.
- `SDB-16A` is the canonical task for understanding when the former combined consistency prompt was replaced by scoped consistency prompt layers.
- `SDB-17` captures parity and coverage for the pre-`SDB-18` scoped-prompt baseline; any wording there that describes explicit child runtime states as future work is historical.
- `SDB-18` is the canonical task for current delegated-child runtime behavior: explicit child `start -> ExecutePromptLayer -> Done` progression, `ExecutePromptLayer` self-loops, and aggregate-only use of `consistency-check-output.schema.json`.
- `SDB-18` also supersedes any older wording that implied every focused prompt layer should still emit the broad aggregate child schema rather than its own stage-specific schema.
- `SDB-19` is the addendum task that tells readers how to reconcile those closed tasks without rewriting them.

### Integration Coverage (`ITX-SD-*`)
- Harness prerequisites in `ITX` section 3 -> `SDB-09`
- `ITX-SD-001..014` implementation -> `SDB-10`
- Post-spec-update `ITX-SD-003/004/005/007/012/013/014/015/016` deltas -> `SDB-14`, `SDB-16A`, `SDB-17`
- `ITX-SD-017` explicit child-state progression -> `SDB-18`

### Golden Scenario Coverage (`GS-SD-*`)
- `GS-SD-001..005` -> `SDB-11`
- Post-spec-update `GS-SD-003` / `GS-SD-004` deltas -> `SDB-14`, `SDB-17`

## Task Document Contract (Mandatory Sections)

Every task file in this folder includes:
- `Fixed Implementation Decisions`
- `Interface/Schema Contracts`
- `File Plan (Exact)`
- `Verification`
- `One-to-One Requirement Mapping`

Rules:
- No wildcard requirement mapping in `One-to-One Requirement Mapping`.
- Each mapping row identifies exactly one primary implementation/test artifact.
- Verification commands are executable from repository root.