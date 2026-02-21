import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

import type { WorkflowPackageSource } from '../../src/config.js';
import type { IntegrationHarness, IntegrationHarnessOptions } from '../harness/create-harness.js';
import { createIntegrationHarness } from '../harness/create-harness.js';

export const SUCCESS_WORKFLOW_TYPE = 'reference.success.v1';
export const FAILURE_WORKFLOW_TYPE = 'reference.failure.v1';
export const PARENT_CHILD_WORKFLOW_TYPE = 'reference.parent-child.v1';
export const COMMAND_WORKFLOW_TYPE = 'reference.command.v1';
export const LONG_RUNNING_WORKFLOW_TYPE = 'reference.long-running.v1';

export const createReferencePackageSource = (): WorkflowPackageSource => ({
  source: 'path',
  value: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/workflow-package-reference',
  ),
});

export const createE2eHarness = async (
  options: IntegrationHarnessOptions = {},
): Promise<IntegrationHarness> => {
  return createIntegrationHarness({
    ...options,
    packageSources: options.packageSources ?? [createReferencePackageSource()],
  });
};

export const startWorkflow = async (params: {
  harness: IntegrationHarness;
  workflowType: string;
  input: unknown;
  idempotencyKey?: string;
}) => {
  const response = await params.harness.server.inject({
    method: 'POST',
    url: '/api/v1/workflows/start',
    payload: {
      workflowType: params.workflowType,
      input: params.input,
      idempotencyKey: params.idempotencyKey,
    },
  });

  expect([200, 201]).toContain(response.statusCode);
  return response.json() as {
    runId: string;
    lifecycle: string;
    workflowType: string;
    workflowVersion: string;
    currentState: string;
  };
};

export const getRunSummary = async (harness: IntegrationHarness, runId: string) => {
  const response = await harness.server.inject({
    method: 'GET',
    url: `/api/v1/workflows/runs/${runId}`,
  });

  expect(response.statusCode).toBe(200);
  return response.json() as {
    runId: string;
    lifecycle: string;
    workflowType: string;
    workflowVersion: string;
    currentState: string;
    parentRunId: string | null;
    counters: {
      eventCount: number;
      logCount: number;
      childCount: number;
    };
  };
};

export const listEvents = async (harness: IntegrationHarness, runId: string) => {
  const all: Array<{
    eventId: string;
    runId: string;
    sequence: number;
    eventType: string;
    timestamp: string;
    payload: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> = [];

  let cursor: string | undefined;
  while (true) {
    const pageResponse = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/runs/${runId}/events${
        cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=50` : '?limit=50'
      }`,
    });

    expect(pageResponse.statusCode).toBe(200);
    const page = pageResponse.json() as {
      items: Array<{
        eventId: string;
        runId: string;
        sequence: number;
        eventType: string;
        timestamp: string;
        payload: Record<string, unknown> | null;
        error: Record<string, unknown> | null;
      }>;
      nextCursor?: string;
    };

    all.push(...page.items);
    if (!page.nextCursor) {
      break;
    }

    cursor = page.nextCursor;
  }

  return all;
};

export const expectMonotonicSequences = (sequences: number[]) => {
  for (let index = 1; index < sequences.length; index += 1) {
    expect(sequences[index]).toBeGreaterThan(sequences[index - 1]);
  }
};

const isTerminalLifecycle = (lifecycle: string): boolean =>
  ['completed', 'failed', 'cancelled'].includes(lifecycle);

export const advanceRunToTerminal = async (
  harness: IntegrationHarness,
  runId: string,
  maxIterations = 20,
) => {
  let summary = await getRunSummary(harness, runId);

  for (
    let iteration = 0;
    iteration < maxIterations && !isTerminalLifecycle(summary.lifecycle);
    iteration += 1
  ) {
    await harness.orchestrator.resumeRun(runId);
    summary = await getRunSummary(harness, runId);
  }

  return summary;
};

export const expectFourDimensions = async (params: {
  harness: IntegrationHarness;
  runId: string;
  expectedLifecycle?: string;
}) => {
  const summary = await getRunSummary(params.harness, params.runId);
  if (params.expectedLifecycle) {
    expect(summary.lifecycle).toBe(params.expectedLifecycle);
  }

  const persisted = await params.harness.db.pool.query<{
    lifecycle: string;
    current_state: string;
  }>('SELECT lifecycle, current_state FROM workflow_runs WHERE run_id = $1', [params.runId]);
  expect(persisted.rowCount).toBe(1);
  expect(persisted.rows[0]?.lifecycle).toBe(summary.lifecycle);

  const events = await listEvents(params.harness, params.runId);
  expect(events.length).toBeGreaterThan(0);
  expectMonotonicSequences(events.map((event) => event.sequence));

  const diagnostics = params.harness.diagnostics.snapshot(params.runId);
  expect(diagnostics.logs.length).toBeGreaterThan(0);
  expect(diagnostics.traces.length).toBeGreaterThan(0);
  expect(params.harness.diagnostics.snapshot().metrics.length).toBeGreaterThan(0);

  return {
    summary,
    events,
    diagnostics,
  };
};
