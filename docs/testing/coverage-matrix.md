# Coverage Matrix (Per-ID)

This is the authoritative requirement-to-test ownership ledger.

## Columns
- `RequirementID`: Behavior or test-plan identifier.
- `Suite`: `e2e-blackbox`, `system-harness`, `integration`, or `optional-*`.
- `PlannedTestFile`: Canonical target test file.
- `OwnerTask`: Task doc that owns implementation.
- `Status`: `planned | implemented | passing`.
- `FeatureGate`: `required` or named optional gate.

Harness note: suites in `packages/workflow-server/test/e2e/**` execute with the in-process harness and are classified as `system-harness`.

## E2E Behavior Coverage (`B-*`, `GS-*`)

### Black-box parity gates

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| Parity-001-ProdPersistentServer | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/server-smoke.spec.ts | T19 | implemented | required |
| Parity-004-OutcomeEquivalence | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/workflow-parity.spec.ts | T19 | implemented | required |
| B-CLI-001..004-BlackBoxMode | e2e-blackbox | apps/workflow-cli/test/e2e/cli-behaviors.spec.ts | T19 | implemented | required |

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| B-LOAD-001 | e2e | packages/workflow-server/test/e2e/behaviors/load.spec.ts | T16 | implemented | required |
| B-LOAD-002 | e2e | packages/workflow-server/test/e2e/behaviors/load.spec.ts | T16 | implemented | required |
| B-LOAD-003 | e2e | packages/workflow-server/test/e2e/behaviors/load.spec.ts | T16 | implemented | required |
| B-LOAD-004 | e2e | packages/workflow-server/test/e2e/behaviors/load.spec.ts | T16 | implemented | required |
| B-START-001 | e2e | packages/workflow-server/test/e2e/behaviors/start.spec.ts | T16 | implemented | required |
| B-START-002 | e2e | packages/workflow-server/test/e2e/behaviors/start.spec.ts | T16 | implemented | required |
| B-START-003 | e2e | packages/workflow-server/test/e2e/behaviors/start.spec.ts | T16 | implemented | required |
| B-START-004 | e2e | packages/workflow-server/test/e2e/behaviors/start.spec.ts | T16 | implemented | required |
| B-START-001 | e2e | packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts | T20 | implemented | required |
| B-START-003 | e2e | packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts | T20 | implemented | required |
| B-EVT-002 | e2e | packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts | T20 | implemented | required |
| B-LIFE-001 | e2e | packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts | T20 | implemented | required |
| B-LIFE-003 | e2e | packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts | T20 | implemented | required |
| B-EVT-001 | e2e | packages/workflow-server/test/e2e/behaviors/events-integrity.spec.ts | T16 | implemented | required |
| B-EVT-002 | e2e | packages/workflow-server/test/e2e/behaviors/events-integrity.spec.ts | T16 | implemented | required |
| B-EVT-003 | e2e | packages/workflow-server/test/e2e/behaviors/events-integrity.spec.ts | T16 | implemented | required |
| B-TRANS-001 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-TRANS-002 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-TRANS-003 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-TRANS-004 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-CHILD-001 | e2e | packages/workflow-server/test/e2e/behaviors/child.spec.ts | T16 | implemented | required |
| B-CHILD-002 | e2e | packages/workflow-server/test/e2e/behaviors/child.spec.ts | T16 | implemented | required |
| B-CHILD-003 | e2e | packages/workflow-server/test/e2e/behaviors/child.spec.ts | T16 | implemented | required |
| B-CHILD-004 | e2e | packages/workflow-server/test/e2e/behaviors/child.spec.ts | T16 | implemented | required |
| B-CMD-001 | e2e | packages/workflow-server/test/e2e/behaviors/command.spec.ts | T16 | implemented | required |
| B-CMD-002 | e2e | packages/workflow-server/test/e2e/behaviors/command.spec.ts | T16 | implemented | required |
| B-CMD-003 | e2e | packages/workflow-server/test/e2e/behaviors/command.spec.ts | T16 | implemented | required |
| B-CMD-004 | e2e | packages/workflow-server/test/e2e/behaviors/command.spec.ts | T16 | implemented | required |
| B-LIFE-001 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-002 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-003 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-004 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-005 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-006 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-007 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-LIFE-008 | e2e | packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts | T16 | implemented | required |
| B-API-001 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T16 | implemented | required |
| B-API-002 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T16 | implemented | required |
| B-API-003 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T16 | implemented | required |
| B-API-004 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T16 | implemented | required |
| B-API-005 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T16 | implemented | required |
| B-API-006 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T10 | implemented | required |
| B-API-007 | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/human-feedback/roundtrip.spec.ts | T23 | implemented | required |
| B-API-008 | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/human-feedback/roundtrip.spec.ts | T23 | implemented | required |
| B-DATA-001 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-DATA-002 | e2e | packages/workflow-server/test/e2e/behaviors/api-read.spec.ts | T16 | implemented | required |
| B-DATA-003 | e2e | packages/workflow-server/test/e2e/behaviors/child.spec.ts | T16 | implemented | required |
| B-OBS-001 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-OBS-002 | e2e | packages/workflow-server/test/e2e/behaviors/transitions.spec.ts | T16 | implemented | required |
| B-OBS-003 | e2e | packages/workflow-server/test/e2e/behaviors/child.spec.ts | T16 | implemented | required |
| B-CLI-001 | e2e | apps/workflow-cli/test/e2e/cli-behaviors.spec.ts | T16 | implemented | required |
| B-CLI-002 | e2e | apps/workflow-cli/test/e2e/cli-behaviors.spec.ts | T16 | implemented | required |
| B-CLI-003 | e2e | apps/workflow-cli/test/e2e/cli-behaviors.spec.ts | T16 | implemented | required |
| B-CLI-004 | e2e | apps/workflow-cli/test/e2e/cli-behaviors.spec.ts | T16 | implemented | required |
| B-CLI-005 | integration | apps/workflow-cli/test/contract/feedback-list.spec.ts | T23 | implemented | required |
| B-CLI-006 | integration | apps/workflow-cli/test/contract/feedback-respond.spec.ts | T23 | implemented | required |
| GS-001 | e2e | packages/workflow-server/test/e2e/golden/GS-001.spec.ts | T16 | implemented | required |
| GS-002 | e2e | packages/workflow-server/test/e2e/golden/GS-002.spec.ts | T16 | implemented | required |
| GS-003 | e2e | packages/workflow-server/test/e2e/golden/GS-003.spec.ts | T16 | implemented | required |
| GS-004 | e2e | packages/workflow-server/test/e2e/golden/GS-004.spec.ts | T16 | implemented | required |
| GS-005 | e2e | packages/workflow-server/test/e2e/golden/GS-005.spec.ts | T16 | implemented | required |
| GS-006 | e2e | packages/workflow-server/test/e2e/golden/GS-006.spec.ts | T28 | planned | required |
| GS-007 | e2e | packages/workflow-server/test/e2e/golden/GS-007.spec.ts | T28 | planned | required |
| B-API-009 | e2e | packages/workflow-server/test/e2e/behaviors/api-feedback-requests.spec.ts | T25 | implemented | required |
| B-API-009 | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/human-feedback/run-feedback-requests.spec.ts | T25 | implemented | required |
| B-CONTRACT-001 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T24 | implemented | required |
| B-CONTRACT-002 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T24 | implemented | required |
| B-CONTRACT-003 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T24 | implemented | required |
| B-CONTRACT-004 | integration | packages/workflow-server/test/integration/contract/contract-lock-drift.spec.ts | T27 | implemented | required |
| B-CONTRACT-005 | integration | packages/workflow-api-types/package.json | T24 | planned | required |
| B-CONTRACT-006 | integration | packages/workflow-api-types/package.json | T24 | planned | required |

