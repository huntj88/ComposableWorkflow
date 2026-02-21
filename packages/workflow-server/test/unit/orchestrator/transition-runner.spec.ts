import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../../src/persistence/db.js';
import type { EventInsert } from '../../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('transition runner', () => {
  it('terminalizes cancelling runs as cancelled with workflow.cancelled event', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.cancel',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: () => {
            return;
          },
        },
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const appendedEvents: EventInsert[] = [];
    const upsertRunSummary = vi.fn().mockResolvedValue({
      runId: 'wr_cancel',
      workflowType: 'wf.cancel',
      workflowVersion: '1.0.0',
      lifecycle: 'cancelled',
      currentState: 'start',
      parentRunId: null,
      startedAt: '2026-02-21T00:00:00.000Z',
      endedAt: '2026-02-21T00:00:01.000Z',
    });

    const result = await runTransitionStep({
      client: {} as DbClient,
      deps: {
        registry,
        runRepository: {
          upsertRunSummary,
          getRunSummary: vi.fn(),
        },
        eventRepository: {
          appendEvent: vi.fn().mockImplementation(async (_client, input: EventInsert) => {
            appendedEvents.push(input);
            return {
              eventId: input.eventId,
              runId: input.runId,
              sequence: appendedEvents.length,
              eventType: input.eventType,
              timestamp: input.timestamp,
              payload: input.payload ?? null,
              error: input.error ?? null,
            };
          }),
        },
        eventIdFactory: () => `evt_${appendedEvents.length + 1}`,
        now: () => new Date('2026-02-21T00:00:01.000Z'),
      },
      run: {
        runId: 'wr_cancel',
        workflowType: 'wf.cancel',
        workflowVersion: '1.0.0',
        lifecycle: 'cancelling',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      },
    });

    expect(appendedEvents.map((event) => event.eventType)).toEqual(['workflow.cancelled']);
    expect(upsertRunSummary).toHaveBeenCalledOnce();
    expect(result.terminal).toBe(true);
    expect(result.run.lifecycle).toBe('cancelled');
  });

  it('fails run when transition is not allowed by definition', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.invalid-transition',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: (ctx) => ctx.transition('next'),
          next: () => {
            return;
          },
        },
        transitions: [{ from: 'start', to: 'other' }],
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const appendedEvents: EventInsert[] = [];
    const upsertRunSummary = vi.fn().mockResolvedValue({
      runId: 'wr_invalid',
      workflowType: 'wf.invalid-transition',
      workflowVersion: '1.0.0',
      lifecycle: 'failed',
      currentState: 'start',
      parentRunId: null,
      startedAt: '2026-02-21T00:00:00.000Z',
      endedAt: '2026-02-21T00:00:01.000Z',
    });

    const result = await runTransitionStep({
      client: {} as DbClient,
      deps: {
        registry,
        runRepository: {
          upsertRunSummary,
          getRunSummary: vi.fn(),
        },
        eventRepository: {
          appendEvent: vi.fn().mockImplementation(async (_client, input: EventInsert) => {
            appendedEvents.push(input);
            return {
              eventId: input.eventId,
              runId: input.runId,
              sequence: appendedEvents.length,
              eventType: input.eventType,
              timestamp: input.timestamp,
              payload: input.payload ?? null,
              error: input.error ?? null,
            };
          }),
        },
        eventIdFactory: () => `evt_${appendedEvents.length + 1}`,
        now: () => new Date('2026-02-21T00:00:01.000Z'),
      },
      run: {
        runId: 'wr_invalid',
        workflowType: 'wf.invalid-transition',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      },
    });

    expect(appendedEvents.map((event) => event.eventType)).toEqual([
      'transition.failed',
      'workflow.failed',
    ]);
    expect(upsertRunSummary).toHaveBeenCalledOnce();
    expect(result.terminal).toBe(true);
    expect(result.run.lifecycle).toBe('failed');
  });
});
