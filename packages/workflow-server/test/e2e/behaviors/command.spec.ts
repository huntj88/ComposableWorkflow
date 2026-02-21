import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowContext } from '@composable-workflow/workflow-lib/contracts';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import { createE2eHarness, expectFourDimensions, listEvents, startWorkflow } from '../setup.js';

const COMMAND_OK_TYPE = 'e2e.command.ok.v1';
const COMMAND_NON_ZERO_FAIL_TYPE = 'e2e.command.nonzero.fail.v1';
const COMMAND_NON_ZERO_ALLOW_TYPE = 'e2e.command.nonzero.allow.v1';
const COMMAND_TIMEOUT_TYPE = 'e2e.command.timeout.v1';
const COMMAND_POLICY_BLOCK_TYPE = 'e2e.command.policy.block.v1';

describe('e2e.behaviors.command', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness({
      registerWorkflows: (registry) => {
        registry.register({
          workflowType: COMMAND_OK_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.runCommand({
                  command: 'node',
                  args: ['-e', 'process.stdout.write("cmd-ok")'],
                  timeoutMs: 2_000,
                });
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: COMMAND_NON_ZERO_FAIL_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.runCommand({
                  command: 'node',
                  args: ['-e', 'process.exit(9)'],
                });
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: COMMAND_NON_ZERO_ALLOW_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.runCommand({
                  command: 'node',
                  args: ['-e', 'process.exit(7)'],
                  allowNonZeroExit: true,
                });
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: COMMAND_TIMEOUT_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.runCommand({
                  command: 'node',
                  args: ['-e', 'setTimeout(() => process.exit(0), 1500)'],
                  timeoutMs: 25,
                });
                ctx.complete({ ok: true });
              },
            },
          }),
        });

        registry.register({
          workflowType: COMMAND_POLICY_BLOCK_TYPE,
          workflowVersion: '1.0.0',
          packageName: 'e2e-tests',
          packageVersion: '1.0.0',
          source: 'path',
          sourceValue: 'test',
          factory: () => ({
            initialState: 'start',
            states: {
              start: async (ctx: WorkflowContext<unknown, unknown>) => {
                await ctx.runCommand({
                  command: 'bash',
                  args: ['-lc', 'echo blocked'],
                });
                ctx.complete({ ok: true });
              },
            },
          }),
        });
      },
    });
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-CMD-001 emits command started/completed with persisted and observable captures', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const run = await startWorkflow({ harness, workflowType: COMMAND_OK_TYPE, input: {} });
    await harness.orchestrator.resumeRun(run.runId);

    const events = await listEvents(harness, run.runId);
    expect(events.some((event) => event.eventType === 'command.started')).toBe(true);
    expect(events.some((event) => event.eventType === 'command.completed')).toBe(true);

    const logsResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${run.runId}/logs`,
    });
    expect(logsResponse.statusCode).toBe(200);
    expect(logsResponse.json().items.length).toBeGreaterThan(0);

    await expectFourDimensions({ harness, runId: run.runId, expectedLifecycle: 'completed' });
  });

  it('B-CMD-002/B-CMD-003 handles non-zero and timeout outcomes by policy', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const nonZeroFail = await startWorkflow({
      harness,
      workflowType: COMMAND_NON_ZERO_FAIL_TYPE,
      input: {},
    });
    await harness.orchestrator.resumeRun(nonZeroFail.runId);
    const nonZeroFailEvents = await listEvents(harness, nonZeroFail.runId);
    expect(nonZeroFailEvents.some((event) => event.eventType === 'command.failed')).toBe(true);

    const nonZeroAllow = await startWorkflow({
      harness,
      workflowType: COMMAND_NON_ZERO_ALLOW_TYPE,
      input: {},
    });
    await harness.orchestrator.resumeRun(nonZeroAllow.runId);
    const nonZeroAllowEvents = await listEvents(harness, nonZeroAllow.runId);
    expect(nonZeroAllowEvents.some((event) => event.eventType === 'command.completed')).toBe(true);

    const timeoutRun = await startWorkflow({
      harness,
      workflowType: COMMAND_TIMEOUT_TYPE,
      input: {},
    });
    await harness.orchestrator.resumeRun(timeoutRun.runId);
    const timeoutEvents = await listEvents(harness, timeoutRun.runId);
    expect(timeoutEvents.some((event) => event.eventType === 'command.failed')).toBe(true);
    expect(
      timeoutEvents.some(
        (event) => event.eventType === 'command.failed' && Number(event.payload?.timeoutMs) > 0,
      ),
    ).toBe(true);
  });

  it('B-CMD-004 blocks policy-disallowed commands without spawning process', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const run = await startWorkflow({
      harness,
      workflowType: COMMAND_POLICY_BLOCK_TYPE,
      input: {},
    });
    await harness.orchestrator.resumeRun(run.runId);

    const events = await listEvents(harness, run.runId);
    const failedEvent = events.find((event) => event.eventType === 'command.failed');

    expect(failedEvent).toBeTruthy();
    expect(failedEvent?.error?.code).toBe('command.not-allowed');
    expect(failedEvent?.payload?.command).toBe('bash');
  });
});
