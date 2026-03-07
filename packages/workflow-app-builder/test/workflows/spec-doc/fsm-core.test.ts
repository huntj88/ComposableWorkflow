import { describe, expect, it } from 'vitest';

import {
  SPEC_DOC_STATES,
  type SpecDocState,
  createInitialStateData,
} from '../../../src/workflows/spec-doc/state-data.js';
import {
  SPEC_DOC_WORKFLOW_TYPE,
  SPEC_DOC_WORKFLOW_VERSION,
  specDocTransitions,
  ALLOWED_EDGES,
  isAllowedTransition,
  createSpecDocWorkflowDefinition,
  specDocWorkflowRegistration,
} from '../../../src/workflows/spec-doc/workflow.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All canonical FSM states (excluding synthetic 'start'). */
const CANONICAL_STATES: readonly SpecDocState[] = SPEC_DOC_STATES;

/** Build a from→Set<to> adjacency map from the transition descriptors. */
function buildAdjacency(): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const t of specDocTransitions) {
    if (!adj.has(t.from)) adj.set(t.from, new Set());
    adj.get(t.from)!.add(t.to);
  }
  return adj;
}

/** BFS reachability from a source node. */
function reachableFrom(source: string, adj: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const queue = [source];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// SD-FSM-001 – Workflow Identity
// ---------------------------------------------------------------------------

describe('SD-FSM-001 – Workflow Identity', () => {
  it('workflowType matches spec section 4', () => {
    expect(SPEC_DOC_WORKFLOW_TYPE).toBe('app-builder.spec-doc.v1');
  });

  it('workflowVersion matches spec section 4', () => {
    expect(SPEC_DOC_WORKFLOW_VERSION).toBe('1.0.0');
  });

  it('registration exports correct identity', () => {
    expect(specDocWorkflowRegistration.workflowType).toBe(SPEC_DOC_WORKFLOW_TYPE);
    expect(specDocWorkflowRegistration.workflowVersion).toBe(SPEC_DOC_WORKFLOW_VERSION);
  });
});

// ---------------------------------------------------------------------------
// SD-FSM-002 – Canonical State Set
// ---------------------------------------------------------------------------

describe('SD-FSM-002 – Canonical State Set', () => {
  it('declares exactly six states from spec section 6.2', () => {
    expect(CANONICAL_STATES).toHaveLength(6);
    expect(CANONICAL_STATES).toEqual([
      'IntegrateIntoSpec',
      'LogicalConsistencyCheckCreateFollowUpQuestions',
      'NumberedOptionsHumanRequest',
      'ClassifyCustomPrompt',
      'ExpandQuestionWithClarification',
      'Done',
    ]);
  });

  it('workflow definition declares a handler for every canonical state plus start', () => {
    const def = createSpecDocWorkflowDefinition();
    for (const state of CANONICAL_STATES) {
      expect(def.states).toHaveProperty(state);
    }
    expect(def.states).toHaveProperty('start');
  });
});

// ---------------------------------------------------------------------------
// SD-FSM-003 – Guarded Transitions
// ---------------------------------------------------------------------------

describe('SD-FSM-003 – Guarded Transitions', () => {
  const adj = buildAdjacency();
  const reachable = reachableFrom('start', adj);

  it('every canonical state is reachable from start', () => {
    for (const state of CANONICAL_STATES) {
      expect(reachable.has(state)).toBe(true);
    }
  });

  it('Done is reachable only from NumberedOptionsHumanRequest (section 10.1)', () => {
    const sourcesToDone = specDocTransitions.filter((t) => t.to === 'Done').map((t) => t.from);
    expect(sourcesToDone).toEqual(['NumberedOptionsHumanRequest']);
  });

  it('LogicalConsistencyCheckCreateFollowUpQuestions never transitions directly to Done (section 10.1)', () => {
    expect(isAllowedTransition('LogicalConsistencyCheckCreateFollowUpQuestions', 'Done')).toBe(
      false,
    );
  });

  it('LogicalConsistencyCheckCreateFollowUpQuestions transitions only to NumberedOptionsHumanRequest (section 10.1)', () => {
    const targets = specDocTransitions
      .filter((t) => t.from === 'LogicalConsistencyCheckCreateFollowUpQuestions')
      .map((t) => t.to)
      .sort();
    expect(targets).toEqual(['IntegrateIntoSpec', 'NumberedOptionsHumanRequest'].sort());
  });

  it('ClassifyCustomPrompt transitions only to NumberedOptionsHumanRequest or ExpandQuestionWithClarification', () => {
    const targets = specDocTransitions
      .filter((t) => t.from === 'ClassifyCustomPrompt')
      .map((t) => t.to)
      .sort();
    expect(targets).toEqual(
      ['ExpandQuestionWithClarification', 'NumberedOptionsHumanRequest'].sort(),
    );
  });

  it('ExpandQuestionWithClarification transitions only to NumberedOptionsHumanRequest', () => {
    const targets = specDocTransitions
      .filter((t) => t.from === 'ExpandQuestionWithClarification')
      .map((t) => t.to);
    expect(targets).toEqual(['NumberedOptionsHumanRequest']);
  });

  it('NumberedOptionsHumanRequest has exactly four outbound edges', () => {
    const targets = specDocTransitions
      .filter((t) => t.from === 'NumberedOptionsHumanRequest')
      .map((t) => t.to)
      .sort();
    expect(targets).toEqual(
      ['ClassifyCustomPrompt', 'Done', 'IntegrateIntoSpec', 'NumberedOptionsHumanRequest'].sort(),
    );
  });

  it('IntegrateIntoSpec transitions only to LogicalConsistencyCheckCreateFollowUpQuestions', () => {
    const targets = specDocTransitions
      .filter((t) => t.from === 'IntegrateIntoSpec')
      .map((t) => t.to);
    expect(targets).toEqual(['LogicalConsistencyCheckCreateFollowUpQuestions']);
  });

  it('prevents forbidden edges by construction', () => {
    const forbiddenEdges: [string, string][] = [
      ['IntegrateIntoSpec', 'Done'],
      ['IntegrateIntoSpec', 'NumberedOptionsHumanRequest'],
      ['IntegrateIntoSpec', 'ClassifyCustomPrompt'],
      ['LogicalConsistencyCheckCreateFollowUpQuestions', 'Done'],
      ['LogicalConsistencyCheckCreateFollowUpQuestions', 'ClassifyCustomPrompt'],
      ['ClassifyCustomPrompt', 'Done'],
      ['ClassifyCustomPrompt', 'IntegrateIntoSpec'],
      ['ExpandQuestionWithClarification', 'Done'],
      ['ExpandQuestionWithClarification', 'IntegrateIntoSpec'],
      ['Done', 'IntegrateIntoSpec'],
      ['Done', 'NumberedOptionsHumanRequest'],
    ];

    for (const [from, to] of forbiddenEdges) {
      expect(isAllowedTransition(from, to)).toBe(false);
    }
  });

  it('ALLOWED_EDGES matches transition descriptor count', () => {
    expect(ALLOWED_EDGES.size).toBe(
      new Set(specDocTransitions.map((t) => `${t.from}→${t.to}`)).size,
    );
  });
});

// ---------------------------------------------------------------------------
// SD-FSM-004 – State Data Backbone
// ---------------------------------------------------------------------------

describe('SD-FSM-004 – State Data Backbone', () => {
  it('createInitialStateData returns correct shape', () => {
    const data = createInitialStateData();

    expect(data.queue).toEqual([]);
    expect(data.queueIndex).toBe(0);
    expect(data.normalizedAnswers).toEqual([]);
    expect(data.counters).toEqual({
      integrationPasses: 0,
      consistencyCheckPasses: 0,
    });
    expect(data.artifacts).toEqual({});
  });

  it('state data supports queue mutation', () => {
    const data = createInitialStateData();
    data.queue.push({
      questionId: 'q-1',
      kind: 'issue-resolution',
      prompt: 'test?',
      options: [{ id: 1, label: 'Yes' }],
      answered: false,
    });
    expect(data.queue).toHaveLength(1);
    expect(data.queue[0].questionId).toBe('q-1');
  });

  it('state data supports answer accumulation', () => {
    const data = createInitialStateData();
    data.normalizedAnswers.push({
      questionId: 'q-1',
      selectedOptionIds: [1],
      answeredAt: new Date().toISOString(),
    });
    expect(data.normalizedAnswers).toHaveLength(1);
  });

  it('counters are independently mutable', () => {
    const data = createInitialStateData();
    data.counters.integrationPasses = 2;
    data.counters.consistencyCheckPasses = 1;
    expect(data.counters.integrationPasses).toBe(2);
    expect(data.counters.consistencyCheckPasses).toBe(1);
  });

  it('artifacts store specPath and integration output', () => {
    const data = createInitialStateData();
    data.artifacts.specPath = '/workspace/spec.md';
    data.artifacts.lastIntegrationOutput = {
      specPath: '/workspace/spec.md',
      changeSummary: ['added scope'],
      resolvedQuestionIds: [],
      remainingQuestionIds: ['q-2'],
    };
    expect(data.artifacts.specPath).toBe('/workspace/spec.md');
    expect(data.artifacts.lastIntegrationOutput?.remainingQuestionIds).toEqual(['q-2']);
  });
});

// ---------------------------------------------------------------------------
// Workflow Definition Structure
// ---------------------------------------------------------------------------

describe('Workflow definition structure', () => {
  it('initialState is start', () => {
    const def = createSpecDocWorkflowDefinition();
    expect(def.initialState).toBe('start');
  });

  it('transitions array is populated', () => {
    const def = createSpecDocWorkflowDefinition();
    expect(def.transitions).toBeDefined();
    expect(def.transitions!.length).toBeGreaterThan(0);
  });

  it('every transition descriptor has a name', () => {
    for (const t of specDocTransitions) {
      expect(t.name).toBeDefined();
      expect(t.name!.length).toBeGreaterThan(0);
    }
  });

  it('factory produces a valid workflow definition', () => {
    const def = specDocWorkflowRegistration.factory(
      {} as Parameters<typeof specDocWorkflowRegistration.factory>[0],
    );
    expect(def.initialState).toBe('start');
    expect(Object.keys(def.states)).toContain('start');
  });
});
