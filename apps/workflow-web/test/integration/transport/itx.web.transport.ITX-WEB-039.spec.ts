import { describe, expect, it } from 'vitest';

import {
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  LOGS_DEFAULT_LIMIT,
  LOGS_MAX_LIMIT,
  createWorkflowApiClient,
} from '../../../src/transport';
import {
  toEventsTransportQuery,
  toLogsTransportQuery,
} from '../../../src/routes/run-detail/state/filterStore';

describe('integration.transport.ITX-WEB-039', () => {
  it('preserves shared event keys and enforces default/max bounds in UI transport queries', () => {
    const defaultQuery = toEventsTransportQuery({
      eventType: '',
      since: '',
      until: '',
      text: '',
      limit: 0,
    });
    expect(defaultQuery.limit).toBe(EVENTS_DEFAULT_LIMIT);
    expect(defaultQuery).not.toHaveProperty('from');
    expect(defaultQuery).not.toHaveProperty('to');

    const boundedQuery = toEventsTransportQuery({
      eventType: 'transition.completed',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      text: 'ignored-local',
      limit: EVENTS_MAX_LIMIT + 25,
    });

    expect(boundedQuery).toEqual({
      eventType: 'transition.completed',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      limit: EVENTS_MAX_LIMIT,
    });
  });

  it('preserves exact log keys with AND-combined filter dimensions and bounded limit', async () => {
    const logQuery = toLogsTransportQuery({
      severity: 'warn',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      correlationId: 'corr_039',
      eventId: 'evt_039',
      limit: LOGS_MAX_LIMIT + 50,
    });

    expect(logQuery).toEqual({
      severity: 'warn',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      correlationId: 'corr_039',
      eventId: 'evt_039',
      limit: LOGS_MAX_LIMIT,
    });

    const defaultLogs = toLogsTransportQuery({
      severity: '',
      since: '',
      until: '',
      correlationId: '',
      eventId: '',
      limit: -100,
    });
    expect(defaultLogs.limit).toBe(LOGS_DEFAULT_LIMIT);

    const requestedUrls: string[] = [];
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url }) as unknown as EventSource,
    });

    await client.getRunLogs('wr_039', logQuery);

    expect(requestedUrls[0]).toContain('/api/v1/workflows/runs/wr_039/logs?');
    expect(requestedUrls[0]).toContain('severity=warn');
    expect(requestedUrls[0]).toContain('since=2026-03-05T00%3A00%3A00.000Z');
    expect(requestedUrls[0]).toContain('until=2026-03-05T01%3A00%3A00.000Z');
    expect(requestedUrls[0]).toContain('correlationId=corr_039');
    expect(requestedUrls[0]).toContain('eventId=evt_039');
    expect(requestedUrls[0]).not.toContain('level=');
    expect(requestedUrls[0]).not.toContain('from=');
    expect(requestedUrls[0]).not.toContain('to=');
  });
});
