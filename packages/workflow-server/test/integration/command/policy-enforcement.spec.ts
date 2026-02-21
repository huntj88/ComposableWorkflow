import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../../src/persistence/db.js';
import type { EventInsert } from '../../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('command policy enforcement', () => {
  it('fails before process spawn when command is disallowed', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.command.policy',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await ctx.runCommand({
              command: 'bash',
              args: ['-lc', 'echo test'],
              cwd: process.cwd(),
            });
            ctx.complete({});
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const commandRunner = {
      run: vi.fn(),
    };

    const appendedEvents: EventInsert[] = [];

    const result = await runTransitionStep({
      client: {} as DbClient,
      deps: {
        registry,
        commandRunner,
        commandPolicy: {
          allowCommands: ['node'],
          allowedCwdPrefixes: [process.cwd()],
          blockedEnvKeys: ['SECRET'],
          timeoutMsMax: 5_000,
          outputMaxBytes: 128,
          redactFields: ['stdin', 'stdout', 'stderr'],
        },
        runRepository: {
          getRunSummary: vi.fn().mockResolvedValue({
            runId: 'wr_policy_1',
            workflowType: 'wf.command.policy',
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
        runId: 'wr_policy_1',
        workflowType: 'wf.command.policy',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      },
    });

    expect(commandRunner.run).not.toHaveBeenCalled();
    expect(appendedEvents.map((event) => event.eventType)).toEqual([
      'command.failed',
      'transition.failed',
      'workflow.failed',
    ]);
    expect(result.terminal).toBe(true);
    expect(result.run.lifecycle).toBe('failed');
  });
});
