import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../src/persistence/db.js';
import type { EventInsert } from '../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../src/registry/workflow-registry.js';

describe('itx.command.ITX-011', () => {
  it('applies deterministic redaction then truncation with required marker contract', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.itx.011',
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
        commandRunner: {
          run: vi.fn().mockResolvedValue({
            stdout: 'sensitive-output-value',
            stderr: 'sensitive-error-value',
            exitCode: 0,
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
          outputMaxBytes: 6,
          redactFields: ['stdin', 'stdout', 'stderr'],
        },
        runRepository: {
          getRunSummary: vi.fn().mockResolvedValue({
            runId: 'wr_itx_011',
            workflowType: 'wf.itx.011',
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
        runId: 'wr_itx_011',
        workflowType: 'wf.itx.011',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      },
    });

    const completed = appendedEvents.find((event) => event.eventType === 'command.completed');
    expect(completed?.payload?.truncated).toBe(true);
    expect(completed?.payload?.redactedFields).toEqual(['stdin', 'stdout', 'stderr']);
    expect(typeof completed?.payload?.stdin).toBe('string');
    expect(typeof completed?.payload?.stdout).toBe('string');
    expect(typeof completed?.payload?.stderr).toBe('string');
    expect((completed?.payload?.stdin as string).length).toBeLessThanOrEqual(6);
    expect((completed?.payload?.stdout as string).length).toBeLessThanOrEqual(6);
    expect((completed?.payload?.stderr as string).length).toBeLessThanOrEqual(6);
  });
});
