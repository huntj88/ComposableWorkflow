# Coverage Matrix (Per-ID)

This is the authoritative requirement-to-test ownership ledger.

## Columns
- `RequirementID`: Behavior or test-plan identifier.
- `Suite`: `e2e`, `integration`, or `optional-*`.
- `PlannedTestFile`: Canonical target test file.
- `OwnerTask`: Task doc that owns implementation.
- `Status`: `planned | implemented | passing`.
- `FeatureGate`: `required` or named optional gate.

## E2E Behavior Coverage (`B-*`, `GS-*`)

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
| GS-001 | e2e | packages/workflow-server/test/e2e/golden/GS-001.spec.ts | T16 | implemented | required |
| GS-002 | e2e | packages/workflow-server/test/e2e/golden/GS-002.spec.ts | T16 | implemented | required |
| GS-003 | e2e | packages/workflow-server/test/e2e/golden/GS-003.spec.ts | T16 | implemented | required |
| GS-004 | e2e | packages/workflow-server/test/e2e/golden/GS-004.spec.ts | T16 | implemented | required |
| GS-005 | e2e | packages/workflow-server/test/e2e/golden/GS-005.spec.ts | T16 | implemented | required |

## Integration Coverage (`ITX-*`)

| RequirementID | Suite | PlannedTestFile | OwnerTask | Status | FeatureGate |
|---|---|---|---|---|---|
| ITX-001 | integration | packages/workflow-server/test/integration/itx.persistence.ITX-001.spec.ts | T14 | implemented | required |
| ITX-002 | integration | packages/workflow-server/test/integration/itx.concurrency.ITX-002.spec.ts | T14 | implemented | required |
| ITX-003 | integration | packages/workflow-server/test/integration/itx.concurrency.ITX-003.spec.ts | T14 | implemented | required |
| ITX-004 | integration | packages/workflow-server/test/integration/itx.start.ITX-004.spec.ts | T14 | implemented | required |
| ITX-005 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-005.spec.ts | T15 | implemented | required |
| ITX-006 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-006.spec.ts | T15 | implemented | required |
| ITX-007 | integration | packages/workflow-server/test/integration/itx.lifecycle.ITX-007.spec.ts | T15 | implemented | required |
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

## Update Rules
- Update `Status` to `implemented` when file exists with active test cases.
- Update `Status` to `passing` only after CI passes on the owning suite.
- Do not merge new behavior IDs without adding a row here.