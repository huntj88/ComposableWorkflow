import { describe, expect, it, vi } from 'vitest';

import {
  executeCli,
  EXIT_CODE_SUCCESS,
  EXIT_CODE_USAGE,
  type CliDependencies,
} from '../../src/index.js';

const createMockDeps = () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const respondFeedbackRequest = vi.fn(async () => ({
    feedbackRunId: 'hf_respond_1',
    status: 'accepted' as const,
    acceptedAt: '2026-03-02T00:10:00.000Z',
  }));

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
      listFeedbackRequests: vi.fn(async () => []),
      getFeedbackRequestStatus: vi.fn(async () => {
        throw new Error('not used');
      }),
      respondFeedbackRequest,
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

  return { deps, stdout, stderr, respondFeedbackRequest };
};

describe('contract: workflow feedback respond', () => {
  it('parses JSON response and submits feedback response', async () => {
    const { deps, stdout, stderr, respondFeedbackRequest } = createMockDeps();

    const exitCode = await executeCli(
      [
        'node',
        'workflow',
        'feedback',
        'respond',
        '--feedback-run-id',
        'hf_respond_1',
        '--response',
        '{"questionId":"q_feedback_1","selectedOptionIds":[1],"text":"done"}',
        '--responded-by',
        'operator_1',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(respondFeedbackRequest).toHaveBeenCalledWith({
      feedbackRunId: 'hf_respond_1',
      response: {
        questionId: 'q_feedback_1',
        selectedOptionIds: [1],
        text: 'done',
      },
      respondedBy: 'operator_1',
    });
    expect(stdout.some((line) => line.includes('Accepted feedback response'))).toBe(true);
    expect(stderr).toEqual([]);
  });

  it('returns usage error for invalid response JSON', async () => {
    const { deps, stderr } = createMockDeps();

    const exitCode = await executeCli(
      [
        'node',
        'workflow',
        'feedback',
        'respond',
        '--feedback-run-id',
        'hf_respond_1',
        '--response',
        '{invalid',
        '--responded-by',
        'operator_1',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_USAGE);
    expect(stderr.join('\n')).toContain('--response must be valid JSON');
  });
});