## Integration Coverage (`ITX-*`)

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| ITX-001 | integration | packages/workflow-server/test/integration/itx.persistence.ITX-001.spec.ts | T14 | implemented | required |
| ITX-002 | integration | packages/workflow-server/test/integration/itx.concurrency.ITX-002.spec.ts | T14 | implemented | required |
| ITX-003 | integration | packages/workflow-server/test/integration/itx.concurrency.ITX-003.spec.ts | T14 | implemented | required |
| ITX-004 | integration | packages/workflow-server/test/integration/itx.start.ITX-004.spec.ts | T14 | implemented | required |
| ITX-005 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-005.spec.ts | T15 | implemented | required |
| ITX-006 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-006.spec.ts | T15 | implemented | required |
| ITX-007 | integration | packages/workflow-server/test/integration/lifecycle/recovery-progress-gating.spec.ts | T21 | implemented | required |
| ITX-008 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-008.spec.ts | T15 | implemented | required |
| ITX-009 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-009.spec.ts | T15 | implemented | required |
| ITX-010 | integration | packages/workflow-server/test/integration/itx.command.ITX-010.spec.ts | T15 | implemented | required |
| ITX-011 | integration | packages/workflow-server/test/integration/itx.command.ITX-011.spec.ts | T15 | implemented | required |
| ITX-012 | integration | packages/workflow-server/test/integration/itx.command.ITX-012.spec.ts | T15 | implemented | required |
| ITX-013 | integration | packages/workflow-server/test/integration/itx.obs.ITX-013.spec.ts | T15 | implemented | required |
| ITX-014 | integration | packages/workflow-server/test/integration/itx.obs.ITX-014.spec.ts | T15 | implemented | required |
| ITX-015 | integration | packages/workflow-server/test/integration/itx.api.ITX-015.spec.ts | T15 | implemented | required |
| ITX-016 | integration | packages/workflow-server/test/integration/itx.api.ITX-016.spec.ts | T14 | implemented | required |
| ITX-017 | integration | packages/workflow-server/test/integration/itx.persistence.ITX-017.spec.ts | T14 | implemented | required |
| ITX-018 | integration | packages/workflow-server/test/integration/itx.persistence.ITX-018.spec.ts | T14 | implemented | required |
| ITX-019 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-019.spec.ts | T15 | implemented | required |
| ITX-021 | integration | packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts | T22 | implemented | required |
| ITX-025 | integration | packages/workflow-server/test/integration/human-feedback/numbering-contract.spec.ts | T22 | implemented | required |
| ITX-027 | integration | packages/workflow-server/test/integration/human-feedback/numbering-contract.spec.ts | T22 | implemented | required |
| ITX-028 | integration | packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts | T22 | implemented | required |
| ITX-020 | integration | packages/workflow-server/test/integration/human-feedback/first-wins-concurrency.spec.ts | T23 | implemented | required |
| ITX-022 | integration | packages/workflow-server/test/integration/human-feedback/invalid-option-validation.spec.ts | T23 | implemented | required |
| ITX-023 | integration | packages/workflow-server/test/integration/human-feedback/wait-safe-point-lifecycle.spec.ts | T23 | implemented | required |
| ITX-024 | integration | packages/workflow-server/test/integration/human-feedback/wait-safe-point-lifecycle.spec.ts | T23 | implemented | required |
| ITX-026 | integration | packages/workflow-server/test/integration/human-feedback/invalid-option-validation.spec.ts | T23 | implemented | required |
| ITX-029 | integration | packages/workflow-server/test/integration/human-feedback/first-wins-concurrency.spec.ts | T23 | implemented | required |
| B-HFB-001 | integration | packages/workflow-server/test/integration/human-feedback/numbering-contract.spec.ts | T22 | implemented | required |
| B-HFB-005 | integration | packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts | T22 | implemented | required |
| B-HFB-008 | integration | packages/workflow-server/test/integration/human-feedback/numbering-contract.spec.ts | T22 | implemented | required |
| B-HFB-009 | integration | packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts | T22 | implemented | required |
| B-HFB-010 | integration | packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts | T22 | implemented | required |
| B-HFB-002 | integration | packages/workflow-server/test/integration/human-feedback/wait-safe-point-lifecycle.spec.ts | T23 | implemented | required |
| B-HFB-003 | integration | packages/workflow-server/test/integration/human-feedback/first-wins-concurrency.spec.ts | T23 | implemented | required |
| B-HFB-004 | integration | packages/workflow-server/test/integration/human-feedback/first-wins-concurrency.spec.ts | T23 | implemented | required |
| B-HFB-006 | integration | packages/workflow-server/test/integration/human-feedback/first-wins-concurrency.spec.ts | T23 | implemented | required |
| B-HFB-007 | integration | packages/workflow-server/test/integration/human-feedback/wait-safe-point-lifecycle.spec.ts | T23 | implemented | required |
| B-HFB-011 | integration | packages/workflow-server/test/integration/human-feedback/invalid-option-validation.spec.ts | T23 | implemented | required |
| B-HFB-012 | integration | packages/workflow-server/test/integration/human-feedback/invalid-option-validation.spec.ts | T23 | implemented | required |
| B-DATA-004 | integration | packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts | T22 | implemented | required |
| ITX-030 | integration | packages/workflow-server/test/integration/human-feedback/run-scoped-pagination.spec.ts | T26 | implemented | required |
| ITX-031 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T26 | implemented | required |
| ITX-032 | integration | packages/workflow-server/test/integration/contract/contract-lock-drift.spec.ts | T27 | implemented | required |
| LifecycleStart-001-NoPendingQueue | integration | packages/workflow-server/test/integration/orchestrator/start-immediate-execution.spec.ts | T20 | implemented | required |
| LifecycleStart-002-ImmediateStepHandoff | integration | packages/workflow-server/test/integration/orchestrator/start-immediate-execution.spec.ts | T20 | implemented | required |
| LifecycleStart-004-ExecutionStartCheckpoint | integration | packages/workflow-server/test/integration/orchestrator/start-immediate-execution.spec.ts | T20 | implemented | required |
| LifecycleStart-005-ChildLaunchCompatibility | integration | packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts | T20 | implemented | required |
| Spec-6.4-WorkflowEventContract | integration | packages/workflow-server/test/integration/api/events-contract-shape.spec.ts | T18 | implemented | required |
| Spec-4.3-WorkflowCustomLogs | integration | packages/workflow-server/test/integration/api/logs-custom-level.spec.ts | T18 | implemented | required |
| Spec-8.2-RunSummaryTransitionContext | integration | packages/workflow-server/test/integration/api/run-summary-transition-context.spec.ts | T18 | implemented | required |
| Spec-8.8-DefinitionGraphMetadata | integration | packages/workflow-server/test/integration/api/definition-graph-metadata.spec.ts | T18 | implemented | required |
| Spec-9.1-LogFieldConsistency | integration | packages/workflow-server/test/integration/api/logs-custom-level.spec.ts | T18 | implemented | required |
| Spec-9.2-RequiredMetricsSet | integration | packages/workflow-server/test/integration/observability/required-metrics.spec.ts | T18 | implemented | required |
| Spec-6.7-CLIInspectionScope | integration | apps/workflow-cli/test/contract/runs-tree.spec.ts | T18 | implemented | required |

