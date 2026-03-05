/**
 * ITX-WEB-034: Theme defaults and error-token differentiation are enforced.
 *
 * B-WEB-028: Consistent lifecycle/stream-health tokens.
 * B-WEB-047: Distinct error token semantics.
 *
 * Validates that:
 * - lifecycleTokens maps all 9 lifecycle values with correct semantics.
 * - streamHealthTokens maps all 3 states.
 * - errorCategoryTokens distinguishes validation/conflict/transport/unknown.
 * - classifyErrorStatus maps HTTP codes to correct categories.
 * - feedbackStatusTokens covers awaiting_response, responded, cancelled.
 * - resolveLifecycleToken falls back for unknown lifecycle.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  lifecycleTokens,
  streamHealthTokens,
  errorCategoryTokens,
  feedbackStatusTokens,
  classifyErrorStatus,
  resolveLifecycleToken,
  resolveStreamHealthToken,
  resolveErrorToken,
  resolveFeedbackStatusToken,
} from '../../../src/theme/tokens';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.graph.ITX-WEB-034', () => {
  describe('lifecycle tokens', () => {
    const EXPECTED_LIFECYCLES = [
      'running',
      'pausing',
      'paused',
      'resuming',
      'recovering',
      'cancelling',
      'completed',
      'failed',
      'cancelled',
    ] as const;

    it('maps all 9 lifecycle values', () => {
      expect(Object.keys(lifecycleTokens)).toHaveLength(9);
      for (const lc of EXPECTED_LIFECYCLES) {
        expect(lifecycleTokens[lc]).toBeDefined();
      }
    });

    it('terminal lifecycles have distinct semantics', () => {
      expect(lifecycleTokens.completed.semantic).toBe('success');
      expect(lifecycleTokens.failed.semantic).toBe('error');
      expect(lifecycleTokens.cancelled.semantic).toBe('neutral');
    });

    it('running is active semantic with info color', () => {
      expect(lifecycleTokens.running).toEqual({
        color: 'info',
        semantic: 'active',
        label: 'Running',
      });
    });

    it('resuming is transitioning with info color', () => {
      expect(lifecycleTokens.resuming).toEqual({
        color: 'info',
        semantic: 'transitioning',
        label: 'Resuming',
      });
    });

    it('resolveLifecycleToken falls back for unknown value', () => {
      const token = resolveLifecycleToken('unknown-lifecycle');
      expect(token.color).toBe('default');
      expect(token.semantic).toBe('neutral');
      expect(token.label).toBe('unknown-lifecycle');
    });
  });

  describe('stream health tokens', () => {
    it('maps all 3 health states', () => {
      expect(Object.keys(streamHealthTokens)).toHaveLength(3);
      expect(streamHealthTokens.connected.color).toBe('success');
      expect(streamHealthTokens.reconnecting.color).toBe('warning');
      expect(streamHealthTokens.stale.color).toBe('error');
    });

    it('resolveStreamHealthToken falls back for unknown', () => {
      const token = resolveStreamHealthToken('unknown');
      expect(token.color).toBe('warning');
    });
  });

  describe('error category tokens', () => {
    it('maps 4 distinct categories', () => {
      expect(Object.keys(errorCategoryTokens)).toHaveLength(4);
    });

    it('validation is non-recoverable error', () => {
      expect(errorCategoryTokens.validation).toEqual({
        severity: 'error',
        label: 'Validation Error',
        recoverable: false,
      });
    });

    it('conflict is non-recoverable warning', () => {
      expect(errorCategoryTokens.conflict).toEqual({
        severity: 'warning',
        label: 'Conflict',
        recoverable: false,
      });
    });

    it('transport is recoverable error', () => {
      expect(errorCategoryTokens.transport).toEqual({
        severity: 'error',
        label: 'Connection Error',
        recoverable: true,
      });
    });

    it('unknown is recoverable error', () => {
      expect(errorCategoryTokens.unknown).toEqual({
        severity: 'error',
        label: 'Unexpected Error',
        recoverable: true,
      });
    });
  });

  describe('classifyErrorStatus', () => {
    it('400 → validation', () => expect(classifyErrorStatus(400)).toBe('validation'));
    it('409 → conflict', () => expect(classifyErrorStatus(409)).toBe('conflict'));
    it('0 → transport', () => expect(classifyErrorStatus(0)).toBe('transport'));
    it('500 → transport', () => expect(classifyErrorStatus(500)).toBe('transport'));
    it('502 → transport', () => expect(classifyErrorStatus(502)).toBe('transport'));
    it('401 → unknown', () => expect(classifyErrorStatus(401)).toBe('unknown'));
    it('403 → unknown', () => expect(classifyErrorStatus(403)).toBe('unknown'));
    it('404 → unknown', () => expect(classifyErrorStatus(404)).toBe('unknown'));

    it('resolveErrorToken returns matching token for status', () => {
      const token = resolveErrorToken(400);
      expect(token).toEqual(errorCategoryTokens.validation);
    });
  });

  describe('feedback status tokens', () => {
    it('covers awaiting_response, responded, cancelled', () => {
      expect(feedbackStatusTokens.awaiting_response.color).toBe('warning');
      expect(feedbackStatusTokens.responded.color).toBe('success');
      expect(feedbackStatusTokens.cancelled.color).toBe('default');
    });

    it('resolveFeedbackStatusToken falls back for unknown', () => {
      const token = resolveFeedbackStatusToken('unknown');
      expect(token.color).toBe('default');
      expect(token.label).toBe('unknown');
    });
  });
});
