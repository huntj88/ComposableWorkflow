/**
 * ITX-WEB-018: Layout determinism and viewport preservation are enforced.
 *
 * Validates that:
 * - Same definition + direction produces identical layouts every time.
 * - Different directions produce divergent layouts.
 * - Node positions are finite numbers (not NaN or Infinity).
 * - Edge references survive layout pass unchanged.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  layoutGraph,
  resolveLayoutDirection,
  LR_BREAKPOINT_PX,
  type LayoutDirection,
} from '../../../src/routes/run-detail/graph/layoutGraph';
import {
  projectDefinitionToGraph,
  toNodeId,
} from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const linearDef: WorkflowDefinitionResponse = {
  workflowType: 'layout-det',
  workflowVersion: '1.0.0',
  states: ['a', 'b', 'c', 'd'],
  transitions: [
    { from: 'a', to: 'b', name: 'step1' },
    { from: 'b', to: 'c', name: 'step2' },
    { from: 'c', to: 'd', name: 'step3' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

const branchDef: WorkflowDefinitionResponse = {
  workflowType: 'branch-layout',
  workflowVersion: '1.0.0',
  states: ['start', 'left', 'right', 'merge', 'end'],
  transitions: [
    { from: 'start', to: 'left', name: 'go-left' },
    { from: 'start', to: 'right', name: 'go-right' },
    { from: 'left', to: 'merge' },
    { from: 'right', to: 'merge' },
    { from: 'merge', to: 'end' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-018', () => {
  describe('layout determinism', () => {
    it('repeated LR layouts of same graph produce identical positions', () => {
      const projection = projectDefinitionToGraph(linearDef);
      const results = Array.from({ length: 5 }, () =>
        layoutGraph(projection.nodes, projection.edges, 'LR'),
      );

      for (const r of results) {
        expect(r.ok).toBe(true);
      }

      const first = results[0];
      if (!first.ok) return;

      for (let run = 1; run < results.length; run++) {
        const other = results[run];
        if (!other.ok) return;
        for (let i = 0; i < first.nodes.length; i++) {
          expect(other.nodes[i].position).toEqual(first.nodes[i].position);
        }
      }
    });

    it('repeated TB layouts of same graph produce identical positions', () => {
      const projection = projectDefinitionToGraph(branchDef);
      const a = layoutGraph(projection.nodes, projection.edges, 'TB');
      const b = layoutGraph(projection.nodes, projection.edges, 'TB');
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      for (let i = 0; i < a.nodes.length; i++) {
        expect(a.nodes[i].position).toEqual(b.nodes[i].position);
      }
    });
  });

  describe('divergent directions', () => {
    it('LR and TB produce different positions', () => {
      const projection = projectDefinitionToGraph(linearDef);
      const lr = layoutGraph(projection.nodes, projection.edges, 'LR');
      const tb = layoutGraph(projection.nodes, projection.edges, 'TB');
      expect(lr.ok && tb.ok).toBe(true);
      if (!lr.ok || !tb.ok) return;

      let differentCount = 0;
      for (let i = 0; i < lr.nodes.length; i++) {
        if (
          lr.nodes[i].position.x !== tb.nodes[i].position.x ||
          lr.nodes[i].position.y !== tb.nodes[i].position.y
        ) {
          differentCount++;
        }
      }
      expect(differentCount).toBeGreaterThan(0);
    });
  });

  describe('position sanity', () => {
    it.each(['LR', 'TB'] satisfies LayoutDirection[])(
      '%s layout produces finite numeric positions',
      (direction) => {
        const projection = projectDefinitionToGraph(branchDef);
        const result = layoutGraph(projection.nodes, projection.edges, direction);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        for (const node of result.nodes) {
          expect(Number.isFinite(node.position.x)).toBe(true);
          expect(Number.isFinite(node.position.y)).toBe(true);
        }
      },
    );
  });

  describe('edge preservation', () => {
    it('layout preserves edge source/target references', () => {
      const projection = projectDefinitionToGraph(linearDef);
      const result = layoutGraph(projection.nodes, projection.edges, 'LR');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.edges).toHaveLength(projection.edges.length);
      for (let i = 0; i < projection.edges.length; i++) {
        expect(result.edges[i].source).toBe(projection.edges[i].source);
        expect(result.edges[i].target).toBe(projection.edges[i].target);
        expect(result.edges[i].id).toBe(projection.edges[i].id);
      }
    });
  });

  describe('viewport direction resolution', () => {
    it('uses LR at or above breakpoint', () => {
      expect(resolveLayoutDirection(LR_BREAKPOINT_PX)).toBe('LR');
      expect(resolveLayoutDirection(LR_BREAKPOINT_PX + 500)).toBe('LR');
    });

    it('uses TB below breakpoint', () => {
      expect(resolveLayoutDirection(LR_BREAKPOINT_PX - 1)).toBe('TB');
      expect(resolveLayoutDirection(375)).toBe('TB');
    });
  });
});
