import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../harness/create-harness.js';
import { createItxHarness } from './setup.js';

describe('itx.api.ITX-015', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createItxHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: 'wf.itx.015',
          workflowVersion: '1.0.0',
          factory: () => ({
            initialState: 'start',
            states: {
              start: () => {
                return;
              },
              command: () => {
                return;
              },
              done: () => {
                return;
              },
            },
            transitions: [
              { from: 'start', to: 'command', name: 'to-command' },
              { from: 'command', to: 'done', name: 'to-done' },
            ],
          }),
          metadata: {
            displayName: 'ITX 015 Workflow',
            tags: ['itx', 'api'],
          },
          packageName: 'itx-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('normalizes definition metadata without phantom states, edges, or child annotations', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const response = await harness.server.inject({
      method: 'GET',
      url: '/api/v1/workflows/definitions/wf.itx.015',
    });

    expect(response.statusCode).toBe(200);

    const definition = response.json() as {
      states: string[];
      transitions: Array<{ from: string; to: string; name?: string }>;
      childLaunchAnnotations: unknown[];
      metadata: Record<string, unknown>;
    };

    expect(new Set(definition.states)).toEqual(new Set(['start', 'command', 'done']));
    expect(definition.transitions).toEqual([
      { from: 'start', to: 'command', name: 'to-command' },
      { from: 'command', to: 'done', name: 'to-done' },
    ]);
    expect(definition.childLaunchAnnotations).toEqual([]);
    expect(definition.metadata.displayName).toBe('ITX 015 Workflow');
    expect(definition.metadata.packageName).toBe('itx-tests');
    expect(definition.metadata.packageVersion).toBe('1.0.0');
    expect(definition.metadata.source).toBe('path');
    expect(definition.metadata.sourceValue).toBe('test');
  });
});
