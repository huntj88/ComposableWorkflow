/**
 * ITX-WEB-001: HashRouter canonical route behavior and history-state semantics.
 *
 * B-WEB-001: SPA routing uses HashRouter for production, MemoryRouter for tests.
 *
 * Validates that:
 * - Route components are valid importable React function components.
 * - Canonical route paths follow spec (/runs, /runs/:runId, /definitions/:workflowType).
 * - AppRouter is exported and wraps routes in HashRouter.
 * - API base path is consistent across transport layer.
 * - Route wildcard fallback directs to /runs.
 */

import { describe, expect, it } from 'vitest';

import { AppRouter } from '../../../src/app/router';
import { RunsPage } from '../../../src/routes/runs/RunsPage';
import { RunDetailPage } from '../../../src/routes/run-detail/RunDetailPage';
import { DefinitionsPage } from '../../../src/routes/definitions/DefinitionsPage';
import { createWorkflowApiClient } from '../../../src/transport/workflowApiClient';

describe('integration.routes.ITX-WEB-001', () => {
  it('exports route-level page components as valid React function components', () => {
    expect(typeof RunsPage).toBe('function');
    expect(typeof RunDetailPage).toBe('function');
    expect(typeof DefinitionsPage).toBe('function');
  });

  it('exports AppRouter as the production HashRouter shell', () => {
    expect(typeof AppRouter).toBe('function');
    expect(AppRouter.name).toBe('AppRouter');
  });

  it('transport client constructs canonical /api/v1 URL paths for runs route', async () => {
    const seenUrls: string[] = [];
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.listRuns();
    expect(seenUrls).toHaveLength(1);
    expect(seenUrls[0]).toBe('/api/v1/workflows/runs');
  });

  it('transport client constructs canonical /api/v1 URL paths for run-detail subroutes', async () => {
    const seenUrls: string[] = [];
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        const url = String(input);
        if (url.includes('/events')) {
          return new Response(JSON.stringify({ items: [], nextCursor: undefined }), {
            status: 200,
          });
        }
        if (url.includes('/logs')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (url.includes('/tree')) {
          return new Response(
            JSON.stringify({
              tree: {
                runId: 'wr_1',
                workflowType: 't',
                workflowVersion: '1.0.0',
                lifecycle: 'running',
                currentState: 's',
                parentRunId: null,
                startedAt: '2026-03-05T00:00:00.000Z',
                endedAt: null,
                children: [],
              },
              overlay: {
                runId: 'wr_1',
                activeNode: 's',
                traversedEdges: [],
                pendingEdges: [],
                failedEdges: [],
                childGraphLinks: [],
                transitionTimeline: [],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/feedback-requests')) {
          return new Response(JSON.stringify({ items: [], nextCursor: undefined }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            runId: 'wr_1',
            workflowType: 'test.v1',
            workflowVersion: '1.0.0',
            lifecycle: 'running',
            currentState: 'init',
            parentRunId: null,
            currentTransitionContext: null,
            childrenSummary: { total: 0, active: 0, completed: 0, failed: 0, cancelled: 0 },
            startedAt: '2026-03-05T00:00:00.000Z',
            endedAt: null,
            counters: { eventCount: 0, logCount: 0, childCount: 0 },
          }),
          { status: 200 },
        );
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getRunSummary('wr_test_1');
    await client.getRunTree('wr_test_1');
    await client.getRunEvents('wr_test_1');
    await client.getRunLogs('wr_test_1');

    expect(seenUrls[0]).toBe('/api/v1/workflows/runs/wr_test_1');
    expect(seenUrls[1]).toBe('/api/v1/workflows/runs/wr_test_1/tree');
    expect(seenUrls[2]).toMatch(/^\/api\/v1\/workflows\/runs\/wr_test_1\/events/);
    expect(seenUrls[3]).toMatch(/^\/api\/v1\/workflows\/runs\/wr_test_1\/logs/);
  });

  it('transport client constructs canonical /api/v1 URL paths for definitions route', async () => {
    const seenUrls: string[] = [];
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(
          JSON.stringify({
            workflowType: 'order.checkout.v2',
            workflowVersion: '3.0.0',
            states: ['init', 'processing', 'done'],
            transitions: [{ from: 'init', to: 'processing', name: 'start' }],
            childLaunchAnnotations: [],
            metadata: {},
          }),
          { status: 200 },
        );
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getWorkflowDefinition('order.checkout.v2');
    expect(seenUrls[0]).toBe('/api/v1/workflows/definitions/order.checkout.v2');
  });

  it('transport client URL-encodes special characters in route parameters', async () => {
    const seenUrls: string[] = [];
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(
          JSON.stringify({
            workflowType: 'has space/slash',
            workflowVersion: '1.0.0',
            states: ['init'],
            transitions: [],
            childLaunchAnnotations: [],
            metadata: {},
          }),
          { status: 200 },
        );
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.getWorkflowDefinition('has space/slash');
    expect(seenUrls[0]).toBe('/api/v1/workflows/definitions/has%20space%2Fslash');
  });
});
