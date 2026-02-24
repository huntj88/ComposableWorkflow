import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  COMMAND_WORKFLOW_TYPE,
  PARENT_CHILD_WORKFLOW_TYPE,
  advanceRunToTerminal,
  createE2eHarness,
  startWorkflow,
} from '../../e2e/setup.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';

describe('events API contract shape', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('returns typed workflow event fields in events payload', async () => {
    if (!harness) {
      throw new Error('Test runtime unavailable');
    }

    const integrationHarness = harness;

    const commandRun = await startWorkflow({
      harness: integrationHarness,
      workflowType: COMMAND_WORKFLOW_TYPE,
      input: {
        requestId: `events-contract-command-${Date.now()}`,
        message: 'events-contract-shape',
      },
    });

    await advanceRunToTerminal(integrationHarness, commandRun.runId, 10);

    const parentChildRun = await startWorkflow({
      harness: integrationHarness,
      workflowType: PARENT_CHILD_WORKFLOW_TYPE,
      input: {
        requestId: `events-contract-child-${Date.now()}`,
        childInput: {
          requestId: `events-contract-child-input-${Date.now()}`,
          customerId: 'cust-contract',
          amountCents: 100,
          currency: 'USD',
        },
      },
    });

    await advanceRunToTerminal(integrationHarness, parentChildRun.runId, 10);

    const commandEventsResponse = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${commandRun.runId}/events?limit=250`,
    });

    expect(commandEventsResponse.statusCode).toBe(200);
    const commandEvents = commandEventsResponse.json().items as Array<Record<string, unknown>>;
    expect(commandEvents.length).toBeGreaterThan(0);

    for (const event of commandEvents) {
      expect(event).toHaveProperty('workflowType');
      expect(event).toHaveProperty('parentRunId');
      expect(event).toHaveProperty('state');
      expect(event).toHaveProperty('transition');
      expect(event).toHaveProperty('child');
      expect(event).toHaveProperty('command');
    }

    const childEventsResponse = await integrationHarness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${parentChildRun.runId}/events?limit=250`,
    });

    expect(childEventsResponse.statusCode).toBe(200);
  });
});
