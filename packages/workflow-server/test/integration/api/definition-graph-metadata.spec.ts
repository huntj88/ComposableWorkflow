import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIntegrationHarness } from '../../harness/create-harness.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';

describe('definition graph metadata', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('returns states/transitions/child launch annotations from DB fallback metadata', async () => {
    if (!harness) {
      throw new Error('Test runtime unavailable');
    }

    const integrationHarness = harness;

    await integrationHarness.db.pool.query(
      `
INSERT INTO workflow_definitions (workflow_type, workflow_version, metadata_jsonb, registered_at)
VALUES ($1, $2, $3::jsonb, $4)
ON CONFLICT (workflow_type)
DO UPDATE SET
  workflow_version = EXCLUDED.workflow_version,
  metadata_jsonb = EXCLUDED.metadata_jsonb,
  registered_at = EXCLUDED.registered_at
`,
      [
        'wf.db-metadata.v1',
        '2.0.0',
        JSON.stringify({
          states: ['queued', 'dispatching', 'done'],
          transitions: [
            { from: 'queued', to: 'dispatching', name: 'dispatch' },
            { from: 'dispatching', to: 'done', name: 'complete' },
          ],
          childLaunchAnnotations: [
            {
              state: 'dispatching',
              childWorkflowType: 'wf.child.v1',
              transition: 'dispatch-child',
            },
          ],
          displayName: 'DB Fallback Workflow',
        }),
        new Date().toISOString(),
      ],
    );

    const response = await integrationHarness.server.inject({
      method: 'GET',
      url: '/api/v1/workflows/definitions/wf.db-metadata.v1',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      states: string[];
      transitions: Array<{ from: string; to: string; name?: string }>;
      childLaunchAnnotations: Array<Record<string, unknown>>;
      metadata: Record<string, unknown>;
    };

    expect(body.states).toEqual(['queued', 'dispatching', 'done']);
    expect(body.transitions).toEqual([
      { from: 'queued', to: 'dispatching', name: 'dispatch' },
      { from: 'dispatching', to: 'done', name: 'complete' },
    ]);
    expect(body.childLaunchAnnotations).toEqual([
      {
        state: 'dispatching',
        childWorkflowType: 'wf.child.v1',
        transition: 'dispatch-child',
      },
    ]);
    expect(body.metadata.displayName).toBe('DB Fallback Workflow');
  });
});
