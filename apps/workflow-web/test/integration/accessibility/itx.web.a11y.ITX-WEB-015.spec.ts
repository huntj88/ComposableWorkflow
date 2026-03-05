/**
 * ITX-WEB-015: Lifecycle and stream-health token consistency is validated.
 *
 * B-WEB-028: Consistent lifecycle/stream-health tokens across all panels.
 *
 * Validates that:
 * - Every WorkflowLifecycle has a lifecycle token with color, semantic, and label.
 * - All 3 stream health states have tokens with color and label.
 * - Token semantic groupings are consistent across lifecycle families.
 * - resolveLifecycleToken returns fallback for unknown values.
 * - resolveStreamHealthToken returns fallback for unknown values.
 * - Active lifecycles have active/transitioning semantics.
 * - Terminal lifecycles have success/error/neutral semantics.
 */

import { describe, expect, it } from 'vitest';

import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';

import {
  lifecycleTokens,
  resolveLifecycleToken,
  streamHealthTokens,
  resolveStreamHealthToken,
  type LifecycleTokenSemantic,
} from '../../../src/theme/tokens';

const ALL_LIFECYCLES: WorkflowLifecycle[] = [
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
];

describe('integration.accessibility.ITX-WEB-015', () => {
  it('every WorkflowLifecycle has a token with color, semantic, and label', () => {
    for (const lifecycle of ALL_LIFECYCLES) {
      const token = lifecycleTokens[lifecycle];
      expect(token).toBeDefined();
      expect(token.color).toBeDefined();
      expect(typeof token.color).toBe('string');
      expect(token.semantic).toBeDefined();
      expect(typeof token.semantic).toBe('string');
      expect(token.label).toBeDefined();
      expect(token.label.length).toBeGreaterThan(0);
    }
  });

  it('all 3 stream health states have tokens with color and label', () => {
    const healthStates: Array<'connected' | 'reconnecting' | 'stale'> = [
      'connected',
      'reconnecting',
      'stale',
    ];

    for (const state of healthStates) {
      const token = streamHealthTokens[state];
      expect(token).toBeDefined();
      expect(token.color).toBeDefined();
      expect(typeof token.color).toBe('string');
      expect(token.label).toBeDefined();
      expect(token.label.length).toBeGreaterThan(0);
    }
  });

  it('stream health connected is success, reconnecting is warning, stale is error', () => {
    expect(streamHealthTokens.connected.color).toBe('success');
    expect(streamHealthTokens.reconnecting.color).toBe('warning');
    expect(streamHealthTokens.stale.color).toBe('error');
  });

  it('active lifecycle (running) has active semantic', () => {
    expect(lifecycleTokens.running.semantic).toBe('active');
    expect(lifecycleTokens.running.color).toBe('info');
  });

  it('transitioning lifecycles have transitioning semantic', () => {
    const transitioning: WorkflowLifecycle[] = [
      'pausing',
      'paused',
      'resuming',
      'recovering',
      'cancelling',
    ];

    for (const lifecycle of transitioning) {
      expect(lifecycleTokens[lifecycle].semantic).toBe('transitioning');
    }

    // Most transitioning lifecycles use warning; resuming is info (intentional).
    expect(lifecycleTokens.pausing.color).toBe('warning');
    expect(lifecycleTokens.paused.color).toBe('warning');
    expect(lifecycleTokens.resuming.color).toBe('info');
    expect(lifecycleTokens.recovering.color).toBe('warning');
    expect(lifecycleTokens.cancelling.color).toBe('warning');
  });

  it('terminal success lifecycle has success semantic', () => {
    expect(lifecycleTokens.completed.semantic).toBe('success');
    expect(lifecycleTokens.completed.color).toBe('success');
  });

  it('terminal failure lifecycle has error semantic', () => {
    expect(lifecycleTokens.failed.semantic).toBe('error');
    expect(lifecycleTokens.failed.color).toBe('error');
  });

  it('terminal cancelled lifecycle has neutral semantic', () => {
    expect(lifecycleTokens.cancelled.semantic).toBe('neutral');
    expect(lifecycleTokens.cancelled.color).toBe('default');
  });

  it('resolveLifecycleToken returns correct token for known lifecycles', () => {
    for (const lifecycle of ALL_LIFECYCLES) {
      const resolved = resolveLifecycleToken(lifecycle);
      const direct = lifecycleTokens[lifecycle];
      expect(resolved.color).toBe(direct.color);
      expect(resolved.semantic).toBe(direct.semantic);
      expect(resolved.label).toBe(direct.label);
    }
  });

  it('resolveLifecycleToken returns neutral fallback for unknown values', () => {
    const token = resolveLifecycleToken('totally_unknown');
    expect(token.color).toBe('default');
    expect(token.semantic).toBe('neutral');
    expect(token.label).toBe('totally_unknown');
  });

  it('resolveStreamHealthToken returns fallback for unknown values', () => {
    const token = resolveStreamHealthToken('unknown_health');
    expect(token.color).toBe('warning');
    expect(token.label).toBe('unknown_health');
  });

  it('lifecycle token labels are human-readable capitalized strings', () => {
    for (const lifecycle of ALL_LIFECYCLES) {
      const token = lifecycleTokens[lifecycle];
      // First character should be uppercase
      expect(token.label[0]).toBe(token.label[0]!.toUpperCase());
      // No underscores
      expect(token.label).not.toContain('_');
    }
  });

  it('token semantic values are from defined semantic set', () => {
    const validSemantics: LifecycleTokenSemantic[] = [
      'active',
      'transitioning',
      'success',
      'error',
      'neutral',
    ];

    for (const lifecycle of ALL_LIFECYCLES) {
      expect(validSemantics).toContain(lifecycleTokens[lifecycle].semantic);
    }
  });
});
