/**
 * ITX-WEB-017: Graph definition projection determinism.
 *
 * B-WEB-030: Deterministic node/edge projection and ID format rules.
 *
 * Validates that:
 * - Node/edge counts match definition counts exactly.
 * - IDs follow deterministic node/edge formats.
 * - Role classification and label precedence rules are honored.
 * - Invariant violations (duplicate states, unresolved refs) are detected.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  projectDefinitionToGraph,
  toNodeId,
  toEdgeId,
} from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import type { WorkflowDefinitionResponse } from '@composable-workflow/workflow-api-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const simpleDefinition: WorkflowDefinitionResponse = {
  workflowType: 'order-processing',
  workflowVersion: '1.0.0',
  states: ['pending', 'validating', 'approved', 'rejected'],
  transitions: [
    { from: 'pending', to: 'validating', name: 'start-validation' },
    { from: 'validating', to: 'approved', name: 'approve' },
    { from: 'validating', to: 'rejected', name: 'reject' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

const decisionDefinition: WorkflowDefinitionResponse = {
  workflowType: 'review-flow',
  workflowVersion: '2.0.0',
  states: ['init', 'review', 'accept', 'deny', 'escalate'],
  transitions: [
    { from: 'init', to: 'review' },
    { from: 'review', to: 'accept' },
    { from: 'review', to: 'deny' },
    { from: 'review', to: 'escalate' },
  ],
  childLaunchAnnotations: [{ parentState: 'escalate', childWorkflowType: 'escalation-handler' }],
  metadata: {},
};

const duplicateStateDefinition: WorkflowDefinitionResponse = {
  workflowType: 'buggy-wf',
  workflowVersion: '0.1.0',
  states: ['a', 'b', 'a'],
  transitions: [{ from: 'a', to: 'b' }],
  childLaunchAnnotations: [],
  metadata: {},
};

const unresolvedRefDefinition: WorkflowDefinitionResponse = {
  workflowType: 'broken-refs',
  workflowVersion: '0.1.0',
  states: ['s1', 's2'],
  transitions: [
    { from: 's1', to: 's2' },
    { from: 's1', to: 'ghost' },
    { from: 'phantom', to: 's2' },
  ],
  childLaunchAnnotations: [],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-017', () => {
  describe('node/edge count matching', () => {
    it('produces one node per unique state and one edge per transition', () => {
      const result = projectDefinitionToGraph(simpleDefinition);

      expect(result.nodes).toHaveLength(simpleDefinition.states.length);
      expect(result.edges).toHaveLength(simpleDefinition.transitions.length);
    });

    it('handles definitions with no transitions', () => {
      const def: WorkflowDefinitionResponse = {
        workflowType: 'lonely',
        workflowVersion: '1.0.0',
        states: ['only-state'],
        transitions: [],
        childLaunchAnnotations: [],
        metadata: {},
      };
      const result = projectDefinitionToGraph(def);
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
    });
  });

  describe('deterministic ID formats', () => {
    it('node IDs follow {workflowType}::state::{stateId}', () => {
      const result = projectDefinitionToGraph(simpleDefinition);

      for (const node of result.nodes) {
        const expected = toNodeId(simpleDefinition.workflowType, node.data.stateId);
        expect(node.id).toBe(expected);
        expect(node.id).toMatch(/^order-processing::state::/);
      }
    });

    it('edge IDs follow {workflowType}::edge::{from}::{to}::{ordinal}', () => {
      const result = projectDefinitionToGraph(simpleDefinition);

      for (const edge of result.edges) {
        expect(edge.id).toMatch(/^order-processing::edge::/);
      }

      // First transition: pending→validating ordinal 0
      expect(result.edges[0].id).toBe(toEdgeId('order-processing', 'pending', 'validating', 0));
    });

    it('parallel edges between same pair get distinct ordinals', () => {
      const def: WorkflowDefinitionResponse = {
        workflowType: 'multi-edge',
        workflowVersion: '1.0.0',
        states: ['a', 'b'],
        transitions: [
          { from: 'a', to: 'b', name: 'path-1' },
          { from: 'a', to: 'b', name: 'path-2' },
        ],
        childLaunchAnnotations: [],
        metadata: {},
      };
      const result = projectDefinitionToGraph(def);
      expect(result.edges[0].id).toBe(toEdgeId('multi-edge', 'a', 'b', 0));
      expect(result.edges[1].id).toBe(toEdgeId('multi-edge', 'a', 'b', 1));
    });

    it('projection is deterministic across repeated calls', () => {
      const a = projectDefinitionToGraph(simpleDefinition);
      const b = projectDefinitionToGraph(simpleDefinition);

      expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
      expect(a.edges.map((e) => e.id)).toEqual(b.edges.map((e) => e.id));
    });
  });

  describe('role classification', () => {
    it('first state is classified as initial', () => {
      const result = projectDefinitionToGraph(simpleDefinition);
      const initNode = result.nodes.find((n) => n.data.stateId === 'pending');
      expect(initNode?.data.role).toBe('initial');
    });

    it('states with no outbound transitions are terminal', () => {
      const result = projectDefinitionToGraph(simpleDefinition);
      const approved = result.nodes.find((n) => n.data.stateId === 'approved');
      const rejected = result.nodes.find((n) => n.data.stateId === 'rejected');
      expect(approved?.data.role).toBe('terminal');
      expect(rejected?.data.role).toBe('terminal');
    });

    it('states with >1 outbound transition are decision', () => {
      const result = projectDefinitionToGraph(decisionDefinition);
      const review = result.nodes.find((n) => n.data.stateId === 'review');
      expect(review?.data.role).toBe('decision');
    });

    it('states with exactly 1 outbound transition are standard', () => {
      // validating has 2 outbound (approve + reject) so it's decision.
      // Use a definition with a true single-outbound non-initial state.
      const def: WorkflowDefinitionResponse = {
        workflowType: 'linear',
        workflowVersion: '1.0.0',
        states: ['start', 'middle', 'end'],
        transitions: [
          { from: 'start', to: 'middle' },
          { from: 'middle', to: 'end' },
        ],
        childLaunchAnnotations: [],
        metadata: {},
      };
      const result = projectDefinitionToGraph(def);
      const middle = result.nodes.find((n) => n.data.stateId === 'middle');
      expect(middle?.data.role).toBe('standard');
    });

    it('node types map to role-specific React Flow types', () => {
      const linearDef: WorkflowDefinitionResponse = {
        workflowType: 'linear',
        workflowVersion: '1.0.0',
        states: ['start', 'middle', 'end'],
        transitions: [
          { from: 'start', to: 'middle' },
          { from: 'middle', to: 'end' },
        ],
        childLaunchAnnotations: [],
        metadata: {},
      };
      const result = projectDefinitionToGraph(linearDef);
      const initNode = result.nodes.find((n) => n.data.role === 'initial');
      const termNode = result.nodes.find((n) => n.data.role === 'terminal');
      const stdNode = result.nodes.find((n) => n.data.role === 'standard');

      expect(initNode?.type).toBe('fsmInitial');
      expect(termNode?.type).toBe('fsmTerminal');
      expect(stdNode?.type).toBe('fsmStandard');

      const decResult = projectDefinitionToGraph(decisionDefinition);
      const decNode = decResult.nodes.find((n) => n.data.role === 'decision');
      expect(decNode?.type).toBe('fsmDecision');
    });
  });

  describe('child-launch annotations (B-WEB-034)', () => {
    it('annotations are attached to the correct state node', () => {
      const result = projectDefinitionToGraph(decisionDefinition);
      const escalate = result.nodes.find((n) => n.data.stateId === 'escalate');
      expect(escalate?.data.childLaunchAnnotations).toHaveLength(1);
      expect(escalate?.data.childLaunchAnnotations[0]).toMatchObject({
        childWorkflowType: 'escalation-handler',
      });
    });

    it('states without annotations have empty array', () => {
      const result = projectDefinitionToGraph(decisionDefinition);
      const init = result.nodes.find((n) => n.data.stateId === 'init');
      expect(init?.data.childLaunchAnnotations).toEqual([]);
    });
  });

  describe('invariant violation detection (B-WEB-033)', () => {
    it('detects duplicate state IDs', () => {
      const result = projectDefinitionToGraph(duplicateStateDefinition);
      expect(result.invariantViolations).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'duplicate-state' })]),
      );
      // Duplicate nodes are not produced
      const stateIds = result.nodes.map((n) => n.data.stateId);
      expect(new Set(stateIds).size).toBe(stateIds.length);
    });

    it('detects unresolved transition references', () => {
      const result = projectDefinitionToGraph(unresolvedRefDefinition);
      const unresolved = result.invariantViolations.filter(
        (v) => v.kind === 'unresolved-transition-ref',
      );
      expect(unresolved).toHaveLength(2); // ghost + phantom
    });

    it('clean definitions produce no violations', () => {
      const result = projectDefinitionToGraph(simpleDefinition);
      expect(result.invariantViolations).toHaveLength(0);
    });
  });

  describe('edge labels', () => {
    it('edge label uses transition name when present', () => {
      const result = projectDefinitionToGraph(simpleDefinition);
      const startEdge = result.edges.find((e) => e.data?.transitionName === 'start-validation');
      expect(startEdge?.label).toBe('start-validation');
    });

    it('edge label is undefined when transition name is absent', () => {
      const result = projectDefinitionToGraph(decisionDefinition);
      const edges = result.edges.filter((e) => e.data?.transitionName === undefined);
      for (const edge of edges) {
        expect(edge.label).toBeUndefined();
      }
    });
  });
});
