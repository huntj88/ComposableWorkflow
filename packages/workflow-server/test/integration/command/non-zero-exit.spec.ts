import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../../src/persistence/db.js';
import type { EventInsert } from '../../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

const createRunSummary = () => ({
  runId: 'wr_non_zero',
  workflowType: 'wf.command.non-zero',
  workflowVersion: '1.0.0',
  lifecycle: 'running' as const,
  currentState: 'start',
  parentRunId: null,
  startedAt: '2026-02-21T00:00:00.000Z',
  endedAt: null,
});

describe('command non-zero integration', () => {
  it('fails run when allowNonZeroExit=false and command exits non-zero', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.command.non-zero',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await ctx.runCommand({
              command: 'node',
              cwd: process.cwd(),
              allowNonZeroExit: false,
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
            stderr: 'bad',
            exitCode: 2,
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

    expect(appendedEvents.map((event) => event.eventType)).toContain('command.failed');
    expect(result.run.lifecycle).toBe('failed');
  });

  it('completes command event when allowNonZeroExit=true and command exits non-zero', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.command.non-zero',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            const result = await ctx.runCommand({
              command: 'node',
              cwd: process.cwd(),
              allowNonZeroExit: true,
            });
            ctx.complete(result);
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
            stdout: 'ok',
            stderr: 'warn',
            exitCode: 2,
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

    expect(appendedEvents.map((event) => event.eventType)).toContain('command.completed');
    expect(appendedEvents.map((event) => event.eventType)).not.toContain('command.failed');
    expect(result.run.lifecycle).toBe('completed');
  });
});
