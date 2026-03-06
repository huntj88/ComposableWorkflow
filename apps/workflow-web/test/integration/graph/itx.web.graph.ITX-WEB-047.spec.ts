/**
 * ITX-WEB-047: FSM graph relationship rendering and neighborhood highlighting.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { projectDefinitionToGraph } from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

const relationshipDefinition: WorkflowDefinitionResponse = {
  workflowType: 'relationship-test',
  workflowVersion: '1.0.0',
  states: ['start', 'reachable', 'terminal', 'orphan', 'unreachable'],
  transitions: [
    { from: 'start', to: 'reachable', name: 'first' },
    { from: 'start', to: 'reachable', name: 'second' },
    { from: 'reachable', to: 'terminal', name: 'finish' },
    { from: 'unreachable', to: 'terminal', name: 'late-join' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

describe('integration.graph.ITX-WEB-047', () => {
  it('preserves exact transition count and computes graph summary counts', () => {
    const projection = projectDefinitionToGraph(relationshipDefinition);

    expect(projection.edges).toHaveLength(relationshipDefinition.transitions.length);
    expect(projection.summary).toEqual({
      stateCount: 5,
      transitionCount: 4,
      unreachableStateCount: 2,
      terminalStateCount: 2,
      orphanStateCount: 1,
    });
  });

  it('marks orphan and unreachable states distinctly in node metadata', () => {
    const projection = projectDefinitionToGraph(relationshipDefinition);
    const orphan = projection.nodes.find((node) => node.data.stateId === 'orphan');
    const unreachable = projection.nodes.find((node) => node.data.stateId === 'unreachable');
    const reachable = projection.nodes.find((node) => node.data.stateId === 'reachable');

    expect(orphan?.data.isOrphan).toBe(true);
    expect(orphan?.data.isUnreachable).toBe(true);
    expect(unreachable?.data.isOrphan).toBe(false);
    expect(unreachable?.data.isUnreachable).toBe(true);
    expect(reachable?.data.isUnreachable).toBe(false);
  });

  it('retains parallel transitions as distinct edges with per-edge parallel metadata', () => {
    const projection = projectDefinitionToGraph(relationshipDefinition);
    const parallelEdges = projection.edges.filter(
      (edge) => edge.data?.fromState === 'start' && edge.data?.toState === 'reachable',
    );

    expect(parallelEdges).toHaveLength(2);
    expect(parallelEdges.map((edge) => edge.data?.parallelIndex)).toEqual([0, 1]);
    expect(parallelEdges.every((edge) => edge.data?.isParallel)).toBe(true);
    expect(parallelEdges.every((edge) => edge.data?.parallelCount === 2)).toBe(true);
  });
});
