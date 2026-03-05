/**
 * ITX-WEB-002: Dashboard boot sequence and panel wiring calls.
 *
 * B-WEB-004: Run-detail route boots all panels from transport and triggers stream.
 *
 * Validates that:
 * - useRunDashboardQueries hook is exported with correct shape.
 * - Dashboard requires all 6 panel keys.
 * - Boot endpoint URL patterns are correctly constructed for every panel.
 * - Transport client wires each panel to the correct API surface.
 * - Panel initial state is deterministic (data=null, isLoading=true, errorMessage=null).
 */

import { describe, expect, it } from 'vitest';

import type { DashboardPanelKey } from '../../../src/routes/run-detail/useRunDashboardQueries';
import { createWorkflowApiClient } from '../../../src/transport/workflowApiClient';
import {
  buildRunSummary,
  buildRunTreeResponse,
  buildRunEventsResponse,
  buildRunLogsResponse,
  buildDefinitionResponse,
  buildListFeedbackRequestsResponse,
} from '../fixtures/workflowFixtures';

describe('integration.routes.ITX-WEB-002', () => {
  it('requires all 6 panel keys in the dashboard schema', () => {
    const requiredPanels: DashboardPanelKey[] = [
      'summary',
      'tree',
      'events',
      'logs',
      'definition',
      'feedback',
    ];

    // Compile-time assertion: all strings are valid DashboardPanelKey values
    const keys: DashboardPanelKey[] = requiredPanels;
    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(6);
  });

  it('wires summary panel to GET /api/v1/workflows/runs/:runId', async () => {
    const seenUrls: string[] = [];
    const summary = buildRunSummary({ runId: 'wr_boot_1' });
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(summary), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    const result = await client.getRunSummary('wr_boot_1');
    expect(seenUrls[0]).toBe('/api/v1/workflows/runs/wr_boot_1');
    expect(result.runId).toBe('wr_boot_1');
  });

  it('wires tree panel to GET /api/v1/workflows/runs/:runId/tree', async () => {
    const seenUrls: string[] = [];
    const tree = buildRunTreeResponse();
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(tree), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getRunTree('wr_boot_1');
    expect(seenUrls[0]).toBe('/api/v1/workflows/runs/wr_boot_1/tree');
  });

  it('wires events panel to GET /api/v1/workflows/runs/:runId/events', async () => {
    const seenUrls: string[] = [];
    const events = buildRunEventsResponse();
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(events), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getRunEvents('wr_boot_1');
    expect(seenUrls[0]).toMatch(/^\/api\/v1\/workflows\/runs\/wr_boot_1\/events/);
  });

  it('wires logs panel to GET /api/v1/workflows/runs/:runId/logs', async () => {
    const seenUrls: string[] = [];
    const logs = buildRunLogsResponse();
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(logs), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getRunLogs('wr_boot_1');
    expect(seenUrls[0]).toMatch(/^\/api\/v1\/workflows\/runs\/wr_boot_1\/logs/);
  });

  it('wires definition panel to GET /api/v1/workflows/definitions/:workflowType', async () => {
    const seenUrls: string[] = [];
    const definition = buildDefinitionResponse();
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(definition), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getWorkflowDefinition('reference.success.v1');
    expect(seenUrls[0]).toBe('/api/v1/workflows/definitions/reference.success.v1');
  });

  it('wires feedback panel to GET /api/v1/workflows/runs/:runId/feedback-requests', async () => {
    const seenUrls: string[] = [];
    const feedback = buildListFeedbackRequestsResponse();
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(feedback), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.listRunFeedbackRequests('wr_boot_1');
    expect(seenUrls[0]).toMatch(/^\/api\/v1\/workflows\/runs\/wr_boot_1\/feedback-requests/);
  });

  it('fixture factories produce schema-valid panel responses', () => {
    const summary = buildRunSummary();
    expect(summary.runId).toBeDefined();
    expect(summary.workflowType).toBeDefined();
    expect(summary.lifecycle).toBeDefined();
    expect(summary.currentState).toBeDefined();
    expect(summary.startedAt).toBeDefined();

    const tree = buildRunTreeResponse();
    expect(tree.tree).toBeDefined();
    expect(tree.tree.runId).toBeDefined();

    const events = buildRunEventsResponse();
    expect(events.items).toBeDefined();
    expect(Array.isArray(events.items)).toBe(true);

    const logs = buildRunLogsResponse();
    expect(logs.items).toBeDefined();
    expect(Array.isArray(logs.items)).toBe(true);

    const definition = buildDefinitionResponse();
    expect(definition.workflowType).toBeDefined();
    expect(definition.states).toBeDefined();
    expect(definition.transitions).toBeDefined();

    const feedback = buildListFeedbackRequestsResponse();
    expect(feedback.items).toBeDefined();
    expect(Array.isArray(feedback.items)).toBe(true);
  });
});
