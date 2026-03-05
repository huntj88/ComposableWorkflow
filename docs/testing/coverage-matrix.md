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
| B-API-007 | integration | packages/workflow-server/test/integration/api/error-envelope-conformance.spec.ts | T29 | implemented | required |
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
| GS-006 | e2e | packages/workflow-server/test/e2e/golden/GS-006.spec.ts | T28 | implemented | required |
| GS-007 | e2e | packages/workflow-server/test/e2e/golden/GS-007.spec.ts | T28 | implemented | required |
| B-API-009 | e2e | packages/workflow-server/test/e2e/behaviors/api-feedback-requests.spec.ts | T25 | implemented | required |
| B-API-009 | e2e-blackbox | packages/workflow-server/test/e2e-blackbox/human-feedback/run-feedback-requests.spec.ts | T25 | implemented | required |
| B-API-010 | integration | packages/workflow-server/test/integration/api/graph-overlay-reference-conformance.spec.ts | T30 | passing | required |
| B-CONTRACT-001 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T24 | implemented | required |
| B-CONTRACT-002 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T24 | implemented | required |
| B-CONTRACT-003 | integration | packages/workflow-server/test/integration/contract/type-conformance.spec.ts | T24 | implemented | required |
| B-CONTRACT-004 | integration | packages/workflow-server/test/integration/contract/contract-lock-drift.spec.ts | T27 | implemented | required |
| B-CONTRACT-005 | integration | packages/workflow-api-types/package.json | T24 | planned | required |
| B-CONTRACT-006 | integration | packages/workflow-api-types/package.json | T24 | planned | required |
| B-CONTRACT-006 | integration | packages/workflow-server/test/integration/contract/error-envelope-contract-lock-drift.spec.ts | T29 | implemented | required |
| B-CONTRACT-007 | integration | packages/workflow-server/test/integration/contract/graph-contract-lock-drift.spec.ts | T30 | passing | required |

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
| ITX-033 | integration | packages/workflow-server/test/integration/contract/graph-contract-lock-drift.spec.ts | T30 | passing | required |
| ITX-034 | integration | packages/workflow-server/test/integration/contract/error-envelope-contract-lock-drift.spec.ts | T29 | implemented | required |
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

## Web SPA Behavior Coverage (`B-WEB-*`)

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| B-WEB-001 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts | TWEB09 | implemented | required |
| B-WEB-002 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts | TWEB09 | implemented | required |
| B-WEB-003 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts | TWEB09 | implemented | required |
| B-WEB-004 | e2e | apps/workflow-web/test/e2e/web-runs-dashboard-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-005 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-002.spec.ts | TWEB09 | implemented | required |
| B-WEB-006 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-002.spec.ts | TWEB09 | implemented | required |
| B-WEB-007 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-004.spec.ts | TWEB10 | implemented | required |
| B-WEB-008 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-003.spec.ts | TWEB10 | implemented | required |
| B-WEB-009 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-009.spec.ts | TWEB09 | implemented | required |
| B-WEB-010 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-010.spec.ts | TWEB09 | implemented | required |
| B-WEB-011 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-009.spec.ts | TWEB09 | implemented | required |
| B-WEB-012 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-010.spec.ts | TWEB09 | implemented | required |
| B-WEB-013 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-011.spec.ts | TWEB10 | implemented | required |
| B-WEB-014 | integration | apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts | TWEB11 | implemented | required |
| B-WEB-015 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-036.spec.ts | TWEB10 | implemented | required |
| B-WEB-016 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-005.spec.ts | TWEB09 | implemented | required |
| B-WEB-017 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-006.spec.ts | TWEB09 | implemented | required |
| B-WEB-018 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-007.spec.ts | TWEB10 | implemented | required |
| B-WEB-019 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-008.spec.ts | TWEB10 | implemented | required |
| B-WEB-020 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-011.spec.ts | TWEB10 | implemented | required |
| B-WEB-021 | e2e | apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-021 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts | TWEB10 | implemented | required |
| B-WEB-022 | e2e | apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-022 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts | TWEB10 | implemented | required |
| B-WEB-023 | e2e | apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-023 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts | TWEB10 | implemented | required |
| B-WEB-024 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts | TWEB10 | implemented | required |
| B-WEB-025 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts | TWEB10 | implemented | required |
| B-WEB-026 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts | TWEB10 | implemented | required |
| B-WEB-027 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-014.spec.ts | TWEB10 | implemented | required |
| B-WEB-028 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-015.spec.ts | TWEB10 | implemented | required |
| B-WEB-029 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-016.spec.ts | TWEB10 | implemented | required |
| B-WEB-030 | e2e | apps/workflow-web/test/e2e/web-runs-dashboard-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-030 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-017.spec.ts | TWEB10 | implemented | required |
| B-WEB-031 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-018.spec.ts | TWEB10 | implemented | required |
| B-WEB-032 | e2e | apps/workflow-web/test/e2e/web-runs-dashboard-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-032 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-019.spec.ts | TWEB10 | implemented | required |
| B-WEB-033 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-019.spec.ts | TWEB10 | implemented | required |
| B-WEB-033 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-022.spec.ts | TWEB10 | implemented | required |
| B-WEB-034 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-020.spec.ts | TWEB10 | implemented | required |
| B-WEB-035 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-021.spec.ts | TWEB10 | implemented | required |
| B-WEB-036 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-024.spec.ts | TWEB10 | implemented | required |
| B-WEB-037 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-025.spec.ts | TWEB10 | implemented | required |
| B-WEB-038 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-026.spec.ts | TWEB10 | implemented | required |
| B-WEB-039 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-027.spec.ts | TWEB10 | implemented | required |
| B-WEB-040 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-028.spec.ts | TWEB10 | implemented | required |
| B-WEB-041 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-029.spec.ts | TWEB10 | implemented | required |
| B-WEB-042 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-030.spec.ts | TWEB10 | implemented | required |
| B-WEB-043 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-031.spec.ts | TWEB10 | implemented | required |
| B-WEB-044 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-032.spec.ts | TWEB10 | implemented | required |
| B-WEB-045 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-033.spec.ts | TWEB10 | implemented | required |
| B-WEB-046 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-034.spec.ts | TWEB10 | implemented | required |
| B-WEB-047 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-034.spec.ts | TWEB10 | implemented | required |
| B-WEB-048 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-035.spec.ts | TWEB10 | implemented | required |
| B-WEB-049 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-036.spec.ts | TWEB10 | implemented | required |
| B-WEB-050 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-037.spec.ts | TWEB10 | implemented | required |
| B-WEB-051 | e2e | apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-051 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-038.spec.ts | TWEB10 | implemented | required |
| B-WEB-052 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-039.spec.ts | TWEB10 | implemented | required |
| B-WEB-053 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-040.spec.ts | TWEB10 | implemented | required |
| B-WEB-054 | e2e | apps/workflow-web/test/e2e/web-feedback-happy-path.spec.ts | TWEB12 | implemented | required |
| B-WEB-054 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-041.spec.ts | TWEB10 | implemented | required |
| B-WEB-055 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-042.spec.ts | TWEB10 | implemented | required |
| B-WEB-056 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-043.spec.ts | TWEB10 | implemented | required |

