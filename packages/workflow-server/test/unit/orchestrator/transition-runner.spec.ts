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

  it('rehydrates transition data for same-state progression', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.rehydrate',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: (ctx) => {
            ctx.transition('loop', {
              index: 0,
              completed: [] as number[],
            });
          },
          loop: (ctx, rawData) => {
            const data = (rawData as { index?: number; completed?: number[] } | undefined) ?? {};
            const index = data.index ?? 0;
            const completed = data.completed ?? [];

            if (index >= 2) {
              ctx.complete({
                completed,
              });
              return;
            }

            ctx.transition('loop', {
              index: index + 1,
              completed: [...completed, index + 1],
            });
          },
        },
        transitions: [
          { from: 'start', to: 'loop' },
          { from: 'loop', to: 'loop' },
        ],
      }),
      packageName: 'pkg-test',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '.',
    });

    const appendedEvents: EventInsert[] = [];
    let currentRun = {
      runId: 'wr_rehydrate',
      workflowType: 'wf.rehydrate',
      workflowVersion: '1.0.0',
      lifecycle: 'running',
      currentState: 'start',
      parentRunId: null,
      startedAt: '2026-02-21T00:00:00.000Z',
      endedAt: null,
    };

    const eventRepository = {
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
      getLatestTransitionData: vi
        .fn()
        .mockImplementation(async (_client, runId: string, toState: string) => {
          for (let index = appendedEvents.length - 1; index >= 0; index -= 1) {
            const event = appendedEvents[index];
            if (event.runId !== runId || event.eventType !== 'transition.completed') {
              continue;
            }

            const payload = event.payload ?? {};
            if (payload.to !== toState) {
              continue;
            }

            return payload.data;
          }

          return undefined;
        }),
    };

    let terminal = false;
    let iterations = 0;

    while (!terminal && iterations < 10) {
      iterations += 1;
      const result = await runTransitionStep({
        client: {} as DbClient,
        deps: {
          registry,
          runRepository: {
            upsertRunSummary: vi.fn().mockImplementation(async (_client, summary) => {
              currentRun = summary;
              return summary;
            }),
            getRunSummary: vi.fn().mockImplementation(async () => currentRun),
          },
          eventRepository,
          eventIdFactory: () => `evt_${appendedEvents.length + 1}`,
          now: () => new Date('2026-02-21T00:00:01.000Z'),
        },
        run: currentRun,
      });

      currentRun = result.run;
      terminal = result.terminal;
    }

    expect(terminal).toBe(true);
    expect(currentRun.lifecycle).toBe('completed');
    expect(iterations).toBe(4);

    const completionEvent = appendedEvents.find(
      (event) => event.eventType === 'workflow.completed',
    );
    expect(completionEvent?.payload).toEqual({
      output: {
        completed: [1, 2],
      },
    });
  });
});
