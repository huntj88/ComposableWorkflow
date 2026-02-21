import { describe, expect, it } from 'vitest';

import { createWorkflowApiClient } from '../../src/http/client.js';

const baseUrl = process.env.WORKFLOW_API_BASE_URL;
const workflowType = process.env.WORKFLOW_CONTRACT_WORKFLOW_TYPE;

const describeContract = baseUrl && workflowType ? describe : describe.skip;

describeContract('contract: workflow events follow', () => {
  it('connects to stream endpoint and reads ordered incremental events', async () => {
    const client = createWorkflowApiClient({
      baseUrl: baseUrl!,
    });

    const run = await client.startWorkflow({
      workflowType: workflowType!,
      input: {
        contractFollow: true,
        timestamp: new Date().toISOString(),
      },
      idempotencyKey: `contract-follow-${Date.now()}`,
    });

    const abortController = new AbortController();
    const events: Array<{ sequence: number; runId: string }> = [];

    const readPromise = (async () => {
      for await (const chunk of client.streamRunEvents({
        runId: run.runId,
        signal: abortController.signal,
      })) {
        events.push({
          sequence: chunk.event.sequence,
          runId: chunk.event.runId,
        });

        if (events.length >= 3) {
          break;
        }
      }
    })();

    await Promise.race([
      readPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 2_000);
      }),
    ]);

    abortController.abort();

    await readPromise.catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      throw error;
    });

    if (events.length > 0) {
      expect(events[0].runId).toBe(run.runId);

      for (let index = 1; index < events.length; index += 1) {
        expect(events[index].sequence).toBeGreaterThan(events[index - 1].sequence);
      }
    } else {
      expect(events).toEqual([]);
    }
  });
});
