import { describe, expect, it, vi } from 'vitest';

import {
  createSpawnCommandRunnerAdapter,
  type CommandRunnerAdapter,
} from '../../src/command/command-runner.js';
import type { DbClient } from '../../src/persistence/db.js';
import type { EventInsert } from '../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../src/registry/workflow-registry.js';

const createRunSummary = () => ({
  runId: 'wr_itx_010',
  workflowType: 'wf.itx.010',
  workflowVersion: '1.0.0',
  lifecycle: 'running' as const,
  currentState: 'start',
  parentRunId: null,
  startedAt: '2026-02-21T00:00:00.000Z',
  endedAt: null,
});

const executePolicyCase = async (params: {
  request: Record<string, unknown>;
  policy: {
    allowCommands: string[];
    denyCommands?: string[];
    allowedCwdPrefixes: string[];
    blockedEnvKeys: string[];
    timeoutMsMax: number;
    outputMaxBytes: number;
    redactFields: string[];
  };
  commandRunner: CommandRunnerAdapter;
}) => {
  const registry = createWorkflowRegistry('reject');
  registry.register({
    workflowType: 'wf.itx.010',
    workflowVersion: '1.0.0',
    factory: () => ({
      initialState: 'start',
      states: {
        start: async (ctx) => {
          await ctx.runCommand(params.request);
          ctx.complete({ ok: true });
        },
      },
    }),
    packageName: 'itx-tests',
    packageVersion: '1.0.0',
    source: 'path',
    sourceValue: 'test',
  });

  const appendedEvents: EventInsert[] = [];

  await runTransitionStep({
    client: {} as DbClient,
    deps: {
      registry,
      commandRunner: params.commandRunner,
      commandPolicy: params.policy,
      runRepository: {
        getRunSummary: vi.fn().mockResolvedValue(createRunSummary()),
        upsertRunSummary: vi.fn().mockImplementation(async (_client, input) => input),
      },
      eventRepository: {
        appendEvent: vi.fn().mockImplementation(async (_client, event: EventInsert) => {
          appendedEvents.push(event);
          return {
            eventId: event.eventId,
            runId: event.runId,
            eventType: event.eventType,
            sequence: appendedEvents.length,
            timestamp: event.timestamp,
            payload: event.payload ?? null,
            error: event.error ?? null,
          };
        }),
      },
      idempotencyRepository: {
        reserveStartKey: vi.fn(),
        getByKey: vi.fn(),
      },
      eventIdFactory: () => `evt_${appendedEvents.length + 1}`,
      now: () => new Date('2026-02-21T00:00:01.000Z'),
    },
    run: createRunSummary(),
  });

  return appendedEvents;
};

describe('itx.command.ITX-010', () => {
  it('enforces policy matrix before spawn and emits deterministic failure metadata', async () => {
    const blockedRunner = { run: vi.fn() };

    const disallowedEvents = await executePolicyCase({
      request: {
        command: 'bash',
        args: ['-lc', 'echo blocked'],
        cwd: process.cwd(),
      },
      policy: {
        allowCommands: ['node'],
        denyCommands: [],
        allowedCwdPrefixes: [process.cwd()],
        blockedEnvKeys: ['TOKEN'],
        timeoutMsMax: 5_000,
        outputMaxBytes: 256,
        redactFields: ['stdin', 'stdout', 'stderr'],
      },
      commandRunner: blockedRunner,
    });

    expect(blockedRunner.run).not.toHaveBeenCalled();
    expect(disallowedEvents.map((event) => event.eventType)).toContain('command.failed');
    const disallowedFailure = disallowedEvents.find(
      (event) => event.eventType === 'command.failed',
    );
    expect(disallowedFailure?.error).toMatchObject({ code: 'command.not-allowed' });

    const deniedEvents = await executePolicyCase({
      request: {
        command: 'node',
        args: ['-e', 'process.exit(0)'],
        cwd: process.cwd(),
      },
      policy: {
        allowCommands: ['node'],
        denyCommands: ['node'],
        allowedCwdPrefixes: [process.cwd()],
        blockedEnvKeys: ['TOKEN'],
        timeoutMsMax: 5_000,
        outputMaxBytes: 256,
        redactFields: ['stdin', 'stdout', 'stderr'],
      },
      commandRunner: blockedRunner,
    });
    const deniedFailure = deniedEvents.find((event) => event.eventType === 'command.failed');
    expect(deniedFailure?.error).toMatchObject({ code: 'command.denied' });

    const blockedEnvEvents = await executePolicyCase({
      request: {
        command: 'node',
        args: ['-e', 'process.exit(0)'],
        cwd: process.cwd(),
        env: { API_TOKEN: 'top-secret' },
      },
      policy: {
        allowCommands: ['node'],
        denyCommands: [],
        allowedCwdPrefixes: [process.cwd()],
        blockedEnvKeys: ['TOKEN'],
        timeoutMsMax: 5_000,
        outputMaxBytes: 256,
        redactFields: ['stdin', 'stdout', 'stderr'],
      },
      commandRunner: blockedRunner,
    });
    const blockedEnvFailure = blockedEnvEvents.find(
      (event) => event.eventType === 'command.failed',
    );
    expect(blockedEnvFailure?.error).toMatchObject({ code: 'env.blocked' });
  });

  it('normalizes caps for allowed command requests and supports one real-spawn smoke path', async () => {
    const fakeRunner = {
      run: vi.fn().mockResolvedValue({
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
        startedAt: '2026-02-21T00:00:01.000Z',
        completedAt: '2026-02-21T00:00:01.005Z',
        durationMs: 5,
        timedOut: false,
      }),
    };

    const events = await executePolicyCase({
      request: {
        command: 'node',
        args: ['-e', 'process.stdout.write("ok")'],
        cwd: process.cwd(),
        timeoutMs: 30_000,
      },
      policy: {
        allowCommands: ['node'],
        denyCommands: [],
        allowedCwdPrefixes: [process.cwd()],
        blockedEnvKeys: ['TOKEN'],
        timeoutMsMax: 125,
        outputMaxBytes: 256,
        redactFields: ['stdin', 'stdout', 'stderr'],
      },
      commandRunner: fakeRunner,
    });

    expect(fakeRunner.run).toHaveBeenCalledTimes(1);
    expect(fakeRunner.run.mock.calls[0]?.[0]?.timeoutMs).toBe(125);
    expect(events.map((event) => event.eventType)).toContain('command.completed');

    const realRunner = createSpawnCommandRunnerAdapter();
    const smokeEvents = await executePolicyCase({
      request: {
        command: 'node',
        args: ['-e', 'process.stdout.write("real-smoke")'],
        cwd: process.cwd(),
      },
      policy: {
        allowCommands: ['node'],
        denyCommands: [],
        allowedCwdPrefixes: [process.cwd()],
        blockedEnvKeys: ['TOKEN'],
        timeoutMsMax: 2_000,
        outputMaxBytes: 1_024,
        redactFields: ['stdin'],
      },
      commandRunner: realRunner,
    });

    const completed = smokeEvents.find((event) => event.eventType === 'command.completed');
    expect(completed?.payload?.command).toBe('node');
  });
});
