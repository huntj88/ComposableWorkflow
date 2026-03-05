/**
 * ITX-WEB-038: Run-feedback pagination/default ordering contract is enforced.
 *
 * Validates that:
 * - Feedback query serialization produces correct query string with defaults.
 * - default limit = 50, max limit = 200.
 * - Default status = 'awaiting_response,responded'.
 * - Cursor pagination is passed through.
 * - Limit is clamped to max.
 */

import { describe, expect, it } from 'vitest';

import {
  createWorkflowApiClient,
  DEFAULT_FEEDBACK_STATUS,
  FEEDBACK_DEFAULT_LIMIT,
  FEEDBACK_MAX_LIMIT,
} from '../../../src/transport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const okJson = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration.feedback.ITX-WEB-038', () => {
  describe('default feedback query', () => {
    it('uses default status and limit when no query provided', async () => {
      let capturedUrl = '';
      const client = createWorkflowApiClient({
        fetchImpl: async (input) => {
          capturedUrl = String(input);
          return okJson({ items: [], nextCursor: undefined });
        },
      });

      await client.listRunFeedbackRequests('wr_038');

      expect(capturedUrl).toContain(`status=${encodeURIComponent(DEFAULT_FEEDBACK_STATUS)}`);
      expect(capturedUrl).toContain(`limit=${FEEDBACK_DEFAULT_LIMIT}`);
    });

    it('default feedback status is awaiting_response,responded', () => {
      expect(DEFAULT_FEEDBACK_STATUS).toBe('awaiting_response,responded');
    });

    it('default limit is 50', () => {
      expect(FEEDBACK_DEFAULT_LIMIT).toBe(50);
    });

    it('max limit is 200', () => {
      expect(FEEDBACK_MAX_LIMIT).toBe(200);
    });
  });

  describe('custom feedback query', () => {
    it('passes cursor through to query string', async () => {
      let capturedUrl = '';
      const client = createWorkflowApiClient({
        fetchImpl: async (input) => {
          capturedUrl = String(input);
          return okJson({ items: [], nextCursor: undefined });
        },
      });

      await client.listRunFeedbackRequests('wr_038', { cursor: 'cur_page2' });

      expect(capturedUrl).toContain('cursor=cur_page2');
    });

    it('custom status overrides default', async () => {
      let capturedUrl = '';
      const client = createWorkflowApiClient({
        fetchImpl: async (input) => {
          capturedUrl = String(input);
          return okJson({ items: [], nextCursor: undefined });
        },
      });

      await client.listRunFeedbackRequests('wr_038', { status: 'cancelled' });

      expect(capturedUrl).toContain('status=cancelled');
      expect(capturedUrl).not.toContain('awaiting_response');
    });

    it('limit is clamped to max (200)', async () => {
      let capturedUrl = '';
      const client = createWorkflowApiClient({
        fetchImpl: async (input) => {
          capturedUrl = String(input);
          return okJson({ items: [], nextCursor: undefined });
        },
      });

      await client.listRunFeedbackRequests('wr_038', { limit: 999 });

      expect(capturedUrl).toContain(`limit=${FEEDBACK_MAX_LIMIT}`);
    });

    it('limit below 1 falls back to default', async () => {
      let capturedUrl = '';
      const client = createWorkflowApiClient({
        fetchImpl: async (input) => {
          capturedUrl = String(input);
          return okJson({ items: [], nextCursor: undefined });
        },
      });

      await client.listRunFeedbackRequests('wr_038', { limit: 0 });

      expect(capturedUrl).toContain(`limit=${FEEDBACK_DEFAULT_LIMIT}`);
    });
  });

  describe('endpoint path', () => {
    it('uses /api/v1/workflows/runs/{runId}/feedback-requests', async () => {
      let capturedUrl = '';
      const client = createWorkflowApiClient({
        fetchImpl: async (input) => {
          capturedUrl = String(input);
          return okJson({ items: [], nextCursor: undefined });
        },
      });

      await client.listRunFeedbackRequests('wr_038');

      expect(capturedUrl).toMatch(/^\/api\/v1\/workflows\/runs\/wr_038\/feedback-requests\?/);
    });
  });
});
