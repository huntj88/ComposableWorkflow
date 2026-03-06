/**
 * ITX-WEB-048: Iteration-aware child drill-down selector.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  asChildLaunchAnnotation,
  collectChildLaunchIterations,
  resolveChildDrilldownTarget,
} from '../../../src/routes/run-detail/graph/resolveChildDrilldownTarget';
import {
  buildEventDto,
  buildRunEventsResponse,
  buildRunTreeNode,
  buildRunTreeResponse,
} from '../fixtures/workflowFixtures';

describe('integration.graph.ITX-WEB-048', () => {
  it('orders iteration entries by matching child.started event sequence ascending', () => {
    const annotation = asChildLaunchAnnotation({
      parentState: 'spawn-child',
      childWorkflowType: 'child.workflow.v1',
    });

    const tree = buildRunTreeResponse({
      runId: 'wr_root',
      workflowType: 'root.workflow.v1',
      children: [
        buildRunTreeNode({
          runId: 'wr_child_1',
          workflowType: 'child.workflow.v1',
          lifecycle: 'completed',
          parentRunId: 'wr_root',
        }),
      ],
    });
    tree.overlay.childGraphLinks = [
      {
        parentRunId: 'wr_root',
        childRunId: 'wr_child_1',
        parentState: 'spawn-child',
        createdAt: '2026-03-05T00:00:01.000Z',
        linkedByEventId: 'evt_child_1',
      },
    ];

    const events = buildRunEventsResponse(0);
    events.items = [
      buildEventDto(20, {
        runId: 'wr_root',
        workflowType: 'root.workflow.v1',
        eventType: 'child.started',
        state: 'spawn-child',
        child: {
          childRunId: 'wr_child_2_missing',
          childWorkflowType: 'child.workflow.v1',
          lifecycle: 'failed',
        },
        transition: null,
        timestamp: '2026-03-05T00:00:20.000Z',
      }),
      buildEventDto(10, {
        runId: 'wr_root',
        workflowType: 'root.workflow.v1',
        eventType: 'child.started',
        state: 'spawn-child',
        child: {
          childRunId: 'wr_child_1',
          childWorkflowType: 'child.workflow.v1',
          lifecycle: 'completed',
        },
        transition: null,
        timestamp: '2026-03-05T00:00:10.000Z',
      }),
    ];

    const iterations = collectChildLaunchIterations({
      annotation: annotation!,
      tree,
      events,
    });

    expect(iterations).toHaveLength(2);
    expect(iterations.map((iteration) => iteration.sequence)).toEqual([10, 20]);
    expect(iterations.map((iteration) => iteration.iteration)).toEqual([1, 2]);
    expect(iterations[0]).toMatchObject({
      childRunId: 'wr_child_1',
      lifecycle: 'completed',
    });
    expect(iterations[1]).toMatchObject({
      childRunId: 'wr_child_2_missing',
      lifecycle: 'failed',
    });
  });

  it('falls back to the static definition route when the selected iteration has no runtime child', () => {
    const annotation = asChildLaunchAnnotation({
      parentState: 'spawn-child',
      childWorkflowType: 'child.workflow.v1',
    });

    const tree = buildRunTreeResponse({
      runId: 'wr_root',
      workflowType: 'root.workflow.v1',
      children: [],
    });

    const events = buildRunEventsResponse(0);
    events.items = [
      buildEventDto(1, {
        runId: 'wr_root',
        workflowType: 'root.workflow.v1',
        eventType: 'child.started',
        state: 'spawn-child',
        child: {
          childRunId: 'wr_missing_child',
          childWorkflowType: 'child.workflow.v1',
          lifecycle: 'failed',
        },
        transition: null,
        timestamp: '2026-03-05T00:00:01.000Z',
      }),
    ];

    const target = resolveChildDrilldownTarget({
      annotation: annotation!,
      tree,
      events,
      iteration: 1,
    });

    expect(target).toEqual({
      kind: 'definition',
      path: '/definitions/child.workflow.v1',
      workflowType: 'child.workflow.v1',
      reason: 'missing-iteration',
    });
  });
});
