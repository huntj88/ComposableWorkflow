import { describe, expect, it } from 'vitest';

import {
  buildDynamicOverlay,
  filterRunTreeByDepth,
  projectRunTree,
} from '../../../src/read-models/run-tree-projection.js';

describe('run tree projection', () => {
  it('projects a nested run tree from nodes and links', () => {
    const tree = projectRunTree(
      'root',
      [
        {
          runId: 'root',
          workflowType: 'wf.root',
          workflowVersion: '1.0.0',
          lifecycle: 'running',
          currentState: 'start',
          parentRunId: null,
          startedAt: '2026-02-21T00:00:00.000Z',
          endedAt: null,
        },
        {
          runId: 'child',
          workflowType: 'wf.child',
          workflowVersion: '1.0.0',
          lifecycle: 'completed',
          currentState: 'done',
          parentRunId: 'root',
          startedAt: '2026-02-21T00:00:01.000Z',
          endedAt: '2026-02-21T00:00:02.000Z',
        },
      ],
      [
        {
          parentRunId: 'root',
          childRunId: 'child',
          parentState: 'start',
          createdAt: '2026-02-21T00:00:01.000Z',
          linkedByEventId: 'evt-child',
        },
      ],
    );

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].runId).toBe('child');
  });

  it('builds overlay edges from events and transition metadata', () => {
    const overlay = buildDynamicOverlay({
      runId: 'run-1',
      activeNode: 'b',
      transitions: [
        { from: 'a', to: 'b', name: 'to-b' },
        { from: 'b', to: 'c', name: 'to-c' },
      ],
      childLinks: [],
      events: [
        {
          sequence: 1,
          eventType: 'transition.completed',
          timestamp: '2026-02-21T00:00:01.000Z',
          payload: { from: 'a', to: 'b', name: 'to-b' },
        },
        {
          sequence: 2,
          eventType: 'transition.failed',
          timestamp: '2026-02-21T00:00:02.000Z',
          payload: { from: 'b', to: 'c', name: 'to-c' },
        },
      ],
    });

    expect(overlay.traversedEdges).toEqual([{ from: 'a', to: 'b', name: 'to-b' }]);
    expect(overlay.failedEdges).toEqual([{ from: 'b', to: 'c', name: 'to-c' }]);
    expect(overlay.pendingEdges).toEqual([]);
    expect(overlay.transitionTimeline).toHaveLength(2);
  });

  it('filters projected tree by depth recursively', () => {
    const root = projectRunTree(
      'root',
      [
        {
          runId: 'root',
          workflowType: 'wf.root',
          workflowVersion: '1.0.0',
          lifecycle: 'running',
          currentState: 'root-state',
          parentRunId: null,
          startedAt: '2026-02-21T00:00:00.000Z',
          endedAt: null,
        },
        {
          runId: 'child-a',
          workflowType: 'wf.child.a',
          workflowVersion: '1.0.0',
          lifecycle: 'running',
          currentState: 'child-state',
          parentRunId: 'root',
          startedAt: '2026-02-21T00:00:01.000Z',
          endedAt: null,
        },
        {
          runId: 'grandchild-a',
          workflowType: 'wf.child.b',
          workflowVersion: '1.0.0',
          lifecycle: 'completed',
          currentState: 'done',
          parentRunId: 'child-a',
          startedAt: '2026-02-21T00:00:02.000Z',
          endedAt: '2026-02-21T00:00:03.000Z',
        },
      ],
      [
        {
          parentRunId: 'root',
          childRunId: 'child-a',
          parentState: 'root-state',
          createdAt: '2026-02-21T00:00:01.000Z',
          linkedByEventId: 'evt-child-a',
        },
        {
          parentRunId: 'child-a',
          childRunId: 'grandchild-a',
          parentState: 'child-state',
          createdAt: '2026-02-21T00:00:02.000Z',
          linkedByEventId: 'evt-grandchild-a',
        },
      ],
    );

    const depthOne = filterRunTreeByDepth(root, 1);
    expect(depthOne.children).toHaveLength(1);
    expect(depthOne.children[0].children).toHaveLength(0);

    const depthTwo = filterRunTreeByDepth(root, 2);
    expect(depthTwo.children[0].children).toHaveLength(1);
  });
});
