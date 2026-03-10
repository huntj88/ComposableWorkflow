# Spec-Doc Workflow Implementation Task Suite

This folder contains the ordered implementation plan for:
- `packages/workflow-app-builder/docs/spec-doc-generation-workflow.md`
- `packages/workflow-app-builder/docs/spec-doc-behaviors.md`
- `packages/workflow-app-builder/docs/spec-doc-integration-tests.md`

## How to Execute This Plan

1. Execute tasks in dependency order, including alphanumeric follow-ons (`SDB-00` ... `SDB-16` -> `SDB-16A` -> `SDB-17` -> `SDB-18` -> `SDB-19` -> `SDB-20` -> `SDB-21` -> `SDB-22` -> `SDB-23` -> `SDB-24` -> `SDB-25` -> `SDB-26` -> `SDB-27` -> `SDB-28` -> `SDB-29` -> `SDB-30`).
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
- `SDB-20` -> `SDB-17`, `SDB-18`, `SDB-19`
- `SDB-21` -> `SDB-18`, `SDB-20`
- `SDB-22` -> `SDB-21`
- `SDB-23` -> `SDB-14`, `SDB-21`, `SDB-22`
- `SDB-24` -> `SDB-22`, `SDB-23`
- `SDB-25` -> `SDB-15`, `SDB-20`, `SDB-22`
- `SDB-26` -> `SDB-23`, `SDB-25`
- `SDB-27` -> `SDB-24`, `SDB-25`
- `SDB-28` -> `SDB-27`
- `SDB-29` -> `SDB-28`
- `SDB-30` -> `SDB-27`

No dependency points to a numerically later prerequisite outside this graph.

Delegated-child evolution chain:
- `SDB-16` -> delegated child baseline
- `SDB-16A` -> scoped prompt baseline replaces the former combined consistency prompt
- `SDB-17` -> parity and coverage on the scoped-prompt baseline
- `SDB-18` -> explicit child runtime states plus stage-specific schema ownership
- `SDB-19` -> supersession addendum for interpreting older completed task wording
- `SDB-20` -> mixed aggregate preservation and parent prioritization when earlier follow-up questions coexist with later actionable items
- `SDB-21` -> full-sweep stage execution replaces actionable-item short-circuiting
- `SDB-22` -> explicit `PlanResolution` state becomes the sole author of final child output
- `SDB-23` -> parity, integration coverage, and task-suite docs align to the two-pass child model

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
- `SDB-20` [20-mixed-aggregate-consistency-prioritization.md](./20-mixed-aggregate-consistency-prioritization.md) — mixed aggregate child-result handling and parent prioritization
- `SDB-21` [21-full-sweep-consistency-child.md](./21-full-sweep-consistency-child.md) — every delegated-child stage runs once per pass
- `SDB-22` [22-child-plan-resolution-state.md](./22-child-plan-resolution-state.md) — `PlanResolution` authors the final child result
- `SDB-23` [23-two-pass-child-coverage-and-parity.md](./23-two-pass-child-coverage-and-parity.md) — parity/test/doc updates for the two-pass child model
- `SDB-24` [24-cross-stage-dedup-and-log.md](./24-cross-stage-dedup-and-log.md) — cross-stage duplicate dedup-and-log replaces fatal error
- `SDB-25` [25-mixed-aggregate-questions-first-routing.md](./25-mixed-aggregate-questions-first-routing.md) — mixed-aggregate questions-first routing with stash
- `SDB-26` [26-questions-first-coverage-and-parity.md](./26-questions-first-coverage-and-parity.md) — integration/parity coverage for questions-first routing
- `SDB-27` [27-prompt-template-trimming.md](./27-prompt-template-trimming.md) — reduce prompt token cost by removing schema-redundant and echo text
- `SDB-28` [28-schema-level-pros-cons-enforcement.md](./28-schema-level-pros-cons-enforcement.md) — move Pros/Cons description validation into JSON Schema pattern constraints for copilot-prompt retry
- `SDB-29` [29-allow-stage-local-mixed-output.md](./29-allow-stage-local-mixed-output.md) — remove stage-local mutual exclusivity between actionableItems and followUpQuestions
- `SDB-30` [30-integrate-prompt-directive-trimming.md](./30-integrate-prompt-directive-trimming.md) — remove redundant integrate-prompt directives validated by consistency stages