## Web SPA Integration Coverage (`ITX-WEB-*`)

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| ITX-WEB-001 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-001.spec.ts | TWEB09 | implemented | required |
| ITX-WEB-002 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-002.spec.ts | TWEB09 | implemented | required |
| ITX-WEB-003 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-003.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-004 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-004.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-005 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-005.spec.ts | TWEB09 | implemented | required |
| ITX-WEB-006 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-006.spec.ts | TWEB09 | implemented | required |
| ITX-WEB-007 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-007.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-008 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-008.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-009 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-009.spec.ts | TWEB09 | implemented | required |
| ITX-WEB-010 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-010.spec.ts | TWEB09 | implemented | required |
| ITX-WEB-011 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-011.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-012 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-013 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-014 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-014.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-015 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-015.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-016 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-016.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-017 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-017.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-018 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-018.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-019 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-019.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-020 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-020.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-021 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-021.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-022 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-022.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-023 | integration | apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.ITX-WEB-023.spec.ts | TWEB11 | implemented | required |
| ITX-WEB-024 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-024.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-025 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-025.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-026 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-026.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-027 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-027.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-028 | integration | apps/workflow-web/test/integration/routes/itx.web.routes.ITX-WEB-028.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-029 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-029.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-030 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-030.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-031 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-031.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-032 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-032.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-033 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-033.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-034 | integration | apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-034.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-035 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-035.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-036 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-036.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-037 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-037.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-038 | integration | apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-038.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-039 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-039.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-040 | integration | apps/workflow-web/test/integration/stream/itx.web.stream.ITX-WEB-040.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-041 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-041.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-042 | integration | apps/workflow-web/test/integration/accessibility/itx.web.a11y.ITX-WEB-042.spec.ts | TWEB10 | implemented | required |
| ITX-WEB-043 | integration | apps/workflow-web/test/integration/transport/itx.web.transport.ITX-WEB-043.spec.ts | TWEB10 | implemented | required |

### Web SPA supplemental integration gates

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| TWEB12-definitions-route | integration | apps/workflow-web/test/integration/routes/itx.web.routes.definitions-view.spec.ts | TWEB11 | implemented | required |
| TWEB12-unsupported-eventType | integration | apps/workflow-web/test/integration/stream/itx.web.stream.unsupported-eventType-filter.spec.ts | TWEB11 | implemented | required |
| TWEB12-api-types-exports | spec-lock | apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.api-types-exports.spec.ts | TWEB11 | implemented | required |
| TWEB12-contract-evolution-order | spec-lock | apps/workflow-web/test/integration/spec-lock/itx.web.spec-lock.contract-evolution-order.spec.ts | TWEB11 | implemented | required |
| TWEB12-defaults-ordering | integration | apps/workflow-web/test/integration/transport/itx.web.transport.defaults-and-ordering.spec.ts | TWEB11 | implemented | required |
| TWEB12-event-text-filter | integration | apps/workflow-web/test/integration/transport/itx.web.transport.event-text-filter-semantics.spec.ts | TWEB11 | implemented | required |

## Update Rules
- Update `Status` to `implemented` when file exists with active test cases.
- Update `Status` to `passing` only after CI passes on the owning suite.
- Do not merge new behavior IDs without adding a row here.