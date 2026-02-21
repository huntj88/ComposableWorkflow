import { describe, expect, it, vi } from 'vitest';

import { executeCli, EXIT_CODE_SUCCESS, type CliDependencies } from '../../src/index.js';

const createMockDeps = () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const inspectRunTree = vi.fn(async () => ({
    tree: {
      runId: 'wr_root',
      workflowType: 'wf.root.v1',
      workflowVersion: '1.0.0',
      lifecycle: 'running',
      currentState: 'start',
      parentRunId: null,
      startedAt: '2026-02-21T00:00:00.000Z',
      endedAt: null,
      children: [
        {
          runId: 'wr_child',
          workflowType: 'wf.child.v1',
          workflowVersion: '1.0.0',
          lifecycle: 'completed',
          currentState: 'done',
          parentRunId: 'wr_root',
          startedAt: '2026-02-21T00:00:01.000Z',
          endedAt: '2026-02-21T00:00:03.000Z',
          children: [],
        },
      ],
    },
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
      inspectRunTree,
      inspectDefinition: vi.fn(async () => {
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

  return { deps, stdout, stderr, inspectRunTree };
};

describe('contract: workflow runs tree', () => {
  it('parses options, calls API client, and renders text output', async () => {
    const { deps, stdout, stderr, inspectRunTree } = createMockDeps();

    const exitCode = await executeCli(
      [
        'node',
        'workflow',
        'runs',
        'tree',
        '--run-id',
        'wr_root',
        '--depth',
        '2',
        '--include-completed-children',
        'false',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(inspectRunTree).toHaveBeenCalledWith({
      runId: 'wr_root',
      depth: 2,
      includeCompletedChildren: false,
    });
    expect(stdout.some((line) => line.includes('wr_root'))).toBe(true);
    expect(stdout.some((line) => line.includes('wr_child'))).toBe(true);
    expect(stderr).toEqual([]);
  });

  it('renders json output when --json is provided', async () => {
    const { deps, stdout } = createMockDeps();

    const exitCode = await executeCli(
      ['node', 'workflow', 'runs', 'tree', '--run-id', 'wr_root', '--json'],
      deps,
    );

    expect(exitCode).toBe(EXIT_CODE_SUCCESS);
    expect(JSON.parse(stdout[0] ?? '{}')).toMatchObject({
      tree: {
        runId: 'wr_root',
      },
    });
  });
});