## Full Coverage Ownership

### Behavior Coverage (`B-SD-*`)
- FSM transitions (`B-SD-TRANS-001..015`) -> `SDB-02`, `SDB-03`, `SDB-04`, `SDB-05`, `SDB-06`, `SDB-07`
- Human feedback integration (`B-SD-HFB-001..005`) -> `SDB-05`, `SDB-13`, `SDB-17`
- Schema validation (`B-SD-SCHEMA-001..006`) -> `SDB-00`, `SDB-03`, `SDB-04`, `SDB-06`, `SDB-10`, `SDB-28`
- Copilot delegation + child contract enforcement (`B-SD-COPILOT-001..005`, `B-SD-CHILD-001`, `B-SD-CHILD-001A`, `B-SD-CHILD-001B`, `B-SD-CHILD-002..004`) -> `SDB-01`, `SDB-07`, `SDB-08`, `SDB-16`, `SDB-16A`, `SDB-17`, `SDB-20`, `SDB-21`, `SDB-22`, `SDB-24`, `SDB-25`, `SDB-29`
- Queue processing (`B-SD-QUEUE-001..005`) -> `SDB-04`, `SDB-05`, `SDB-06`, `SDB-10`
- Done/terminal (`B-SD-DONE-001..003`) -> `SDB-02`, `SDB-07`, `SDB-10`, `SDB-11`
- Loop/failure (`B-SD-TRANS-012..015`, `B-SD-FAIL-001`) -> `SDB-07`, `SDB-10`, `SDB-11`
- Feedback cancellation lifecycle (`B-SD-FAIL-002`) -> `SDB-11`
- Integrate input normalization (`B-SD-INPUT-001..005`) -> `SDB-03`, `SDB-15`, `SDB-17`, `SDB-25`, `SDB-26`
- Observability (`B-SD-OBS-001..003`) -> `SDB-08`, `SDB-16`, `SDB-16A`, `SDB-17`, `SDB-18`, `SDB-19`, `SDB-11`, `SDB-21`, `SDB-22`, `SDB-23`, `SDB-24`
- Post-spec-update clarification research + delegated-child deltas -> `SDB-13`, `SDB-14`, `SDB-15`, `SDB-16`, `SDB-16A`, `SDB-17`
- Scoped consistency prompt decoupling baseline -> `SDB-16A`
- Explicit child self-loop delivery -> `SDB-18`
- Task-suite supersession notes for delegated-child evolution -> `SDB-19`
- Mixed aggregate child-result prioritization -> `SDB-20`
- Full-sweep delegated-child execution -> `SDB-21`
- Planning-state authored final child output -> `SDB-22`
- Two-pass parity and documentation alignment -> `SDB-23`
- Cross-stage duplicate dedup-and-log -> `SDB-24`
- Mixed-aggregate questions-first routing with stash -> `SDB-25`
- Questions-first integration/parity coverage -> `SDB-26`
- Prompt template trimming (token cost reduction) -> `SDB-27`

Delegated-child evolution chain (continued):
- `SDB-24` -> cross-stage duplicate dedup-and-log replaces fatal error on duplicate `itemId`/`questionId`

Questions-first routing evolution:
- `SDB-25` -> mixed-aggregate routing reversed: questions-first with stash replaces IntegrateIntoSpec priority (supersedes `SDB-20` routing rule)
- `SDB-26` -> integration/parity coverage for the questions-first model

Prompt trimming:
- `SDB-27` -> remove schema-redundant instructions, input-context echo blocks, duplicated quality prose, and repeated stage rules from all prompt templates; spec doc section 7.2 aligned in parallel

Schema-level enforcement:
- `SDB-28` -> Pros/Cons description constraint moves from code-level `validateProsConsDescriptions()` to JSON Schema `pattern`; violations caught during copilot-prompt in-session retry instead of failing the parent workflow

Stage-local output relaxation:
- `SDB-29` -> remove stage-local mutual exclusivity between `actionableItems` and `followUpQuestions`; a single scoped prompt layer may emit both when addressing different gaps

