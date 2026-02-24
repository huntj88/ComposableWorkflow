import { beforeAll, describe, expect, it } from 'vitest';

import { executeCli, EXIT_CODE_SUCCESS } from '../../src/index.js';
import { createWorkflowApiClient, type WorkflowApiClient } from '../../src/http/client.js';

const SUCCESS_WORKFLOW_TYPE = 'reference.success.v1';
const resolveBaseUrl = (): string => {
  if (process.env.WORKFLOW_BLACKBOX_BASE_URL) {
    return process.env.WORKFLOW_BLACKBOX_BASE_URL;
  }

  if (process.env.WORKFLOW_API_BASE_URL) {
    return process.env.WORKFLOW_API_BASE_URL;
  }

  const port = process.env.WORKFLOW_SERVER_PORT ?? '3000';
  return `http://127.0.0.1:${port}`;
};

describe('e2e.cli.behaviors', () => {
  let baseUrl = '';
  let client: WorkflowApiClient;
  const stdout: string[] = [];
  const stderr: string[] = [];

  beforeAll(async () => {
    baseUrl = resolveBaseUrl();
    client = createWorkflowApiClient({ baseUrl });
  });

  it('B-CLI-001..004 executes run, list, follow events, and inspect graph against running server', async () => {
    stdout.length = 0;
    stderr.length = 0;

    const deps = {
      client,
      io: {
        writeStdout: (line: string) => {
          stdout.push(line);
        },
        writeStderr: (line: string) => {
          stderr.push(line);
        },
      },
    };

    const runExit = await executeCli(
      [
        'node',
        'workflow',
        'run',
        '--type',
        SUCCESS_WORKFLOW_TYPE,
        '--input',
        JSON.stringify({
          requestId: 'cli-e2e-1',
          customerId: 'cust-cli',
          amountCents: 900,
          currency: 'USD',
        }),
        '--json',
      ],
      deps,
    );
    expect(runExit).toBe(EXIT_CODE_SUCCESS);

    const runOutput = JSON.parse(stdout[0] ?? '{}') as { runId: string };
    expect(runOutput.runId).toBeTruthy();

    const resumeResponse = await fetch(
      `${baseUrl}/api/v1/workflows/runs/${runOutput.runId}/resume`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestedBy: 'cli-e2e', reason: 'progress-run' }),
      },
    );
    expect([200, 409]).toContain(resumeResponse.status);

    const listExit = await executeCli(
      ['node', 'workflow', 'runs', 'list', '--workflow-type', SUCCESS_WORKFLOW_TYPE, '--json'],
      deps,
    );
    expect(listExit).toBe(EXIT_CODE_SUCCESS);
    expect(stdout.some((line) => line.includes(runOutput.runId))).toBe(true);

    const followPromise = executeCli(
      ['node', 'workflow', 'runs', 'events', '--run-id', runOutput.runId, '--follow', '--json'],
      deps,
    );
    setTimeout(() => {
      process.emit('SIGINT');
    }, 250);

    const followExit = await followPromise;
    expect(followExit).toBe(EXIT_CODE_SUCCESS);
    expect(stdout.some((line) => line.includes('"eventType"'))).toBe(true);

    const inspectExit = await executeCli(
      ['node', 'workflow', 'inspect', '--type', SUCCESS_WORKFLOW_TYPE, '--graph', '--json'],
      deps,
    );
    expect(inspectExit).toBe(EXIT_CODE_SUCCESS);
    expect(stdout.some((line) => line.includes('"workflowType":"reference.success.v1"'))).toBe(
      true,
    );

    expect(stderr).toEqual([]);
  });
});
