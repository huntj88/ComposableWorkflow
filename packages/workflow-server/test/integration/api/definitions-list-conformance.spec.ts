import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listDefinitionsResponseSchema } from '@composable-workflow/workflow-api-types';

import { SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE } from '../../../src/internal-workflows/human-feedback/contracts.js';
import type { WorkflowRegistration } from '../../../src/registry/workflow-registry.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createItxHarness } from '../setup.js';

const TEST_PACKAGE_SOURCE_VALUE = '/virtual/test-workflow-package';

const createRegistration = (
  workflowType: string,
  workflowVersion: string,
  displayName: string,
): WorkflowRegistration => ({
  workflowType,
  workflowVersion,
  factory: () => ({
    initialState: 'start',
    states: {
      start: () => {
        return;
      },
    },
  }),
  metadata: {
    displayName,
  },
  packageName: '@composable-workflow/test-package',
  packageVersion: '1.0.0',
  source: 'path',
  sourceValue: TEST_PACKAGE_SOURCE_VALUE,
});

describe('integration.api.definitions-list-conformance', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register(createRegistration('wf.zeta.definition', '3.0.0', 'Zeta Workflow'));
        registry.register(createRegistration('wf.alpha.definition', '2.0.0', 'Alpha Workflow'));
      },
    });

    if (!harness) {
      throw new Error('Harness not initialized');
    }

    await harness.db.pool.query(
      `
INSERT INTO workflow_definitions (workflow_type, workflow_version, metadata_jsonb, registered_at)
VALUES
  ($1, $2, $3::jsonb, $4),
  ($5, $6, $7::jsonb, $4)
ON CONFLICT (workflow_type)
DO UPDATE SET
  workflow_version = EXCLUDED.workflow_version,
  metadata_jsonb = EXCLUDED.metadata_jsonb,
  registered_at = EXCLUDED.registered_at
`,
      [
        'wf.beta.definition',
        '4.0.0',
        JSON.stringify({
          displayName: 'Persisted Beta Workflow',
          packageName: '@composable-workflow/persisted-package',
          packageVersion: '4.0.0',
          source: 'bundle',
          sourceValue: 'persisted-bundle',
        }),
        '2026-03-05T00:00:00.000Z',
        'wf.alpha.definition',
        '1.5.0',
        JSON.stringify({
          displayName: 'Stale Alpha Workflow',
          packageName: '@composable-workflow/stale-package',
          packageVersion: '1.5.0',
          source: 'bundle',
          sourceValue: 'stale-bundle',
        }),
      ],
    );
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('ITX-035 / B-API-011 returns sorted shared definition summaries from registry and persistence', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const response = await harness.server.inject({
      method: 'GET',
      url: '/api/v1/workflows/definitions',
    });

    expect(response.statusCode).toBe(200);

    const body = listDefinitionsResponseSchema.parse(response.json());
    const workflowTypes = body.items.map((item) => item.workflowType);
    expect(workflowTypes).toEqual(
      [...workflowTypes].sort((left, right) => left.localeCompare(right)),
    );
    expect(workflowTypes).toEqual([
      SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
      'wf.alpha.definition',
      'wf.beta.definition',
      'wf.zeta.definition',
    ]);

    const alpha = body.items.find((item) => item.workflowType === 'wf.alpha.definition');
    expect(alpha).toMatchObject({
      workflowType: 'wf.alpha.definition',
      workflowVersion: '2.0.0',
      metadata: {
        displayName: 'Alpha Workflow',
        packageName: '@composable-workflow/test-package',
        packageVersion: '1.0.0',
        source: 'path',
        sourceValue: TEST_PACKAGE_SOURCE_VALUE,
      },
    });

    const beta = body.items.find((item) => item.workflowType === 'wf.beta.definition');
    expect(beta).toMatchObject({
      workflowType: 'wf.beta.definition',
      workflowVersion: '4.0.0',
      metadata: {
        displayName: 'Persisted Beta Workflow',
        packageName: '@composable-workflow/persisted-package',
        packageVersion: '4.0.0',
        source: 'bundle',
        sourceValue: 'persisted-bundle',
      },
    });
  });
});
