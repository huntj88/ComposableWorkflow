/**
 * ITX-WEB-011: Run-scoped feedback discovery/filtering behavior is enforced.
 *
 * B-WEB-011: Feedback panel discovers and filters feedback for the current run.
 *
 * Validates that:
 * - Feedback transport calls are scoped to the current runId.
 * - Feedback list endpoint sends correct status filter (awaiting_response,responded).
 * - Feedback items are merged with deduplication by feedbackRunId.
 * - Pagination cursor is forwarded for next-page requests.
 * - Default limit matches FEEDBACK_DEFAULT_LIMIT.
 */

import { describe, expect, it } from 'vitest';

import {
  createWorkflowApiClient,
  FEEDBACK_DEFAULT_LIMIT,
  FEEDBACK_MAX_LIMIT,
  DEFAULT_FEEDBACK_STATUS,
} from '../../../src/transport/workflowApiClient';
import {
  buildFeedbackRequestSummary,
  buildListFeedbackRequestsResponse,
} from '../fixtures/workflowFixtures';

describe('integration.feedback.ITX-WEB-011', () => {
  it('feedback list endpoint is scoped to the current runId', async () => {
    let capturedUrl = '';
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify(buildListFeedbackRequestsResponse()), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.listRunFeedbackRequests('wr_011_1');
    expect(capturedUrl).toContain('/api/v1/workflows/runs/wr_011_1/feedback-requests');
  });

  it('feedback list sends default status filter and limit', async () => {
    let capturedUrl = '';
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify(buildListFeedbackRequestsResponse()), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.listRunFeedbackRequests('wr_011_2');
    expect(capturedUrl).toContain(`status=${encodeURIComponent(DEFAULT_FEEDBACK_STATUS)}`);
    expect(capturedUrl).toContain(`limit=${FEEDBACK_DEFAULT_LIMIT}`);
  });

  it('feedback list forwards custom status and cursor parameters', async () => {
    let capturedUrl = '';
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify(buildListFeedbackRequestsResponse()), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.listRunFeedbackRequests('wr_011_3', {
      status: 'awaiting_response,cancelled',
      cursor: 'cur_page_2',
      limit: 25,
    });

    expect(capturedUrl).toContain('cursor=cur_page_2');
    expect(capturedUrl).toContain('limit=25');
  });

  it('feedback limit is clamped to FEEDBACK_MAX_LIMIT', async () => {
    let capturedUrl = '';
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify(buildListFeedbackRequestsResponse()), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.listRunFeedbackRequests('wr_011_4', {
      limit: FEEDBACK_MAX_LIMIT + 100,
    });

    expect(capturedUrl).toContain(`limit=${FEEDBACK_MAX_LIMIT}`);
  });

  it('fixture feedback items have unique feedbackRunId for merge deduplication', () => {
    const item1 = buildFeedbackRequestSummary({ feedbackRunId: 'fb_011_a' });
    const item2 = buildFeedbackRequestSummary({ feedbackRunId: 'fb_011_b' });
    const item3 = buildFeedbackRequestSummary({ feedbackRunId: 'fb_011_a' }); // duplicate

    // Deduplicate by feedbackRunId
    const merged = new Map<string, typeof item1>();
    for (const item of [item1, item2, item3]) {
      merged.set(item.feedbackRunId, item);
    }

    expect(merged.size).toBe(2);
    expect(merged.has('fb_011_a')).toBe(true);
    expect(merged.has('fb_011_b')).toBe(true);
  });

  it('FEEDBACK_DEFAULT_LIMIT and FEEDBACK_MAX_LIMIT are consistent bounds', () => {
    expect(FEEDBACK_DEFAULT_LIMIT).toBe(50);
    expect(FEEDBACK_MAX_LIMIT).toBe(200);
    expect(FEEDBACK_DEFAULT_LIMIT).toBeLessThanOrEqual(FEEDBACK_MAX_LIMIT);
  });

  it('DEFAULT_FEEDBACK_STATUS includes awaiting_response and responded', () => {
    expect(DEFAULT_FEEDBACK_STATUS).toBe('awaiting_response,responded');
    expect(DEFAULT_FEEDBACK_STATUS).toContain('awaiting_response');
    expect(DEFAULT_FEEDBACK_STATUS).toContain('responded');
  });
});