### Spec-doc workflow integration (`ITX-SD-*`)

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| ITX-SD-001 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-001.spec.ts | TSD10 | implemented | required |
| ITX-SD-002 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-002.spec.ts | TSD10 | implemented | required |
| ITX-SD-003 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-003.spec.ts | TSD10 | implemented | required |
| ITX-SD-005 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-005.spec.ts | TSD10 | implemented | required |
| ITX-SD-006 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-006.spec.ts | TSD10 | implemented | required |
| ITX-SD-007 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-007.spec.ts | TSD10 | implemented | required |
| ITX-SD-008 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-008.spec.ts | TSD10 | implemented | required |
| ITX-SD-009 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-009.spec.ts | TSD10 | implemented | required |
| ITX-SD-010 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-010.spec.ts | TSD10 | implemented | required |
| ITX-SD-011 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-011.spec.ts | TSD10 | implemented | required |
| ITX-SD-012 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-012.spec.ts | TSD10 | implemented | required |
| ITX-SD-013 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-013.spec.ts | TSD10 | implemented | required |
| ITX-SD-014 | integration | packages/workflow-app-builder/test/integration/spec-doc/itx.spec-doc.ITX-SD-014.spec.ts | TSD10 | implemented | required |

### Spec-doc E2E golden scenarios (`GS-SD-*`, `SD-E2E-*`)

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| SD-E2E-001-HappyPathCompletion | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/spec-doc/gs-sd-001-happy-path.spec.ts | TSD11 | implemented | required |
| SD-E2E-002-MultiLoopCompletion | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/spec-doc/gs-sd-002-multi-loop.spec.ts | TSD11 | implemented | required |
| SD-E2E-003-CustomPromptRoundTrip | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts | TSD11 | implemented | required |
| SD-E2E-005-CopilotFailurePropagation | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/spec-doc/gs-sd-005-copilot-failure-propagation.spec.ts | TSD11 | implemented | required |
| SD-E2E-006-FeedbackCancellationLifecycle | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/spec-doc/spec-doc-feedback-cancellation.spec.ts | TSD11 | implemented | required |

## Update Rules
- Update `Status` to `implemented` when file exists with active test cases.
- Update `Status` to `passing` only after CI passes on the owning suite.
- Do not merge new behavior IDs without adding a row here.