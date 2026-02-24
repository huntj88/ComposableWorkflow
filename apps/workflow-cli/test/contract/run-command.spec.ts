import { describe, expect, it } from 'vitest';

import { createWorkflowApiClient } from '../../src/http/client.js';

const baseUrl = process.env.WORKFLOW_API_BASE_URL ?? 'http://127.0.0.1:3000';
const workflowType = process.env.WORKFLOW_CONTRACT_WORKFLOW_TYPE ?? 'reference.success.v1';

describe('contract: workflow run', () => {
  it('starts workflow and returns run metadata', async () => {
    const client = createWorkflowApiClient({
      baseUrl,
    });

    const run = await client.startWorkflow({
      workflowType,
      input: {
        contractTest: true,
        timestamp: new Date().toISOString(),
      },
      idempotencyKey: `contract-run-${Date.now()}`,
    });

    expect(run.runId).toBeTruthy();
    expect(run.workflowType).toBe(workflowType);
    expect(run.workflowVersion).toBeTruthy();
    expect(run.lifecycle).toBeTruthy();
    expect(run.startedAt).toBeTruthy();
  });
});
