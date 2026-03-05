/**
 * ITX-WEB-019: Overlay mapping and mismatch indicator behavior is enforced.
 *
 * Validates that:
 * - applyOverlay marks the summary currentState node as active.
 * - state.entered events promote nodes to active (demoting previous).
 * - transition.completed events mark edges as traversed with timestamp.
 * - transition.failed events mark edges as failed.
 * - Unknown state/edge references produce mismatch indicators.
 * - Stream frames layer on top of events in merge order.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  projectDefinitionToGraph,
  toNodeId,
  toEdgeId,
} from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import {
  applyOverlay,
  type OverlaySources,
} from '../../../src/routes/run-detail/graph/applyOverlay';
import {
  buildRunSummary,
  buildEventDto,
  buildDefinitionResponse,
  fixtureTimestamp,
} from '../fixtures/workflowFixtures';
import {
  OVERLAY_BASE_DEFINITION,
  UNKNOWN_STATE_SUMMARY,
  UNKNOWN_STATE_EXPECTED_MISMATCHES,
  buildUnknownStateEvent,
  buildUnknownEdgeEvent,
} from '../fixtures/graphInvariantFixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSources = (partial: Partial<OverlaySources>): OverlaySources => ({
  workflowType: partial.workflowType ?? OVERLAY_BASE_DEFINITION.workflowType,
  summary: partial.summary ?? null,
  events: partial.events ?? null,
  streamFrames: partial.streamFrames ?? [],
});

const NOW = new Date('2026-03-05T00:02:00.000Z').getTime();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-019', () => {
  describe('summary layer', () => {
    it('marks currentState node as active', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({
        summary: buildRunSummary({
          workflowType: 'overlay-test',
          currentState: 'active',
        }),
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      const activeNode = result.nodes.find((n) => n.id === toNodeId('overlay-test', 'active'));
      expect(activeNode?.style?.background).toBeDefined();
      expect(activeNode?.style?.color).toBe('#fff');
    });

    it('unknown currentState produces mismatch', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({ summary: UNKNOWN_STATE_SUMMARY });

      const result = applyOverlay(nodes, edges, sources, NOW);
      expect(result.mismatches).toEqual(UNKNOWN_STATE_EXPECTED_MISMATCHES);
    });
  });

  describe('events layer', () => {
    it('state.entered promotes node to active and demotes previous', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'overlay-test',
              runId: 'wr_019',
              eventType: 'state.entered',
              state: 'init',
              transition: null,
              timestamp: fixtureTimestamp(0),
            }),
            buildEventDto(2, {
              workflowType: 'overlay-test',
              runId: 'wr_019',
              eventType: 'state.entered',
              state: 'active',
              transition: null,
              timestamp: fixtureTimestamp(1000),
            }),
          ],
          nextCursor: 'cur_2',
        },
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      const activeNode = result.nodes.find((n) => n.id === toNodeId('overlay-test', 'active'));
      const initNode = result.nodes.find((n) => n.id === toNodeId('overlay-test', 'init'));

      // "active" state should be highlighted as active (white text)
      expect(activeNode?.style?.color).toBe('#fff');
      // "init" should be visited (not active), no white text
      expect(initNode?.style?.color).toBeUndefined();
    });

    it('transition.completed marks edge as traversed', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'overlay-test',
              runId: 'wr_019',
              eventType: 'transition.completed',
              state: null,
              transition: { from: 'init', to: 'active', name: 'start' },
              timestamp: fixtureTimestamp(0),
            }),
          ],
          nextCursor: 'cur_1',
        },
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      const edge = result.edges.find((e) => e.id === toEdgeId('overlay-test', 'init', 'active', 0));
      expect(edge?.style?.stroke).toBeDefined();
    });

    it('transition.failed marks edge with failed style', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'overlay-test',
              runId: 'wr_019',
              eventType: 'transition.failed',
              state: null,
              transition: { from: 'active', to: 'done', name: 'finish' },
              timestamp: fixtureTimestamp(0),
            }),
          ],
          nextCursor: 'cur_1',
        },
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      const edge = result.edges.find((e) => e.id === toEdgeId('overlay-test', 'active', 'done', 0));
      expect(edge?.style?.strokeDasharray).toBeDefined();
    });
  });

  describe('mismatch detection', () => {
    it('unknown state reference in events produces mismatch', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({
        events: {
          items: [buildUnknownStateEvent(1)],
          nextCursor: 'cur_1',
        },
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      expect(result.mismatches).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'unknown-state' })]),
      );
    });

    it('unknown edge reference in events produces mismatch', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({
        events: {
          items: [buildUnknownEdgeEvent(1)],
          nextCursor: 'cur_1',
        },
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      expect(result.mismatches).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'unknown-edge' })]),
      );
    });
  });

  describe('stream frames layer (merge order)', () => {
    it('stream frames overlay on top of events', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);

      // Events layer: init is active
      const sources = makeSources({
        events: {
          items: [
            buildEventDto(1, {
              workflowType: 'overlay-test',
              runId: 'wr_019',
              eventType: 'state.entered',
              state: 'init',
              transition: null,
              timestamp: fixtureTimestamp(0),
            }),
          ],
          nextCursor: 'cur_1',
        },
        streamFrames: [
          {
            event: 'workflow-event',
            id: 'cur_2',
            data: buildEventDto(2, {
              workflowType: 'overlay-test',
              runId: 'wr_019',
              eventType: 'state.entered',
              state: 'active',
              transition: null,
              timestamp: fixtureTimestamp(5000),
            }),
          },
        ],
      });

      const result = applyOverlay(nodes, edges, sources, NOW);
      // Stream frame should make 'active' the current active node
      const activeNode = result.nodes.find((n) => n.id === toNodeId('overlay-test', 'active'));
      expect(activeNode?.style?.color).toBe('#fff');

      // 'init' should be demoted to visited
      const initNode = result.nodes.find((n) => n.id === toNodeId('overlay-test', 'init'));
      expect(initNode?.style?.color).toBeUndefined();
    });
  });

  describe('idle defaults', () => {
    it('no sources → all nodes idle, all edges idle, no mismatches', () => {
      const { nodes, edges } = projectDefinitionToGraph(OVERLAY_BASE_DEFINITION);
      const sources = makeSources({});
      const result = applyOverlay(nodes, edges, sources, NOW);

      expect(result.mismatches).toHaveLength(0);
      // Idle nodes have no style overrides
      for (const node of result.nodes) {
        expect(node.style?.color).toBeUndefined();
      }
    });
  });
});
