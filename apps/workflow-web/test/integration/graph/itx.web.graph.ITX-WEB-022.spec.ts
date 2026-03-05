/**
 * ITX-WEB-022: FSM invariant violation surfacing is enforced.
 *
 * Validates that:
 * - Duplicate state IDs produce duplicate-state violations.
 * - Unresolved transition references produce unresolved-transition-ref violations.
 * - Combined violations are all captured.
 * - Empty definitions produce no violations.
 * - Self-loops and disconnected graphs are valid (no violations).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { projectDefinitionToGraph } from '../../../src/routes/run-detail/graph/projectDefinitionToGraph';
import {
  DUPLICATE_STATE_DEFINITION,
  DUPLICATE_STATE_EXPECTED_VIOLATIONS,
  UNRESOLVED_REF_DEFINITION,
  UNRESOLVED_REF_EXPECTED_VIOLATIONS,
  COMBINED_VIOLATIONS_DEFINITION,
  EMPTY_DEFINITION,
  SELF_LOOP_DEFINITION,
  DISCONNECTED_GRAPH_DEFINITION,
} from '../fixtures/graphInvariantFixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-022', () => {
  describe('duplicate-state violations', () => {
    it('detects duplicate state IDs', () => {
      const result = projectDefinitionToGraph(DUPLICATE_STATE_DEFINITION);
      expect(result.invariantViolations).toEqual(DUPLICATE_STATE_EXPECTED_VIOLATIONS);
    });

    it('does not produce duplicate nodes for duplicated states', () => {
      const result = projectDefinitionToGraph(DUPLICATE_STATE_DEFINITION);
      const stateIds = result.nodes.map((n) => n.data.stateId);
      expect(new Set(stateIds).size).toBe(stateIds.length);
    });
  });

  describe('unresolved-transition-ref violations', () => {
    it('detects unknown source and target state references', () => {
      const result = projectDefinitionToGraph(UNRESOLVED_REF_DEFINITION);
      expect(result.invariantViolations).toEqual(UNRESOLVED_REF_EXPECTED_VIOLATIONS);
    });

    it('edges are still created for unresolved transitions', () => {
      const result = projectDefinitionToGraph(UNRESOLVED_REF_DEFINITION);
      expect(result.edges).toHaveLength(UNRESOLVED_REF_DEFINITION.transitions.length);
    });
  });

  describe('combined violations', () => {
    it('captures both duplicate-state and unresolved-transition-ref', () => {
      const result = projectDefinitionToGraph(COMBINED_VIOLATIONS_DEFINITION);
      const kinds = result.invariantViolations.map((v) => v.kind);
      expect(kinds).toContain('duplicate-state');
      expect(kinds).toContain('unresolved-transition-ref');
    });
  });

  describe('valid edge cases', () => {
    it('empty definition produces no violations', () => {
      const result = projectDefinitionToGraph(EMPTY_DEFINITION);
      expect(result.invariantViolations).toHaveLength(0);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('self-loop definition is valid (no violations)', () => {
      const result = projectDefinitionToGraph(SELF_LOOP_DEFINITION);
      expect(result.invariantViolations).toHaveLength(0);
    });

    it('disconnected graph is valid (no violations)', () => {
      const result = projectDefinitionToGraph(DISCONNECTED_GRAPH_DEFINITION);
      expect(result.invariantViolations).toHaveLength(0);
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(0);
    });
  });
});
