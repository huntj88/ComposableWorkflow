/**
 * Transport defaults-and-ordering: Event/log defaults-max ordering semantics.
 *
 * Validates that:
 * - Events default limit = 100, max = 500.
 * - Logs default limit = 100, max = 500.
 * - Limits below 1 fall back to default.
 * - Limits above max are clamped.
 * - NaN/undefined limits use default.
 * - Query serialization via client.internals.
 */

import { describe, expect, it } from 'vitest';

import {
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  LOGS_DEFAULT_LIMIT,
  LOGS_MAX_LIMIT,
  createWorkflowApiClient,
} from '../../../src/transport';

describe('integration.transport.defaults-and-ordering', () => {
  const client = createWorkflowApiClient({
    fetchImpl: async () => {
      throw new Error('should not fetch');
    },
  });

  describe('events query defaults and bounds', () => {
    it('default events limit = 100', () => {
      const qs = client.internals.serializeEventsQuery({});
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(EVENTS_DEFAULT_LIMIT));
    });

    it('events max limit = 500', () => {
      expect(EVENTS_MAX_LIMIT).toBe(500);
    });

    it('events limit above max is clamped', () => {
      const qs = client.internals.serializeEventsQuery({ limit: 9999 });
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(EVENTS_MAX_LIMIT));
    });

    it('events limit below 1 falls back to default', () => {
      const qs = client.internals.serializeEventsQuery({ limit: 0 });
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(EVENTS_DEFAULT_LIMIT));
    });

    it('events NaN limit uses default', () => {
      const qs = client.internals.serializeEventsQuery({ limit: NaN });
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(EVENTS_DEFAULT_LIMIT));
    });

    it('events undefined limit uses default', () => {
      const qs = client.internals.serializeEventsQuery({ limit: undefined });
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(EVENTS_DEFAULT_LIMIT));
    });

    it('events query includes optional filters when provided', () => {
      const qs = client.internals.serializeEventsQuery({
        cursor: 'cur_5',
        eventType: 'log',
        since: '2026-01-01T00:00:00Z',
        until: '2026-01-02T00:00:00Z',
        limit: 50,
      });
      const params = new URLSearchParams(qs);
      expect(params.get('cursor')).toBe('cur_5');
      expect(params.get('eventType')).toBe('log');
      expect(params.get('since')).toBe('2026-01-01T00:00:00Z');
      expect(params.get('until')).toBe('2026-01-02T00:00:00Z');
      expect(params.get('limit')).toBe('50');
    });

    it('events query omits empty optional filters', () => {
      const qs = client.internals.serializeEventsQuery({ limit: 100 });
      const params = new URLSearchParams(qs);
      expect(params.has('cursor')).toBe(false);
      expect(params.has('eventType')).toBe(false);
      expect(params.has('since')).toBe(false);
      expect(params.has('until')).toBe(false);
    });
  });

  describe('logs query defaults and bounds', () => {
    it('default logs limit = 100', () => {
      const qs = client.internals.serializeLogsQuery({});
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(LOGS_DEFAULT_LIMIT));
    });

    it('logs max limit = 500', () => {
      expect(LOGS_MAX_LIMIT).toBe(500);
    });

    it('logs limit above max is clamped', () => {
      const qs = client.internals.serializeLogsQuery({ limit: 9999 });
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(LOGS_MAX_LIMIT));
    });

    it('logs limit below 1 falls back to default', () => {
      const qs = client.internals.serializeLogsQuery({ limit: -10 });
      const params = new URLSearchParams(qs);
      expect(params.get('limit')).toBe(String(LOGS_DEFAULT_LIMIT));
    });

    it('logs query includes severity and correlationId when provided', () => {
      const qs = client.internals.serializeLogsQuery({
        severity: 'error',
        correlationId: 'corr_1',
        eventId: 'evt_1',
        since: '2026-01-01T00:00:00Z',
        until: '2026-01-02T00:00:00Z',
        limit: 200,
      });
      const params = new URLSearchParams(qs);
      expect(params.get('severity')).toBe('error');
      expect(params.get('correlationId')).toBe('corr_1');
      expect(params.get('eventId')).toBe('evt_1');
      expect(params.get('limit')).toBe('200');
    });
  });

  describe('feedback query defaults and bounds', () => {
    it('default feedback query uses default status and limit', () => {
      const qs = client.internals.serializeFeedbackQuery();
      const params = new URLSearchParams(qs);
      expect(params.get('status')).toBe('awaiting_response,responded');
      expect(params.get('limit')).toBe('50');
    });

    it('custom status overrides default', () => {
      const qs = client.internals.serializeFeedbackQuery({ status: 'cancelled' });
      const params = new URLSearchParams(qs);
      expect(params.get('status')).toBe('cancelled');
    });
  });
});
