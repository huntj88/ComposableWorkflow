/**
 * ITX-WEB-031: Time-decayed transition highlighting behavior is deterministic.
 *
 * B-WEB-043: newest transitions highlight strongest; intensity decays over time.
 *
 * Validates that:
 * - Recent transitions have higher strokeWidth / opacity than old ones.
 * - At exactly HIGHLIGHT_DECAY_SECONDS, intensity reaches 0.
 * - Beyond decay window, edge animation is disabled.
 * - Zero elapsed time → maximum intensity.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  projectDefinitionToGraph,
  toEdgeId,
} from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import {
  applyOverlay,
  type OverlaySources,
} from '../../../src/routes/run-detail/graph/applyOverlay';
import { buildEventDto, fixtureTimestamp } from '../fixtures/workflowFixtures';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DECAY_SECONDS = 300; // 5 minutes — matches HIGHLIGHT_DECAY_SECONDS

const chainDef: WorkflowDefinitionResponse = {
  workflowType: 'decay-test',
  workflowVersion: '1.0.0',
  states: ['s1', 's2', 's3', 's4'],
  transitions: [
    { from: 's1', to: 's2', name: 't1' },
    { from: 's2', to: 's3', name: 't2' },
    { from: 's3', to: 's4', name: 't3' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildTransitionEvent = (seq: number, from: string, to: string, ts: string) =>
  buildEventDto(seq, {
    workflowType: 'decay-test',
    runId: 'wr_031',
    eventType: 'transition.completed',
    state: null,
    transition: { from, to, name: `${from}-${to}` },
    timestamp: ts,
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-031', () => {
  it('recent transition has higher strokeWidth than older one', () => {
    const { nodes, edges } = projectDefinitionToGraph(chainDef);

    const baseTime = new Date(fixtureTimestamp(0)).getTime();

    // t1 happened 250s ago, t2 happened 50s ago
    const nowMs = baseTime + 260_000;

    const sources: OverlaySources = {
      workflowType: 'decay-test',
      summary: null,
      events: {
        items: [
          buildTransitionEvent(1, 's1', 's2', fixtureTimestamp(10_000)), // 250s ago
          buildTransitionEvent(2, 's2', 's3', fixtureTimestamp(210_000)), // 50s ago
        ],
        nextCursor: 'cur_2',
      },
      streamFrames: [],
    };

    const result = applyOverlay(nodes, edges, sources, nowMs);
    const e1 = result.edges.find((e) => e.id === toEdgeId('decay-test', 's1', 's2', 0));
    const e2 = result.edges.find((e) => e.id === toEdgeId('decay-test', 's2', 's3', 0));

    // Both should have stroke styles set
    expect(e1?.style?.strokeWidth).toBeDefined();
    expect(e2?.style?.strokeWidth).toBeDefined();

    // More recent transition should have higher strokeWidth
    expect((e2?.style?.strokeWidth as number) ?? 0).toBeGreaterThan(
      (e1?.style?.strokeWidth as number) ?? 0,
    );
  });

  it('at exactly decay boundary, intensity is 0 → strokeWidth = 1', () => {
    const { nodes, edges } = projectDefinitionToGraph(chainDef);
    const baseTime = new Date(fixtureTimestamp(0)).getTime();
    const nowMs = baseTime + DECAY_SECONDS * 1000; // exactly at decay boundary

    const sources: OverlaySources = {
      workflowType: 'decay-test',
      summary: null,
      events: {
        items: [buildTransitionEvent(1, 's1', 's2', fixtureTimestamp(0))],
        nextCursor: 'cur_1',
      },
      streamFrames: [],
    };

    const result = applyOverlay(nodes, edges, sources, nowMs);
    const edge = result.edges.find((e) => e.id === toEdgeId('decay-test', 's1', 's2', 0));
    // Intensity = 0 → strokeWidth = 1 + 0*2 = 1
    expect(edge?.style?.strokeWidth).toBe(1);
    // Animation disabled when intensity <= 0.1
    expect(edge?.animated).toBe(false);
  });

  it('zero elapsed time → maximum intensity', () => {
    const { nodes, edges } = projectDefinitionToGraph(chainDef);
    const eventTs = fixtureTimestamp(5000);
    const nowMs = new Date(eventTs).getTime(); // same time as event

    const sources: OverlaySources = {
      workflowType: 'decay-test',
      summary: null,
      events: {
        items: [buildTransitionEvent(1, 's1', 's2', eventTs)],
        nextCursor: 'cur_1',
      },
      streamFrames: [],
    };

    const result = applyOverlay(nodes, edges, sources, nowMs);
    const edge = result.edges.find((e) => e.id === toEdgeId('decay-test', 's1', 's2', 0));
    // Intensity = 1.0 → strokeWidth = 1 + 1*2 = 3
    expect(edge?.style?.strokeWidth).toBe(3);
    expect(edge?.animated).toBe(true);
    // Opacity = 0.4 + 1*0.6 = 1.0
    expect(edge?.style?.opacity).toBe(1);
  });

  it('beyond decay window → animation is disabled', () => {
    const { nodes, edges } = projectDefinitionToGraph(chainDef);
    const baseTime = new Date(fixtureTimestamp(0)).getTime();
    const nowMs = baseTime + (DECAY_SECONDS + 60) * 1000; // 360s after event

    const sources: OverlaySources = {
      workflowType: 'decay-test',
      summary: null,
      events: {
        items: [buildTransitionEvent(1, 's1', 's2', fixtureTimestamp(0))],
        nextCursor: 'cur_1',
      },
      streamFrames: [],
    };

    const result = applyOverlay(nodes, edges, sources, nowMs);
    const edge = result.edges.find((e) => e.id === toEdgeId('decay-test', 's1', 's2', 0));
    expect(edge?.animated).toBe(false);
  });
});
