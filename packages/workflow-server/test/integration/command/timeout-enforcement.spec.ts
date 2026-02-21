import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../../src/persistence/db.js';
import type { EventInsert } from '../../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('command timeout enforcement', () => {
  it('emits command.failed and fails run when command times out', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.command.timeout',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await ctx.runCommand({
              command: 'node',
              cwd: process.cwd(),
              timeoutMs: 100,
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

    const result = await runTransitionStep({
      client: {} as DbClient,
      deps: {
        registry,
        commandRunner: {
          run: vi.fn().mockResolvedValue({
            stdout: '',
            stderr: 'timeout',
            exitCode: 124,
            startedAt: '2026-02-21T00:00:01.000Z',
            completedAt: '2026-02-21T00:00:01.100Z',
            durationMs: 100,
            timedOut: true,
          }),
        },
        commandPolicy: {
          allowCommands: ['node'],
          allowedCwdPrefixes: [process.cwd()],
          blockedEnvKeys: [],
          timeoutMsMax: 5_000,
          outputMaxBytes: 256,
          redactFields: [],
        },
        runRepository: {
          getRunSummary: vi.fn().mockResolvedValue({
            runId: 'wr_timeout_1',
            workflowType: 'wf.command.timeout',
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
        runId: 'wr_timeout_1',
        workflowType: 'wf.command.timeout',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      },
    });

    const timeoutEvent = appendedEvents.find((event) => event.eventType === 'command.failed');
    expect(timeoutEvent?.payload?.timeout).toBe(true);
    expect(result.run.lifecycle).toBe('failed');
  });
});
