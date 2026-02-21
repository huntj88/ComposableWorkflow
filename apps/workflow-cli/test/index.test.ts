import { Response } from 'undici';
import { describe, expect, it, vi } from 'vitest';

import {
  executeCli,
  EXIT_CODE_RUNTIME,
  EXIT_CODE_SUCCESS,
  EXIT_CODE_USAGE,
  type CliDependencies,
} from '../src/index.js';
import { createWorkflowApiClient, getRetryDecision, WorkflowApiError } from '../src/http/client.js';

const createMockDeps = (): {
  deps: CliDependencies;
  stdout: string[];
  stderr: string[];
  startWorkflowMock: ReturnType<typeof vi.fn>;
  listRunsMock: ReturnType<typeof vi.fn>;
} => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const startWorkflowMock = vi.fn(async () => ({
    runId: 'wr_1',
    workflowType: 'demo',
    workflowVersion: '1.0.0',
    lifecycle: 'running',
    currentState: 'start',
    parentRunId: null,
    childrenSummary: {
      total: 0,
      active: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    counters: {
      eventCount: 1,
      logCount: 0,
      childCount: 0,
    },
  }));

  const listRunsMock = vi.fn(async () => [
    {
      runId: 'wr_2',
      workflowType: 'invoice',
      workflowVersion: '1.0.0',
      lifecycle: 'completed',
      currentState: 'done',
      parentRunId: null,
      childrenSummary: {
        total: 0,
        active: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:01:00.000Z',
      counters: {
        eventCount: 3,
        logCount: 0,
        childCount: 0,
      },
    },
  ]);

  const deps: CliDependencies = {
    client: {
      startWorkflow: startWorkflowMock,
      listRuns: listRunsMock,
      listRunEvents: vi.fn(async () => ({ items: [] })),
      streamRunEvents: vi.fn(async function* () {
        yield* [];
      }),
      inspectDefinition: vi.fn(async () => ({
        workflowType: 'invoice',
        workflowVersion: '1.0.0',
        states: ['start', 'done'],
        transitions: [{ from: 'start', to: 'done', name: 'finish' }],
        childLaunchAnnotations: [],
        metadata: {},
      })),
    },
    io: {
      writeStdout: (line) => {
        stdout.push(line);
      },
      writeStderr: (line) => {
        stderr.push(line);
      },
    },
  };

  return {
    deps,
    stdout,
    stderr,
    startWorkflowMock,
    listRunsMock,
  };
};

describe('workflow-cli command parsing and output', () => {
  it('runs workflow run with JSON input and JSON output', async () => {
    const { deps, stdout, startWorkflowMock } = createMockDeps();

    const exitCode = await executeCli(
      [
        'node',
        'workflow',
        'run',
        '--type',
        'invoice',
        '--input',
        '{"orderId":"ord_1"}',
        '--idempotency-key',
        'key_123',
        '--json',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(startWorkflowMock).toHaveBeenCalledWith({
      workflowType: 'invoice',
      input: { orderId: 'ord_1' },
      idempotencyKey: 'key_123',
    });
    expect(JSON.parse(stdout[0])).toEqual({
      runId: 'wr_1',
      workflowType: 'demo',
      workflowVersion: '1.0.0',
      lifecycle: 'running',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns usage exit code for invalid JSON input', async () => {
    const { deps, stderr } = createMockDeps();
    const exitCode = await executeCli(
      ['node', 'workflow', 'run', '--type', 'invoice', '--input', '{invalid-json}'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_USAGE);
    expect(stderr.join('\n')).toContain('--input must be valid JSON');
  });

  it('renders human list output for runs list', async () => {
    const { deps, stdout, listRunsMock } = createMockDeps();
    const exitCode = await executeCli(
      ['node', 'workflow', 'runs', 'list', '--workflow-type', 'invoice'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(listRunsMock).toHaveBeenCalledWith({
      lifecycle: undefined,
      workflowType: 'invoice',
    });
    expect(stdout.join('\n')).toContain('wr_2');
    expect(stdout.join('\n')).toContain('invoice');
  });

  it('returns runtime exit code on API error', async () => {
    const { deps, stderr } = createMockDeps();
    deps.client.inspectDefinition = vi.fn(async () => {
      throw new WorkflowApiError({
        statusCode: 404,
        code: 'DEFINITION_NOT_FOUND',
        message: 'missing',
      });
    });

    const exitCode = await executeCli(
      ['node', 'workflow', 'inspect', '--type', 'missing', '--graph'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_RUNTIME);
    expect(stderr.join('\n')).toContain('DEFINITION_NOT_FOUND');
  });
});

describe('workflow HTTP client retry policy', () => {
  it('classifies network and 5xx failures as retryable', () => {
    expect(
      getRetryDecision({
        error: new Error('socket hang up'),
        attempt: 1,
        maxAttempts: 3,
      }),
    ).toEqual({
      shouldRetry: true,
      reason: 'network',
    });

    expect(
      getRetryDecision({
        statusCode: 503,
        attempt: 1,
        maxAttempts: 3,
      }),
    ).toEqual({
      shouldRetry: true,
      reason: '5xx',
    });

    expect(
      getRetryDecision({
        statusCode: 400,
        attempt: 1,
        maxAttempts: 3,
      }),
    ).toEqual({
      shouldRetry: false,
      reason: 'other',
    });
  });

  it('retries transient network failure and succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary network issue'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: 'wr_retry',
            workflowType: 'invoice',
            workflowVersion: '1.0.0',
            lifecycle: 'running',
            currentState: 'start',
            parentRunId: null,
            childrenSummary: {
              total: 0,
              active: 0,
              completed: 0,
              failed: 0,
              cancelled: 0,
            },
            startedAt: '2026-01-01T00:00:00.000Z',
            endedAt: null,
            counters: { eventCount: 1, logCount: 0, childCount: 0 },
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      );

    const sleep = vi.fn(async () => {
      return;
    });

    const client = createWorkflowApiClient({
      baseUrl: 'http://localhost:3000',
      fetchFn,
      sleep,
      retry: {
        maxAttempts: 2,
        initialDelayMs: 1,
      },
    });

    const result = await client.startWorkflow({
      workflowType: 'invoice',
      input: { id: '1' },
    });

    expect(result.runId).toBe('wr_retry');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-transient 4xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'bad request',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const client = createWorkflowApiClient({
      baseUrl: 'http://localhost:3000',
      fetchFn,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1,
      },
    });

    await expect(
      client.startWorkflow({
        workflowType: 'invoice',
        input: {},
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
