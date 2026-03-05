/**
 * ITX-WEB-020: Child-launch annotation visualization is enforced.
 *
 * Validates that:
 * - Nodes with child-launch annotations carry the annotation metadata.
 * - Annotation parentState → node mapping is correct.
 * - Nodes without annotations have empty childLaunchAnnotations array.
 * - Multiple annotations on the same state are collected.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { projectDefinitionToGraph } from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const singleAnnotationDef: WorkflowDefinitionResponse = {
  workflowType: 'parent-wf',
  workflowVersion: '1.0.0',
  states: ['init', 'spawn', 'done'],
  transitions: [
    { from: 'init', to: 'spawn', name: 'start' },
    { from: 'spawn', to: 'done', name: 'finish' },
  ],
  childLaunchAnnotations: [{ parentState: 'spawn', childWorkflowType: 'child-a' }],
  metadata: {},
};

const multiAnnotationDef: WorkflowDefinitionResponse = {
  workflowType: 'multi-child-wf',
  workflowVersion: '1.0.0',
  states: ['init', 'fork', 'join', 'done'],
  transitions: [
    { from: 'init', to: 'fork' },
    { from: 'fork', to: 'join' },
    { from: 'join', to: 'done' },
  ],
  childLaunchAnnotations: [
    { parentState: 'fork', childWorkflowType: 'child-x' },
    { parentState: 'fork', childWorkflowType: 'child-y' },
    { parentState: 'join', childWorkflowType: 'child-z' },
  ],
  metadata: {},
};

const noAnnotationDef: WorkflowDefinitionResponse = {
  workflowType: 'simple-wf',
  workflowVersion: '1.0.0',
  states: ['a', 'b'],
  transitions: [{ from: 'a', to: 'b' }],
  childLaunchAnnotations: [],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-020', () => {
  it('single annotation is attached to the correct node', () => {
    const { nodes } = projectDefinitionToGraph(singleAnnotationDef);
    const spawnNode = nodes.find((n) => n.data.stateId === 'spawn');
    expect(spawnNode?.data.childLaunchAnnotations).toHaveLength(1);
    expect(spawnNode?.data.childLaunchAnnotations[0]).toMatchObject({
      childWorkflowType: 'child-a',
      parentState: 'spawn',
    });
  });

  it('multiple annotations on same state are collected', () => {
    const { nodes } = projectDefinitionToGraph(multiAnnotationDef);
    const forkNode = nodes.find((n) => n.data.stateId === 'fork');
    expect(forkNode?.data.childLaunchAnnotations).toHaveLength(2);
    const types = forkNode?.data.childLaunchAnnotations.map(
      (a) => (a as Record<string, string>).childWorkflowType,
    );
    expect(types).toEqual(['child-x', 'child-y']);
  });

  it('different states each carry their own annotations', () => {
    const { nodes } = projectDefinitionToGraph(multiAnnotationDef);
    const joinNode = nodes.find((n) => n.data.stateId === 'join');
    expect(joinNode?.data.childLaunchAnnotations).toHaveLength(1);
    expect(joinNode?.data.childLaunchAnnotations[0]).toMatchObject({
      childWorkflowType: 'child-z',
    });
  });

  it('nodes without annotations have empty array', () => {
    const { nodes } = projectDefinitionToGraph(singleAnnotationDef);
    const initNode = nodes.find((n) => n.data.stateId === 'init');
    expect(initNode?.data.childLaunchAnnotations).toEqual([]);
    const doneNode = nodes.find((n) => n.data.stateId === 'done');
    expect(doneNode?.data.childLaunchAnnotations).toEqual([]);
  });

  it('definition with no annotations → all nodes have empty array', () => {
    const { nodes } = projectDefinitionToGraph(noAnnotationDef);
    for (const node of nodes) {
      expect(node.data.childLaunchAnnotations).toEqual([]);
    }
  });
});
