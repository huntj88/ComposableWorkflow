/**
 * Transport event-text-filter-semantics: Event free-text matching domain behavior.
 *
 * Validates that:
 * - matchesEventFreeText searches across eventType, state, transition.name, payload strings, error.message.
 * - Empty/whitespace query matches everything.
 * - Matching is case-insensitive.
 * - No match returns false.
 */

import { describe, expect, it } from 'vitest';

import { matchesEventFreeText } from '../../../src/routes/run-detail/state/filterStore';
import { buildEventDto } from '../fixtures/workflowFixtures';

describe('integration.transport.event-text-filter-semantics', () => {
  describe('empty query matches all', () => {
    it('empty string matches', () => {
      expect(matchesEventFreeText(buildEventDto(1), '')).toBe(true);
    });

    it('whitespace-only matches', () => {
      expect(matchesEventFreeText(buildEventDto(1), '   ')).toBe(true);
    });
  });

  describe('eventType matching', () => {
    it('matches by eventType', () => {
      const event = buildEventDto(1, { eventType: 'transition.completed' });
      expect(matchesEventFreeText(event, 'transition')).toBe(true);
    });

    it('case-insensitive eventType match', () => {
      const event = buildEventDto(1, { eventType: 'workflow.started' });
      expect(matchesEventFreeText(event, 'WORKFLOW')).toBe(true);
    });
  });

  describe('state matching', () => {
    it('matches by state field', () => {
      const event = buildEventDto(1, { eventType: 'state.entered', state: 'processing' });
      expect(matchesEventFreeText(event, 'processing')).toBe(true);
    });

    it('null state does not crash', () => {
      const event = buildEventDto(1, { state: null });
      expect(matchesEventFreeText(event, 'nonexistent')).toBe(false);
    });
  });

  describe('transition.name matching', () => {
    it('matches by transition name', () => {
      const event = buildEventDto(1, {
        transition: { from: 'a', to: 'b', name: 'approve-request' },
      });
      expect(matchesEventFreeText(event, 'approve')).toBe(true);
    });

    it('null transition does not crash', () => {
      const event = buildEventDto(1, { transition: null });
      expect(matchesEventFreeText(event, 'something')).toBe(false);
    });
  });

  describe('payload string matching', () => {
    it('matches string payload values', () => {
      const event = buildEventDto(1, {
        payload: { message: 'deployment started', level: 'info' },
      });
      expect(matchesEventFreeText(event, 'deployment')).toBe(true);
    });

    it('matches nested payload values', () => {
      const event = buildEventDto(1, {
        payload: { data: { details: 'critical alert' } },
      });
      expect(matchesEventFreeText(event, 'critical')).toBe(true);
    });

    it('matches array payload values', () => {
      const event = buildEventDto(1, {
        payload: { tags: ['production', 'urgent'] },
      });
      expect(matchesEventFreeText(event, 'urgent')).toBe(true);
    });
  });

  describe('error.message matching', () => {
    it('matches error message', () => {
      const event = buildEventDto(1, {
        error: { message: 'Timeout exceeded', code: 'TIMEOUT' },
      });
      expect(matchesEventFreeText(event, 'timeout')).toBe(true);
    });

    it('null error does not crash', () => {
      const event = buildEventDto(1, { error: null });
      expect(matchesEventFreeText(event, 'error')).toBe(false);
    });
  });

  describe('no match', () => {
    it('returns false when no fields contain the query', () => {
      const event = buildEventDto(1, {
        eventType: 'transition.completed',
        state: null,
        transition: { from: 'a', to: 'b', name: 'next' },
        payload: null,
        error: null,
      });
      expect(matchesEventFreeText(event, 'zzz-nonexistent-zzz')).toBe(false);
    });
  });
});
