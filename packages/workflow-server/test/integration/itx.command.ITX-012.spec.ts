import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../src/persistence/db.js';
import type { EventInsert } from '../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../src/registry/workflow-registry.js';

const createRunSummary = () => ({
  runId: 'wr_itx_012',
  workflowType: 'wf.itx.012',
  workflowVersion: '1.0.0',
  lifecycle: 'running' as const,
  currentState: 'start',
  parentRunId: null,
  startedAt: '2026-02-21T00:00:00.000Z',
  endedAt: null,
});

const executeNonZeroCase = async (allowNonZeroExit: boolean) => {
  const registry = createWorkflowRegistry('reject');
  registry.register({
    workflowType: 'wf.itx.012',
    workflowVersion: '1.0.0',
    factory: () => ({
      initialState: 'start',
      states: {
        start: async (ctx) => {
          await ctx.runCommand({
            command: 'node',
            cwd: process.cwd(),
            allowNonZeroExit,
          });
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

  const result = await runTransitionStep({
    client: {} as DbClient,
    deps: {
      registry,
      commandRunner: {
        run: vi.fn().mockResolvedValue({
          stdout: 'warn',
          stderr: 'warn',
          exitCode: 9,
          startedAt: '2026-02-21T00:00:01.000Z',
          completedAt: '2026-02-21T00:00:01.005Z',
          durationMs: 5,
          timedOut: false,
        }),
      },
      commandPolicy: {
        allowCommands: ['node'],
        allowedCwdPrefixes: [process.cwd()],
        blockedEnvKeys: [],
        timeoutMsMax: 5_000,
        outputMaxBytes: 512,
        redactFields: [],
      },
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

  return {
    eventTypes: appendedEvents.map((event) => event.eventType),
    lifecycle: result.run.lifecycle,
  };
};

describe('itx.command.ITX-012', () => {
  it('emits failed command lifecycle when non-zero exit is not allowed', async () => {
    const disallowed = await executeNonZeroCase(false);
    expect(disallowed.eventTypes).toContain('command.failed');
    expect(disallowed.eventTypes).not.toContain('command.completed');
    expect(disallowed.lifecycle).toBe('failed');
  });

  it('emits completed command lifecycle when non-zero exit is explicitly allowed', async () => {
    const allowed = await executeNonZeroCase(true);
    expect(allowed.eventTypes).toContain('command.completed');
    expect(allowed.eventTypes).not.toContain('command.failed');
    expect(allowed.lifecycle).toBe('completed');
  });
});
