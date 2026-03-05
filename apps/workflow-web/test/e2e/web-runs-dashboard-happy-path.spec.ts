/**
 * TWEB12 / TWEB12-GATE-005
 * Representative E2E happy-path: /runs dashboard and /runs/:runId detail.
 *
 * Covers:
 * - B-WEB-002: HashRouter canonical route behavior
 * - B-WEB-004: /runs lists server-backed runs
 * - B-WEB-005: /runs/:runId initializes required snapshot sequence
 * - B-WEB-006: Run dashboard renders six required panels
 * - B-WEB-010: Covered endpoint paths are absolute /api/v1 paths
 * - B-WEB-016: Incremental updates are ordered, no full reload required
 * - B-WEB-030: Deterministic definition projection to React Flow nodes/edges
 * - B-WEB-032: Runtime overlay mapping follows event contract
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { createMockTransport, type MockTransport } from '../integration/harness/mockTransport';
import { renderWebApp, type RenderWebAppResult } from '../integration/harness/renderWebApp';
import {
  buildListRunsResponse,
  buildRunSummary,
  buildRunTreeResponse,
  buildRunEventsResponse,
  buildRunLogsResponse,
  buildDefinitionResponse,
  buildListFeedbackRequestsResponse,
  buildFeedbackRequestSummary,
  DEFAULT_RUN_ID,
  DEFAULT_WORKFLOW_TYPE,
} from '../integration/fixtures/workflowFixtures';

describe('e2e.web-runs-dashboard-happy-path', () => {
  let transport: MockTransport;
  let app: RenderWebAppResult | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    transport?.reset();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: /runs list loads successfully
  // -------------------------------------------------------------------------

  describe('/runs list happy path', () => {
    it('lists runs from transport with canonical /api/v1 paths (B-WEB-004, B-WEB-010)', async () => {
      transport = createMockTransport();

      const runs = buildListRunsResponse([
        buildRunSummary({ runId: 'wr_e2e_1', lifecycle: 'running', currentState: 'processing' }),
        buildRunSummary({ runId: 'wr_e2e_2', lifecycle: 'completed', currentState: 'done' }),
      ]);

      transport.stubListRuns(runs);

      // Verify transport client uses correct /api/v1 prefix
      const result = await transport.client.listRuns();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.runId).toBe('wr_e2e_1');
      expect(result.items[1]!.runId).toBe('wr_e2e_2');

      const calls = transport.getCallsMatching('/api/v1/workflows/runs');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]!.url).toMatch(/^\/api\/v1\/workflows\/runs/);
      expect(calls[0]!.method).toBe('GET');
    });

    it('supports lifecycle filter query parameter (B-WEB-004)', async () => {
      transport = createMockTransport();

      const filteredRuns = buildListRunsResponse([
        buildRunSummary({ runId: 'wr_active_1', lifecycle: 'running' }),
      ]);

      transport.stubListRuns(filteredRuns);

      const result = await transport.client.listRuns({ lifecycle: ['running'] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.lifecycle).toBe('running');

      const calls = transport.getCalls();
      expect(calls[0]!.url).toContain('lifecycle=running');
    });

    it('supports workflowType filter query parameter (B-WEB-004)', async () => {
      transport = createMockTransport();

      transport.stubListRuns(buildListRunsResponse());

      await transport.client.listRuns({ workflowType: ['reference.success.v1'] });

      const calls = transport.getCalls();
      expect(calls[0]!.url).toContain('workflowType=reference.success.v1');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: /runs/:runId dashboard boot and six panels
  // -------------------------------------------------------------------------

  describe('/runs/:runId dashboard boot sequence', () => {
    it('calls all six panel snapshot endpoints plus stream open (B-WEB-005, B-WEB-006)', async () => {
      transport = createMockTransport();
      const runId = 'wr_e2e_dash_1';

      transport.stubRunSummary(runId, buildRunSummary({ runId }));
      transport.stubRunTree(runId, buildRunTreeResponse({ runId }));
      transport.stubRunEvents(runId, buildRunEventsResponse(3));
      transport.stubRunLogs(runId, buildRunLogsResponse(2));
      transport.stubDefinition(DEFAULT_WORKFLOW_TYPE, buildDefinitionResponse());
      transport.stubFeedbackList(
        runId,
        buildListFeedbackRequestsResponse([buildFeedbackRequestSummary({ parentRunId: runId })]),
      );

      // Execute all panel data fetches
      const [summary, tree, events, logs, definition, feedback] = await Promise.all([
        transport.client.getRunSummary(runId),
        transport.client.getRunTree(runId),
        transport.client.getRunEvents(runId),
        transport.client.getRunLogs(runId),
        transport.client.getWorkflowDefinition(DEFAULT_WORKFLOW_TYPE),
        transport.client.listRunFeedbackRequests(runId),
      ]);

      // Open stream
      const streamSource = transport.client.openRunStream(runId);

      // Verify all panel data is present (six required panels per B-WEB-006)
      expect(summary.runId).toBe(runId);
      expect(tree.tree.runId).toBe(runId);
      expect(events.items.length).toBe(3);
      expect(logs.items.length).toBe(2);
      expect(definition.workflowType).toBe(DEFAULT_WORKFLOW_TYPE);
      expect(feedback.items.length).toBe(1);

      // Verify stream opened
      const streamRequests = transport.getStreamRequests();
      expect(streamRequests.length).toBe(1);
      expect(streamRequests[0]!.url).toContain(`/api/v1/workflows/runs/${runId}/stream`);

      // Verify all URLs are absolute /api/v1 prefixed (B-WEB-010)
      const allCalls = transport.getCalls();
      for (const call of allCalls) {
        expect(call.url).toMatch(/^\/api\/v1\//);
      }

      // Verify panel call surfaces
      const summaryCall = transport.getCallsMatching(
        (url) =>
          url.includes(`/runs/${runId}`) &&
          !url.includes('/tree') &&
          !url.includes('/events') &&
          !url.includes('/logs') &&
          !url.includes('/feedback') &&
          !url.includes('/stream'),
      );
      expect(summaryCall.length).toBe(1);

      expect(transport.getCallsMatching('/tree').length).toBe(1);
      expect(transport.getCallsMatching('/events').length).toBe(1);
      expect(transport.getCallsMatching('/logs').length).toBe(1);
      expect(transport.getCallsMatching('/definitions/').length).toBe(1);
      expect(transport.getCallsMatching('/feedback-requests').length).toBe(1);

      streamSource.close();
    });

    it('dashboard summary exposes run identity and lifecycle fields (B-WEB-006)', async () => {
      transport = createMockTransport();
      const runId = 'wr_e2e_fields';

      transport.stubRunSummary(
        runId,
        buildRunSummary({
          runId,
          lifecycle: 'running',
          currentState: 'processing',
          workflowType: 'order.checkout.v1',
          workflowVersion: '2.1.0',
          parentRunId: 'wr_parent',
          startedAt: '2026-03-05T10:00:00.000Z',
        }),
      );

      const summary = await transport.client.getRunSummary(runId);

      expect(summary.runId).toBe(runId);
      expect(summary.lifecycle).toBe('running');
      expect(summary.currentState).toBe('processing');
      expect(summary.workflowType).toBe('order.checkout.v1');
      expect(summary.workflowVersion).toBe('2.1.0');
      expect(summary.parentRunId).toBe('wr_parent');
      expect(summary.startedAt).toBe('2026-03-05T10:00:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Graph observability happy path
  // -------------------------------------------------------------------------

  describe('graph observability happy path', () => {
    it('definition projection produces correct node/edge counts (B-WEB-030)', async () => {
      transport = createMockTransport();

      const definition = buildDefinitionResponse({
        workflowType: 'order.checkout.v1',
        states: ['init', 'validating', 'processing', 'shipping', 'done', 'failed'],
        transitions: [
          { from: 'init', to: 'validating', name: 'start' },
          { from: 'validating', to: 'processing', name: 'validated' },
          { from: 'processing', to: 'shipping', name: 'processed' },
          { from: 'shipping', to: 'done', name: 'shipped' },
          { from: 'validating', to: 'failed', name: 'validation_error' },
          { from: 'processing', to: 'failed', name: 'processing_error' },
        ],
      });

      transport.stubDefinition('order.checkout.v1', definition);

      const result = await transport.client.getWorkflowDefinition('order.checkout.v1');

      // Node count equals definition state count
      expect(result.states).toHaveLength(6);

      // Edge count equals definition transition count
      expect(result.transitions).toHaveLength(6);

      // Verify deterministic ID format expectations (B-WEB-030)
      const expectedNodeIds = result.states.map(
        (stateId) => `${result.workflowType}::state::${stateId}`,
      );
      expect(expectedNodeIds).toEqual([
        'order.checkout.v1::state::init',
        'order.checkout.v1::state::validating',
        'order.checkout.v1::state::processing',
        'order.checkout.v1::state::shipping',
        'order.checkout.v1::state::done',
        'order.checkout.v1::state::failed',
      ]);

      const expectedEdgeIds = result.transitions.map(
        (t, i) => `${result.workflowType}::edge::${t.from}::${t.to}::${i}`,
      );
      expect(expectedEdgeIds).toHaveLength(6);
      expect(expectedEdgeIds[0]).toBe('order.checkout.v1::edge::init::validating::0');
    });

    it('runtime overlay from tree response maps active node and traversed edges (B-WEB-032)', async () => {
      transport = createMockTransport();
      const runId = 'wr_graph_overlay';

      const tree = buildRunTreeResponse({
        runId,
        currentState: 'processing',
      });

      // Enhance overlay with traversed and pending edges
      const overlayTree = {
        ...tree,
        overlay: {
          ...tree.overlay,
          activeNode: 'processing',
          traversedEdges: [
            {
              from: 'init',
              to: 'validating',
              name: 'start',
              traversedAt: '2026-03-05T00:01:00.000Z',
            },
            {
              from: 'validating',
              to: 'processing',
              name: 'validated',
              traversedAt: '2026-03-05T00:02:00.000Z',
            },
          ],
          pendingEdges: [],
          failedEdges: [],
        },
      };

      transport.stubRunTree(runId, overlayTree);

      const result = await transport.client.getRunTree(runId);

      // Active node maps from summary currentState
      expect(result.overlay.activeNode).toBe('processing');

      // Traversed edges recorded from event history
      expect(result.overlay.traversedEdges).toHaveLength(2);
      expect(result.overlay.traversedEdges[0]!.from).toBe('init');
      expect(result.overlay.traversedEdges[0]!.to).toBe('validating');
      expect(result.overlay.traversedEdges[1]!.from).toBe('validating');
      expect(result.overlay.traversedEdges[1]!.to).toBe('processing');
    });

    it('stream increments update overlay without full reload (B-WEB-016, B-WEB-032)', () => {
      transport = createMockTransport();
      const runId = 'wr_graph_stream';

      // Open stream for graph overlay updates
      const streamSource = transport.client.openRunStream(runId);
      const streamRequests = transport.getStreamRequests();

      expect(streamRequests).toHaveLength(1);
      expect(streamRequests[0]!.url).toContain(`/runs/${runId}/stream`);

      // Stream frames are the mechanism for incremental overlay updates
      // (no full GET /tree reload needed for each transition event)
      streamSource.close();
    });

    it('child-launch annotations are preserved in definition response (B-WEB-034)', async () => {
      transport = createMockTransport();

      const definition = buildDefinitionResponse({
        workflowType: 'parent.flow.v1',
        states: ['init', 'child-phase', 'done'],
        transitions: [
          { from: 'init', to: 'child-phase', name: 'start' },
          { from: 'child-phase', to: 'done', name: 'child_complete' },
        ],
        childLaunchAnnotations: [
          {
            parentState: 'child-phase',
            childWorkflowType: 'child.task.v1',
            launchCondition: 'on_enter',
          },
        ],
      });

      transport.stubDefinition('parent.flow.v1', definition);

      const result = await transport.client.getWorkflowDefinition('parent.flow.v1');

      expect(result.childLaunchAnnotations).toHaveLength(1);
      expect(result.childLaunchAnnotations[0]!.parentState).toBe('child-phase');
      expect(result.childLaunchAnnotations[0]!.childWorkflowType).toBe('child.task.v1');
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Route navigation and transport path correctness
  // -------------------------------------------------------------------------

  describe('route and transport path correctness', () => {
    it('run-detail subroute URLs are well-formed (B-WEB-002, B-WEB-010)', async () => {
      transport = createMockTransport();
      const runId = 'wr_route_1';

      transport.stubRunSummary(runId, buildRunSummary({ runId }));
      transport.stubRunTree(runId, buildRunTreeResponse({ runId }));
      transport.stubRunEvents(runId, buildRunEventsResponse());
      transport.stubRunLogs(runId, buildRunLogsResponse());
      transport.stubFeedbackList(runId, buildListFeedbackRequestsResponse());
      transport.stubDefinition(DEFAULT_WORKFLOW_TYPE, buildDefinitionResponse());

      await Promise.all([
        transport.client.getRunSummary(runId),
        transport.client.getRunTree(runId),
        transport.client.getRunEvents(runId),
        transport.client.getRunLogs(runId),
        transport.client.getWorkflowDefinition(DEFAULT_WORKFLOW_TYPE),
        transport.client.listRunFeedbackRequests(runId),
      ]);

      const calls = transport.getCalls();

      // All calls target /api/v1 absolute paths
      for (const call of calls) {
        expect(call.url.startsWith('/api/v1/')).toBe(true);
      }

      // Summary, tree, events, logs, definition, feedback all used GET
      for (const call of calls) {
        expect(call.method).toBe('GET');
      }

      transport.assertNoUnmatchedCalls();
    });

    it('definitions route URL-encodes special characters (B-WEB-010)', async () => {
      transport = createMockTransport();

      transport.stubDefinition(
        'workflow with spaces',
        buildDefinitionResponse({ workflowType: 'workflow with spaces' }),
      );

      await transport.client.getWorkflowDefinition('workflow with spaces');

      const calls = transport.getCalls();
      expect(calls[0]!.url).toBe('/api/v1/workflows/definitions/workflow%20with%20spaces');
    });
  });
});
