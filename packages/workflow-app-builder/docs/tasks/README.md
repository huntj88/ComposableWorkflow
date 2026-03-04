# Spec-Doc Workflow Implementation Task Suite

This folder contains the ordered implementation plan for:
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`

## How to Execute This Plan

1. Execute tasks in numeric order (`TSD00` -> `TSD11`).
2. Do not start a task until every `Depends On` task is complete.
3. Keep all acceptance criteria in each task file satisfied before closing that task.
4. Treat each task’s `One-to-One Requirement Mapping` as mandatory scope.

## Execution Preconditions

- `server.human-feedback.v1` is available as a server-owned workflow contract before running integration/E2E suites for this plan.
- `app-builder.copilot.prompt.v1` is available in real runtime or deterministic test-double mode, depending on suite type.
- For black-box parity suites, run against a separately launched production server process using the commands defined in `spec-doc-integration-tests.md`.

## Dependency Graph (Acyclic)

- `TSD00` -> none
- `TSD01` -> `TSD00`
- `TSD02` -> `TSD00`, `TSD01`
- `TSD03` -> `TSD02`
- `TSD04` -> `TSD02`, `TSD03`
- `TSD05` -> `TSD02`, `TSD04`
- `TSD06` -> `TSD02`, `TSD05`
- `TSD07` -> `TSD03`, `TSD04`, `TSD05`, `TSD06`
- `TSD08` -> `TSD02`, `TSD03`, `TSD04`, `TSD05`, `TSD06`, `TSD07`
- `TSD09` -> `TSD02`, `TSD05`, `TSD06`, `TSD08`
- `TSD10` -> `TSD03`, `TSD04`, `TSD05`, `TSD06`, `TSD07`, `TSD08`, `TSD09`
- `TSD11` -> `TSD10`

No dependency points to a numerically later prerequisite outside this graph.

## Task Index

- `TSD00` [00-spec-doc-foundation-contracts.md](./00-spec-doc-foundation-contracts.md)
- `TSD01` [01-prompt-template-delegation.md](./01-prompt-template-delegation.md)
- `TSD02` [02-fsm-runtime-state-model.md](./02-fsm-runtime-state-model.md)
- `TSD03` [03-integrate-into-spec-state.md](./03-integrate-into-spec-state.md)
- `TSD04` [04-consistency-check-and-queue-synthesis.md](./04-consistency-check-and-queue-synthesis.md)
- `TSD05` [05-numbered-options-human-request.md](./05-numbered-options-human-request.md)
- `TSD06` [06-custom-prompt-routing-and-clarification.md](./06-custom-prompt-routing-and-clarification.md)
- `TSD07` [07-terminal-output-loop-failures.md](./07-terminal-output-loop-failures.md)
- `TSD08` [08-observability-and-traceability.md](./08-observability-and-traceability.md)
- `TSD09` [09-integration-harness-spec-doc.md](./09-integration-harness-spec-doc.md)
- `TSD10` [10-integration-suite-spec-doc.md](./10-integration-suite-spec-doc.md)
- `TSD11` [11-e2e-golden-scenarios-spec-doc.md](./11-e2e-golden-scenarios-spec-doc.md)
- `TSD12` [12-custom-answer-queue-exhaustion-routing.md](./12-custom-answer-queue-exhaustion-routing.md)

## Full Coverage Ownership

### Behavior Coverage (`B-SD-*`)
- FSM transitions (`B-SD-TRANS-001..011`) -> `TSD02`, `TSD03`, `TSD04`, `TSD05`, `TSD06`, `TSD07`
- Human feedback integration (`B-SD-HFB-001..004`) -> `TSD05`, `TSD10`
- Schema validation (`B-SD-SCHEMA-001..006`) -> `TSD00`, `TSD03`, `TSD04`, `TSD06`, `TSD10`
- Copilot delegation (`B-SD-COPILOT-001..003`) -> `TSD01`, `TSD07`, `TSD08`, `TSD10`
- Queue processing (`B-SD-QUEUE-001..005`) -> `TSD04`, `TSD05`, `TSD06`, `TSD10`
- Done/terminal (`B-SD-DONE-001..003`) -> `TSD02`, `TSD07`, `TSD10`, `TSD11`
- Loop/failure (`B-SD-LOOP-001..002`, `B-SD-FAIL-001`) -> `TSD07`, `TSD10`, `TSD11`
- Feedback cancellation lifecycle (`B-SD-FAIL-002`) -> `TSD11`
- Integrate input normalization (`B-SD-INPUT-001..003`) -> `TSD03`, `TSD10`
- Observability (`B-SD-OBS-001..002`) -> `TSD08`, `TSD10`, `TSD11`

### Integration Coverage (`ITX-SD-*`)
- Harness prerequisites in `ITX` section 3 -> `TSD09`
- `ITX-SD-001..014` implementation -> `TSD10`

### Golden Scenario Coverage (`GS-SD-*`)
- `GS-SD-001..005` -> `TSD11`

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