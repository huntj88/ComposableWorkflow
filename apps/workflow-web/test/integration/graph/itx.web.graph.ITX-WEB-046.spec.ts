/**
 * ITX-WEB-046: Child drill-down resolution, breadcrumb, and history behavior.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error test dependency is available in the workspace runtime.
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { FsmGraphBreadcrumbs } from '../../../src/routes/run-detail/components/FsmGraphBreadcrumbs';
import {
  asChildLaunchAnnotation,
  resolveChildDrilldownTarget,
} from '../../../src/routes/run-detail/graph/resolveChildDrilldownTarget';
import { buildRunTreeNode, buildRunTreeResponse } from '../fixtures/workflowFixtures';

describe('integration.graph.ITX-WEB-046', () => {
  it('resolves child drill-down to a runtime run route when a matching child exists', () => {
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
          lifecycle: 'running',
          parentRunId: 'wr_root',
        }),
      ],
    });
    tree.overlay.childGraphLinks = [
      {
        parentRunId: 'wr_root',
        childRunId: 'wr_child_1',
        parentState: 'spawn-child',
        createdAt: '2026-03-05T00:00:00.000Z',
        linkedByEventId: 'evt_child_1',
      },
    ];

    expect(annotation).not.toBeNull();
    const target = resolveChildDrilldownTarget({
      annotation: annotation!,
      tree,
      events: null,
    });

    expect(target).toEqual({
      kind: 'run',
      path: '/runs/wr_child_1',
      runId: 'wr_child_1',
      childWorkflowType: 'child.workflow.v1',
      lifecycle: 'running',
    });
  });

  it('falls back to the static definition route when no matching runtime child exists', () => {
    const annotation = asChildLaunchAnnotation({
      parentState: 'spawn-child',
      childWorkflowType: 'child.workflow.v1',
    });

    const target = resolveChildDrilldownTarget({
      annotation: annotation!,
      tree: buildRunTreeResponse({ runId: 'wr_root', workflowType: 'root.workflow.v1' }),
      events: null,
    });

    expect(target).toEqual({
      kind: 'definition',
      path: '/definitions/child.workflow.v1',
      workflowType: 'child.workflow.v1',
      reason: 'annotation-only',
    });
  });

  it('renders ancestor breadcrumbs with clickable links for prior graph contexts', () => {
    render(
      createElement(
        MemoryRouter,
        null,
        createElement(FsmGraphBreadcrumbs, {
          items: [
            {
              key: 'root',
              label: 'root.workflow.v1 · wr_root',
              to: '/runs/wr_root',
              state: { graphAncestors: [] },
            },
            {
              key: 'child',
              label: 'child.workflow.v1 · wr_child_1',
            },
          ],
        }),
      ),
    );

    expect(screen.getByTestId('graph-breadcrumbs')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'root.workflow.v1 · wr_root' })).toBeTruthy();
    expect(screen.getByText('child.workflow.v1 · wr_child_1')).toBeTruthy();
  });
});
