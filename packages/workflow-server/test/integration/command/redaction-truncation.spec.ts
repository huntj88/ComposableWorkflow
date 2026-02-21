import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../../src/persistence/db.js';
import type { EventInsert } from '../../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('command redaction and truncation integration', () => {
  it('redacts first then truncates and includes deterministic markers', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.command.redaction',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await ctx.runCommand({
              command: 'node',
              args: ['-e', 'console.log(1)'],
              cwd: process.cwd(),
              stdin: 'secret-stdin',
            });
            ctx.complete({ ok: true });
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const appendedEvents: EventInsert[] = [];

    await runTransitionStep({
      client: {} as DbClient,
      deps: {
        registry,
        commandRunner: {
          run: vi.fn().mockResolvedValue({
            stdout: 'sensitive-output-value',
            stderr: '',
            exitCode: 0,
            startedAt: '2026-02-21T00:00:01.000Z',
            completedAt: '2026-02-21T00:00:01.050Z',
            durationMs: 50,
            timedOut: false,
          }),
        },
        commandPolicy: {
          allowCommands: ['node'],
          allowedCwdPrefixes: [process.cwd()],
          blockedEnvKeys: [],
          timeoutMsMax: 5_000,
          outputMaxBytes: 5,
          redactFields: ['stdin', 'stdout'],
        },
        runRepository: {
          getRunSummary: vi.fn().mockResolvedValue({
            runId: 'wr_redact_1',
            workflowType: 'wf.command.redaction',
            workflowVersion: '1.0.0',
            lifecycle: 'running',
            currentState: 'start',
            parentRunId: null,
            startedAt: '2026-02-21T00:00:00.000Z',
            endedAt: null,
          }),
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
      run: {
        runId: 'wr_redact_1',
        workflowType: 'wf.command.redaction',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      },
    });

    const completedEvent = appendedEvents.find((event) => event.eventType === 'command.completed');
    expect(completedEvent?.payload).toBeDefined();
    expect(completedEvent?.payload?.redactedFields).toEqual(['stdin', 'stdout']);
    expect(completedEvent?.payload?.truncated).toBe(true);
    expect(completedEvent?.payload?.stdin).toBe('***RE');
    expect(completedEvent?.payload?.stdout).toBe('***RE');
  });
});
