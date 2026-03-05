import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEEDBACK_STATUS,
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  FEEDBACK_DEFAULT_LIMIT,
  FEEDBACK_MAX_LIMIT,
  LOGS_DEFAULT_LIMIT,
  LOGS_MAX_LIMIT,
  createWorkflowApiClient,
} from '../../../src/transport';

const okJson = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('integration.transport.ITX-WEB-010', () => {
  it('uses absolute /api/v1 paths and exact query serialization for covered transport calls', async () => {
    const seenUrls: string[] = [];

    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        seenUrls.push(url);

        if (url.startsWith('/api/v1/workflows/runs/wr_1/events')) {
          return okJson({ items: [], nextCursor: undefined });
        }

        if (url.startsWith('/api/v1/workflows/runs/wr_1/logs')) {
          return okJson({
            items: [
              {
                eventId: 'evt_1',
                runId: 'wr_1',
                sequence: 1,
                eventType: 'log',
                timestamp: '2026-03-05T00:00:00.000Z',
                level: 'info',
                message: 'hello',
                payload: null,
              },
            ],
          });
        }

        if (url.startsWith('/api/v1/workflows/runs/wr_1/feedback-requests')) {
          return okJson({ items: [], nextCursor: undefined });
        }

        if (url.startsWith('/api/v1/workflows/runs')) {
          return okJson({ items: [] });
        }

        throw new Error(`Unhandled URL in test mock: ${url}`);
      },
      eventSourceFactory: (url) => ({ url }) as unknown as EventSource,
    });

    await client.listRuns();
    await client.getRunEvents('wr_1');
    await client.getRunEvents('wr_1', {
      limit: EVENTS_MAX_LIMIT + 100,
      eventType: 'workflow.started',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
    });
    await client.getRunLogs('wr_1');
    await client.getRunLogs('wr_1', {
      limit: LOGS_MAX_LIMIT + 100,
      severity: 'error',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      correlationId: 'corr_1',
      eventId: 'evt_1',
    });
    await client.listRunFeedbackRequests('wr_1');
    await client.listRunFeedbackRequests('wr_1', {
      status: 'awaiting_response,cancelled',
      limit: FEEDBACK_MAX_LIMIT + 100,
      cursor: 'cur_1',
    });

    expect(seenUrls.every((url) => url.startsWith('/api/v1/'))).toBe(true);

    expect(seenUrls).toContain('/api/v1/workflows/runs');

    expect(seenUrls).toContain(`/api/v1/workflows/runs/wr_1/events?limit=${EVENTS_DEFAULT_LIMIT}`);
    expect(seenUrls).toContain(
      `/api/v1/workflows/runs/wr_1/events?limit=${EVENTS_MAX_LIMIT}&eventType=workflow.started&since=2026-03-05T00%3A00%3A00.000Z&until=2026-03-05T01%3A00%3A00.000Z`,
    );

    expect(seenUrls).toContain(`/api/v1/workflows/runs/wr_1/logs?limit=${LOGS_DEFAULT_LIMIT}`);
    expect(seenUrls).toContain(
      `/api/v1/workflows/runs/wr_1/logs?limit=${LOGS_MAX_LIMIT}&severity=error&since=2026-03-05T00%3A00%3A00.000Z&until=2026-03-05T01%3A00%3A00.000Z&correlationId=corr_1&eventId=evt_1`,
    );

    expect(seenUrls).toContain(
      `/api/v1/workflows/runs/wr_1/feedback-requests?status=${encodeURIComponent(DEFAULT_FEEDBACK_STATUS)}&limit=${FEEDBACK_DEFAULT_LIMIT}`,
    );
    expect(seenUrls).toContain(
      `/api/v1/workflows/runs/wr_1/feedback-requests?status=awaiting_response%2Ccancelled&limit=${FEEDBACK_MAX_LIMIT}&cursor=cur_1`,
    );
  });

  it('serializes logs bounds with contract keys without local alias remapping', () => {
    const client = createWorkflowApiClient({
      fetchImpl: async () => okJson({ items: [] }),
      eventSourceFactory: (url) => ({ url }) as unknown as EventSource,
    });

    const query = client.internals.serializeLogsQuery({
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      severity: 'warn',
      correlationId: 'corr_2',
      eventId: 'evt_2',
    });

    expect(query).toContain('severity=warn');
    expect(query).toContain('since=2026-03-05T00%3A00%3A00.000Z');
    expect(query).toContain('until=2026-03-05T01%3A00%3A00.000Z');
    expect(query).toContain('correlationId=corr_2');
    expect(query).toContain('eventId=evt_2');

    expect(query).not.toContain('level=');
    expect(query).not.toContain('from=');
    expect(query).not.toContain('to=');
  });
});
