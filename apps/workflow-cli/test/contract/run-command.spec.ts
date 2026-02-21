import { describe, expect, it } from 'vitest';

import { createWorkflowApiClient } from '../../src/http/client.js';

const baseUrl = process.env.WORKFLOW_API_BASE_URL;
const workflowType = process.env.WORKFLOW_CONTRACT_WORKFLOW_TYPE;

const describeContract = baseUrl && workflowType ? describe : describe.skip;

describeContract('contract: workflow run', () => {
  it('starts workflow and returns run metadata', async () => {
    const client = createWorkflowApiClient({
      baseUrl: baseUrl!,
    });

    const run = await client.startWorkflow({
      workflowType: workflowType!,
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
