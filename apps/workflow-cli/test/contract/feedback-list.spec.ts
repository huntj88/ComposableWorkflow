import { describe, expect, it, vi } from 'vitest';

import { executeCli, EXIT_CODE_SUCCESS, type CliDependencies } from '../../src/index.js';

const createMockDeps = () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const listFeedbackRequests = vi.fn(async () => [
    {
      feedbackRunId: 'hf_awaiting_1',
      parentRunId: 'wr_parent_1',
      parentWorkflowType: 'reference.feedback-roundtrip.v1',
      parentState: 'await-feedback',
      questionId: 'q_feedback_1',
      requestEventId: 'evt_feedback_1',
      prompt: 'Pick one',
      options: [
        { id: 1, label: 'Approve' },
        { id: 2, label: 'Reject' },
      ],
      constraints: null,
      correlationId: null,
      status: 'awaiting_response' as const,
      requestedAt: '2026-03-02T00:00:00.000Z',
      respondedAt: null,
      cancelledAt: null,
      response: null,
      respondedBy: null,
    },
  ]);

  const deps: CliDependencies = {
    client: {
      startWorkflow: vi.fn(async () => {
        throw new Error('not used');
      }),
      listRuns: vi.fn(async () => []),
      listRunEvents: vi.fn(async () => ({ items: [] })),
      streamRunEvents: vi.fn(async function* () {
        yield* [];
      }),
      inspectRunTree: vi.fn(async () => {
        throw new Error('not used');
      }),
      inspectDefinition: vi.fn(async () => {
        throw new Error('not used');
      }),
      listFeedbackRequests,
      getFeedbackRequestStatus: vi.fn(async () => {
        throw new Error('not used');
      }),
      respondFeedbackRequest: vi.fn(async () => {
        throw new Error('not used');
      }),
    },
    io: {
      writeStdout: (line: string) => {
        stdout.push(line);
      },
      writeStderr: (line: string) => {
        stderr.push(line);
      },
    },
  };

  return { deps, stdout, stderr, listFeedbackRequests };
};

describe('contract: workflow feedback list', () => {
  it('calls list feedback API and renders text output', async () => {
    const { deps, stdout, stderr, listFeedbackRequests } = createMockDeps();

    const exitCode = await executeCli(
      ['node', 'workflow', 'feedback', 'list', '--status', 'awaiting_response'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(listFeedbackRequests).toHaveBeenCalledWith({
      status: 'awaiting_response',
    });
    expect(stdout.some((line) => line.includes('hf_awaiting_1'))).toBe(true);
    expect(stderr).toEqual([]);
  });

  it('renders JSON output', async () => {
    const { deps, stdout } = createMockDeps();

    const exitCode = await executeCli(
      ['node', 'workflow', 'feedback', 'list', '--status', 'awaiting_response', '--json'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(JSON.parse(stdout[0] ?? '{}')).toMatchObject({
      items: [
        {
          feedbackRunId: 'hf_awaiting_1',
          status: 'awaiting_response',
        },
      ],
    });
  });

  it('passes runId when run-scoped listing is requested', async () => {
    const { deps, listFeedbackRequests } = createMockDeps();

    const exitCode = await executeCli(
      ['node', 'workflow', 'feedback', 'list', '--run-id', 'wr_parent_1', '--json'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(listFeedbackRequests).toHaveBeenCalledWith({
      runId: 'wr_parent_1',
      status: undefined,
    });
  });
});