Delegated-child supersession guide:
- `SDB-16` should be read as the original delegated-child delivery, not as the final word on prompt decomposition or schema ownership.
- `SDB-16A` is the canonical task for understanding when the former combined consistency prompt was replaced by scoped consistency prompt layers.
- `SDB-17` captures parity and coverage for the pre-`SDB-18` scoped-prompt baseline; any wording there that describes explicit child runtime states as future work is historical.
- `SDB-18` is the canonical task for the first explicit delegated-child runtime milestone: introducing real child states and `ExecutePromptLayer` self-loops before the later two-pass follow-ons landed.
- `SDB-18` also supersedes any older wording that implied every focused prompt layer should still emit the broad aggregate child schema rather than its own stage-specific schema.
- `SDB-19` is the addendum task that tells readers how to reconcile those closed tasks without rewriting them.
- `SDB-20` established mixed-aggregate preservation where single-stage mixed outputs remain invalid but the aggregate may contain both arrays. Its routing rule (parent prioritizes `IntegrateIntoSpec` for mixed aggregates) is superseded by `SDB-25`.
- `SDB-25` is the canonical task for current mixed-result routing: when the aggregate contains both non-empty `actionableItems` and non-empty `followUpQuestions`, the parent routes to `NumberedOptionsHumanRequest` first, stashes actionable items, and delivers both to `IntegrateIntoSpec` with `source: "consistency-action-items-with-feedback"` after queue exhaustion.
- `SDB-26` is the canonical parity task for aligning integration tests and golden scenario `GS-SD-004A` to the questions-first routing model.
- `SDB-21` supersedes any earlier assumption that actionable-item output can suppress later delegated-child stages within the same pass.
- `SDB-22` is the canonical task for current child terminal authoring behavior: `PlanResolution` runs after the full sweep and is the only child step that authors the parent-facing aggregate result.
- `SDB-23` is the canonical parity task for aligning tests, golden scenarios, and task-suite docs to the two-pass child model.
- `SDB-24` is the canonical task for current cross-stage duplicate handling: duplicate `itemId`/`questionId` across executed child stages are deduplicated (first-wins), not fatal errors, and each dedup emits a warn-level `consistency.duplicate-skipped` log.
- Any older wording that implies `ITX-SD-012`, `ITX-SD-013`, `ITX-SD-016`, `ITX-SD-017`, or `GS-SD-004` still use delegated-child actionable-item short-circuiting is historical only; read those artifacts through the `SDB-21` + `SDB-22` model.
- `SDB-24` supersedes any wording that describes duplicate `itemId`/`questionId` across executed child stages as a fatal contract violation. The canonical behavior is deduplicate-and-log.
- `SDB-29` supersedes the stage-local mutual-exclusivity rule established in `SDB-16` (`SD-CHILD-004-MixedResultFailure`), refined in `SDB-20` (`SD-MIX-002-StageLocalMixedFailure`), and carried into `SDB-25`/`SDB-26`. After `SDB-29`, a single `ConsistencyStageOutput` may contain both non-empty `actionableItems` and non-empty `followUpQuestions` when they address different gaps.

### Integration Coverage (`ITX-SD-*`)
- Harness prerequisites in `ITX` section 3 -> `SDB-09`
- `ITX-SD-001..014` implementation -> `SDB-10`
- Post-spec-update `ITX-SD-003/004/005/007/012/013/014/015/016` deltas -> `SDB-14`, `SDB-16A`, `SDB-17`, `SDB-20`
- `ITX-SD-017` explicit child-state progression -> `SDB-18`, `SDB-21`, `SDB-22`, `SDB-23`
- Full-sweep/planning parity for `ITX-SD-012/013/016/017` -> `SDB-21`, `SDB-22`, `SDB-23`
- Cross-stage dedup-and-log for `ITX-SD-016` -> `SDB-24`
- Questions-first routing for `ITX-SD-007/013/016` -> `SDB-26`
- Schema-level Pros/Cons enforcement for `ITX-SD-001/011` -> `SDB-28`
- Harness `GS-SD-004` two-pass parity -> `SDB-23`
- Harness `GS-SD-004A` questions-first parity -> `SDB-26`

### Golden Scenario Coverage (`GS-SD-*`)
- `GS-SD-001..005` -> `SDB-11`
- Post-spec-update `GS-SD-003` / `GS-SD-004` deltas -> `SDB-14`, `SDB-17`, `SDB-20`
- Two-pass delegated-child `GS-SD-004` parity -> `SDB-23`
- Questions-first `GS-SD-004A` parity -> `SDB-26`

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